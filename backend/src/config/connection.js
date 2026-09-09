/**
 * Fuente única de verdad para la configuración de conexión a la base de datos.
 *
 * La consumen:
 *   - src/config/database.js             -> instancia de Sequelize de la app
 *   - src/config/sequelize-cli.config.js -> config de sequelize-cli (migraciones/seeders)
 *
 * Motor: PostgreSQL (único soportado).
 *
 * Conexión:
 *   1. DATABASE_URL                                   (formato único; Docker, Supabase…)
 *   2. Variables sueltas DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD  (fallback local)
 *
 * SSL: desactivado salvo DB_SSL=true (p.ej. Supabase).
 *
 * Límites de tiempo:
 *   - DB_ACQUIRE_TIMEOUT_MS   (default 15000) máx. para obtener conexión del pool
 *   - DB_STATEMENT_TIMEOUT_MS (default 15000) máx. de ejecución de una sentencia
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

const DIALECT = 'postgres';

const ACQUIRE_TIMEOUT_MS = Number(process.env.DB_ACQUIRE_TIMEOUT_MS || 15000);
const STATEMENT_TIMEOUT_MS = Number(process.env.DB_STATEMENT_TIMEOUT_MS || 15000);

const sslEnabled = process.env.DB_SSL === 'true';

function buildDialectOptions() {
  const opts = {
    // Corta consultas colgadas y transacciones abiertas indefinidamente.
    statement_timeout: STATEMENT_TIMEOUT_MS,
    idle_in_transaction_session_timeout: STATEMENT_TIMEOUT_MS,
  };
  if (sslEnabled) {
    opts.ssl = { require: true, rejectUnauthorized: false };
  }
  return opts;
}

function buildCommonOptions() {
  return {
    dialect: DIALECT,
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
    port: Number(process.env.DB_PORT) || 5432,
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

module.exports = { createSequelize, buildCliConfig, dialect: DIALECT, usingUrl };
