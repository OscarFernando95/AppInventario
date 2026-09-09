'use strict';

/**
 * Normaliza los parámetros de paginación de un listado.
 *
 * Compatibilidad: si el cliente no envía `limit`, se aplica `defaultLimit` (no
 * "todo"). La respuesta sigue siendo un array; el total va en la cabecera
 * `X-Total-Count`. El frontend puede migrar a `?limit=&offset=` cuando quiera.
 */
function parseListQuery(query = {}, { defaultLimit = 200, maxLimit = 1000 } = {}) {
  let limit = Number.parseInt(query.limit, 10);
  if (!Number.isInteger(limit) || limit <= 0) limit = defaultLimit;
  limit = Math.min(limit, maxLimit);

  let offset = Number.parseInt(query.offset, 10);
  if (!Number.isInteger(offset) || offset < 0) offset = 0;

  return { limit, offset };
}

/** Añade la cabecera X-Total-Count (y la deja legible vía CORS). */
function setTotalCount(res, total) {
  res.set('X-Total-Count', String(total));
}

module.exports = { parseListQuery, setTotalCount };
