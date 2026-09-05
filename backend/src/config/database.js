/**
 * Instancia de Sequelize usada por toda la aplicación.
 *
 * Toda la configuración de conexión (dialecto, DATABASE_URL vs variables sueltas,
 * SSL para Supabase, límites de tiempo, pool) vive en ./connection.js, que es la
 * misma fuente que consume sequelize-cli para migraciones y seeders.
 */

const { createSequelize } = require('./connection');

const sequelize = createSequelize();

// Test de conexión (no bloqueante).
sequelize.authenticate()
  .then(() => console.log('Base de datos conectada correctamente.'))
  .catch(err => console.error('Error al conectar a la base de datos:', err));

module.exports = sequelize;
