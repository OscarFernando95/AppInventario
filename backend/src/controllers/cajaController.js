'use strict';

const { Op, fn, col } = require('sequelize');
const { sequelize, Caja, CajaMovimiento, Venta, Usuario, Empresa, AbonoVenta, PropinaReparto, UsuarioEmpresa, Cuenta, Comanda } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { buildListWhere } = require('../utils/listFilters');
const { auditar } = require('../utils/audit');
const { tiene } = require('../middlewares/auth');

const { calcularResumen, registrarEgreso, calcularBalance, redondear2 } = require('../services/cajaService');

const INCLUDE_USUARIOS = [
  { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
  { model: Usuario, as: 'usuarioCierre', attributes: ['id', 'nombre'] },
];

/** Caja con su resumen: el guardado si está cerrada, el calculado si sigue abierta. */
async function conResumen(caja) {
  const json = caja.toJSON();
  if (caja.estado === 'CERRADA') {
    json.resumen = {
      num_ventas: caja.num_ventas,
      total_ventas: Number(caja.total_ventas),
      ventas_efectivo: Number(caja.ventas_efectivo),
      propinas_efectivo: Number(caja.propinas_efectivo || 0),
      abonos_efectivo: Number(caja.abonos_efectivo || 0),
      total_egresos: Number(caja.total_egresos || 0),
      efectivo_esperado: Number(caja.efectivo_esperado),
      medios: caja.resumen_medios || [],
    };
  } else {
    json.resumen = await calcularResumen(caja);
  }
  delete json.resumen_medios;
  // Egresos del turno (retiros y pagos en efectivo), para mostrar y para el PDF.
  json.movimientos = await CajaMovimiento.findAll({
    where: { cajaId: caja.id },
    attributes: ['id', 'tipo', 'concepto', 'monto', 'fecha'],
    order: [['fecha', 'ASC']],
    raw: true,
  });
  return json;
}

// Sin el permiso caja.todas, cada quien solo ve y gestiona su propia caja.
const puedeVer = (req, caja) => tiene(req, 'caja.todas') || caja.usuarioId === req.userId;

/** Caja abierta del usuario en la empresa activa (o null). */
exports.getCajaActual = async (req, res) => {
  const caja = await Caja.findOne({
    where: { empresaId: req.empresaId, usuarioId: req.userId, estado: 'ABIERTA' },
    include: INCLUDE_USUARIOS,
  });
  res.json(caja ? await conResumen(caja) : null);
};

exports.getCajas = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query);
  const where = {
    empresaId: req.empresaId,
    ...(tiene(req, 'caja.todas') ? {} : { usuarioId: req.userId }),
    ...buildListWhere(req.query, { fecha: 'fecha_apertura', igualdad: ['estado'] }),
  };
  const { count, rows } = await Caja.findAndCountAll({
    where,
    include: INCLUDE_USUARIOS,
    order: [['fecha_apertura', 'DESC']],
    limit,
    offset,
  });
  setTotalCount(res, count);
  res.json(rows.map((c) => {
    const j = c.toJSON();
    delete j.resumen_medios;
    return j;
  }));
};

/** Detalle de una caja (para el PDF): resumen + ventas del turno + empresa. */
exports.getCajaById = async (req, res) => {
  const caja = await Caja.findOne({
    where: { id: req.params.id, empresaId: req.empresaId },
    include: [...INCLUDE_USUARIOS, { model: Empresa, attributes: ['nombre', 'nit', 'dv', 'contacto'] }],
  });
  if (!caja || !puedeVer(req, caja)) return res.status(404).json({ error: 'Caja no encontrada' });

  const json = await conResumen(caja);
  json.abonos = await AbonoVenta.findAll({
    where: { cajaId: caja.id, estado: 'ACTIVO' },
    attributes: ['id', 'ventaId', 'monto', 'medio_pago', 'fecha'],
    order: [['fecha', 'ASC']],
    raw: true,
  });
  json.ventas = await Venta.findAll({
    where: { cajaId: caja.id },
    attributes: ['id', 'fecha', 'total', 'propina', 'forma_pago', 'medio_pago', 'estado'],
    order: [['fecha', 'ASC']],
    raw: true,
  });
  res.json(json);
};

