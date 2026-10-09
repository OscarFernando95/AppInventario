const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Un lote de una preparación por lotes: descontó `consumo` (ingredientes) y sumó `cantidad` a su stock.
const Produccion = sequelize.define('Produccion', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  productoId: { type: DataTypes.INTEGER, allowNull: false },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  cantidad: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  costo_unitario: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  costo_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  consumo: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  estado: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ACTIVA' },
  motivo: { type: DataTypes.TEXT, allowNull: true },
  fecha: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  vence_en: { type: DataTypes.DATEONLY, allowNull: true },
  anulada_en: { type: DataTypes.DATE, allowNull: true },
  anulada_por: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'producciones',
  timestamps: false,
});

module.exports = Produccion;
