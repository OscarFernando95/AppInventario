'use strict';

/**
 * Módulo Gastos (recibos, arriendo, nómina… sin proveedor).
 *
 * Antes los gastos se anotaban como líneas "de gasto" dentro de Compras; ahora
 * tienen su propio módulo. Para no quitarle la función a nadie, las empresas
 * que ya tienen Compras reciben también Gastos. Idempotente.
 */

const { QueryTypes } = require('sequelize');

const GASTOS = { id: 11, nombre_codigo: 'Gastos', descripcion: 'Gastos operativos sin proveedor (servicios, arriendo, nómina)' };

module.exports = {
  async up(queryInterface) {
    const existe = await queryInterface.sequelize.query(
      'SELECT id FROM "modulos" WHERE nombre_codigo = :n',
      { type: QueryTypes.SELECT, replacements: { n: GASTOS.nombre_codigo } }
    );
    let id = existe[0]?.id;
    if (!id) {
      await queryInterface.bulkInsert('modulos', [GASTOS]);
      id = GASTOS.id;
      if (queryInterface.sequelize.getDialect() === 'postgres') {
        await queryInterface.sequelize.query(
          `SELECT setval(pg_get_serial_sequence('"modulos"', 'id'), GREATEST((SELECT MAX(id) FROM "modulos"), 1))`
        );
      }
    }

    await queryInterface.sequelize.query(
      `INSERT INTO "empresas_modulos" ("empresaId", "moduloId", "createdAt", "updatedAt")
       SELECT em."empresaId", :gastosId, NOW(), NOW()
         FROM "empresas_modulos" em
         JOIN "modulos" m ON m.id = em."moduloId"
        WHERE m.nombre_codigo = 'Compras'
       ON CONFLICT DO NOTHING`,
      { replacements: { gastosId: id } }
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('empresas_modulos', { moduloId: GASTOS.id });
    await queryInterface.bulkDelete('modulos', { nombre_codigo: GASTOS.nombre_codigo });
  },
};
