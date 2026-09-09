const { ventaCreate, compraCreate, pedidoCreate } = require('../src/schemas/transaccionSchemas');
const { informeQuery } = require('../src/schemas/informeSchemas');
const { producto } = require('../src/schemas/catalogoSchemas');

describe('ventaCreate', () => {
  it('acepta una venta con una línea de producto', () => {
    const r = ventaCreate.safeParse({
      detalles: [{ productoId: 1, cantidad: 2, precio_unitario: 1190 }],
    });
    expect(r.success).toBe(true);
    expect(r.data.detalles[0].cantidad).toBe(2); // coaccionado a número
  });

  it('rechaza detalles vacíos', () => {
    expect(ventaCreate.safeParse({ detalles: [] }).success).toBe(false);
  });

  it('rechaza una línea sin producto ni servicio', () => {
    const r = ventaCreate.safeParse({ detalles: [{ cantidad: 1, precio_unitario: 10 }] });
    expect(r.success).toBe(false);
  });

  it('rechaza cantidad <= 0', () => {
    const r = ventaCreate.safeParse({ detalles: [{ servicioId: 1, cantidad: 0, precio_unitario: 10 }] });
    expect(r.success).toBe(false);
  });

  it('rechaza precio negativo', () => {
    const r = ventaCreate.safeParse({ detalles: [{ servicioId: 1, cantidad: 1, precio_unitario: -5 }] });
    expect(r.success).toBe(false);
  });
});

describe('compraCreate', () => {
  it('exige proveedorId', () => {
    expect(compraCreate.safeParse({ detalles: [{ productoId: 1, cantidad: 1, costo_unitario: 5 }] }).success).toBe(false);
  });

  it('acepta línea de gasto sin productoId', () => {
    const r = compraCreate.safeParse({
      proveedorId: 3,
      detalles: [{ descripcion_gasto: 'Flete', cantidad: 1, costo_unitario: 20000 }],
    });
    expect(r.success).toBe(true);
  });
});

describe('pedidoCreate', () => {
  it('exige productoId en cada línea', () => {
    const r = pedidoCreate.safeParse({ proveedorId: 1, detalles: [{ cantidad_pedida: 1, costo_estimado: 10 }] });
    expect(r.success).toBe(false);
  });
});

describe('informeQuery', () => {
  const base = { tipo: 'ventas_resumen', start: '2026-01-01', end: '2026-03-01' };

  it('acepta un rango válido', () => {
    expect(informeQuery.safeParse(base).success).toBe(true);
  });

  it('rechaza tipo desconocido', () => {
    expect(informeQuery.safeParse({ ...base, tipo: 'otro' }).success).toBe(false);
  });

  it('rechaza start > end', () => {
    expect(informeQuery.safeParse({ ...base, start: '2026-05-01', end: '2026-01-01' }).success).toBe(false);
  });

  it('rechaza ventanas de más de 366 días', () => {
    expect(informeQuery.safeParse({ ...base, start: '2020-01-01', end: '2026-01-01' }).success).toBe(false);
  });

  it('rechaza fechas inválidas', () => {
    expect(informeQuery.safeParse({ ...base, start: 'no-es-fecha' }).success).toBe(false);
  });
});

describe('producto (catálogo)', () => {
  it('exige codigo, nombre_producto y precio', () => {
    expect(producto.safeParse({ nombre_producto: 'x' }).success).toBe(false);
  });

  it('descarta campos desconocidos (anti mass-assignment)', () => {
    const r = producto.safeParse({
      codigo: 'A1', nombre_producto: 'Cable', precio_unitario: 1000,
      empresaId: 999, id: 5, stock_actual: 3,
    });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('empresaId');
    expect(r.data).not.toHaveProperty('id');
  });
});
