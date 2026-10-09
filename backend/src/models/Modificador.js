const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Extra o "sin ..." que se elige al vender un plato: suma `precio_extra` y
// ajusta el consumo de ingredientes (ver ModificadorItem).
const Modificador = sequelize.define('Modificador', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  nombre: { type: DataTypes.STRING(100), allowNull: false },
  precio_extra: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  grupoId: { type: DataTypes.INTEGER, allowNull: true }, // grupo al que pertenece (vacío = extra suelto)
  activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'modificadores',
  timestamps: true,
});

module.exports = Modificador;
