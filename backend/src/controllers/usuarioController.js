const { Usuario, Role, Empresa } = require('../models');
const { ValidationError } = require('../utils/errors');
const { hashPassword } = require('../utils/password');

// Qué tipos de rol puede asignar cada tipo de rol. Un FRONT_ADMIN NUNCA puede
// crear/promover a BACKOFFICE_ADMIN (evita escalada de privilegios).
const ROLES_ASIGNABLES = {
  BACKOFFICE_ADMIN: ['BACKOFFICE_ADMIN', 'FRONT_ADMIN', 'FRONT_USER'],
  FRONT_ADMIN: ['FRONT_ADMIN', 'FRONT_USER'],
};

// Lanza ValidationError si el rol no es asignable por quien llama. Si rolId es
// undefined (no se cambia el rol), no hace nada.
async function assertRolAsignable(tipoRolActor, rolId) {
  if (rolId === undefined || rolId === null) return;
  const rol = await Role.findByPk(rolId);
  if (!rol) throw new ValidationError('El rol indicado no existe');
  const permitidos = ROLES_ASIGNABLES[tipoRolActor] || [];
  if (!permitidos.includes(rol.tipo)) {
    throw new ValidationError('No estás autorizado para asignar ese rol');
  }
}

exports.getUsuarios = async (req, res) => {
  const include = [
    { model: Role },
    { model: Empresa, through: { attributes: [] } },
  ];

  if (req.tipoRol === 'BACKOFFICE_ADMIN') {
    const usuarios = await Usuario.findAll({ include, attributes: { exclude: ['contrasena_hash'] } });
    return res.json(usuarios);
  }

  // FRONT_ADMIN: solo usuarios de su empresa activa (filtrado en la query).
  const usuarios = await Usuario.findAll({
    attributes: { exclude: ['contrasena_hash'] },
    include: [
      { model: Role },
      { model: Empresa, through: { attributes: [] }, where: { id: req.empresaId } },
    ],
  });
  res.json(usuarios);
};

exports.createUsuario = async (req, res) => {
  const { rolId, nombre, username, contrasena, empresaIds } = req.body;

  await assertRolAsignable(req.tipoRol, rolId);

  const targetEmpresaIds = req.tipoRol === 'FRONT_ADMIN' ? [req.empresaId] : (empresaIds || []);

  const hash = await hashPassword(contrasena); // valida la política de complejidad
  const usuario = await Usuario.create({
    rolId,
    nombre,
    username,
    contrasena_hash: hash,
  });

  if (targetEmpresaIds.length > 0) {
    await usuario.setEmpresas(targetEmpresaIds);
  }

  const result = await Usuario.findByPk(usuario.id, {
    include: [Role, Empresa],
    attributes: { exclude: ['contrasena_hash'] },
  });
  res.status(201).json(result);
};

exports.updateUsuario = async (req, res) => {
  const { id } = req.params;
  const { nombre, username, contrasena, empresaIds, rolId, estado } = req.body;

  const usuarioToUpdate = await Usuario.findByPk(id, { include: [Empresa, Role] });
  if (!usuarioToUpdate) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (req.tipoRol === 'FRONT_ADMIN') {
    const hasAccess = usuarioToUpdate.Empresas.some((e) => e.id === Number(req.empresaId));
    if (!hasAccess) return res.status(403).json({ error: 'No autorizado' });
    // Un FRONT_ADMIN no puede editar a un BACKOFFICE_ADMIN.
    if (usuarioToUpdate.Role && usuarioToUpdate.Role.tipo === 'BACKOFFICE_ADMIN') {
      return res.status(403).json({ error: 'No autorizado' });
    }
  }

  // No permitir que un usuario se desactive a sí mismo.
  if (estado === false && Number(id) === req.userId) {
    throw new ValidationError('No puedes desactivar tu propia cuenta.');
  }

  await assertRolAsignable(req.tipoRol, rolId);

  const updates = {};
  if (nombre !== undefined) updates.nombre = nombre;
  if (username !== undefined) updates.username = username;
  if (rolId !== undefined) updates.rolId = rolId;
  if (estado !== undefined) updates.estado = estado;
  if (contrasena) updates.contrasena_hash = await hashPassword(contrasena);

  await usuarioToUpdate.update(updates);

  if (req.tipoRol === 'BACKOFFICE_ADMIN' && empresaIds) {
    await usuarioToUpdate.setEmpresas(empresaIds);
  }

  const result = await Usuario.findByPk(usuarioToUpdate.id, {
    include: [Role, Empresa],
    attributes: { exclude: ['contrasena_hash'] },
  });
  res.json(result);
};
