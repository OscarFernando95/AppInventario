const {
  aFechaLocal, calcularVencimiento, diasEntre, diasDeMora, tramoDeMora, envejecimiento, cabeEnSaldo,
} = require('../src/services/cartera');

describe('fechas de cartera', () => {
  it('aFechaLocal usa la hora LOCAL (no la UTC)', () => {
    expect(aFechaLocal(new Date(2026, 9, 7, 21, 43))).toBe('2026-10-07'); // 9 pm en Colombia = 2 am UTC del 8
    expect(aFechaLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('calcularVencimiento suma días calendario, cruzando mes y año', () => {
    expect(calcularVencimiento(30, new Date(2026, 9, 7, 23, 59))).toBe('2026-11-06');
    expect(calcularVencimiento(0, new Date(2026, 9, 7))).toBe('2026-10-07');
    expect(calcularVencimiento(60, new Date(2026, 11, 15))).toBe('2027-02-13');
    expect(calcularVencimiento(1, new Date(2028, 1, 28))).toBe('2028-02-29'); // bisiesto
  });

  it('diasEntre / diasDeMora: positivo = vencida, negativo = faltan días', () => {
    expect(diasEntre('2026-10-01', '2026-10-31')).toBe(30);
    expect(diasDeMora('2026-10-01', '2026-10-11')).toBe(10);
    expect(diasDeMora('2026-10-11', '2026-10-11')).toBe(0);
    expect(diasDeMora('2026-10-20', '2026-10-11')).toBe(-9);
    expect(diasDeMora(null, '2026-10-11')).toBe(0);
    expect(diasDeMora('2026-10-01T00:00:00.000Z', '2026-10-11')).toBe(10); // tolera fechas ISO
  });
});

describe('tramos de mora', () => {
  it('por vencer, 1-30, 31-60, 61-90 y más de 90', () => {
    expect(tramoDeMora(-5)).toBe('POR_VENCER');
    expect(tramoDeMora(0)).toBe('POR_VENCER'); // vence hoy: todavía al día
    expect(tramoDeMora(1)).toBe('D1_30');
    expect(tramoDeMora(30)).toBe('D1_30');
    expect(tramoDeMora(31)).toBe('D31_60');
    expect(tramoDeMora(60)).toBe('D31_60');
    expect(tramoDeMora(61)).toBe('D61_90');
    expect(tramoDeMora(90)).toBe('D61_90');
    expect(tramoDeMora(91)).toBe('MAS_90');
  });

  it('envejecimiento suma por tramo, separa lo vencido e ignora saldos en 0', () => {
    const hoy = '2026-10-31';
    const r = envejecimiento([
      { saldo: 100000, fecha_vencimiento: '2026-11-15' }, // por vencer
      { saldo: 50000, fecha_vencimiento: '2026-10-31' }, // vence hoy
      { saldo: 20000.5, fecha_vencimiento: '2026-10-21' }, // 10 días
      { saldo: 30000, fecha_vencimiento: '2026-09-11' }, // 50 días
      { saldo: 10000, fecha_vencimiento: '2026-08-01' }, // 91 días
      { saldo: 0, fecha_vencimiento: '2026-01-01' }, // pagada: no cuenta
    ], hoy);
    expect(r).toMatchObject({ POR_VENCER: 150000, D1_30: 20000.5, D31_60: 30000, D61_90: 0, MAS_90: 10000, cantidad: 5 });
    expect(r.total).toBe(210000.5);
    expect(r.vencido).toBe(60000.5);
    expect(envejecimiento([]).total).toBe(0);
  });
});

describe('cabeEnSaldo', () => {
  it('acepta hasta el saldo (con tolerancia de redondeo) y rechaza lo mayor o no positivo', () => {
    expect(cabeEnSaldo(100, 100)).toBe(true);
    expect(cabeEnSaldo(100.004, 100)).toBe(true);
    expect(cabeEnSaldo(100.01, 100)).toBe(false);
    expect(cabeEnSaldo(0, 100)).toBe(false);
    expect(cabeEnSaldo(-5, 100)).toBe(false);
  });
});
