import { describe, it, expect, vi, afterEach } from 'vitest';
import { fechaLocal } from '../src/utils/format';

afterEach(() => vi.useRealTimers());

describe('fechaLocal', () => {
  it('es la fecha LOCAL aunque en UTC ya sea otro día (9 pm en Colombia = 2 am UTC del día siguiente)', () => {
    vi.useFakeTimers();
    // Se construye con componentes locales: 7-oct-2026 21:43 hora local de esta máquina.
    vi.setSystemTime(new Date(2026, 9, 7, 21, 43));
    expect(fechaLocal()).toBe('2026-10-07');
  });

  it('formatea con ceros a la izquierda y acepta una fecha explícita', () => {
    expect(fechaLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(fechaLocal(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});
