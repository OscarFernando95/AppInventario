const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Modulo = sequelize.define('Modulo', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  nombre_codigo: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  descripcion: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  tableName: 'modulos',
  timestamps: false,
});

module.exports = Modulo;
