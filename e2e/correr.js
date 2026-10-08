'use strict';

/**
 * Ejecuta las pruebas de navegador y, pase lo que pase, borra lo que dejaron en la carpeta
 * temporal (capturas, trazas, build del frontend de pruebas). Con E2E_CONSERVAR=1 se conserva.
 *
 *   npm test                      -> todas
 *   npm test -- tests/02-*.js     -> las que indiques (los argumentos van a Playwright)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const resultado = spawnSync(
  process.execPath,
  [require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)],
  { stdio: 'inherit', cwd: __dirname, env: process.env }
);

if (process.env.E2E_CONSERVAR !== '1') {
  fs.rmSync(path.join(os.tmpdir(), 'appinventario-e2e'), { recursive: true, force: true });
}
process.exit(resultado.status ?? 1);
