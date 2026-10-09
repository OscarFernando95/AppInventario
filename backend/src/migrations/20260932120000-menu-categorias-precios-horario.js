'use strict';

/**
 * Menú: categorías con orden propio, foto del plato, «agotado hoy» a mano y precios por horario (happy hour).
 *
 *   - categorias_menu          : agrupan platos y productos en el catálogo del mesero y del mostrador.
 *   - productos.categoriaId / orden_menu / imagen / agotado_dia : categoría, orden dentro de ella, foto (data URL
 *     pequeña) y último día en que se marcó agotado (vale solo ese día).
 *   - precios_horario          : descuentos o precio fijo por día de la semana y franja horaria, para productos
 *     o categorías concretos (o todos).
 *   - cuenta_items.precio_promo / promo : foto del precio de horario con que se pidió un ítem de una cuenta.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DECIMAL, DATE, DATEONLY, TEXT, JSONB, BOOLEAN } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('categorias_menu', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: { type: INTEGER, allowNull: false, references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE' },
        nombre: { type: STRING(60), allowNull: false },
        orden: { type: INTEGER, allowNull: false, defaultValue: 0 },
        activa: { type: BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DATE, allowNull: false },
        updatedAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('categorias_menu', ['empresaId', 'nombre'], { unique: true, name: 'categorias_menu_empresa_nombre_uq', transaction: t });

      await queryInterface.addColumn('productos', 'categoriaId', { type: INTEGER, allowNull: true, references: { model: 'categorias_menu', key: 'id' }, onDelete: 'SET NULL' }, { transaction: t });
      await queryInterface.addColumn('productos', 'orden_menu', { type: INTEGER, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('productos', 'imagen', { type: TEXT, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('productos', 'agotado_dia', { type: DATEONLY, allowNull: true }, { transaction: t });

      await queryInterface.createTable('precios_horario', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: { type: INTEGER, allowNull: false, references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE' },
        nombre: { type: STRING(80), allowNull: false },
        tipo: { type: STRING(12), allowNull: false, defaultValue: 'PORCENTAJE' }, // PORCENTAJE | PRECIO_FIJO
        valor: { type: DECIMAL(14, 2), allowNull: false },
        dias: { type: JSONB, allowNull: false, defaultValue: [0, 1, 2, 3, 4, 5, 6] }, // 0 = domingo … 6 = sábado
        hora_inicio: { type: STRING(5), allowNull: false, defaultValue: '00:00' },
        hora_fin: { type: STRING(5), allowNull: false, defaultValue: '23:59' },
        producto_ids: { type: JSONB, allowNull: false, defaultValue: [] },
        categoria_ids: { type: JSONB, allowNull: false, defaultValue: [] }, // ambas vacías = todos los productos
        activo: { type: BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DATE, allowNull: false },
        updatedAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('precios_horario', ['empresaId', 'activo'], { name: 'precios_horario_empresa_idx', transaction: t });

      await queryInterface.addColumn('cuenta_items', 'precio_promo', { type: DECIMAL(14, 2), allowNull: true }, { transaction: t });
      await queryInterface.addColumn('cuenta_items', 'promo', { type: STRING(80), allowNull: true }, { transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeColumn('cuenta_items', 'promo', { transaction: t });
      await queryInterface.removeColumn('cuenta_items', 'precio_promo', { transaction: t });
      await queryInterface.dropTable('precios_horario', { transaction: t });
      for (const c of ['agotado_dia', 'imagen', 'orden_menu', 'categoriaId']) await queryInterface.removeColumn('productos', c, { transaction: t });
      await queryInterface.dropTable('categorias_menu', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
