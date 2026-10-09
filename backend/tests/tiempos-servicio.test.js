const { OPCIONES, efectivas, aplicarCambios, catalogoPara, valoresDePerfil } = require('../src/services/opciones');
const {
  nombresDeTiempos, nombreDeTiempo, itemsEnviables, siguienteTiempo, pendientesPorTiempo, agruparParaEnvio,
} = require('../src/services/cuentas');
const { describirEvento } = require('../src/utils/auditoriaTexto');

const CLAVES = ['tiempos_servicio', 'tiempos_nombres', 'cocina_alertas', 'cocina_amarillo_min', 'cocina_rojo_min', 'cocina_sonido'];
const TODO = ['Ventas', 'Mesas', 'Cocina'];

describe('opciones de tiempos, alertas y sonido: catálogo', () => {
  it('existen, son del grupo «Cocina y servicio» y nacen apagadas con sus valores por omisión', () => {
    for (const c of CLAVES) expect(OPCIONES.find((o) => o.clave === c)?.grupo, c).toBe('Cocina y servicio');
    const ef = efectivas({}, TODO);
    expect(ef).toMatchObject({
      tiempos_servicio: false, cocina_alertas: false, cocina_sonido: false, cocina_amarillo_min: 10, cocina_rojo_min: 20,
      tiempos_nombres: ['Entrada', 'Plato fuerte', 'Postre'],
    });
  });

  it('cada una aplica solo con su módulo: los tiempos con Mesas; alertas y sonido con Cocina', () => {
    const solo = (mods) => catalogoPara(mods).map((o) => o.clave);
    expect(solo(['Ventas', 'Mesas'])).toEqual(expect.arrayContaining(['tiempos_servicio', 'tiempos_nombres']));
    expect(solo(['Ventas', 'Mesas'])).not.toContain('cocina_alertas');
    expect(solo(['Ventas', 'Cocina'])).toEqual(expect.arrayContaining(['cocina_alertas', 'cocina_amarillo_min', 'cocina_rojo_min', 'cocina_sonido']));
    expect(solo(['Ventas', 'Cocina'])).not.toContain('tiempos_servicio');
    expect(solo(['Ventas'])).toEqual([]);
  });

  it('sin el módulo Cocina las alertas valen apagadas aunque estén guardadas, y no se pueden cambiar', () => {
    expect(efectivas({ cocina_alertas: true }, ['Ventas', 'Mesas']).cocina_alertas).toBe(false);
    expect(() => aplicarCambios({}, { cocina_alertas: true }, ['Ventas', 'Mesas'])).toThrow(/necesita el módulo Cocina/);
    expect(() => aplicarCambios({}, { cocina_sonido: true }, ['Ventas', 'Mesas'])).toThrow(/necesita el módulo Cocina/);
  });

  it('solo el perfil «restaurante» enciende los tiempos y las alertas de cocina', () => {
    for (const p of ['minimo', 'cafeteria']) {
      const ef = efectivas(valoresDePerfil(p, TODO), TODO);
      expect(ef.tiempos_servicio).toBe(false);
      expect(ef.cocina_alertas).toBe(false);
      expect(ef.cocina_sonido).toBe(false);
    }
    const ef = efectivas(valoresDePerfil('restaurante', TODO), TODO);
    expect(ef).toMatchObject({ tiempos_servicio: true, cocina_alertas: true, cocina_sonido: true });
  });
});

