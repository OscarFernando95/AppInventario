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
 *
 * Toda salida de aquí queda trazada en `logs_eventos` (vía logger.js), no solo
 * el 500 genérico: un 400/403/404/409 es exactamente el tipo de fallo que se
 * necesita poder revisar después para un caso de soporte ("¿por qué esta
 * venta no se guardó?"), y antes no quedaba registrado en ningún lado.
 */
// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  const contexto = () => ({
    method: req.method,
    path: req.originalUrl,
    userId: req.userId,
    empresaId: req.empresaId,
  });

  if (err instanceof ValidationError) {
    const status = err.status || 400;
    logger.warn('api_error', { ...contexto(), status, message: err.message });
    return res.status(status).json({ error: err.message });
  }

  if (err && err.name === 'SequelizeUniqueConstraintError') {
    logger.warn('api_error', { ...contexto(), status: 409, message: 'Registro duplicado' });
    return res.status(409).json({ error: 'Ya existe un registro con esos datos.' });
  }
  if (err && err.name === 'SequelizeValidationError') {
    const detalle = err.errors && err.errors[0] && err.errors[0].message;
    const mensaje = detalle ? `Datos inválidos: ${detalle}` : 'Datos inválidos.';
    logger.warn('api_error', { ...contexto(), status: 400, message: mensaje });
    return res.status(400).json({ error: mensaje });
  }
  if (err && err.name === 'SequelizeForeignKeyConstraintError') {
    logger.warn('api_error', { ...contexto(), status: 400, message: 'Referencia inválida' });
    return res.status(400).json({ error: 'Referencia inválida: uno de los datos seleccionados no existe.' });
  }
  if (err && err.type === 'entity.too.large') {
    logger.warn('api_error', { ...contexto(), status: 413, message: 'Solicitud demasiado grande' });
    return res.status(413).json({ error: 'La solicitud es demasiado grande.' });
  }
  if (err && err.name === 'MulterError') {
    // err.code: 'LIMIT_FILE_SIZE', 'LIMIT_UNEXPECTED_FILE', etc. — el mensaje
    // de multer ya es seguro de mostrar (no expone detalles internos).
    logger.warn('api_error', { ...contexto(), status: 400, message: err.message });
    return res.status(400).json({ error: `Archivo inválido: ${err.message}` });
  }

  logger.error('unhandled_error', {
    ...contexto(),
    status: 500,
    message: err && err.message,
    stack: err && err.stack,
  });
  return res.status(500).json({ error: 'Error interno del servidor' });
};
