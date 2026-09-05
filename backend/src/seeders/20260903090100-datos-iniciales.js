'use strict';

/**
 * Datos semilla iniciales (reemplaza la parte de siembra del antiguo initDB.js):
 *   - 3 roles base           (BACKOFFICE_ADMIN, FRONT_ADMIN, FRONT_USER)
 *   - 5 módulos contratables  (Inventario, Ventas, Compras, Proveedores, Informes)
 *   - 1 usuario administrador (admin / Admin*123)
 *
 * Idempotente: si una tabla ya tiene filas, se salta esa parte. Puede ejecutarse
 * varias veces sin duplicar datos ni fallar.
 *
 * IDs explícitos: se conservan (roles 1-3, módulos 1-5) para mantener paridad con
 * la BD actual. En Postgres, insertar IDs explícitos NO adelanta la secuencia, así
 * que al final se hace setval() para que el próximo INSERT autogenerado no colisione.
 */

const bcrypt = require('bcrypt');
const { QueryTypes } = require('sequelize');

const ROLES = [
  { id: 1, nombre: 'Súper Administrador', tipo: 'BACKOFFICE_ADMIN' },
  { id: 2, nombre: 'Administrador de Empresa', tipo: 'FRONT_ADMIN' },
  { id: 3, nombre: 'Usuario Operativo', tipo: 'FRONT_USER' },
];

const MODULOS = [
  { id: 1, nombre_codigo: 'Inventario' },
  { id: 2, nombre_codigo: 'Ventas' },
  { id: 3, nombre_codigo: 'Compras' },
  { id: 4, nombre_codigo: 'Proveedores' },
  { id: 5, nombre_codigo: 'Informes' },
];

const ADMIN = {
  username: 'admin',
  nombre: 'Súper Administrador',
  plainPassword: 'Admin*123',
  rolId: 1, // BACKOFFICE_ADMIN
};

async function count(queryInterface, table) {
  const rows = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS c FROM "${table}"`,
    { type: QueryTypes.SELECT }
  );
  return Number(rows[0].c);
}

async function resetSequence(queryInterface, table) {
  if (queryInterface.sequelize.getDialect() !== 'postgres') return;
  await queryInterface.sequelize.query(
    `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'),
            GREATEST((SELECT MAX(id) FROM "${table}"), 1))`
  );
}

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // --- Roles (timestamps: false en el modelo) ---
    if (await count(queryInterface, 'roles') === 0) {
      await queryInterface.bulkInsert('roles', ROLES);
      await resetSequence(queryInterface, 'roles');
    }

    // --- Módulos (timestamps: false en el modelo) ---
    if (await count(queryInterface, 'modulos') === 0) {
      await queryInterface.bulkInsert('modulos', MODULOS.map(m => ({ ...m, descripcion: null })));
      await resetSequence(queryInterface, 'modulos');
    }

    // --- Usuario admin (timestamps: true en el modelo) ---
    const adminExists = await queryInterface.sequelize.query(
      'SELECT 1 FROM "usuarios" WHERE username = :u LIMIT 1',
      { type: QueryTypes.SELECT, replacements: { u: ADMIN.username } }
    );
    if (adminExists.length === 0) {
      const hash = await bcrypt.hash(ADMIN.plainPassword, 10);
      await queryInterface.bulkInsert('usuarios', [{
        rolId: ADMIN.rolId,
        nombre: ADMIN.nombre,
        username: ADMIN.username,
        contrasena_hash: hash,
        estado: true,
        createdAt: now,
        updatedAt: now,
      }]);
      await resetSequence(queryInterface, 'usuarios');
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('usuarios', { username: ADMIN.username });
    await queryInterface.bulkDelete('modulos', { nombre_codigo: MODULOS.map(m => m.nombre_codigo) });
    await queryInterface.bulkDelete('roles', { tipo: ROLES.map(r => r.tipo) });
  },
};
