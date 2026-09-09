'use strict';

const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Middleware de errores central. Se monta el ÚLTIMO (después de las rutas).
 *
 * - ValidationError            -> 400 con el mensaje (es seguro mostrarlo).
 * - Errores de Sequelize de     -> 400 / 409 con un mensaje acotado.
 *   validación / unicidad
 * - Cualquier otra cosa         -> 500 genérico + log del stack completo.
 *
 * Nunca se devuelve `error.message` de un error inesperado al cliente.
 */
// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  if (err instanceof ValidationError) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  if (err && err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos.' });
  }
  if (err && err.name === 'SequelizeValidationError') {
    const detalle = err.errors && err.errors[0] && err.errors[0].message;
    return res.status(400).json({ error: detalle ? `Datos inválidos: ${detalle}` : 'Datos inválidos.' });
  }
  if (err && err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({ error: 'Referencia inválida: uno de los datos seleccionados no existe.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La solicitud es demasiado grande.' });
  }

  logger.error('unhandled_error', {
    method: req.method,
    path: req.originalUrl,
    message: err && err.message,
    stack: err && err.stack,
  });
  return res.status(500).json({ error: 'Error interno del servidor' });
};
