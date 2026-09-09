'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const { Sesion } = require('../models');
const TtlCache = require('../utils/ttlCache');

/**
 * Sesiones con lista de revocación.
 *
 * Cada login crea una fila en `sesiones` con un `jti` (que va dentro del JWT).
 * `authenticate` comprueba, por cada request, que la sesión siga vigente
 * (existe, no revocada, no expirada). El resultado se cachea por `jti` unos
 * segundos para no consultar la BD en cada request.
 *
 * Permite:
 *   - cerrar una sesión concreta (logout),
 *   - cerrar todas las sesiones de un usuario ("cerrar en todos los dispositivos"),
 *   - listar las sesiones activas de un usuario.
 */

const TTL_MS = Number(process.env.SESSION_CHECK_TTL_MS || 30_000);
const cache = new TtlCache(TTL_MS); // jti -> true (vigente)

const nuevoJti = () => crypto.randomUUID();

async function crear({ jti, usuarioId, expiraEn, userAgent, ip }) {
  await Sesion.create({
    jti,
    usuarioId,
    user_agent: (userAgent || '').slice(0, 255) || null,
    ip: (ip || '').slice(0, 64) || null,
    creada_en: new Date(),
    ultimo_uso_en: new Date(),
    expira_en: expiraEn,
  });
  cache.set(jti, true);
}

/** true si la sesión del jti está vigente. Cacheado. */
async function estaVigente(jti) {
  if (!jti) return false;
  if (cache.get(jti)) return true;

  const s = await Sesion.findOne({ where: { jti } });
  const vigente = Boolean(s) && !s.revocada_en && s.expira_en > new Date();
  if (vigente) {
    cache.set(jti, true);
    // "visto por última vez" — solo en el miss de caché (≈cada 30 s por sesión).
    try {
      await Sesion.update({ ultimo_uso_en: new Date() }, { where: { jti } });
    } catch {
      /* no crítico */
    }
  }
  return vigente;
}

async function revocar(jti) {
  if (!jti) return;
  cache.delete(jti);
  await Sesion.update({ revocada_en: new Date() }, { where: { jti, revocada_en: null } });
}

async function revocarTodasDe(usuarioId, exceptoJti = null) {
  const where = { usuarioId, revocada_en: null };
  if (exceptoJti) where.jti = { [Op.ne]: exceptoJti };
  const [revocadas] = await Sesion.update({ revocada_en: new Date() }, { where });
  cache.clear(); // barato y raro; el resto se revalida contra la BD
  return revocadas;
}

async function listarDe(usuarioId) {
  const ahora = new Date();
  const filas = await Sesion.findAll({
    where: { usuarioId, revocada_en: null, expira_en: { [Op.gt]: ahora } },
    order: [['ultimo_uso_en', 'DESC']],
  });
  return filas.map((s) => ({
    id: s.id,
    userAgent: s.user_agent,
    ip: s.ip,
    creadaEn: s.creada_en,
    ultimoUsoEn: s.ultimo_uso_en,
  }));
}

module.exports = { nuevoJti, crear, estaVigente, revocar, revocarTodasDe, listarDe, _cache: cache };
