const { rigeAhora, aplicaAProducto, precioConRegla, promoVigente } = require('../src/services/precios');
const { categoria, precioHorario, precioHorarioUpdate } = require('../src/schemas/menuSchemas');

// Miércoles 8 de octubre de 2026 (getDay() = 3), a distintas horas locales.
const miercoles = (h, m = 0) => new Date(2026, 9, 7, h, m);
const jueves = (h, m = 0) => new Date(2026, 9, 8, h, m);

const happy = { id: 1, nombre: 'Happy hour', tipo: 'PORCENTAJE', valor: 30, dias: [3, 4, 5], hora_inicio: '17:00', hora_fin: '19:00', producto_ids: [], categoria_ids: [], activo: true };

describe('rigeAhora', () => {
  it('rige dentro de la franja y el día, incluidos los bordes', () => {
    expect(rigeAhora(happy, miercoles(17, 0))).toBe(true);
    expect(rigeAhora(happy, miercoles(18, 30))).toBe(true);
    expect(rigeAhora(happy, miercoles(19, 0))).toBe(true);
    expect(rigeAhora(happy, miercoles(16, 59))).toBe(false);
    expect(rigeAhora(happy, miercoles(19, 1))).toBe(false);
  });
  it('no rige en un día que no está en la regla', () => {
    expect(rigeAhora({ ...happy, dias: [1] }, miercoles(18))).toBe(false);
  });
  it('una franja que cruza la medianoche cuenta para el día en que empieza', () => {
    const noche = { ...happy, dias: [3], hora_inicio: '22:00', hora_fin: '02:00' }; // empieza el miércoles
    expect(rigeAhora(noche, miercoles(23, 0))).toBe(true); // miércoles 11 pm
    expect(rigeAhora(noche, jueves(1, 0))).toBe(true); // jueves 1 am (todavía la de ayer)
    expect(rigeAhora(noche, jueves(3, 0))).toBe(false);
    expect(rigeAhora(noche, miercoles(1, 0))).toBe(false); // miércoles 1 am pertenece a la noche del martes
  });
});

describe('alcance y precio', () => {
  it('sin listas aplica a todos; con listas, solo a esos productos o categorías', () => {
    expect(aplicaAProducto(happy, { id: 9, categoriaId: null })).toBe(true);
    expect(aplicaAProducto({ ...happy, producto_ids: [9] }, { id: 9 })).toBe(true);
    expect(aplicaAProducto({ ...happy, producto_ids: [9] }, { id: 8 })).toBe(false);
    expect(aplicaAProducto({ ...happy, categoria_ids: [3] }, { id: 8, categoriaId: 3 })).toBe(true);
    expect(aplicaAProducto({ ...happy, categoria_ids: [3] }, { id: 8, categoriaId: null })).toBe(false);
  });
  it('porcentaje y precio fijo; una oferta nunca sube el precio', () => {
    expect(precioConRegla(happy, 10000)).toBe(7000);
    expect(precioConRegla({ tipo: 'PRECIO_FIJO', valor: 5000 }, 12000)).toBe(5000);
    expect(precioConRegla({ tipo: 'PRECIO_FIJO', valor: 15000 }, 12000)).toBe(12000);
  });
  it('gana la oferta más barata de las que rigen; sin ofertas vigentes, nada', () => {
    const fija = { ...happy, id: 2, nombre: 'Cerveza a 4.000', tipo: 'PRECIO_FIJO', valor: 4000, producto_ids: [7] };
    const prod = { id: 7, categoriaId: null, precio_unitario: 8000 };
    expect(promoVigente(prod, [happy, fija], miercoles(18))).toEqual({ precio: 4000, promo: 'Cerveza a 4.000', reglaId: 2 });
    expect(promoVigente(prod, [happy, fija], miercoles(12))).toBeNull();
    expect(promoVigente(prod, [{ ...happy, activo: false }], miercoles(18))).toBeNull();
    expect(promoVigente({ ...prod, precio_unitario: 3000 }, [fija], miercoles(18))).toBeNull(); // no rebaja nada
  });
});

describe('esquemas del menú', () => {
  it('categoría: nombre obligatorio', () => {
    expect(categoria.safeParse({ nombre: 'Bebidas' }).success).toBe(true);
    expect(categoria.safeParse({ nombre: '  ' }).success).toBe(false);
  });
  it('oferta: horas HH:MM distintas, días válidos, % entre 0 y 100', () => {
    const base = { nombre: 'Happy', tipo: 'PORCENTAJE', valor: 30, dias: [5, 3, 3], hora_inicio: '17:00', hora_fin: '19:00' };
    expect(precioHorario.parse(base).dias).toEqual([3, 5]); // sin repetidos y ordenados
    expect(precioHorario.safeParse({ ...base, valor: 120 }).success).toBe(false);
    expect(precioHorario.safeParse({ ...base, hora_inicio: '25:00' }).success).toBe(false);
    expect(precioHorario.safeParse({ ...base, hora_fin: '17:00' }).success).toBe(false);
    expect(precioHorario.safeParse({ ...base, dias: [] }).success).toBe(false);
    expect(precioHorario.safeParse({ ...base, tipo: 'PRECIO_FIJO', valor: 4500 }).success).toBe(true);
    expect(precioHorarioUpdate.safeParse({ activo: false }).success).toBe(true);
  });
});

