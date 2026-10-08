const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Devolución (parcial o total) de productos de una venta. Es un documento aparte: la venta no se modifica.
const DevolucionVenta = sequelize.define('DevolucionVenta', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  ventaId: { type: DataTypes.INTEGER, allowNull: false },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  fecha: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  motivo: { type: DataTypes.TEXT, allowNull: false },
  total: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  credito_reducido: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  dinero_devuelto: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  reembolso: { type: DataTypes.STRING(10), allowNull: true }, // CAJA | OTRO
}, {
  tableName: 'devoluciones_venta',
  timestamps: true,
});

module.exports = DevolucionVenta;
