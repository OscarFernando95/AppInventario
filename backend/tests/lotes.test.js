const { fechaISO, sumarDias, estadoDeLote, lotesEnExistencia, sugerirProduccion } = require('../src/services/lotes');
const { evaluarEventosDeConteo } = require('../src/services/desviaciones');
const { reserva, reservaUpdate, mesaConfig } = require('../src/schemas/mesaSchemas');
const { cajaRetiro } = require('../src/schemas/cajaSchemas');
const { desviacionesQuery, umbralDesviacion, sugerenciasQuery } = require('../src/schemas/restauranteSchemas');

describe('fechas de lotes', () => {
  it('sumarDias cruza meses y años', () => {
    expect(sumarDias('2026-10-30', 3)).toBe('2026-11-02');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias(new Date(2026, 0, 31, 23, 59), 1)).toBe('2026-02-01');
  });
  it('fechaISO usa la hora local', () => {
    expect(fechaISO(new Date(2026, 9, 8, 23, 30))).toBe('2026-10-08');
  });
  it('estadoDeLote: vigente, por vencer (2 días) y vencido; sin vencimiento siempre vigente', () => {
    expect(estadoDeLote('2026-10-10', '2026-10-08')).toBe('POR_VENCER');
    expect(estadoDeLote('2026-10-11', '2026-10-08')).toBe('VIGENTE');
    expect(estadoDeLote('2026-10-08', '2026-10-08')).toBe('POR_VENCER'); // vence hoy: aún sirve
    expect(estadoDeLote('2026-10-07', '2026-10-08')).toBe('VENCIDO');
    expect(estadoDeLote(null, '2026-10-08')).toBe('VIGENTE');
  });
});

describe('lotesEnExistencia (el stock está en los lotes más nuevos)', () => {
  const lotes = [
    { id: 1, fecha: '2026-10-01T10:00:00', cantidad: 1000, vence_en: '2026-10-04' },
    { id: 2, fecha: '2026-10-05T10:00:00', cantidad: 1000, vence_en: '2026-10-08' },
    { id: 3, fecha: '2026-10-08T08:00:00', cantidad: 1000, vence_en: '2026-10-11' },
  ];

  it('con 1.500 en stock quedan el lote nuevo entero y la mitad del anterior', () => {
    const r = lotesEnExistencia(lotes, 1500, '2026-10-08');
    expect(r.lotes.map((l) => [l.id, l.restante])).toEqual([[2, 500], [3, 1000]]);
    expect(r.vencido).toBe(0);
    expect(r.por_vencer).toBe(500); // el lote 2 vence hoy
  });

  it('con mucho stock aparece lo vencido', () => {
    const r = lotesEnExistencia(lotes, 2600, '2026-10-08');
    expect(r.lotes.map((l) => [l.id, l.restante, l.estado])).toEqual([[1, 600, 'VENCIDO'], [2, 1000, 'POR_VENCER'], [3, 1000, 'VIGENTE']]);
    expect(r.vencido).toBe(600);
  });

  it('sin stock no hay lotes; un stock mayor a lo producido no inventa lotes', () => {
    expect(lotesEnExistencia(lotes, 0).lotes).toEqual([]);
    expect(lotesEnExistencia(lotes, 99999, '2026-10-08').lotes).toHaveLength(3);
  });
});

describe('sugerirProduccion', () => {
  it('promedio diario × días de cobertura − lo que ya hay', () => {
    expect(sugerirProduccion({ stock: 500, consumoTotal: 14000, dias: 14, cobertura: 1 })).toEqual({ promedio_diario: 1000, objetivo: 1000, sugerido: 500 });
    expect(sugerirProduccion({ stock: 0, consumoTotal: 14000, dias: 14, cobertura: 2 }).sugerido).toBe(2000);
  });
  it('si ya alcanza no sugiere nada; sin ventas tampoco', () => {
    expect(sugerirProduccion({ stock: 5000, consumoTotal: 14000, dias: 14 }).sugerido).toBe(0);
    expect(sugerirProduccion({ stock: 0, consumoTotal: 0, dias: 14 })).toEqual({ promedio_diario: 0, objetivo: 0, sugerido: 0 });
  });
  it('redondea hacia arriba a 2 decimales', () => {
    expect(sugerirProduccion({ stock: 0, consumoTotal: 10, dias: 3 }).sugerido).toBe(3.34);
  });
});

