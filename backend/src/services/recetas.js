'use strict';

/**
 * Lógica pura de recetas (sin base de datos).
 *
 * Tipos de producto:
 *   VENTA        producto con stock propio (gaseosa, snack).
 *   INSUMO       ingrediente base: se compra, se gasta en recetas.
 *   PREPARACION  sub-receta (salsa, masa): no se vende ni se compra ni guarda
 *                stock; sus ingredientes se descuentan al vender el plato que
 *                la usa. `rendimiento` = cuánto produce la receta, en la
 *                unidad de medida de la preparación (p. ej. 1000 ml).
 *                Si es "por lotes" (`lote`) tiene stock propio: se produce
 *                aparte y al vender el plato se descuenta ELLA, no sus ingredientes.
 *   RECETA       plato vendible: al venderlo descuenta sus ingredientes.
 *
 * `recetas` = Map(productoId -> { rendimiento, lote, items: [{ insumoId, cantidad }] })
 * solo para RECETA y PREPARACION; cualquier otro id es un ingrediente base.
 */

const TIPOS_PRODUCTO = ['VENTA', 'INSUMO', 'PREPARACION', 'RECETA'];
/** Tipos que tienen receta (y por tanto no llevan stock propio). */
const TIPOS_CON_RECETA = ['RECETA', 'PREPARACION'];
/** Tipos que no se pueden vender directamente en el POS. */
const TIPOS_NO_VENDIBLES = ['INSUMO', 'PREPARACION'];

/** ¿Es una preparación con stock propio (se produce por lotes)? */
const esPorLotes = (p) => p.tipo === 'PREPARACION' && !!p.por_lotes;

const redondear3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

/**
 * Consumo de ingredientes BASE para `factor` unidades de `productoId`
 * (1 porción de un plato; N unidades de una preparación). Expande las
 * sub-recetas de forma recursiva. Devuelve Map(insumoBaseId -> cantidad).
 * `factor` puede ser negativo (modificadores tipo "sin azúcar").
 * Una preparación por lotes cuenta como ingrediente base (tiene stock propio) salvo que
 * sea la raíz y `expandirLote` sea true (así se calcula lo que consume PRODUCIRLA).
 * Lanza Error si hay un ciclo entre recetas.
 */
function consumoBase(productoId, recetas, factor = 1, acc = new Map(), pila = [], expandirLote = false) {
  const receta = recetas.get(productoId);
  if (!receta || (receta.lote && !(expandirLote && pila.length === 0))) {
    acc.set(productoId, (acc.get(productoId) || 0) + factor);
    return acc;
  }
  if (pila.includes(productoId)) throw new Error('CICLO');
  const proporcion = factor / (Number(receta.rendimiento) || 1);
  for (const item of receta.items) {
    consumoBase(item.insumoId, recetas, proporcion * Number(item.cantidad), acc, [...pila, productoId], expandirLote);
  }
  return acc;
}

/**
 * Map de recetas a partir de productos ya cargados ({ id, tipo, rendimiento,
 * receta: [{ insumoId, cantidad }] }). Un plato siempre rinde 1 porción.
 */
function construirMapaRecetas(productos) {
  const mapa = new Map();
  for (const p of productos) {
    if (!TIPOS_CON_RECETA.includes(p.tipo)) continue;
    mapa.set(p.id, {
      rendimiento: p.tipo === 'RECETA' ? 1 : (Number(p.rendimiento) || 1),
      lote: esPorLotes(p),
      items: (p.receta || []).map((i) => ({ insumoId: i.insumoId, cantidad: Number(i.cantidad) })),
    });
  }
  return mapa;
}

/**
 * Consumo por porción de un plato con modificadores aplicados.
 * `modificadores` = [{ items: [{ insumoId, cantidad }] }] — `cantidad` con signo:
 * positiva agrega ("extra shot"), negativa quita ("sin azúcar"). El neto por
 * ingrediente nunca baja de 0.
 */
function consumoConModificadores(platoId, recetas, modificadores = []) {
  const acc = consumoBase(platoId, recetas, 1);
  for (const mod of modificadores) {
    for (const item of mod.items) consumoBase(item.insumoId, recetas, Number(item.cantidad), acc);
  }
  for (const [id, cantidad] of acc) {
    if (cantidad <= 1e-9) acc.delete(id);
  }
  return acc;
}

/** Costo de un consumo: Σ cantidad × costo_promedio del ingrediente. */
function costoDeConsumo(consumo, costoPorId) {
  let total = 0;
  for (const [id, cantidad] of consumo) total += cantidad * Number(costoPorId.get(id) || 0);
  return total;
}

/**
 * Porciones enteras que se pueden preparar con el stock actual.
 * `consumo` = Map(insumoId -> cantidad por porción); `stockPorId` = Map(id -> stock).
 * Sin consumo -> 0.
 */
function porcionesDisponibles(consumo, stockPorId) {
  const entradas = consumo instanceof Map
    ? [...consumo]
    : (consumo || []).map((i) => [i.insumoId, i.cantidad]); // acepta [{insumoId, cantidad}]
  if (entradas.length === 0) return 0;
  let min = Infinity;
  for (const [id, por] of entradas) {
    if (!(Number(por) > 0)) return 0;
    min = Math.min(min, Number(stockPorId.get(id) ?? 0) / Number(por));
  }
  // 1e-9: evita que 0.3 / 0.1 = 2.9999999999999996 se quede en 2 porciones.
  return Number.isFinite(min) ? Math.max(0, Math.floor(min + 1e-9)) : 0;
}

module.exports = {
  TIPOS_PRODUCTO, TIPOS_CON_RECETA, TIPOS_NO_VENDIBLES,
  esPorLotes, redondear3, construirMapaRecetas, consumoBase, consumoConModificadores, costoDeConsumo, porcionesDisponibles,
};
