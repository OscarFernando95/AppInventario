'use strict';

/**
 * Grupos de modificadores (con selección obligatoria) y combos.
 *
 *   - grupos_modificadores : «Punto de cocción», «Leche», «Tamaño»… cada grupo puede ser obligatorio (hay que elegir
 *     al menos uno) y limitar cuántos se eligen; aplica a todos los platos o a los que se enlacen en producto_grupos.
 *   - modificadores.grupoId : a qué grupo pertenece un modificador (vacío = extra suelto, como siempre).
 *   - combo_items          : de qué se compone un combo (productos.tipo = 'COMBO'): sus componentes y cantidades.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DECIMAL, DATE, BOOLEAN } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('grupos_modificadores', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: { type: INTEGER, allowNull: false, references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE' },
        nombre: { type: STRING(60), allowNull: false },
        obligatorio: { type: BOOLEAN, allowNull: false, defaultValue: false },
        max_selecciones: { type: INTEGER, allowNull: true }, // vacío = sin límite
        todos: { type: BOOLEAN, allowNull: false, defaultValue: false }, // aplica a todos los platos
        orden: { type: INTEGER, allowNull: false, defaultValue: 0 },
        activo: { type: BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DATE, allowNull: false },
        updatedAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('grupos_modificadores', ['empresaId', 'nombre'], { unique: true, name: 'grupos_modificadores_nombre_uq', transaction: t });

      await queryInterface.createTable('producto_grupos', {
        productoId: { type: INTEGER, allowNull: false, primaryKey: true, references: { model: 'productos', key: 'id' }, onDelete: 'CASCADE' },
        grupoId: { type: INTEGER, allowNull: false, primaryKey: true, references: { model: 'grupos_modificadores', key: 'id' }, onDelete: 'CASCADE' },
      }, { transaction: t });

      await queryInterface.addColumn('modificadores', 'grupoId', { type: INTEGER, allowNull: true, references: { model: 'grupos_modificadores', key: 'id' }, onDelete: 'SET NULL' }, { transaction: t });

      await queryInterface.createTable('combo_items', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        comboId: { type: INTEGER, allowNull: false, references: { model: 'productos', key: 'id' }, onDelete: 'CASCADE' },
        productoId: { type: INTEGER, allowNull: false, references: { model: 'productos', key: 'id' } },
        cantidad: { type: DECIMAL(12, 3), allowNull: false, defaultValue: 1 },
      }, { transaction: t });
      await queryInterface.addIndex('combo_items', ['comboId', 'productoId'], { unique: true, name: 'combo_items_combo_producto_uq', transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable('combo_items', { transaction: t });
      await queryInterface.removeColumn('modificadores', 'grupoId', { transaction: t });
      await queryInterface.dropTable('producto_grupos', { transaction: t });
      await queryInterface.dropTable('grupos_modificadores', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
