const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Cuenta abierta de una mesa (o "para llevar", sin mesa y con etiqueta). Se cobra al final, en una o
// varias ventas; ABIERTA -> COBRADA (todo lo pedido ya está cobrado) | CANCELADA.
const Cuenta = sequelize.define('Cuenta', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  mesaId: { type: DataTypes.INTEGER, allowNull: true },
  etiqueta: { type: DataTypes.STRING(80), allowNull: true },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  comensales: { type: DataTypes.INTEGER, allowNull: true },
  nota: { type: DataTypes.TEXT, allowNull: true },
  estado: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ABIERTA' },
  abierta_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  cerrada_en: { type: DataTypes.DATE, allowNull: true },
  motivo_cancelacion: { type: DataTypes.TEXT, allowNull: true },
  cancelada_por: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'cuentas',
  timestamps: true,
});

module.exports = Cuenta;
