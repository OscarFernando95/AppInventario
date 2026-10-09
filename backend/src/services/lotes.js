'use strict';

/**
 * Lotes de preparaciones (lógica pura, sin base de datos).
 *
 * No se lleva el stock lote por lote: se asume que se gasta primero lo más viejo (FIFO), así que lo que
 * hay hoy en existencia pertenece a los lotes MÁS NUEVOS. Con eso se sabe qué parte del stock ya venció.
 */

const redondear3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const pad = (n) => String(n).padStart(2, '0');

/** YYYY-MM-DD en hora local. */
const fechaISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Fecha (YYYY-MM-DD o Date) más `dias` días, en hora local. */
function sumarDias(fecha, dias) {
  const base = fecha instanceof Date ? new Date(fecha) : new Date(`${fecha}T12:00:00`);
  base.setDate(base.getDate() + Number(dias));
  return fechaISO(base);
}

/** Estado de un lote según su vencimiento: VIGENTE | POR_VENCER (vence en `aviso` días o menos) | VENCIDO. */
function estadoDeLote(venceEn, hoy, aviso = 2) {
  if (!venceEn) return 'VIGENTE';
  if (venceEn < hoy) return 'VENCIDO';
  return venceEn <= sumarDias(hoy, aviso) ? 'POR_VENCER' : 'VIGENTE';
}

/**
 * Qué parte de cada lote sigue en existencia.
 * `lotes` = [{ id, fecha, cantidad, vence_en }] (cualquier orden); `stock` = existencias actuales.
 * Devuelve los lotes con existencias, del más viejo al más nuevo, y lo vencido.
 */
function lotesEnExistencia(lotes, stock, hoy = fechaISO(), aviso = 2) {
  let porAsignar = Math.max(0, Number(stock));
  const nuevosPrimero = [...lotes].sort((a, b) => new Date(b.fecha) - new Date(a.fecha) || b.id - a.id);
  const vivos = [];
  for (const l of nuevosPrimero) {
    if (porAsignar <= 1e-9) break;
    const restante = Math.min(Number(l.cantidad), porAsignar);
    porAsignar -= restante;
    vivos.push({ ...l, cantidad: Number(l.cantidad), restante: redondear3(restante), estado: estadoDeLote(l.vence_en, hoy, aviso) });
  }
  vivos.reverse();
  const suma = (estado) => redondear3(vivos.filter((l) => l.estado === estado).reduce((a, l) => a + l.restante, 0));
  return { lotes: vivos, vencido: suma('VENCIDO'), por_vencer: suma('POR_VENCER') };
}

/**
 * Cuánto producir: lo que se gasta por día (promedio de los últimos `dias`) por los `cobertura` días que se
 * quiere tener cubiertos, menos lo que ya hay. Redondeado hacia arriba a 2 decimales.
 */
function sugerirProduccion({ stock, consumoTotal, dias, cobertura = 1 }) {
  const promedioDiario = dias > 0 ? Number(consumoTotal) / dias : 0;
  const objetivo = promedioDiario * Number(cobertura);
  const falta = Math.max(0, objetivo - Number(stock));
  return {
    promedio_diario: redondear3(promedioDiario),
    objetivo: redondear3(objetivo),
    sugerido: falta > 1e-9 ? Math.ceil(falta * 100 - 1e-9) / 100 : 0,
  };
}

module.exports = { fechaISO, sumarDias, estadoDeLote, lotesEnExistencia, sugerirProduccion };
