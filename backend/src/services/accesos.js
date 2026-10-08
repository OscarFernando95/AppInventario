'use strict';

const { RolEmpresa } = require('../models');
const { permisosDe, modulosDeAcceso } = require('./permisos');

/**
 * Qué puede hacer y a qué módulos entra un usuario en CADA una de sus empresas.
 * `usuario` viene con `Role` y `Empresas` (con sus `Modulos` y la fila de unión, que trae `rolEmpresaId`).
 * Devuelve { [empresaId]: { modulos, acceso, permisos, rolPropio } }.
 */
async function accesosPorEmpresa(usuario) {
  const empresas = usuario.Empresas || [];
  const rolIds = [...new Set(empresas.map((e) => e.UsuarioEmpresa?.rolEmpresaId).filter(Boolean))];
  const roles = rolIds.length > 0 ? await RolEmpresa.findAll({ where: { id: rolIds } }) : [];
  const rolPorId = new Map(roles.map((r) => [r.id, r]));

  const resultado = {};
  for (const e of empresas) {
    const modulos = (e.Modulos || []).map((m) => m.nombre_codigo);
    const rolPropio = rolPorId.get(e.UsuarioEmpresa?.rolEmpresaId) || null;
    resultado[e.id] = {
      modulos,
      acceso: modulosDeAcceso(modulos, rolPropio),
      permisos: permisosDe(usuario.Role ? usuario.Role.tipo : null, rolPropio),
      rolPropio: rolPropio ? { id: rolPropio.id, nombre: rolPropio.nombre } : null,
    };
  }
  return resultado;
}

module.exports = { accesosPorEmpresa };
