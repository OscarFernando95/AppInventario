const {
  estadoStock, objetivoDe, unidadesProducibles, analizarProductos, calcularReposicion, aPresentacionDePedido,
} = require('../src/services/reposicion');

const base = { stock_minimo: 0, stock_objetivo: null, costo_promedio: 0, unidad_compra: null, factor_compra: 1, unidad_medida: 'GRM', codigo: 'X' };
const prod = (id, nombre, tipo, extra = {}) => ({ ...base, id, nombre_producto: nombre, tipo, stock_actual: 0, receta: [], ...extra });

describe('estadoStock / objetivoDe', () => {
  it('AGOTADO, BAJO (en o bajo el mínimo) y OK; sin mínimo nunca es BAJO', () => {
    expect(estadoStock(0, 10)).toBe('AGOTADO');
    expect(estadoStock(10, 10)).toBe('BAJO');
    expect(estadoStock(3, 10)).toBe('BAJO');
    expect(estadoStock(11, 10)).toBe('OK');
    expect(estadoStock(5, 0)).toBe('OK');
    expect(estadoStock(0, 0)).toBe('AGOTADO');
  });

  it('"reponer hasta" configurado, o el doble del mínimo', () => {
    expect(objetivoDe({ stock_minimo: 10, stock_objetivo: 50 })).toBe(50);
    expect(objetivoDe({ stock_minimo: 10, stock_objetivo: null })).toBe(20);
    expect(objetivoDe({ stock_minimo: 10, stock_objetivo: 0 })).toBe(20);
  });
});

describe('analizarProductos: abarca todos los tipos', () => {
  const harina = prod(1, 'Harina', 'INSUMO', { stock_actual: 450, stock_minimo: 500 });
  const gaseosa = prod(2, 'Gaseosa', 'VENTA', { stock_actual: 8, stock_minimo: 10, unidad_medida: '94' });
  const masa = prod(3, 'Masa', 'PREPARACION', { rendimiento: 1000, stock_minimo: 600, receta: [{ insumoId: 1, cantidad: 500 }] });
  const pan = prod(4, 'Pan', 'RECETA', { stock_minimo: 5, receta: [{ insumoId: 3, cantidad: 200 }] });
  const sinMinimo = prod(5, 'Sal', 'INSUMO', { stock_actual: 0 });
  const a = analizarProductos([harina, gaseosa, masa, pan, sinMinimo]);

  it('producto e insumo usan su stock', () => {
    expect(a.get(1)).toMatchObject({ disponible: 450, estado: 'BAJO', alerta: true });
    expect(a.get(2)).toMatchObject({ disponible: 8, estado: 'BAJO', alerta: true });
  });

  it('preparación: unidades que se pueden producir con los ingredientes', () => {
    // masa rinde 1000 con 500 g de harina -> 450 g de harina producen 900
    expect(a.get(3).disponible).toBe(900);
    expect(a.get(3).estado).toBe('OK'); // 900 > 600
  });

  it('plato: porciones que se pueden preparar (sub-recetas incluidas)', () => {
    // 200 de masa por pan; 450 g de harina = 900 de masa -> 4 panes (<= 5: bajo)
    expect(a.get(4)).toMatchObject({ disponible: 4, estado: 'BAJO', alerta: true });
  });

  it('sin mínimo no hay alerta aunque esté agotado (pero el estado sí lo dice)', () => {
    expect(a.get(5)).toMatchObject({ estado: 'AGOTADO', alerta: false });
  });

  it('unidadesProducibles admite fracciones y vacío = 0', () => {
    expect(unidadesProducibles(new Map([[1, 2]]), new Map([[1, 5]]))).toBe(2.5);
    expect(unidadesProducibles(new Map(), new Map())).toBe(0);
  });
});

