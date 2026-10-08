'use strict';

const { Op } = require('sequelize');
const { sequelize, Venta, AbonoVenta, Cliente, Usuario, Caja } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { auditar } = require('../utils/audit');
const { invalidateDashboard } = require('./reporteController');
const { redondear2, aFechaLocal, diasDeMora, envejecimiento, cabeEnSaldo } = require('../services/cartera');

const CLIENTE = { model: Cliente, attributes: ['id', 'nombre', 'documento', 'telefono', 'cupo_credito'] };

/** Fila de cartera: la venta con lo cobrado, lo que falta y cuánto lleva vencida. */
function filaCartera(v, hoy) {
  const saldo = Number(v.saldo_pendiente);
  const mora = saldo > 0 ? diasDeMora(v.fecha_vencimiento, hoy) : 0;
  return {
    id: v.id,
    fecha: v.fecha,
    fecha_vencimiento: v.fecha_vencimiento,
    dias_credito: v.dias_credito,
    total: Number(v.total),
    abonado: redondear2(Number(v.total) - saldo),
    saldo_pendiente: saldo,
    dias_mora: mora,
    vencida: mora > 0,
    cliente: v.Cliente ? { id: v.Cliente.id, nombre: v.Cliente.nombre, documento: v.Cliente.documento } : null,
  };
}

const baseWhere = (req) => ({ empresaId: req.empresaId, estado: 'ACTIVA', forma_pago: '2' });

/** Ventas a crédito: por defecto las que aún tienen saldo, las que vencen primero arriba. */
exports.getCuentas = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query, { defaultLimit: 50 });
  const hoy = aFechaLocal();
  const estado = req.query.estado || 'PENDIENTES';
  const where = { ...baseWhere(req) };
  if (req.query.clienteId) where.clienteId = req.query.clienteId;
  if (estado === 'PENDIENTES') where.saldo_pendiente = { [Op.gt]: 0 };
  if (estado === 'VENCIDAS') { where.saldo_pendiente = { [Op.gt]: 0 }; where.fecha_vencimiento = { [Op.lt]: hoy }; }
  if (estado === 'PAGADAS') where.saldo_pendiente = 0;

  const { count, rows } = await Venta.findAndCountAll({
    where,
    include: [CLIENTE],
    order: estado === 'PAGADAS' ? [['fecha', 'DESC']] : [['fecha_vencimiento', 'ASC'], ['id', 'ASC']],
    limit,
    offset,
  });
  setTotalCount(res, count);
  res.json(rows.map((v) => filaCartera(v, hoy)));
};

/** Cuánto deben los clientes: total, envejecimiento por tramos y los que más deben. */
exports.getResumen = async (req, res) => {
  const hoy = aFechaLocal();
  const ventas = await Venta.findAll({
    where: { ...baseWhere(req), saldo_pendiente: { [Op.gt]: 0 } },
    include: [CLIENTE],
  });
  const items = ventas.map((v) => ({ saldo: Number(v.saldo_pendiente), fecha_vencimiento: v.fecha_vencimiento }));

  const porCliente = new Map();
  for (const v of ventas) {
    const id = v.clienteId;
    const e = porCliente.get(id) || { clienteId: id, nombre: v.Cliente?.nombre || 'Sin cliente', saldo: 0, vencido: 0, facturas: 0 };
    e.saldo = redondear2(e.saldo + Number(v.saldo_pendiente));
    if (diasDeMora(v.fecha_vencimiento, hoy) > 0) e.vencido = redondear2(e.vencido + Number(v.saldo_pendiente));
    e.facturas += 1;
    porCliente.set(id, e);
  }
  res.json({
    ...envejecimiento(items, hoy),
    clientes_con_deuda: porCliente.size,
    por_cliente: [...porCliente.values()].sort((a, b) => b.saldo - a.saldo).slice(0, 10),
  });
};

/** Estado de cuenta de un cliente: cada venta a crédito con sus abonos, el saldo y el cupo disponible. */
exports.getEstadoCuenta = async (req, res) => {
  const cliente = await Cliente.findOne({ where: { id: req.params.clienteId, empresaId: req.empresaId } });
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const hoy = aFechaLocal();

  const ventas = await Venta.findAll({
    where: { ...baseWhere(req), clienteId: cliente.id },
    include: [{ model: AbonoVenta, as: 'abonos', where: { estado: 'ACTIVO' }, required: false, include: [{ model: Usuario, as: 'usuario', attributes: ['nombre'] }] }],
    order: [['fecha', 'ASC'], [{ model: AbonoVenta, as: 'abonos' }, 'fecha', 'ASC']],
    limit: 300,
  });
  const filas = ventas.map((v) => ({
    ...filaCartera({ ...v.toJSON(), Cliente: null }, hoy),
    abonos: v.abonos.map((a) => ({ id: a.id, fecha: a.fecha, monto: Number(a.monto), medio_pago: a.medio_pago, nota: a.nota, usuario: a.usuario?.nombre })),
  }));
  const saldo = redondear2(filas.reduce((a, f) => a + f.saldo_pendiente, 0));
  res.json({
    cliente: { id: cliente.id, nombre: cliente.nombre, documento: cliente.documento, telefono: cliente.telefono, email: cliente.email },
    cupo_credito: cliente.cupo_credito == null ? null : Number(cliente.cupo_credito),
    cupo_disponible: cliente.cupo_credito == null ? null : redondear2(Number(cliente.cupo_credito) - saldo),
    total_credito: redondear2(filas.reduce((a, f) => a + f.total, 0)),
    total_abonado: redondear2(filas.reduce((a, f) => a + f.abonado, 0)),
    saldo,
    vencido: redondear2(filas.filter((f) => f.vencida).reduce((a, f) => a + f.saldo_pendiente, 0)),
    ventas: filas,
  });
};

