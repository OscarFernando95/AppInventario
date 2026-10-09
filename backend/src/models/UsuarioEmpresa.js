const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/** Tabla de unión Usuario <-> Empresa, con el rol propio que el usuario tiene en esa empresa (si tiene). */
const UsuarioEmpresa = sequelize.define('UsuarioEmpresa', {
  empresaId: { type: DataTypes.INTEGER, primaryKey: true },
  usuarioId: { type: DataTypes.INTEGER, primaryKey: true },
  rolEmpresaId: { type: DataTypes.INTEGER, allowNull: true },
  // Peso al repartir propinas (1 = parte normal, 0,5 = media parte, 0 = no recibe).
  propina_peso: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 1 },
}, {
  tableName: 'usuarios_empresas',
  timestamps: true,
});

module.exports = UsuarioEmpresa;
