'use strict';

/**
 * Módulos "Mesas" (cuentas abiertas por mesa, división de cuenta, propina y comandas) y "Cocina"
 * (pantalla de cocina). Son nuevos: no se asignan solos, el backoffice los habilita por empresa.
 * Idempotente.
 */

const { QueryTypes } = require('sequelize');

const NUEVOS = [
  { id: 15, nombre_codigo: 'Mesas', descripcion: 'Cuentas abiertas por mesa, división de cuenta, propina y comandas' },
  { id: 16, nombre_codigo: 'Cocina', descripcion: 'Pantalla de cocina con las comandas pendientes' },
];

module.exports = {
  async up(queryInterface) {
    const existentes = await queryInterface.sequelize.query('SELECT nombre_codigo FROM "modulos"', { type: QueryTypes.SELECT });
    const set = new Set(existentes.map((m) => m.nombre_codigo));
    const faltan = NUEVOS.filter((m) => !set.has(m.nombre_codigo));
    if (faltan.length === 0) return;
    await queryInterface.bulkInsert('modulos', faltan);
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query(
        `SELECT setval(pg_get_serial_sequence('"modulos"', 'id'), GREATEST((SELECT MAX(id) FROM "modulos"), 1))`
      );
    }
  },

  async down(queryInterface) {
    const nombres = NUEVOS.map((m) => m.nombre_codigo);
    await queryInterface.sequelize.query(
      `DELETE FROM "empresas_modulos" WHERE "moduloId" IN (SELECT id FROM modulos WHERE nombre_codigo IN (:nombres))`,
      { replacements: { nombres } }
    );
    await queryInterface.bulkDelete('modulos', { nombre_codigo: nombres });
  },
};
