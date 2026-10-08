const jwt = require('jsonwebtoken');

const { Usuario, Empresa, Role, Modulo } = require('../models');
const TtlCache = require('../utils/ttlCache');
const sessions = require('../services/sessions');
const { accesosPorEmpresa } = require('../services/accesos');

/**
 * Caché del "perfil de sesión" por usuario: estado, rol, empresas, los módulos
 * contratados de cada empresa y, por empresa, sus permisos y los módulos a los que accede. Evita pegarle a la BD en CADA request. TTL corto;
 * updateUsuario / updateEmpresa invalidan de inmediato.
 */
const SESSION_TTL_MS = Number(process.env.AUTH_CACHE_TTL_MS || 30_000);
const profileCache = new TtlCache(SESSION_TTL_MS);

const invalidateUser = (userId) => profileCache.delete(String(userId));
// Un cambio de módulos de una empresa afecta a todos sus usuarios. Barato y raro.
const invalidateAllProfiles = () => profileCache.clear();

async function loadSessionProfile(userId) {
  const cached = profileCache.get(String(userId));
  if (cached) return cached;

  const user = await Usuario.findByPk(userId, {
    include: [
      { model: Role },
      {
        model: Empresa,
        through: { attributes: ['rolEmpresaId'] },
        attributes: ['id'],
        include: [{ model: Modulo, through: { attributes: [] }, attributes: ['nombre_codigo'] }],
      },
    ],
  });
  if (!user) return null;

  const accesos = await accesosPorEmpresa(user);
  const modulosPorEmpresa = {};
  const accesoPorEmpresa = {};
  const permisosPorEmpresa = {};
  for (const [empresaId, a] of Object.entries(accesos)) {
    modulosPorEmpresa[empresaId] = a.modulos;
    accesoPorEmpresa[empresaId] = a.acceso;
    permisosPorEmpresa[empresaId] = a.permisos;
  }

  const profile = {
    id: user.id,
    estado: user.estado,
    rolId: user.rolId,
    tipoRol: user.Role ? user.Role.tipo : null,
    empresaIds: (user.Empresas || []).map((e) => e.id),
    modulosPorEmpresa,
    accesoPorEmpresa,
    permisosPorEmpresa,
  };
  profileCache.set(String(userId), profile);
  return profile;
}

/**
 * Verifica el JWT, comprueba que la SESIÓN siga vigente (lista de revocación),
 * carga el perfil ACTUAL del usuario (cacheado) y que siga activo.
 */
const authenticate = async (req, res, next) => {
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
    // Sesión revocada / inexistente (token viejo sin jti incluido).
    if (!(await sessions.estaVigente(decoded.jti))) {
      return res.status(401).json({ error: 'Sesión cerrada. Inicia sesión de nuevo.' });
    }

    const profile = await loadSessionProfile(decoded.id);
    if (!profile || !profile.estado) {
      return res.status(401).json({ error: 'Usuario inactivo o inexistente' });
    }

    req.jti = decoded.jti;
    req.userId = profile.id;
    req.rolId = profile.rolId;
    req.tipoRol = profile.tipoRol;
    req.userEmpresaIds = profile.empresaIds;
    req._modulosPorEmpresa = profile.modulosPorEmpresa;
    req._accesoPorEmpresa = profile.accesoPorEmpresa;
    req._permisosPorEmpresa = profile.permisosPorEmpresa;
    next();
  } catch (dbErr) {
    return res.status(500).json({ error: 'Error verificando la sesión' });
  }
};

/**
 * Exige que el usuario opere dentro de una empresa a la que pertenece (header
 * X-Empresa-Id). Los BACKOFFICE_ADMIN quedan exentos.
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
  // empresaModulos: lo contratado por la empresa (reglas de negocio). accesoModulos: a lo que
  // este usuario puede entrar según su rol (lo que decide requireModulo).
  req.empresaModulos = new Set((req._modulosPorEmpresa && req._modulosPorEmpresa[empresaId]) || []);
  req.accesoModulos = new Set((req._accesoPorEmpresa && req._accesoPorEmpresa[empresaId]) || []);
  req.permisos = new Set((req._permisosPorEmpresa && req._permisosPorEmpresa[empresaId]) || []);
  next();
};

/** Combinación habitual: autenticar + resolver empresa activa. */
const verifyToken = [authenticate, requireEmpresa];

/**
 * Exige que la empresa activa tenga contratado el módulo `codigo`
 * (p.ej. 'Ventas', 'Inventario'). BACKOFFICE_ADMIN exento.
 * Se monta DESPUÉS de verifyToken.
 */
const requireModulo = (codigo) => (req, res, next) => {
  if (req.tipoRol === 'BACKOFFICE_ADMIN') return next();
  if (!req.empresaModulos || !req.empresaModulos.has(codigo)) {
    return res.status(403).json({ error: `El módulo "${codigo}" no está activo para esta empresa` });
  }
  if (!req.accesoModulos || !req.accesoModulos.has(codigo)) {
    return res.status(403).json({ error: `Tu rol no tiene acceso al módulo "${codigo}"` });
  }
  next();
};

/**
 * ¿Tiene el usuario este permiso en la empresa activa? Los permisos son de quien opera una empresa:
 * un BACKOFFICE_ADMIN no los tiene (administra la plataforma, no vende ni anula en una empresa).
 */
const tiene = (req, permiso) => !!(req.permisos && req.permisos.has(permiso));

/** Exige al menos uno de los permisos indicados. Se monta DESPUÉS de verifyToken. */
const requirePermiso = (...permisos) => (req, res, next) => {
  if (permisos.some((p) => tiene(req, p))) return next();
  return res.status(403).json({ error: 'No tienes permiso para esta acción' });
};

const isBackofficeAdmin = (req, res, next) => {
  if (req.tipoRol !== 'BACKOFFICE_ADMIN') {
    return res.status(403).json({ error: 'Requiere rol de BackOffice Admin' });
  }
  next();
};

module.exports = {
  authenticate,
  requireEmpresa,
  requireModulo,
  verifyToken,
  isBackofficeAdmin,
  tiene,
  requirePermiso,
  invalidateUser,
  invalidateAllProfiles,
};
