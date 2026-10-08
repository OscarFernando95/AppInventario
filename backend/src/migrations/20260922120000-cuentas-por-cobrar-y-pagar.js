'use strict';

/**
 * Cuentas por cobrar y por pagar.
 *
 *   Por cobrar (ventas a crédito)
 *   - ventas.saldo_pendiente / dias_credito (fecha_vencimiento ya existía): lo que el cliente aún debe.
 *   - abonos_venta : pagos parciales o totales del cliente. Uno en efectivo entra a la caja abierta.
 *   - clientes.cupo_credito : tope de deuda por cliente (vacío = sin tope).
 *
 *   Por pagar (compras a crédito)
 *   - compras.forma_pago (CONTADO | CREDITO), dias_credito, fecha_vencimiento, saldo_pendiente.
 *   - pagos_compra : pagos al proveedor; uno desde la caja es un egreso (tipo PAGO_PROV).
 *
 *   Caja
 *   - cajas.abonos_efectivo : foto de los abonos en efectivo del turno al cerrar.
 *   - caja_movimientos.pagoId : pago a proveedor que originó el egreso.
 *
 * Las ventas a crédito anteriores NO se retroalimentan (saldo 0): la cartera arranca desde ahora.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DECIMAL, DATE, DATEONLY, TEXT } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn('ventas', 'saldo_pendiente', { type: DECIMAL(14, 2), allowNull: false, defaultValue: 0 }, { transaction: t });
      await queryInterface.addColumn('ventas', 'dias_credito', { type: INTEGER, allowNull: true }, { transaction: t });
      await queryInterface.sequelize.query(
        `CREATE INDEX ventas_cartera_idx ON ventas ("empresaId", "fecha_vencimiento") WHERE saldo_pendiente > 0`, { transaction: t }
      );
      await queryInterface.addColumn('clientes', 'cupo_credito', { type: DECIMAL(14, 2), allowNull: true }, { transaction: t });

      await queryInterface.createTable('abonos_venta', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: { type: INTEGER, allowNull: false, references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE' },
        ventaId: { type: INTEGER, allowNull: false, references: { model: 'ventas', key: 'id' }, onDelete: 'CASCADE' },
        usuarioId: { type: INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
        cajaId: { type: INTEGER, allowNull: true, references: { model: 'cajas', key: 'id' }, onDelete: 'SET NULL' },
        monto: { type: DECIMAL(14, 2), allowNull: false },
        medio_pago: { type: STRING(5), allowNull: false, defaultValue: '10' },
        fecha: { type: DATE, allowNull: false },
        nota: { type: TEXT, allowNull: true },
        estado: { type: STRING(10), allowNull: false, defaultValue: 'ACTIVO' }, // ACTIVO | ANULADO
        anulado_en: { type: DATE, allowNull: true },
        anulado_por: { type: INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
        createdAt: { type: DATE, allowNull: false },
        updatedAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('abonos_venta', ['ventaId'], { name: 'abonos_venta_venta_idx', transaction: t });
      await queryInterface.addIndex('abonos_venta', ['empresaId', 'fecha'], { name: 'abonos_venta_empresa_fecha_idx', transaction: t });
      await queryInterface.addIndex('abonos_venta', ['cajaId'], { name: 'abonos_venta_caja_idx', transaction: t });

      await queryInterface.addColumn('compras', 'forma_pago', { type: STRING(10), allowNull: false, defaultValue: 'CONTADO' }, { transaction: t });
      await queryInterface.addColumn('compras', 'dias_credito', { type: INTEGER, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('compras', 'fecha_vencimiento', { type: DATEONLY, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('compras', 'saldo_pendiente', { type: DECIMAL(14, 2), allowNull: false, defaultValue: 0 }, { transaction: t });
      await queryInterface.sequelize.query(
        `CREATE INDEX compras_cartera_idx ON compras ("empresaId", "fecha_vencimiento") WHERE saldo_pendiente > 0`, { transaction: t }
      );

      await queryInterface.createTable('pagos_compra', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: { type: INTEGER, allowNull: false, references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE' },
        compraId: { type: INTEGER, allowNull: false, references: { model: 'compras', key: 'id' }, onDelete: 'CASCADE' },
        usuarioId: { type: INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
        monto: { type: DECIMAL(14, 2), allowNull: false },
        origen: { type: STRING(10), allowNull: false, defaultValue: 'OTRO' }, // CAJA (efectivo de la caja) | OTRO (banco, transferencia…)
        fecha: { type: DATE, allowNull: false },
        nota: { type: TEXT, allowNull: true },
        estado: { type: STRING(10), allowNull: false, defaultValue: 'ACTIVO' },
        anulado_en: { type: DATE, allowNull: true },
        anulado_por: { type: INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
        createdAt: { type: DATE, allowNull: false },
        updatedAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('pagos_compra', ['compraId'], { name: 'pagos_compra_compra_idx', transaction: t });
      await queryInterface.addIndex('pagos_compra', ['empresaId', 'fecha'], { name: 'pagos_compra_empresa_fecha_idx', transaction: t });

      await queryInterface.addColumn('cajas', 'abonos_efectivo', { type: DECIMAL(14, 2), allowNull: true }, { transaction: t });
      await queryInterface.addColumn('caja_movimientos', 'pagoId', {
        type: INTEGER, allowNull: true, references: { model: 'pagos_compra', key: 'id' }, onDelete: 'SET NULL',
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
      await queryInterface.removeColumn('caja_movimientos', 'pagoId', { transaction: t });
      await queryInterface.removeColumn('cajas', 'abonos_efectivo', { transaction: t });
      await queryInterface.dropTable('pagos_compra', { transaction: t });
      await queryInterface.sequelize.query('DROP INDEX IF EXISTS compras_cartera_idx', { transaction: t });
      for (const col of ['saldo_pendiente', 'fecha_vencimiento', 'dias_credito', 'forma_pago']) {
        await queryInterface.removeColumn('compras', col, { transaction: t });
      }
      await queryInterface.dropTable('abonos_venta', { transaction: t });
      await queryInterface.removeColumn('clientes', 'cupo_credito', { transaction: t });
      await queryInterface.sequelize.query('DROP INDEX IF EXISTS ventas_cartera_idx', { transaction: t });
      await queryInterface.removeColumn('ventas', 'dias_credito', { transaction: t });
      await queryInterface.removeColumn('ventas', 'saldo_pendiente', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
