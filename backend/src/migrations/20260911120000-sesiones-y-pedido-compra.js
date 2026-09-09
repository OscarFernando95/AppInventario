'use strict';

/**
 * Fase 6:
 *   - `sesiones`        : una fila por inicio de sesión (jti del JWT). Permite
 *                         revocar una sesión concreta o todas las de un usuario
 *                         ("cerrar sesión en todos los dispositivos") sin esperar
 *                         a que expire el token.
 *   - `compras.pedidoId`: enlaza la compra generada por la recepción de un
 *                         pedido con ese pedido (trazabilidad — N10).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DATE } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('sesiones', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        jti: { type: STRING(64), allowNull: false, unique: true },
        usuarioId: {
          type: INTEGER,
          allowNull: false,
          references: { model: 'usuarios', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        user_agent: { type: STRING, allowNull: true },
        ip: { type: STRING(64), allowNull: true },
        creada_en: { type: DATE, allowNull: false },
        ultimo_uso_en: { type: DATE, allowNull: true },
        expira_en: { type: DATE, allowNull: false },
        revocada_en: { type: DATE, allowNull: true },
      }, { transaction: t });
      await queryInterface.addIndex('sesiones', ['usuarioId'], {
        name: 'sesiones_usuarioId_idx', transaction: t,
      });

      await queryInterface.addColumn('compras', 'pedidoId', {
        type: INTEGER,
        allowNull: true,
        references: { model: 'pedidos', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      }, { transaction: t });
      await queryInterface.addIndex('compras', ['pedidoId'], {
        name: 'compras_pedidoId_idx', transaction: t,
      });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeColumn('compras', 'pedidoId', { transaction: t });
      await queryInterface.dropTable('sesiones', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
