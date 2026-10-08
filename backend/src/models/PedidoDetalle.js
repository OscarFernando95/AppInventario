const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PedidoDetalle = sequelize.define('PedidoDetalle', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  pedidoId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  productoId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  cantidad_pedida: {
    type: DataTypes.DECIMAL(12, 3), // admite fracciones (kg, litros, metros)
    allowNull: false,
  },
  cantidad_recibida: {
    type: DataTypes.DECIMAL(12, 3), // acumulado entre recepciones parciales
    allowNull: false,
    defaultValue: 0,
  },
  costo_estimado: {
    type: DataTypes.DECIMAL(14, 4), // por unidad BASE del producto
    allowNull: false,
  },
  // Foto de la presentación en que se pidió (cantidades y costo van en unidad base).
  unidad_presentacion: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  factor_presentacion: {
    type: DataTypes.DECIMAL(14, 6),
    allowNull: true,
  }
}, {
  tableName: 'pedidos_detalles',
  timestamps: false,
});

module.exports = PedidoDetalle;
