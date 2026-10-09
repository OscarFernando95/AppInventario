'use strict';

/**
 * Restaurante, tercera ronda.
 *
 *   - empresas.estaciones : estaciones de preparación (Cocina, Barra, Postres…); cada una ve sus propias comandas.
 *   - productos.estacion / comandas.estacion : a qué estación va un plato y a cuál se envió una comanda.
 *   - cuenta_items.comensal : de qué persona de la mesa es un ítem (para cobrar a cada quien lo suyo).
 *   - usuarios_empresas.propina_peso : cuánto pesa cada persona al repartir propinas (0 = no recibe).
 *   - empresas.alerta_whatsapp / alerta_correo : a quién se avisa cuando salta una alerta de desviación.
 *   - mesas.pos_x / pos_y : posición de la mesa en el plano del local (% del ancho y del alto).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DECIMAL, JSONB } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn('empresas', 'estaciones', { type: JSONB, allowNull: false, defaultValue: ['Cocina'] }, { transaction: t });
      await queryInterface.addColumn('empresas', 'alerta_whatsapp', { type: STRING(30), allowNull: true }, { transaction: t });
      await queryInterface.addColumn('empresas', 'alerta_correo', { type: STRING(120), allowNull: true }, { transaction: t });
      await queryInterface.addColumn('productos', 'estacion', { type: STRING(30), allowNull: true }, { transaction: t });
      await queryInterface.addColumn('comandas', 'estacion', { type: STRING(30), allowNull: true }, { transaction: t });
      await queryInterface.addColumn('cuenta_items', 'comensal', { type: INTEGER, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('usuarios_empresas', 'propina_peso', { type: DECIMAL(5, 2), allowNull: false, defaultValue: 1 }, { transaction: t });
      await queryInterface.addColumn('mesas', 'pos_x', { type: INTEGER, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('mesas', 'pos_y', { type: INTEGER, allowNull: true }, { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      for (const [tabla, col] of [['mesas', 'pos_y'], ['mesas', 'pos_x'], ['usuarios_empresas', 'propina_peso'], ['cuenta_items', 'comensal'],
        ['comandas', 'estacion'], ['productos', 'estacion'], ['empresas', 'alerta_correo'], ['empresas', 'alerta_whatsapp'], ['empresas', 'estaciones']]) {
        await queryInterface.removeColumn(tabla, col, { transaction: t });
      }
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
