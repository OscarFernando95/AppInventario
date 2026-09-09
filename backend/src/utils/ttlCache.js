'use strict';

/**
 * Caché en memoria con expiración por entrada (TTL). Suficiente para una sola
 * instancia de backend (el despliegue de la oficina). Si algún día hay varias
 * réplicas, migrar a Redis.
 *
 *   const cache = new TtlCache(30_000);
 *   cache.get(key)                       // valor | undefined (si no está o expiró)
 *   cache.set(key, value)                // usa el TTL por defecto
 *   cache.delete(key) / cache.clear()
 */
class TtlCache {
  constructor(defaultTtlMs = 60_000, maxEntries = 5_000) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
    this.store = new Map(); // key -> { value, expiresAt }
  }

  get(key) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    // Poda simple: si se llena, se vacía entero (barato y raro).
    if (this.store.size >= this.maxEntries) this.store.clear();
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

module.exports = TtlCache;
