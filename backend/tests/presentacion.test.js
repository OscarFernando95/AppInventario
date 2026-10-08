const { aUnidadBase, presentacionDe } = require('../src/services/presentacion');

const kg = { unidad: 'KGM', factor: 1000 };

describe('aUnidadBase', () => {
  it('sin presentación la línea no cambia', () => {
    expect(aUnidadBase({ cantidad: 5, costo: 20, enPresentacion: false }, null)).toEqual({
      cantidad: 5, costo: 20, costoExacto: 20, unidad_presentacion: null, factor_presentacion: null,
    });
  });

  it('2,5 kg a $17.333 -> 2.500 g a $17,333', () => {
    const r = aUnidadBase({ cantidad: 2.5, costo: 17333, enPresentacion: true }, kg);
    expect(r.cantidad).toBe(2500);
    expect(r.costo).toBe(17.333);
    expect(r.unidad_presentacion).toBe('KGM');
    expect(r.factor_presentacion).toBe(1000);
  });

  it('el costo exacto conserva decimales que el costo guardado redondea', () => {
    const r = aUnidadBase({ cantidad: 1, costo: 10000, enPresentacion: true }, { unidad: 'BULTO', factor: 3 });
    expect(r.costo).toBe(3333.3333);
    expect(r.costoExacto).toBeCloseTo(3333.33333333, 6);
    expect(r.cantidad).toBe(3);
  });

  it('presentación con factor menor a 1 (compro en g un producto en kg)', () => {
    expect(aUnidadBase({ cantidad: 500, costo: 8, enPresentacion: true }, { unidad: 'GRM', factor: 0.001 }).cantidad).toBe(0.5);
  });

  it('exige presentación configurada y factor válido', () => {
    expect(() => aUnidadBase({ cantidad: 1, costo: 1, enPresentacion: true }, null, 'Harina')).toThrow(/Harina.*no tiene presentación/);
    expect(() => aUnidadBase({ cantidad: 1, costo: 1, enPresentacion: true }, { unidad: 'KGM', factor: 0 })).toThrow(/presentación/);
  });
});

describe('presentacionDe', () => {
  it('lee unidad y factor del producto; sin unidad no hay presentación', () => {
    expect(presentacionDe({ unidad_compra: 'KGM', factor_compra: '1000.000000' })).toEqual(kg);
    expect(presentacionDe({ unidad_compra: null, factor_compra: '1' })).toBeNull();
    expect(presentacionDe(null)).toBeNull();
  });
});
