const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Pago (parcial o total) a un proveedor sobre una compra a crédito.
const PagoCompra = sequelize.define('PagoCompra', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  compraId: { type: DataTypes.INTEGER, allowNull: false },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  origen: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'OTRO' }, // CAJA | OTRO
  fecha: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  nota: { type: DataTypes.TEXT, allowNull: true },
  estado: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ACTIVO' },
  anulado_en: { type: DataTypes.DATE, allowNull: true },
  anulado_por: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'pagos_compra',
  timestamps: true,
});

module.exports = PagoCompra;
