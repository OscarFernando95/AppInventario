const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Egreso de una caja. Todos son salidas de efectivo: los ingresos de la caja
// solo entran por ventas.
const CajaMovimiento = sequelize.define('CajaMovimiento', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  cajaId: { type: DataTypes.INTEGER, allowNull: false },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  tipo: { type: DataTypes.STRING(10), allowNull: false }, // RETIRO | GASTO | COMPRA
  concepto: { type: DataTypes.STRING(255), allowNull: false },
  monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  fecha: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  gastoId: { type: DataTypes.INTEGER, allowNull: true },
  compraId: { type: DataTypes.INTEGER, allowNull: true },
  ventaId: { type: DataTypes.INTEGER, allowNull: true }, // DEVOLUCION de una venta anulada
  pagoId: { type: DataTypes.INTEGER, allowNull: true }, // PAGO_PROV: pago a un proveedor desde la caja
}, {
  tableName: 'caja_movimientos',
  timestamps: false,
});

module.exports = CajaMovimiento;
