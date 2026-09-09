const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    // describe / it / expect / vi disponibles sin import (los tests son CJS).
    globals: true,
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
