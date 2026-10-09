const { TIPOS_NO_COMPRABLES } = require('../services/recetas');
const { promedioPonderado } = require('../services/costos');
const { aUnidadBase, presentacionDe } = require('../services/presentacion');
const { sequelize, Compra, CompraDetalle, Producto, Proveedor, Usuario } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { buildListWhere } = require('../utils/listFilters');
const { invalidateDashboard } = require('./reporteController');
const { invalidateInforme } = require('./informeController');
const { calcularTotalCompra } = require('../services/calculo');
const { auditar } = require('../utils/audit');
const { registrarEgreso } = require('../services/cajaService');
const { condicionesDeCompra } = require('../services/cartera');

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
    const { proveedorId, detalles, pago_desde_caja: desdeCaja } = req.body;
    const tieneCartera = !!req.empresaModulos?.has('Cuentas por pagar');
    if (desdeCaja && !req.empresaModulos?.has('Caja')) {
      throw new ValidationError('El módulo "Caja" no está activo: no se puede pagar desde la caja.');
    }

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
      if (TIPOS_NO_COMPRABLES.includes(porId.get(id).tipo)) {
        throw new ValidationError(`"${porId.get(id).nombre_producto}" es un plato, preparación o combo; no se compra (se compran sus ingredientes).`);
      }
    }

    // Cada línea se lleva a la unidad BASE del producto (si se capturó en kg, caja…).
    // El total sale de los valores originales: cantidad × costo no cambia al convertir.
    const lineas = detalles.map((d) => {
      const prod = d.productoId ? porId.get(d.productoId) : null;
      const base = aUnidadBase(
        { cantidad: d.cantidad, costo: d.costo_unitario, enPresentacion: d.en_presentacion },
        presentacionDe(prod),
        prod?.nombre_producto
      );
      return { d, base };
    });

    const total = calcularTotalCompra(
      detalles.map((d) => ({ cantidad: d.cantidad, costoUnitario: d.costo_unitario }))
    );

    // Contado, o a crédito: queda una deuda con el proveedor que se paga en Cuentas por pagar.
    const condiciones = condicionesDeCompra(req.body, total, tieneCartera);

    const compra = await Compra.create({
      empresaId: req.empresaId,
      proveedorId,
      usuarioId: req.userId,
      total,
      ...condiciones,
    }, { transaction: t });

    await CompraDetalle.bulkCreate(
      lineas.map(({ d, base }) => ({
        compraId: compra.id,
        productoId: d.productoId || null,
        descripcion_gasto: d.descripcion_gasto || null,
        cantidad: base.cantidad,
        costo_unitario: base.costo,
        unidad_presentacion: base.unidad_presentacion,
        factor_presentacion: base.factor_presentacion,
      })),
      { transaction: t }
    );

    // Sumar al stock y recalcular el costo promedio (cada línea entra con su propio
    // costo, ya por unidad base).
    for (const { d, base } of lineas) {
      if (!d.productoId) continue;
      const p = porId.get(d.productoId);
      await p.update(
        {
          stock_actual: Number(p.stock_actual) + base.cantidad,
          costo_promedio: promedioPonderado(p.stock_actual, p.costo_promedio, base.cantidad, base.costoExacto),
        },
        { transaction: t }
      );
    }

    // Pagada en efectivo de la caja: queda como egreso del turno (resta del efectivo esperado).
    if (desdeCaja) {
      await registrarEgreso(req, t, { tipo: 'COMPRA', concepto: `Compra #${compra.id} · ${proveedor.nombre}`, monto: total, compraId: compra.id });
    }

    await t.commit();
    invalidateDashboard(req.empresaId);
    invalidateInforme(req.empresaId);
    auditar(req, 'compra_creada', { compraId: compra.id, total, proveedorId: compra.proveedorId, proveedorNombre: proveedor.nombre, pagoDesdeCaja: !!desdeCaja, aCredito: compra.forma_pago === 'CREDITO', diasCredito: compra.dias_credito });
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
