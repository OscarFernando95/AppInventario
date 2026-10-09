'use strict';

/**
 * Tiempo de ocupación de las mesas, lógica pura: con las cuentas ya cobradas calcula cuánto dura cada mesa ocupada,
 * cuántas veces rota por día y a qué horas llega la gente. Las fechas son en hora local, como el resto del proyecto.
 */

const { fechaISO, sumarDias } = require('./lotes');

const DIAS_POR_OMISION = 30;
const DIAS_MAXIMO = 366;

const redondear = (n, decimales = 0) => {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
};

/** Días (inclusive) entre dos fechas YYYY-MM-DD. */
const diasEntre = (desde, hasta) => Math.round((new Date(`${hasta}T12:00:00`) - new Date(`${desde}T12:00:00`)) / 86_400_000) + 1;

/**
 * Rango consultado: `desde` y `hasta` (YYYY-MM-DD); por omisión los últimos 30 días contando hoy. Con solo una de las
 * dos fechas, la otra se completa (hoy como fin; 30 días antes como inicio). Lanza Error con un mensaje legible si el
 * rango no sirve.
 */
function rangoOcupacion({ desde, hasta } = {}, hoy = new Date()) {
  const fin = hasta || (desde && desde > fechaISO(hoy) ? desde : fechaISO(hoy));
  const ini = desde || sumarDias(fin, -(DIAS_POR_OMISION - 1));
  if (ini > fin) throw new Error('La fecha «desde» no puede ser posterior a «hasta».');
  const dias = diasEntre(ini, fin);
  if (dias > DIAS_MAXIMO) throw new Error(`El rango puede ser de ${DIAS_MAXIMO} días como máximo.`);
  return { desde: ini, hasta: fin, dias };
}

/** Minutos entre dos momentos (null si no tiene sentido: sin cierre o cierre antes de la apertura). */
function minutosEntre(abierta, cerrada) {
  if (!abierta || !cerrada) return null;
  const m = (new Date(cerrada).getTime() - new Date(abierta).getTime()) / 60_000;
  return Number.isFinite(m) && m >= 0 ? m : null;
}

function mediana(valores) {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

/**
 * @param {object} p
 * @param {Array<{mesaId:number, mesaNombre?:string, abierta_en:Date|string, cerrada_en:Date|string}>} p.cuentas cuentas COBRADAS
 * @param {Array<{id:number, nombre:string}>} p.mesas mesas activas (las que no tuvieron cuentas salen con 0)
 * @param {number} p.dias días que abarca el rango
 */
function calcularOcupacion({ cuentas = [], mesas = [], dias = 1 }) {
  const porMesa = new Map(mesas.map((m) => [m.id, { mesaId: m.id, nombre: m.nombre, cuentas: 0, minutos_total: 0 }]));
  const porHora = new Map();
  const duraciones = [];

  for (const c of cuentas) {
    const min = c.mesaId ? minutosEntre(c.abierta_en, c.cerrada_en) : null;
    if (min === null) continue; // para llevar o con fechas que no cuadran: no cuenta como ocupación de mesa
    duraciones.push(min);
    const mesa = porMesa.get(c.mesaId) || { mesaId: c.mesaId, nombre: c.mesaNombre || `Mesa #${c.mesaId}`, cuentas: 0, minutos_total: 0 };
    mesa.cuentas += 1;
    mesa.minutos_total += min;
    porMesa.set(c.mesaId, mesa);
    const h = new Date(c.abierta_en).getHours();
    porHora.set(h, (porHora.get(h) || 0) + 1);
  }

  const total = duraciones.reduce((s, m) => s + m, 0);
  const n = duraciones.length;
  const horas = [...porHora.keys()];
  const desdeHora = horas.length ? Math.min(...horas) : 0;
  const hastaHora = horas.length ? Math.max(...horas) : -1;

  return {
    general: {
      cuentas: n,
      minutos_promedio: n ? redondear(total / n) : 0,
      minutos_mediana: redondear(mediana(duraciones)),
      rotacion_por_mesa_por_dia: porMesa.size && dias > 0 ? redondear(n / (porMesa.size * dias), 2) : 0,
    },
    por_mesa: [...porMesa.values()]
      .map((m) => ({
        mesaId: m.mesaId, nombre: m.nombre, cuentas: m.cuentas,
        minutos_promedio: m.cuentas ? redondear(m.minutos_total / m.cuentas) : 0,
        minutos_total: redondear(m.minutos_total),
      }))
      .sort((a, b) => b.cuentas - a.cuentas || a.nombre.localeCompare(b.nombre, 'es', { numeric: true })),
    // Desde la primera hasta la última hora con llegadas, sin huecos (así las barras no se saltan horas).
    por_hora: Array.from({ length: Math.max(0, hastaHora - desdeHora + 1) }, (_, i) => ({ hora: desdeHora + i, cuentas: porHora.get(desdeHora + i) || 0 })),
  };
}

module.exports = { DIAS_POR_OMISION, DIAS_MAXIMO, rangoOcupacion, calcularOcupacion, minutosEntre, mediana, diasEntre };
