const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Mesa (o puesto de barra) del local. Se desactiva en vez de borrarse: sus cuentas pasadas la referencian.
const Mesa = sequelize.define('Mesa', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  nombre: { type: DataTypes.STRING(60), allowNull: false },
  capacidad: { type: DataTypes.INTEGER, allowNull: true },
  // Posición en el plano del local (% del ancho y del alto); vacío = sin ubicar.
  pos_x: { type: DataTypes.INTEGER, allowNull: true },
  pos_y: { type: DataTypes.INTEGER, allowNull: true },
  activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'mesas',
  timestamps: true,
});

module.exports = Mesa;
