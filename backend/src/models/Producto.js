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
  },
  // VENTA: producto con stock propio. INSUMO: ingrediente (se compra, no se
  // vende). PREPARACION: sub-receta. RECETA: plato; al venderlo descuenta los
  // ingredientes de su receta.
  tipo: {
    type: DataTypes.STRING(15),
    allowNull: false,
    defaultValue: 'VENTA',
  },
  // Costo por unidad base (promedio ponderado de las compras). En platos y
  // preparaciones no se usa: su costo se calcula desde la receta.
  costo_promedio: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
  },
  // Alerta de reposición: 0 = sin alerta. Se compara con el stock (producto, insumo), las porciones
  // que se pueden preparar (plato) o las unidades que se pueden producir (preparación).
  stock_minimo: {
    type: DataTypes.DECIMAL(12, 3),
    allowNull: false,
    defaultValue: 0,
  },
  // Hasta dónde reponer cuando se llega al mínimo (vacío = el doble del mínimo).
  stock_objetivo: {
    type: DataTypes.DECIMAL(12, 3),
    allowNull: true,
  },
  // Presentación de compra: "1 <unidad_compra> = <factor_compra> unidades base"
  // (p. ej. KGM -> 1000 con unidad base GRM). Sin unidad_compra se compra en la unidad base.
  unidad_compra: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  factor_compra: {
    type: DataTypes.DECIMAL(14, 6),
    allowNull: false,
    defaultValue: 1,
  },
  // Solo PREPARACION: cuánto produce la receta, en la unidad de medida del producto.
  rendimiento: {
    type: DataTypes.DECIMAL(12, 3),
    allowNull: false,
    defaultValue: 1,
  },
}, {
  tableName: 'productos',
  timestamps: true,
});

module.exports = Producto;
