'use strict';

/**
 * Envuelve un controlador async para que cualquier error (throw o promesa
 * rechazada) llegue al middleware de errores central en vez de dejar la
 * petición colgada. Evita repetir try/catch en cada handler.
 *
 *   router.post('/', asyncHandler(async (req, res) => { ... }));
 */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
