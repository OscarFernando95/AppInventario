const { precioDeItem, repartirItems, totalesDeCuenta, propinaSugerida } = require('../src/services/cuentas');
const { ajusteSalida } = require('../src/schemas/restauranteSchemas');
const { cuentaAbrir, itemAgregar, cuentaCobrar } = require('../src/schemas/mesaSchemas');
const { conDependencias, CATALOGO } = require('../src/services/permisos');

describe('precioDeItem', () => {
  it('precio de lista + extras de los modificadores', () => {
    expect(precioDeItem({ producto: { precio_unitario: '20000' }, modsDetalle: [{ precio_extra: 2000 }, { precio_extra: 500 }] })).toBe(22500);
  });
  it('un servicio toma su precio', () => {
    expect(precioDeItem({ servicio: { precio: '50000' } })).toBe(50000);
  });
});

describe('repartirItems (dividir la cuenta)', () => {
  const pendientes = [{ id: 1, cantidad: '2' }, { id: 2, cantidad: '1' }, { id: 3, cantidad: '3' }];

  it('sin selección se cobra todo', () => {
    const r = repartirItems(pendientes);
    expect(r.cobrar.map((c) => [c.item.id, c.cantidad])).toEqual([[1, 2], [2, 1], [3, 3]]);
    expect(r.partir).toEqual([]);
  });

  it('cobrar una parte de un ítem deja el resto pendiente', () => {
    const r = repartirItems(pendientes, [{ itemId: 1, cantidad: 1 }, { itemId: 2, cantidad: 1 }]);
    expect(r.cobrar.map((c) => [c.item.id, c.cantidad])).toEqual([[1, 1], [2, 1]]);
    expect(r.partir).toEqual([{ item: pendientes[0], restante: 1 }]);
  });

  it('rechaza cantidades de más, ítems ajenos, repetidos y cantidades no positivas', () => {
    expect(() => repartirItems(pendientes, [{ itemId: 2, cantidad: 2 }])).toThrow(/SELECCION:No se pueden cobrar/);
    expect(() => repartirItems(pendientes, [{ itemId: 9, cantidad: 1 }])).toThrow(/SELECCION:Uno de los ítems/);
    expect(() => repartirItems(pendientes, [{ itemId: 1, cantidad: 1 }, { itemId: 1, cantidad: 1 }])).toThrow(/repetidos/);
    expect(() => repartirItems(pendientes, [{ itemId: 1, cantidad: 0 }])).toThrow(/mayor a 0/);
  });

  it('cantidades decimales (kg) no dejan restos por redondeo', () => {
    const r = repartirItems([{ id: 1, cantidad: '0.3' }], [{ itemId: 1, cantidad: 0.1 + 0.2 }]);
    expect(r.partir).toEqual([]);
  });
});

describe('totalesDeCuenta', () => {
  it('suma lo activo; lo anulado no cuenta; lo cobrado se separa de lo pendiente', () => {
    const t = totalesDeCuenta([
      { estado: 'ACTIVO', ventaId: 7, cantidad: 1, precio: 5000 },
      { estado: 'ACTIVO', ventaId: null, cantidad: 2, precio: 3000 },
      { estado: 'ANULADO', ventaId: null, cantidad: 1, precio: 99999 },
    ]);
    expect(t).toEqual({ total: 11000, cobrado: 5000, pendiente: 6000 });
  });
});

describe('propinaSugerida', () => {
  it('10 % redondeado a los 100 pesos más cercanos', () => {
    expect(propinaSugerida(23450, 10)).toBe(2300);
    expect(propinaSugerida(100000, 10)).toBe(10000);
    expect(propinaSugerida(1000, 0)).toBe(0);
  });
});

describe('esquemas de mesas', () => {
  it('abrir cuenta: mesa o etiqueta', () => {
    expect(cuentaAbrir.safeParse({ mesaId: 3 }).success).toBe(true);
    expect(cuentaAbrir.safeParse({ etiqueta: 'Para llevar' }).success).toBe(true);
    expect(cuentaAbrir.safeParse({}).success).toBe(false);
    expect(cuentaAbrir.safeParse({ mesaId: '' }).success).toBe(false);
  });

  it('agregar ítem: producto o servicio (no ambos ni ninguno); cantidad 1 por omisión', () => {
    expect(itemAgregar.parse({ productoId: 1 }).cantidad).toBe(1);
    expect(itemAgregar.safeParse({ productoId: 1, servicioId: 2 }).success).toBe(false);
    expect(itemAgregar.safeParse({}).success).toBe(false);
    expect(itemAgregar.safeParse({ productoId: 1, cantidad: 0 }).success).toBe(false);
  });

  it('cobrar: propina nunca negativa y 0 por omisión', () => {
    expect(cuentaCobrar.parse({}).propina).toBe(0);
    expect(cuentaCobrar.safeParse({ propina: -1 }).success).toBe(false);
    expect(cuentaCobrar.parse({ propina: '1500.456' }).propina).toBe(1500.46);
  });
});

describe('permisos de mesas', () => {
  it('están en el catálogo', () => {
    const codigos = CATALOGO.map((p) => p.codigo);
    expect(codigos).toEqual(expect.arrayContaining(['mesas.anular_items', 'mesas.gestionar']));
  });
  it('Cocina arrastra Mesas y Mesas arrastra Ventas, Inventario y Clientes', () => {
    expect(conDependencias(['Cocina']).sort()).toEqual(['Clientes', 'Cocina', 'Inventario', 'Mesas', 'Ventas']);
  });
});

describe('producción', () => {
  it('ajusteSalida sigue rechazando CONTEO', () => {
    expect(ajusteSalida.safeParse({ productoId: 1, tipo: 'CONTEO', cantidad: 1 }).success).toBe(false);
  });
});
