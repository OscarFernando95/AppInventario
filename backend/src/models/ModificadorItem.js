const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// `cantidad` con signo: positiva agrega ingrediente, negativa lo quita.
const ModificadorItem = sequelize.define('ModificadorItem', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  modificadorId: { type: DataTypes.INTEGER, allowNull: false },
  insumoId: { type: DataTypes.INTEGER, allowNull: false },
  cantidad: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
}, {
  tableName: 'modificadores_items',
  timestamps: false,
});

module.exports = ModificadorItem;
