'use strict';

/**
 * Dependencias entre módulos contratables.
 *
 * Un módulo "amarrado" no funciona sin los que requiere (p. ej. Ventas descuenta
 * Inventario y exige un Cliente). Se valida al ASIGNAR módulos a una empresa
 * (empresaController); no se re-evalúa en cada request para no romper empresas
 * antiguas que se contrataron antes de existir estas reglas.
 *
 * Los nombres coinciden con `modulos.nombre_codigo`.
 */
const REQUIERE = {
  Inventario: [],
  Proveedores: [],
  Clientes: [],
  Servicios: [],
  Ventas: ['Inventario', 'Clientes'],
  Compras: ['Inventario', 'Proveedores'],
  Pedidos: ['Inventario', 'Proveedores'],
  Informes: ['Ventas'],
  Recetas: ['Inventario'],
  Caja: ['Ventas'],
  Mesas: ['Ventas'],
  Cocina: ['Mesas'],
  Gastos: [],
  'Cuentas por cobrar': ['Ventas', 'Clientes'],
  'Cuentas por pagar': ['Compras', 'Proveedores'],
};

/** Tipos de negocio admitidos (cambia los módulos SUGERIDOS en el alta, no las reglas). */
const TIPOS_NEGOCIO = ['COMERCIO', 'RESTAURANTE', 'SERVICIOS'];

/**
 * Devuelve las dependencias que faltan: [{ modulo, faltan: [...] }].
 * `seleccionados` es un iterable de nombres de módulo.
 */
function dependenciasFaltantes(seleccionados) {
  const set = new Set(seleccionados);
  const problemas = [];
  for (const modulo of set) {
    const faltan = (REQUIERE[modulo] || []).filter((dep) => !set.has(dep));
    if (faltan.length > 0) problemas.push({ modulo, faltan });
  }
  return problemas;
}

/** Mensaje legible para un 400: «Ventas requiere Inventario y Clientes; …». */
function mensajeDependencias(problemas) {
  const lista = (arr) => (arr.length > 1 ? `${arr.slice(0, -1).join(', ')} y ${arr[arr.length - 1]}` : arr[0]);
  return problemas.map((p) => `${p.modulo} requiere ${lista(p.faltan)}`).join('; ') + '.';
}

module.exports = { REQUIERE, TIPOS_NEGOCIO, dependenciasFaltantes, mensajeDependencias };
