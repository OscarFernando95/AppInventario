const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Servicio = sequelize.define('Servicio', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  empresaId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  descripcion: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  precio: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: false,
  },
  porcentaje_iva: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 19.00,
  },
  unidad_medida: {
    type: DataTypes.STRING,
    defaultValue: 'ZZ', // ZZ=Servicios mutuos
  },
  codigo_estandar: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  tableName: 'servicios',
  timestamps: true,
});

module.exports = Servicio;
