'use strict';

/**
 * Cuenta a nombre de un cliente o de una habitación / referencia (ej. «Habitación 204», «Mesa de la familia Pérez»).
 * Con un cliente, al cobrar ya viene seleccionado y se puede cargar a crédito (cuentas por cobrar).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING } = Sequelize;
    await queryInterface.addColumn('cuentas', 'clienteId', { type: INTEGER, allowNull: true, references: { model: 'clientes', key: 'id' }, onDelete: 'SET NULL' });
    await queryInterface.addColumn('cuentas', 'referencia', { type: STRING(80), allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('cuentas', 'referencia');
    await queryInterface.removeColumn('cuentas', 'clienteId');
  },
};
