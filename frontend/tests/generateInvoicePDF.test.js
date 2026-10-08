import { describe, it, expect } from 'vitest';
import { generateInvoicePDF } from '../src/utils/generateInvoicePDF';

const empresa = { nombre: 'Ferretería Panchita', nit: '9001234567', contacto: 'Cra 1 #2-3' };

const ventaBase = {
  id: 42,
  fecha: '2026-09-09T14:30:00.000Z',
  subtotal_bruto: 100000,
  total_impuestos: 19000,
  descuento_global: 10,
  total: 107100,
  Cliente: { nombre: 'Cliente Test', documento: '123456789', telefono: '3001234567' },
  Usuario: { nombre: 'Cajero 1' },
  VentaDetalles: [
    { cantidad: 2, precio_unitario: 5000, precio_base: 6000, Producto: { nombre_producto: 'Tornillo' } },
    { cantidad: 1, precio_unitario: 88000, precio_base: 88000, Servicio: { nombre: 'Instalación' } },
  ],
};

const opts = { autoOpen: false, save: false };

describe('generateInvoicePDF — casos límite (Fase 9)', () => {
  it('genera una factura normal y devuelve el nombre de archivo', () => {
    const name = generateInvoicePDF(ventaBase, empresa, opts);
    expect(name).toMatch(/^Factura_FACT-0042_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('venta sin líneas no revienta', () => {
    expect(() =>
      generateInvoicePDF({ ...ventaBase, VentaDetalles: [] }, empresa, opts)
    ).not.toThrow();
  });

  it('venta sin id → borrador', () => {
    const name = generateInvoicePDF({ ...ventaBase, id: undefined }, empresa, opts);
    expect(name).toContain('FACT-BORRADOR');
  });

  it('total ausente / NaN no propaga NaN (se recalcula)', () => {
    expect(() =>
      generateInvoicePDF({ ...ventaBase, total: undefined }, empresa, opts)
    ).not.toThrow();
    expect(() =>
      generateInvoicePDF({ ...ventaBase, total: 'x' }, empresa, opts)
    ).not.toThrow();
  });

  it('fecha inválida no revienta', () => {
    expect(() =>
      generateInvoicePDF({ ...ventaBase, fecha: 'no-es-fecha' }, empresa, opts)
    ).not.toThrow();
  });

  it('empresa nula / sin datos DIAN no revienta', () => {
    expect(() => generateInvoicePDF(ventaBase, null, opts)).not.toThrow();
    expect(() => generateInvoicePDF(ventaBase, {}, opts)).not.toThrow();
  });

  it('factura con muchas líneas y nombres largos → varias páginas, sin excepción', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      cantidad: i + 1,
      precio_unitario: 1234,
      precio_base: 1500,
      Producto: { nombre_producto: `Producto con un nombre extremadamente largo número ${i} para forzar wrap` },
    }));
    expect(() =>
      generateInvoicePDF({ ...ventaBase, VentaDetalles: many }, empresa, opts)
    ).not.toThrow();
  });

  it('cliente casual (sin Cliente) no revienta', () => {
    const { Cliente, ...sinCliente } = ventaBase;
    expect(Cliente).toBeDefined();
    expect(() => generateInvoicePDF(sinCliente, empresa, opts)).not.toThrow();
  });

  it('sin objeto de venta lanza un error claro', () => {
    expect(() => generateInvoicePDF(undefined, empresa, opts)).toThrow(/venta/i);
  });
});

describe('generateInvoicePDF — platos con modificadores', () => {
  it('lista los modificadores bajo el nombre del plato sin romper la tabla', () => {
    const venta = {
      ...ventaBase,
      VentaDetalles: [
        {
          cantidad: 1, precio_unitario: 22000, precio_base: 22000,
          Producto: { nombre_producto: 'Pizza' },
          modificadores: [{ id: 1, nombre: 'Extra queso', precio_extra: 2000 }, { id: 2, nombre: 'Sin salsa', precio_extra: 0 }],
        },
        { cantidad: 1, precio_unitario: 5000, precio_base: 5000, Producto: { nombre_producto: 'Gaseosa' }, modificadores: null },
      ],
    };
    expect(() => generateInvoicePDF(venta, empresa, opts)).not.toThrow();
  });
});

