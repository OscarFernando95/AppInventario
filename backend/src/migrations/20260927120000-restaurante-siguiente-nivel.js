'use strict';

/**
 * Restaurante, siguiente nivel.
 *
 *   - reservas            : reservas de mesa (quién, cuántos, cuándo); al llegar se "sientan" y abren cuenta.
 *   - propina_repartos    : cómo se repartió entre el personal una entrega de propinas de la caja.
 *   - empresas.propina_sugerida_pct   : propina sugerida al cobrar una cuenta (0 = no sugerir).
 *   - empresas.desviacion_alerta_pct  : un faltante al contar por encima de este % del consumo es una alerta.
 *   - productos.vida_util_dias        : días que dura un lote de una preparación por lotes.
 *   - producciones.vence_en           : fecha en que vence ese lote.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DECIMAL, DATE, DATEONLY, TEXT } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('reservas', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: { type: INTEGER, allowNull: false, references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE' },
        mesaId: { type: INTEGER, allowNull: true, references: { model: 'mesas', key: 'id' } },
        usuarioId: { type: INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
        nombre: { type: STRING(120), allowNull: false },
        telefono: { type: STRING(40), allowNull: true },
        personas: { type: INTEGER, allowNull: false },
        fecha_hora: { type: DATE, allowNull: false },
        nota: { type: TEXT, allowNull: true },
        estado: { type: STRING(10), allowNull: false, defaultValue: 'PENDIENTE' }, // PENDIENTE | SENTADA | CANCELADA | NO_LLEGO
        cuentaId: { type: INTEGER, allowNull: true, references: { model: 'cuentas', key: 'id' }, onDelete: 'SET NULL' },
        createdAt: { type: DATE, allowNull: false },
        updatedAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('reservas', ['empresaId', 'fecha_hora'], { name: 'reservas_empresa_fecha_idx', transaction: t });
      await queryInterface.addIndex('reservas', ['mesaId', 'estado'], { name: 'reservas_mesa_estado_idx', transaction: t });

      await queryInterface.createTable('propina_repartos', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: { type: INTEGER, allowNull: false, references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE' },
        movimientoId: { type: INTEGER, allowNull: false, references: { model: 'caja_movimientos', key: 'id' }, onDelete: 'CASCADE' },
        usuarioId: { type: INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
        monto: { type: DECIMAL(14, 2), allowNull: false },
        fecha: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('propina_repartos', ['empresaId', 'fecha'], { name: 'propina_repartos_empresa_fecha_idx', transaction: t });

      await queryInterface.addColumn('empresas', 'propina_sugerida_pct', { type: DECIMAL(5, 2), allowNull: false, defaultValue: 10 }, { transaction: t });
      await queryInterface.addColumn('empresas', 'desviacion_alerta_pct', { type: DECIMAL(5, 2), allowNull: false, defaultValue: 5 }, { transaction: t });
      await queryInterface.addColumn('productos', 'vida_util_dias', { type: INTEGER, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('producciones', 'vence_en', { type: DATEONLY, allowNull: true }, { transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeColumn('producciones', 'vence_en', { transaction: t });
      await queryInterface.removeColumn('productos', 'vida_util_dias', { transaction: t });
      await queryInterface.removeColumn('empresas', 'desviacion_alerta_pct', { transaction: t });
      await queryInterface.removeColumn('empresas', 'propina_sugerida_pct', { transaction: t });
      await queryInterface.dropTable('propina_repartos', { transaction: t });
      await queryInterface.dropTable('reservas', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
