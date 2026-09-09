const { defineConfig } = require('vitest/config');

// Tests de integración HTTP (supertest + Postgres real).
// Requiere la BD de Docker levantada:  docker compose up -d db
// Usa una base separada `appinventario_test` (se recrea en cada corrida).
module.exports = defineConfig({
  test: {
    globals: true,
    include: ['tests/integration/**/*.test.js'],
    setupFiles: ['tests/integration/setup.js'],
    environment: 'node',
    fileParallelism: false, // comparten la misma BD
    testTimeout: 30_000,
    hookTimeout: 90_000,
  },
});
