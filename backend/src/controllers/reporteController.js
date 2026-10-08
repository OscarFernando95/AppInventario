const { Op } = require('sequelize');
const { Compra, Venta, Gasto } = require('../models');
const TtlCache = require('../utils/ttlCache');
const { cargarProductosConReceta } = require('../services/inventarioDb');
const { analizarProductos } = require('../services/reposicion');
const { resumenCartera } = require('../services/cajaService');

// El dashboard agrega SUM/COUNT sobre ventas y compras; cambia poco entre
// visitas seguidas. Se cachea 60 s por empresa.
const dashboardCache = new TtlCache(Number(process.env.DASHBOARD_CACHE_TTL_MS || 60_000));

exports.invalidateDashboard = (empresaId) => dashboardCache.delete(String(empresaId));

exports.getDashboardData = async (req, res) => {
  const key = String(req.empresaId);
  const cached = dashboardCache.get(key);
  if (cached) return res.json(cached);

  const where = { empresaId: req.empresaId };

  // Rango del mes actual como intervalo [inicio, inicioMesSiguiente): permite
  // usar el índice (empresaId, fecha) en vez de EXTRACT() sobre la columna.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const enMesActual = { fecha: { [Op.gte]: monthStart, [Op.lt]: monthEnd } };

  const [ventasMes, comprasMes, gastosMes, productos] = await Promise.all([
    // Ventas netas: lo vendido menos lo que los clientes devolvieron de esas ventas.
    Venta.findAll({ where: { ...where, estado: 'ACTIVA', ...enMesActual }, attributes: ['total', 'total_devuelto'], raw: true })
      .then((vs) => vs.reduce((a, v) => a + Number(v.total) - Number(v.total_devuelto), 0)),
    Compra.sum('total', { where: { ...where, ...enMesActual } }),
    Gasto.sum('monto', { where: { ...where, estado: 'ACTIVO', ...enMesActual } }),
    cargarProductosConReceta(req.empresaId),
  ]);

  // Alertas de stock mínimo de TODOS los tipos de producto (los más urgentes primero).
  const analisis = analizarProductos(productos);
  const productosBajoStock = productos
    .filter((p) => analisis.get(p.id).alerta)
    .map((p) => ({
      id: p.id,
      nombre_producto: p.nombre_producto,
      tipo: p.tipo,
      unidad_medida: p.unidad_medida,
      stock_actual: Number(p.stock_actual),
      disponible: analisis.get(p.id).disponible,
      stock_minimo: Number(p.stock_minimo),
      estado_stock: analisis.get(p.id).estado,
    }))
    .sort((x, y) => (x.estado_stock !== 'AGOTADO') - (y.estado_stock !== 'AGOTADO') || x.disponible / x.stock_minimo - y.disponible / y.stock_minimo)
    .slice(0, 10);

  const payload = {
    totalProductos: productos.length,
    ventasMes: ventasMes || 0,
    comprasMes: comprasMes || 0,
    gastosMes: gastosMes || 0,
    productosBajoStock,
    // Lo que deben los clientes y lo que se debe a proveedores (solo con esos módulos).
    cartera: (req.empresaModulos?.has('Cuentas por cobrar') || req.empresaModulos?.has('Cuentas por pagar'))
      ? await resumenCartera(req.empresaId) : null,
  };
  dashboardCache.set(key, payload);
  res.json(payload);
};
