const { sequelize, Usuario, Role, Empresa, RolEmpresa, UsuarioEmpresa } = require('../models');
const { ValidationError, ForbiddenError } = require('../utils/errors');
const { hashPassword } = require('../utils/password');
const { invalidateUser } = require('../middlewares/auth');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { auditar } = require('../utils/audit');
const { permisosDe, esSubconjunto } = require('../services/permisos');

const esBackoffice = (req) => req.tipoRol === 'BACKOFFICE_ADMIN';

// Un usuario de empresa NUNCA puede crear/promover a BACKOFFICE_ADMIN (escalada de privilegios), y solo
// entrega roles cuyos permisos él mismo tiene: ni un administrador "recortado" ni un gestor de personal
// pueden crear a alguien con más poder que el suyo.
async function assertRolAsignable(req, rolId) {
  if (rolId === undefined || rolId === null) return;
  const rol = await Role.findByPk(rolId);
  if (!rol) throw new ValidationError('El rol indicado no existe');
  if (esBackoffice(req)) return;
  if (rol.tipo === 'BACKOFFICE_ADMIN' || !esSubconjunto(permisosDe(rol.tipo, null), [...req.permisos])) {
    throw new ForbiddenError('No estás autorizado para asignar ese rol');
  }
}

/** Rol propio de la empresa activa que el usuario puede entregar (existe, es de esta empresa y no supera sus permisos). */
async function cargarRolPropio(req, rolEmpresaId) {
  const rol = await RolEmpresa.findOne({ where: { id: rolEmpresaId, empresaId: req.empresaId } });
  if (!rol) throw new ValidationError('El rol indicado no existe');
  if (!esSubconjunto(rol.permisos, [...req.permisos])) throw new ForbiddenError('No estás autorizado para asignar ese rol');
  return rol;
}

/** Permisos que tiene el usuario objetivo en la empresa activa (para no tocar a alguien con más poder que uno). */
async function permisosDelObjetivo(usuario, empresaId) {
  const fila = await UsuarioEmpresa.findOne({ where: { usuarioId: usuario.id, empresaId }, include: [{ model: RolEmpresa, as: 'rolEmpresa' }] });
  return permisosDe(usuario.Role ? usuario.Role.tipo : null, fila?.rolEmpresa || null);
}

/**
 * Agrega a cada usuario el rol que tiene en la empresa activa: `rolEmpresaId` (rol propio, o null) y
 * `rol_nombre` (el del rol propio o, si no tiene, el del rol base). Los de BackOffice no tienen empresa activa.
 */
async function conRol(req, usuarios) {
  const lista = Array.isArray(usuarios) ? usuarios : [usuarios];
  const filas = lista.map((u) => {
    const json = u.toJSON();
    const enEmpresa = req.empresaId ? (json.Empresas || []).find((e) => e.id === req.empresaId) : null;
    return { json, rolEmpresaId: enEmpresa?.UsuarioEmpresa?.rolEmpresaId || null };
  });
  const ids = [...new Set(filas.map((f) => f.rolEmpresaId).filter(Boolean))];
  const roles = ids.length > 0 ? await RolEmpresa.findAll({ where: { id: ids }, attributes: ['id', 'nombre'] }) : [];
  const nombre = new Map(roles.map((r) => [r.id, r.nombre]));
  const salida = filas.map(({ json, rolEmpresaId }) => ({
    ...json,
    rolEmpresaId,
    rol_nombre: rolEmpresaId ? nombre.get(rolEmpresaId) : (json.Role?.tipo === 'FRONT_ADMIN' ? 'Administrador' : json.Role?.nombre),
  }));
  return Array.isArray(usuarios) ? salida : salida[0];
}

exports.getUsuarios = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query, { defaultLimit: 100 });

  // Un usuario de empresa solo ve a los de su empresa activa (filtrado en la query).
  const empresaInclude = esBackoffice(req)
    ? { model: Empresa, through: { attributes: [] } }
    : { model: Empresa, where: { id: req.empresaId } };

  const { count, rows } = await Usuario.findAndCountAll({
    attributes: { exclude: ['contrasena_hash'] },
    include: [{ model: Role }, empresaInclude],
    order: [['id', 'ASC']],
    limit,
    offset,
    distinct: true,
  });

  setTotalCount(res, count);
  res.json(await conRol(req, rows));
};

const INCLUDE_RESULTADO = [Role, Empresa];

exports.createUsuario = async (req, res) => {
  const { rolId, rolEmpresaId, nombre, username, contrasena, empresaIds } = req.body;

  let rolPropio = null;
  let rolBaseId = rolId;
  if (rolEmpresaId) {
    if (esBackoffice(req)) throw new ValidationError('Los roles propios los asigna el administrador de cada empresa.');
    rolPropio = await cargarRolPropio(req, rolEmpresaId);
    // Con rol propio, el rol base solo marca que es personal de la empresa (nunca administra la plataforma).
    rolBaseId = (await Role.findOne({ where: { tipo: 'FRONT_USER' } })).id;
  } else {
    await assertRolAsignable(req, rolId);
  }

  const targetEmpresaIds = esBackoffice(req) ? (empresaIds || []) : [req.empresaId];

  const hash = await hashPassword(contrasena); // valida la política de complejidad

  // Transacción: el usuario y su vínculo con las empresas se crean juntos o
  // no se crea nada (evita usuarios huérfanos si setEmpresas falla).
  const usuario = await sequelize.transaction(async (t) => {
    const u = await Usuario.create(
      { rolId: rolBaseId, nombre, username, contrasena_hash: hash },
      { transaction: t }
    );
    if (targetEmpresaIds.length > 0) {
      await u.setEmpresas(targetEmpresaIds, { transaction: t });
    }
    if (rolPropio) {
      await UsuarioEmpresa.update({ rolEmpresaId: rolPropio.id }, { where: { usuarioId: u.id, empresaId: req.empresaId }, transaction: t });
    }
    return u;
  });

  const result = await Usuario.findByPk(usuario.id, {
    include: INCLUDE_RESULTADO,
    attributes: { exclude: ['contrasena_hash'] },
  });
  const salida = await conRol(req, result);
  auditar(req, 'usuario_creado', { usuarioId: result.id, username: result.username, nombre: result.nombre, rol: salida.rol_nombre });
  res.status(201).json(salida);
};

