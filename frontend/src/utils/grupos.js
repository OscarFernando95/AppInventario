/**
 * Grupos de modificadores (lógica pura; espejo de backend/src/services/grupos.js, que es quien manda).
 * Un grupo aplica a un plato si está activo y es «para todos» o el plato está en sus `productoIds`.
 */

/** Grupos que aplican a un plato, en su orden. `grupos` = lo que devuelve GET /api/menu/grupos. */
export function gruposDePlato(plato, grupos) {
  return grupos
    .filter((g) => g.activo !== false && (g.todos || (g.productoIds || []).includes(plato.id)))
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Los modificadores que se ofrecen para un plato, repartidos en sus grupos y los extras sueltos.
 * Los de un grupo que no aplica a este plato no se ofrecen. Devuelve { grupos: [{ grupo, mods }], sueltos: [mods] }.
 */
export function ofertaDeModificadores(plato, modificadores, grupos) {
  const aplicables = gruposDePlato(plato, grupos);
  const ids = new Set(aplicables.map((g) => g.id));
  return {
    grupos: aplicables.map((g) => ({ grupo: g, mods: modificadores.filter((m) => m.grupoId === g.id) })),
    sueltos: modificadores.filter((m) => m.grupoId == null || !grupos.some((g) => g.id === m.grupoId && g.activo !== false)),
    // (un modificador de un grupo que existe pero no aplica a este plato queda fuera de la oferta)
    _aplicables: ids,
  };
}

/** Mensaje con lo que falta (o sobra) frente a los grupos del plato, o null si lo elegido está bien. */
export function problemaDeSeleccion(plato, modificadores, grupos, elegidosIds) {
  const elegidos = modificadores.filter((m) => elegidosIds.includes(m.id));
  for (const g of gruposDePlato(plato, grupos)) {
    const n = elegidos.filter((m) => m.grupoId === g.id).length;
    if (g.obligatorio && n === 0) return `Elige ${g.nombre.toLowerCase()} (obligatorio).`;
    if (g.max_selecciones != null && n > g.max_selecciones) return `En «${g.nombre}» puedes elegir máximo ${g.max_selecciones}.`;
  }
  return null;
}

/** ¿Hay algo que ofrecerle a este plato? Sin grupos, basta con que existan modificadores; con grupos, solo los que le aplican. */
export function hayOferta(plato, modificadores, grupos) {
  if (grupos.length === 0) return modificadores.length > 0;
  const o = ofertaDeModificadores(plato, modificadores, grupos);
  return o.grupos.some((g) => g.mods.length > 0) || o.sueltos.length > 0;
}

/** Texto de lo que falta elegir, o null (para deshabilitar el botón de agregar). Sin grupos no exige nada. */
export const faltaElegir = (plato, modificadores, grupos, valor) => (grupos.length > 0 ? problemaDeSeleccion(plato, modificadores, grupos, valor) : null);
