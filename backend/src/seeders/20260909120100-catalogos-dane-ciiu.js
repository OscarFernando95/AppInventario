'use strict';

/**
 * Puebla los catálogos de referencia:
 *   - departamentos    (33)   desde data/divipola.json
 *   - municipios        (1123) desde data/divipola.json
 *   - actividades_ciiu  (~500) desde data/ciiu-rev4ac.json (JSON jerárquico -> aplanado)
 *
 * Idempotente: si la tabla ya tiene filas, se salta. Los nombres se guardan tal
 * cual vienen de la fuente (MAYÚSCULAS para DANE); el formateo legible se hace
 * en el frontend.  Ver data/FUENTES.md para la procedencia de los archivos.
 */

const { QueryTypes } = require('sequelize');
const divipola = require('./data/divipola.json');
const ciiu = require('./data/ciiu-rev4ac.json');
const { flattenCiiu } = require('../utils/ciiu');

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
    // --- departamentos ---
    if (await count(queryInterface, 'departamentos') === 0) {
      const vistos = new Map();
      for (const r of divipola) {
        if (!vistos.has(r.departamentoDANE)) vistos.set(r.departamentoDANE, r.departamento);
      }
      const filas = [...vistos.entries()]
        .map(([codigo_dane, nombre]) => ({ codigo_dane, nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      await queryInterface.bulkInsert('departamentos', filas);
      await resetSequence(queryInterface, 'departamentos');
    }

    // --- municipios ---
    if (await count(queryInterface, 'municipios') === 0) {
      const filas = divipola
        .map((r) => ({
          codigo_dane: r.municipioDANE,
          nombre: r.municipio,
          departamento_codigo: r.departamentoDANE,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      await queryInterface.bulkInsert('municipios', filas);
      await resetSequence(queryInterface, 'municipios');
    }

    // --- actividades CIIU ---
    if (await count(queryInterface, 'actividades_ciiu') === 0) {
      const filas = flattenCiiu(ciiu).sort((a, b) => a.codigo.localeCompare(b.codigo));
      await queryInterface.bulkInsert('actividades_ciiu', filas);
      await resetSequence(queryInterface, 'actividades_ciiu');
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('actividades_ciiu', null, {});
    await queryInterface.bulkDelete('municipios', null, {});
    await queryInterface.bulkDelete('departamentos', null, {});
  },
};
