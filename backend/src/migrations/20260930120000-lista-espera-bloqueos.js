'use strict';

/**
 * Lista de espera y bloqueo de mesas.
 *
 *   - lista_espera  : clientes sin reserva que esperan mesa (ESPERANDO -> SENTADO | CANCELADO | NO_LLEGO).
 *   - mesa_bloqueos : una mesa fuera de servicio entre dos momentos (evento, mantenimiento); se quita poniéndola inactiva.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DATE, TEXT, BOOLEAN } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('lista_espera', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: { type: INTEGER, allowNull: false, references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE' },
        usuarioId: { type: INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
        nombre: { type: STRING(120), allowNull: false },
        telefono: { type: STRING(40), allowNull: true },
        personas: { type: INTEGER, allowNull: false },
        nota: { type: TEXT, allowNull: true },
        estado: { type: STRING(10), allowNull: false, defaultValue: 'ESPERANDO' }, // ESPERANDO | SENTADO | CANCELADO | NO_LLEGO
        cuentaId: { type: INTEGER, allowNull: true, references: { model: 'cuentas', key: 'id' }, onDelete: 'SET NULL' },
        creada_en: { type: DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        atendida_en: { type: DATE, allowNull: true },
        createdAt: { type: DATE, allowNull: false },
        updatedAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('lista_espera', ['empresaId', 'estado'], { name: 'lista_espera_empresa_estado_idx', transaction: t });

      await queryInterface.createTable('mesa_bloqueos', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: { type: INTEGER, allowNull: false, references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE' },
        mesaId: { type: INTEGER, allowNull: false, references: { model: 'mesas', key: 'id' } },
        usuarioId: { type: INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
        desde: { type: DATE, allowNull: false },
        hasta: { type: DATE, allowNull: false },
        motivo: { type: STRING(200), allowNull: true },
        activo: { type: BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DATE, allowNull: false },
        updatedAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('mesa_bloqueos', ['mesaId', 'desde', 'hasta'], { name: 'mesa_bloqueos_mesa_rango_idx', transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable('mesa_bloqueos', { transaction: t });
      await queryInterface.dropTable('lista_espera', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
