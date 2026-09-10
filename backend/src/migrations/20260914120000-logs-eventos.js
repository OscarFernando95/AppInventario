'use strict';

/**
 * Trazabilidad de eventos de negocio (login, errores de API, importaciones
 * masivas, etc.) para que el backoffice pueda revisar visualmente qué pasó en
 * un caso puntual, sin tener que ir a buscar en los logs de Docker.
 *
 * No es un log de CADA petición HTTP (eso sería demasiado volumen para poco
 * valor de depuración) — son los eventos que ya emite `src/utils/logger.js`
 * (login_ok/login_fail/password_changed/...) más `api_error`, que se agrega
 * junto con esta migración para cubrir toda respuesta de error de negocio
 * (400/403/404/409), no solo los 500 inesperados.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DATE, JSONB } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('logs_eventos', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        evento: { type: STRING(80), allowNull: false },
        nivel: { type: STRING(10), allowNull: false },
        metodo: { type: STRING(10), allowNull: true },
        ruta: { type: STRING(255), allowNull: true },
        status_code: { type: INTEGER, allowNull: true },
        usuarioId: {
          type: INTEGER,
          allowNull: true,
          references: { model: 'usuarios', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        empresaId: {
          type: INTEGER,
          allowNull: true,
          references: { model: 'empresas', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        detalle: { type: JSONB, allowNull: true },
        creado_en: { type: DATE, allowNull: false },
      }, { transaction: t });

      await queryInterface.addIndex('logs_eventos', ['creado_en'], {
        name: 'logs_eventos_creado_en_idx', transaction: t,
      });
      await queryInterface.addIndex('logs_eventos', ['evento'], {
        name: 'logs_eventos_evento_idx', transaction: t,
      });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('logs_eventos');
  },
};
