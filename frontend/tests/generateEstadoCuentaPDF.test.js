import { describe, it, expect } from 'vitest';
import { generateEstadoCuentaPDF } from '../src/utils/generateEstadoCuentaPDF';

const empresa = { nombre: 'Café Central', nit: '9001234567', contacto: 'Cra 1 #2-3' };
const opts = { autoOpen: false, save: false };

const porCobrar = {
  cliente: { id: 1, nombre: 'Ana Gómez', documento: '123456789', telefono: '3001234567' },
  cupo_credito: 500000, cupo_disponible: 150000,
  total_credito: 600000, total_abonado: 250000, saldo: 350000, vencido: 100000,
  ventas: [
    { id: 4, fecha: '2026-09-01T10:00:00.000Z', fecha_vencimiento: '2026-10-01', total: 400000, abonado: 250000, saldo_pendiente: 150000, dias_mora: 7, vencida: true,
      abonos: [{ id: 1, fecha: '2026-09-10T10:00:00.000Z', monto: 250000, medio_pago: '47', nota: 'Transferencia', usuario: 'Ana' }] },
    { id: 9, fecha: '2026-10-05T10:00:00.000Z', fecha_vencimiento: '2026-11-04', total: 200000, abonado: 0, saldo_pendiente: 200000, dias_mora: -27, vencida: false, abonos: [] },
  ],
};
const porPagar = {
  proveedor: { id: 2, nombre: 'Molinos del Valle', nit: '800111222' },
  total_credito: 300000, total_pagado: 100000, saldo: 200000, vencido: 0,
  compras: [{ id: 3, fecha: '2026-10-01T10:00:00.000Z', fecha_vencimiento: '2026-10-31', total: 300000, pagado: 100000, saldo_pendiente: 200000, dias_mora: -23, vencida: false,
    pagos: [{ id: 5, fecha: '2026-10-03T10:00:00.000Z', monto: 100000, origen: 'CAJA', nota: null }] }],
};

describe('generateEstadoCuentaPDF', () => {
  it('estado de cuenta de un cliente: nombre de archivo con el cliente', () => {
    expect(generateEstadoCuentaPDF('COBRAR', porCobrar, empresa, opts)).toMatch(/^EstadoCuenta_Cliente_Ana_G.mez_\d{4}-\d{2}-\d{2}\.pdf$/u);
  });

  it('estado de cuenta de un proveedor', () => {
    expect(generateEstadoCuentaPDF('PAGAR', porPagar, empresa, opts)).toMatch(/^EstadoCuenta_Proveedor_Molinos_del_Valle_/);
  });

  it('no revienta sin movimientos, sin cupo ni empresa', () => {
    const vacio = { cliente: { nombre: 'Sin deudas' }, cupo_credito: null, total_credito: 0, total_abonado: 0, saldo: 0, vencido: 0, ventas: [] };
    expect(() => generateEstadoCuentaPDF('COBRAR', vacio, null, opts)).not.toThrow();
    expect(() => generateEstadoCuentaPDF('PAGAR', { proveedor: { nombre: 'P' }, compras: [], saldo: 0, total_credito: 0, total_pagado: 0, vencido: 0 }, empresa, opts)).not.toThrow();
  });

  it('con muchos documentos y abonos pagina sin romperse y puede devolver un blob', () => {
    const ventas = Array.from({ length: 70 }, (_, i) => ({
      id: i + 1, fecha: '2026-09-01T10:00:00.000Z', fecha_vencimiento: '2026-10-01', total: 1000, abonado: 500, saldo_pendiente: 500, dias_mora: 5, vencida: true,
      abonos: [{ id: i, fecha: '2026-09-02T10:00:00.000Z', monto: 500, medio_pago: '10' }],
    }));
    const r = generateEstadoCuentaPDF('COBRAR', { ...porCobrar, ventas }, empresa, { ...opts, returnBlob: true });
    expect(r.blob).toBeInstanceOf(Blob);
  });

  it('exige los datos', () => {
    expect(() => generateEstadoCuentaPDF('COBRAR', null, empresa, opts)).toThrow(/faltan los datos/);
  });
});
