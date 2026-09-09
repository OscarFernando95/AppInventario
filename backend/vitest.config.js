const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    // describe / it / expect / vi disponibles sin import (los tests son CJS).
    globals: true,
    // Solo tests unitarios (lógica pura, sin BD). Los de integración necesitan
    // una BD Postgres de test y se corren aparte: `npm run test:integration`.
    include: ['tests/*.test.js'],
    environment: 'node',
  },
});
