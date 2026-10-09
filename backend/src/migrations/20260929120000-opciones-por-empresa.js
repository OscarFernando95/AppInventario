'use strict';

/**
 * Opciones por empresa: interruptores para prender o apagar cada función de restaurante/cafetería sin afectar a
 * las demás ni al comercio. Se guardan solo las que el administrador cambió (las demás valen su valor por omisión,
 * que reproduce el comportamiento de siempre).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('empresas', 'opciones', { type: Sequelize.JSONB, allowNull: false, defaultValue: {} });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('empresas', 'opciones');
  },
};
