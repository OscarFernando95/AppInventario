const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CompraDetalle = sequelize.define('CompraDetalle', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  compraId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  productoId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  descripcion_gasto: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  cantidad: {
    type: DataTypes.DECIMAL(12, 3), // admite fracciones (kg, litros, metros)
    allowNull: false,
  },
  costo_unitario: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: false,
  }
}, {
  tableName: 'compras_detalles',
  timestamps: false,
});

module.exports = CompraDetalle;
