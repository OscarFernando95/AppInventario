'use strict';

/**
 * Tiempos de servicio y alertas de demora en cocina.
 *
 *   - cuentas.tiempo_actual : hasta qué tiempo (1 = entrada, 2 = plato fuerte…) ya se disparó en la cuenta.
 *   - cuenta_items.tiempo : a qué tiempo pertenece cada ítem pedido (1..4).
 *   - comandas.tiempo : qué tiempo cubre una comanda (vacío = se envió todo de una vez, como siempre).
 *   - productos.tiempo_objetivo_min : minutos en que debería salir el plato (alerta de demora por ítem).
 *
 * Todo con valores que reproducen el comportamiento de siempre mientras las opciones estén apagadas.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn('cuentas', 'tiempo_actual', { type: INTEGER, allowNull: false, defaultValue: 1 }, { transaction: t });
      await queryInterface.addColumn('cuenta_items', 'tiempo', { type: INTEGER, allowNull: false, defaultValue: 1 }, { transaction: t });
      await queryInterface.addColumn('comandas', 'tiempo', { type: INTEGER, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('productos', 'tiempo_objetivo_min', { type: INTEGER, allowNull: true }, { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      for (const [tabla, col] of [['productos', 'tiempo_objetivo_min'], ['comandas', 'tiempo'], ['cuenta_items', 'tiempo'], ['cuentas', 'tiempo_actual']]) {
        await queryInterface.removeColumn(tabla, col, { transaction: t });
      }
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
