'use strict';

const { sequelize, Caja, CajaMovimiento, Venta, Usuario, Empresa, AbonoVenta } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { buildListWhere } = require('../utils/listFilters');
const { auditar } = require('../utils/audit');

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

// Un FRONT_USER solo ve/gestiona su propia caja; el FRONT_ADMIN, la de cualquiera.
const puedeVer = (req, caja) => req.tipoRol === 'FRONT_ADMIN' || caja.usuarioId === req.userId;

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
    ...(req.tipoRol === 'FRONT_ADMIN' ? {} : { usuarioId: req.userId }),
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
    attributes: ['id', 'fecha', 'total', 'forma_pago', 'medio_pago', 'estado'],
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

/** Retiro de efectivo de la caja del usuario (sacar dinero). Los pagos de gastos/compras tienen su propio flujo. */
exports.registrarRetiro = async (req, res) => {
  const { concepto, monto } = req.body;
  const mov = await sequelize.transaction((t) => registrarEgreso(req, t, { tipo: 'RETIRO', concepto, monto }));
  auditar(req, 'caja_retiro', { cajaId: mov.cajaId, monto: Number(mov.monto), concepto });
  res.status(201).json(mov);
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
