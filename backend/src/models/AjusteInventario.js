const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Movimiento manual de inventario: merma, vencido, consumo interno o conteo físico.
// `diferencia` = nueva - anterior (negativa = pérdida); `valor` = diferencia × costo.
const AjusteInventario = sequelize.define('AjusteInventario', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  productoId: { type: DataTypes.INTEGER, allowNull: false },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  tipo: { type: DataTypes.STRING(20), allowNull: false },
  cantidad_anterior: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  cantidad_nueva: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  diferencia: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  costo_unitario: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  motivo: { type: DataTypes.TEXT, allowNull: true },
  fecha: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'ajustes_inventario',
  timestamps: false,
});

module.exports = AjusteInventario;
