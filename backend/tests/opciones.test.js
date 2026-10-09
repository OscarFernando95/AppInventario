const { OPCIONES, PERFILES, efectivas, aplicarCambios, valoresDePerfil, catalogoPara } = require('../src/services/opciones');

const MESAS = ['Ventas', 'Mesas'];

describe('catálogo de opciones', () => {
  it('cada opción tiene grupo, etiqueta, tipo y valor por omisión; las claves no se repiten', () => {
    expect(new Set(OPCIONES.map((o) => o.clave)).size).toBe(OPCIONES.length);
    for (const o of OPCIONES) {
      expect(o.grupo).toBeTruthy();
      expect(o.etiqueta).toBeTruthy();
      expect(['bool', 'int', 'lista']).toContain(o.tipo);
      expect(o.defecto).not.toBeUndefined();
    }
  });

  it('las funciones nuevas nacen apagadas: solo están encendidas las que existían antes de los interruptores', () => {
    const ANTIGUAS = ['reservas', 'plano', 'unir_cuentas', 'cuenta_por_persona', 'propina'];
    for (const o of OPCIONES.filter((x) => x.tipo === 'bool')) {
      expect(o.defecto, o.clave).toBe(ANTIGUAS.includes(o.clave));
    }
  });

  it('los requisitos (`requiere`) apuntan a opciones que existen y no forman ciclos', () => {
    const claves = new Set(OPCIONES.map((o) => o.clave));
    for (const o of OPCIONES) for (const r of o.requiere || []) expect(claves.has(r), `${o.clave} requiere ${r}`).toBe(true);
    expect(() => efectivas({}, ['Mesas', 'Ventas', 'Recetas'])).not.toThrow();
  });

  it('los perfiles solo mencionan opciones que existen y valores válidos', () => {
    for (const p of PERFILES) {
      expect(() => valoresDePerfil(p.clave, ['Ventas', 'Mesas', 'Recetas', 'Inventario', 'Cocina'])).not.toThrow();
    }
  });
});

describe('efectivas', () => {
  it('sin nada guardado valen sus valores por omisión', () => {
    const ef = efectivas({}, MESAS);
    expect(ef.reservas).toBe(true);
    expect(ef.propina).toBe(true);
  });

  it('una empresa de comercio (sin Mesas) las tiene todas apagadas y no ve ninguna', () => {
    const ef = efectivas({}, ['Ventas', 'Inventario']);
    expect(Object.values(ef).filter((v) => v === true)).toEqual([]);
    expect(catalogoPara(['Ventas', 'Inventario']).filter((o) => o.modulos)).toEqual([]);
  });

  it('lo guardado manda sobre el valor por omisión', () => {
    expect(efectivas({ reservas: false }, MESAS).reservas).toBe(false);
  });
});

describe('aplicarCambios', () => {
  it('cambia solo lo pedido y conserva el resto', () => {
    const r = aplicarCambios({ plano: false }, { reservas: false }, MESAS);
    expect(r).toEqual({ plano: false, reservas: false });
  });

  it('rechaza claves desconocidas, tipos incorrectos y opciones de un módulo que la empresa no tiene', () => {
    expect(() => aplicarCambios({}, { inventada: true }, MESAS)).toThrow(/no existe/);
    expect(() => aplicarCambios({}, { reservas: 'si' }, MESAS)).toThrow(/sí o no/);
    expect(() => aplicarCambios({}, { reservas: false }, ['Ventas'])).toThrow(/necesita el módulo Mesas/);
  });
});

describe('perfiles', () => {
  it('«cafetería» apaga las funciones de servicio a mesa y deja la propina', () => {
    const ef = efectivas(valoresDePerfil('cafeteria', MESAS), MESAS);
    expect(ef).toMatchObject({ reservas: false, plano: false, unir_cuentas: false, cuenta_por_persona: false, propina: true });
  });

  it('«restaurante» deja todo en su valor por omisión; uno desconocido falla', () => {
    expect(valoresDePerfil('restaurante', MESAS)).toEqual({});
    expect(() => valoresDePerfil('marciano', MESAS)).toThrow(/no existe/);
  });

  it('un perfil reemplaza lo anterior (no se acumula)', () => {
    const guardado = valoresDePerfil('cafeteria', MESAS);
    expect(efectivas(guardado, MESAS).reservas).toBe(false);
    expect(efectivas(valoresDePerfil('restaurante', MESAS), MESAS).reservas).toBe(true);
  });
});
