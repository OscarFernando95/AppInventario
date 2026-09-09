const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const ms = require('ms');
const { Usuario, Role, Empresa, Modulo } = require('../models');
const { ValidationError } = require('../utils/errors');
const { hashPassword, BCRYPT_ROUNDS } = require('../utils/password');
const logger = require('../utils/logger');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// El token viaja en una cookie httpOnly (no accesible por JavaScript → inmune a
// robo por XSS). `secure` solo si se sirve por HTTPS (COOKIE_SECURE=true).
const COOKIE_NAME = 'token';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict', // también neutraliza CSRF en las peticiones de escritura
  secure: process.env.COOKIE_SECURE === 'true',
  path: '/',
  maxAge: ms(JWT_EXPIRES_IN),
};

// Hash "señuelo": se compara contra él cuando el usuario no existe, para que el
// tiempo de respuesta no revele si el usuario es válido (anti-enumeración).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-para-timing-constante', BCRYPT_ROUNDS);

const CREDENCIALES_INVALIDAS = 'Credenciales inválidas';

exports.login = async (req, res) => {
  const { username, contrasena } = req.body;

  const usuario = await Usuario.findOne({
    where: { username },
    include: [
      { model: Role },
      { model: Empresa, through: { attributes: [] }, include: [{ model: Modulo, through: { attributes: [] } }] }
    ]
  });

  // Siempre se ejecuta un bcrypt.compare (contra el hash real o el señuelo).
  const hashParaComparar = usuario ? usuario.contrasena_hash : DUMMY_HASH;
  const passwordOk = await bcrypt.compare(contrasena, hashParaComparar);

  if (!usuario || !usuario.estado || !passwordOk) {
    logger.warn('login_fail', { username });
    return res.status(401).json({ error: CREDENCIALES_INVALIDAS });
  }

  const token = jwt.sign(
    { id: usuario.id, rolId: usuario.rolId, tipoRol: usuario.Role.tipo },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  res.cookie(COOKIE_NAME, token, cookieOptions);
  logger.info('login_ok', { userId: usuario.id, rol: usuario.Role.tipo });

  res.json({
    mensaje: 'Login exitoso',
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      username: usuario.username,
      rol: usuario.Role.tipo,
      mustChangePassword: usuario.must_change_password,
      empresas: usuario.Empresas ? usuario.Empresas.map(emp => ({
        id: emp.id,
        nombre: emp.nombre,
        modulos: emp.Modulos ? emp.Modulos.map(m => m.nombre_codigo) : []
      })) : []
    }
  });
};

exports.logout = (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ mensaje: 'Sesión cerrada' });
};

/**
 * Cambio de contraseña del propio usuario autenticado. Verifica la contraseña
 * actual, aplica la política de complejidad y limpia el flag
 * must_change_password.
 */
exports.changePassword = async (req, res) => {
  const { actual, nueva } = req.body;

  const usuario = await Usuario.findByPk(req.userId);
  if (!usuario || !usuario.estado) {
    return res.status(401).json({ error: 'Sesión inválida' });
  }

  const actualOk = await bcrypt.compare(actual, usuario.contrasena_hash);
  if (!actualOk) {
    throw new ValidationError('La contraseña actual no es correcta.');
  }
  if (actual === nueva) {
    throw new ValidationError('La nueva contraseña debe ser distinta de la actual.');
  }

  usuario.contrasena_hash = await hashPassword(nueva); // valida la política
  usuario.must_change_password = false;
  await usuario.save();

  logger.info('password_changed', { userId: usuario.id });
  res.json({ mensaje: 'Contraseña actualizada' });
};
