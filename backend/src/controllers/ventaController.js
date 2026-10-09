const { sequelize, Venta, VentaDetalle, Producto, Servicio, Cliente, Usuario, Empresa, AnulacionVenta, DevolucionVenta } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { buildListWhere } = require('../utils/listFilters');
const { auditar } = require('../utils/audit');
const { invalidateDashboard } = require('./reporteController');
const { invalidateInforme } = require('./informeController');
const { registrarVenta } = require('../services/ventaService');

exports.getVentas = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query);
  const where = {
    empresaId: req.empresaId,
    ...buildListWhere(req.query, { fecha: 'fecha', igualdad: ['clienteId', 'estado'] }),
  };

  const total = await Venta.count({ where });
  const ventas = await Venta.findAll({
    where,
    // La empresa activa ya la conoce el cliente; para el PDF de una venta
    // concreta se usa GET /api/ventas/:id (que sí incluye Empresa).
    include: [
      { model: Usuario, attributes: ['nombre'] },
      Cliente,
      { model: VentaDetalle, include: [Producto, Servicio] },
      { model: Usuario, as: 'anuladaPor', attributes: ['nombre'], required: false },
      // Solicitud de anulación en espera (para mostrarla en la fila).
      { model: AnulacionVenta, as: 'anulaciones', where: { estado: 'PENDIENTE' }, required: false, attributes: ['id', 'motivo', 'solicitada_por'] },
    ],
    order: [['fecha', 'DESC']],
    limit,
    offset,
  });

  setTotalCount(res, total);
  res.json(ventas);
};

exports.getVentaById = async (req, res) => {
  const venta = await Venta.findOne({
    where: { id: req.params.id, empresaId: req.empresaId },
    include: [
      { model: Usuario, attributes: ['nombre'] },
      Cliente,
      { model: VentaDetalle, include: [Producto, Servicio] },
      { model: Empresa, attributes: ['nombre', 'nit', 'contacto'] },
      { model: DevolucionVenta, as: 'devoluciones', attributes: ['id', 'fecha', 'total', 'motivo'], required: false },
    ],
    order: [[{ model: DevolucionVenta, as: 'devoluciones' }, 'fecha', 'ASC']],
  });
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
  res.json(venta);
};

exports.createVenta = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { venta, calc, clienteNombre, aCredito, diasCredito, numItems } = await registrarVenta(req, t, req.body, { exigirGrupos: true });
    await t.commit();
    invalidateDashboard(req.empresaId);
    invalidateInforme(req.empresaId);
    auditar(req, 'venta_creada', { ventaId: venta.id, total: calc.total, clienteId: venta.clienteId, clienteNombre, numItems, aCredito, diasCredito });
    res.status(201).json(venta);
  } catch (error) {
    await t.rollback();
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('CREATE VENTA ERROR:', error);
    return res.status(500).json({ error: 'Error al registrar la venta' });
  }
};
