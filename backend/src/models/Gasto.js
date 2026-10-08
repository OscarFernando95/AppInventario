const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Gasto operativo (recibos, arriendo, nómina…). No exige proveedor. Un gasto
// anulado deja de contar en totales y balances.
const Gasto = sequelize.define('Gasto', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  proveedorId: { type: DataTypes.INTEGER, allowNull: true },
  categoria: { type: DataTypes.STRING(20), allowNull: false },
  descripcion: { type: DataTypes.STRING(255), allowNull: false },
  monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  fecha: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  origen_pago: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'OTRO' }, // CAJA | OTRO
  estado: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ACTIVO' }, // ACTIVO | ANULADO
  anulado_en: { type: DataTypes.DATE, allowNull: true },
  anulado_por: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'gastos',
  timestamps: true,
});

module.exports = Gasto;
