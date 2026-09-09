const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Producto = sequelize.define('Producto', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  empresaId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  codigo: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  nombre_producto: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  descripcion: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  stock_actual: {
    type: DataTypes.DECIMAL(12, 3), // admite fracciones (kg, litros, metros)
    allowNull: false,
    defaultValue: 0,
  },
  precio_unitario: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: false,
  },
  porcentaje_iva: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 19.00,
  },
  unidad_medida: {
    type: DataTypes.STRING,
    defaultValue: '94', // 94=Unidad
  },
  codigo_estandar: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  tableName: 'productos',
  timestamps: true,
});

module.exports = Producto;
