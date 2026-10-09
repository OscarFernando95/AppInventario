const { estaVigente, cruzaRango, textoBloqueo, textoBloqueoReserva, bloqueoParaTablero } = require('../src/services/bloqueos');
const { OPCIONES, efectivas, aplicarCambios } = require('../src/services/opciones');

const t = (dia, h, m = 0) => new Date(2026, 9, dia, h, m);
const ahora = t(9, 12, 0);

describe('estaVigente', () => {
  const b = { desde: t(9, 11), hasta: t(9, 14), activo: true };

  it('vale desde el inicio (incluido) hasta el fin (excluido)', () => {
    expect(estaVigente(b, t(9, 11))).toBe(true);
    expect(estaVigente(b, t(9, 13, 59))).toBe(true);
    expect(estaVigente(b, t(9, 14))).toBe(false);
    expect(estaVigente(b, t(9, 10, 59))).toBe(false);
  });

  it('un bloqueo quitado nunca está vigente', () => {
    expect(estaVigente({ ...b, activo: false }, ahora)).toBe(false);
  });
});

describe('cruzaRango', () => {
  const b = { desde: t(9, 12), hasta: t(9, 14), activo: true };

  it('detecta cruces parciales y totales; el borde exacto no cruza', () => {
    expect(cruzaRango(b, t(9, 13), t(9, 15))).toBe(true);
    expect(cruzaRango(b, t(9, 10), t(9, 12, 30))).toBe(true);
    expect(cruzaRango(b, t(9, 12, 30), t(9, 13))).toBe(true);
    expect(cruzaRango(b, t(9, 14), t(9, 16))).toBe(false);
    expect(cruzaRango(b, t(9, 10), t(9, 12))).toBe(false);
    expect(cruzaRango({ ...b, activo: false }, t(9, 13), t(9, 15))).toBe(false);
  });
});

describe('mensajes', () => {
  it('«hasta HH:MM» si es hoy y con el motivo', () => {
    expect(textoBloqueo('Mesa 3', { hasta: t(9, 14, 30), motivo: 'Evento privado' }, ahora)).toBe('La mesa Mesa 3 está bloqueada hasta 14:30 (Evento privado).');
    expect(textoBloqueo('Mesa 3', { hasta: t(9, 14, 30) }, ahora)).toBe('La mesa Mesa 3 está bloqueada hasta 14:30.');
  });

  it('si termina otro día incluye el día', () => {
    expect(textoBloqueo('Mesa 3', { hasta: t(10, 8, 0) }, ahora)).toMatch(/hasta 10 .*oct.* 08:00\.$/);
  });

  it('para una reserva dice de cuándo a cuándo', () => {
    expect(textoBloqueoReserva('Mesa 3', { desde: t(9, 13), hasta: t(9, 15), motivo: 'Mantenimiento' }, ahora)).toBe('La mesa Mesa 3 está bloqueada de 13:00 a 15:00 (Mantenimiento).');
  });
});

describe('bloqueoParaTablero', () => {
  it('muestra el vigente ahora', () => {
    const r = bloqueoParaTablero([{ id: 1, desde: t(9, 11), hasta: t(9, 13), motivo: 'Evento', activo: true }], ahora);
    expect(r).toMatchObject({ id: 1, motivo: 'Evento', vigente: true });
  });

  it('avisa el que empieza en menos de 3 horas, pero no el de más adelante ni el ya vencido', () => {
    expect(bloqueoParaTablero([{ id: 2, desde: t(9, 14), hasta: t(9, 16), activo: true }], ahora)).toMatchObject({ id: 2, vigente: false });
    expect(bloqueoParaTablero([{ id: 3, desde: t(9, 16), hasta: t(9, 18), activo: true }], ahora)).toBeNull();
    expect(bloqueoParaTablero([{ id: 4, desde: t(9, 8), hasta: t(9, 10), activo: true }], ahora)).toBeNull();
    expect(bloqueoParaTablero([{ id: 5, desde: t(9, 11), hasta: t(9, 13), activo: false }], ahora)).toBeNull();
  });

  it('si hay uno vigente y otro próximo, gana el vigente', () => {
    const r = bloqueoParaTablero([
      { id: 6, desde: t(9, 13), hasta: t(9, 14), activo: true },
      { id: 7, desde: t(9, 11), hasta: t(9, 12, 30), activo: true },
    ], ahora);
    expect(r.id).toBe(7);
  });
});

describe('opciones de lista de espera, bloqueo, ocupación y calendario', () => {
  const NUEVAS = ['lista_espera', 'bloqueo_mesas', 'tiempo_ocupacion', 'reservas_calendario'];
  const MESAS = ['Ventas', 'Mesas'];

  it('nacen apagadas, en el grupo Mesas y solo para empresas con Mesas', () => {
    for (const clave of NUEVAS) {
      const o = OPCIONES.find((x) => x.clave === clave);
      expect(o, clave).toBeTruthy();
      expect(o).toMatchObject({ tipo: 'bool', defecto: false, grupo: 'Mesas', modulos: ['Mesas'] });
      expect(efectivas({}, MESAS)[clave]).toBe(false);
      expect(efectivas({ [clave]: true }, ['Ventas'])[clave]).toBe(false); // sin Mesas no hay nada
    }
  });

  it('el calendario necesita las reservas encendidas', () => {
    expect(OPCIONES.find((o) => o.clave === 'reservas_calendario').requiere).toEqual(['reservas']);
    expect(efectivas({ reservas_calendario: true }, MESAS).reservas_calendario).toBe(true);
    expect(efectivas({ reservas_calendario: true, reservas: false }, MESAS).reservas_calendario).toBe(false);
    expect(() => aplicarCambios({ reservas: false }, { reservas_calendario: true }, MESAS)).toThrow(/Reservas/);
  });
});
