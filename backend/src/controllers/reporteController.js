const { sequelize, Compra, Venta, Producto } = require('../models');
const { Op } = require('sequelize');

/**
 * Extrae una parte de una fecha (mes/año) de forma compatible con el dialecto activo.
 *
 * PostgreSQL no tiene las funciones MONTH()/YEAR() de MySQL: usa
 *   EXTRACT(MONTH FROM "columna")  /  EXTRACT(YEAR FROM "columna")
 *
 * Se mantiene la rama MySQL para no romper el entorno local mientras se migra
 * (DB_DIALECT=mysql). En Postgres EXTRACT devuelve numeric; la comparación con
 * un entero funciona sin casteo adicional.
 */
const datePart = (part, column) => {
  const p = part.toUpperCase(); // 'MONTH' | 'YEAR'
  if (sequelize.getDialect() === 'postgres') {
    return sequelize.fn('EXTRACT', sequelize.literal(`${p} FROM "${column}"`));
  }
  return sequelize.fn(p, sequelize.col(column));
};

exports.getDashboardData = async (req, res) => {
  try {
    const totalProductos = await Producto.count({ where: { empresaId: req.empresaId } });

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    const currentYear = currentDate.getFullYear();

    const ventasMes = await Venta.sum('total', {
      where: sequelize.and(
        { empresaId: req.empresaId },
        sequelize.where(datePart('month', 'fecha'), currentMonth),
        sequelize.where(datePart('year', 'fecha'), currentYear)
      )
    });

    const comprasMes = await Compra.sum('total', {
      where: sequelize.and(
        { empresaId: req.empresaId },
        sequelize.where(datePart('month', 'fecha'), currentMonth),
        sequelize.where(datePart('year', 'fecha'), currentYear)
      )
    });

    const productosBajoStock = await Producto.findAll({
      where: {
        empresaId: req.empresaId,
        stock_actual: { [Op.lt]: 10 }
      },
      limit: 10
    });

    res.json({
      totalProductos,
      ventasMes: ventasMes || 0,
      comprasMes: comprasMes || 0,
      productosBajoStock
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al generar dashboard: ' + error.message });
  }
};
