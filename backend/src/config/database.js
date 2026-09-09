/**
 * Instancia de Sequelize usada por toda la aplicación.
 *
 * Toda la configuración de conexión (DATABASE_URL vs variables sueltas, SSL,
 * límites de tiempo, pool) vive en ./connection.js, que es la misma fuente que
 * consume sequelize-cli para migraciones y seeders.
 *
 * La comprobación de conexión al arrancar la hace src/index.js (una sola vez);
 * aquí NO se llama a `authenticate()` para no abrir conexiones al importar el
 * módulo (importa a los tests y a cualquier script).
 */

const { createSequelize } = require('./connection');

module.exports = createSequelize();
