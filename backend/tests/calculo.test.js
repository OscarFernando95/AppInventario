const { calcularVenta, calcularTotalCompra, round2 } = require('../src/services/calculo');

describe('calcularVenta (POS: precio con IVA incluido)', () => {
  it('desglosa IVA del 19% correctamente', () => {
    const r = calcularVenta([{ cantidad: 2, precioConIva: 1190, porcentajeIva: 19 }]);
    expect(r.subtotal_bruto).toBe(2000);
    expect(r.total_impuestos).toBe(380);
    expect(r.total).toBe(2380);
  });

  it('suma varias líneas con IVAs distintos', () => {
    const r = calcularVenta([
      { cantidad: 1, precioConIva: 1190, porcentajeIva: 19 },
      { cantidad: 3, precioConIva: 105, porcentajeIva: 5 },
      { cantidad: 2, precioConIva: 500, porcentajeIva: 0 },
    ]);
    // línea 2: 105/1.05 = 100 base * 3 = 300 ; IVA 15
    // línea 3: sin IVA -> 1000 base, 0 IVA
    expect(r.subtotal_bruto).toBe(round2(1000 + 300 + 1000));
    expect(r.total_impuestos).toBe(round2(190 + 15 + 0));
    expect(r.total).toBe(round2(r.subtotal_bruto + r.total_impuestos));
  });

  it('resta el descuento global del total (nunca lo suma)', () => {
    const r = calcularVenta([{ cantidad: 1, precioConIva: 1000, porcentajeIva: 0 }], 250);
    expect(r.descuento_global).toBe(250);
    expect(r.total).toBe(750);
  });

  it('ignora descuentos negativos', () => {
    const r = calcularVenta([{ cantidad: 1, precioConIva: 1000, porcentajeIva: 0 }], -999);
    expect(r.descuento_global).toBe(0);
    expect(r.total).toBe(1000);
  });

  it('marca productoId/servicioId en cada detalle', () => {
    const r = calcularVenta([
      { cantidad: 1, precioConIva: 100, porcentajeIva: 0, productoId: 7 },
      { cantidad: 1, precioConIva: 100, porcentajeIva: 0, servicioId: 3 },
    ]);
    expect(r.detalles[0]).toMatchObject({ productoId: 7, servicioId: null });
    expect(r.detalles[1]).toMatchObject({ productoId: null, servicioId: 3 });
  });
});

describe('calcularTotalCompra', () => {
  it('suma cantidad * costo por línea', () => {
    expect(calcularTotalCompra([
      { cantidad: 3, costoUnitario: 100.5 },
      { cantidad: 2, costoUnitario: 10 },
    ])).toBe(321.5);
  });

  it('devuelve 0 sin líneas', () => {
    expect(calcularTotalCompra([])).toBe(0);
  });
});

describe('round2', () => {
  it('corrige el ruido de coma flotante', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1190 / 1.19)).toBe(1000);
  });
});
