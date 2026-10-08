'use strict';

/**
 * Roles y permisos parametrizables por empresa.
 *
 * `roles_empresa`: roles propios de cada empresa (nombre + permisos + módulos a los que accede).
 * `usuarios_empresas.rolEmpresaId`: rol propio asignado a un usuario EN ESA empresa. Si es NULL el usuario
 * conserva el comportamiento de siempre (Administrador / Operativo según `roles.tipo`), así nadie pierde
 * ni gana acceso al migrar. La FK es RESTRICT: no se puede borrar un rol que alguien tiene asignado.
 */
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable('roles_empresa', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        empresaId: {
          type: DataTypes.INTEGER, allowNull: false,
          references: { model: 'empresas', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
        },
        nombre: { type: DataTypes.STRING(80), allowNull: false },
        descripcion: { type: DataTypes.STRING(300), allowNull: true },
        permisos: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
        modulos: { type: DataTypes.JSONB, allowNull: true }, // NULL = todos los módulos de la empresa
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      }, { transaction });
      await queryInterface.addIndex('roles_empresa', ['empresaId', 'nombre'], { unique: true, name: 'roles_empresa_nombre_unico', transaction });

      await queryInterface.addColumn('usuarios_empresas', 'rolEmpresaId', {
        type: DataTypes.INTEGER, allowNull: true,
        references: { model: 'roles_empresa', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      }, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn('usuarios_empresas', 'rolEmpresaId', { transaction });
      await queryInterface.dropTable('roles_empresa', { transaction });
    });
  },
};
