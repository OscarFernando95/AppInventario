'use strict';

/**
 * Precios por horario (lógica pura, sin base de datos).
 *
 * Una regla aplica a un producto si su id está en `producto_ids` o su categoría en `categoria_ids`; con ambas listas
 * vacías aplica a todos. Rige en los `dias` (0 = domingo … 6 = sábado) y entre `hora_inicio` y `hora_fin`
 * («HH:MM»); una franja que cruza la medianoche (22:00–02:00) cuenta para el día en que EMPIEZA.
 */

const aMinutos = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};
const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** ¿La franja de la regla está rigiendo en `ahora`? */
function rigeAhora(regla, ahora = new Date()) {
  const minutos = ahora.getHours() * 60 + ahora.getMinutes();
  const inicio = aMinutos(regla.hora_inicio);
  const fin = aMinutos(regla.hora_fin);
  const dias = regla.dias || [];
  if (inicio <= fin) return dias.includes(ahora.getDay()) && minutos >= inicio && minutos <= fin;
  // Cruza la medianoche: la parte de la noche es del día de inicio; la madrugada, del día anterior.
  if (minutos >= inicio) return dias.includes(ahora.getDay());
  if (minutos <= fin) return dias.includes((ahora.getDay() + 6) % 7);
  return false;
}

/** ¿La regla alcanza a este producto ({ id, categoriaId })? */
function aplicaAProducto(regla, producto) {
  const ps = regla.producto_ids || [];
  const cs = regla.categoria_ids || [];
  if (ps.length === 0 && cs.length === 0) return true;
  return ps.includes(producto.id) || (producto.categoriaId != null && cs.includes(producto.categoriaId));
}

/** Precio que resulta de aplicar una regla a un precio de lista (nunca sube el precio). */
function precioConRegla(regla, precioLista) {
  const lista = Number(precioLista);
  const nuevo = regla.tipo === 'PRECIO_FIJO' ? Number(regla.valor) : lista * (1 - Number(regla.valor) / 100);
  return redondear2(Math.max(0, Math.min(lista, nuevo)));
}

/**
 * La mejor oferta vigente para un producto: la de precio más bajo entre las reglas activas que rigen ahora.
 * Devuelve { precio, promo, reglaId } o null si no hay ninguna (o no rebaja nada).
 */
function promoVigente(producto, reglas, ahora = new Date()) {
  let mejor = null;
  for (const r of reglas) {
    if (r.activo === false || !rigeAhora(r, ahora) || !aplicaAProducto(r, producto)) continue;
    const precio = precioConRegla(r, producto.precio_unitario);
    if (precio < Number(producto.precio_unitario) - 0.005 && (!mejor || precio < mejor.precio)) mejor = { precio, promo: r.nombre, reglaId: r.id };
  }
  return mejor;
}

module.exports = { rigeAhora, aplicaAProducto, precioConRegla, promoVigente, aMinutos };
