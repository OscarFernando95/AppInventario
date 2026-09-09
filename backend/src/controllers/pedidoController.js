const { sequelize, Pedido, PedidoDetalle, Proveedor, Producto, Compra, CompraDetalle } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { invalidateDashboard } = require('./reporteController');
const { invalidateInforme } = require('./informeController');
const { calcularTotalCompra } = require('../services/calculo');

exports.getPedidos = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query);
  const where = { empresaId: req.empresaId };

  const total = await Pedido.count({ where });
  const pedidos = await Pedido.findAll({
    where,
    include: [
      { model: Proveedor, attributes: ['nombre', 'nit', 'contacto', 'email', 'telefono'] },
      {
        model: PedidoDetalle,
        include: [{ model: Producto, attributes: ['nombre_producto', 'codigo'] }],
      },
    ],
    order: [['fecha_pedido', 'DESC']],
    limit,
    offset,
  });

  setTotalCount(res, total);
  res.json(pedidos);
};

exports.createPedido = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { proveedorId, detalles } = req.body;

    const proveedor = await Proveedor.findOne({
      where: { id: proveedorId, empresaId: req.empresaId },
      transaction: t,
    });
    if (!proveedor) throw new ValidationError('Proveedor inválido');

    for (const item of detalles) {
      const producto = await Producto.findOne({
        where: { id: item.productoId, empresaId: req.empresaId },
        transaction: t,
      });
      if (!producto) throw new ValidationError('Producto inválido en un detalle del pedido.');
    }

    const totalEstimado = calcularTotalCompra(
      detalles.map((d) => ({ cantidad: d.cantidad_pedida, costoUnitario: d.costo_estimado }))
    );

    const pedido = await Pedido.create({
      empresaId: req.empresaId,
      proveedorId,
      usuarioId: req.userId,
      total_estimado: totalEstimado,
    }, { transaction: t });

    await PedidoDetalle.bulkCreate(
      detalles.map((d) => ({
        pedidoId: pedido.id,
        productoId: d.productoId,
        cantidad_pedida: Number(d.cantidad_pedida),
        costo_estimado: Number(d.costo_estimado),
      })),
      { transaction: t }
    );

    await t.commit();
    res.status(201).json(pedido);
  } catch (error) {
    await t.rollback();
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('CREATE PEDIDO ERROR:', error);
    return res.status(500).json({ error: 'Error al crear el pedido' });
  }
};

exports.checkInPedido = async (req, res) => {
  // Transmutar el pedido en una compra real con las cantidades recibidas.
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { detalles_recibidos } = req.body;

    const pedido = await Pedido.findOne({
      where: { id, empresaId: req.empresaId },
      include: [{ model: PedidoDetalle }],
      transaction: t,
    });
    if (!pedido || pedido.estado !== 'PENDIENTE') {
      throw new ValidationError('Pedido no encontrado o ya procesado');
    }
    const productosDelPedido = new Set((pedido.PedidoDetalles || []).map((d) => d.productoId));

    // Validar todo (pertenencia al pedido + tenant + lock de stock) antes de tocar nada.
    const items = [];
    for (const item of detalles_recibidos) {
      const cantidad = Number(item.cantidad);
      if (cantidad === 0) continue;
      if (!productosDelPedido.has(Number(item.productoId))) {
        throw new ValidationError('Se recibió un producto que no estaba en el pedido.');
      }
      const producto = await Producto.findOne({
        where: { id: item.productoId, empresaId: req.empresaId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!producto) throw new ValidationError('Producto inválido en la recepción del pedido.');
      items.push({ producto, cantidad, costo: Number(item.costo_unitario) });
    }
    if (items.length === 0) throw new ValidationError('No se recibió ninguna cantidad.');

    const totalReal = calcularTotalCompra(items.map((i) => ({ cantidad: i.cantidad, costoUnitario: i.costo })));

    const compra = await Compra.create({
      empresaId: req.empresaId,
      proveedorId: pedido.proveedorId,
      usuarioId: req.userId,
      pedidoId: pedido.id, // trazabilidad
      total: totalReal,
    }, { transaction: t });

    await CompraDetalle.bulkCreate(
      items.map((i) => ({
        compraId: compra.id,
        productoId: i.producto.id,
        cantidad: i.cantidad,
        costo_unitario: i.costo,
      })),
      { transaction: t }
    );

    for (const i of items) {
      await i.producto.update(
        { stock_actual: Number(i.producto.stock_actual) + i.cantidad },
        { transaction: t }
      );
    }

    await pedido.update({ estado: 'COMPLETADO' }, { transaction: t });

    await t.commit();
    invalidateDashboard(req.empresaId);
    invalidateInforme(req.empresaId);
    res.status(200).json({ compraId: compra.id, message: 'Recepción completada exitosamente' });
  } catch (error) {
    await t.rollback();
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('CHECK-IN PEDIDO ERROR:', error);
    return res.status(500).json({ error: 'Error al procesar la recepción del pedido' });
  }
};
