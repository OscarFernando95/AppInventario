const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Pago (parcial o total) de un cliente sobre una venta a crédito.
const AbonoVenta = sequelize.define('AbonoVenta', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  ventaId: { type: DataTypes.INTEGER, allowNull: false },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  cajaId: { type: DataTypes.INTEGER, allowNull: true }, // solo abonos en efectivo con módulo Caja
  monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  medio_pago: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '10' },
  fecha: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  nota: { type: DataTypes.TEXT, allowNull: true },
  estado: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ACTIVO' }, // ACTIVO | ANULADO
  anulado_en: { type: DataTypes.DATE, allowNull: true },
  anulado_por: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'abonos_venta',
  timestamps: true,
});

module.exports = AbonoVenta;
