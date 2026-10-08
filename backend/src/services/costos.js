'use strict';

/**
 * Costo promedio ponderado de un producto tras una entrada de mercancía.
 *   nuevo = (stock × costoActual + cantidad × costoEntrada) / (stock + cantidad)
 * Si no había existencias (o eran negativas) el costo pasa a ser el de la entrada.
 * Se redondea a 4 decimales (la columna es DECIMAL(14,4)).
 */
function promedioPonderado(stock, costoActual, cantidad, costoEntrada) {
  const s = Number(stock);
  const c = Number(cantidad);
  if (!(c > 0)) return Number(costoActual) || 0;
  if (!(s > 0)) return Math.round(Number(costoEntrada) * 10000) / 10000;
  const nuevo = (s * Number(costoActual) + c * Number(costoEntrada)) / (s + c);
  return Math.round(nuevo * 10000) / 10000;
}

/** Margen de un precio con IVA incluido frente a un costo (sin IVA). */
function margen(precioConIva, porcentajeIva, costo) {
  const neto = Number(precioConIva) / (1 + Number(porcentajeIva || 0) / 100);
  const valor = neto - Number(costo);
  return {
    precio_neto: Math.round(neto * 100) / 100,
    margen: Math.round(valor * 100) / 100,
    margen_pct: neto > 0 ? Math.round((valor / neto) * 10000) / 100 : 0,
  };
}

module.exports = { promedioPonderado, margen };
