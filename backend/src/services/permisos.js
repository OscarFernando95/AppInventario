'use strict';

const { REQUIERE } = require('./modulos');

/**
 * Catálogo de permisos. Cada uno protege una acción concreta (en el backend con `requirePermiso` o
 * `tiene(req, ...)`, y en el frontend ocultando el botón o la pantalla). Se agrupan para mostrarlos
 * en la pantalla de roles. El acceso a PANTALLAS enteras (Ventas, Caja…) no es un permiso: se controla
 * con los módulos del rol.
 */
const CATALOGO = [
  { codigo: 'ventas.anular', grupo: 'Ventas', etiqueta: 'Anular ventas directamente', descripcion: 'Sin este permiso solo puede solicitar la anulación y alguien con permiso la resuelve.' },
  { codigo: 'ventas.resolver_anulaciones', grupo: 'Ventas', etiqueta: 'Aprobar o rechazar solicitudes de anulación', descripcion: 'Resuelve las solicitudes que dejan otros usuarios.' },
  { codigo: 'ventas.devolver', grupo: 'Ventas', etiqueta: 'Registrar devoluciones de ventas', descripcion: 'Devolver parte o toda una venta (inventario y dinero).' },
  { codigo: 'caja.todas', grupo: 'Caja', etiqueta: 'Ver y manejar las cajas de todos', descripcion: 'Sin este permiso solo ve y maneja su propia caja.' },
  { codigo: 'caja.balance', grupo: 'Caja', etiqueta: 'Ver el dinero de la empresa', descripcion: 'El balance: capital, ventas, gastos, retiros y devoluciones.' },
  { codigo: 'cartera.anular_abonos', grupo: 'Cartera', etiqueta: 'Anular abonos de clientes', descripcion: '' },
  { codigo: 'cartera.pagar', grupo: 'Cartera', etiqueta: 'Gestionar cuentas por pagar', descripcion: 'Compras a crédito y pagos a proveedores.' },
  { codigo: 'gastos.anular', grupo: 'Gastos', etiqueta: 'Anular gastos', descripcion: '' },
  { codigo: 'inventario.conteo', grupo: 'Inventario', etiqueta: 'Registrar el conteo físico', descripcion: 'Ajusta el inventario al contar.' },
  { codigo: 'costos.ver', grupo: 'Costos', etiqueta: 'Ver costos y márgenes', descripcion: 'Costo de productos y platos, margen y rentabilidad.' },
  { codigo: 'auditoria.ver', grupo: 'Administración', etiqueta: 'Ver la auditoría', descripcion: 'Quién hizo qué y cuándo.' },
  { codigo: 'usuarios.gestionar', grupo: 'Administración', etiqueta: 'Gestionar el personal', descripcion: 'Crear y editar usuarios, solo con roles que no superen los suyos.' },
  { codigo: 'roles.gestionar', grupo: 'Administración', etiqueta: 'Gestionar roles y permisos', descripcion: 'Crear roles propios, solo con permisos que él mismo tiene.' },
];

/** Módulos que no se asignan por rol: su acceso lo decide un permiso (roles.gestionar). */
const MODULOS_DE_ADMINISTRACION = ['Roles y permisos'];

const TODOS = CATALOGO.map((p) => p.codigo);
const EXISTE = new Set(TODOS);

/**
 * Roles base: reproducen lo que había antes de existir los roles propios, para no cambiarle nada a nadie.
 *  - FRONT_ADMIN: todo (incluye lo que se agregue al catálogo después).
 *  - FRONT_USER: lo operativo; veía costos y márgenes.
 * Los BACKOFFICE_ADMIN no operan una empresa, pero tienen todo.
 */
const PERMISOS_BASE = {
  BACKOFFICE_ADMIN: TODOS,
  FRONT_ADMIN: TODOS,
  FRONT_USER: ['costos.ver'],
};

const ROLES_BASE = [
  { clave: 'FRONT_ADMIN', rolId: 2, nombre: 'Administrador', descripcion: 'Acceso total a los módulos de la empresa.' },
  { clave: 'FRONT_USER', rolId: 3, nombre: 'Operativo', descripcion: 'Opera ventas, compras e inventario; sin funciones de administración.' },
];

/** Permisos de un usuario en una empresa: los de su rol propio si lo tiene; si no, los del rol base. */
function permisosDe(tipoRol, rolEmpresa) {
  if (rolEmpresa) return (rolEmpresa.permisos || []).filter((p) => EXISTE.has(p));
  return PERMISOS_BASE[tipoRol] || [];
}

/**
 * Módulos a los que accede: los de la empresa, limitados a los del rol propio (NULL = todos).
 * Los de la empresa siguen mandando: un rol no puede dar acceso a un módulo no contratado.
 */
function modulosDeAcceso(modulosEmpresa, rolEmpresa) {
  if (!rolEmpresa || rolEmpresa.modulos == null) return modulosEmpresa;
  const permitidos = new Set(rolEmpresa.modulos);
  return modulosEmpresa.filter((m) => MODULOS_DE_ADMINISTRACION.includes(m) || permitidos.has(m));
}

/** ¿Todos los permisos de `hijo` están en `padre`? Evita que alguien entregue más de lo que tiene. */
function esSubconjunto(hijo, padre) {
  const set = new Set(padre);
  return hijo.every((p) => set.has(p));
}

/** Agrega los módulos requeridos por los elegidos (Ventas exige Inventario y Clientes, etc.). */
function conDependencias(modulos) {
  const set = new Set(modulos);
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const m of [...set]) {
      for (const dep of REQUIERE[m] || []) {
        if (!set.has(dep)) { set.add(dep); cambio = true; }
      }
    }
  }
  return [...set];
}

module.exports = { MODULOS_DE_ADMINISTRACION, CATALOGO, TODOS, PERMISOS_BASE, ROLES_BASE, permisosDe, modulosDeAcceso, esSubconjunto, conDependencias };
