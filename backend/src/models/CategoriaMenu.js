const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Categoría del menú (Entradas, Bebidas calientes…): agrupa los productos en el catálogo del mesero y del mostrador.
const CategoriaMenu = sequelize.define('CategoriaMenu', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  nombre: { type: DataTypes.STRING(60), allowNull: false },
  orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'categorias_menu',
  timestamps: true,
});

module.exports = CategoriaMenu;
