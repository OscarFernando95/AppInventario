'use strict';

/**
 * Prepara la base de datos desde cero, SIN destruir datos:
 *   1. Aplica todas las migraciones pendientes   (equivale a: npm run migrate)
 *   2. Ejecuta todos los seeders                  (equivale a: npm run seed)
 *
 * Sustituye al antiguo `sequelize.sync({ force: true })`, que borraba todas las
 * tablas en cada ejecución. Este script es idempotente: las migraciones ya
 * aplicadas se saltan y el seeder inicial no duplica datos.
 *
 * Uso:  npm run initdb
 */

const path = require('path');
const { execFileSync } = require('child_process');

const backendRoot = path.resolve(__dirname, '../..');
const sequelizeCli = require.resolve('sequelize-cli/lib/sequelize');

function run(label, args) {
  console.log(`\n== ${label} ==`);
  execFileSync(process.execPath, [sequelizeCli, ...args], {
    cwd: backendRoot,        // aquí vive .sequelizerc
    stdio: 'inherit',
    env: process.env,
  });
}

try {
  run('Aplicando migraciones', ['db:migrate']);
  run('Ejecutando seeders', ['db:seed:all']);
  console.log('\n✔ Base de datos lista (migraciones + datos iniciales).');
  console.log('  Usuario administrador: admin / Admin*123');
  process.exit(0);
} catch (err) {
  console.error('\n✖ Error preparando la base de datos.');
  console.error('  Revisa la conexión (DATABASE_URL / DB_*) y vuelve a intentar.');
  process.exit(1);
}
