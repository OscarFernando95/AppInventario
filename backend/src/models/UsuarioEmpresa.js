const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/** Tabla de unión Usuario <-> Empresa, con el rol propio que el usuario tiene en esa empresa (si tiene). */
const UsuarioEmpresa = sequelize.define('UsuarioEmpresa', {
  empresaId: { type: DataTypes.INTEGER, primaryKey: true },
  usuarioId: { type: DataTypes.INTEGER, primaryKey: true },
  rolEmpresaId: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'usuarios_empresas',
  timestamps: true,
});

module.exports = UsuarioEmpresa;
