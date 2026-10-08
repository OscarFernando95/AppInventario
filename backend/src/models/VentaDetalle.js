const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VentaDetalle = sequelize.define('VentaDetalle', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  ventaId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  productoId: {
    type: DataTypes.INTEGER,
    allowNull: true, // Optional if it's a Service
  },
  servicioId: {
    type: DataTypes.INTEGER,
    allowNull: true, // Optional if it's a Product
  },
  cantidad: {
    type: DataTypes.DECIMAL(12, 3), // admite fracciones (kg, litros, metros)
    allowNull: false,
  },
  precio_unitario: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: false,
  },
  precio_base: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: true,
  },
  porcentaje_iva: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
  },
  valor_iva: {
    type: DataTypes.DECIMAL(14, 2),
    defaultValue: 0,
  },
  subtotal_bruto: {
    type: DataTypes.DECIMAL(14, 2),
    defaultValue: 0,
  },
  // Costo de lo vendido por unidad (foto al vender; base del reporte de rentabilidad).
  costo_unitario: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
  },
  // Inventario que descontó esta línea: [{ productoId, cantidad }] (el producto, o los
  // ingredientes base de un plato). Se usa para devolverlo exacto al anular la venta.
  consumo: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  // Modificadores elegidos en un plato: [{ id, nombre, precio_extra }].
  modificadores: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
}, {
  tableName: 'ventas_detalles',
  timestamps: false,
});

module.exports = VentaDetalle;
