/**
 * Fuente única de verdad para la configuración de conexión a la base de datos.
 *
 * La consumen:
 *   - src/config/database.js        -> instancia de Sequelize usada por la app
 *   - src/config/sequelize-cli.config.js -> configuración usada por sequelize-cli (migraciones/seeders)
 *
 * Prioridad de conexión:
 *   1. DATABASE_URL   (formato único, el que entrega Supabase)
 *   2. Variables sueltas DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD  (fallback local)
 *
 * Dialecto:
 *   - DB_DIALECT (default: "postgres"). Poner "mysql" para seguir usando una BD MySQL local.
 *
 * SSL:
 *   - Desactivado por defecto (Docker/Postgres local no lo necesita). Activar con DB_SSL=true
 *     cuando el destino lo exija (p.ej. Supabase).
 *
 * Límites de tiempo (decisión A - "con un límite de tiempo"):
 *   - DB_ACQUIRE_TIMEOUT_MS   (default 15000) tiempo máx. para obtener una conexión del pool
 *   - DB_STATEMENT_TIMEOUT_MS (default 15000) tiempo máx. de ejecución de una sentencia (solo postgres)
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

const dialect = process.env.DB_DIALECT || 'postgres';

const ACQUIRE_TIMEOUT_MS = Number(process.env.DB_ACQUIRE_TIMEOUT_MS || 15000);
const STATEMENT_TIMEOUT_MS = Number(process.env.DB_STATEMENT_TIMEOUT_MS || 15000);

// SSL: opcional. Solo se activa si DB_SSL=true (p.ej. Supabase); en Docker/local no aplica.
const sslEnabled = dialect === 'postgres' && process.env.DB_SSL === 'true';

function buildDialectOptions() {
  const opts = {};
  if (sslEnabled) {
    opts.ssl = { require: true, rejectUnauthorized: false };
  }
  if (dialect === 'postgres') {
    // Corta consultas colgadas y transacciones abiertas indefinidamente.
    opts.statement_timeout = STATEMENT_TIMEOUT_MS;
    opts.idle_in_transaction_session_timeout = STATEMENT_TIMEOUT_MS;
  }
  return opts;
}

function buildCommonOptions() {
  return {
    dialect,
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    dialectOptions: buildDialectOptions(),
    pool: {
      max: Number(process.env.DB_POOL_MAX || 5),
      min: Number(process.env.DB_POOL_MIN || 0),
      acquire: ACQUIRE_TIMEOUT_MS,
      idle: Number(process.env.DB_POOL_IDLE_MS || 10000),
    },
  };
}

const usingUrl = Boolean(process.env.DATABASE_URL);

function looseCredentials() {
  return {
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || (dialect === 'postgres' ? 5432 : 3306),
  };
}

/** Instancia de Sequelize para la aplicación. */
function createSequelize() {
  const options = buildCommonOptions();
  if (usingUrl) {
    return new Sequelize(process.env.DATABASE_URL, options);
  }
  return new Sequelize({ ...options, ...looseCredentials() });
}

/** Objeto de configuración en el formato que espera sequelize-cli. */
function buildCliConfig() {
  const common = buildCommonOptions();
  const cfg = {
    dialect: common.dialect,
    dialectOptions: common.dialectOptions,
    logging: false,
    pool: common.pool,
    // sequelize-cli necesita saber qué migraciones/seeders ya se aplicaron:
    migrationStorageTableName: 'sequelize_meta',
    seederStorage: 'sequelize',
    seederStorageTableName: 'sequelize_seeders',
  };
  if (usingUrl) {
    cfg.use_env_variable = 'DATABASE_URL';
  } else {
    Object.assign(cfg, looseCredentials());
  }
  return cfg;
}

module.exports = { createSequelize, buildCliConfig, dialect, usingUrl };
