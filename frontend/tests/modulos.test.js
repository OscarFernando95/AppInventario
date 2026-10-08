import { describe, it, expect } from 'vitest';
import { TIPOS_NEGOCIO, conDependencias, idsPorNombre, requeridoPor, tipoNegocio } from '../src/utils/modulos';

const modulos = [
  { id: 1, nombre_codigo: 'Inventario', requiere: [] },
  { id: 2, nombre_codigo: 'Ventas', requiere: ['Inventario', 'Clientes'] },
  { id: 3, nombre_codigo: 'Clientes', requiere: [] },
  { id: 4, nombre_codigo: 'Caja', requiere: ['Ventas'] },
  { id: 5, nombre_codigo: 'Recetas', requiere: ['Inventario'] },
];

describe('conDependencias', () => {
  it('marcar Ventas arrastra Inventario y Clientes', () => {
    expect(conDependencias([2], modulos).sort()).toEqual([1, 2, 3]);
  });

  it('es transitivo: Caja -> Ventas -> Inventario + Clientes', () => {
    expect(conDependencias([4], modulos).sort()).toEqual([1, 2, 3, 4]);
  });

  it('no duplica ni añade nada si ya está completo', () => {
    expect(conDependencias([1, 2, 3], modulos).sort()).toEqual([1, 2, 3]);
    expect(conDependencias([], modulos)).toEqual([]);
  });

  it('ignora ids desconocidos', () => {
    expect(conDependencias([99], modulos)).toEqual([]);
  });
});

describe('requeridoPor', () => {
  it('lista los módulos marcados que dependen de uno (lo bloquean)', () => {
    expect(requeridoPor(modulos[0], [1, 2, 5], modulos).sort()).toEqual(['Recetas', 'Ventas']);
    expect(requeridoPor(modulos[0], [1], modulos)).toEqual([]);
  });
});

describe('tipos de negocio', () => {
  it('los sugeridos de cada tipo ya son una selección válida (sin carencias)', () => {
    const catalogo = [
      ...modulos,
      { id: 6, nombre_codigo: 'Proveedores', requiere: [] },
      { id: 7, nombre_codigo: 'Compras', requiere: ['Inventario', 'Proveedores'] },
      { id: 8, nombre_codigo: 'Pedidos', requiere: ['Inventario', 'Proveedores'] },
      { id: 9, nombre_codigo: 'Informes', requiere: ['Ventas'] },
      { id: 10, nombre_codigo: 'Servicios', requiere: [] },
      { id: 11, nombre_codigo: 'Gastos', requiere: [] },
    ];
    for (const tipo of TIPOS_NEGOCIO) {
      const ids = idsPorNombre(tipo.sugeridos, catalogo);
      expect(ids).toHaveLength(tipo.sugeridos.length);
      expect(conDependencias(ids, catalogo).sort()).toEqual([...ids].sort());
    }
  });

  it('el restaurante sugiere Recetas y Caja; tipo desconocido cae en Comercio', () => {
    expect(tipoNegocio('RESTAURANTE').sugeridos).toEqual(expect.arrayContaining(['Recetas', 'Caja']));
    expect(tipoNegocio('X').value).toBe('COMERCIO');
  });
});
