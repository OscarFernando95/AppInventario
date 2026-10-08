const { Op } = require('sequelize');
const { sequelize, Venta, VentaDetalle, Compra, CompraDetalle, Producto, Cliente, Proveedor } = require('../models');
const TtlCache = require('../utils/ttlCache');

/**
 * Referencia cualificada y entrecomillada a "tabla"."columna" (comillas de
 * Postgres). Necesaria dentro de sequelize.literal(), donde Sequelize no
 * entrecomilla por nosotros.
 */
const qcol = (table, column) => `"${table}"."${column}"`;

// Un informe con el mismo rango y tipo se repite mucho al navegar. Se cachea
// 60 s por empresa; una venta/compra nueva limpia la caché de esa empresa.
const cachePorEmpresa = new Map(); // empresaId -> TtlCache
const INFORME_TTL_MS = Number(process.env.INFORME_CACHE_TTL_MS || 60_000);

function cacheDe(empresaId) {
  let c = cachePorEmpresa.get(empresaId);
  if (!c) {
    c = new TtlCache(INFORME_TTL_MS);
    cachePorEmpresa.set(empresaId, c);
  }
  return c;
}

exports.invalidateInforme = (empresaId) => {
  const c = cachePorEmpresa.get(Number(empresaId));
  if (c) c.clear();
};

async function generar(tipo, whereVenta, whereCompra) {
  switch (tipo) {
    case 'ventas_resumen':
      return Venta.findAll({
        where: whereVenta,
        include: [{ model: Cliente, attributes: ['nombre', 'documento'] }, VentaDetalle],
        order: [['fecha', 'DESC']],
      });

    case 'compras_resumen':
      return Compra.findAll({
        where: whereCompra,
        include: [{ model: Proveedor, attributes: ['nombre', 'nit'] }, { model: CompraDetalle, include: [Producto] }],
        order: [['fecha', 'DESC']],
      });

    case 'top_productos':
      return VentaDetalle.findAll({
        attributes: [
          'productoId',
          [sequelize.col('Producto.nombre_producto'), 'nombre_producto'],
          // Neto de devoluciones: lo devuelto no cuenta como vendido.
          [sequelize.fn('SUM', sequelize.literal(`${qcol('VentaDetalle', 'cantidad')} - ${qcol('VentaDetalle', 'cantidad_devuelta')}`)), 'total_vendido'],
          [sequelize.fn('SUM', sequelize.literal(
            `(${qcol('VentaDetalle', 'cantidad')} - ${qcol('VentaDetalle', 'cantidad_devuelta')}) * ${qcol('VentaDetalle', 'precio_unitario')}`
          )), 'ingreso_total'],
        ],
        include: [{ model: Venta, attributes: [], where: whereVenta }, { model: Producto, attributes: [] }],
        group: ['productoId', 'Producto.nombre_producto'],
        order: [[sequelize.col('total_vendido'), 'DESC']],
        raw: true,
      });

    case 'top_clientes':
      return Venta.findAll({
        where: whereVenta,
        attributes: [
          'clienteId',
          [sequelize.col('Cliente.nombre'), 'nombre_cliente'],
          [sequelize.fn('COUNT', sequelize.col('Venta.id')), 'total_compras'],
          [sequelize.fn('SUM', sequelize.literal(`${qcol('Venta', 'total')} - ${qcol('Venta', 'total_devuelto')}`)), 'dinero_gastado'],
        ],
        include: [{ model: Cliente, attributes: [] }],
        group: ['clienteId', 'Cliente.nombre'],
        order: [[sequelize.col('dinero_gastado'), 'DESC']],
        raw: true,
      });

    case 'top_proveedores':
      return Compra.findAll({
        where: whereCompra,
        attributes: [
          'proveedorId',
          [sequelize.col('Proveedor.nombre'), 'nombre_prov'],
          [sequelize.col('Proveedor.nit'), 'nit_prov'],
          [sequelize.fn('COUNT', sequelize.col('Compra.id')), 'total_ordenes'],
          [sequelize.fn('SUM', sequelize.col('total')), 'dinero_invertido'],
        ],
        include: [{ model: Proveedor, attributes: [] }],
        group: ['proveedorId', 'Proveedor.nombre', 'Proveedor.nit'],
        order: [[sequelize.col('dinero_invertido'), 'DESC']],
        raw: true,
      });

    default:
      return null; // `informeQuery` (zod) ya restringe `tipo`; esto no debería ocurrir
  }
}

exports.getInforme = async (req, res) => {
  const { tipo, start, end } = req.query; // validado por informeQuery

  const key = `${tipo}|${start}|${end}`;
  const cache = cacheDe(req.empresaId);
  const cached = cache.get(key);
  if (cached) return res.json(cached);

  // Interpretar las fechas en la hora local del servidor (TZ), no en UTC:
  // "2026-09-01" .. "2026-09-30" = del inicio del 1 al final del 30, hora local.
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T23:59:59.999`);

  const whereVenta = { empresaId: req.empresaId, estado: 'ACTIVA', fecha: { [Op.between]: [startDate, endDate] } };
  const whereCompra = { empresaId: req.empresaId, fecha: { [Op.between]: [startDate, endDate] } };

  const data = await generar(tipo, whereVenta, whereCompra);
  if (data === null) return res.status(400).json({ error: 'Tipo de informe no válido' });

  cache.set(key, data);
  res.json(data);
};
