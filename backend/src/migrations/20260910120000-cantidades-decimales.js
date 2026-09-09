'use strict';

/**
 * N4 — Cantidades fraccionarias.
 *
 * `cantidad` / `stock_actual` pasan de INTEGER a DECIMAL(12,3) para poder vender
 * y comprar por peso/volumen (kg, litros, metros — `unidad_medida` ya ofrecía
 * KGM/LTR/MTK). El esquema `zod` acepta hasta 3 decimales.
 *
 * El cast INTEGER -> NUMERIC(12,3) es implícito y sin pérdida en PostgreSQL.
 */

const COLUMNS = [
  ['ventas_detalles', 'cantidad'],
  ['compras_detalles', 'cantidad'],
  ['pedidos_detalles', 'cantidad_pedida'],
  ['productos', 'stock_actual'],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      for (const [table, col] of COLUMNS) {
        await queryInterface.changeColumn(
          table,
          col,
          { type: Sequelize.DECIMAL(12, 3), allowNull: false, defaultValue: col === 'stock_actual' ? 0 : undefined },
          { transaction: t }
        );
      }
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      for (const [table, col] of COLUMNS) {
        // Al revertir se trunca la parte decimal (USING ...::integer).
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${col}" TYPE INTEGER USING ROUND("${col}")::integer`,
          { transaction: t }
        );
      }
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
