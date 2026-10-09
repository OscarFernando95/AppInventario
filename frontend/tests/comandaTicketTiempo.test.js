import { describe, it, expect } from 'vitest';
import { htmlComanda } from '../src/utils/comandaTicket';

const base = { id: 20, cuenta: 'Mesa 2', mesero: 'Ana', enviada_en: '2026-10-09T13:00:00', items: [{ nombre: 'Pizza', cantidad: 1, modificadores: [], nota: null, anulado: false }] };

describe('comanda impresa por tiempos', () => {
  it('muestra el nombre del tiempo en mayúsculas y escapado', () => {
    const html = htmlComanda({ ...base, tiempo: 2, tiempo_nombre: 'Plato fuerte' });
    expect(html).toContain('<p class="tiempo">PLATO FUERTE</p>');
    expect(htmlComanda({ ...base, tiempo_nombre: '<b>x</b>' })).toContain('&lt;B&gt;X&lt;/B&gt;');
  });

  it('sin tiempo la comanda queda como siempre', () => {
    expect(htmlComanda(base)).not.toContain('<p class="tiempo">');
    expect(htmlComanda({ ...base, tiempo_nombre: null })).not.toContain('<p class="tiempo">');
  });
});
