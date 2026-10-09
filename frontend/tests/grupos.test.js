import { describe, it, expect } from 'vitest';
import { gruposDePlato, ofertaDeModificadores, problemaDeSeleccion } from '../src/utils/grupos';

const coccion = { id: 1, nombre: 'Punto de cocción', obligatorio: true, max_selecciones: 1, todos: false, productoIds: [10], activo: true, orden: 0 };
const extrasG = { id: 2, nombre: 'Extras pagos', obligatorio: false, max_selecciones: 2, todos: true, productoIds: [], activo: true, orden: 1 };
const mods = [
  { id: 1, nombre: 'Término medio', grupoId: 1 },
  { id: 2, nombre: 'Bien cocida', grupoId: 1 },
  { id: 3, nombre: 'Extra queso', grupoId: 2 },
  { id: 4, nombre: 'Sin sal', grupoId: null },
];
const carne = { id: 10, nombre_producto: 'Carne' };
const pasta = { id: 11, nombre_producto: 'Pasta' };

describe('grupos de modificadores en el frontend', () => {
  it('cada plato ve solo los grupos que le aplican', () => {
    expect(gruposDePlato(carne, [coccion, extrasG]).map((g) => g.id)).toEqual([1, 2]);
    expect(gruposDePlato(pasta, [coccion, extrasG]).map((g) => g.id)).toEqual([2]);
  });

  it('la oferta separa los grupos de los extras sueltos y oculta los de grupos que no aplican', () => {
    const o = ofertaDeModificadores(pasta, mods, [coccion, extrasG]);
    expect(o.grupos.map((g) => g.grupo.id)).toEqual([2]);
    expect(o.sueltos.map((m) => m.id)).toEqual([4]); // «Término medio» y «Bien cocida» no se ofrecen a la pasta
    const c = ofertaDeModificadores(carne, mods, [coccion, extrasG]);
    expect(c.grupos[0].mods.map((m) => m.id)).toEqual([1, 2]);
  });

  it('un grupo desactivado deja a sus modificadores como extras sueltos', () => {
    const o = ofertaDeModificadores(carne, mods, [{ ...coccion, activo: false }, extrasG]);
    expect(o.sueltos.map((m) => m.id)).toContain(1);
  });

  it('dice qué falta o sobra', () => {
    expect(problemaDeSeleccion(carne, mods, [coccion], [])).toBe('Elige punto de cocción (obligatorio).');
    expect(problemaDeSeleccion(carne, mods, [coccion], [1])).toBeNull();
    expect(problemaDeSeleccion(carne, mods, [coccion], [1, 2])).toMatch(/máximo 1/);
    expect(problemaDeSeleccion(pasta, mods, [coccion], [])).toBeNull();
  });
});
