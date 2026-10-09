'use strict';

/**
 * Bloqueo de mesas, lógica pura (sin base de datos): cuándo un bloqueo está vigente, si cruza un rango y cómo se le dice
 * a la persona. Un bloqueo es `{ desde, hasta, motivo, activo }`; vale entre `desde` (incluido) y `hasta` (excluido).
 */

const HORAS_AVISO = 3; // el tablero avisa un bloqueo que empieza en menos de este tiempo

const ms = (v) => new Date(v).getTime();

/** ¿Está en vigor ahora mismo? */
const estaVigente = (b, ahora = Date.now()) => b.activo !== false && ms(b.desde) <= ms(ahora) && ms(ahora) < ms(b.hasta);

/** ¿Se cruza con el rango [desde, hasta)? */
const cruzaRango = (b, desde, hasta) => b.activo !== false && ms(b.desde) < ms(hasta) && ms(desde) < ms(b.hasta);

/** ¿Dos fechas caen el mismo día (hora local)? */
const mismoDia = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

const hora = (v) => new Date(v).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const diaYHora = (v) => `${new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })} ${hora(v)}`;

/** «14:30» si es hoy (respecto de `ref`), «12 oct 14:30» si es otro día. */
const cuando = (v, ref = Date.now()) => (mismoDia(v, ref) ? hora(v) : diaYHora(v));

/** «La mesa Mesa 1 está bloqueada hasta 14:30 (Evento privado)». */
function textoBloqueo(nombreMesa, b, ahora = Date.now()) {
  return `La mesa ${nombreMesa} está bloqueada hasta ${cuando(b.hasta, ahora)}${b.motivo ? ` (${b.motivo})` : ''}.`;
}

/** Para una reserva que cae dentro de un bloqueo: «La mesa Mesa 1 está bloqueada de 12:00 a 14:30 (Evento privado)». */
function textoBloqueoReserva(nombreMesa, b, ref) {
  return `La mesa ${nombreMesa} está bloqueada de ${cuando(b.desde, ref)} a ${cuando(b.hasta, ref)}${b.motivo ? ` (${b.motivo})` : ''}.`;
}

/**
 * El bloqueo que debe mostrar la tarjeta de una mesa: el vigente ahora o, si no hay, el que empieza en menos de
 * `HORAS_AVISO` horas (el más próximo). Devuelve `{ id, desde, hasta, motivo, vigente }` o null.
 */
function bloqueoParaTablero(bloqueos, ahora = Date.now()) {
  const t = ms(ahora);
  const candidatos = bloqueos
    .filter((b) => b.activo !== false && ms(b.hasta) > t && ms(b.desde) <= t + HORAS_AVISO * 3_600_000)
    .sort((a, b) => ms(a.desde) - ms(b.desde));
  const elegido = candidatos.find((b) => estaVigente(b, t)) || candidatos[0];
  if (!elegido) return null;
  return { id: elegido.id, desde: elegido.desde, hasta: elegido.hasta, motivo: elegido.motivo || null, vigente: estaVigente(elegido, t) };
}

module.exports = { HORAS_AVISO, estaVigente, cruzaRango, textoBloqueo, textoBloqueoReserva, bloqueoParaTablero };
