const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Componente de un combo: `comboId` es el producto COMBO; `productoId`, el plato o producto que incluye (× cantidad).
const ComboItem = sequelize.define('ComboItem', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  comboId: { type: DataTypes.INTEGER, allowNull: false },
  productoId: { type: DataTypes.INTEGER, allowNull: false },
  cantidad: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 1 },
}, {
  tableName: 'combo_items',
  timestamps: false,
});

module.exports = ComboItem;
