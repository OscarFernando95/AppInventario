'use strict';

const { ValidationError } = require('../utils/errors');

const redondear3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const redondear4 = (n) => Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;

/**
 * Convierte una línea de compra/pedido/recepción a la unidad BASE del producto.
 *
 *   - Sin `enPresentacion` la línea ya viene en unidad base: no cambia.
 *   - Con `enPresentacion`, `cantidad` y `costo` vienen en la presentación de
 *     compra (kg, caja…): cantidad_base = cantidad × factor; costo_base = costo / factor.
 *
 * `presentacion` = { unidad, factor } (de la línea del pedido o del producto);
 * sin ella es un error. Devuelve también `costoExacto` (sin redondear a 4
 * decimales) para el cálculo del costo promedio, y la "foto" de la presentación.
 * El TOTAL de la línea no cambia (cantidad × costo es igual en ambas unidades),
 * por eso el llamador lo calcula con los valores originales.
 */
function aUnidadBase({ cantidad, costo, enPresentacion }, presentacion, nombreProducto = 'el producto') {
  if (!enPresentacion) {
    return { cantidad: Number(cantidad), costo: Number(costo), costoExacto: Number(costo), unidad_presentacion: null, factor_presentacion: null };
  }
  const factor = Number(presentacion?.factor);
  if (!presentacion?.unidad || !(factor > 0)) {
    throw new ValidationError(`"${nombreProducto}" no tiene presentación de compra configurada.`);
  }
  const costoExacto = Number(costo) / factor;
  return {
    cantidad: redondear3(Number(cantidad) * factor),
    costo: redondear4(costoExacto),
    costoExacto,
    unidad_presentacion: presentacion.unidad,
    factor_presentacion: factor,
  };
}

/** Presentación configurada en un producto ({ unidad, factor }) o null. */
function presentacionDe(producto) {
  if (!producto?.unidad_compra) return null;
  return { unidad: producto.unidad_compra, factor: Number(producto.factor_compra) };
}

module.exports = { aUnidadBase, presentacionDe };
