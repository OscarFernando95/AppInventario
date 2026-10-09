const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Un envío a cocina: los ítems nuevos de una cuenta. PENDIENTE -> LISTA (cocina) -> ENTREGADA (mesero).
const Comanda = sequelize.define('Comanda', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: false },
  cuentaId: { type: DataTypes.INTEGER, allowNull: false },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  estacion: { type: DataTypes.STRING(30), allowNull: true },
  // Tiempo de servicio que cubre la comanda (solo con «Pedir por tiempos»; vacío = todo de una vez).
  tiempo: { type: DataTypes.INTEGER, allowNull: true },
  estado: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'PENDIENTE' },
  enviada_en: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  lista_en: { type: DataTypes.DATE, allowNull: true },
  entregada_en: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'comandas',
  timestamps: false,
});

module.exports = Comanda;
