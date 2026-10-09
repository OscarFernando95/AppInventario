/**
 * Fechas y agrupación del calendario de reservas, lógica pura. Todas las fechas son «YYYY-MM-DD» en hora LOCAL
 * (nunca `toISOString()`, que pasa a UTC y cambia el día de noche).
 */

const pad = (n) => String(n).padStart(2, '0');

/** Date local -> «YYYY-MM-DD». */
export const fechaISOLocal = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** «YYYY-MM-DD» -> Date local a mediodía (así un cambio de hora no mueve el día). */
export const aFecha = (iso) => new Date(`${iso}T12:00:00`);

/** Suma (o resta) días a una fecha «YYYY-MM-DD». */
export function sumarDiasISO(iso, dias) {
  const d = aFecha(iso);
  d.setDate(d.getDate() + dias);
  return fechaISOLocal(d);
}

/** Lunes de la semana de la fecha dada (la semana va de lunes a domingo). */
export function lunesDe(iso) {
  const d = aFecha(iso);
  const dow = (d.getDay() + 6) % 7; // lunes = 0
  return sumarDiasISO(iso, -dow);
}

/** Las 7 fechas de la semana (lunes a domingo) que contiene `iso`. */
export function diasDeSemana(iso) {
  const lunes = lunesDe(iso);
  return Array.from({ length: 7 }, (_, i) => sumarDiasISO(lunes, i));
}

/** «lun 12» / «dom 1». */
export function etiquetaDia(iso) {
  const d = aFecha(iso);
  const dia = d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '');
  return `${dia} ${d.getDate()}`;
}

/** «lunes, 12 de octubre» para encabezados. */
export const tituloDia = (iso) => aFecha(iso).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

/** Rango de la semana, «12 – 18 oct» (o «28 sep – 4 oct» si cruza de mes). */
export function tituloSemana(iso) {
  const dias = diasDeSemana(iso);
  const a = aFecha(dias[0]);
  const b = aFecha(dias[6]);
  const mes = (d) => d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
  return a.getMonth() === b.getMonth() ? `${a.getDate()} – ${b.getDate()} ${mes(b)}` : `${a.getDate()} ${mes(a)} – ${b.getDate()} ${mes(b)}`;
}

/**
 * Reservas agrupadas por día para la vista de semana: `[{ dia, reservas }]` con un grupo por cada día de `dias`
 * (aunque no tenga reservas), cada grupo ordenado por hora. Las que quedan fuera de esos días se ignoran.
 */
export function agruparPorDia(reservas, dias) {
  const grupos = new Map(dias.map((d) => [d, []]));
  for (const r of reservas) {
    const g = grupos.get(fechaISOLocal(new Date(r.fecha_hora)));
    if (g) g.push(r);
  }
  return dias.map((dia) => ({ dia, reservas: grupos.get(dia).sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora) || a.id - b.id) }));
}

/** Valor para un `<input type="datetime-local">` (hora local, sin segundos). */
export const aInputLocal = (d) => `${fechaISOLocal(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** «45 min», «1 h», «1 h 5 min» a partir de minutos. */
export function formatoMinutos(min) {
  const m = Math.round(Number(min) || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

/** «hace 12 min» / «ahora mismo» a partir de lo que devuelve `hace()` de useAhora. */
export const textoHace = (tiempo) => (tiempo === 'ahora' ? 'ahora mismo' : `hace ${tiempo}`);

/** Hora «14:30» de una fecha. */
export const horaCorta = (v) => new Date(v).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** «14:30» si es el mismo día que `ref`; si no, «12 oct 14:30». */
export function cuandoCorto(v, ref = new Date()) {
  const d = new Date(v);
  if (d.toDateString() === new Date(ref).toDateString()) return horaCorta(d);
  return `${d.getDate()} ${d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')} ${horaCorta(d)}`;
}
