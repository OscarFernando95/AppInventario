const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DevolucionVentaDetalle = sequelize.define('DevolucionVentaDetalle', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  devolucionId: { type: DataTypes.INTEGER, allowNull: false },
  ventaDetalleId: { type: DataTypes.INTEGER, allowNull: false },
  cantidad: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  reingresada: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
}, {
  tableName: 'devoluciones_venta_detalle',
  timestamps: false,
});

module.exports = DevolucionVentaDetalle;
