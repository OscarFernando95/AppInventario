const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Cuenta abierta de una mesa (o "para llevar", sin mesa y con etiqueta). Se cobra al final, en una o
// varias ventas; ABIERTA -> COBRADA (todo lo pedido ya está cobrado) | CANCELADA.
const Cuenta = sequelize.define('Cuenta', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  mesaId: { type: DataTypes.INTEGER, allowNull: true },
  etiqueta: { type: DataTypes.STRING(80), allowNull: true },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  // A nombre de un cliente y/o de una referencia libre (habitación, grupo): solo con la opción «Cuenta a nombre de».
  clienteId: { type: DataTypes.INTEGER, allowNull: true },
  referencia: { type: DataTypes.STRING(80), allowNull: true },
  comensales: { type: DataTypes.INTEGER, allowNull: true },
  nota: { type: DataTypes.TEXT, allowNull: true },
  estado: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ABIERTA' },
  abierta_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  cerrada_en: { type: DataTypes.DATE, allowNull: true },
  motivo_cancelacion: { type: DataTypes.TEXT, allowNull: true },
  cancelada_por: { type: DataTypes.INTEGER, allowNull: true },
  // Pedir por tiempos: hasta qué tiempo (1 = entrada, 2 = plato fuerte…) ya se disparó. Solo tiene efecto con la opción encendida.
  tiempo_actual: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
}, {
  tableName: 'cuentas',
  timestamps: true,
});

module.exports = Cuenta;
