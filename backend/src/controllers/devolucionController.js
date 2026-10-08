'use strict';

const { sequelize, DevolucionVenta, DevolucionVentaDetalle, VentaDetalle, Producto, Servicio, Usuario, Venta, Cliente } = require('../models');
const { auditar } = require('../utils/audit');
const { invalidateDashboard } = require('./reporteController');
const { invalidateInforme } = require('./informeController');
const { registrarDevolucion } = require('../services/devolucionService');

const INCLUDES = [
  { model: Usuario, as: 'usuario', attributes: ['nombre'] },
  {
    model: DevolucionVentaDetalle,
    as: 'detalles',
    include: [{ model: VentaDetalle, as: 'linea', include: [{ model: Producto, attributes: ['nombre_producto', 'unidad_medida'] }, { model: Servicio, attributes: ['nombre'] }] }],
  },
];

/** Registra una devolución parcial: ver services/devolucionService. */
exports.crearDevolucion = async (req, res) => {
  const r = await sequelize.transaction((t) => registrarDevolucion(req, t, req.params.id, req.body));
  if (!r) return res.status(404).json({ error: 'Venta no encontrada' });

  invalidateDashboard(req.empresaId);
  invalidateInforme(req.empresaId);
  const cliente = r.venta.clienteId ? await Cliente.findByPk(r.venta.clienteId, { attributes: ['nombre'] }) : null;
  auditar(req, 'venta_devolucion', {
    ventaId: r.venta.id,
    devolucionId: r.devolucion.id,
    total: Number(r.devolucion.total),
    motivo: r.devolucion.motivo,
    clienteNombre: cliente?.nombre || null,
    reembolso: r.devolucion.reembolso,
    dineroDevuelto: Number(r.devolucion.dinero_devuelto),
    creditoReducido: Number(r.devolucion.credito_reducido),
    numItems: r.lineas.length,
  });
  const completa = await DevolucionVenta.findByPk(r.devolucion.id, { include: INCLUDES });
  res.status(201).json({
    devolucion: completa,
    venta: { id: r.venta.id, total: Number(r.venta.total), total_devuelto: Number(r.venta.total_devuelto), saldo_pendiente: Number(r.venta.saldo_pendiente) },
  });
};

/** Devoluciones de una venta, con las líneas devueltas. */
exports.getDevoluciones = async (req, res) => {
  const venta = await Venta.findOne({ where: { id: req.params.id, empresaId: req.empresaId }, attributes: ['id'] });
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
  const devoluciones = await DevolucionVenta.findAll({
    where: { ventaId: venta.id }, include: INCLUDES, order: [['fecha', 'ASC'], ['id', 'ASC']],
  });
  res.json(devoluciones);
};
