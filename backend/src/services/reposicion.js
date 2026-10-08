'use strict';

/**
 * Stock mínimo y reposición (lógica pura, sin base de datos).
 *
 * "Disponible" depende del tipo de producto:
 *   VENTA / INSUMO  -> su stock.
 *   RECETA          -> porciones enteras que se pueden preparar con los ingredientes.
 *   PREPARACION     -> unidades que se pueden producir con los ingredientes (puede ser fraccionario).
 * Un producto tiene alerta si define un mínimo (> 0) y el disponible llegó a él (o se agotó).
 */

const { TIPOS_CON_RECETA, construirMapaRecetas, consumoBase, porcionesDisponibles, redondear3 } = require('./recetas');

const EPS = 1e-9;
// Unidades "medibles" que admiten decimales al pedir (kg, g, lb, oz, L, ml); cajas, bultos, etc. se piden enteros.
const UNIDADES_FRACCIONABLES = ['KGM', 'GRM', 'LBR', 'ONZ', 'LTR', 'MLT'];

/** Unidades (puede ser fraccionario) que se podrían producir con el stock de los ingredientes. */
function unidadesProducibles(consumo, stockPorId) {
  if (!consumo || consumo.size === 0) return 0;
  let min = Infinity;
  for (const [id, por] of consumo) {
    if (!(Number(por) > 0)) return 0;
    min = Math.min(min, Number(stockPorId.get(id) ?? 0) / Number(por));
  }
  return Number.isFinite(min) ? Math.max(0, redondear3(min)) : 0;
}

/** AGOTADO (nada disponible) · BAJO (en o bajo el mínimo) · OK. */
function estadoStock(disponible, minimo) {
  if (disponible <= EPS) return 'AGOTADO';
  if (Number(minimo) > 0 && disponible <= Number(minimo) + EPS) return 'BAJO';
  return 'OK';
}

/** Hasta dónde reponer: el "reponer hasta" configurado, o el doble del mínimo. */
function objetivoDe(p) {
  const objetivo = p.stock_objetivo == null ? 0 : Number(p.stock_objetivo);
  return objetivo > 0 ? objetivo : Number(p.stock_minimo) * 2;
}

/**
 * Analiza todos los productos de una empresa.
 * `productos` = JSON de productos con `receta: [{ insumoId, cantidad }]`.
 * Devuelve Map(id -> { disponible, estado, alerta, consumo }) (`consumo` solo en platos y preparaciones).
 */
function analizarProductos(productos) {
  const recetas = construirMapaRecetas(productos);
  const stockPorId = new Map(productos.map((p) => [p.id, Number(p.stock_actual)]));
  const resultado = new Map();

  for (const p of productos) {
    let disponible;
    let consumo = null;
    if (TIPOS_CON_RECETA.includes(p.tipo)) {
      try { consumo = consumoBase(p.id, recetas, 1); } catch { consumo = new Map(); } // ciclo: dato inconsistente
      disponible = p.tipo === 'RECETA' ? porcionesDisponibles(consumo, stockPorId) : unidadesProducibles(consumo, stockPorId);
    } else {
      disponible = Number(p.stock_actual);
    }
    const estado = estadoStock(disponible, p.stock_minimo);
    resultado.set(p.id, { disponible, estado, alerta: Number(p.stock_minimo) > 0 && estado !== 'OK', consumo });
  }
  return resultado;
}

/** Cantidad a pedir en la presentación de compra (kg, caja…), redondeada hacia arriba. */
function aPresentacionDePedido(sugeridoBase, producto) {
  const factor = Number(producto.factor_compra);
  if (!producto.unidad_compra || !(factor > 0)) return null;
  const bruto = sugeridoBase / factor;
  const cantidad = UNIDADES_FRACCIONABLES.includes(producto.unidad_compra)
    ? Math.ceil(bruto * 100 - 1e-9) / 100
    : Math.ceil(bruto - 1e-9);
  return { cantidad, unidad: producto.unidad_compra, cantidad_base: redondear3(cantidad * factor) };
}

/**
 * Qué pedir. Dos orígenes:
 *   - MINIMO: un producto con stock (venta/insumo) llegó a SU mínimo -> reponer hasta su objetivo.
 *   - PLATOS: un plato o preparación está bajo SU mínimo -> se piden sus ingredientes para llegar a
 *     su objetivo (varios platos que comparten un ingrediente se suman).
 * Los platos y preparaciones no se compran, por eso aparecen como "para" de sus ingredientes.
 */
function calcularReposicion(productos, analisis = analizarProductos(productos)) {
  const requeridoPlatos = new Map(); // ingredienteId -> cantidad necesaria para que los platos bajos lleguen a su objetivo
  const paraPlatos = new Map(); // ingredienteId -> [nombres de platos]

  for (const p of productos) {
    const a = analisis.get(p.id);
    if (!TIPOS_CON_RECETA.includes(p.tipo) || !a.alerta || !a.consumo) continue;
    const objetivo = objetivoDe(p);
    for (const [id, porUnidad] of a.consumo) {
      requeridoPlatos.set(id, (requeridoPlatos.get(id) || 0) + porUnidad * objetivo);
      paraPlatos.set(id, [...(paraPlatos.get(id) || []), p.nombre_producto]);
    }
  }

  const sugerencias = [];
  for (const p of productos) {
    if (TIPOS_CON_RECETA.includes(p.tipo)) continue;
    const stock = Number(p.stock_actual);
    const a = analisis.get(p.id);
    const objetivoPropio = a.alerta ? objetivoDe(p) : 0;
    const objetivoPlatos = requeridoPlatos.get(p.id) || 0;
    const meta = Math.max(objetivoPropio, objetivoPlatos);
    const sugeridoBase = redondear3(meta - stock);
    if (!(sugeridoBase > EPS)) continue;

    sugerencias.push({
      productoId: p.id,
      nombre_producto: p.nombre_producto,
      codigo: p.codigo,
      tipo: p.tipo,
      unidad_medida: p.unidad_medida,
      stock_actual: stock,
      stock_minimo: Number(p.stock_minimo),
      motivo: a.alerta ? 'MINIMO' : 'PLATOS',
      para: [...new Set(paraPlatos.get(p.id) || [])],
      sugerido_base: sugeridoBase,
      pedido: aPresentacionDePedido(sugeridoBase, p),
      costo_estimado: Math.round(sugeridoBase * Number(p.costo_promedio || 0)),
    });
  }
  // Primero lo agotado, luego lo más lejos de su mínimo.
  sugerencias.sort((x, y) => (x.stock_actual > 0) - (y.stock_actual > 0) || y.sugerido_base - x.sugerido_base);
  return sugerencias;
}

module.exports = {
  estadoStock, objetivoDe, unidadesProducibles, analizarProductos, calcularReposicion, aPresentacionDePedido, UNIDADES_FRACCIONABLES,
};
