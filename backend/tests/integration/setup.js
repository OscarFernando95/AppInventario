'use strict';

// setupFile: se ejecuta ANTES de que los tests importen `src/app` (y por tanto
// antes de que `config/connection.js` lea DATABASE_URL). Aquí se fija el entorno
// para apuntar a la base de datos de test.

const path = require('path');

// Credenciales de la BD de Docker (del .env de la raíz del proyecto).
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const USER = process.env.POSTGRES_USER || 'appinventario';
const PW = process.env.POSTGRES_PASSWORD || '';
const HOST = process.env.TEST_DB_HOST || 'localhost';
const PORT = process.env.TEST_DB_PORT || '5433'; // puerto del override de desarrollo
const TEST_DB = process.env.TEST_DB_NAME || 'appinventario_test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `postgres://${USER}:${PW}@${HOST}:${PORT}/${TEST_DB}`;
process.env.TEST_DB_ADMIN_URL = `postgres://${USER}:${PW}@${HOST}:${PORT}/postgres`;
process.env.TEST_DB_NAME = TEST_DB;
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'integration-test-secret-0123456789abcdef';
}
process.env.DB_LOGGING = 'false';
