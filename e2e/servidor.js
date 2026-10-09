'use strict';

/**
 * Servidor de las pruebas de navegador.
 *
 * Levanta TODO el sistema real en un solo puerto: recrea una base de datos de
 * prueba (appinventario_e2e) con las migraciones y los seeders reales (los mismos
 * que corren en producción), compila el frontend y arranca el backend, que sirve
 * el build. Así las pruebas recorren la misma ruta que un usuario.
 *
 * Requiere el Postgres de Docker arriba:  docker compose up -d db
 */

const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const BACKEND = path.join(RAIZ, 'backend');
const FRONTEND = path.join(RAIZ, 'frontend');
const requerirBackend = (m) => require(path.join(BACKEND, 'node_modules', m));

requerirBackend('dotenv').config({ path: path.join(RAIZ, '.env'), quiet: true });

const USER = process.env.POSTGRES_USER || 'appinventario';
const PW = process.env.POSTGRES_PASSWORD || '';
const HOST = process.env.E2E_DB_HOST || 'localhost';
const PORT_DB = process.env.E2E_DB_PORT || '5433';
const DB = process.env.E2E_DB_NAME || 'appinventario_e2e';
const PUERTO = process.env.E2E_PORT || '4010';

// Entorno del backend (debe fijarse ANTES de cargar app.js y sequelize-cli).
// NODE_ENV=test desactiva los límites de intentos de login y el log de acceso.
Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: PUERTO,
  DATABASE_URL: `postgres://${USER}:${PW}@${HOST}:${PORT_DB}/${DB}`,
  JWT_SECRET: process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
    ? process.env.JWT_SECRET
    : 'e2e-secret-0123456789abcdef0123456789abcdef',
  DB_LOGGING: 'false',
});

async function main() {
  // 1. Base de datos limpia.
  const { Client } = requerirBackend('pg');
  const admin = new Client({ connectionString: `postgres://${USER}:${PW}@${HOST}:${PORT_DB}/postgres` });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();

  // 2. Migraciones y seeders REALES (admin / Admin*123, roles, módulos, catálogos DANE/CIIU).
  const cli = path.join(BACKEND, 'node_modules', 'sequelize-cli', 'lib', 'sequelize');
  for (const cmd of ['db:migrate', 'db:seed:all']) {
    execFileSync(process.execPath, [cli, cmd], { cwd: BACKEND, env: process.env, stdio: 'pipe' });
  }

  // 3. Frontend compilado en una carpeta PROPIA (no se pisa frontend/dist) y con la API
  // en rutas relativas: frontend/.env apunta a tu backend de desarrollo (localhost:4000)
  // y las variables VITE_* del entorno tienen prioridad sobre ese archivo.
  const dist = path.join(os.tmpdir(), (process.env.E2E_CARPETA || 'appinventario-e2e'), 'dist'); // se borra al terminar (global-teardown)
  execFileSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir'], {
    cwd: FRONTEND, env: { ...process.env, VITE_API_URL: '/api' }, stdio: 'pipe',
  });

  // 4. Backend + el build de pruebas. El backend ya sirve la API; aquí solo se le antepone
  // el estático del build y el fallback de la SPA (index.html) para rutas como /app/caja.
  const express = requerirBackend('express');
  const api = require(path.join(BACKEND, 'src', 'app'));
  const servidor = express();
  servidor.use((req, res, next) => (req.path.startsWith('/api') ? api(req, res, next) : next()));
  servidor.use(express.static(dist, { index: false }));
  servidor.get('/*splat', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  servidor.listen(Number(PUERTO), () => console.log(`E2E listo en http://localhost:${PUERTO}`));
}

main().catch((err) => {
  console.error('No se pudo levantar el entorno E2E:', err.message);
  process.exit(1);
});
