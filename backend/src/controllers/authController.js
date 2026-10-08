const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const ms = require('ms');
const { Usuario, Role, Empresa, Modulo } = require('../models');
const { ValidationError } = require('../utils/errors');
const { hashPassword, BCRYPT_ROUNDS } = require('../utils/password');
const logger = require('../utils/logger');
const sessions = require('../services/sessions');
const { accesosPorEmpresa } = require('../services/accesos');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

const COOKIE_NAME = 'token';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.COOKIE_SECURE === 'true',
  path: '/',
  maxAge: ms(JWT_EXPIRES_IN),
};

// Hash "señuelo" (anti-enumeración): se compara contra él si el usuario no existe.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-para-timing-constante', BCRYPT_ROUNDS);
const CREDENCIALES_INVALIDAS = 'Credenciales inválidas';

// Intenta decodificar el jti de la cookie sin fallar si el token ya expiró.
function jtiDeLaCookie(req) {
  const token = req.cookies && req.cookies.token;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET).jti || null;
  } catch {
    const dec = jwt.decode(token);
    return (dec && dec.jti) || null;
  }
}

/**
 * Datos de sesión que consume el frontend (usuario, rol y, por empresa, sus
 * módulos habilitados y tipo de negocio). Lo comparten login y /auth/me.
 */
async function payloadUsuario(usuario) {
  const accesos = await accesosPorEmpresa(usuario);
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    username: usuario.username,
    rol: usuario.Role.tipo,
    mustChangePassword: usuario.must_change_password,
    empresas: usuario.Empresas
      ? usuario.Empresas.map((emp) => ({
          id: emp.id,
          nombre: emp.nombre,
          tipo_negocio: emp.tipo_negocio,
          modulos: accesos[emp.id].modulos, // lo que la empresa tiene contratado
          acceso: accesos[emp.id].acceso, // a lo que este usuario entra según su rol
          permisos: accesos[emp.id].permisos,
          rol_propio: accesos[emp.id].rolPropio,
        }))
      : [],
  };
}

const INCLUDE_SESION = [
  { model: Role },
  { model: Empresa, through: { attributes: ['rolEmpresaId'] }, include: [{ model: Modulo, through: { attributes: [] } }] },
];

exports.login = async (req, res) => {
  const { username, contrasena } = req.body;

  const usuario = await Usuario.findOne({ where: { username }, include: INCLUDE_SESION });

  const hashParaComparar = usuario ? usuario.contrasena_hash : DUMMY_HASH;
  const passwordOk = await bcrypt.compare(contrasena, hashParaComparar);

  if (!usuario || !usuario.estado || !passwordOk) {
    logger.warn('login_fail', { username });
    return res.status(401).json({ error: CREDENCIALES_INVALIDAS });
  }

  const jti = sessions.nuevoJti();
  const expiraEn = new Date(Date.now() + ms(JWT_EXPIRES_IN));
  await sessions.crear({
    jti,
    usuarioId: usuario.id,
    expiraEn,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });

  const token = jwt.sign(
    { id: usuario.id, rolId: usuario.rolId, tipoRol: usuario.Role.tipo, jti },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  res.cookie(COOKIE_NAME, token, cookieOptions);
  logger.info('login_ok', { userId: usuario.id, rol: usuario.Role.tipo });

  res.json({ mensaje: 'Login exitoso', usuario: await payloadUsuario(usuario) });
};

exports.logout = async (req, res) => {
  await sessions.revocar(jtiDeLaCookie(req));
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ mensaje: 'Sesión cerrada' });
};

/** Cierra todas las sesiones del usuario (excepto, opcionalmente, la actual). */
exports.logoutAll = async (req, res) => {
  const mantenerActual = req.query.mantener_actual === 'true';
  const revocadas = await sessions.revocarTodasDe(req.userId, mantenerActual ? req.jti : null);
  if (!mantenerActual) res.clearCookie(COOKIE_NAME, { path: '/' });
  logger.info('logout_all', { userId: req.userId, mantenerActual, revocadas });
  res.json({ mensaje: 'Sesiones cerradas', revocadas });
};

exports.listSessions = async (req, res) => {
  res.json({ sesiones: await sessions.listarDe(req.userId), actual: req.jti });
};

exports.changePassword = async (req, res) => {
  const { actual, nueva } = req.body;

  const usuario = await Usuario.findByPk(req.userId);
  if (!usuario || !usuario.estado) {
    return res.status(401).json({ error: 'Sesión inválida' });
  }

  const actualOk = await bcrypt.compare(actual, usuario.contrasena_hash);
  if (!actualOk) throw new ValidationError('La contraseña actual no es correcta.');
  if (actual === nueva) throw new ValidationError('La nueva contraseña debe ser distinta de la actual.');

  usuario.contrasena_hash = await hashPassword(nueva);
  usuario.must_change_password = false;
  await usuario.save();

  // Al cambiar la contraseña se cierran las demás sesiones (conserva la actual).
  await sessions.revocarTodasDe(usuario.id, req.jti);

  logger.info('password_changed', { userId: usuario.id });
  res.json({ mensaje: 'Contraseña actualizada' });
};

/**
 * Datos ACTUALES de la sesión (rol, empresas y módulos habilitados). El
 * frontend los refresca al volver a la pestaña: si el administrador cambia los
 * módulos de una empresa, el usuario no tiene que cerrar sesión para verlo.
 */
exports.me = async (req, res) => {
  const usuario = await Usuario.findByPk(req.userId, { include: INCLUDE_SESION });
  if (!usuario) return res.status(401).json({ error: 'Usuario inactivo o inexistente' });
  res.json({ usuario: await payloadUsuario(usuario) });
};
