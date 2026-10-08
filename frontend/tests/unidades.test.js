import { describe, it, expect } from 'vitest';
import {
  factorEstandar, etiquetaPresentacion, presentacionDe, aPresentacion, aUnidadBase, lineaVista,
} from '../src/utils/unidades';

describe('factorEstandar', () => {
  it('kg -> g = 1000, lb -> g, litros -> ml', () => {
    expect(factorEstandar('GRM', 'KGM')).toBe(1000);
    expect(factorEstandar('GRM', 'LBR')).toBe(453.592);
    expect(factorEstandar('GRM', 'ONZ')).toBe(28.3495);
    expect(factorEstandar('MLT', 'LTR')).toBe(1000);
  });

  it('también al revés (base kg, compro en g) y entre kg y lb', () => {
    expect(factorEstandar('KGM', 'GRM')).toBe(0.001);
    expect(factorEstandar('KGM', 'LBR')).toBe(0.453592);
  });

  it('sin equivalencia estándar entre magnitudes distintas o unidades libres', () => {
    expect(factorEstandar('GRM', 'LTR')).toBeUndefined();
    expect(factorEstandar('94', 'KGM')).toBeUndefined();
    expect(factorEstandar('GRM', 'Caja')).toBeUndefined();
  });
});

describe('conversión de líneas', () => {
  it('2,5 kg a $17.333 ↔ 2.500 g a $17,333: el total no cambia', () => {
    const base = aUnidadBase(2.5, 17333, 1000);
    expect(base).toEqual({ cantidad: 2500, costo: 17.333 });
    expect(base.cantidad * base.costo).toBeCloseTo(2.5 * 17333, 4);
    expect(aPresentacion(2500, 17.333, 1000)).toEqual({ cantidad: 2.5, costo: 17333 });
  });

  it('ida y vuelta con factor no entero no pierde el total', () => {
    const base = aUnidadBase(3, 10000, 3); // bulto de 3
    expect(base.cantidad).toBe(9);
    expect(aPresentacion(base.cantidad, base.costo, 3)).toEqual({ cantidad: 3, costo: 10000 });
  });
});

describe('lineaVista y helpers', () => {
  it('muestra en la presentación guardada, o en unidad base si no hay foto', () => {
    expect(lineaVista({ cantidadBase: 3000, costoBase: 18, unidad_presentacion: 'KGM', factor_presentacion: '1000.000000' }, 'GRM'))
      .toEqual({ cantidad: 3, costo: 18000, etiqueta: 'kg', enPresentacion: true });
    expect(lineaVista({ cantidadBase: 500, costoBase: 20, unidad_presentacion: null, factor_presentacion: null }, 'GRM'))
      .toEqual({ cantidad: 500, costo: 20, etiqueta: 'g', enPresentacion: false });
  });

  it('etiquetas y presentación del producto', () => {
    expect(etiquetaPresentacion('KGM')).toBe('kg');
    expect(etiquetaPresentacion('Caja x24')).toBe('Caja x24');
    expect(presentacionDe({ unidad_compra: 'KGM', factor_compra: '1000.000000' })).toEqual({ unidad: 'KGM', factor: 1000 });
    expect(presentacionDe({ unidad_compra: null, factor_compra: '1' })).toBeNull();
  });
});
