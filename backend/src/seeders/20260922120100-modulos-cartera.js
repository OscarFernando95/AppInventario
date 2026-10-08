'use strict';

/**
 * Módulos "Cuentas por cobrar" y "Cuentas por pagar".
 *
 * Antes una venta podía marcarse "a crédito" sin ningún control de lo que el cliente debía; ahora ese
 * crédito se gestiona en Cuentas por cobrar. Para no quitarle función a nadie, las empresas que ya
 * vendieron a crédito reciben el módulo. Cuentas por pagar es nuevo: no se asigna sola. Idempotente.
 */

const { QueryTypes } = require('sequelize');

const NUEVOS = [
  { id: 12, nombre_codigo: 'Cuentas por cobrar', descripcion: 'Ventas a crédito, abonos y cartera de clientes' },
  { id: 13, nombre_codigo: 'Cuentas por pagar', descripcion: 'Compras a crédito, pagos y deudas con proveedores' },
];

module.exports = {
  async up(queryInterface) {
    const existentes = await queryInterface.sequelize.query('SELECT nombre_codigo FROM "modulos"', { type: QueryTypes.SELECT });
    const set = new Set(existentes.map((m) => m.nombre_codigo));
    const faltan = NUEVOS.filter((m) => !set.has(m.nombre_codigo));
    if (faltan.length > 0) {
      await queryInterface.bulkInsert('modulos', faltan);
      if (queryInterface.sequelize.getDialect() === 'postgres') {
        await queryInterface.sequelize.query(
          `SELECT setval(pg_get_serial_sequence('"modulos"', 'id'), GREATEST((SELECT MAX(id) FROM "modulos"), 1))`
        );
      }
    }

    await queryInterface.sequelize.query(
      `INSERT INTO "empresas_modulos" ("empresaId", "moduloId", "createdAt", "updatedAt")
       SELECT DISTINCT v."empresaId", m.id, NOW(), NOW()
         FROM ventas v
         JOIN modulos m ON m.nombre_codigo = 'Cuentas por cobrar'
        WHERE v.forma_pago = '2'
       ON CONFLICT DO NOTHING`
    );
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
