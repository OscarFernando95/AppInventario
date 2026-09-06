const { sequelize, Compra, CompraDetalle, Producto, Proveedor, Usuario } = require('../models');
const { ValidationError } = require('../utils/errors');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

exports.getCompras = async (req, res) => {
  try {
    const compras = await Compra.findAll({
      where: { empresaId: req.empresaId },
      include: [Proveedor, { model: Usuario, attributes: ['nombre'] }, { model: CompraDetalle, include: [Producto] }],
      order: [['fecha', 'DESC']]
    });
    res.json(compras);
  } catch (error) {
    console.error('GET COMPRAS ERROR:', error);
    res.status(500).json({ error: 'Error al obtener compras' });
  }
};

exports.createCompra = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { proveedorId, detalles } = req.body;

    if (!Array.isArray(detalles) || detalles.length === 0) {
      throw new ValidationError('La compra debe incluir al menos un detalle.');
    }

    // El proveedor debe pertenecer a la empresa activa.
    const proveedor = await Proveedor.findOne({
      where: { id: proveedorId, empresaId: req.empresaId },
      transaction: t,
    });
    if (!proveedor) throw new ValidationError('Proveedor inválido');

    // Validar cada detalle y calcular el total en el servidor.
    let totalCalculado = 0;
    for (let item of detalles) {
      const cantidad = Number(item.cantidad);
      const costo = Number(item.costo_unitario);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        throw new ValidationError('Cantidad inválida en un detalle de la compra.');
      }
      if (!Number.isFinite(costo) || costo < 0) {
        throw new ValidationError('Costo unitario inválido en un detalle de la compra.');
      }
      if (item.productoId) {
        const producto = await Producto.findOne({
          where: { id: item.productoId, empresaId: req.empresaId },
          transaction: t,
        });
        if (!producto) throw new ValidationError('Producto inválido en un detalle de la compra.');
      } else if (!item.descripcion_gasto) {
        throw new ValidationError('Detalle de compra inválido (debe ser un producto o un gasto).');
      }
      totalCalculado += cantidad * costo;
    }
    totalCalculado = round2(totalCalculado);

    const compra = await Compra.create({
      empresaId: req.empresaId,
      proveedorId,
      usuarioId: req.userId,
      total: totalCalculado,
    }, { transaction: t });

    for (let item of detalles) {
      const cantidad = Number(item.cantidad);
      if (item.productoId) {
        await CompraDetalle.create({
          compraId: compra.id,
          productoId: item.productoId,
          cantidad,
          costo_unitario: Number(item.costo_unitario),
        }, { transaction: t });

        const producto = await Producto.findByPk(item.productoId, { transaction: t, lock: t.LOCK.UPDATE });
        await producto.update({
          stock_actual: producto.stock_actual + cantidad,
        }, { transaction: t });
      } else {
        await CompraDetalle.create({
          compraId: compra.id,
          descripcion_gasto: item.descripcion_gasto,
          cantidad,
          costo_unitario: Number(item.costo_unitario),
        }, { transaction: t });
      }
    }

    await t.commit();
    res.status(201).json(compra);
  } catch (error) {
    await t.rollback();
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('CREATE COMPRA ERROR:', error);
    return res.status(500).json({ error: 'Error al procesar la compra' });
  }
};
