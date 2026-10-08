'use strict';

/**
 * Siembra los módulos contratables Recetas (ingredientes por plato) y Caja
 * (apertura/cierre de caja). Idempotente: inserta por `nombre_codigo` solo los
 * que falten. IDs explícitos 9..10 (continúan la lista histórica 1..8).
 */

const { QueryTypes } = require('sequelize');

const NUEVOS = [
  { id: 9, nombre_codigo: 'Recetas', descripcion: 'Insumos y recetas: los platos descuentan ingredientes' },
  { id: 10, nombre_codigo: 'Caja', descripcion: 'Apertura y cierre de caja con reporte PDF' },
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
