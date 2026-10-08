const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CompraDetalle = sequelize.define('CompraDetalle', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  compraId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  productoId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  descripcion_gasto: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  cantidad: {
    type: DataTypes.DECIMAL(12, 3), // admite fracciones (kg, litros, metros)
    allowNull: false,
  },
  costo_unitario: {
    type: DataTypes.DECIMAL(14, 4), // por unidad BASE del producto
    allowNull: false,
  },
  // Foto de la presentación en que se compró (cantidad y costo van en unidad base).
  unidad_presentacion: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  factor_presentacion: {
    type: DataTypes.DECIMAL(14, 6),
    allowNull: true,
  }
}, {
  tableName: 'compras_detalles',
  timestamps: false,
});

module.exports = CompraDetalle;
