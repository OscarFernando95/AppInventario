const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Cliente = sequelize.define('Cliente', {
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
  documento: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  telefono: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  direccion: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  tipo_documento: {
    type: DataTypes.STRING,
    defaultValue: '13', // 13=CC, 31=NIT
  },
  dv: {
    type: DataTypes.STRING(1),
    allowNull: true,
  },
  tipo_persona: {
    type: DataTypes.STRING(1),
    defaultValue: '2', // 1=Juridica, 2=Natural
  },
  regimen_fiscal: {
    type: DataTypes.STRING,
    defaultValue: 'R-99-PN', // No responsable de IVA
  },
  municipio_dane: {
    type: DataTypes.STRING(5),
    allowNull: true,
  },
  departamento_dane: {
    type: DataTypes.STRING(2),
    allowNull: true,
  }
}, {
  tableName: 'clientes',
  timestamps: true,
});

module.exports = Cliente;
