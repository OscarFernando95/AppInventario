const { sequelize, Compra, CompraDetalle, Producto, Proveedor, Usuario } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { buildListWhere } = require('../utils/listFilters');
const { invalidateDashboard } = require('./reporteController');
const { invalidateInforme } = require('./informeController');
const { calcularTotalCompra } = require('../services/calculo');
const { auditar } = require('../utils/audit');

exports.getCompras = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query);
  const where = {
    empresaId: req.empresaId,
    ...buildListWhere(req.query, { fecha: 'fecha', igualdad: ['proveedorId'] }),
  };

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

    // Un solo SELECT ... FOR UPDATE para todos los productos referenciados.
    const productoIds = [...new Set(detalles.filter((d) => d.productoId).map((d) => d.productoId))];
    const productos = productoIds.length
      ? await Producto.findAll({
          where: { id: productoIds, empresaId: req.empresaId },
          transaction: t,
          lock: t.LOCK.UPDATE,
        })
      : [];
    const porId = new Map(productos.map((p) => [p.id, p]));
    for (const id of productoIds) {
      if (!porId.has(id)) throw new ValidationError('Producto inválido en un detalle de la compra.');
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

    // Sumar al stock (acumulando por producto si aparece en varias líneas).
    const sumaPorProducto = new Map();
    for (const d of detalles) {
      if (!d.productoId) continue;
      sumaPorProducto.set(d.productoId, (sumaPorProducto.get(d.productoId) || 0) + Number(d.cantidad));
    }
    for (const [id, delta] of sumaPorProducto) {
      const p = porId.get(id);
      await p.update({ stock_actual: Number(p.stock_actual) + delta }, { transaction: t });
    }

    await t.commit();
    invalidateDashboard(req.empresaId);
    invalidateInforme(req.empresaId);
    auditar(req, 'compra_creada', { compraId: compra.id, total, proveedorId: compra.proveedorId });
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
