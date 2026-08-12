const bcrypt = require('bcrypt');
const { Usuario, Role, Empresa } = require('../models');

exports.getUsuarios = async (req, res) => {
  try {
    const include = [
      { model: Role }, 
      { model: Empresa, through: { attributes: [] } }
    ];

    const usuariosRaw = await Usuario.findAll({ 
       include,
       attributes: { exclude: ['contrasena_hash'] }
    });

    // Filter internally if FRONT_ADMIN
    const usuarios = req.tipoRol === 'BACKOFFICE_ADMIN' 
      ? usuariosRaw 
      : usuariosRaw.filter(u => u.Empresas.some(e => e.id == req.empresaId));
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
};

exports.createUsuario = async (req, res) => {
  try {
    const { rolId, nombre, username, contrasena, empresaIds } = req.body;
    
    const targetEmpresaIds = req.tipoRol === 'FRONT_ADMIN' ? [req.empresaId] : (empresaIds || []);

    const hash = await bcrypt.hash(contrasena, 10);
    const usuario = await Usuario.create({
      rolId,
      nombre,
      username,
      contrasena_hash: hash
    });

    if (targetEmpresaIds.length > 0) {
      await usuario.setEmpresas(targetEmpresaIds);
    }
    
    const result = await Usuario.findByPk(usuario.id, {
      include: [Role, Empresa],
      attributes: { exclude: ['contrasena_hash'] }
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear usuario' });
  }
};

exports.updateUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, username, contrasena, empresaIds, rolId, estado } = req.body;
    
    const usuarioToUpdate = await Usuario.findByPk(id, { include: Empresa });
    if (!usuarioToUpdate) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (req.tipoRol === 'FRONT_ADMIN') {
      const hasAccess = usuarioToUpdate.Empresas.some(e => e.id == req.empresaId);
      if (!hasAccess) return res.status(403).json({ error: 'No autorizado' });
    }

    const updates = { nombre, username, rolId };
    if (estado !== undefined) updates.estado = estado;
    if (contrasena) updates.contrasena_hash = await bcrypt.hash(contrasena, 10);

    await usuarioToUpdate.update(updates);

    if (req.tipoRol === 'BACKOFFICE_ADMIN' && empresaIds) {
      await usuarioToUpdate.setEmpresas(empresaIds);
    }
    
    res.json(usuarioToUpdate);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};
