const { sequelize, Pedido, PedidoDetalle, Proveedor, Producto, Compra, CompraDetalle } = require('../models');
const { ValidationError } = require('../utils/errors');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

exports.getPedidos = async (req, res) => {
  try {
    const pedidos = await Pedido.findAll({
      where: { empresaId: req.empresaId },
      include: [
        { model: Proveedor, attributes: ['nombre', 'nit', 'contacto', 'email', 'telefono'] },
        {
          model: PedidoDetalle,
          include: [{ model: Producto, attributes: ['nombre_producto', 'codigo'] }]
        }
      ],
      order: [['fecha_pedido', 'DESC']]
    });
    res.json(pedidos);
  } catch (error) {
    console.error('GET PEDIDOS ERROR:', error);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
};

exports.createPedido = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { proveedorId, detalles } = req.body;

    if (!Array.isArray(detalles) || detalles.length === 0) {
      throw new ValidationError('El pedido debe incluir al menos un detalle.');
    }

    const proveedor = await Proveedor.findOne({
      where: { id: proveedorId, empresaId: req.empresaId },
      transaction: t,
    });
    if (!proveedor) throw new ValidationError('Proveedor inválido');

    let totalEstimado = 0;
    for (let item of detalles) {
      const cantidad = Number(item.cantidad_pedida);
      const costo = Number(item.costo_estimado);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        throw new ValidationError('Cantidad pedida inválida en un detalle.');
      }
      if (!Number.isFinite(costo) || costo < 0) {
        throw new ValidationError('Costo estimado inválido en un detalle.');
      }
      const producto = await Producto.findOne({
        where: { id: item.productoId, empresaId: req.empresaId },
        transaction: t,
      });
      if (!producto) throw new ValidationError('Producto inválido en un detalle del pedido.');
      totalEstimado += cantidad * costo;
    }

    const pedido = await Pedido.create({
      empresaId: req.empresaId,
      proveedorId,
      usuarioId: req.userId,
      total_estimado: round2(totalEstimado)
    }, { transaction: t });

    for (let item of detalles) {
      await PedidoDetalle.create({
        pedidoId: pedido.id,
        productoId: item.productoId,
        cantidad_pedida: Number(item.cantidad_pedida),
        costo_estimado: Number(item.costo_estimado)
      }, { transaction: t });
    }

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
  // Transmutar a Compra real con las cantidades recibidas
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { detalles_recibidos } = req.body; // Array de { productoId, cantidad, costo_unitario }

    if (!Array.isArray(detalles_recibidos) || detalles_recibidos.length === 0) {
      throw new ValidationError('Debes indicar al menos un producto recibido.');
    }

    const pedido = await Pedido.findOne({ where: { id, empresaId: req.empresaId }, transaction: t });
    if (!pedido || pedido.estado !== 'PENDIENTE') {
      throw new ValidationError('Pedido no encontrado o ya procesado');
    }

    // Validar todo antes de tocar nada.
    const items = [];
    for (let item of detalles_recibidos) {
      const cantidad = Number(item.cantidad);
      const costo = Number(item.costo_unitario);
      if (!Number.isFinite(cantidad) || cantidad < 0) {
        throw new ValidationError('Cantidad recibida inválida.');
      }
      if (cantidad === 0) continue;
      if (!Number.isFinite(costo) || costo < 0) {
        throw new ValidationError('Costo unitario inválido en la recepción.');
      }
      const producto = await Producto.findOne({
        where: { id: item.productoId, empresaId: req.empresaId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!producto) throw new ValidationError('Producto inválido en la recepción del pedido.');
      items.push({ producto, cantidad, costo });
    }

    if (items.length === 0) {
      throw new ValidationError('No se recibió ninguna cantidad.');
    }

    const totalReal = round2(items.reduce((acc, i) => acc + i.cantidad * i.costo, 0));

    // 1. Crear Compra
    const compra = await Compra.create({
      empresaId: req.empresaId,
      proveedorId: pedido.proveedorId,
      usuarioId: req.userId,
      total: totalReal
    }, { transaction: t });

    // 2. Crear CompraDetalles y afectar stock
    for (let { producto, cantidad, costo } of items) {
      await CompraDetalle.create({
        compraId: compra.id,
        productoId: producto.id,
        cantidad,
        costo_unitario: costo
      }, { transaction: t });

      await producto.update({
        stock_actual: producto.stock_actual + cantidad
      }, { transaction: t });
    }

    // 3. Cerrar Pedido
    await pedido.update({ estado: 'COMPLETADO' }, { transaction: t });

    await t.commit();
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
