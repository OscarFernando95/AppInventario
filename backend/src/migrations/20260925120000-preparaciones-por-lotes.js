'use strict';

/**
 * Preparaciones por lotes.
 *
 *   - productos.por_lotes : una PREPARACION marcada así tiene stock propio. Se produce por lotes
 *     ("hoy preparé 2 litros": descuenta sus ingredientes y suma stock) y al vender un plato que la
 *     usa se descuenta ELLA, no sus ingredientes. Sin marcar, sigue descontando al vender (on-demand).
 *   - producciones : cada lote producido, con la foto de lo consumido para poder deshacerlo exacto.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DECIMAL, DATE, TEXT, JSONB, BOOLEAN } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn('productos', 'por_lotes', { type: BOOLEAN, allowNull: false, defaultValue: false }, { transaction: t });

      await queryInterface.createTable('producciones', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: { type: INTEGER, allowNull: false, references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE' },
        productoId: { type: INTEGER, allowNull: false, references: { model: 'productos', key: 'id' } },
        usuarioId: { type: INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
        cantidad: { type: DECIMAL(12, 3), allowNull: false }, // unidades producidas (en la unidad de la preparación)
        costo_unitario: { type: DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        costo_total: { type: DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
        consumo: { type: JSONB, allowNull: false, defaultValue: [] }, // [{ productoId, cantidad }] de ingredientes descontados
        estado: { type: STRING(10), allowNull: false, defaultValue: 'ACTIVA' }, // ACTIVA | ANULADA
        motivo: { type: TEXT, allowNull: true },
        fecha: { type: DATE, allowNull: false },
        anulada_en: { type: DATE, allowNull: true },
        anulada_por: { type: INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
      }, { transaction: t });
      await queryInterface.addIndex('producciones', ['empresaId', 'fecha'], { name: 'producciones_empresa_fecha_idx', transaction: t });
      await queryInterface.addIndex('producciones', ['productoId'], { name: 'producciones_producto_idx', transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable('producciones', { transaction: t });
      await queryInterface.removeColumn('productos', 'por_lotes', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
