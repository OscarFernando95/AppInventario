const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ingrediente de un plato (Producto.tipo = 'RECETA'): `cantidad` por 1 porción,
// expresada en la unidad de medida del insumo.
const RecetaItem = sequelize.define('RecetaItem', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  productoId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  insumoId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  cantidad: {
    type: DataTypes.DECIMAL(12, 3),
    allowNull: false,
  },
}, {
  tableName: 'recetas_items',
  timestamps: false,
});

module.exports = RecetaItem;
