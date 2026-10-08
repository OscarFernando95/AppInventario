/**
 * Tipos de negocio y reglas de módulos "amarrados".
 *
 * Las dependencias (`requiere`) las manda el backend en GET /api/modulos (es
 * quien las hace cumplir); aquí solo se usan para guiar el formulario. Los
 * módulos SUGERIDOS por tipo de negocio son una ayuda de UI: se pueden cambiar.
 */

export const TIPOS_NEGOCIO = [
  {
    value: 'COMERCIO',
    label: 'Comercio',
    descripcion: 'Tienda de ropa, minimercado, ferretería…',
    sugeridos: ['Inventario', 'Proveedores', 'Clientes', 'Compras', 'Pedidos', 'Ventas', 'Gastos', 'Cuentas por cobrar', 'Cuentas por pagar', 'Informes'],
  },
  {
    value: 'RESTAURANTE',
    label: 'Restaurante / cafetería',
    descripcion: 'Platos que consumen ingredientes del inventario.',
    sugeridos: ['Inventario', 'Proveedores', 'Clientes', 'Compras', 'Pedidos', 'Ventas', 'Recetas', 'Mesas', 'Cocina', 'Caja', 'Gastos', 'Cuentas por pagar', 'Informes'],
  },
  {
    value: 'SERVICIOS',
    label: 'Servicios',
    descripcion: 'Consultoría, talleres, salones…',
    sugeridos: ['Inventario', 'Clientes', 'Servicios', 'Ventas', 'Caja', 'Gastos', 'Cuentas por cobrar', 'Informes'],
  },
];

export const tipoNegocio = (value) => TIPOS_NEGOCIO.find((t) => t.value === value) || TIPOS_NEGOCIO[0];

/** Mapa nombre -> módulo ({ id, nombre_codigo, requiere }). */
const porNombre = (modulos) => new Map(modulos.map((m) => [m.nombre_codigo, m]));

/** Ids + todo lo que esos módulos requieren (transitivo). Sin duplicados. */
export function conDependencias(ids, modulos) {
  const nombres = porNombre(modulos);
  const porId = new Map(modulos.map((m) => [m.id, m]));
  const resultado = new Set();
  const visitar = (modulo) => {
    if (!modulo || resultado.has(modulo.id)) return;
    resultado.add(modulo.id);
    (modulo.requiere || []).forEach((dep) => visitar(nombres.get(dep)));
  };
  ids.forEach((id) => visitar(porId.get(id)));
  return [...resultado];
}

/** Ids de los módulos de `modulos` que figuran en `nombres` (ignora los desconocidos). */
export function idsPorNombre(nombres, modulos) {
  const mapa = porNombre(modulos);
  return nombres.map((n) => mapa.get(n)?.id).filter((id) => id != null);
}

/**
 * Módulos seleccionados que requieren a `modulo` (lo "amarran": mientras
 * alguno siga marcado, `modulo` no se puede quitar).
 */
export function requeridoPor(modulo, seleccionadosIds, modulos) {
  return modulos
    .filter((m) => seleccionadosIds.includes(m.id) && (m.requiere || []).includes(modulo.nombre_codigo))
    .map((m) => m.nombre_codigo);
}
