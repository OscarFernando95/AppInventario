'use strict';

/**
 * N15 — Los importes en pesos colombianos pueden ser grandes: `DECIMAL(10,2)`
 * topa en ~$100 M. Se amplían a `DECIMAL(14,2)` (~$1 billón). Cast sin pérdida.
 *
 * Se dejan como están las columnas que son PORCENTAJES (`porcentaje_iva`,
 * `descuento_global`): `DECIMAL(5,2)` sobra para 0–100.
 */

const COLS = [
  ['productos', 'precio_unitario'],
  ['servicios', 'precio'],
  ['ventas', 'total'],
  ['ventas', 'subtotal_bruto'],
  ['ventas', 'total_impuestos'],
  ['ventas', 'total_descuentos'],
  ['ventas_detalles', 'precio_unitario'],
  ['ventas_detalles', 'precio_base'],
  ['ventas_detalles', 'valor_iva'],
  ['ventas_detalles', 'subtotal_bruto'],
  ['compras', 'total'],
  ['compras_detalles', 'costo_unitario'],
  ['pedidos', 'total_estimado'],
  ['pedidos_detalles', 'costo_estimado'],
];

const changeAll = async (queryInterface, precision) => {
  const t = await queryInterface.sequelize.transaction();
  try {
    for (const [table, col] of COLS) {
      await queryInterface.sequelize.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${col}" TYPE NUMERIC(${precision},2)`,
        { transaction: t }
      );
    }
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

module.exports = {
  up: (queryInterface) => changeAll(queryInterface, 14),
  down: (queryInterface) => changeAll(queryInterface, 10),
};
