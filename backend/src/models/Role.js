const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Role = sequelize.define('Role', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  tipo: {
    type: DataTypes.ENUM('BACKOFFICE_ADMIN', 'FRONT_ADMIN', 'FRONT_USER'),
    allowNull: false,
  }
}, {
  tableName: 'roles',
  timestamps: false,
});

module.exports = Role;
