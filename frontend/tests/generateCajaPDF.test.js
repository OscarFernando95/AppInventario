import { describe, it, expect } from 'vitest';
import { generateCajaPDF } from '../src/utils/generateCajaPDF';
import { etiquetaPago } from '../src/utils/mediosPago';

const opts = { autoOpen: false, save: false };

const cajaCerrada = {
  id: 7,
  estado: 'CERRADA',
  fecha_apertura: '2026-10-07T08:00:00.000Z',
  fecha_cierre: '2026-10-07T18:00:00.000Z',
  monto_inicial: '50000.00',
  monto_contado: '148000.00',
  diferencia: '-2000.00',
  observaciones_apertura: 'Turno mañana',
  observaciones_cierre: 'Faltaron 2.000',
  usuario: { nombre: 'Ana' },
  usuarioCierre: { nombre: 'Luis' },
  Empresa: { nombre: 'Café Central', nit: '9001234567', contacto: 'Cra 1 #2-3' },
  resumen: {
    num_ventas: 3, total_ventas: 300000, ventas_efectivo: 100000, abonos_efectivo: 25000, total_egresos: 50000, efectivo_esperado: 125000,
    medios: [
      { forma_pago: '1', medio_pago: '10', num: 1, total: 100000 },
      { forma_pago: '1', medio_pago: '48', num: 1, total: 100000 },
      { forma_pago: '2', medio_pago: '10', num: 1, total: 100000 },
    ],
  },
  abonos: [{ id: 1, ventaId: 1, monto: '25000.00', fecha: '2026-10-07T15:00:00.000Z' }],
  movimientos: [
    { id: 1, tipo: 'RETIRO', concepto: 'Consignación al banco', monto: '20000.00', fecha: '2026-10-07T12:00:00.000Z' },
    { id: 2, tipo: 'GASTO', concepto: 'Domiciliario', monto: '30000.00', fecha: '2026-10-07T13:00:00.000Z' },
  ],
  ventas: [
    { id: 1, fecha: '2026-10-07T09:00:00.000Z', total: '100000.00', forma_pago: '1', medio_pago: '10' },
    { id: 2, fecha: '2026-10-07T10:00:00.000Z', total: '100000.00', forma_pago: '1', medio_pago: '48' },
  ],
};

describe('generateCajaPDF', () => {
  it('genera el cierre y devuelve el nombre de archivo', () => {
    expect(generateCajaPDF(cajaCerrada, opts)).toMatch(/^Cierre_CAJA-0007_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('una caja abierta se imprime como arqueo parcial', () => {
    const abierta = { ...cajaCerrada, estado: 'ABIERTA', fecha_cierre: null, monto_contado: null, diferencia: null, usuarioCierre: null };
    expect(generateCajaPDF(abierta, opts)).toMatch(/^Arqueo_CAJA-0007_/);
  });

  it('imprime los egresos y no falla si no hay movimientos', () => {
    expect(generateCajaPDF(cajaCerrada, opts)).toMatch(/^Cierre_/);
    const { movimientos: _m, ...sinMovs } = cajaCerrada;
    expect(() => generateCajaPDF(sinMovs, opts)).not.toThrow();
    expect(() => generateCajaPDF({ ...cajaCerrada, movimientos: Array.from({ length: 80 }, (_, i) => ({ id: i, tipo: 'GASTO', concepto: `Gasto ${i}`, monto: 100, fecha: '2026-10-07T12:00:00.000Z' })) }, opts)).not.toThrow();
  });

  it('imprime los abonos en efectivo y funciona sin ellos', () => {
    expect(generateCajaPDF(cajaCerrada, opts)).toMatch(/^Cierre_/);
    const { abonos: _a, ...sinAbonos } = cajaCerrada;
    expect(() => generateCajaPDF({ ...sinAbonos, resumen: { ...cajaCerrada.resumen, abonos_efectivo: 0 } }, opts)).not.toThrow();
    expect(() => generateCajaPDF({ ...cajaCerrada, abonos: Array.from({ length: 80 }, (_, i) => ({ id: i, ventaId: i + 1, monto: 100, fecha: '2026-10-07T15:00:00.000Z' })) }, opts)).not.toThrow();
  });

  it('no revienta sin ventas, sin empresa ni observaciones', () => {
    const vacia = { id: 1, estado: 'CERRADA', monto_inicial: 0, monto_contado: 0, diferencia: 0 };
    expect(() => generateCajaPDF(vacia, opts)).not.toThrow();
  });

  it('con muchas ventas pagina sin romperse', () => {
    const ventas = Array.from({ length: 120 }, (_, i) => ({
      id: i + 1, fecha: '2026-10-07T09:00:00.000Z', total: 1000, forma_pago: '1', medio_pago: '10',
    }));
    expect(() => generateCajaPDF({ ...cajaCerrada, ventas }, opts)).not.toThrow();
  });

  it('puede devolver un blob (descarga en lote)', () => {
    const r = generateCajaPDF(cajaCerrada, { ...opts, returnBlob: true });
    expect(r.fileName).toContain('Cierre_CAJA-0007');
    expect(r.blob).toBeInstanceOf(Blob);
  });

  it('exige el objeto de la caja', () => {
    expect(() => generateCajaPDF(null, opts)).toThrow(/falta el objeto/);
  });
});

describe('etiquetaPago', () => {
  it('nombra el medio y marca el crédito', () => {
    expect(etiquetaPago('1', '10')).toBe('Efectivo');
    expect(etiquetaPago('2', '48')).toBe('Crédito (Tarjeta crédito)');
    expect(etiquetaPago('1', '99')).toBe('Medio 99');
  });
});