exports.updateUsuario = async (req, res) => {
  const { id } = req.params;
  const { nombre, username, contrasena, empresaIds, rolId, rolEmpresaId, estado } = req.body;

  const usuarioToUpdate = await Usuario.findByPk(id, { include: [Empresa, Role] });
  if (!usuarioToUpdate) return res.status(404).json({ error: 'Usuario no encontrado' });

  const filaActual = esBackoffice(req) ? null : usuarioToUpdate.Empresas.find((e) => e.id === Number(req.empresaId));
  if (!esBackoffice(req)) {
    if (!filaActual) return res.status(403).json({ error: 'No autorizado' });
    // No se toca a un BACKOFFICE_ADMIN ni a alguien con más permisos que quien edita
    // (si no, cambiarle la contraseña sería una escalada de privilegios).
    if (usuarioToUpdate.Role && usuarioToUpdate.Role.tipo === 'BACKOFFICE_ADMIN') {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (!esSubconjunto(await permisosDelObjetivo(usuarioToUpdate, req.empresaId), [...req.permisos])) {
      return res.status(403).json({ error: 'No puedes modificar a un usuario con más permisos que tú.' });
    }
  }

  // No permitir que un usuario se desactive a sí mismo.
  if (estado === false && Number(id) === req.userId) {
    throw new ValidationError('No puedes desactivar tu propia cuenta.');
  }

  // Rol: `nuevoRolPropio` undefined = no cambia; null = quedar con el rol base; número = rol propio.
  let nuevoRolPropio;
  let rolCambia = false;
  if (rolEmpresaId) {
    if (esBackoffice(req)) throw new ValidationError('Los roles propios los asigna el administrador de cada empresa.');
    nuevoRolPropio = (await cargarRolPropio(req, rolEmpresaId)).id;
  } else if (rolEmpresaId === null || rolId !== undefined) {
    nuevoRolPropio = null; // elegir un rol base reemplaza al rol propio
    if (rolId !== undefined) await assertRolAsignable(req, rolId);
    else if (!esBackoffice(req) && !esSubconjunto(permisosDe(usuarioToUpdate.Role?.tipo, null), [...req.permisos])) {
      throw new ForbiddenError('Al quitarle el rol propio quedaría con más permisos que tú; elige un rol.');
    }
  }
  if (!esBackoffice(req) && nuevoRolPropio !== undefined) {
    const actualPropio = filaActual.UsuarioEmpresa?.rolEmpresaId || null;
    rolCambia = nuevoRolPropio !== actualPropio || (nuevoRolPropio === null && rolId !== undefined && rolId !== usuarioToUpdate.rolId);
  } else if (esBackoffice(req) && rolId !== undefined) {
    rolCambia = rolId !== usuarioToUpdate.rolId;
  }
  if (rolCambia && Number(id) === req.userId) throw new ValidationError('No puedes cambiar tu propio rol.');

  const updates = {};
  if (nombre !== undefined) updates.nombre = nombre;
  if (username !== undefined) updates.username = username;
  if (rolId !== undefined && !nuevoRolPropio) updates.rolId = rolId;
  if (estado !== undefined) updates.estado = estado;
  if (contrasena) updates.contrasena_hash = await hashPassword(contrasena);

  await sequelize.transaction(async (t) => {
    await usuarioToUpdate.update(updates, { transaction: t });

    if (esBackoffice(req) && empresaIds) {
      await usuarioToUpdate.setEmpresas(empresaIds, { transaction: t });
    }
    if (!esBackoffice(req) && nuevoRolPropio !== undefined) {
      await UsuarioEmpresa.update({ rolEmpresaId: nuevoRolPropio }, { where: { usuarioId: usuarioToUpdate.id, empresaId: req.empresaId }, transaction: t });
    }
    // Si BackOffice cambia el rol base, los roles propios que tuviera en sus empresas dejan de aplicar.
    if (esBackoffice(req) && rolCambia) {
      await UsuarioEmpresa.update({ rolEmpresaId: null }, { where: { usuarioId: usuarioToUpdate.id }, transaction: t });
    }
  });

  // Refleja de inmediato el cambio de estado/rol/empresas en las sesiones activas.
  invalidateUser(usuarioToUpdate.id);

  const result = await Usuario.findByPk(usuarioToUpdate.id, {
    include: INCLUDE_RESULTADO,
    attributes: { exclude: ['contrasena_hash'] },
  });
  const salida = await conRol(req, result);
  auditar(req, 'usuario_actualizado', { usuarioId: result.id, username: result.username, nombre: result.nombre, ...(rolCambia ? { rol: salida.rol_nombre } : {}) });
  res.json(salida);
};
