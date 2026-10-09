const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Empresa = sequelize.define('Empresa', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  nit: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  contacto: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  dv: {
    type: DataTypes.STRING(1),
    allowNull: true,
  },
  tipo_persona: {
    type: DataTypes.STRING(1),
    defaultValue: '1', // 1=Juridica, 2=Natural
  },
  regimen_fiscal: {
    type: DataTypes.STRING,
    defaultValue: 'O-48', // O-48 Responsable IVA, R-99-PN No responsable
  },
  direccion_fisica: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  municipio_dane: {
    type: DataTypes.STRING(5),
    allowNull: true,
  },
  departamento_dane: {
    type: DataTypes.STRING(2),
    allowNull: true,
  },
  codigo_ciiu: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  email_facturacion: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  resolucion_numero: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  prefijo_facturacion: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  rango_desde: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  rango_hasta: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  fecha_vigencia_desde: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  fecha_vigencia_hasta: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  clave_tecnica: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  tipo_empresa: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'SIMPLE', // SIMPLE | FACTURACION_ELECTRONICA
  },
  tipo_negocio: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'COMERCIO', // COMERCIO | RESTAURANTE | SERVICIOS (sugiere módulos en el alta)
  },
  // Dinero con el que la empresa empieza en el software; referencia para medir su crecimiento.
  // Propina sugerida al cobrar una cuenta de mesa (%). 0 = no se sugiere.
  propina_sugerida_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 10 },
  // Un faltante al contar por encima de este % del consumo teórico se marca como alerta.
  desviacion_alerta_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 5 },
  // Estaciones de preparación (cada una ve sus comandas) y a quién avisar cuando salta una alerta de desviación.
  // Interruptores de funciones (ver services/opciones.js); solo lo que se cambió, el resto vale su valor por omisión.
  opciones: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  estaciones: { type: DataTypes.JSONB, allowNull: false, defaultValue: ['Cocina'] },
  alerta_whatsapp: { type: DataTypes.STRING(30), allowNull: true },
  alerta_correo: { type: DataTypes.STRING(120), allowNull: true },
  capital_inicial: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: false,
    defaultValue: 0,
  },
  activa: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  }
}, {
  tableName: 'empresas',
  timestamps: true,
});

module.exports = Empresa;
