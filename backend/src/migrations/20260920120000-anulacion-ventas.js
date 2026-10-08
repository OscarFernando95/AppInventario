'use strict';

/**
 * Anulación de ventas.
 *
 *   - ventas.estado (ACTIVA | ANULADA) + quién, cuándo y por qué se anuló. Una venta
 *     anulada no se borra: queda en el historial y deja de contar en totales,
 *     informes, rentabilidad, caja y balance.
 *   - ventas_detalles.consumo : foto del inventario que descontó la línea al venderse
 *     ([{ productoId, cantidad }]: el producto, o los ingredientes base de un plato con
 *     sub-recetas y extras). Permite devolver EXACTAMENTE lo descontado aunque la receta
 *     haya cambiado después.
 *   - anulaciones_venta : solicitudes de anulación de quien no es administrador; el
 *     administrador las aprueba o rechaza. Una sola pendiente por venta.
 *   - caja_movimientos.ventaId : devolución de dinero (tipo DEVOLUCION) cuando se anula en
 *     efectivo una venta de una caja que ya se cerró.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DATE, TEXT, JSONB } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn('ventas', 'estado', { type: STRING(10), allowNull: false, defaultValue: 'ACTIVA' }, { transaction: t });
      await queryInterface.addColumn('ventas', 'anulada_en', { type: DATE, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('ventas', 'anulada_por', {
        type: INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' },
      }, { transaction: t });
      await queryInterface.addColumn('ventas', 'motivo_anulacion', { type: TEXT, allowNull: true }, { transaction: t });
      await queryInterface.addIndex('ventas', ['empresaId', 'estado', 'fecha'], { name: 'ventas_empresa_estado_fecha_idx', transaction: t });

      await queryInterface.addColumn('ventas_detalles', 'consumo', { type: JSONB, allowNull: true }, { transaction: t });

      await queryInterface.createTable('anulaciones_venta', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: {
          type: INTEGER, allowNull: false,
          references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE',
        },
        ventaId: {
          type: INTEGER, allowNull: false,
          references: { model: 'ventas', key: 'id' }, onDelete: 'CASCADE',
        },
        solicitada_por: {
          type: INTEGER, allowNull: false,
          references: { model: 'usuarios', key: 'id' },
        },
        motivo: { type: TEXT, allowNull: false },
        estado: { type: STRING(10), allowNull: false, defaultValue: 'PENDIENTE' }, // PENDIENTE | APROBADA | RECHAZADA
        resuelta_por: {
          type: INTEGER, allowNull: true,
          references: { model: 'usuarios', key: 'id' },
        },
        resuelta_en: { type: DATE, allowNull: true },
        comentario: { type: TEXT, allowNull: true },
        createdAt: { type: DATE, allowNull: false },
        updatedAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('anulaciones_venta', ['empresaId', 'estado'], { name: 'anulaciones_empresa_estado_idx', transaction: t });
      // Una sola solicitud PENDIENTE por venta (también ante dos clics simultáneos).
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX anulaciones_pendiente_venta_uq ON anulaciones_venta ("ventaId") WHERE estado = 'PENDIENTE'`,
        { transaction: t }
      );

      await queryInterface.addColumn('caja_movimientos', 'ventaId', {
        type: INTEGER, allowNull: true, references: { model: 'ventas', key: 'id' }, onDelete: 'SET NULL',
      }, { transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeColumn('caja_movimientos', 'ventaId', { transaction: t });
      await queryInterface.dropTable('anulaciones_venta', { transaction: t });
      await queryInterface.removeColumn('ventas_detalles', 'consumo', { transaction: t });
      await queryInterface.removeIndex('ventas', 'ventas_empresa_estado_fecha_idx', { transaction: t });
      await queryInterface.removeColumn('ventas', 'motivo_anulacion', { transaction: t });
      await queryInterface.removeColumn('ventas', 'anulada_por', { transaction: t });
      await queryInterface.removeColumn('ventas', 'anulada_en', { transaction: t });
      await queryInterface.removeColumn('ventas', 'estado', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
