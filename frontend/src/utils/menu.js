/**
 * Menú (lógica pura): orden propio, categorías con productos y precio vigente.
 * Los productos traen `categoriaId`, `orden_menu`, `precio_unitario` y, si hay oferta por horario, `precio_vigente`.
 */

const SIN_ORDEN = 1_000_000;

/** Orden del menú: por categoría (en su orden), luego por orden propio dentro de ella y por nombre. Lo sin categoría, al final. */
export function ordenarProductos(productos, categorias = []) {
  const posicion = new Map(categorias.map((c, i) => [c.id, i]));
  const nombre = (p) => (p.nombre_producto ?? p.nombre ?? '');
  return [...productos].sort((a, b) => (
    (posicion.get(a.categoriaId) ?? SIN_ORDEN) - (posicion.get(b.categoriaId) ?? SIN_ORDEN)
    || (a.orden_menu ?? SIN_ORDEN) - (b.orden_menu ?? SIN_ORDEN)
    || nombre(a).localeCompare(nombre(b), 'es')
  ));
}

/**
 * Pestañas de categorías para los productos dados: solo las que tienen algo, en su orden, y «Sin categoría» si hay
 * productos sueltos. Cada una con su cantidad.
 */
export function categoriasConProductos(productos, categorias = []) {
  const cuenta = new Map();
  for (const p of productos) cuenta.set(p.categoriaId ?? null, (cuenta.get(p.categoriaId ?? null) || 0) + 1);
  const conteo = categorias.filter((c) => cuenta.has(c.id)).map((c) => ({ id: c.id, nombre: c.nombre, n: cuenta.get(c.id) }));
  // Productos de una categoría que ya no existe o está inactiva cuentan como sin categoría.
  const conocidas = new Set(categorias.map((c) => c.id));
  const sueltos = productos.filter((p) => p.categoriaId == null || !conocidas.has(p.categoriaId)).length;
  return sueltos > 0 ? [...conteo, { id: null, nombre: 'Sin categoría', n: sueltos }] : conteo;
}

/** Productos de una categoría (`null` = sin categoría, incluida una inactiva); `undefined` = todos. */
export function deCategoria(productos, categoriaId, categorias = []) {
  if (categoriaId === undefined) return productos;
  const conocidas = new Set(categorias.map((c) => c.id));
  return productos.filter((p) => (categoriaId === null ? (p.categoriaId == null || !conocidas.has(p.categoriaId)) : p.categoriaId === categoriaId));
}

/** Precio al que se vende hoy un producto: el de la oferta vigente si la hay, si no el de lista. */
export const precioVigente = (p) => Number(p.precio_vigente ?? p.precio_unitario);
export const tieneOferta = (p) => p.precio_vigente != null && Number(p.precio_vigente) < Number(p.precio_unitario);
