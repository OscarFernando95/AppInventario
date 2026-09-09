const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Catálogo estático CIIU Rev. 4 A.C. Se puebla desde el seeder de catálogos.
const ActividadCiiu = sequelize.define('ActividadCiiu', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  codigo: { type: DataTypes.STRING(4), allowNull: false, unique: true },
  descripcion: { type: DataTypes.TEXT, allowNull: false },
  division: { type: DataTypes.STRING(2), allowNull: true },
  seccion: { type: DataTypes.STRING(1), allowNull: true },
}, {
  tableName: 'actividades_ciiu',
  timestamps: false,
});

module.exports = ActividadCiiu;
