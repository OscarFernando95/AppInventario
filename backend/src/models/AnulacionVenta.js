const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Solicitud de anulación de una venta hecha por quien no es administrador.
const AnulacionVenta = sequelize.define('AnulacionVenta', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  ventaId: { type: DataTypes.INTEGER, allowNull: false },
  solicitada_por: { type: DataTypes.INTEGER, allowNull: false },
  motivo: { type: DataTypes.TEXT, allowNull: false },
  estado: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'PENDIENTE' }, // PENDIENTE | APROBADA | RECHAZADA
  resuelta_por: { type: DataTypes.INTEGER, allowNull: true },
  resuelta_en: { type: DataTypes.DATE, allowNull: true },
  comentario: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'anulaciones_venta',
  timestamps: true,
});

module.exports = AnulacionVenta;
