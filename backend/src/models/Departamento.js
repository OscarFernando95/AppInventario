const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Catálogo estático DANE. Se puebla desde el seeder de catálogos.
const Departamento = sequelize.define('Departamento', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  codigo_dane: { type: DataTypes.STRING(2), allowNull: false, unique: true },
  nombre: { type: DataTypes.STRING, allowNull: false },
}, {
  tableName: 'departamentos',
  timestamps: false,
});

module.exports = Departamento;
