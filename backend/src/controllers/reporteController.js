const { sequelize, Compra, Venta, Producto } = require('../models');
const { Op } = require('sequelize');

exports.getDashboardData = async (req, res) => {
  try {
    const totalProductos = await Producto.count({ where: { empresaId: req.empresaId } });
    
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    const currentYear = currentDate.getFullYear();

    const ventasMes = await Venta.sum('total', { 
      where: sequelize.and(
        { empresaId: req.empresaId },
        sequelize.where(sequelize.fn('MONTH', sequelize.col('fecha')), currentMonth),
        sequelize.where(sequelize.fn('YEAR', sequelize.col('fecha')), currentYear)
      )
    });

    const comprasMes = await Compra.sum('total', { 
      where: sequelize.and(
        { empresaId: req.empresaId },
        sequelize.where(sequelize.fn('MONTH', sequelize.col('fecha')), currentMonth),
        sequelize.where(sequelize.fn('YEAR', sequelize.col('fecha')), currentYear)
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
