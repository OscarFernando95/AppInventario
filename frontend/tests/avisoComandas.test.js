import { describe, it, expect } from 'vitest';
import { comandasNuevas, idsDeComandas } from '../src/hooks/useAvisoComandas';

const c = (id, estado = 'PENDIENTE') => ({ id, estado, cuenta: `Mesa ${id}` });

describe('detección de comandas nuevas para el sonido de cocina', () => {
  it('la primera lectura no avisa: solo es el punto de partida', () => {
    expect(comandasNuevas(null, [c(1), c(2)])).toEqual([]);
  });

  it('avisa de las comandas pendientes que no estaban antes', () => {
    const previo = idsDeComandas([c(1), c(2, 'LISTA')]);
    expect(comandasNuevas(previo, [c(1), c(2, 'LISTA'), c(3), c(4)]).map((x) => x.id)).toEqual([3, 4]);
  });

  it('sin cambios no avisa', () => {
    const lectura = [c(1), c(2, 'LISTA')];
    expect(comandasNuevas(idsDeComandas(lectura), lectura)).toEqual([]);
  });

  it('una comanda ya conocida que vuelve a pendiente (la devolvieron) no es nueva', () => {
    const previo = idsDeComandas([c(1, 'LISTA')]);
    expect(comandasNuevas(previo, [c(1, 'PENDIENTE')])).toEqual([]);
  });

  it('una comanda nueva que ya llega como lista no suena (cocina no tiene nada que preparar)', () => {
    expect(comandasNuevas(idsDeComandas([c(1)]), [c(1), c(2, 'LISTA')])).toEqual([]);
  });

  it('las que salen de la pantalla no avisan y toleran datos vacíos', () => {
    expect(comandasNuevas(idsDeComandas([c(1), c(2)]), [c(2)])).toEqual([]);
    expect(comandasNuevas(new Set(), undefined)).toEqual([]);
    expect(idsDeComandas(undefined).size).toBe(0);
  });
});
