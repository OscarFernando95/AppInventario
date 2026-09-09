const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Una fila por inicio de sesión. El `jti` va dentro del JWT; si la fila no
// existe, está revocada o expiró, el token deja de ser válido aunque su firma
// siga siendo correcta.
const Sesion = sequelize.define('Sesion', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  jti: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  user_agent: { type: DataTypes.STRING, allowNull: true },
  ip: { type: DataTypes.STRING(64), allowNull: true },
  creada_en: { type: DataTypes.DATE, allowNull: false },
  ultimo_uso_en: { type: DataTypes.DATE, allowNull: true },
  expira_en: { type: DataTypes.DATE, allowNull: false },
  revocada_en: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'sesiones',
  timestamps: false,
});

module.exports = Sesion;
