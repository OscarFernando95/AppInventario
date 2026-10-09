const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Cliente sin reserva que espera mesa. ESPERANDO -> SENTADO (se le abrió cuenta) | CANCELADO | NO_LLEGO.
const ListaEspera = sequelize.define('ListaEspera', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  nombre: { type: DataTypes.STRING(120), allowNull: false },
  telefono: { type: DataTypes.STRING(40), allowNull: true },
  personas: { type: DataTypes.INTEGER, allowNull: false },
  nota: { type: DataTypes.TEXT, allowNull: true },
  estado: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ESPERANDO' },
  cuentaId: { type: DataTypes.INTEGER, allowNull: true },
  creada_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  atendida_en: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'lista_espera',
  timestamps: true,
});

module.exports = ListaEspera;
