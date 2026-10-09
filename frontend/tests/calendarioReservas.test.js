import { describe, it, expect } from 'vitest';
import {
  fechaISOLocal, sumarDiasISO, lunesDe, diasDeSemana, etiquetaDia, tituloSemana, agruparPorDia, aInputLocal, formatoMinutos, textoHace, horaCorta, cuandoCorto,
} from '../src/utils/calendarioReservas';
import { mensajeMesaLista, enlaceWhatsApp } from '../src/utils/avisos';

describe('fechas del calendario de reservas', () => {
  it('suma días cruzando mes y año sin cambiar de día por la hora', () => {
    expect(sumarDiasISO('2026-10-31', 1)).toBe('2026-11-01');
    expect(sumarDiasISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDiasISO('2026-03-01', -1)).toBe('2026-02-28');
    expect(sumarDiasISO('2026-10-09', 0)).toBe('2026-10-09');
  });

  it('la semana va de lunes a domingo', () => {
    // 9 de octubre de 2026 es viernes.
    expect(lunesDe('2026-10-09')).toBe('2026-10-05');
    expect(lunesDe('2026-10-05')).toBe('2026-10-05'); // lunes
    expect(lunesDe('2026-10-11')).toBe('2026-10-05'); // domingo
    expect(diasDeSemana('2026-10-09')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(diasDeSemana('2026-11-01')[0]).toBe('2026-10-26'); // semana que cruza de mes
  });

  it('etiquetas legibles', () => {
    expect(etiquetaDia('2026-10-09')).toMatch(/^vie\.? ?9$|^vie 9$/);
    expect(tituloSemana('2026-10-09')).toMatch(/^5 – 11 oct/);
    expect(tituloSemana('2026-11-01')).toMatch(/^26 oct.* – 1 nov/);
  });

  it('fechaISOLocal usa el día local (no el UTC)', () => {
    expect(fechaISOLocal(new Date(2026, 9, 9, 23, 30))).toBe('2026-10-09');
    expect(fechaISOLocal(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });

  it('valor para datetime-local', () => {
    expect(aInputLocal(new Date(2026, 9, 9, 8, 5))).toBe('2026-10-09T08:05');
  });
});

describe('agruparPorDia', () => {
  const r = (id, d, h, m = 0) => ({ id, nombre: `R${id}`, fecha_hora: new Date(2026, 9, d, h, m).toISOString() });
  const dias = diasDeSemana('2026-10-09');

  it('un grupo por cada día de la semana, aunque esté vacío, con las reservas ordenadas por hora', () => {
    const grupos = agruparPorDia([r(1, 9, 20), r(2, 9, 13), r(3, 5, 12), r(4, 11, 21, 30)], dias);
    expect(grupos.map((g) => g.dia)).toEqual(dias);
    expect(grupos[0].reservas.map((x) => x.id)).toEqual([3]); // lunes
    expect(grupos[1].reservas).toEqual([]);
    expect(grupos[4].reservas.map((x) => x.id)).toEqual([2, 1]); // viernes: 13:00 antes que 20:00
    expect(grupos[6].reservas.map((x) => x.id)).toEqual([4]);
  });

  it('ignora lo que cae fuera de la semana y no se rompe sin reservas', () => {
    expect(agruparPorDia([r(9, 20, 12), r(8, 4, 12)], dias).every((g) => g.reservas.length === 0)).toBe(true);
    expect(agruparPorDia([], dias)).toHaveLength(7);
  });

  it('a la misma hora, por id', () => {
    const g = agruparPorDia([r(7, 9, 12), r(6, 9, 12)], dias)[4];
    expect(g.reservas.map((x) => x.id)).toEqual([6, 7]);
  });

  it('una reserva de las 23:30 queda en su día local', () => {
    expect(agruparPorDia([r(5, 9, 23, 30)], dias)[4].reservas).toHaveLength(1);
  });
});

describe('textos', () => {
  it('formatoMinutos', () => {
    expect(formatoMinutos(0)).toBe('0 min');
    expect(formatoMinutos(45)).toBe('45 min');
    expect(formatoMinutos(60)).toBe('1 h');
    expect(formatoMinutos(65.4)).toBe('1 h 5 min');
    expect(formatoMinutos(undefined)).toBe('0 min');
  });

  it('textoHace', () => {
    expect(textoHace('12 min')).toBe('hace 12 min');
    expect(textoHace('ahora')).toBe('ahora mismo');
  });

  it('horaCorta y cuandoCorto', () => {
    expect(horaCorta(new Date(2026, 9, 9, 14, 30))).toBe('14:30');
    const ref = new Date(2026, 9, 9, 10, 0);
    expect(cuandoCorto(new Date(2026, 9, 9, 18, 5), ref)).toBe('18:05');
    expect(cuandoCorto(new Date(2026, 9, 10, 8, 0), ref)).toMatch(/^10 oct.* 08:00$/);
  });

  it('el aviso de mesa lista para la lista de espera', () => {
    expect(mensajeMesaLista('Ana', 'Café Central')).toBe('Hola Ana, tu mesa en Café Central ya está lista');
    expect(enlaceWhatsApp('3001112233', mensajeMesaLista('Ana', 'Café Central'))).toBe(
      `https://wa.me/573001112233?text=${encodeURIComponent('Hola Ana, tu mesa en Café Central ya está lista')}`,
    );
  });
});
