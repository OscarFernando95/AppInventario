const { calcularVenta, calcularTotalCompra, clampPct, round2 } = require('../src/services/calculo');

describe('calcularVenta (POS: precio con IVA incluido)', () => {
  it('desglosa IVA del 19% correctamente', () => {
    const r = calcularVenta([{ cantidad: 2, precioConIva: 1190, porcentajeIva: 19, precioBase: 1190 }]);
    expect(r.subtotal_bruto).toBe(2000);
    expect(r.total_impuestos).toBe(380);
    expect(r.total).toBe(2380);
    expect(r.total_descuentos).toBe(0);
  });

  it('suma varias líneas con IVAs distintos', () => {
    const r = calcularVenta([
      { cantidad: 1, precioConIva: 1190, porcentajeIva: 19 },
      { cantidad: 3, precioConIva: 105, porcentajeIva: 5 },
      { cantidad: 2, precioConIva: 500, porcentajeIva: 0 },
    ]);
    expect(r.subtotal_bruto).toBe(round2(1000 + 300 + 1000));
    expect(r.total_impuestos).toBe(round2(190 + 15 + 0));
    expect(r.total).toBe(round2(r.subtotal_bruto + r.total_impuestos));
  });

  it('N1 — el descuento global es un PORCENTAJE del total con IVA', () => {
    // 1 línea de $100.000 con IVA 0, 10 % de descuento global
    const r = calcularVenta([{ cantidad: 1, precioConIva: 100_000, porcentajeIva: 0, precioBase: 100_000 }], 10);
    expect(r.descuento_global).toBe(10); // se guarda el porcentaje
    expect(r.total).toBe(90_000); // 100.000 - 10%
    expect(r.total_descuentos).toBe(10_000); // el monto del descuento
  });

  it('N1 — descuento global sobre líneas con IVA', () => {
    const r = calcularVenta([{ cantidad: 1, precioConIva: 1190, porcentajeIva: 19, precioBase: 1190 }], 50);
    expect(r.total).toBe(595); // 1190 - 50%
    expect(r.total_descuentos).toBe(595);
  });

  it('total_descuentos suma el descuento por línea y el global', () => {
    // precio de lista 1000, se vende a 800 (dcto de línea 200) + 25 % global
    const r = calcularVenta([{ cantidad: 2, precioConIva: 800, porcentajeIva: 0, precioBase: 1000 }], 25);
    const descItems = (1000 - 800) * 2; // 400
    const totalConIva = 800 * 2; // 1600
    const descGlobal = round2(totalConIva * 0.25); // 400
    expect(r.total).toBe(round2(totalConIva - descGlobal)); // 1200
    expect(r.total_descuentos).toBe(round2(descItems + descGlobal)); // 800
  });

  it('acota el porcentaje a [0, 100]', () => {
    expect(calcularVenta([{ cantidad: 1, precioConIva: 1000, porcentajeIva: 0 }], -5).descuento_global).toBe(0);
    expect(calcularVenta([{ cantidad: 1, precioConIva: 1000, porcentajeIva: 0 }], 150).descuento_global).toBe(100);
    expect(calcularVenta([{ cantidad: 1, precioConIva: 1000, porcentajeIva: 0 }], 100).total).toBe(0);
  });

  it('admite cantidades fraccionarias', () => {
    const r = calcularVenta([{ cantidad: 2.5, precioConIva: 1000, porcentajeIva: 0, precioBase: 1000 }]);
    expect(r.total).toBe(2500);
    expect(r.detalles[0].cantidad).toBe(2.5);
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

describe('clampPct', () => {
  it('acota a [0, 100]', () => {
    expect(clampPct(-1)).toBe(0);
    expect(clampPct(50)).toBe(50);
    expect(clampPct(200)).toBe(100);
    expect(clampPct('abc')).toBe(0);
  });
});

describe('calcularTotalCompra', () => {
  it('suma cantidad * costo por línea', () => {
    expect(calcularTotalCompra([
      { cantidad: 3, costoUnitario: 100.5 },
      { cantidad: 2, costoUnitario: 10 },
    ])).toBe(321.5);
  });

  it('admite cantidades fraccionarias', () => {
    expect(calcularTotalCompra([{ cantidad: 1.5, costoUnitario: 200 }])).toBe(300);
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
