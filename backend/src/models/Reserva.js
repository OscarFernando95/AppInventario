const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Reserva de mesa. PENDIENTE -> SENTADA (llegaron: se abrió su cuenta) | CANCELADA | NO_LLEGO.
const Reserva = sequelize.define('Reserva', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  mesaId: { type: DataTypes.INTEGER, allowNull: true },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  nombre: { type: DataTypes.STRING(120), allowNull: false },
  telefono: { type: DataTypes.STRING(40), allowNull: true },
  personas: { type: DataTypes.INTEGER, allowNull: false },
  fecha_hora: { type: DataTypes.DATE, allowNull: false },
  nota: { type: DataTypes.TEXT, allowNull: true },
  estado: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'PENDIENTE' },
  cuentaId: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'reservas',
  timestamps: true,
});

module.exports = Reserva;
