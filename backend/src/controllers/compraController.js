const { sequelize, Compra, CompraDetalle, Producto, Proveedor, Usuario } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { invalidateDashboard } = require('./reporteController');
const { calcularTotalCompra } = require('../services/calculo');

exports.getCompras = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query);
  const where = { empresaId: req.empresaId };

  const total = await Compra.count({ where });
  const compras = await Compra.findAll({
    where,
    include: [Proveedor, { model: Usuario, attributes: ['nombre'] }, { model: CompraDetalle, include: [Producto] }],
    order: [['fecha', 'DESC']],
    limit,
    offset,
  });

  setTotalCount(res, total);
  res.json(compras);
};

exports.createCompra = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { proveedorId, detalles } = req.body;

    const proveedor = await Proveedor.findOne({
      where: { id: proveedorId, empresaId: req.empresaId },
      transaction: t,
    });
    if (!proveedor) throw new ValidationError('Proveedor inválido');

    // Todos los productos referenciados deben ser de esta empresa.
    for (const item of detalles) {
      if (item.productoId) {
        const producto = await Producto.findOne({
          where: { id: item.productoId, empresaId: req.empresaId },
          transaction: t,
        });
        if (!producto) throw new ValidationError('Producto inválido en un detalle de la compra.');
      }
    }

    const total = calcularTotalCompra(
      detalles.map((d) => ({ cantidad: d.cantidad, costoUnitario: d.costo_unitario }))
    );

    const compra = await Compra.create({
      empresaId: req.empresaId,
      proveedorId,
      usuarioId: req.userId,
      total,
    }, { transaction: t });

    await CompraDetalle.bulkCreate(
      detalles.map((d) => ({
        compraId: compra.id,
        productoId: d.productoId || null,
        descripcion_gasto: d.descripcion_gasto || null,
        cantidad: Number(d.cantidad),
        costo_unitario: Number(d.costo_unitario),
      })),
      { transaction: t }
    );

    // Sumar al stock de cada producto (con lock de fila).
    for (const item of detalles) {
      if (!item.productoId) continue;
      const producto = await Producto.findByPk(item.productoId, { transaction: t, lock: t.LOCK.UPDATE });
      await producto.update({ stock_actual: producto.stock_actual + Number(item.cantidad) }, { transaction: t });
    }

    await t.commit();
    invalidateDashboard(req.empresaId);
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
