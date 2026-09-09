'use strict';

const rateLimit = require('express-rate-limit');

// En los tests de integración se hacen muchos logins seguidos desde la misma IP.
const enTest = () => process.env.NODE_ENV === 'test';

/**
 * Limita los intentos de inicio de sesión para frenar ataques de fuerza bruta.
 * Se aplica solo a POST /api/auth/login.
 *
 * Nota: para que el conteo sea por IP real del cliente (y no por la IP del
 * contenedor de Nginx) el servidor debe tener `app.set('trust proxy', 1)`.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: enTest,
  message: { error: 'Demasiados intentos de inicio de sesión. Espera unos minutos.' },
});

/**
 * Límite global laxo para toda la API. Red de seguridad ante clientes
 * descontrolados; no debería molestar al uso normal de la oficina.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || enTest(),
  message: { error: 'Límite de solicitudes alcanzado. Intenta de nuevo en unos minutos.' },
});

module.exports = { loginLimiter, apiLimiter };