describe('opciones de tiempos, alertas y sonido: validaciones', () => {
  it('los minutos son enteros dentro de su rango y exigen las alertas encendidas', () => {
    const con = aplicarCambios({}, { cocina_alertas: true }, TODO);
    expect(() => aplicarCambios(con, { cocina_amarillo_min: 0 }, TODO)).toThrow(/entre 1 y 120/);
    expect(() => aplicarCambios(con, { cocina_amarillo_min: 121 }, TODO)).toThrow(/entre 1 y 120/);
    expect(() => aplicarCambios(con, { cocina_rojo_min: 241 }, TODO)).toThrow(/entre 1 y 240/);
    expect(() => aplicarCambios(con, { cocina_rojo_min: 12.5 }, TODO)).toThrow(/número entero/);
    expect(() => aplicarCambios(con, { cocina_rojo_min: '30' }, TODO)).toThrow(/número entero/);
    expect(aplicarCambios(con, { cocina_rojo_min: 30 }, TODO).cocina_rojo_min).toBe(30);
    expect(() => aplicarCambios({}, { cocina_rojo_min: 30 }, TODO)).toThrow(/necesita que esté activada «Alertas de demora en cocina»/);
  });

  it('el rojo debe ser mayor que el amarillo, con los valores que quedarían tras guardar', () => {
    const con = aplicarCambios({}, { cocina_alertas: true }, TODO);
    expect(() => aplicarCambios(con, { cocina_amarillo_min: 20 }, TODO)).toThrow(/rojo \(20\).*amarillo \(20\)/);
    expect(() => aplicarCambios(con, { cocina_amarillo_min: 25 }, TODO)).toThrow(/más que los del amarillo/);
    expect(() => aplicarCambios(con, { cocina_rojo_min: 10 }, TODO)).toThrow(/más que los del amarillo/);
    // En la misma petición se pueden cambiar los dos
    const ok = aplicarCambios(con, { cocina_amarillo_min: 25, cocina_rojo_min: 40 }, TODO);
    expect(ok).toMatchObject({ cocina_amarillo_min: 25, cocina_rojo_min: 40 });
    // Primero el rojo y luego el amarillo
    const paso1 = aplicarCambios(con, { cocina_rojo_min: 60 }, TODO);
    expect(aplicarCambios(paso1, { cocina_amarillo_min: 30 }, TODO).cocina_amarillo_min).toBe(30);
  });

  it('los nombres de los tiempos: de 1 a 4, hasta 20 letras y sin repetir; exigen «Pedir por tiempos»', () => {
    const con = aplicarCambios({}, { tiempos_servicio: true }, TODO);
    expect(aplicarCambios(con, { tiempos_nombres: ['Aperitivo', 'Entrada', 'Fuerte', 'Postre'] }, TODO).tiempos_nombres).toHaveLength(4);
    expect(() => aplicarCambios(con, { tiempos_nombres: ['a', 'b', 'c', 'd', 'e'] }, TODO)).toThrow(/entre 1 y 4/);
    expect(() => aplicarCambios(con, { tiempos_nombres: [] }, TODO)).toThrow(/entre 1 y 4/);
    expect(() => aplicarCambios(con, { tiempos_nombres: ['x'.repeat(21)] }, TODO)).toThrow(/entre 1 y 20 letras/);
    expect(() => aplicarCambios(con, { tiempos_nombres: ['Entrada', 'entrada'] }, TODO)).toThrow(/repetidos/);
    expect(aplicarCambios(con, { tiempos_nombres: ['  Sopa ', 'Fuerte'] }, TODO).tiempos_nombres).toEqual(['Sopa', 'Fuerte']);
    expect(() => aplicarCambios({}, { tiempos_nombres: ['Sopa'] }, TODO)).toThrow(/necesita que esté activada «Pedir por tiempos»/);
  });

  it('apagar «Pedir por tiempos» deja los nombres en su valor por omisión sin error', () => {
    const guardado = aplicarCambios(aplicarCambios({}, { tiempos_servicio: true }, TODO), { tiempos_nombres: ['Sopa', 'Fuerte'] }, TODO);
    const apagado = aplicarCambios(guardado, { tiempos_servicio: false }, TODO);
    expect(efectivas(apagado, TODO).tiempos_nombres).toEqual(['Entrada', 'Plato fuerte', 'Postre']);
  });
});

const it_ = (id, tiempo, estacion = 'Cocina') => ({ id, tiempo, estacion });
const estacionDe = (i) => i.estacion;

