const jwt = require('jsonwebtoken');

const { Usuario, Empresa, Role } = require('../models');
const TtlCache = require('../utils/ttlCache');

/**
 * Caché del "perfil de sesión" por usuario (estado + rol + empresas), para no
 * pegarle a la BD en CADA request autenticado. TTL corto: un cambio de rol o
 * una desactivación tarda como mucho ~30 s en propagarse, y updateUsuario
 * invalida la entrada de inmediato (ver invalidateUser).
 */
const SESSION_TTL_MS = Number(process.env.AUTH_CACHE_TTL_MS || 30_000);
const sessionCache = new TtlCache(SESSION_TTL_MS);

const invalidateUser = (userId) => sessionCache.delete(String(userId));

async function loadSessionProfile(userId) {
  const cached = sessionCache.get(String(userId));
  if (cached) return cached;

  const user = await Usuario.findByPk(userId, {
    include: [{ model: Role }, { model: Empresa, through: { attributes: [] }, attributes: ['id'] }],
  });
  if (!user) return null;

  const profile = {
    id: user.id,
    estado: user.estado,
    rolId: user.rolId,
    tipoRol: user.Role ? user.Role.tipo : null,
    empresaIds: (user.Empresas || []).map((e) => e.id),
  };
  sessionCache.set(String(userId), profile);
  return profile;
}

/**
 * Verifica el JWT, carga el perfil ACTUAL del usuario (cacheado) y comprueba
 * que siga activo. No se confía en el rol del token: se usa el de la BD.
 */
const authenticate = async (req, res, next) => {
  // El token viaja en la cookie httpOnly `token`. Se acepta también
  // `Authorization: Bearer <token>` para clientes no navegador (scripts, tests).
  const header = req.headers['authorization'] || '';
  const parts = header.split(' ');
  const bearer = parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : null;
  const token = (req.cookies && req.cookies.token) || bearer;

  if (!token) return res.status(401).json({ error: 'No autenticado' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  try {
    const profile = await loadSessionProfile(decoded.id);
    if (!profile || !profile.estado) {
      return res.status(401).json({ error: 'Usuario inactivo o inexistente' });
    }

    req.userId = profile.id;
    req.rolId = profile.rolId;
    req.tipoRol = profile.tipoRol;
    req.userEmpresaIds = profile.empresaIds;
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

  const empresaId = Number(headerEmpresaId);
  if (!Number.isInteger(empresaId) || !(req.userEmpresaIds || []).includes(empresaId)) {
    return res.status(403).json({ error: 'Acceso denegado a esta empresa' });
  }

  req.empresaId = empresaId;
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

module.exports = {
  authenticate,
  requireEmpresa,
  verifyToken,
  isBackofficeAdmin,
  isFrontAdmin,
  invalidateUser,
};
