'use strict';

const logger = require('./logger');

/**
 * Registra un evento de auditoría de negocio ("quién hizo qué").
 *
 * Es un envoltorio fino sobre `logger.info` que rellena `userId`/`empresaId`
 * desde `req`, para que los controladores lo llamen en una sola línea tras una
 * mutación exitosa:
 *
 *   auditar(req, 'venta_creada', { ventaId: venta.id, total });
 *
 * El logger ya persiste esto en la tabla `logs_eventos` (columnas propias para
 * usuarioId/empresaId, el resto va a `detalle` JSONB). Nunca pasar datos
 * sensibles (contraseñas, hashes) en `detalle`.
 */
function auditar(req, evento, detalle = {}) {
  logger.info(evento, {
    userId: req?.userId,
    empresaId: req?.empresaId,
    ...detalle,
  });
}

module.exports = { auditar };
