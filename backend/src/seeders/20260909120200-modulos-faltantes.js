'use strict';

/**
 * Añade los módulos contratables que el frontend ya ofrecía pero que el seeder
 * inicial no sembró (solo creó 1..5). Sin ellos, marcar "Clientes", "Servicios"
 * o "Pedidos" al crear un inquilino provocaba un error de clave foránea en
 * `empresas_modulos` -> 500 opaco.
 *
 * Idempotente: inserta por `nombre_codigo` solo los que falten. IDs explícitos
 * 6..8 para mantener paridad con la lista histórica del frontend.
 */

const { QueryTypes } = require('sequelize');

const NUEVOS = [
  { id: 6, nombre_codigo: 'Clientes', descripcion: 'Directorio de clientes' },
  { id: 7, nombre_codigo: 'Servicios', descripcion: 'Catálogo de servicios' },
  { id: 8, nombre_codigo: 'Pedidos', descripcion: 'Pedidos a proveedores' },
];

async function resetSequence(queryInterface, table) {
  if (queryInterface.sequelize.getDialect() !== 'postgres') return;
  await queryInterface.sequelize.query(
    `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'),
            GREATEST((SELECT MAX(id) FROM "${table}"), 1))`
  );
}

module.exports = {
  async up(queryInterface) {
    const existentes = await queryInterface.sequelize.query(
      'SELECT nombre_codigo FROM "modulos"',
      { type: QueryTypes.SELECT }
    );
    const set = new Set(existentes.map((m) => m.nombre_codigo));
    const faltan = NUEVOS.filter((m) => !set.has(m.nombre_codigo));
    if (faltan.length === 0) return;

    await queryInterface.bulkInsert('modulos', faltan);
    await resetSequence(queryInterface, 'modulos');
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('modulos', {
      nombre_codigo: NUEVOS.map((m) => m.nombre_codigo),
    });
  },
};
