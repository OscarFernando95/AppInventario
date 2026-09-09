'use strict';

/**
 * Catálogos de referencia (DANE / CIIU) + tipo de empresa.
 *
 *   - departamentos     : 33 departamentos DANE (código de 2 dígitos).
 *   - municipios         : 1123 municipios DANE (código de 5 dígitos) ligados a
 *                          su departamento por `departamento_codigo`.
 *   - actividades_ciiu   : ~500 clases CIIU Rev. 4 A.C. (código de 4 dígitos).
 *   - empresas.tipo_empresa : 'SIMPLE' (por defecto) | 'FACTURACION_ELECTRONICA'.
 *   - proveedores.{departamento_dane,municipio_dane} : localización opcional.
 *
 * Las tres tablas son datos de referencia estáticos: sin FK reales entre ellas
 * (se relacionan por código), sin timestamps. Se pueblan desde el seeder
 * `20260909120100-catalogos-dane-ciiu.js`.
 *
 * `tipo_empresa` se modela como STRING (no ENUM) igual que el resto del esquema
 * (`estado_fe`, `regimen_fiscal`...): añadir valores no requiere ALTER TYPE.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, TEXT } = Sequelize;
    const pk = () => ({ type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false });

    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('departamentos', {
        id: pk(),
        codigo_dane: { type: STRING(2), allowNull: false, unique: true },
        nombre: { type: STRING, allowNull: false },
      }, { transaction: t });

      await queryInterface.createTable('municipios', {
        id: pk(),
        codigo_dane: { type: STRING(5), allowNull: false, unique: true },
        nombre: { type: STRING, allowNull: false },
        departamento_codigo: { type: STRING(2), allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('municipios', ['departamento_codigo'], {
        name: 'municipios_departamento_codigo_idx', transaction: t,
      });

      await queryInterface.createTable('actividades_ciiu', {
        id: pk(),
        codigo: { type: STRING(4), allowNull: false, unique: true },
        descripcion: { type: TEXT, allowNull: false },
        division: { type: STRING(2), allowNull: true },
        seccion: { type: STRING(1), allowNull: true },
      }, { transaction: t });

      await queryInterface.addColumn('empresas', 'tipo_empresa', {
        type: STRING(30), allowNull: false, defaultValue: 'SIMPLE',
      }, { transaction: t });

      await queryInterface.addColumn('proveedores', 'departamento_dane', {
        type: STRING(2), allowNull: true,
      }, { transaction: t });
      await queryInterface.addColumn('proveedores', 'municipio_dane', {
        type: STRING(5), allowNull: true,
      }, { transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeColumn('proveedores', 'municipio_dane', { transaction: t });
      await queryInterface.removeColumn('proveedores', 'departamento_dane', { transaction: t });
      await queryInterface.removeColumn('empresas', 'tipo_empresa', { transaction: t });
      await queryInterface.dropTable('actividades_ciiu', { transaction: t });
      await queryInterface.dropTable('municipios', { transaction: t });
      await queryInterface.dropTable('departamentos', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
