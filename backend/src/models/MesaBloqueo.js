const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Mesa fuera de servicio entre `desde` y `hasta` (evento, mantenimiento). Se quita con `activo = false`.
const MesaBloqueo = sequelize.define('MesaBloqueo', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  mesaId: { type: DataTypes.INTEGER, allowNull: false },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  desde: { type: DataTypes.DATE, allowNull: false },
  hasta: { type: DataTypes.DATE, allowNull: false },
  motivo: { type: DataTypes.STRING(200), allowNull: true },
  activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'mesa_bloqueos',
  timestamps: true,
});

module.exports = MesaBloqueo;
