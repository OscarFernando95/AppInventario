import { describe, it, expect } from 'vitest';
import { htmlPrecuenta } from '../src/utils/precuentaTicket';

const datos = {
  empresa: { nombre: 'Café <Central>', nit: '900123456' },
  cuenta: 'Mesa 4', referencia: 'Habitación 204', cliente: { nombre: 'Ana Pérez' }, mesero: 'Luis', impresa_en: '2026-10-09T13:05:00',
  items: [
    { nombre: 'Pasta', cantidad: 2, subtotal: 40000, modificadores: ['Extra queso'], componentes: [], comensal: 1 },
    { nombre: 'Desayuno', cantidad: 1, subtotal: 12000, modificadores: [], componentes: [{ nombre: 'Pan', cantidad: 1 }, { nombre: 'Café', cantidad: 2 }] },
  ],
  por_comensal: [{ comensal: 1, pendiente: 40000 }, { comensal: null, pendiente: 12000 }],
  total: 52000,
  propina_sugerida: { pct: 10, valor: 5200, total_con_propina: 57200 },
};

describe('htmlPrecuenta', () => {
  const html = htmlPrecuenta(datos);
  it('muestra el negocio (escapado), la cuenta, la referencia y el cliente', () => {
    expect(html).toContain('Café &lt;Central&gt;');
    expect(html).toContain('PRE-CUENTA · Mesa 4');
    expect(html).toContain('Habitación 204');
    expect(html).toContain('Cliente: Ana Pérez');
  });
  it('lista cantidades, extras, componentes del combo y la persona', () => {
    expect(html).toContain('+ Extra queso');
    expect(html).toContain('· 2 Café');
    expect(html).toContain('>P1<');
  });
  it('muestra el total, lo de cada persona y la propina como voluntaria', () => {
    expect(html).toContain('TOTAL');
    expect(html).toMatch(/\$\s?52\.000/);
    expect(html).toContain('Persona 1');
    expect(html).toContain('Propina sugerida (10 %)');
    expect(html).toContain('La propina es voluntaria.');
    expect(html).toContain('no es una factura');
  });
  it('sin propina sugerida ni personas no las muestra', () => {
    const h = htmlPrecuenta({ ...datos, propina_sugerida: null, por_comensal: [], referencia: null, cliente: null });
    expect(h).not.toContain('Propina sugerida');
    expect(h).not.toContain('Persona 1');
    expect(h).not.toContain('Cliente:');
  });
});
