const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/** Rol propio de una empresa: qué permisos tiene y a qué módulos accede (modulos NULL = todos). */
const RolEmpresa = sequelize.define('RolEmpresa', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  nombre: { type: DataTypes.STRING(80), allowNull: false },
  descripcion: { type: DataTypes.STRING(300), allowNull: true },
  permisos: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  modulos: { type: DataTypes.JSONB, allowNull: true },
}, {
  tableName: 'roles_empresa',
  timestamps: true,
});

module.exports = RolEmpresa;
