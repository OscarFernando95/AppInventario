const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Compra = sequelize.define('Compra', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  empresaId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  proveedorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  usuarioId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  pedidoId: {
    type: DataTypes.INTEGER,
    allowNull: true, // solo cuando la compra proviene de la recepción de un pedido
  },
  fecha: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  total: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: false,
  }
}, {
  tableName: 'compras',
  timestamps: true,
});

module.exports = Compra;
