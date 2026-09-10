const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Una fila por evento de negocio relevante (no por petición HTTP). La escribe
 * `src/utils/logger.js` cada vez que se llama a logger.info/warn/error, así
 * que no hay que insertar manualmente desde los controladores.
 */
const LogEvento = sequelize.define('LogEvento', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  evento: { type: DataTypes.STRING(80), allowNull: false },
  nivel: { type: DataTypes.STRING(10), allowNull: false },
  metodo: { type: DataTypes.STRING(10), allowNull: true },
  ruta: { type: DataTypes.STRING(255), allowNull: true },
  status_code: { type: DataTypes.INTEGER, allowNull: true },
  usuarioId: { type: DataTypes.INTEGER, allowNull: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: true },
  detalle: { type: DataTypes.JSONB, allowNull: true },
  creado_en: { type: DataTypes.DATE, allowNull: false },
}, {
  tableName: 'logs_eventos',
  timestamps: false,
});

module.exports = LogEvento;
