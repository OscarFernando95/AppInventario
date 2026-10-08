const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Turno de caja de un usuario. Al cerrar se guarda una "foto" del turno
// (totales y diferencia) que no se recalcula después.
const Caja = sequelize.define('Caja', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  estado: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'ABIERTA', // ABIERTA | CERRADA
  },
  fecha_apertura: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  monto_inicial: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  observaciones_apertura: { type: DataTypes.TEXT, allowNull: true },
  fecha_cierre: { type: DataTypes.DATE, allowNull: true },
  usuarioCierreId: { type: DataTypes.INTEGER, allowNull: true },
  num_ventas: { type: DataTypes.INTEGER, allowNull: true },
  total_ventas: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  abonos_efectivo: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  total_egresos: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  ventas_efectivo: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  efectivo_esperado: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  monto_contado: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  diferencia: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  resumen_medios: { type: DataTypes.JSONB, allowNull: true },
  observaciones_cierre: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'cajas',
  timestamps: true,
});

module.exports = Caja;