describe('evaluarEventosDeConteo (contra el conteo anterior)', () => {
  const base = { id: 1, productoId: 5, fecha: '2026-10-08', previo: '2026-10-01', valor: -400, mermas: 0 };

  it('un faltante sobre el límite es alerta', () => {
    const [e] = evaluarEventosDeConteo([{ ...base, diferencia: -40, consumo_ventas: 300, consumo_produccion: 100 }], 5);
    expect(e).toMatchObject({ faltante: 40, consumo_teorico: 400, desviacion_pct: 10, alerta: true, sin_base: false });
  });
  it('bajo el límite no alerta; justo en el límite sí', () => {
    expect(evaluarEventosDeConteo([{ ...base, diferencia: -4, consumo_ventas: 400, consumo_produccion: 0 }], 5)[0].alerta).toBe(false);
    expect(evaluarEventosDeConteo([{ ...base, diferencia: -20, consumo_ventas: 400, consumo_produccion: 0 }], 5)[0].alerta).toBe(true);
  });
  it('sin conteo anterior no hay base: no calcula porcentaje ni alerta', () => {
    const [e] = evaluarEventosDeConteo([{ ...base, previo: null, diferencia: -40, consumo_ventas: 0, consumo_produccion: 0 }], 5);
    expect(e).toMatchObject({ sin_base: true, desviacion_pct: null, alerta: false, faltante: 40 });
  });
  it('un sobrante no es faltante', () => {
    const [e] = evaluarEventosDeConteo([{ ...base, diferencia: 15, consumo_ventas: 100, consumo_produccion: 0 }], 5);
    expect(e).toMatchObject({ sobrante: 15, faltante: 0, alerta: false, desviacion_pct: null });
  });
});

describe('esquemas nuevos', () => {
  it('reserva: nombre, personas y fecha obligatorios', () => {
    const ok = reserva.safeParse({ nombre: 'Ana', personas: 4, fecha_hora: '2026-10-10T19:30:00.000Z' });
    expect(ok.success).toBe(true);
    expect(ok.data.fecha_hora).toBeInstanceOf(Date);
    expect(reserva.safeParse({ nombre: '', personas: 4, fecha_hora: '2026-10-10T19:30:00Z' }).success).toBe(false);
    expect(reserva.safeParse({ nombre: 'Ana', personas: 0, fecha_hora: '2026-10-10T19:30:00Z' }).success).toBe(false);
    expect(reserva.safeParse({ nombre: 'Ana', personas: 2, fecha_hora: 'mañana' }).success).toBe(false);
  });
  it('reservaUpdate acepta cambiar de estado pero no a SENTADA (eso lo hace «sentar»)', () => {
    expect(reservaUpdate.safeParse({ estado: 'CANCELADA' }).success).toBe(true);
    expect(reservaUpdate.safeParse({ estado: 'SENTADA' }).success).toBe(false);
    expect(reservaUpdate.safeParse({ mesaId: '' }).data.mesaId).toBeNull();
  });
  it('propina sugerida entre 0 y 30; umbral de desviación entre 0 y 100', () => {
    expect(mesaConfig.safeParse({ propina_sugerida_pct: 0 }).success).toBe(true);
    expect(mesaConfig.safeParse({ propina_sugerida_pct: 31 }).success).toBe(false);
    expect(umbralDesviacion.safeParse({ desviacion_alerta_pct: '7.5' }).data.desviacion_alerta_pct).toBe(7.5);
    expect(umbralDesviacion.safeParse({ desviacion_alerta_pct: 101 }).success).toBe(false);
  });
  it('retiro con reparto: partes positivas; modo de desviaciones válido; sugerencias con valores por omisión', () => {
    expect(cajaRetiro.safeParse({ tipo: 'PROPINA', concepto: 'x', monto: 100, reparto: [{ usuarioId: 1, monto: 100 }] }).success).toBe(true);
    expect(cajaRetiro.safeParse({ tipo: 'PROPINA', concepto: 'x', monto: 100, reparto: [{ usuarioId: 1, monto: 0 }] }).success).toBe(false);
    expect(desviacionesQuery.safeParse({ modo: 'conteos' }).success).toBe(true);
    expect(desviacionesQuery.safeParse({ modo: 'otro' }).success).toBe(false);
    expect(sugerenciasQuery.parse({})).toEqual({ dias: 14, cobertura: 1 });
  });
});

