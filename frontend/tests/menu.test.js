import { describe, it, expect } from 'vitest';
import { ordenarProductos, categoriasConProductos, deCategoria, precioVigente, tieneOferta } from '../src/utils/menu';

const cats = [{ id: 1, nombre: 'Bebidas' }, { id: 2, nombre: 'Postres' }];
const prods = [
  { id: 1, nombre_producto: 'Torta', categoriaId: 2, orden_menu: null },
  { id: 2, nombre_producto: 'Té', categoriaId: 1, orden_menu: 2 },
  { id: 3, nombre_producto: 'Café', categoriaId: 1, orden_menu: 1 },
  { id: 4, nombre_producto: 'Agua', categoriaId: 1, orden_menu: null },
  { id: 5, nombre_producto: 'Sal', categoriaId: null },
  { id: 6, nombre_producto: 'Antigua', categoriaId: 99 }, // su categoría ya no existe
];

describe('menú: orden y categorías', () => {
  it('ordena por categoría, luego por orden propio (los sin orden al final) y por nombre; lo sin categoría, al final', () => {
    expect(ordenarProductos(prods, cats).map((p) => p.nombre_producto)).toEqual(['Café', 'Té', 'Agua', 'Torta', 'Antigua', 'Sal']);
  });

  it('las pestañas solo traen categorías con productos, con su cantidad, y «Sin categoría» si hay sueltos', () => {
    expect(categoriasConProductos(prods, cats)).toEqual([
      { id: 1, nombre: 'Bebidas', n: 3 }, { id: 2, nombre: 'Postres', n: 1 }, { id: null, nombre: 'Sin categoría', n: 2 },
    ]);
    expect(categoriasConProductos(prods.filter((p) => p.categoriaId === 1), cats)).toEqual([{ id: 1, nombre: 'Bebidas', n: 3 }]);
    expect(categoriasConProductos([], cats)).toEqual([]);
  });

  it('filtra por categoría; null = sin categoría (incluida la que ya no existe); undefined = todos', () => {
    expect(deCategoria(prods, 1, cats)).toHaveLength(3);
    expect(deCategoria(prods, null, cats).map((p) => p.id)).toEqual([5, 6]);
    expect(deCategoria(prods, undefined, cats)).toHaveLength(6);
  });
});

describe('precio vigente', () => {
  it('usa la oferta si la hay; la oferta solo cuenta si realmente rebaja', () => {
    expect(precioVigente({ precio_unitario: '10000.00' })).toBe(10000);
    expect(precioVigente({ precio_unitario: '10000.00', precio_vigente: 7000 })).toBe(7000);
    expect(tieneOferta({ precio_unitario: '10000.00', precio_vigente: 7000 })).toBe(true);
    expect(tieneOferta({ precio_unitario: '10000.00' })).toBe(false);
    expect(tieneOferta({ precio_unitario: '10000.00', precio_vigente: 10000 })).toBe(false);
  });
});
