/**
 * Unidades de medida (códigos UN/ECE que usa la DIAN en UBL).
 * `corta` es la etiqueta que se muestra junto a una cantidad.
 */
export const UNIDADES = [
  { value: '94', label: '94 - Unidad', corta: 'ud' },
  { value: 'KGM', label: 'KGM - Kilogramos', corta: 'kg' },
  { value: 'GRM', label: 'GRM - Gramos', corta: 'g' },
  { value: 'LBR', label: 'LBR - Libras', corta: 'lb' },
  { value: 'ONZ', label: 'ONZ - Onzas', corta: 'oz' },
  { value: 'LTR', label: 'LTR - Litros', corta: 'L' },
  { value: 'MLT', label: 'MLT - Mililitros', corta: 'ml' },
  { value: 'MTK', label: 'MTK - Metros Cuadrados', corta: 'm²' },
  { value: 'HUR', label: 'HUR - Hora', corta: 'h' },
];

/** Etiqueta corta de una unidad ('GRM' -> 'g'); desconocida/vacía -> 'ud'. */
export const unidadCorta = (codigo) => UNIDADES.find((u) => u.value === codigo)?.corta || 'ud';

/* ───────────── Presentación de compra (comprar en kg, gastar en g) ─────────────
 * El stock, las recetas y el costo promedio van SIEMPRE en la unidad base del
 * producto (`unidad_medida`). La presentación ("1 KGM = 1000 GRM") solo cambia
 * cómo se captura una compra o un pedido; el servidor convierte. El total de
 * una línea (cantidad × costo) es igual en ambas unidades.
 */

// Equivalencias estándar dentro de una misma magnitud (a g / a ml).
const A_UNIDAD_MINIMA = { GRM: 1, KGM: 1000, LBR: 453.592, ONZ: 28.3495, MLT: 1, LTR: 1000 };
const MAGNITUD = { GRM: 'masa', KGM: 'masa', LBR: 'masa', ONZ: 'masa', MLT: 'volumen', LTR: 'volumen' };

/** Factor "1 <compra> = X <base>" si ambas son de la misma magnitud (kg→g = 1000); si no, undefined. */
export const factorEstandar = (base, compra) => {
  if (!MAGNITUD[base] || MAGNITUD[base] !== MAGNITUD[compra]) return undefined;
  return Math.round((A_UNIDAD_MINIMA[compra] / A_UNIDAD_MINIMA[base]) * 1e6) / 1e6;
};

/** Etiqueta de una presentación: 'KGM' -> 'kg'; texto libre ('Caja') se deja igual. */
export const etiquetaPresentacion = (u) => UNIDADES.find((x) => x.value === u)?.corta ?? u ?? '';

/** { unidad, factor } de un producto, o null si compra en su unidad base. */
export const presentacionDe = (producto) => (
  producto?.unidad_compra && Number(producto.factor_compra) > 0
    ? { unidad: producto.unidad_compra, factor: Number(producto.factor_compra) }
    : null
);

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Pasa cantidad y costo de unidad base a presentación (el total no cambia). */
export const aPresentacion = (cantidadBase, costoBase, factor) => ({
  cantidad: r3(Number(cantidadBase) / factor),
  costo: r2(Number(costoBase) * factor),
});

/** Pasa cantidad y costo de presentación a unidad base (el total no cambia). */
export const aUnidadBase = (cantidad, costo, factor) => ({
  cantidad: r3(Number(cantidad) * factor),
  costo: Math.round((Number(costo) / factor + Number.EPSILON) * 10000) / 10000,
});

/**
 * Cómo mostrar una línea ya guardada (compra/pedido): en la presentación en que
 * se capturó si hay "foto", si no en unidad base. `cantidadBase`/`costoBase`
 * son los valores guardados; `unidadBase` el código del producto.
 */
export const lineaVista = ({ cantidadBase, costoBase, unidad_presentacion: unidad, factor_presentacion: factor }, unidadBase) => {
  const f = Number(factor);
  if (unidad && f > 0) {
    const { cantidad, costo } = aPresentacion(cantidadBase, costoBase, f);
    return { cantidad, costo, etiqueta: etiquetaPresentacion(unidad), enPresentacion: true };
  }
  return { cantidad: Number(cantidadBase), costo: Number(costoBase), etiqueta: unidadCorta(unidadBase), enPresentacion: false };
};
