import { describe, it, expect } from 'vitest';
import { generateDevolucionPDF } from '../src/utils/generateDevolucionPDF';

const empresa = { nombre: 'Café Central', nit: '9001234567', contacto: 'Cra 1 #2-3' };
const opts = { autoOpen: false, save: false };
const venta = { id: 12, total: 35700, Cliente: { nombre: 'Ana Gómez', documento: '123456789' } };
const devolucion = {
  id: 3, ventaId: 12, fecha: '2026-10-08T15:00:00.000Z', motivo: 'El pan llegó frío', total: 11900,
  credito_reducido: 0, dinero_devuelto: 11900, reembolso: 'CAJA', usuario: { nombre: 'Ana Admin' },
  detalles: [{ cantidad: '1.000', valor: '11900.00', reingresada: '0.000', linea: { Producto: { nombre_producto: 'Pan artesanal' } } }],
};

describe('generateDevolucionPDF', () => {
  it('genera la nota y devuelve el nombre de archivo', () => {
    expect(generateDevolucionPDF(devolucion, venta, empresa, opts)).toMatch(/^NotaDevolucion_DEV-0003_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('venta a crédito: muestra lo descontado de la deuda y lo devuelto en dinero', () => {
    const credito = { ...devolucion, credito_reducido: 5000, dinero_devuelto: 6900, reembolso: 'OTRO' };
    expect(() => generateDevolucionPDF(credito, venta, empresa, opts)).not.toThrow();
    expect(() => generateDevolucionPDF({ ...devolucion, dinero_devuelto: 0, reembolso: null }, venta, empresa, opts)).not.toThrow();
  });

  it('no revienta sin venta, sin empresa, sin líneas ni con un servicio', () => {
    expect(() => generateDevolucionPDF({ id: 1, motivo: 'x', total: 0, detalles: [] }, null, null, opts)).not.toThrow();
    const servicio = { ...devolucion, detalles: [{ cantidad: 1, valor: 1000, reingresada: 0, linea: { Servicio: { nombre: 'Instalación' } } }] };
    expect(() => generateDevolucionPDF(servicio, venta, empresa, opts)).not.toThrow();
  });

  it('con muchas líneas pagina y puede devolver un blob', () => {
    const muchas = { ...devolucion, detalles: Array.from({ length: 80 }, (_, i) => ({ cantidad: 1, valor: 100, reingresada: 1, linea: { Producto: { nombre_producto: `Producto ${i}` } } })) };
    expect(generateDevolucionPDF(muchas, venta, empresa, { ...opts, returnBlob: true }).blob).toBeInstanceOf(Blob);
  });

  it('exige la devolución', () => {
    expect(() => generateDevolucionPDF(null, venta, empresa, opts)).toThrow(/falta la devolución/);
  });
});
