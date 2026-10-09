'use strict';

/**
 * Lógica pura de cuentas de mesa (sin base de datos).
 */

const EPS = 1e-9;
const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const redondear3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

/** Precio unitario de una línea de la cuenta: precio de lista (IVA incluido) + extras de sus modificadores. */
function precioDeItem(item) {
  const base = Number(item.producto ? item.producto.precio_unitario : item.servicio?.precio || 0);
  const extras = (item.modsDetalle || []).reduce((a, m) => a + Number(m.precio_extra || 0), 0);
  return redondear2(base + extras);
}

/**
 * Qué se cobra y qué queda pendiente. `pendientes` = ítems activos sin cobrar [{ id, cantidad }].
 * `seleccion` = undefined/null (todo) o [{ itemId, cantidad }]: se puede cobrar solo una parte de un ítem
 * (2 cervezas, una la paga cada persona). Devuelve:
 *   cobrar : [{ item, cantidad }]            lo que entra a la venta
 *   partir : [{ item, restante }]             ítems de los que se cobra solo una parte (queda `restante`)
 * Lanza Error('SELECCION') con un mensaje legible si algo no cuadra.
 */
function repartirItems(pendientes, seleccion) {
  if (!seleccion || seleccion.length === 0) {
    return { cobrar: pendientes.map((item) => ({ item, cantidad: Number(item.cantidad) })), partir: [] };
  }
  const porId = new Map(pendientes.map((i) => [i.id, i]));
  const vistos = new Set();
  const cobrar = [];
  const partir = [];
  for (const sel of seleccion) {
    const item = porId.get(sel.itemId);
    if (!item) throw new Error('SELECCION:Uno de los ítems ya se cobró, se anuló o no pertenece a esta cuenta.');
    if (vistos.has(item.id)) throw new Error('SELECCION:Hay ítems repetidos en lo que se va a cobrar.');
    vistos.add(item.id);
    const cantidad = redondear3(sel.cantidad);
    const total = Number(item.cantidad);
    if (!(cantidad > 0)) throw new Error('SELECCION:La cantidad a cobrar debe ser mayor a 0.');
    if (cantidad > total + EPS) throw new Error(`SELECCION:No se pueden cobrar ${cantidad} de un ítem de ${total}.`);
    cobrar.push({ item, cantidad: Math.min(cantidad, total) });
    if (total - cantidad > EPS) partir.push({ item, restante: redondear3(total - cantidad) });
  }
  return { cobrar, partir };
}

/** Totales de una cuenta a partir de sus ítems ya valorados ({ estado, ventaId, cantidad, precio }). */
function totalesDeCuenta(items) {
  const vivos = items.filter((i) => i.estado === 'ACTIVO');
  const sub = (i) => redondear2(Number(i.cantidad) * Number(i.precio));
  const total = redondear2(vivos.reduce((a, i) => a + sub(i), 0));
  const cobrado = redondear2(vivos.filter((i) => i.ventaId).reduce((a, i) => a + sub(i), 0));
  return { total, cobrado, pendiente: redondear2(total - cobrado) };
}

/**
 * Lo que debe cada persona de la mesa: total y pendiente por `comensal` (null = para compartir), con el
 * de cada quien primero. `items` ya valorados ({ estado, ventaId, comensal, cantidad, precio }).
 */
function totalesPorComensal(items) {
  const grupos = new Map();
  for (const i of items.filter((x) => x.estado === 'ACTIVO')) {
    const clave = i.comensal ?? null;
    const g = grupos.get(clave) || { comensal: clave, total: 0, pendiente: 0, items: 0 };
    const sub = redondear2(Number(i.cantidad) * Number(i.precio));
    g.total = redondear2(g.total + sub);
    if (!i.ventaId) { g.pendiente = redondear2(g.pendiente + sub); g.items += 1; }
    grupos.set(clave, g);
  }
  return [...grupos.values()].sort((a, b) => (a.comensal === null) - (b.comensal === null) || a.comensal - b.comensal);
}

/** Propina sugerida: porcentaje sobre el consumo, redondeada al múltiplo de `paso` pesos más cercano. */
function propinaSugerida(base, porcentaje, paso = 100) {
  const bruta = (Number(base) * Number(porcentaje)) / 100;
  return paso > 0 ? Math.round(bruta / paso) * paso : redondear2(bruta);
}

module.exports = { precioDeItem, repartirItems, totalesDeCuenta, totalesPorComensal, propinaSugerida, redondear2, redondear3 };
