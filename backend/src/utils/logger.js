'use strict';

/**
 * Logger mínimo de eventos estructurados (JSON a stdout — Docker lo captura,
 * y además una fila en la tabla `logs_eventos` para que el backoffice pueda
 * revisarlos en /backoffice/logs sin ir a buscar en los logs de Docker).
 * Para logs de acceso HTTP se usa `morgan` (ver src/index.js) — esto es solo
 * para eventos de negocio relevantes (login, errores de API, importaciones).
 *
 *   logger.info('login_ok', { userId: 3 });
 *   logger.warn('login_fail', { username });
 *   logger.warn('api_error', { method, path, status, message, userId, empresaId });
 *
 * Claves reconocidas de `data` que se separan a columnas propias de
 * `logs_eventos` (el resto queda tal cual en la columna `detalle` JSONB):
 * `userId` -> usuarioId, `empresaId` -> empresaId, `method` -> metodo,
 * `path` -> ruta, `status` -> status_code.
 */

// Retención: nada de cron nuevo — cada inserción tiene una probabilidad baja
// de disparar además una limpieza de filas viejas, así el volumen no crece
// sin límite y no hace falta infraestructura adicional.
const RETENTION_DAYS = Number(process.env.LOGS_RETENTION_DAYS || 30);
const CLEANUP_PROBABILITY = 1 / 500;

function emit(level, event, data = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  });
  if (level === 'error') console.error(line);
  else console.log(line);

  persistir(level, event, data);
}

// Fire-and-forget a propósito: un fallo escribiendo el log jamás debe tumbar
// la operación de negocio real que lo disparó. Los modelos se importan de
// forma perezosa (no al cargar el módulo) para no arriesgar un ciclo de
// require en el arranque de la app.
function persistir(level, event, data) {
  const { userId, empresaId, method, path, status, ...resto } = data || {};
  Promise.resolve()
    .then(() => {
      const { LogEvento } = require('../models');
      return LogEvento.create({
        evento: event,
        nivel: level,
        metodo: method || null,
        ruta: path || null,
        status_code: status ?? null,
        usuarioId: userId ?? null,
        empresaId: empresaId ?? null,
        detalle: Object.keys(resto).length ? resto : null,
        creado_en: new Date(),
      });
    })
    .then(() => {
      if (Math.random() < CLEANUP_PROBABILITY) limpiarViejos();
    })
    // No usar logger.error aquí: entraría en recursión si la propia escritura
    // de logs es lo que está fallando (p. ej. la BD está caída).
    .catch((err) => console.error('[logger] no se pudo persistir el evento:', err.message));
}

function limpiarViejos() {
  const { Op } = require('sequelize');
  const { LogEvento } = require('../models');
  const limite = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  LogEvento.destroy({ where: { creado_en: { [Op.lt]: limite } } })
    .catch((err) => console.error('[logger] no se pudo limpiar logs viejos:', err.message));
}

module.exports = {
  info: (event, data) => emit('info', event, data),
  warn: (event, data) => emit('warn', event, data),
  error: (event, data) => emit('error', event, data),
};
