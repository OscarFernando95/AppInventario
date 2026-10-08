'use strict';

/**
 * Presentación de compra: comprar en una unidad (kg, caja…) y gastar en otra (g, ud).
 *
 *   - productos.unidad_compra / factor_compra : "1 <unidad_compra> = <factor_compra>
 *     unidades base" (p. ej. KGM -> 1000 si la unidad base es GRM). Sin unidad_compra
 *     el producto se compra en su unidad base (factor 1).
 *   - compras_detalles / pedidos_detalles : foto de la presentación usada en la línea
 *     (unidad_presentacion + factor_presentacion). Las cantidades y costos guardados
 *     siguen en la unidad BASE; con la foto se pueden mostrar como se compraron.
 *   - costo_unitario / costo_estimado pasan a 4 decimales: $17.333/kg = $17,333/g.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { STRING, DECIMAL } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn('productos', 'unidad_compra', { type: STRING(30), allowNull: true }, { transaction: t });
      await queryInterface.addColumn('productos', 'factor_compra', {
        type: DECIMAL(14, 6), allowNull: false, defaultValue: 1,
      }, { transaction: t });

      for (const [tabla, columna] of [['compras_detalles', 'costo_unitario'], ['pedidos_detalles', 'costo_estimado']]) {
        await queryInterface.changeColumn(tabla, columna, { type: DECIMAL(14, 4), allowNull: false }, { transaction: t });
        await queryInterface.addColumn(tabla, 'unidad_presentacion', { type: STRING(30), allowNull: true }, { transaction: t });
        await queryInterface.addColumn(tabla, 'factor_presentacion', { type: DECIMAL(14, 6), allowNull: true }, { transaction: t });
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
      for (const [tabla, columna] of [['compras_detalles', 'costo_unitario'], ['pedidos_detalles', 'costo_estimado']]) {
        await queryInterface.removeColumn(tabla, 'factor_presentacion', { transaction: t });
        await queryInterface.removeColumn(tabla, 'unidad_presentacion', { transaction: t });
        await queryInterface.changeColumn(tabla, columna, { type: Sequelize.DECIMAL(14, 2), allowNull: false }, { transaction: t });
      }
      await queryInterface.removeColumn('productos', 'factor_compra', { transaction: t });
      await queryInterface.removeColumn('productos', 'unidad_compra', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
