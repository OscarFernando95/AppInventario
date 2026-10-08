const { Op } = require('sequelize');
const { Compra, Venta, Producto, Gasto } = require('../models');
const TtlCache = require('../utils/ttlCache');

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

  const [totalProductos, ventasMes, comprasMes, gastosMes, productosBajoStock] = await Promise.all([
    Producto.count({ where }),
    Venta.sum('total', { where: { ...where, ...enMesActual } }),
    Compra.sum('total', { where: { ...where, ...enMesActual } }),
    Gasto.sum('monto', { where: { ...where, estado: 'ACTIVO', ...enMesActual } }),
    // Platos y preparaciones no tienen stock propio: su disponibilidad es la de sus insumos.
    Producto.findAll({ where: { ...where, tipo: { [Op.notIn]: ['RECETA', 'PREPARACION'] }, stock_actual: { [Op.lt]: 10 } }, limit: 10 }),
  ]);

  const payload = {
    totalProductos,
    ventasMes: ventasMes || 0,
    comprasMes: comprasMes || 0,
    gastosMes: gastosMes || 0,
    productosBajoStock,
  };
  dashboardCache.set(key, payload);
  res.json(payload);
};
