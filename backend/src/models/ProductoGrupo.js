const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// A qué platos aplica un grupo de modificadores (cuando no es «para todos»).
const ProductoGrupo = sequelize.define('ProductoGrupo', {
  productoId: { type: DataTypes.INTEGER, primaryKey: true },
  grupoId: { type: DataTypes.INTEGER, primaryKey: true },
}, {
  tableName: 'producto_grupos',
  timestamps: false,
});

module.exports = ProductoGrupo;
