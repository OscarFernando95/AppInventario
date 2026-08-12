const { sequelize, Pedido, PedidoDetalle, Proveedor, Producto, Compra, CompraDetalle } = require('../models');

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
    res.status(500).json({ error: 'Error al obtener pedidos', det: error.message });
  }
};

exports.createPedido = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { proveedorId, detalles } = req.body;
    
    // Estimate total
    const totalEstimado = detalles.reduce((acc, d) => acc + (d.cantidad_pedida * d.costo_estimado), 0);

    const pedido = await Pedido.create({
      empresaId: req.empresaId,
      proveedorId,
      usuarioId: req.userId,
      total_estimado: totalEstimado
    }, { transaction: t });

    for (let item of detalles) {
      await PedidoDetalle.create({
        pedidoId: pedido.id,
        productoId: item.productoId,
        cantidad_pedida: item.cantidad_pedida,
        costo_estimado: item.costo_estimado
      }, { transaction: t });
    }

    await t.commit();
    res.status(201).json(pedido);
  } catch (error) {
    await t.rollback();
    res.status(400).json({ error: 'Error al crear pedido', det: error.message });
  }
};

exports.checkInPedido = async (req, res) => {
  // Transmutar a Compra real con las cantidades recibidas
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { detalles_recibidos } = req.body; // Array de { productoId, cantidad, costo_unitario }
    
    const pedido = await Pedido.findOne({ where: { id, empresaId: req.empresaId }, transaction: t });
    if (!pedido || pedido.estado !== 'PENDIENTE') {
      throw new Error('Pedido no encontrado o ya procesado');
    }

    const totalReal = detalles_recibidos.reduce((acc, d) => acc + (d.cantidad * d.costo_unitario), 0);

    // 1. Crear Compra
    const compra = await Compra.create({
      empresaId: req.empresaId,
      proveedorId: pedido.proveedorId,
      usuarioId: req.userId,
      total: totalReal
    }, { transaction: t });

    // 2. Crear CompraDetalles y Afectar Stock
    for (let item of detalles_recibidos) {
      if (item.cantidad > 0) {
        await CompraDetalle.create({
          compraId: compra.id,
          productoId: item.productoId,
          cantidad: item.cantidad,
          costo_unitario: item.costo_unitario
        }, { transaction: t });

        // Afectar Stock
        const producto = await Producto.findByPk(item.productoId, { transaction: t });
        if (producto && producto.empresaId == req.empresaId) {
          await producto.update({
            stock_actual: producto.stock_actual + Number(item.cantidad)
          }, { transaction: t });
        }
      }
    }

    // 3. Cerrar Pedido
    await pedido.update({ estado: 'COMPLETADO' }, { transaction: t });

    await t.commit();
    res.status(200).json({ compraId: compra.id, message: 'Recepción completada exitosamente' });

  } catch (error) {
    await t.rollback();
    res.status(400).json({ error: 'Error al procesar la recepción del pedido', det: error.message });
  }
};