describe('pedir por tiempos: lógica pura', () => {
  it('nombres de los tiempos: los guardados o los de siempre; «Tiempo n» si la lista se acortó', () => {
    expect(nombresDeTiempos(undefined)).toEqual(['Entrada', 'Plato fuerte', 'Postre']);
    expect(nombresDeTiempos([])).toEqual(['Entrada', 'Plato fuerte', 'Postre']);
    expect(nombresDeTiempos(['Sopa'])).toEqual(['Sopa']);
    expect(nombreDeTiempo(['Entrada', 'Fuerte'], 2)).toBe('Fuerte');
    expect(nombreDeTiempo(['Entrada'], 3)).toBe('Tiempo 3');
    expect(nombreDeTiempo(['Entrada'], null)).toBeNull();
  });

  it('solo se pueden enviar los ítems de tiempos ya disparados', () => {
    const items = [it_(1, 1), it_(2, 2), it_(3, 3), it_(4, 1)];
    expect(itemsEnviables(items, 1).map((i) => i.id)).toEqual([1, 4]);
    expect(itemsEnviables(items, 2).map((i) => i.id)).toEqual([1, 2, 4]);
    expect(itemsEnviables(items, 3)).toHaveLength(4);
    expect(itemsEnviables([{ id: 9 }], 1)).toHaveLength(1); // sin tiempo = el 1
  });

  it('el siguiente tiempo es el menor con pedidos en espera, saltando los vacíos', () => {
    const items = [it_(1, 1), it_(2, 3), it_(3, 4)];
    expect(siguienteTiempo(items, 1)).toBe(3);
    expect(siguienteTiempo(items, 3)).toBe(4);
    expect(siguienteTiempo(items, 4)).toBeNull();
    expect(siguienteTiempo([], 1)).toBeNull();
  });

  it('cuenta los pedidos en espera por tiempo', () => {
    expect(pendientesPorTiempo([it_(1, 1), it_(2, 2), it_(3, 2)], 3)).toEqual([
      { numero: 1, pendientes: 1 }, { numero: 2, pendientes: 2 }, { numero: 3, pendientes: 0 },
    ]);
  });

  it('agrupa por (tiempo, estación) en orden de tiempo y luego de estación', () => {
    const items = [it_(1, 2, 'Cocina'), it_(2, 1, 'Barra'), it_(3, 1, 'Cocina'), it_(4, 2, 'Barra'), it_(5, 1, 'Cocina')];
    const g = agruparParaEnvio(items, ['Cocina', 'Barra'], estacionDe, true);
    expect(g.map((x) => [x.tiempo, x.estacion, x.items.map((i) => i.id)])).toEqual([
      [1, 'Cocina', [3, 5]], [1, 'Barra', [2]], [2, 'Cocina', [1]], [2, 'Barra', [4]],
    ]);
  });

  it('sin tiempos agrupa solo por estación, igual que siempre (tiempo null)', () => {
    const items = [it_(1, 3, 'Barra'), it_(2, 1, 'Cocina'), it_(3, 2, 'Barra')];
    const g = agruparParaEnvio(items, ['Cocina', 'Barra'], estacionDe, false);
    expect(g.map((x) => [x.tiempo, x.estacion, x.items.map((i) => i.id)])).toEqual([[null, 'Cocina', [2]], [null, 'Barra', [1, 3]]]);
  });
});

describe('auditoría de tiempos', () => {
  it('describe el tiempo disparado y la comanda con su tiempo', () => {
    const e = describirEvento('tiempo_disparado', { cuentaId: 4, cuenta: 'Mesa 3', tiempo: 'Plato fuerte', numItems: 2 });
    expect(e.accion).toBe('Disparó un tiempo de servicio');
    expect(e.descripcion).toBe('Mesa 3 · «Plato fuerte» · 2 ítems a cocina');
    expect(describirEvento('comanda_enviada', { cuentaId: 4, comandaId: 9, cuenta: 'Mesa 3', numItems: 1, estacion: 'Cocina', tiempo: 'Postre' }).descripcion)
      .toBe('Mesa 3 · comanda #9 (Cocina) · 1 ítem · tiempo «Postre»');
  });
});
