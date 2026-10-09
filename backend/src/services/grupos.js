'use strict';

/**
 * Grupos de modificadores (lógica pura, sin base de datos).
 *
 * Un grupo aplica a un plato si está activo y es «para todos» o el plato está en sus `producto_ids`.
 * Un grupo obligatorio exige elegir al menos un modificador suyo; `max_selecciones` limita cuántos (vacío = sin límite).
 * Los modificadores sin grupo siguen siendo extras sueltos y opcionales, como siempre.
 */

/** Grupos que aplican a un producto, en su orden. `grupos` = [{ id, activo, todos, producto_ids, ... }]. */
function gruposDeProducto(producto, grupos) {
  return grupos
    .filter((g) => g.activo !== false && (g.todos || (g.producto_ids || []).includes(producto.id)))
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Valida lo elegido contra los grupos del plato. `elegidos` = [{ id, grupoId }] (modificadores marcados).
 * Devuelve un mensaje legible con el primer problema, o null si todo está bien.
 */
function validarSeleccion(producto, grupos, elegidos) {
  for (const g of gruposDeProducto(producto, grupos)) {
    const n = elegidos.filter((m) => m.grupoId === g.id).length;
    if (g.obligatorio && n === 0) return `«${producto.nombre_producto || producto.nombre}» necesita que elijas ${g.nombre.toLowerCase()} (obligatorio).`;
    if (g.max_selecciones != null && n > g.max_selecciones) {
      return `En «${g.nombre}» puedes elegir máximo ${g.max_selecciones}.`;
    }
  }
  return null;
}

module.exports = { gruposDeProducto, validarSeleccion };
