const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Catálogo estático DANE. `departamento_codigo` referencia
// `departamentos.codigo_dane` por valor (sin FK).
const Municipio = sequelize.define('Municipio', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  codigo_dane: { type: DataTypes.STRING(5), allowNull: false, unique: true },
  nombre: { type: DataTypes.STRING, allowNull: false },
  departamento_codigo: { type: DataTypes.STRING(2), allowNull: false },
}, {
  tableName: 'municipios',
  timestamps: false,
});

module.exports = Municipio;
