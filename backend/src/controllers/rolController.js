'use strict';

const { sequelize, RolEmpresa, UsuarioEmpresa } = require('../models');
const { ValidationError, ForbiddenError } = require('../utils/errors');
const { invalidateAllProfiles } = require('../middlewares/auth');
const { auditar } = require('../utils/audit');
const {
  CATALOGO, TODOS, ROLES_BASE, PERMISOS_BASE, MODULOS_DE_ADMINISTRACION, esSubconjunto, conDependencias,
} = require('../services/permisos');

const NOMBRES_BASE = ROLES_BASE.map((r) => r.nombre.toLowerCase());

/** Módulos que se pueden repartir por rol: los de la empresa, sin los de administración. */
const modulosAsignables = (req) => [...req.empresaModulos].filter((m) => !MODULOS_DE_ADMINISTRACION.includes(m)).sort();

const aJson = (rol, usuarios = 0) => ({
  id: rol.id, nombre: rol.nombre, descripcion: rol.descripcion, permisos: rol.permisos, modulos: rol.modulos, usuarios,
});

const misPermisos = (req) => [...req.permisos];

/** Lo que recibe la pantalla: catálogo, roles base (solo lectura) y los roles propios con cuánta gente los usa. */
exports.getRoles = async (req, res) => {
  const [roles, usos] = await Promise.all([
    RolEmpresa.findAll({ where: { empresaId: req.empresaId }, order: [['nombre', 'ASC']] }),
    UsuarioEmpresa.findAll({ where: { empresaId: req.empresaId }, attributes: ['rolEmpresaId'], raw: true }),
  ]);
  const conteo = new Map();
  for (const u of usos) if (u.rolEmpresaId) conteo.set(u.rolEmpresaId, (conteo.get(u.rolEmpresaId) || 0) + 1);

  res.json({
    catalogo: CATALOGO,
    modulos: modulosAsignables(req),
    mis_permisos: misPermisos(req),
    base: ROLES_BASE.map((r) => ({ ...r, permisos: PERMISOS_BASE[r.clave], modulos: null })),
    propios: roles.map((r) => aJson(r, conteo.get(r.id) || 0)),
  });
};

/** Valida y normaliza permisos/módulos de un rol según lo que el propio usuario puede entregar. */
function validarContenido(req, { permisos, modulos }) {
  const desconocidos = permisos.filter((p) => !TODOS.includes(p));
  if (desconocidos.length > 0) throw new ValidationError(`Permiso desconocido: ${desconocidos[0]}.`);
  const unicos = [...new Set(permisos)];
  if (!esSubconjunto(unicos, misPermisos(req))) {
    throw new ForbiddenError('No puedes dar permisos que tú no tienes.');
  }

  let mods = null;
  if (modulos != null) {
    const validos = modulosAsignables(req);
    const fuera = modulos.find((m) => !validos.includes(m));
    if (fuera) throw new ValidationError(`El módulo "${fuera}" no está activo para esta empresa.`);
    mods = conDependencias(modulos).filter((m) => validos.includes(m)).sort();
    const sinAcceso = mods.find((m) => !req.accesoModulos.has(m));
    if (sinAcceso) throw new ForbiddenError(`No puedes dar acceso al módulo "${sinAcceso}" porque tú no lo tienes.`);
  }
  return { permisos: unicos, modulos: mods };
}

async function validarNombre(req, nombre, excluirId = null) {
  if (NOMBRES_BASE.includes(nombre.toLowerCase())) throw new ValidationError(`"${nombre}" es el nombre de un rol base; elige otro.`);
  const otros = await RolEmpresa.findAll({ where: { empresaId: req.empresaId }, attributes: ['id', 'nombre'], raw: true });
  if (otros.some((o) => o.id !== excluirId && o.nombre.toLowerCase() === nombre.toLowerCase())) {
    throw new ValidationError(`Ya existe un rol llamado "${nombre}".`);
  }
}

/** Un rol que da más de lo que el usuario tiene no lo puede modificar ni borrar. */
function assertAlcance(req, rol) {
  if (!esSubconjunto(rol.permisos, misPermisos(req))) {
    throw new ForbiddenError('Este rol tiene permisos que tú no tienes; no puedes modificarlo.');
  }
}

exports.createRol = async (req, res) => {
  const { nombre, descripcion } = req.body;
  await validarNombre(req, nombre);
  const contenido = validarContenido(req, { permisos: req.body.permisos, modulos: req.body.modulos ?? null });

  const rol = await RolEmpresa.create({ empresaId: req.empresaId, nombre, descripcion: descripcion || null, ...contenido });
  auditar(req, 'rol_creado', { rolId: rol.id, nombre: rol.nombre, numPermisos: rol.permisos.length });
  res.status(201).json(aJson(rol));
};

exports.updateRol = async (req, res) => {
  const rol = await RolEmpresa.findOne({ where: { id: req.params.id, empresaId: req.empresaId } });
  if (!rol) return res.status(404).json({ error: 'Rol no encontrado' });
  assertAlcance(req, rol);

  const cambios = {};
  if (req.body.nombre !== undefined && req.body.nombre !== rol.nombre) {
    await validarNombre(req, req.body.nombre, rol.id);
    cambios.nombre = req.body.nombre;
  }
  if (req.body.descripcion !== undefined) cambios.descripcion = req.body.descripcion || null;
  if (req.body.permisos !== undefined || req.body.modulos !== undefined) {
    const contenido = validarContenido(req, {
      permisos: req.body.permisos ?? rol.permisos,
      modulos: req.body.modulos !== undefined ? req.body.modulos : rol.modulos,
    });
    Object.assign(cambios, contenido);
  }

  await rol.update(cambios);
  invalidateAllProfiles(); // los usuarios con este rol deben verlo cambiar de inmediato
  auditar(req, 'rol_actualizado', { rolId: rol.id, nombre: rol.nombre, numPermisos: rol.permisos.length });
  res.json(aJson(rol));
};

exports.deleteRol = async (req, res) => {
  const rol = await RolEmpresa.findOne({ where: { id: req.params.id, empresaId: req.empresaId } });
  if (!rol) return res.status(404).json({ error: 'Rol no encontrado' });
  assertAlcance(req, rol);

  const enUso = await sequelize.transaction(async (t) => {
    const n = await UsuarioEmpresa.count({ where: { rolEmpresaId: rol.id }, transaction: t });
    if (n === 0) await rol.destroy({ transaction: t });
    return n;
  });
  if (enUso > 0) {
    throw new ValidationError(`${enUso === 1 ? 'Hay 1 usuario' : `Hay ${enUso} usuarios`} con este rol. Cámbialo${enUso === 1 ? '' : 's'} de rol antes de eliminarlo.`);
  }
  invalidateAllProfiles();
  auditar(req, 'rol_eliminado', { rolId: rol.id, nombre: rol.nombre });
  res.status(204).end();
};
