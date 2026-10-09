/**
 * Alertas de demora en cocina (lógica pura, sin React).
 *
 * Sin la opción «Alertas de demora en cocina» la pantalla se colorea como siempre: amarillo a los 10 minutos y rojo a
 * los 20, sin marcas por plato. Con ella usa los minutos de la empresa y, además, el tiempo objetivo de cada plato:
 * si un plato ya pasó de su objetivo se marca «Demorado +N min» y toda la comanda pasa a rojo.
 */

export const AMARILLO_POR_OMISION = 10;
export const ROJO_POR_OMISION = 20;

/** Minutos completos que lleva esperando una comanda (nunca negativos). */
export const minutosDeEspera = (enviada, ahora) => Math.max(0, Math.floor((ahora - new Date(enviada).getTime()) / 60_000));

/** Umbrales en minutos { amarillo, rojo }: los de la empresa solo con las alertas encendidas. */
export function umbrales({ alertas = false, amarillo, rojo } = {}) {
  if (!alertas) return { amarillo: AMARILLO_POR_OMISION, rojo: ROJO_POR_OMISION };
  return { amarillo: Number(amarillo) > 0 ? Number(amarillo) : AMARILLO_POR_OMISION, rojo: Number(rojo) > 0 ? Number(rojo) : ROJO_POR_OMISION };
}

/**
 * Ítems de una comanda que ya pasaron del tiempo objetivo de su plato: [{ id, minutos }] con los minutos de más.
 * Solo con las alertas encendidas, en comandas aún pendientes y para ítems no anulados con objetivo.
 */
export function itemsDemorados(comanda, ahora, { alertas = false } = {}) {
  if (!alertas || comanda.estado !== 'PENDIENTE' || comanda.cuenta_estado === 'CANCELADA') return [];
  const espera = minutosDeEspera(comanda.enviada_en, ahora);
  return (comanda.items || [])
    .filter((i) => !i.anulado && Number(i.tiempo_objetivo_min) > 0 && espera > Number(i.tiempo_objetivo_min))
    .map((i) => ({ id: i.id, minutos: espera - Number(i.tiempo_objetivo_min) }));
}

/** Tono de la tarjeta: 'verde' | 'amarillo' | 'rojo'. Un plato demorado la pone en rojo aunque el reloj general no. */
export function tonoDeComanda(comanda, ahora, config = {}) {
  const espera = minutosDeEspera(comanda.enviada_en, ahora);
  const { amarillo, rojo } = umbrales(config);
  if (espera >= rojo || itemsDemorados(comanda, ahora, config).length > 0) return 'rojo';
  return espera >= amarillo ? 'amarillo' : 'verde';
}

/** Clases de Tailwind de cada tono (borde y fondo de la tarjeta). */
export const CLASES_TONO = {
  verde: 'border-emerald-200 bg-white',
  amarillo: 'border-amber-300 bg-amber-50',
  rojo: 'border-red-300 bg-red-50',
};
