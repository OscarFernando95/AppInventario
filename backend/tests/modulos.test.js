
const { REQUIERE, dependenciasFaltantes, mensajeDependencias } = require('../src/services/modulos');
const { porcionesDisponibles } = require('../src/services/recetas');
const { producto } = require('../src/schemas/catalogoSchemas');
const { cajaAbrir, cajaCerrar } = require('../src/schemas/cajaSchemas');

describe('dependencias entre módulos', () => {
  it('Ventas exige Inventario y Clientes; Compras, Inventario y Proveedores', () => {
    expect(REQUIERE.Ventas).toEqual(['Inventario', 'Clientes']);
    expect(REQUIERE.Compras).toEqual(['Inventario', 'Proveedores']);
  });

  it('una selección completa no tiene carencias', () => {
    expect(dependenciasFaltantes(['Inventario', 'Clientes', 'Ventas', 'Caja', 'Recetas'])).toEqual([]);
    expect(dependenciasFaltantes([])).toEqual([]);
  });

  it('reporta cada módulo con lo que le falta', () => {
    const p = dependenciasFaltantes(['Ventas', 'Inventario', 'Caja']);
    expect(p).toEqual([
      { modulo: 'Ventas', faltan: ['Clientes'] },
    ]);
    expect(dependenciasFaltantes(['Caja'])).toEqual([{ modulo: 'Caja', faltan: ['Ventas'] }]);
  });

  it('redacta un mensaje legible', () => {
    const msg = mensajeDependencias(dependenciasFaltantes(['Ventas', 'Compras']));
    expect(msg).toBe('Ventas requiere Inventario y Clientes; Compras requiere Inventario y Proveedores.');
  });

  it('todas las dependencias apuntan a módulos conocidos y no hay ciclos directos', () => {
    for (const [modulo, deps] of Object.entries(REQUIERE)) {
      for (const dep of deps) {
        expect(REQUIERE).toHaveProperty(dep);
        expect(REQUIERE[dep]).not.toContain(modulo);
      }
    }
  });
});

describe('porcionesDisponibles', () => {
  const stock = new Map([[1, 1000], [2, 100.5]]);

  it('manda el ingrediente más escaso', () => {
    expect(porcionesDisponibles([{ insumoId: 1, cantidad: 200 }, { insumoId: 2, cantidad: 15 }], stock)).toBe(5);
  });

  it('sin receta, o con un insumo sin stock, no hay porciones', () => {
    expect(porcionesDisponibles([], stock)).toBe(0);
    expect(porcionesDisponibles([{ insumoId: 1, cantidad: 10 }, { insumoId: 99, cantidad: 1 }], stock)).toBe(0);
  });

  it('no pierde una porción por error de coma flotante (0.3 / 0.1)', () => {
    expect(porcionesDisponibles([{ insumoId: 7, cantidad: 0.1 }], new Map([[7, 0.3]]))).toBe(3);
  });
});

describe('esquema de producto (tipo y receta)', () => {
  const base = { codigo: 'A', nombre_producto: 'Café', precio_unitario: 1000 };

  it('acepta stock fraccionario y lo redondea a 3 decimales', () => {
    const r = producto.safeParse({ ...base, tipo: 'INSUMO', stock_actual: '100.12345' });
    expect(r.success).toBe(true);
    expect(r.data.stock_actual).toBe(100.123);
  });

  it('acepta un plato con receta y rechaza tipos o cantidades inválidos', () => {
    expect(producto.safeParse({ ...base, tipo: 'RECETA', receta: [{ insumoId: 3, cantidad: '12.5' }] }).success).toBe(true);
    expect(producto.safeParse({ ...base, tipo: 'POSTRE' }).success).toBe(false);
    expect(producto.safeParse({ ...base, tipo: 'RECETA', receta: [{ insumoId: 3, cantidad: 0 }] }).success).toBe(false);
  });
});

describe('esquemas de caja', () => {
  it('abrir: la base es opcional y por defecto 0', () => {
    expect(cajaAbrir.parse({}).monto_inicial).toBe(0);
    expect(cajaAbrir.parse({ monto_inicial: '50000.555' }).monto_inicial).toBe(50000.56);
  });

  it('cerrar: exige el efectivo contado y no admite negativos', () => {
    expect(cajaCerrar.safeParse({}).success).toBe(false);
    expect(cajaCerrar.safeParse({ monto_contado: -1 }).success).toBe(false);
    expect(cajaCerrar.safeParse({ monto_contado: 0 }).success).toBe(true);
  });
});
