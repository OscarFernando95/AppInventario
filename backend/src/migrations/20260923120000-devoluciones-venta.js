'use strict';

/**
 * Devolución parcial de ventas.
 *
 *   - devoluciones_venta / devoluciones_venta_detalle : cada devolución es un documento aparte
 *     (la venta original no se modifica): qué líneas y cuántas unidades, por cuánto, y qué pasó con
 *     el dinero (devuelto al cliente, o descontado de lo que debe si la venta fue a crédito).
 *   - ventas.total_devuelto, ventas_detalles.cantidad_devuelta / cantidad_reingresada : acumulados
 *     denormalizados para netear ventas, informes y rentabilidad sin recorrer las devoluciones.
 *     "Reingresada" = unidades que volvieron al inventario (un plato ya preparado no vuelve).
 *   - caja_movimientos.devolucionId : el egreso DEVOLUCION de la caja que originó una devolución.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DECIMAL, DATE, TEXT } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn('ventas', 'total_devuelto', { type: DECIMAL(14, 2), allowNull: false, defaultValue: 0 }, { transaction: t });
      await queryInterface.addColumn('ventas_detalles', 'cantidad_devuelta', { type: DECIMAL(12, 3), allowNull: false, defaultValue: 0 }, { transaction: t });
      await queryInterface.addColumn('ventas_detalles', 'cantidad_reingresada', { type: DECIMAL(12, 3), allowNull: false, defaultValue: 0 }, { transaction: t });

      await queryInterface.createTable('devoluciones_venta', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: { type: INTEGER, allowNull: false, references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE' },
        ventaId: { type: INTEGER, allowNull: false, references: { model: 'ventas', key: 'id' }, onDelete: 'CASCADE' },
        usuarioId: { type: INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
        fecha: { type: DATE, allowNull: false },
        motivo: { type: TEXT, allowNull: false },
        total: { type: DECIMAL(14, 2), allowNull: false }, // valor de lo devuelto (IVA incluido, con el descuento global prorrateado)
        credito_reducido: { type: DECIMAL(14, 2), allowNull: false, defaultValue: 0 }, // parte que se descontó de la deuda del cliente (venta a crédito)
        dinero_devuelto: { type: DECIMAL(14, 2), allowNull: false, defaultValue: 0 }, // dinero que salió del negocio hacia el cliente
        reembolso: { type: STRING(10), allowNull: true }, // CAJA (efectivo de la caja) | OTRO (tarjeta, transferencia…) | null si no hubo dinero
        createdAt: { type: DATE, allowNull: false },
        updatedAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('devoluciones_venta', ['ventaId'], { name: 'devoluciones_venta_venta_idx', transaction: t });
      await queryInterface.addIndex('devoluciones_venta', ['empresaId', 'fecha'], { name: 'devoluciones_venta_empresa_fecha_idx', transaction: t });

      await queryInterface.createTable('devoluciones_venta_detalle', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        devolucionId: { type: INTEGER, allowNull: false, references: { model: 'devoluciones_venta', key: 'id' }, onDelete: 'CASCADE' },
        ventaDetalleId: { type: INTEGER, allowNull: false, references: { model: 'ventas_detalles', key: 'id' }, onDelete: 'CASCADE' },
        cantidad: { type: DECIMAL(12, 3), allowNull: false },
        valor: { type: DECIMAL(14, 2), allowNull: false },
        reingresada: { type: DECIMAL(12, 3), allowNull: false, defaultValue: 0 }, // unidades que volvieron al inventario
      }, { transaction: t });
      await queryInterface.addIndex('devoluciones_venta_detalle', ['devolucionId'], { name: 'devoluciones_detalle_devolucion_idx', transaction: t });

      await queryInterface.addColumn('caja_movimientos', 'devolucionId', {
        type: INTEGER, allowNull: true, references: { model: 'devoluciones_venta', key: 'id' }, onDelete: 'SET NULL',
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
      await queryInterface.removeColumn('caja_movimientos', 'devolucionId', { transaction: t });
      await queryInterface.dropTable('devoluciones_venta_detalle', { transaction: t });
      await queryInterface.dropTable('devoluciones_venta', { transaction: t });
      await queryInterface.removeColumn('ventas_detalles', 'cantidad_reingresada', { transaction: t });
      await queryInterface.removeColumn('ventas_detalles', 'cantidad_devuelta', { transaction: t });
      await queryInterface.removeColumn('ventas', 'total_devuelto', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
