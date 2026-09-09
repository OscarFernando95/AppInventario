'use strict';

/**
 * Fase 9 — Concurrencia / integridad: `empresas.nit` no tenía restricción de
 * unicidad, así que dos empresas podían quedar con el mismo NIT (informes
 * ambiguos y, cuando se integre la facturación electrónica, numeración de
 * resolución cruzada).
 *
 * 1. Normaliza los NIT existentes: quita puntos, guiones y espacios y recorta.
 *    (El esquema `zod` hace lo mismo de aquí en adelante.)
 * 2. Si tras normalizar hay NIT duplicados, aborta con un mensaje claro para que
 *    un humano los resuelva antes de reintentar (no se puede adivinar cuál gana).
 * 3. Crea un índice único PARCIAL: solo aplica a filas con NIT no vacío, así que
 *    varias empresas sin NIT siguen siendo válidas.
 */

const INDEX_NAME = 'empresas_nit_unico';

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    const t = await sequelize.transaction();
    try {
      await sequelize.query(
        `UPDATE "empresas"
            SET "nit" = NULLIF(regexp_replace(TRIM("nit"), '[.\\- ]', '', 'g'), '')
          WHERE "nit" IS NOT NULL`,
        { transaction: t }
      );

      const [dups] = await sequelize.query(
        `SELECT "nit", COUNT(*)::int AS n
           FROM "empresas"
          WHERE "nit" IS NOT NULL AND "nit" <> ''
          GROUP BY "nit"
         HAVING COUNT(*) > 1`,
        { transaction: t }
      );
      if (dups.length > 0) {
        const detalle = dups.map((d) => `${d.nit} (x${d.n})`).join(', ');
        throw new Error(
          `No se puede aplicar el índice único: hay NIT de empresa duplicados: ${detalle}. ` +
          'Corrígelos manualmente (fusionar o renumerar) y vuelve a correr la migración.'
        );
      }

      await sequelize.query(
        `CREATE UNIQUE INDEX "${INDEX_NAME}" ON "empresas" ("nit")
           WHERE "nit" IS NOT NULL AND "nit" <> ''`,
        { transaction: t }
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${INDEX_NAME}"`);
  },
};
