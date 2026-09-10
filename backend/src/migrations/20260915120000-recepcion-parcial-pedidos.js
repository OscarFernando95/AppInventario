'use strict';

/**
 * Recepción parcial de pedidos.
 *
 * Antes, confirmar la llegada de un pedido lo cerraba de una vez (siempre
 * `COMPLETADO`), sin poder recibir en varias tandas ni saber cuánto de cada
 * línea ya había llegado. Ahora:
 *   - `pedidos.estado` admite además `PARCIAL`.
 *   - `pedidos_detalles.cantidad_recibida` acumula lo recibido por línea entre
 *     recepciones sucesivas.
 *
 * `ALTER TYPE ... ADD VALUE` no puede correr dentro de una transacción que
 * luego use ese valor; aquí solo se agrega el valor (no se usa), así que es
 * seguro fuera de transacción.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_pedidos_estado" ADD VALUE IF NOT EXISTS 'PARCIAL'`
    );
    await queryInterface.addColumn('pedidos_detalles', 'cantidad_recibida', {
      type: Sequelize.DECIMAL(12, 3),
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    // Postgres no permite quitar valores de un ENUM de forma sencilla; se deja
    // 'PARCIAL' en el tipo (inofensivo) y solo se revierte la columna.
    await queryInterface.removeColumn('pedidos_detalles', 'cantidad_recibida');
  },
};
