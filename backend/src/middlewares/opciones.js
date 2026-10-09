'use strict';

const { Empresa } = require('../models');
const TtlCache = require('../utils/ttlCache');
const { efectivas } = require('../services/opciones');

// Las opciones cambian poco y se consultan en casi cada petición de mesas: caché corta, que se limpia al guardar.
const cache = new TtlCache(15_000);

/** Opciones guardadas de una empresa (con caché). */
async function opcionesGuardadas(empresaId) {
  const hit = cache.get(empresaId);
  if (hit) return hit;
  const empresa = await Empresa.findByPk(empresaId, { attributes: ['opciones'] });
  const valor = empresa?.opciones || {};
  cache.set(empresaId, valor);
  return valor;
}

/** Opciones EFECTIVAS de la empresa de la petición (considera sus módulos contratados). */
async function opcionesDe(req) {
  return efectivas(await opcionesGuardadas(req.empresaId), [...(req.empresaModulos || [])]);
}

/** Descarta lo cacheado de una empresa (tras cambiar sus opciones). */
const olvidarOpciones = (empresaId) => cache.delete(empresaId);

/**
 * Exige que la opción esté activada. Se monta DESPUÉS de verifyToken. Una función apagada responde 403 con un mensaje que
 * dice dónde prenderla, para que ni una llamada directa a la API la use.
 */
const requireOpcion = (clave) => async (req, res, next) => {
  try {
    const ef = await opcionesDe(req);
    if (ef[clave]) return next();
    return res.status(403).json({ error: 'Esta función no está activada para tu empresa. Un administrador puede activarla en Opciones.' });
  } catch (err) {
    return next(err);
  }
};

module.exports = { opcionesGuardadas, opcionesDe, olvidarOpciones, requireOpcion };
