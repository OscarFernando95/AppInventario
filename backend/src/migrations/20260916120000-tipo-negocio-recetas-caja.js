'use strict';

/**
 * Soporte para restaurantes / cafeterías y flujo de caja.
 *
 *   - empresas.tipo_negocio : COMERCIO (por defecto) | RESTAURANTE | SERVICIOS.
 *                             Solo sugiere módulos en el alta; no cambia reglas.
 *   - productos.tipo        : VENTA (por defecto, stock propio) | INSUMO (se
 *                             compra, no se vende) | RECETA (plato: al venderlo
 *                             descuenta sus ingredientes, su stock propio no cuenta).
 *   - recetas_items         : ingredientes de un plato (cantidad por 1 porción,
 *                             en la unidad de medida del insumo).
 *   - cajas                 : turno de caja por usuario (apertura/cierre).
 *   - ventas.cajaId         : caja en la que se registró la venta (nullable).
 *
 * Los módulos nuevos (Recetas, Caja) los siembra el seeder 20260916120100.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DECIMAL, DATE, TEXT, JSONB } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn('empresas', 'tipo_negocio', {
        type: STRING(20), allowNull: false, defaultValue: 'COMERCIO',
      }, { transaction: t });

      await queryInterface.addColumn('productos', 'tipo', {
        type: STRING(10), allowNull: false, defaultValue: 'VENTA',
      }, { transaction: t });

      await queryInterface.createTable('recetas_items', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        productoId: {
          type: INTEGER, allowNull: false,
          references: { model: 'productos', key: 'id' }, onDelete: 'CASCADE',
        },
        insumoId: {
          type: INTEGER, allowNull: false,
          references: { model: 'productos', key: 'id' }, onDelete: 'RESTRICT',
        },
        cantidad: { type: DECIMAL(12, 3), allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('recetas_items', ['productoId', 'insumoId'], {
        unique: true, name: 'recetas_items_producto_insumo_uq', transaction: t,
      });
      await queryInterface.addIndex('recetas_items', ['insumoId'], {
        name: 'recetas_items_insumo_idx', transaction: t,
      });

      await queryInterface.createTable('cajas', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: {
          type: INTEGER, allowNull: false,
          references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE',
        },
        usuarioId: {
          type: INTEGER, allowNull: false,
          references: { model: 'usuarios', key: 'id' },
        },
        estado: { type: STRING(10), allowNull: false, defaultValue: 'ABIERTA' }, // ABIERTA | CERRADA
        fecha_apertura: { type: DATE, allowNull: false },
        monto_inicial: { type: DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
        observaciones_apertura: { type: TEXT, allowNull: true },
        // --- Se rellenan al cerrar (foto del turno; no se recalcula después) ---
        fecha_cierre: { type: DATE, allowNull: true },
        usuarioCierreId: {
          type: INTEGER, allowNull: true,
          references: { model: 'usuarios', key: 'id' },
        },
        num_ventas: { type: INTEGER, allowNull: true },
        total_ventas: { type: DECIMAL(14, 2), allowNull: true },
        ventas_efectivo: { type: DECIMAL(14, 2), allowNull: true },
        efectivo_esperado: { type: DECIMAL(14, 2), allowNull: true },
        monto_contado: { type: DECIMAL(14, 2), allowNull: true },
        diferencia: { type: DECIMAL(14, 2), allowNull: true },
        resumen_medios: { type: JSONB, allowNull: true },
        observaciones_cierre: { type: TEXT, allowNull: true },
        createdAt: { type: DATE, allowNull: false },
        updatedAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('cajas', ['empresaId', 'fecha_apertura'], {
        name: 'cajas_empresa_fecha_idx', transaction: t,
      });
      // Un usuario solo puede tener UNA caja abierta por empresa (también ante
      // dos "abrir caja" simultáneos).
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX cajas_abierta_usuario_uq ON cajas ("empresaId", "usuarioId") WHERE estado = 'ABIERTA'`,
        { transaction: t }
      );

      await queryInterface.addColumn('ventas', 'cajaId', {
        type: INTEGER, allowNull: true,
        references: { model: 'cajas', key: 'id' }, onDelete: 'SET NULL',
      }, { transaction: t });
      await queryInterface.addIndex('ventas', ['cajaId'], { name: 'ventas_caja_idx', transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeIndex('ventas', 'ventas_caja_idx', { transaction: t });
      await queryInterface.removeColumn('ventas', 'cajaId', { transaction: t });
      await queryInterface.dropTable('cajas', { transaction: t });
      await queryInterface.dropTable('recetas_items', { transaction: t });
      await queryInterface.removeColumn('productos', 'tipo', { transaction: t });
      await queryInterface.removeColumn('empresas', 'tipo_negocio', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
