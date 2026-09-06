'use strict';

/**
 * Añade `usuarios.must_change_password`. Cuando es TRUE, el usuario debe cambiar
 * su contraseña antes de poder usar la aplicación (ver authController.login y
 * POST /api/auth/change-password).
 *
 * Se marca en TRUE al usuario `admin` sembrado, para forzar el cambio de la
 * contraseña por defecto (`Admin*123`, documentada públicamente).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('usuarios', 'must_change_password', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.sequelize.query(
      `UPDATE "usuarios" SET must_change_password = true WHERE username = 'admin'`
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('usuarios', 'must_change_password');
  },
};
