const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Precio por horario (happy hour, menú del almuerzo…): un descuento % o un precio fijo en ciertos días y horas.
const PrecioHorario = sequelize.define('PrecioHorario', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  nombre: { type: DataTypes.STRING(80), allowNull: false },
  tipo: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'PORCENTAJE' },
  valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  dias: { type: DataTypes.JSONB, allowNull: false, defaultValue: [0, 1, 2, 3, 4, 5, 6] },
  hora_inicio: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '00:00' },
  hora_fin: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '23:59' },
  producto_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  categoria_ids: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'precios_horario',
  timestamps: true,
});

module.exports = PrecioHorario;
