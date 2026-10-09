import { describe, it, expect } from 'vitest';
import { listasPorCuenta, nuevasListas } from '../src/hooks/useAvisoCocina';
import { hace } from '../src/hooks/useAhora';

const tablero = (listas) => ({
  mesas: [
    { id: 1, nombre: 'Mesa 1', cuenta: { id: 10, nombre: 'Mesa 1', comandas_listas: listas[10] ?? 0 } },
    { id: 2, nombre: 'Mesa 2', cuenta: null },
  ],
  sin_mesa: [{ id: 11, nombre: 'Para llevar · Ana', comandas_listas: listas[11] ?? 0 }],
});

describe('avisos de cocina', () => {
  it('toma las cuentas con mesa y las de para llevar', () => {
    const m = listasPorCuenta(tablero({ 10: 1, 11: 0 }));
    expect([...m.keys()]).toEqual([10, 11]);
    expect(m.get(10)).toEqual({ nombre: 'Mesa 1', listas: 1 });
  });

  it('el primer dato no avisa: solo es el punto de partida', () => {
    expect(nuevasListas(null, listasPorCuenta(tablero({ 10: 2 })))).toEqual([]);
  });

  it('avisa cuando sube la cantidad de comandas listas de una cuenta', () => {
    const antes = listasPorCuenta(tablero({ 10: 0, 11: 1 }));
    const despues = listasPorCuenta(tablero({ 10: 1, 11: 1 }));
    expect(nuevasListas(antes, despues)).toEqual([{ id: 10, nombre: 'Mesa 1' }]);
  });

  it('no avisa si baja (la entregaron) ni si no cambia; una cuenta nueva con comanda lista sí', () => {
    const antes = listasPorCuenta(tablero({ 10: 2 }));
    expect(nuevasListas(antes, listasPorCuenta(tablero({ 10: 1 })))).toEqual([]);
    expect(nuevasListas(antes, listasPorCuenta(tablero({ 10: 2 })))).toEqual([]);
    expect(nuevasListas(antes, listasPorCuenta(tablero({ 10: 2, 11: 1 })))).toEqual([{ id: 11, nombre: 'Para llevar · Ana' }]);
  });
});

describe('hace', () => {
  const t0 = new Date('2026-10-08T12:00:00').getTime();
  it('formatea minutos y horas', () => {
    expect(hace(t0, t0 + 20_000)).toBe('ahora');
    expect(hace(t0, t0 + 12 * 60_000)).toBe('12 min');
    expect(hace(t0, t0 + 65 * 60_000)).toBe('1 h 5 min');
    expect(hace(t0, t0 + 120 * 60_000)).toBe('2 h');
  });
});
