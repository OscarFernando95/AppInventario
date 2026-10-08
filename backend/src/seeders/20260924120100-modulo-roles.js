'use strict';

/** Módulo contratable "Roles y permisos". No se asigna solo: el backoffice lo habilita por empresa. Idempotente. */

const { QueryTypes } = require('sequelize');

const ROLES = { id: 14, nombre_codigo: 'Roles y permisos', descripcion: 'Crear roles propios y definir qué ve y qué puede hacer cada uno' };

module.exports = {
  async up(queryInterface) {
    const ya = await queryInterface.sequelize.query('SELECT 1 FROM "modulos" WHERE nombre_codigo = :n', { replacements: { n: ROLES.nombre_codigo }, type: QueryTypes.SELECT });
    if (ya.length > 0) return;
    await queryInterface.bulkInsert('modulos', [ROLES]);
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query(
        `SELECT setval(pg_get_serial_sequence('"modulos"', 'id'), GREATEST((SELECT MAX(id) FROM "modulos"), 1))`
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM "empresas_modulos" WHERE "moduloId" IN (SELECT id FROM modulos WHERE nombre_codigo = :n)`,
      { replacements: { n: ROLES.nombre_codigo } }
    );
    await queryInterface.bulkDelete('modulos', { nombre_codigo: ROLES.nombre_codigo });
  },
};
