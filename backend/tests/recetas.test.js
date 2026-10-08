const {
  consumoBase, consumoConModificadores, costoDeConsumo, construirMapaRecetas, porcionesDisponibles,
} = require('../src/services/recetas');
const { promedioPonderado, margen } = require('../src/services/costos');
const { modificador, conteoFisico, ajusteSalida } = require('../src/schemas/restauranteSchemas');

// 1 = tomate (g), 2 = aceite (ml); 10 = salsa (rinde 1000 ml); 20 = pizza
const recetas = new Map([
  [10, { rendimiento: 1000, items: [{ insumoId: 1, cantidad: 800 }, { insumoId: 2, cantidad: 100 }] }],
  [20, { rendimiento: 1, items: [{ insumoId: 10, cantidad: 150 }, { insumoId: 2, cantidad: 10 }] }],
]);

describe('consumoBase (expansión de sub-recetas)', () => {
  it('un ingrediente base se consume a sí mismo', () => {
    expect([...consumoBase(1, recetas, 5)]).toEqual([[1, 5]]);
  });

  it('expande una preparación según su rendimiento', () => {
    const c = consumoBase(10, recetas, 500); // 500 ml de una salsa que rinde 1000
    expect(c.get(1)).toBeCloseTo(400);
    expect(c.get(2)).toBeCloseTo(50);
  });

  it('suma el mismo ingrediente que llega por varias ramas', () => {
    const c = consumoBase(20, recetas);
    expect(c.get(1)).toBeCloseTo(120); // 150/1000 × 800
    expect(c.get(2)).toBeCloseTo(25); // 150/1000 × 100 + 10
    expect(c.has(10)).toBe(false); // la preparación no es ingrediente base
  });

  it('soporta factor negativo (quitar)', () => {
    expect(consumoBase(1, recetas, -3).get(1)).toBe(-3);
  });

  it('lanza CICLO si una preparación termina usándose a sí misma', () => {
    const ciclo = new Map([
      [1, { rendimiento: 1, items: [{ insumoId: 2, cantidad: 1 }] }],
      [2, { rendimiento: 1, items: [{ insumoId: 1, cantidad: 1 }] }],
    ]);
    expect(() => consumoBase(1, ciclo)).toThrow('CICLO');
  });

  it('la misma preparación usada dos veces en ramas distintas NO es un ciclo', () => {
    const rombo = new Map([
      [1, { rendimiento: 1, items: [{ insumoId: 2, cantidad: 1 }, { insumoId: 3, cantidad: 1 }] }],
      [2, { rendimiento: 1, items: [{ insumoId: 4, cantidad: 1 }] }],
      [3, { rendimiento: 1, items: [{ insumoId: 4, cantidad: 1 }] }],
    ]);
    expect(consumoBase(1, rombo).get(4)).toBe(2);
  });
});

describe('consumoConModificadores', () => {
  it('un extra agrega y un "sin" quita, sin bajar de cero', () => {
    const extra = { items: [{ insumoId: 2, cantidad: 5 }] };
    const sinSalsa = { items: [{ insumoId: 10, cantidad: -150 }] };
    expect(consumoConModificadores(20, recetas, [extra]).get(2)).toBeCloseTo(30);

    const sin = consumoConModificadores(20, recetas, [sinSalsa]);
    expect(sin.has(1)).toBe(false); // el tomate desaparece del consumo
    expect(sin.get(2)).toBeCloseTo(10);

    const demas = consumoConModificadores(20, recetas, [{ items: [{ insumoId: 1, cantidad: -9999 }] }]);
    expect(demas.has(1)).toBe(false); // clamp a 0, nunca consumo negativo
  });
});

describe('costo y porciones', () => {
  const costos = new Map([[1, 1], [2, 2]]);

  it('costo = Σ consumo × costo del ingrediente', () => {
    expect(costoDeConsumo(consumoBase(20, recetas), costos)).toBeCloseTo(170);
  });

  it('porcionesDisponibles acepta un Map de consumo', () => {
    const stock = new Map([[1, 5000], [2, 1000]]);
    expect(porcionesDisponibles(consumoBase(20, recetas), stock)).toBe(40);
    expect(porcionesDisponibles(new Map(), stock)).toBe(0);
  });

  it('construirMapaRecetas fuerza rendimiento 1 en platos e ignora el resto', () => {
    const mapa = construirMapaRecetas([
      { id: 1, tipo: 'INSUMO' },
      { id: 2, tipo: 'RECETA', rendimiento: 50, receta: [{ insumoId: 1, cantidad: '3' }] },
      { id: 3, tipo: 'PREPARACION', rendimiento: '500', receta: [] },
    ]);
    expect([...mapa.keys()]).toEqual([2, 3]);
    expect(mapa.get(2)).toEqual({ rendimiento: 1, lote: false, items: [{ insumoId: 1, cantidad: 3 }] });
    expect(mapa.get(3).rendimiento).toBe(500);
  });
});