describe('totalesPorComensal y ranking de pérdidas', () => {
  const { totalesPorComensal } = require('../src/services/cuentas');
  const { armarRanking } = require('../src/services/desviaciones');
  const { mesaConfig, mesaPesos, mesaPlano, itemAgregar, itemEditar } = require('../src/schemas/mesaSchemas');
  const { umbralDesviacion, rankingQuery } = require('../src/schemas/restauranteSchemas');

  it('suma por persona; lo de todos va al final; lo cobrado no es pendiente; lo anulado no cuenta', () => {
    const t = totalesPorComensal([
      { estado: 'ACTIVO', comensal: 2, cantidad: 1, precio: 5000, ventaId: null },
      { estado: 'ACTIVO', comensal: 1, cantidad: 2, precio: 3000, ventaId: null },
      { estado: 'ACTIVO', comensal: 1, cantidad: 1, precio: 4000, ventaId: 9 },
      { estado: 'ACTIVO', comensal: null, cantidad: 1, precio: 20000, ventaId: null },
      { estado: 'ANULADO', comensal: 2, cantidad: 1, precio: 99999, ventaId: null },
    ]);
    expect(t.map((g) => [g.comensal, g.total, g.pendiente])).toEqual([[1, 10000, 6000], [2, 5000, 5000], [null, 20000, 20000]]);
  });

  it('ranking: faltantes + mermas por producto, de lo que más costó a lo que menos; sobrantes no cuentan', () => {
    const r = armarRanking({
      productos: [{ id: 1, nombre_producto: 'Queso' }, { id: 2, nombre_producto: 'Pan' }, { id: 3, nombre_producto: 'Sal' }],
      ajustes: [
        { productoId: 1, tipo: 'CONTEO', diferencia: -40, valor: -400, num: 2 },
        { productoId: 1, tipo: 'MERMA', diferencia: -10, valor: -100, num: 1 },
        { productoId: 2, tipo: 'VENCIDO', diferencia: -3, valor: -1500, num: 1 },
        { productoId: 3, tipo: 'CONTEO', diferencia: 5, valor: 50, num: 1 },
      ],
    });
    expect(r.filas.map((f) => [f.nombre_producto, f.faltante_valor, f.mermas_valor, f.perdida_total])).toEqual([['Pan', 0, 1500, 1500], ['Queso', 400, 100, 500]]);
    expect(r.totales).toEqual({ faltantes: 400, mermas: 1600, perdida: 2000 });
  });

  it('esquemas: estaciones únicas (1 a 6), pesos y plano en rango, comensal 1–50, contactos válidos', () => {
    expect(mesaConfig.safeParse({ estaciones: ['Cocina', 'Barra'] }).success).toBe(true);
    expect(mesaConfig.safeParse({ estaciones: ['Cocina', 'cocina'] }).success).toBe(false);
    expect(mesaConfig.safeParse({ estaciones: [] }).success).toBe(false);
    expect(mesaConfig.safeParse({}).success).toBe(false);
    expect(mesaPesos.safeParse({ pesos: [{ usuarioId: 1, peso: 1.5 }] }).success).toBe(true);
    expect(mesaPesos.safeParse({ pesos: [{ usuarioId: 1, peso: -1 }] }).success).toBe(false);
    expect(mesaPlano.safeParse({ posiciones: [{ id: 1, x: 10, y: 90 }, { id: 2, x: null, y: null }] }).success).toBe(true);
    expect(mesaPlano.safeParse({ posiciones: [{ id: 1, x: 101, y: 5 }] }).success).toBe(false);
    expect(itemAgregar.parse({ productoId: 1, comensal: '2' }).comensal).toBe(2);
    expect(itemAgregar.safeParse({ productoId: 1, comensal: 0 }).success).toBe(false);
    expect(itemEditar.parse({ comensal: '' }).comensal).toBeNull();
    expect(umbralDesviacion.safeParse({ alerta_whatsapp: '300 111 2233', alerta_correo: 'a@b.co' }).success).toBe(true);
    expect(umbralDesviacion.safeParse({ alerta_correo: 'no-es-correo' }).success).toBe(false);
    expect(umbralDesviacion.safeParse({}).success).toBe(false);
    expect(umbralDesviacion.parse({ alerta_whatsapp: '' }).alerta_whatsapp).toBeNull();
    expect(rankingQuery.safeParse({ mes: '2026-10' }).success).toBe(true);
    expect(rankingQuery.safeParse({ mes: '2026-13' }).success).toBe(false);
  });
});
