const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Parte de una entrega de propinas (movimiento PROPINA de la caja) que recibió una persona del personal.
const PropinaReparto = sequelize.define('PropinaReparto', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  movimientoId: { type: DataTypes.INTEGER, allowNull: false },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  fecha: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'propina_repartos',
  timestamps: false,
});

module.exports = PropinaReparto;
