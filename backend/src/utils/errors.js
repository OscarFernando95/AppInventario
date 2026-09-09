'use strict';

/**
 * Error de regla de negocio / validación de entrada.
 *
 * Se usa para distinguir, dentro de un `catch`, los errores cuyo mensaje es
 * seguro (y útil) mostrar al cliente —"Stock insuficiente", "Proveedor
 * inválido"— de los errores inesperados (fallos de BD, bugs), cuyo detalle
 * NO debe salir en la respuesta HTTP.
 *
 * Uso:
 *   const { ValidationError } = require('../utils/errors');
 *   throw new ValidationError('Stock insuficiente: ' + producto.nombre_producto);
 *
 *   } catch (error) {
 *     if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
 *     console.error('CONTEXTO:', error);
 *     return res.status(500).json({ error: 'Mensaje genérico' });
 *   }
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

/** El usuario está autenticado pero no tiene permiso para esta acción (403). */
class ForbiddenError extends ValidationError {
  constructor(message) {
    super(message);
    this.name = 'ForbiddenError';
    this.status = 403;
  }
}

module.exports = { ValidationError, ForbiddenError };
