import { describe, it, expect } from 'vitest';
import { htmlComanda } from '../src/utils/comandaTicket';

const comanda = {
  id: 14,
  cuenta: 'Mesa 3',
  mesero: 'Ana',
  enviada_en: '2026-10-08T19:30:00',
  items: [
    { nombre: 'Pizza <grande>', cantidad: 2, modificadores: ['Extra queso'], nota: 'Sin cebolla', anulado: false },
    { nombre: 'Gaseosa', cantidad: 1.5, modificadores: [], nota: null, anulado: true },
  ],
};

describe('htmlComanda', () => {
  const html = htmlComanda(comanda, { empresa: 'Mi Restaurante' });

  it('muestra número, mesa, mesero y empresa', () => {
    expect(html).toContain('COMANDA #14');
    expect(html).toContain('Mesa 3');
    expect(html).toContain('Atiende: Ana');
    expect(html).toContain('Mi Restaurante');
  });

  it('lista cantidades, extras y notas; marca lo anulado y no lo cuenta', () => {
    expect(html).toContain('2×');
    expect(html).toContain('+ Extra queso');
    expect(html).toContain('» Sin cebolla');
    expect(html).toContain('ANULADO');
    expect(html).toContain('1 ítem(s)');
  });

  it('escapa el HTML de los nombres', () => {
    expect(html).toContain('Pizza &lt;grande&gt;');
    expect(html).not.toContain('<grande>');
  });

  it('un combo muestra de qué se compone', () => {
    const h = htmlComanda({ ...comanda, items: [{ nombre: 'Almuerzo', cantidad: 1, modificadores: [], componentes: [{ nombre: 'Pizza', cantidad: 1 }, { nombre: 'Gaseosa', cantidad: 2 }] }] });
    expect(h).toContain('• 1 Pizza');
    expect(h).toContain('• 2 Gaseosa');
  });

  it('una reimpresión se identifica como copia; sin mesa cae a un texto', () => {
    expect(htmlComanda(comanda, { reimpresion: true })).toContain('(copia)');
    expect(htmlComanda({ ...comanda, cuenta: null })).toContain('Sin mesa');
  });
});
