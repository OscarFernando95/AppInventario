const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Grupo de modificadores («Punto de cocción», «Leche»…): obligatorio o no, con un máximo de elecciones.
const GrupoModificador = sequelize.define('GrupoModificador', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  nombre: { type: DataTypes.STRING(60), allowNull: false },
  obligatorio: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  max_selecciones: { type: DataTypes.INTEGER, allowNull: true },
  todos: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'grupos_modificadores',
  timestamps: true,
});

module.exports = GrupoModificador;
