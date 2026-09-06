'use strict';

/**
 * Logger mínimo de eventos estructurados (JSON a stdout — Docker lo captura).
 * Para logs de acceso HTTP se usa `morgan` (ver src/index.js).
 *
 * No usa una librería externa a propósito: solo necesitamos una línea JSON por
 * evento de negocio relevante (login, cambios de usuario, etc.).
 *
 *   logger.info('login_ok', { userId: 3 });
 *   logger.warn('login_fail', { username });
 */
function emit(level, event, data = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  });
  if (level === 'error') console.error(line);
  else console.log(line);
}

module.exports = {
  info: (event, data) => emit('info', event, data),
  warn: (event, data) => emit('warn', event, data),
  error: (event, data) => emit('error', event, data),
};
