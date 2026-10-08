'use strict';

/**
 * Restaurantes — fases B y C.
 *
 *   Fase B (costos y control de inventario)
 *   - productos.costo_promedio    : costo por unidad base, promedio ponderado de las compras.
 *   - ventas_detalles.costo_unitario : costo de lo vendido (foto al momento de la venta,
 *                                   base del reporte de rentabilidad).
 *   - ajustes_inventario          : mermas, vencidos, consumo interno y conteos físicos.
 *
 *   Fase C (sub-recetas y modificadores)
 *   - productos.tipo admite 'PREPARACION' (sub-receta) -> columna pasa a STRING(15).
 *   - productos.rendimiento       : lo que produce una preparación (p. ej. 1000 ml).
 *   - modificadores / modificadores_items : extras y "sin ..." que ajustan el
 *                                   precio y el consumo de ingredientes de un plato.
 *   - ventas_detalles.modificadores : los modificadores elegidos (foto: nombre y precio).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DECIMAL, DATE, TEXT, JSONB, BOOLEAN } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.changeColumn('productos', 'tipo', {
        type: STRING(15), allowNull: false, defaultValue: 'VENTA',
      }, { transaction: t });
      await queryInterface.addColumn('productos', 'costo_promedio', {
        type: DECIMAL(14, 4), allowNull: false, defaultValue: 0,
      }, { transaction: t });
      await queryInterface.addColumn('productos', 'rendimiento', {
        type: DECIMAL(12, 3), allowNull: false, defaultValue: 1,
      }, { transaction: t });

      await queryInterface.addColumn('ventas_detalles', 'costo_unitario', {
        type: DECIMAL(14, 4), allowNull: false, defaultValue: 0,
      }, { transaction: t });
      await queryInterface.addColumn('ventas_detalles', 'modificadores', {
        type: JSONB, allowNull: true,
      }, { transaction: t });

      await queryInterface.createTable('ajustes_inventario', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: {
          type: INTEGER, allowNull: false,
          references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE',
        },
        productoId: {
          type: INTEGER, allowNull: false,
          references: { model: 'productos', key: 'id' }, onDelete: 'CASCADE',
        },
        usuarioId: {
          type: INTEGER, allowNull: false,
          references: { model: 'usuarios', key: 'id' },
        },
        tipo: { type: STRING(20), allowNull: false }, // MERMA | VENCIDO | CONSUMO_INTERNO | CONTEO
        cantidad_anterior: { type: DECIMAL(12, 3), allowNull: false },
        cantidad_nueva: { type: DECIMAL(12, 3), allowNull: false },
        diferencia: { type: DECIMAL(12, 3), allowNull: false }, // nueva - anterior (negativa = pérdida)
        costo_unitario: { type: DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        valor: { type: DECIMAL(14, 2), allowNull: false, defaultValue: 0 }, // diferencia × costo
        motivo: { type: TEXT, allowNull: true },
        fecha: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('ajustes_inventario', ['empresaId', 'fecha'], {
        name: 'ajustes_empresa_fecha_idx', transaction: t,
      });
      await queryInterface.addIndex('ajustes_inventario', ['productoId'], {
        name: 'ajustes_producto_idx', transaction: t,
      });

      await queryInterface.createTable('modificadores', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: {
          type: INTEGER, allowNull: false,
          references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE',
        },
        nombre: { type: STRING(100), allowNull: false },
        precio_extra: { type: DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
        activo: { type: BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DATE, allowNull: false },
        updatedAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('modificadores', ['empresaId', 'nombre'], {
        unique: true, name: 'modificadores_empresa_nombre_uq', transaction: t,
      });

      await queryInterface.createTable('modificadores_items', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        modificadorId: {
          type: INTEGER, allowNull: false,
          references: { model: 'modificadores', key: 'id' }, onDelete: 'CASCADE',
        },
        insumoId: {
          type: INTEGER, allowNull: false,
          references: { model: 'productos', key: 'id' }, onDelete: 'RESTRICT',
        },
        // Con signo: positiva agrega ingrediente ("extra shot"), negativa lo quita ("sin azúcar").
        cantidad: { type: DECIMAL(12, 3), allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('modificadores_items', ['modificadorId', 'insumoId'], {
        unique: true, name: 'modificadores_items_uq', transaction: t,
      });
      await queryInterface.addIndex('modificadores_items', ['insumoId'], {
        name: 'modificadores_items_insumo_idx', transaction: t,
      });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable('modificadores_items', { transaction: t });
      await queryInterface.dropTable('modificadores', { transaction: t });
      await queryInterface.dropTable('ajustes_inventario', { transaction: t });
      await queryInterface.removeColumn('ventas_detalles', 'modificadores', { transaction: t });
      await queryInterface.removeColumn('ventas_detalles', 'costo_unitario', { transaction: t });
      await queryInterface.removeColumn('productos', 'rendimiento', { transaction: t });
      await queryInterface.removeColumn('productos', 'costo_promedio', { transaction: t });
      // Las filas PREPARACION no caben en STRING(10): se pasan a INSUMO antes de acortar.
      await queryInterface.sequelize.query(
        `UPDATE productos SET tipo = 'INSUMO' WHERE tipo = 'PREPARACION'`, { transaction: t }
      );
      await queryInterface.changeColumn('productos', 'tipo', {
        type: Sequelize.STRING(10), allowNull: false, defaultValue: 'VENTA',
      }, { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
