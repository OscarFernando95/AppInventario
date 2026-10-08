'use strict';

const { Op } = require('sequelize');
const { sequelize, Compra, PagoCompra, Proveedor, Usuario, Caja, CajaMovimiento } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { auditar } = require('../utils/audit');
const { invalidateDashboard } = require('./reporteController');
const { registrarEgreso } = require('../services/cajaService');
const { redondear2, aFechaLocal, diasDeMora, envejecimiento, cabeEnSaldo } = require('../services/cartera');

const PROVEEDOR = { model: Proveedor, attributes: ['id', 'nombre', 'nit'] };

function filaDeuda(c, hoy) {
  const saldo = Number(c.saldo_pendiente);
  const mora = saldo > 0 ? diasDeMora(c.fecha_vencimiento, hoy) : 0;
  return {
    id: c.id,
    fecha: c.fecha,
    fecha_vencimiento: c.fecha_vencimiento,
    dias_credito: c.dias_credito,
    total: Number(c.total),
    pagado: redondear2(Number(c.total) - saldo),
    saldo_pendiente: saldo,
    dias_mora: mora,
    vencida: mora > 0,
    proveedor: c.Proveedor ? { id: c.Proveedor.id, nombre: c.Proveedor.nombre, nit: c.Proveedor.nit } : null,
  };
}

const baseWhere = (req) => ({ empresaId: req.empresaId, forma_pago: 'CREDITO' });

/** Compras a crédito: por defecto las que aún se deben, las que vencen primero arriba. */
exports.getDeudas = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query, { defaultLimit: 50 });
  const hoy = aFechaLocal();
  const estado = req.query.estado || 'PENDIENTES';
  const where = { ...baseWhere(req) };
  if (req.query.proveedorId) where.proveedorId = req.query.proveedorId;
  if (estado === 'PENDIENTES') where.saldo_pendiente = { [Op.gt]: 0 };
  if (estado === 'VENCIDAS') { where.saldo_pendiente = { [Op.gt]: 0 }; where.fecha_vencimiento = { [Op.lt]: hoy }; }
  if (estado === 'PAGADAS') where.saldo_pendiente = 0;

  const { count, rows } = await Compra.findAndCountAll({
    where,
    include: [PROVEEDOR],
    order: estado === 'PAGADAS' ? [['fecha', 'DESC']] : [['fecha_vencimiento', 'ASC'], ['id', 'ASC']],
    limit,
    offset,
  });
  setTotalCount(res, count);
  res.json(rows.map((c) => filaDeuda(c, hoy)));
};

/** Cuánto se debe a proveedores: total, envejecimiento por tramos y los mayores acreedores. */
exports.getResumen = async (req, res) => {
  const hoy = aFechaLocal();
  const compras = await Compra.findAll({ where: { ...baseWhere(req), saldo_pendiente: { [Op.gt]: 0 } }, include: [PROVEEDOR] });
  const items = compras.map((c) => ({ saldo: Number(c.saldo_pendiente), fecha_vencimiento: c.fecha_vencimiento }));

  const porProveedor = new Map();
  for (const c of compras) {
    const e = porProveedor.get(c.proveedorId) || { proveedorId: c.proveedorId, nombre: c.Proveedor?.nombre || 'Sin proveedor', saldo: 0, vencido: 0, facturas: 0 };
    e.saldo = redondear2(e.saldo + Number(c.saldo_pendiente));
    if (diasDeMora(c.fecha_vencimiento, hoy) > 0) e.vencido = redondear2(e.vencido + Number(c.saldo_pendiente));
    e.facturas += 1;
    porProveedor.set(c.proveedorId, e);
  }
  res.json({
    ...envejecimiento(items, hoy),
    proveedores_con_deuda: porProveedor.size,
    por_proveedor: [...porProveedor.values()].sort((a, b) => b.saldo - a.saldo).slice(0, 10),
  });
};

/** Estado de cuenta con un proveedor: cada compra a crédito con sus pagos. */
exports.getEstadoCuenta = async (req, res) => {
  const proveedor = await Proveedor.findOne({ where: { id: req.params.proveedorId, empresaId: req.empresaId } });
  if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
  const hoy = aFechaLocal();

  const compras = await Compra.findAll({
    where: { ...baseWhere(req), proveedorId: proveedor.id },
    include: [{ model: PagoCompra, as: 'pagos', where: { estado: 'ACTIVO' }, required: false, include: [{ model: Usuario, as: 'usuario', attributes: ['nombre'] }] }],
    order: [['fecha', 'ASC'], [{ model: PagoCompra, as: 'pagos' }, 'fecha', 'ASC']],
    limit: 300,
  });
  const filas = compras.map((c) => ({
    ...filaDeuda({ ...c.toJSON(), Proveedor: null }, hoy),
    pagos: c.pagos.map((p) => ({ id: p.id, fecha: p.fecha, monto: Number(p.monto), origen: p.origen, nota: p.nota, usuario: p.usuario?.nombre })),
  }));
  res.json({
    proveedor: { id: proveedor.id, nombre: proveedor.nombre, nit: proveedor.nit, telefono: proveedor.telefono, email: proveedor.email },
    total_credito: redondear2(filas.reduce((a, f) => a + f.total, 0)),
    total_pagado: redondear2(filas.reduce((a, f) => a + f.pagado, 0)),
    saldo: redondear2(filas.reduce((a, f) => a + f.saldo_pendiente, 0)),
    vencido: redondear2(filas.filter((f) => f.vencida).reduce((a, f) => a + f.saldo_pendiente, 0)),
    compras: filas,
  });
};

