const { rangoOcupacion, calcularOcupacion, minutosEntre, mediana, diasEntre } = require('../src/services/ocupacion');

// Fechas en hora local (como el resto del proyecto): se arman con el constructor local, no con «Z».
const a = (dia, h, m = 0) => new Date(2026, 9, dia, h, m);

describe('rangoOcupacion', () => {
  const hoy = new Date(2026, 9, 9, 15, 0);

  it('por omisión son los últimos 30 días contando hoy', () => {
    expect(rangoOcupacion({}, hoy)).toEqual({ desde: '2026-09-10', hasta: '2026-10-09', dias: 30 });
  });

  it('respeta lo que se pide y completa la fecha que falta', () => {
    expect(rangoOcupacion({ desde: '2026-10-01', hasta: '2026-10-07' }, hoy)).toEqual({ desde: '2026-10-01', hasta: '2026-10-07', dias: 7 });
    expect(rangoOcupacion({ desde: '2026-10-05' }, hoy)).toEqual({ desde: '2026-10-05', hasta: '2026-10-09', dias: 5 });
    expect(rangoOcupacion({ hasta: '2026-10-09' }, hoy).dias).toBe(30);
    expect(rangoOcupacion({ desde: '2026-10-09', hasta: '2026-10-09' }, hoy).dias).toBe(1);
  });

  it('rechaza rangos al revés o demasiado largos', () => {
    expect(() => rangoOcupacion({ desde: '2026-10-08', hasta: '2026-10-01' }, hoy)).toThrow(/no puede ser posterior/);
    expect(() => rangoOcupacion({ desde: '2024-01-01', hasta: '2026-10-01' }, hoy)).toThrow(/366 días/);
  });

  it('cuenta bien los días aunque cruce un cambio de mes', () => {
    expect(diasEntre('2026-09-28', '2026-10-03')).toBe(6);
  });
});

describe('minutosEntre y mediana', () => {
  it('minutos entre apertura y cierre; null si no cuadran', () => {
    expect(minutosEntre(a(1, 12), a(1, 13, 30))).toBe(90);
    expect(minutosEntre(a(1, 12), null)).toBeNull();
    expect(minutosEntre(a(1, 13), a(1, 12))).toBeNull();
  });

  it('mediana de cantidades pares, impares y vacías', () => {
    expect(mediana([])).toBe(0);
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([10, 20, 30, 100])).toBe(25);
  });
});

describe('calcularOcupacion', () => {
  const mesas = [{ id: 1, nombre: 'Mesa 1' }, { id: 2, nombre: 'Mesa 2' }, { id: 3, nombre: 'Mesa 3' }];
  const cuentas = [
    { mesaId: 1, abierta_en: a(5, 12, 0), cerrada_en: a(5, 13, 0) }, // 60
    { mesaId: 1, abierta_en: a(5, 13, 30), cerrada_en: a(5, 14, 30) }, // 60
    { mesaId: 2, abierta_en: a(5, 12, 15), cerrada_en: a(5, 13, 45) }, // 90
    { mesaId: 2, abierta_en: a(6, 19, 0), cerrada_en: a(6, 19, 30) }, // 30
  ];

  it('promedio, mediana, rotación por mesa por día y por mesa', () => {
    const r = calcularOcupacion({ cuentas, mesas, dias: 2 });
    expect(r.general).toEqual({ cuentas: 4, minutos_promedio: 60, minutos_mediana: 60, rotacion_por_mesa_por_dia: 0.67 }); // 4 / (3 mesas × 2 días)
    expect(r.por_mesa.map((m) => [m.nombre, m.cuentas, m.minutos_promedio, m.minutos_total])).toEqual([
      ['Mesa 1', 2, 60, 120],
      ['Mesa 2', 2, 60, 120],
      ['Mesa 3', 0, 0, 0], // sin uso también aparece
    ]);
  });

  it('por hora de llegada, sin huecos entre la primera y la última', () => {
    const r = calcularOcupacion({ cuentas, mesas, dias: 2 });
    expect(r.por_hora[0]).toEqual({ hora: 12, cuentas: 2 });
    expect(r.por_hora.find((h) => h.hora === 13)).toEqual({ hora: 13, cuentas: 1 });
    expect(r.por_hora.find((h) => h.hora === 15)).toEqual({ hora: 15, cuentas: 0 });
    expect(r.por_hora.at(-1)).toEqual({ hora: 19, cuentas: 1 });
    expect(r.por_hora).toHaveLength(8);
  });

  it('ignora las cuentas sin mesa (para llevar) y las de fechas que no cuadran', () => {
    const r = calcularOcupacion({
      cuentas: [...cuentas, { mesaId: null, abierta_en: a(5, 12), cerrada_en: a(5, 12, 5) }, { mesaId: 1, abierta_en: a(5, 15), cerrada_en: null }, { mesaId: 1, abierta_en: a(5, 16), cerrada_en: a(5, 15) }],
      mesas, dias: 2,
    });
    expect(r.general.cuentas).toBe(4);
  });

  it('una mesa que ya no está activa pero tuvo cuentas sigue en el informe con su nombre', () => {
    const r = calcularOcupacion({ cuentas: [{ mesaId: 9, mesaNombre: 'Terraza vieja', abierta_en: a(5, 12), cerrada_en: a(5, 13) }], mesas: [], dias: 1 });
    expect(r.por_mesa).toEqual([{ mesaId: 9, nombre: 'Terraza vieja', cuentas: 1, minutos_promedio: 60, minutos_total: 60 }]);
    expect(r.general.rotacion_por_mesa_por_dia).toBe(1);
  });

  it('sin cuentas todo queda en cero y no divide por cero', () => {
    const r = calcularOcupacion({ cuentas: [], mesas, dias: 30 });
    expect(r.general).toEqual({ cuentas: 0, minutos_promedio: 0, minutos_mediana: 0, rotacion_por_mesa_por_dia: 0 });
    expect(r.por_hora).toEqual([]);
    expect(calcularOcupacion({ cuentas: [], mesas: [], dias: 1 }).por_mesa).toEqual([]);
  });

  it('ordena las mesas por cuentas y luego por nombre natural (Mesa 2 antes que Mesa 10)', () => {
    const muchas = [{ id: 1, nombre: 'Mesa 10' }, { id: 2, nombre: 'Mesa 2' }];
    const r = calcularOcupacion({ cuentas: [], mesas: muchas, dias: 1 });
    expect(r.por_mesa.map((m) => m.nombre)).toEqual(['Mesa 2', 'Mesa 10']);
  });
});
