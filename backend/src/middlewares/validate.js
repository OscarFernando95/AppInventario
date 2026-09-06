'use strict';

const { ValidationError } = require('../utils/errors');

/**
 * Valida (y normaliza) partes de la petición con esquemas zod.
 *
 *   const { z } = require('zod');
 *   router.post('/', validate({ body: z.object({ username: z.string().min(1) }) }), handler);
 *
 * Si algo no cumple, responde 400 con el primer mensaje de error (vía el
 * middleware de errores). Si cumple, reemplaza req.body/req.query/req.params
 * por la versión parseada (con defaults aplicados y tipos coaccionados).
 */
module.exports = (schemas) => (req, res, next) => {
  for (const key of ['body', 'query', 'params']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key]);
    if (!result.success) {
      const issue = result.error.issues[0];
      const campo = issue.path.join('.');
      return next(new ValidationError(campo ? `${campo}: ${issue.message}` : issue.message));
    }
    // req.query / req.params pueden ser getters de solo lectura en Express 5:
    // se asignan con defineProperty para evitar "Cannot set property".
    Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true });
  }
  next();
};
