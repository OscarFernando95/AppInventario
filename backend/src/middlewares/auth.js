const jwt = require('jsonwebtoken');

const { Usuario, Empresa, Role } = require('../models');

/**
 * Extrae y verifica el JWT del header Authorization, carga el usuario ACTUAL de
 * la BD (no se confía en los datos del token más allá del id) y comprueba que
 * siga activo. Deja en req: userId, rolId, tipoRol, y _user (instancia con
 * Role y Empresas cargadas) para middlewares posteriores.
 */
const authenticate = async (req, res, next) => {
  const header = req.headers['authorization'] || '';
  const parts = header.split(' ');
  const token = parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : null;

  if (!token) return res.status(401).json({ error: 'No autenticado' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  try {
    const user = await Usuario.findByPk(decoded.id, {
      include: [{ model: Role }, { model: Empresa, through: { attributes: [] } }],
    });

    if (!user || !user.estado) {
      return res.status(401).json({ error: 'Usuario inactivo o inexistente' });
    }

    req._user = user;
    req.userId = user.id;
    req.rolId = user.rolId;
    req.tipoRol = user.Role ? user.Role.tipo : null;
    next();
  } catch (dbErr) {
    return res.status(500).json({ error: 'Error verificando la sesión' });
  }
};

/**
 * Exige que el usuario opere dentro de una empresa a la que pertenece (header
 * X-Empresa-Id). Los BACKOFFICE_ADMIN quedan exentos (no tienen empresa activa).
 */
const requireEmpresa = (req, res, next) => {
  if (req.tipoRol === 'BACKOFFICE_ADMIN') return next();

  const headerEmpresaId = req.headers['x-empresa-id'];
  if (!headerEmpresaId) {
    return res.status(403).json({ error: 'Falta configurar empresa activa en cabecera' });
  }

  const empresas = req._user.Empresas || [];
  const hasAccess = empresas.some((e) => e.id === Number(headerEmpresaId));
  if (!hasAccess) {
    return res.status(403).json({ error: 'Acceso denegado a esta empresa' });
  }

  req.empresaId = Number(headerEmpresaId);
  next();
};

/** Combinación habitual: autenticar + resolver empresa activa. */
const verifyToken = [authenticate, requireEmpresa];

const isBackofficeAdmin = (req, res, next) => {
  if (req.tipoRol !== 'BACKOFFICE_ADMIN') {
    return res.status(403).json({ error: 'Requiere rol de BackOffice Admin' });
  }
  next();
};

const isFrontAdmin = (req, res, next) => {
  if (req.tipoRol !== 'FRONT_ADMIN') {
    return res.status(403).json({ error: 'Requiere rol de Administrador de Empresa' });
  }
  next();
};

module.exports = { authenticate, requireEmpresa, verifyToken, isBackofficeAdmin, isFrontAdmin };