/** Abonos de una venta (también los anulados, para el historial). */
exports.getAbonos = async (req, res) => {
  const venta = await Venta.findOne({ where: { id: req.params.ventaId, empresaId: req.empresaId, forma_pago: '2' } });
  if (!venta) return res.status(404).json({ error: 'Venta a crédito no encontrada' });
  const abonos = await AbonoVenta.findAll({
    where: { ventaId: venta.id },
    include: [{ model: Usuario, as: 'usuario', attributes: ['nombre'] }],
    order: [['fecha', 'ASC'], ['id', 'ASC']],
  });
  res.json(abonos);
};

/**
 * Registra un abono. En efectivo y con el módulo Caja, entra a la caja ABIERTA de quien lo recibe
 * (suma al efectivo esperado); por banco/transferencia/tarjeta no toca la caja.
 */
exports.crearAbono = async (req, res) => {
  const { monto, medio_pago: medio, nota } = req.body;

  const { abono, venta } = await sequelize.transaction(async (t) => {
    const v = await Venta.findOne({ where: { id: req.params.ventaId, empresaId: req.empresaId, forma_pago: '2' }, transaction: t, lock: t.LOCK.UPDATE });
    if (!v) throw Object.assign(new ValidationError('Venta a crédito no encontrada'), { status: 404 });
    if (v.estado === 'ANULADA') throw new ValidationError('Esta venta está anulada.');
    if (!(Number(v.saldo_pendiente) > 0)) throw new ValidationError('Esta venta ya está pagada.');
    if (!cabeEnSaldo(monto, v.saldo_pendiente)) {
      throw new ValidationError(`El abono (${monto.toLocaleString('es-CO')}) supera el saldo pendiente (${Number(v.saldo_pendiente).toLocaleString('es-CO')}).`);
    }

    let caja = null;
    if (medio === '10' && req.empresaModulos?.has('Caja')) {
      caja = await Caja.findOne({ where: { empresaId: req.empresaId, usuarioId: req.userId, estado: 'ABIERTA' }, transaction: t, lock: t.LOCK.UPDATE });
      if (!caja) throw new ValidationError('Para recibir un abono en efectivo debes tener tu caja abierta.');
    }

    const nuevo = await AbonoVenta.create({
      empresaId: req.empresaId, ventaId: v.id, usuarioId: req.userId, cajaId: caja ? caja.id : null,
      monto, medio_pago: medio, nota: nota || null, fecha: new Date(),
    }, { transaction: t });
    await v.update({ saldo_pendiente: redondear2(Number(v.saldo_pendiente) - monto) }, { transaction: t });
    return { abono: nuevo, venta: v };
  });

  invalidateDashboard(req.empresaId);
  const cliente = venta.clienteId ? await Cliente.findByPk(venta.clienteId, { attributes: ['nombre'] }) : null;
  auditar(req, 'abono_registrado', {
    abonoId: abono.id, ventaId: venta.id, monto: Number(abono.monto), medio_pago: abono.medio_pago,
    clienteNombre: cliente?.nombre || null, saldo: Number(venta.saldo_pendiente),
  });
  res.status(201).json({ abono, saldo_pendiente: Number(venta.saldo_pendiente) });
};

/**
 * Anula un abono (queda en el historial). El saldo de la venta vuelve a subir. Si el dinero entró a una
 * caja que ya se cerró, no se puede: ese turno ya cuadró.
 */
exports.anularAbono = async (req, res) => {
  const resultado = await sequelize.transaction(async (t) => {
    const abono = await AbonoVenta.findOne({ where: { id: req.params.id, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!abono) return null;
    if (abono.estado === 'ANULADO') throw new ValidationError('Este abono ya está anulado.');

    if (abono.cajaId) {
      const caja = await Caja.findByPk(abono.cajaId, { transaction: t, lock: t.LOCK.UPDATE });
      if (caja && caja.estado !== 'ABIERTA') throw new ValidationError('El abono se recibió en una caja que ya fue cerrada; no se puede anular.');
    }
    const venta = await Venta.findByPk(abono.ventaId, { transaction: t, lock: t.LOCK.UPDATE });
    await venta.update({ saldo_pendiente: redondear2(Number(venta.saldo_pendiente) + Number(abono.monto)) }, { transaction: t });
    await abono.update({ estado: 'ANULADO', anulado_en: new Date(), anulado_por: req.userId }, { transaction: t });
    return { abono, venta };
  });
  if (!resultado) return res.status(404).json({ error: 'Abono no encontrado' });

  invalidateDashboard(req.empresaId);
  auditar(req, 'abono_anulado', { abonoId: resultado.abono.id, ventaId: resultado.venta.id, monto: Number(resultado.abono.monto) });
  res.json({ abono: resultado.abono, saldo_pendiente: Number(resultado.venta.saldo_pendiente) });
};
