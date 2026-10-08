'use strict';

/**
 * Stock mínimo por producto (y "reponer hasta" opcional), para TODOS los tipos:
 *   - VENTA / INSUMO: se compara con el stock.
 *   - RECETA (plato): con las porciones que se pueden preparar.
 *   - PREPARACION: con las unidades que se pueden producir con los ingredientes.
 * 0 = sin alerta. Antes la alerta era un umbral fijo (< 10) igual para todos; para no cambiar
 * lo que ya veían las empresas, los productos de venta existentes arrancan con mínimo 10.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn('productos', 'stock_minimo', {
        type: Sequelize.DECIMAL(12, 3), allowNull: false, defaultValue: 0,
      }, { transaction: t });
      await queryInterface.addColumn('productos', 'stock_objetivo', {
        type: Sequelize.DECIMAL(12, 3), allowNull: true,
      }, { transaction: t });
      await queryInterface.sequelize.query(
        `UPDATE productos SET stock_minimo = 10 WHERE tipo = 'VENTA'`, { transaction: t }
      );
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeColumn('productos', 'stock_objetivo', { transaction: t });
      await queryInterface.removeColumn('productos', 'stock_minimo', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