exports.abrirCaja = async (req, res) => {
  const { monto_inicial, observaciones } = req.body;
  let caja;
  try {
    caja = await Caja.create({
      empresaId: req.empresaId,
      usuarioId: req.userId,
      monto_inicial,
      observaciones_apertura: observaciones || null,
      fecha_apertura: new Date(),
    });
  } catch (err) {
    // Índice único parcial: un usuario solo puede tener una caja abierta.
    if (err && err.name === 'SequelizeUniqueConstraintError') {
      throw new ValidationError('Ya tienes una caja abierta. Ciérrala antes de abrir otra.');
    }
    throw err;
  }
  auditar(req, 'caja_abierta', { cajaId: caja.id, monto_inicial: Number(caja.monto_inicial) });
  const completa = await Caja.findByPk(caja.id, { include: INCLUDE_USUARIOS });
  res.status(201).json(await conResumen(completa));
};

exports.cerrarCaja = async (req, res) => {
  const { monto_contado, observaciones } = req.body;

  const cerrada = await sequelize.transaction(async (t) => {
    // El lock espera a que terminen las ventas en curso de este turno (createVenta
    // toma el mismo lock) y hace que una venta posterior no encuentre la caja abierta.
    const caja = await Caja.findOne({
      where: { id: req.params.id, empresaId: req.empresaId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!caja || !puedeVer(req, caja)) return null;
    if (caja.estado !== 'ABIERTA') throw new ValidationError('Esta caja ya está cerrada.');

    const resumen = await calcularResumen(caja, t);
    await caja.update({
      estado: 'CERRADA',
      fecha_cierre: new Date(),
      usuarioCierreId: req.userId,
      num_ventas: resumen.num_ventas,
      total_ventas: resumen.total_ventas,
      ventas_efectivo: resumen.ventas_efectivo,
      propinas_efectivo: resumen.propinas_efectivo,
      abonos_efectivo: resumen.abonos_efectivo,
      total_egresos: resumen.total_egresos,
      efectivo_esperado: resumen.efectivo_esperado,
      monto_contado,
      diferencia: redondear2(monto_contado - resumen.efectivo_esperado),
      resumen_medios: resumen.medios,
      observaciones_cierre: observaciones || null,
    }, { transaction: t });
    return caja;
  });
  if (!cerrada) return res.status(404).json({ error: 'Caja no encontrada' });

  auditar(req, 'caja_cerrada', {
    cajaId: cerrada.id,
    total_ventas: Number(cerrada.total_ventas),
    diferencia: Number(cerrada.diferencia),
    total_egresos: Number(cerrada.total_egresos),
  });
  const completa = await Caja.findByPk(cerrada.id, { include: INCLUDE_USUARIOS });
  res.json(await conResumen(completa));
};

/**
 * Retiro de efectivo de la caja del usuario (sacar dinero). Los pagos de gastos/compras tienen su propio flujo.
 * `tipo` PROPINA = entrega de las propinas al personal: sale de la caja pero no es un retiro de la empresa
 * (la propina nunca fue ingreso, así que no resta del dinero de la empresa).
 */
exports.registrarRetiro = async (req, res) => {
  const { concepto, monto, tipo, reparto } = req.body;
  if (reparto && tipo !== 'PROPINA') throw new ValidationError('Solo la entrega de propinas se reparte entre el personal.');
  if (reparto) {
    const suma = redondear2(reparto.reduce((a, r) => a + r.monto, 0));
    if (Math.abs(suma - monto) > 0.01) throw new ValidationError(`El reparto suma ${suma.toLocaleString('es-CO')} y se entregan ${monto.toLocaleString('es-CO')}: deben coincidir.`);
    if (new Set(reparto.map((r) => r.usuarioId)).size !== reparto.length) throw new ValidationError('Hay personas repetidas en el reparto.');
  }
  const mov = await sequelize.transaction(async (t) => {
    if (reparto) {
      const validos = await UsuarioEmpresa.count({ where: { empresaId: req.empresaId, usuarioId: reparto.map((r) => r.usuarioId) }, transaction: t });
      if (validos !== reparto.length) throw new ValidationError('Una de las personas del reparto no pertenece a esta empresa.');
    }
    const m = await registrarEgreso(req, t, { tipo, concepto, monto });
    if (reparto) {
      await PropinaReparto.bulkCreate(reparto.map((r) => ({ empresaId: req.empresaId, movimientoId: m.id, usuarioId: r.usuarioId, monto: r.monto, fecha: m.fecha })), { transaction: t });
    }
    return m;
  });
  auditar(req, tipo === 'PROPINA' ? 'caja_propinas' : 'caja_retiro', {
    cajaId: mov.cajaId, monto: Number(mov.monto), concepto, ...(reparto ? { repartidas: reparto.length } : {}),
  });
  res.status(201).json(mov);
};

/**
 * Personas de la empresa a quienes se puede repartir una entrega de propinas, con su peso en el reparto y si
 * hoy trabajaron (abrieron una cuenta o una caja, enviaron una comanda o vendieron).
 */
exports.getPersonal = async (req, res) => {
  const enlaces = await UsuarioEmpresa.findAll({ where: { empresaId: req.empresaId }, attributes: ['usuarioId', 'propina_peso'], raw: true });
  const personas = await Usuario.findAll({
    where: { id: enlaces.map((e) => e.usuarioId), estado: true }, attributes: ['id', 'nombre'], order: [['nombre', 'ASC']], raw: true,
  });
  const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
  const hoy = { [Op.gte]: inicio };
  const [cuentas, comandas, ventas, cajas] = await Promise.all([
    Cuenta.findAll({ where: { empresaId: req.empresaId, abierta_en: hoy }, attributes: ['usuarioId'], group: ['usuarioId'], raw: true }),
    Comanda.findAll({ where: { empresaId: req.empresaId, enviada_en: hoy }, attributes: ['usuarioId'], group: ['usuarioId'], raw: true }),
    Venta.findAll({ where: { empresaId: req.empresaId, fecha: hoy }, attributes: ['usuarioId'], group: ['usuarioId'], raw: true }),
    Caja.findAll({ where: { empresaId: req.empresaId, fecha_apertura: hoy }, attributes: ['usuarioId'], group: ['usuarioId'], raw: true }),
  ]);
  const activos = new Set([...cuentas, ...comandas, ...ventas, ...cajas].map((r) => r.usuarioId));
  const peso = new Map(enlaces.map((e) => [e.usuarioId, Number(e.propina_peso)]));
  res.json(personas.map((p) => ({ ...p, peso: peso.get(p.id) ?? 1, trabajo_hoy: activos.has(p.id) })));
};

/** Propinas del rango: lo recibido en ventas, lo entregado y cuánto le tocó a cada persona. */
exports.getPropinas = async (req, res) => {
  const f = buildListWhere(req.query, { fecha: 'fecha' });
  const [recibidas, entregadas, repartos] = await Promise.all([
    Venta.sum('propina', { where: { empresaId: req.empresaId, estado: 'ACTIVA', ...f } }),
    CajaMovimiento.sum('monto', { where: { empresaId: req.empresaId, tipo: 'PROPINA', ...f } }),
    PropinaReparto.findAll({
      where: { empresaId: req.empresaId, ...f },
      attributes: ['usuarioId', [fn('SUM', col('monto')), 'total'], [fn('COUNT', col('PropinaReparto.id')), 'veces']],
      include: [{ model: Usuario, as: 'usuario', attributes: ['nombre'] }],
      group: ['usuarioId', 'usuario.id'],
      raw: true,
      nest: true,
    }),
  ]);
  const porPersona = repartos.map((r) => ({ usuarioId: r.usuarioId, nombre: r.usuario.nombre, total: redondear2(r.total), veces: Number(r.veces) })).sort((a, b) => b.total - a.total);
  const repartido = redondear2(porPersona.reduce((a, p) => a + p.total, 0));
  res.json({
    recibidas: redondear2(recibidas || 0),
    entregadas: redondear2(entregadas || 0),
    repartido,
    sin_repartir: redondear2((entregadas || 0) - repartido),
    por_persona: porPersona,
  });
};

/**
 * Base con la que sugerir abrir caja: el efectivo contado en el último cierre
 * de la empresa; si nunca se cerró una, el capital inicial de la empresa.
 */
exports.getBaseSugerida = async (req, res) => {
  const ultima = await Caja.findOne({
    where: { empresaId: req.empresaId, estado: 'CERRADA' },
    order: [['fecha_cierre', 'DESC']],
    attributes: ['id', 'monto_contado', 'fecha_cierre'],
  });
  if (ultima) {
    return res.json({ monto: Number(ultima.monto_contado), origen: 'CIERRE_ANTERIOR', cajaId: ultima.id, fecha: ultima.fecha_cierre });
  }
  const empresa = await Empresa.findByPk(req.empresaId, { attributes: ['capital_inicial'] });
  const capital = Number(empresa?.capital_inicial || 0);
  res.json({ monto: capital, origen: capital > 0 ? 'CAPITAL_INICIAL' : null });
};

/** Dinero de la empresa frente a su capital inicial (solo administrador). */
exports.getBalance = async (req, res) => {
  res.json(await calcularBalance(req.empresaId, { desde: req.query.desde, hasta: req.query.hasta }));
};
