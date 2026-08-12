const { sequelize, Compra, CompraDetalle, Producto, Proveedor, Usuario } = require('../models');

exports.getCompras = async (req, res) => {
  try {
    const compras = await Compra.findAll({ 
      where: { empresaId: req.empresaId },
      include: [Proveedor, { model: Usuario, attributes: ['nombre'] }, { model: CompraDetalle, include: [Producto] }],
      order: [['fecha', 'DESC']]
    });
    res.json(compras);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener compras' });
  }
};

exports.createCompra = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { proveedorId, total, detalles } = req.body; 

    const compra = await Compra.create({
      empresaId: req.empresaId,
      proveedorId,
      usuarioId: req.userId,
      total
    }, { transaction: t });

    for (let item of detalles) {
      if (item.productoId) {
        await CompraDetalle.create({
          compraId: compra.id,
          productoId: item.productoId,
          cantidad: item.cantidad,
          costo_unitario: item.costo_unitario
        }, { transaction: t });

        const producto = await Producto.findByPk(item.productoId, { transaction: t });
        if (producto && producto.empresaId == req.empresaId) {
          await producto.update({
            stock_actual: producto.stock_actual + Number(item.cantidad)
          }, { transaction: t });
        } else {
          throw new Error('Producto inválido');
        }
      } else if (item.descripcion_gasto) {
        await CompraDetalle.create({
          compraId: compra.id,
          descripcion_gasto: item.descripcion_gasto,
          cantidad: item.cantidad,
          costo_unitario: item.costo_unitario
        }, { transaction: t });
      } else {
        throw new Error('Detalle de compra inválido (Debe ser un Producto o un Gasto)');
      }
    }

    await t.commit();
    res.status(201).json(compra);
  } catch (error) {
    await t.rollback();
    res.status(400).json({ error: 'Error al procesar compra: ' + error.message });
  }
};
