const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VentaDetalle = sequelize.define('VentaDetalle', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  ventaId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  productoId: {
    type: DataTypes.INTEGER,
    allowNull: true, // Optional if it's a Service
  },
  servicioId: {
    type: DataTypes.INTEGER,
    allowNull: true, // Optional if it's a Product
  },
  cantidad: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  precio_unitario: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  precio_base: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  }
}, {
  tableName: 'ventas_detalles',
  timestamps: false,
});

module.exports = VentaDetalle;
