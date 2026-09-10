'use strict';

const { Op } = require('sequelize');

/**
 * Construye cláusulas `where` de Sequelize a partir de `req.query` para los
 * listados (ventas, compras, pedidos). Se combina con `{ empresaId }` en el
 * controlador.
 *
 *   const where = { empresaId: req.empresaId, ...buildListWhere(req.query, {
 *     fecha: 'fecha',
 *     igualdad: ['clienteId'],
 *   }) };
 *
 * Config:
 *   - `fecha`:     nombre de la columna de fecha; usa `desde`/`hasta` (YYYY-MM-DD,
 *                  hora local del servidor, igual que informeController).
 *   - `igualdad`:  columnas que se filtran por igualdad exacta si vienen en la query
 *                  (`clienteId`, `proveedorId`, `estado`, ...).
 */
function buildListWhere(query = {}, { fecha, igualdad = [] } = {}) {
  const where = {};

  if (fecha && (query.desde || query.hasta)) {
    where[fecha] = {};
    if (query.desde) where[fecha][Op.gte] = new Date(`${query.desde}T00:00:00`);
    if (query.hasta) where[fecha][Op.lte] = new Date(`${query.hasta}T23:59:59.999`);
  }

  for (const campo of igualdad) {
    const v = query[campo];
    if (v !== undefined && v !== '' && v !== null) where[campo] = v;
  }

  return where;
}

module.exports = { buildListWhere };
