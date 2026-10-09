const os = require('os');
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

const PUERTO = process.env.E2E_PORT || '4010';

// Todo lo que generan las pruebas (capturas, trazas) va a la carpeta temporal del sistema y
// se BORRA al terminar (global-teardown.js); en el proyecto no queda nada. Para investigar un
// fallo: E2E_CONSERVAR=1 conserva esa carpeta (y hay que borrarla a mano después).
const TEMPORAL = path.join(os.tmpdir(), (process.env.E2E_CARPETA || 'appinventario-e2e'));
const CONSERVAR = process.env.E2E_CONSERVAR === '1';

module.exports = defineConfig({
  testDir: './tests',
  // Los flujos son una historia encadenada (crear empresa -> comprar -> vender -> cerrar caja):
  // comparten la misma base de datos, así que van en orden y de a uno.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: path.join(TEMPORAL, 'resultados'),
  globalTeardown: require.resolve('./global-teardown.js'),
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    acceptDownloads: true,
    screenshot: CONSERVAR ? 'only-on-failure' : 'off',
    trace: 'off',
    video: 'off',
    viewport: { width: 1440, height: 900 },
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'node servidor.js',
    url: `http://localhost:${PUERTO}/api/health`,
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
