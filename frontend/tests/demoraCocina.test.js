import { describe, it, expect } from 'vitest';
import { minutosDeEspera, umbrales, itemsDemorados, tonoDeComanda } from '../src/utils/demoraCocina';

const AHORA = new Date('2026-10-09T12:00:00Z').getTime();
const haceMin = (m) => new Date(AHORA - m * 60_000).toISOString();
const comanda = (min, items = [], extra = {}) => ({ id: 1, estado: 'PENDIENTE', enviada_en: haceMin(min), items, ...extra });
const plato = (id, objetivo, extra = {}) => ({ id, nombre: `P${id}`, tiempo_objetivo_min: objetivo, anulado: false, ...extra });

describe('minutos de espera', () => {
  it('cuenta minutos completos y nunca es negativo', () => {
    expect(minutosDeEspera(haceMin(7.9), AHORA)).toBe(7);
    expect(minutosDeEspera(haceMin(0), AHORA)).toBe(0);
    expect(minutosDeEspera(haceMin(-3), AHORA)).toBe(0);
  });
});

describe('umbrales', () => {
  it('apagadas valen 10 y 20 aunque haya otros minutos configurados', () => {
    expect(umbrales({ alertas: false, amarillo: 3, rojo: 5 })).toEqual({ amarillo: 10, rojo: 20 });
    expect(umbrales()).toEqual({ amarillo: 10, rojo: 20 });
  });
  it('encendidas usan los de la empresa, con respaldo si llegan mal', () => {
    expect(umbrales({ alertas: true, amarillo: 3, rojo: 5 })).toEqual({ amarillo: 3, rojo: 5 });
    expect(umbrales({ alertas: true })).toEqual({ amarillo: 10, rojo: 20 });
  });
});

describe('tono de la comanda sin alertas (como siempre)', () => {
  it('verde antes de 10, amarillo desde 10, rojo desde 20', () => {
    expect(tonoDeComanda(comanda(9), AHORA)).toBe('verde');
    expect(tonoDeComanda(comanda(10), AHORA)).toBe('amarillo');
    expect(tonoDeComanda(comanda(19), AHORA)).toBe('amarillo');
    expect(tonoDeComanda(comanda(20), AHORA)).toBe('rojo');
  });
  it('ignora el objetivo de los platos y los minutos configurados', () => {
    const c = comanda(5, [plato(1, 1)]);
    expect(tonoDeComanda(c, AHORA, { alertas: false, amarillo: 2, rojo: 3 })).toBe('verde');
    expect(itemsDemorados(c, AHORA, { alertas: false })).toEqual([]);
  });
});

describe('tono de la comanda con alertas', () => {
  const cfg = { alertas: true, amarillo: 3, rojo: 6 };
  it('usa los minutos de la empresa', () => {
    expect(tonoDeComanda(comanda(2), AHORA, cfg)).toBe('verde');
    expect(tonoDeComanda(comanda(3), AHORA, cfg)).toBe('amarillo');
    expect(tonoDeComanda(comanda(6), AHORA, cfg)).toBe('rojo');
  });
  it('un plato pasado de su objetivo marca el ítem «+N min» y pone la tarjeta en rojo', () => {
    const c = comanda(5, [plato(1, 2), plato(2, 10), plato(3, null)]);
    expect(itemsDemorados(c, AHORA, cfg)).toEqual([{ id: 1, minutos: 3 }]);
    expect(tonoDeComanda(c, AHORA, cfg)).toBe('rojo'); // el reloj general apenas marcaría amarillo
  });
  it('justo en el objetivo todavía no está demorado', () => {
    const c = comanda(5, [plato(1, 5)]);
    expect(itemsDemorados(c, AHORA, cfg)).toEqual([]);
    expect(tonoDeComanda(c, AHORA, cfg)).toBe('amarillo');
  });
  it('no marca ítems anulados, comandas ya listas ni cuentas canceladas', () => {
    expect(itemsDemorados(comanda(5, [plato(1, 1, { anulado: true })]), AHORA, cfg)).toEqual([]);
    expect(itemsDemorados(comanda(5, [plato(1, 1)], { estado: 'LISTA' }), AHORA, cfg)).toEqual([]);
    expect(itemsDemorados(comanda(5, [plato(1, 1)], { cuenta_estado: 'CANCELADA' }), AHORA, cfg)).toEqual([]);
  });
});
