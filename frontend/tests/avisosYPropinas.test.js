import { describe, it, expect } from 'vitest';
import { normalizarTelefonoCO, enlaceWhatsApp, enlaceCorreo, mensajeReserva, mensajeAlertas } from '../src/utils/avisos';
import { repartirPorPesos } from '../src/utils/propinas';
import { htmlEtiquetaLote } from '../src/utils/etiquetaLote';
import { htmlComanda } from '../src/utils/comandaTicket';

describe('avisos por WhatsApp y correo', () => {
  it('normaliza teléfonos colombianos', () => {
    expect(normalizarTelefonoCO('300 111 2233')).toBe('573001112233');
    expect(normalizarTelefonoCO('+57 (300) 111-2233')).toBe('573001112233');
    expect(normalizarTelefonoCO('0057 300 111 2233')).toBe('573001112233');
    expect(normalizarTelefonoCO('')).toBe('');
    expect(normalizarTelefonoCO(null)).toBe('');
  });
  it('arma enlaces solo si hay a quién escribir', () => {
    expect(enlaceWhatsApp('300 111 2233', 'Hola ñ')).toBe('https://wa.me/573001112233?text=Hola%20%C3%B1');
    expect(enlaceWhatsApp('', 'Hola')).toBe('');
    expect(enlaceCorreo('a@b.co', 'Alerta', 'Líneas\n2')).toBe('mailto:a@b.co?subject=Alerta&body=L%C3%ADneas%0A2');
    expect(enlaceCorreo('', 'x', 'y')).toBe('');
  });
  it('los mensajes dicen quién, cuándo y cuántos', () => {
    const m = mensajeReserva({ nombre: 'Ana', fecha_hora: '2026-10-10T19:30:00', personas: 4, mesa: 'Mesa 3' }, 'Café E2E');
    expect(m).toContain('Hola Ana');
    expect(m).toContain('Café E2E');
    expect(m).toContain('4 personas (Mesa 3)');
    expect(mensajeReserva({ nombre: 'Luis', fecha_hora: '2026-10-10T19:30:00', personas: 1 }, 'X')).toContain('1 persona.');
    const a = mensajeAlertas([{ nombre_producto: 'Queso', faltante: 40, desviacion_pct: 20 }], 'Café', 5);
    expect(a).toContain('Café');
    expect(a).toContain('• Queso: faltaron 40 (20 % de lo que debía gastarse)');
  });
});

describe('repartirPorPesos', () => {
  const gente = [{ id: 1, peso: 1 }, { id: 2, peso: 1.5, trabajo_hoy: true }, { id: 3, peso: 0, trabajo_hoy: true }, { id: 4, peso: 1, trabajo_hoy: true }];
  it('reparte en proporción al peso y suma exactamente el monto', () => {
    const r = repartirPorPesos(gente, 3500);
    expect(r).toEqual([{ usuarioId: 1, monto: 1000 }, { usuarioId: 2, monto: 1500 }, { usuarioId: 4, monto: 1000 }]);
  });
  it('los centavos sobrantes los absorbe el último', () => {
    const r = repartirPorPesos([{ id: 1, peso: 1 }, { id: 2, peso: 1 }, { id: 3, peso: 1 }], 100);
    expect(r.map((x) => x.monto)).toEqual([33.33, 33.33, 33.34]);
    expect(Math.round(r.reduce((a, x) => a + x.monto, 0) * 100)).toBe(10000);
  });
  it('solo quienes trabajaron hoy; peso 0 nunca recibe; sin nadie elegible o sin monto, nada', () => {
    expect(repartirPorPesos(gente, 2500, { soloActivos: true })).toEqual([{ usuarioId: 2, monto: 1500 }, { usuarioId: 4, monto: 1000 }]);
    expect(repartirPorPesos([{ id: 1, peso: 0 }], 1000)).toEqual([]);
    expect(repartirPorPesos(gente, 0)).toEqual([]);
    expect(repartirPorPesos([{ id: 1, peso: 1, trabajo_hoy: false }], 1000, { soloActivos: true })).toEqual([]);
  });
});

describe('etiqueta de lote y comanda por estación', () => {
  const lote = { id: 7, nombre: 'Salsa <base>', cantidad: 2000, unidad: 'ml', fecha: '2026-10-08T10:00:00', vence_en: '2026-10-11', usuario: 'Ana' };
  it('muestra qué es, cuánto, cuándo vence y quién lo hizo (con HTML escapado)', () => {
    const html = htmlEtiquetaLote(lote, { empresa: 'Café' });
    expect(html).toContain('Salsa &lt;base&gt;');
    expect(html).toContain('2.000 ml');
    expect(html).toContain('VENCE');
    expect(html).toContain('Lote #7 · Ana');
    expect(html).toContain('Café');
  });
  it('sin vencimiento lo dice', () => {
    expect(htmlEtiquetaLote({ ...lote, vence_en: null })).toContain('Sin fecha de vencimiento');
  });
  it('la comanda muestra su estación y la persona de cada ítem', () => {
    const html = htmlComanda({ id: 3, cuenta: 'Mesa 1', estacion: 'Barra', enviada_en: '2026-10-08T19:00:00', items: [{ nombre: 'Cerveza', cantidad: 2, modificadores: [], comensal: 2 }] });
    expect(html).toContain('BARRA');
    expect(html).toContain('P2');
  });
});