exports.getPagos = async (req, res) => {
  const compra = await Compra.findOne({ where: { id: req.params.compraId, empresaId: req.empresaId, forma_pago: 'CREDITO' } });
  if (!compra) return res.status(404).json({ error: 'Compra a crédito no encontrada' });
  const pagos = await PagoCompra.findAll({
    where: { compraId: compra.id },
    include: [{ model: Usuario, as: 'usuario', attributes: ['nombre'] }],
    order: [['fecha', 'ASC'], ['id', 'ASC']],
  });
  res.json(pagos);
};

/**
 * Registra un pago al proveedor. Con origen CAJA sale en efectivo de la caja abierta de quien paga
 * (egreso PAGO_PROV, baja el efectivo esperado); con origen OTRO (banco, transferencia) no toca la caja.
 */
exports.crearPago = async (req, res) => {
  const { monto, origen, nota } = req.body;
  if (origen === 'CAJA' && !req.empresaModulos?.has('Caja')) {
    throw new ValidationError('El módulo "Caja" no está activo: no se puede pagar desde la caja.');
  }

  const { pago, compra, proveedorNombre } = await sequelize.transaction(async (t) => {
    const c = await Compra.findOne({ where: { id: req.params.compraId, empresaId: req.empresaId, forma_pago: 'CREDITO' }, transaction: t, lock: t.LOCK.UPDATE });
    if (!c) throw Object.assign(new ValidationError('Compra a crédito no encontrada'), { status: 404 });
    if (!(Number(c.saldo_pendiente) > 0)) throw new ValidationError('Esta compra ya está pagada.');
    if (!cabeEnSaldo(monto, c.saldo_pendiente)) {
      throw new ValidationError(`El pago (${monto.toLocaleString('es-CO')}) supera lo que se debe (${Number(c.saldo_pendiente).toLocaleString('es-CO')}).`);
    }
    const prov = await Proveedor.findByPk(c.proveedorId, { attributes: ['nombre'], transaction: t });

    const nuevo = await PagoCompra.create({
      empresaId: req.empresaId, compraId: c.id, usuarioId: req.userId, monto, origen, nota: nota || null, fecha: new Date(),
    }, { transaction: t });
    if (origen === 'CAJA') {
      await registrarEgreso(req, t, {
        tipo: 'PAGO_PROV', concepto: `Pago compra #${c.id}${prov ? ` · ${prov.nombre}` : ''}`, monto, compraId: c.id, pagoId: nuevo.id,
      });
    }
    await c.update({ saldo_pendiente: redondear2(Number(c.saldo_pendiente) - monto) }, { transaction: t });
    return { pago: nuevo, compra: c, proveedorNombre: prov?.nombre || null };
  });

  invalidateDashboard(req.empresaId);
  auditar(req, 'pago_proveedor_registrado', {
    pagoId: pago.id, compraId: compra.id, monto: Number(pago.monto), origen, proveedorNombre, saldo: Number(compra.saldo_pendiente),
  });
  res.status(201).json({ pago, saldo_pendiente: Number(compra.saldo_pendiente) });
};

/** Anula un pago: la deuda vuelve a subir. Si salió de una caja ya cerrada no se puede (ese turno ya cuadró). */
exports.anularPago = async (req, res) => {
  const resultado = await sequelize.transaction(async (t) => {
    const pago = await PagoCompra.findOne({ where: { id: req.params.id, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!pago) return null;
    if (pago.estado === 'ANULADO') throw new ValidationError('Este pago ya está anulado.');

    if (pago.origen === 'CAJA') {
      const mov = await CajaMovimiento.findOne({ where: { pagoId: pago.id }, transaction: t });
      if (mov) {
        const caja = await Caja.findByPk(mov.cajaId, { transaction: t, lock: t.LOCK.UPDATE });
        if (caja.estado !== 'ABIERTA') throw new ValidationError('El pago salió de una caja que ya fue cerrada; no se puede anular.');
        await mov.destroy({ transaction: t }); // el efectivo vuelve a la caja
      }
    }
    const compra = await Compra.findByPk(pago.compraId, { transaction: t, lock: t.LOCK.UPDATE });
    await compra.update({ saldo_pendiente: redondear2(Number(compra.saldo_pendiente) + Number(pago.monto)) }, { transaction: t });
    await pago.update({ estado: 'ANULADO', anulado_en: new Date(), anulado_por: req.userId }, { transaction: t });
    return { pago, compra };
  });
  if (!resultado) return res.status(404).json({ error: 'Pago no encontrado' });

  invalidateDashboard(req.empresaId);
  auditar(req, 'pago_proveedor_anulado', { pagoId: resultado.pago.id, compraId: resultado.compra.id, monto: Number(resultado.pago.monto) });
  res.json({ pago: resultado.pago, saldo_pendiente: Number(resultado.compra.saldo_pendiente) });
};
