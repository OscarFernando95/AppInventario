const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Venta = sequelize.define('Venta', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  empresaId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  usuarioId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  clienteId: {
    type: DataTypes.INTEGER,
    allowNull: true, // Opcional, puede ser un cliente casual sin registro
  },
  // ACTIVA | ANULADA. Una venta anulada se conserva en el historial pero no cuenta en
  // totales, informes, caja ni balance.
  estado: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ACTIVA' },
  anulada_en: { type: DataTypes.DATE, allowNull: true },
  anulada_por: { type: DataTypes.INTEGER, allowNull: true },
  motivo_anulacion: { type: DataTypes.TEXT, allowNull: true },
  // Ventas a crédito: lo que el cliente aún debe y a cuántos días se concedió (fecha_vencimiento = fecha + días).
  saldo_pendiente: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  // Acumulado de lo devuelto por el cliente (devoluciones parciales); la venta original no cambia.
  total_devuelto: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  dias_credito: { type: DataTypes.INTEGER, allowNull: true },
  // Propina voluntaria (cuentas de mesa): NO es ingreso, no suma a `total`; si se pagó en efectivo sí entra a la caja.
  propina: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  // Cuenta de mesa de la que salió esta venta (una cuenta puede dividirse en varias ventas).
  cuentaId: { type: DataTypes.INTEGER, allowNull: true },
  cajaId: {
    type: DataTypes.INTEGER,
    allowNull: true, // solo si la empresa tiene el módulo Caja
  },
  fecha: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  total: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: false,
  },
  descuento_global: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    defaultValue: 0,
  },
  forma_pago: {
    type: DataTypes.STRING,
    defaultValue: '1', // 1=Contado, 2=Crédito
  },
  medio_pago: {
    type: DataTypes.STRING,
    defaultValue: '10', // 10=Efectivo
  },
  fecha_vencimiento: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  subtotal_bruto: {
    type: DataTypes.DECIMAL(14, 2),
    defaultValue: 0,
  },
  total_impuestos: {
    type: DataTypes.DECIMAL(14, 2),
    defaultValue: 0,
  },
  total_descuentos: {
    type: DataTypes.DECIMAL(14, 2),
    defaultValue: 0,
  },
  // ─────────────────────────────────────────────────────────────────────────
  // Facturación electrónica DIAN — NO IMPLEMENTADA.
  // Estos campos son un stub para cuando se integre un proveedor tecnológico
  // (PAC). Hoy `estado_fe` siempre queda en 'NO_EMITIDA' y ningún endpoint lo
  // transiciona. Antes de habilitar la FE hay que auditar: firmado XML,
  // numeración por resolución, concurrencia de consecutivos y almacenaje
  // del XML/PDF. Ver `docs/INFORME_REFACTOR.md` §6.
  // ─────────────────────────────────────────────────────────────────────────
  estado_fe: {
    type: DataTypes.STRING,
    defaultValue: 'NO_EMITIDA', // NO_EMITIDA, EMITIDA, RECHAZADA
  },
  cufe: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  qr_data: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  pdf_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  xml_url: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  tableName: 'ventas',
  timestamps: true,
});

module.exports = Venta;
