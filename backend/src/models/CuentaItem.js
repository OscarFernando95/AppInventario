const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Una línea de lo pedido en una cuenta. El precio no se guarda: se toma del catálogo al mostrar y al cobrar.
const CuentaItem = sequelize.define('CuentaItem', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  cuentaId: { type: DataTypes.INTEGER, allowNull: false },
  productoId: { type: DataTypes.INTEGER, allowNull: true },
  servicioId: { type: DataTypes.INTEGER, allowNull: true },
  cantidad: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  modificadores: { type: DataTypes.JSONB, allowNull: true },
  nota: { type: DataTypes.STRING(200), allowNull: true },
  // Precio de horario (happy hour) con que se pidió el ítem y nombre de la oferta; vacío = precio de lista.
  precio_promo: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  promo: { type: DataTypes.STRING(80), allowNull: true },
  // Persona de la mesa a la que pertenece el ítem (1, 2, 3…); vacío = de todos / para compartir.
  comensal: { type: DataTypes.INTEGER, allowNull: true },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  // Tiempo de servicio al que pertenece el ítem (1..4). Solo se usa con la opción «Pedir por tiempos»; si no, siempre 1.
  tiempo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  comandaId: { type: DataTypes.INTEGER, allowNull: true },
  estado: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ACTIVO' },
  motivo_anulacion: { type: DataTypes.STRING(300), allowNull: true },
  anulado_por: { type: DataTypes.INTEGER, allowNull: true },
  ventaId: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'cuenta_items',
  timestamps: true,
  updatedAt: false,
});

module.exports = CuentaItem;
