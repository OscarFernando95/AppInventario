'use strict';

/**
 * Capital base, gastos propios y egresos de caja.
 *
 *   - empresas.capital_inicial : dinero con el que la empresa empieza en el software.
 *                                Sirve de referencia para medir cuánto creció o
 *                                disminuyó el dinero de la empresa.
 *   - gastos                   : gastos operativos (recibos, arriendo, nómina…) sin
 *                                atarse a un proveedor. Las COMPRAS siguen exigiendo proveedor.
 *   - caja_movimientos         : egresos de una caja (retiros, y gastos/compras pagados
 *                                en efectivo desde ella). Los ingresos solo entran por ventas.
 *   - cajas.total_egresos      : foto de los egresos del turno al cerrar.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DECIMAL, DATE } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn('empresas', 'capital_inicial', {
        type: DECIMAL(14, 2), allowNull: false, defaultValue: 0,
      }, { transaction: t });

      await queryInterface.addColumn('cajas', 'total_egresos', { type: DECIMAL(14, 2), allowNull: true }, { transaction: t });

      await queryInterface.createTable('gastos', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: {
          type: INTEGER, allowNull: false,
          references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE',
        },
        usuarioId: {
          type: INTEGER, allowNull: false,
          references: { model: 'usuarios', key: 'id' },
        },
        proveedorId: {
          type: INTEGER, allowNull: true, // opcional: un recibo no siempre tiene proveedor
          references: { model: 'proveedores', key: 'id' }, onDelete: 'SET NULL',
        },
        categoria: { type: STRING(20), allowNull: false },
        descripcion: { type: STRING(255), allowNull: false },
        monto: { type: DECIMAL(14, 2), allowNull: false },
        fecha: { type: DATE, allowNull: false },
        origen_pago: { type: STRING(10), allowNull: false, defaultValue: 'OTRO' }, // CAJA | OTRO
        estado: { type: STRING(10), allowNull: false, defaultValue: 'ACTIVO' }, // ACTIVO | ANULADO
        anulado_en: { type: DATE, allowNull: true },
        anulado_por: {
          type: INTEGER, allowNull: true,
          references: { model: 'usuarios', key: 'id' },
        },
        createdAt: { type: DATE, allowNull: false },
        updatedAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('gastos', ['empresaId', 'fecha'], { name: 'gastos_empresa_fecha_idx', transaction: t });

      await queryInterface.createTable('caja_movimientos', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: {
          type: INTEGER, allowNull: false,
          references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE',
        },
        cajaId: {
          type: INTEGER, allowNull: false,
          references: { model: 'cajas', key: 'id' }, onDelete: 'CASCADE',
        },
        usuarioId: {
          type: INTEGER, allowNull: false,
          references: { model: 'usuarios', key: 'id' },
        },
        tipo: { type: STRING(10), allowNull: false }, // RETIRO | GASTO | COMPRA (todos son egresos)
        concepto: { type: STRING(255), allowNull: false },
        monto: { type: DECIMAL(14, 2), allowNull: false },
        fecha: { type: DATE, allowNull: false },
        gastoId: {
          type: INTEGER, allowNull: true,
          references: { model: 'gastos', key: 'id' }, onDelete: 'CASCADE',
        },
        compraId: {
          type: INTEGER, allowNull: true,
          references: { model: 'compras', key: 'id' }, onDelete: 'SET NULL',
        },
      }, { transaction: t });
      await queryInterface.addIndex('caja_movimientos', ['cajaId'], { name: 'caja_mov_caja_idx', transaction: t });
      await queryInterface.addIndex('caja_movimientos', ['empresaId', 'fecha'], { name: 'caja_mov_empresa_fecha_idx', transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable('caja_movimientos', { transaction: t });
      await queryInterface.dropTable('gastos', { transaction: t });
      await queryInterface.removeColumn('cajas', 'total_egresos', { transaction: t });
      await queryInterface.removeColumn('empresas', 'capital_inicial', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