describe('calcularReposicion', () => {
  it('un insumo en su mínimo se repone hasta su objetivo', () => {
    const harina = prod(1, 'Harina', 'INSUMO', { stock_actual: 400, stock_minimo: 500, stock_objetivo: 2000, costo_promedio: 3 });
    const [s] = calcularReposicion([harina]);
    expect(s).toMatchObject({ productoId: 1, motivo: 'MINIMO', sugerido_base: 1600, costo_estimado: 4800 });
    expect(s.pedido).toBeNull(); // sin presentación de compra
  });

  it('sin objetivo se repone hasta el doble del mínimo; en OK no se sugiere nada', () => {
    expect(calcularReposicion([prod(1, 'A', 'VENTA', { stock_actual: 4, stock_minimo: 10 })])[0].sugerido_base).toBe(16);
    expect(calcularReposicion([prod(1, 'A', 'VENTA', { stock_actual: 50, stock_minimo: 10 })])).toEqual([]);
    expect(calcularReposicion([prod(1, 'A', 'VENTA', { stock_actual: 0, stock_minimo: 0 })])).toEqual([]);
  });

  it('un plato bajo su mínimo pide SUS ingredientes (no se pide el plato)', () => {
    const harina = prod(1, 'Harina', 'INSUMO', { stock_actual: 300 });
    const pan = prod(2, 'Pan', 'RECETA', { stock_minimo: 10, receta: [{ insumoId: 1, cantidad: 100 }] }); // 3 porciones; objetivo 20
    const s = calcularReposicion([harina, pan]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ productoId: 1, motivo: 'PLATOS', para: ['Pan'], sugerido_base: 1700 }); // 100 × 20 − 300
  });

  it('varios platos que comparten un ingrediente suman su necesidad', () => {
    const harina = prod(1, 'Harina', 'INSUMO', { stock_actual: 100 });
    const pan = prod(2, 'Pan', 'RECETA', { stock_minimo: 5, stock_objetivo: 10, receta: [{ insumoId: 1, cantidad: 100 }] });
    const pizza = prod(3, 'Pizza', 'RECETA', { stock_minimo: 5, stock_objetivo: 10, receta: [{ insumoId: 1, cantidad: 200 }] });
    const [s] = calcularReposicion([harina, pan, pizza]);
    expect(s.sugerido_base).toBe(100 * 10 + 200 * 10 - 100); // 2.900
    expect(s.para.sort()).toEqual(['Pan', 'Pizza']);
  });

  it('un ingrediente con mínimo propio toma el mayor entre su objetivo y lo que piden los platos', () => {
    const harina = prod(1, 'Harina', 'INSUMO', { stock_actual: 100, stock_minimo: 500, stock_objetivo: 5000 });
    const pan = prod(2, 'Pan', 'RECETA', { stock_minimo: 5, stock_objetivo: 10, receta: [{ insumoId: 1, cantidad: 100 }] });
    const [s] = calcularReposicion([harina, pan]);
    expect(s).toMatchObject({ motivo: 'MINIMO', sugerido_base: 4900 }); // 5.000 − 100 (mayor que 1.000 de los platos)
  });

  it('una preparación baja pide sus ingredientes', () => {
    const harina = prod(1, 'Harina', 'INSUMO', { stock_actual: 100 });
    const masa = prod(2, 'Masa', 'PREPARACION', { rendimiento: 1000, stock_minimo: 500, stock_objetivo: 1000, receta: [{ insumoId: 1, cantidad: 500 }] });
    const [s] = calcularReposicion([harina, masa]); // produce 200 (< 500); objetivo 1000 -> 500 de harina
    expect(s).toMatchObject({ productoId: 1, motivo: 'PLATOS', para: ['Masa'], sugerido_base: 400 });
  });

  it('lo agotado va primero', () => {
    const a = prod(1, 'A', 'VENTA', { stock_actual: 5, stock_minimo: 10 });
    const b = prod(2, 'B', 'VENTA', { stock_actual: 0, stock_minimo: 10 });
    expect(calcularReposicion([a, b]).map((s) => s.nombre_producto)).toEqual(['B', 'A']);
  });
});

describe('aPresentacionDePedido', () => {
  it('unidades medibles (kg): decimales hacia arriba; cajas: enteros hacia arriba', () => {
    const kg = { unidad_compra: 'KGM', factor_compra: 1000 };
    expect(aPresentacionDePedido(1700, kg)).toEqual({ cantidad: 1.7, unidad: 'KGM', cantidad_base: 1700 });
    expect(aPresentacionDePedido(1701, kg)).toEqual({ cantidad: 1.71, unidad: 'KGM', cantidad_base: 1710 });
    const caja = { unidad_compra: 'Caja x24', factor_compra: 24 };
    expect(aPresentacionDePedido(25, caja)).toEqual({ cantidad: 2, unidad: 'Caja x24', cantidad_base: 48 });
    expect(aPresentacionDePedido(24, caja).cantidad).toBe(1);
  });

  it('sin presentación no hay conversión', () => {
    expect(aPresentacionDePedido(10, { unidad_compra: null, factor_compra: 1 })).toBeNull();
  });
});
