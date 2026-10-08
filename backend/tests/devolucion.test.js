const {
  disponibleParaDevolver, valorDeLinea, repartoDeDinero, reintegro, estadoDevolucion,
} = require('../src/services/devolucion');
const { devolucionCreate } = require('../src/schemas/anulacionSchemas');

describe('valorDeLinea', () => {
  const linea = { precio_unitario: 11900, cantidad: 3, cantidad_devuelta: 1 };

  it('unidades devueltas × precio de la línea (con IVA y descuento de línea ya incluidos)', () => {
    expect(valorDeLinea(linea, 1)).toBe(11900);
    expect(valorDeLinea(linea, 2)).toBe(23800);
  });

  it('prorratea el descuento global de la venta (%)', () => {
    expect(valorDeLinea(linea, 2, 10)).toBe(21420); // 23.800 − 10 %
    expect(valorDeLinea({ precio_unitario: 100, cantidad: 3 }, 1, 33.33)).toBe(66.67); // redondeo a centavos
  });

  it('disponibleParaDevolver descuenta lo ya devuelto', () => {
    expect(disponibleParaDevolver(linea)).toBe(2);
    expect(disponibleParaDevolver({ cantidad: 2.5, cantidad_devuelta: 0 })).toBe(2.5);
    expect(disponibleParaDevolver({ cantidad: 1, cantidad_devuelta: 1 })).toBe(0);
  });
});

describe('repartoDeDinero', () => {
  it('contado: todo es dinero que vuelve al cliente', () => {
    expect(repartoDeDinero({ total: 50000, formaPago: '1', saldoPendiente: 0 })).toEqual({ credito_reducido: 0, dinero_devuelto: 50000 });
  });

  it('crédito: primero baja la deuda; solo lo que sobra se devuelve en dinero', () => {
    expect(repartoDeDinero({ total: 50000, formaPago: '2', saldoPendiente: 80000 })).toEqual({ credito_reducido: 50000, dinero_devuelto: 0 });
    expect(repartoDeDinero({ total: 50000, formaPago: '2', saldoPendiente: 20000 })).toEqual({ credito_reducido: 20000, dinero_devuelto: 30000 });
    expect(repartoDeDinero({ total: 50000, formaPago: '2', saldoPendiente: 0 })).toEqual({ credito_reducido: 0, dinero_devuelto: 50000 });
  });
});

describe('reintegro (inventario que vuelve)', () => {
  const foto = [{ productoId: 1, cantidad: 300 }, { productoId: 2, cantidad: 60 }]; // 3 platos: 100 g y 20 ml cada uno

  it('proporcional a lo que se descontó', () => {
    expect(reintegro(foto, 1, 3)).toEqual([{ productoId: 1, cantidad: 100 }, { productoId: 2, cantidad: 20 }]);
    expect(reintegro(foto, 3, 3)).toEqual(foto);
  });

  it('sin foto o con cantidades que redondean a 0 no devuelve nada', () => {
    expect(reintegro(null, 1, 3)).toEqual([]);
    expect(reintegro([{ productoId: 1, cantidad: 0.0004 }], 1, 2)).toEqual([]);
  });

  it('fracciones: 2,5 kg vendidos, se devuelve 1 kg', () => {
    expect(reintegro([{ productoId: 9, cantidad: 2.5 }], 1, 2.5)).toEqual([{ productoId: 9, cantidad: 1 }]);
  });
});

describe('estadoDevolucion', () => {
  it('NINGUNA · PARCIAL · TOTAL', () => {
    expect(estadoDevolucion({ total: 100, total_devuelto: 0 })).toBe('NINGUNA');
    expect(estadoDevolucion({ total: 100, total_devuelto: 40 })).toBe('PARCIAL');
    expect(estadoDevolucion({ total: 100, total_devuelto: 100 })).toBe('TOTAL');
    expect(estadoDevolucion({ total: 100, total_devuelto: 99.996 })).toBe('TOTAL');
  });
});

describe('esquema devolucionCreate', () => {
  const base = { items: [{ ventaDetalleId: 3, cantidad: 1 }], motivo: 'Llegó frío' };

  it('acepta una devolución válida y reingresar vale false por omisión', () => {
    const r = devolucionCreate.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data.items[0].reingresar).toBe(false);
    expect(devolucionCreate.safeParse({ ...base, reembolso: 'CAJA' }).success).toBe(true);
  });

  it('exige motivo, al menos una línea y cantidades positivas', () => {
    expect(devolucionCreate.safeParse({ ...base, motivo: ' ' }).success).toBe(false);
    expect(devolucionCreate.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(devolucionCreate.safeParse({ ...base, items: [{ ventaDetalleId: 3, cantidad: 0 }] }).success).toBe(false);
    expect(devolucionCreate.safeParse({ ...base, reembolso: 'EN_ESPECIE' }).success).toBe(false);
  });
});
