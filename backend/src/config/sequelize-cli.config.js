/**
 * Configuración consumida por sequelize-cli (ver ../../.sequelizerc).
 *
 * No dupliques lógica aquí: todo sale de ./connection.js, que es la misma
 * fuente que usa la aplicación en runtime.
 *
 * Los tres entornos comparten configuración porque el destino (local / Supabase)
 * se decide por variables de entorno (DATABASE_URL, DB_DIALECT, etc.), no por NODE_ENV.
 */

require('dotenv').config();
const { buildCliConfig } = require('./connection');

const config = buildCliConfig();

module.exports = {
  development: config,
  test: config,
  production: config,
};
