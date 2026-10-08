'use strict';

/**
 * Cartera (cuentas por cobrar y por pagar): lógica pura, sin base de datos.
 * Las fechas de vencimiento son DÍAS (YYYY-MM-DD, hora local), no instantes.
 */

const { ValidationError } = require('../utils/errors');

const DIA_MS = 24 * 60 * 60 * 1000;
const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const pad = (n) => String(n).padStart(2, '0');
/** YYYY-MM-DD en hora local. */
const aFechaLocal = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Fecha de vencimiento: `dias` después de `base` (hoy por defecto). */
function calcularVencimiento(dias, base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + Number(dias));
  return aFechaLocal(d);
}

/** Días enteros entre dos fechas YYYY-MM-DD (b − a). */
function diasEntre(a, b) {
  const [ya, ma, da] = String(a).slice(0, 10).split('-').map(Number);
  const [yb, mb, db] = String(b).slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DIA_MS);
}

/** Días de mora de una deuda (> 0 vencida, 0 vence hoy, < 0 faltan días). Sin fecha: 0. */
function diasDeMora(fechaVencimiento, hoy = aFechaLocal()) {
  if (!fechaVencimiento) return 0;
  return diasEntre(fechaVencimiento, hoy);
}

/** Tramo de envejecimiento según los días de mora. */
function tramoDeMora(dias) {
  if (dias <= 0) return 'POR_VENCER';
  if (dias <= 30) return 'D1_30';
  if (dias <= 60) return 'D31_60';
  if (dias <= 90) return 'D61_90';
  return 'MAS_90';
}

/**
 * Envejecimiento de cartera. `items` = [{ saldo, fecha_vencimiento }]; solo cuenta saldos > 0.
 * Devuelve el total por tramo, el total general y lo vencido (todo lo que no es POR_VENCER).
 */
function envejecimiento(items, hoy = aFechaLocal()) {
  const r = { POR_VENCER: 0, D1_30: 0, D31_60: 0, D61_90: 0, MAS_90: 0 };
  let cantidad = 0;
  for (const it of items) {
    const saldo = Number(it.saldo);
    if (!(saldo > 0)) continue;
    r[tramoDeMora(diasDeMora(it.fecha_vencimiento, hoy))] += saldo;
    cantidad += 1;
  }
  for (const k of Object.keys(r)) r[k] = redondear2(r[k]);
  const total = redondear2(Object.values(r).reduce((a, n) => a + n, 0));
  return { ...r, total, vencido: redondear2(total - r.POR_VENCER), cantidad };
}

/**
 * Condiciones de pago de una compra (o de la recepción de un pedido). Contado por defecto; a crédito deja una
 * deuda con el proveedor por el total, con su vencimiento. Lanza ValidationError si no corresponde.
 */
function condicionesDeCompra({ forma_pago: forma, dias_credito: dias, pago_desde_caja: desdeCaja }, total, tieneModulo) {
  if (forma !== 'CREDITO') return { forma_pago: 'CONTADO', dias_credito: null, fecha_vencimiento: null, saldo_pendiente: 0 };
  if (!tieneModulo) throw new ValidationError('Para comprar a crédito habilita el módulo "Cuentas por pagar".');
  if (desdeCaja) throw new ValidationError('Una compra a crédito no se paga de la caja al registrarla: se paga después, en Cuentas por pagar.');
  const plazo = dias ?? 30;
  return { forma_pago: 'CREDITO', dias_credito: plazo, fecha_vencimiento: calcularVencimiento(plazo), saldo_pendiente: redondear2(total) };
}

/** ¿El abono / pago cabe en el saldo? (tolerancia de medio centavo por redondeos). */
function cabeEnSaldo(monto, saldo) {
  return Number(monto) > 0 && Number(monto) <= Number(saldo) + 0.005;
}

module.exports = {
  redondear2, aFechaLocal, calcularVencimiento, diasEntre, diasDeMora, tramoDeMora, envejecimiento, cabeEnSaldo, condicionesDeCompra,
};