describe('preparaciones por lotes (con stock propio)', () => {
  // salsa (10) pasa a producirse por lotes; la pizza (20) la usa
  const conLote = new Map(recetas);
  conLote.set(10, { ...recetas.get(10), lote: true });

  it('al vender un plato, la preparación por lotes cuenta como ingrediente base', () => {
    const c = consumoBase(20, conLote);
    expect(c.get(10)).toBeCloseTo(150); // 150 ml de salsa, no sus ingredientes
    expect(c.get(2)).toBeCloseTo(10);
    expect(c.has(1)).toBe(false);
  });

  it('producirla expande su receta (la raíz sí se expande)', () => {
    const c = consumoBase(10, conLote, 500, new Map(), [], true);
    expect(c.get(1)).toBeCloseTo(400);
    expect(c.get(2)).toBeCloseTo(50);
    expect(c.has(10)).toBe(false);
  });

  it('sin expandirLote la raíz por lotes también es un ingrediente base', () => {
    expect([...consumoBase(10, conLote, 3)]).toEqual([[10, 3]]);
  });

  it('una por lotes anidada dentro de otra por lotes no se expande al producir', () => {
    const anidado = new Map(conLote);
    anidado.set(30, { rendimiento: 1, lote: true, items: [{ insumoId: 10, cantidad: 2 }, { insumoId: 2, cantidad: 5 }] });
    const c = consumoBase(30, anidado, 4, new Map(), [], true);
    expect(c.get(10)).toBeCloseTo(8);
    expect(c.get(2)).toBeCloseTo(20);
    expect(c.has(1)).toBe(false);
  });

  it('construirMapaRecetas marca solo las PREPARACION con por_lotes', () => {
    const mapa = construirMapaRecetas([
      { id: 3, tipo: 'PREPARACION', por_lotes: true, rendimiento: 100, receta: [] },
      { id: 4, tipo: 'PREPARACION', por_lotes: false, receta: [] },
      { id: 5, tipo: 'RECETA', por_lotes: true, receta: [] },
    ]);
    expect(mapa.get(3).lote).toBe(true);
    expect(mapa.get(4).lote).toBe(false);
    expect(mapa.get(5).lote).toBe(false);
  });
});

describe('promedioPonderado', () => {
  it('pondera por existencias', () => {
    expect(promedioPonderado(1000, 2, 1000, 4)).toBe(3);
    expect(promedioPonderado(10, 100, 30, 200)).toBe(175);
  });

  it('sin stock (o negativo) toma el costo de la entrada', () => {
    expect(promedioPonderado(0, 99, 10, 7)).toBe(7);
    expect(promedioPonderado(-5, 99, 10, 7)).toBe(7);
  });

  it('una entrada de 0 unidades no cambia el costo', () => {
    expect(promedioPonderado(10, 5, 0, 100)).toBe(5);
  });

  it('redondea a 4 decimales', () => {
    expect(promedioPonderado(1, 1, 2, 1.00005)).toBe(1.0000);
    expect(promedioPonderado(3, 1, 1, 2)).toBe(1.25);
  });
});

describe('margen', () => {
  it('se calcula sobre el precio sin IVA', () => {
    expect(margen(11900, 19, 300)).toEqual({ precio_neto: 10000, margen: 9700, margen_pct: 97 });
  });

  it('precio 0 no divide por cero', () => {
    expect(margen(0, 19, 100)).toEqual({ precio_neto: 0, margen: -100, margen_pct: 0 });
  });
});

describe('esquemas de restaurante', () => {
  it('modificador: cantidad con signo, nunca 0', () => {
    expect(modificador.safeParse({ nombre: 'Sin azúcar', items: [{ insumoId: 1, cantidad: -5 }] }).success).toBe(true);
    expect(modificador.safeParse({ nombre: 'X', items: [{ insumoId: 1, cantidad: 0 }] }).success).toBe(false);
    expect(modificador.safeParse({ nombre: '  ' }).success).toBe(false);
  });

  it('merma: tipo y cantidad positiva; conteo: sin negativos', () => {
    expect(ajusteSalida.safeParse({ productoId: 1, tipo: 'MERMA', cantidad: 2.5 }).success).toBe(true);
    expect(ajusteSalida.safeParse({ productoId: 1, tipo: 'CONTEO', cantidad: 1 }).success).toBe(false);
    expect(ajusteSalida.safeParse({ productoId: 1, tipo: 'MERMA', cantidad: 0 }).success).toBe(false);
    expect(conteoFisico.safeParse({ items: [{ productoId: 1, cantidad_contada: -1 }] }).success).toBe(false);
    expect(conteoFisico.safeParse({ items: [] }).success).toBe(false);
  });
});