const { gruposDeProducto, validarSeleccion } = require('../src/services/grupos');
const { analizarProductos, calcularReposicion } = require('../src/services/reposicion');
const { grupo } = require('../src/schemas/menuSchemas');

describe('grupos de modificadores (lógica pura)', () => {
  const coccion = { id: 1, nombre: 'Punto de cocción', obligatorio: true, max_selecciones: 1, todos: false, producto_ids: [10], activo: true, orden: 0 };
  const extras = { id: 2, nombre: 'Extras', obligatorio: false, max_selecciones: 2, todos: true, producto_ids: [], activo: true, orden: 1 };
  const carne = { id: 10, nombre_producto: 'Carne' };
  const pasta = { id: 11, nombre_producto: 'Pasta' };

  it('aplican a los platos enlazados o a todos, solo si están activos', () => {
    expect(gruposDeProducto(carne, [coccion, extras]).map((g) => g.id)).toEqual([1, 2]);
    expect(gruposDeProducto(pasta, [coccion, extras]).map((g) => g.id)).toEqual([2]);
    expect(gruposDeProducto(carne, [{ ...coccion, activo: false }, extras]).map((g) => g.id)).toEqual([2]);
  });

  it('un grupo obligatorio exige elegir; el máximo se respeta; lo sin grupo no cuenta', () => {
    expect(validarSeleccion(carne, [coccion], [])).toMatch(/necesita que elijas punto de cocción/);
    expect(validarSeleccion(carne, [coccion], [{ id: 5, grupoId: 1 }])).toBeNull();
    expect(validarSeleccion(carne, [coccion], [{ id: 5, grupoId: 1 }, { id: 6, grupoId: 1 }])).toMatch(/máximo 1/);
    expect(validarSeleccion(carne, [coccion], [{ id: 9, grupoId: null }])).toMatch(/necesita/); // un extra suelto no cumple el grupo
    expect(validarSeleccion(pasta, [coccion], [])).toBeNull(); // la pasta no usa ese grupo
    expect(validarSeleccion(pasta, [extras], [{ id: 1, grupoId: 2 }, { id: 2, grupoId: 2 }, { id: 3, grupoId: 2 }])).toMatch(/máximo 2/);
  });

  it('esquema: nombre obligatorio, máximo 1–20 o vacío', () => {
    expect(grupo.safeParse({ nombre: 'Leche', obligatorio: true, max_selecciones: 1 }).success).toBe(true);
    expect(grupo.safeParse({ nombre: ' ' }).success).toBe(false);
    expect(grupo.safeParse({ nombre: 'X', max_selecciones: 0 }).success).toBe(false);
    expect(grupo.parse({ nombre: 'X', max_selecciones: '' }).max_selecciones).toBeNull();
  });
});

describe('combos en la disponibilidad y la reposición', () => {
  const base = { stock_minimo: 0, stock_objetivo: null, costo_promedio: 0, unidad_compra: null, factor_compra: 1, unidad_medida: '94', codigo: 'X', receta: [], stock_actual: 0 };
  const p = (id, tipo, extra = {}) => ({ ...base, id, tipo, nombre_producto: `P${id}`, ...extra });

  it('un combo está disponible mientras haya de todos sus componentes: gana el más escaso', () => {
    const tomate = p(1, 'INSUMO', { stock_actual: 450, unidad_medida: 'GRM' });
    const pizza = p(2, 'RECETA', { receta: [{ insumoId: 1, cantidad: 100 }] }); // 4 porciones
    const gaseosa = p(3, 'VENTA', { stock_actual: 10 });
    const combo = p(4, 'COMBO', { combo: [{ productoId: 2, cantidad: 1 }, { productoId: 3, cantidad: 2 }] });
    const a = analizarProductos([tomate, pizza, gaseosa, combo]);
    expect(a.get(4).disponible).toBe(4); // pizzas: 4; gaseosas: 10 / 2 = 5
    expect(a.get(4).alerta).toBe(false);
    // Se acaban las gaseosas: el combo se agota.
    expect(analizarProductos([tomate, pizza, { ...gaseosa, stock_actual: 1 }, combo]).get(4)).toMatchObject({ disponible: 0, estado: 'AGOTADO' });
  });

  it('un combo sin componentes no está disponible; un combo nunca se repone', () => {
    expect(analizarProductos([p(4, 'COMBO', { combo: [] })]).get(4).disponible).toBe(0);
    const combo = p(4, 'COMBO', { stock_minimo: 5, combo: [{ productoId: 3, cantidad: 1 }] });
    const gaseosa = p(3, 'VENTA', { stock_actual: 0 });
    expect(calcularReposicion([gaseosa, combo]).map((s) => s.productoId)).not.toContain(4);
  });
});
