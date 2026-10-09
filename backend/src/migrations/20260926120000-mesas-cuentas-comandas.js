'use strict';

/**
 * Mesas, cuentas abiertas y comandas.
 *
 *   - mesas        : las mesas del local (o puestos de barra).
 *   - cuentas      : una cuenta abierta por mesa (o "para llevar", sin mesa, con una etiqueta). Se le
 *                    agregan pedidos durante la atención y se cobra al final; el cobro genera una o
 *                    varias ventas (dividir la cuenta). Una sola cuenta ABIERTA por mesa.
 *   - cuenta_items : lo pedido. `ventaId` se llena al cobrarlo; `comandaId`, al enviarlo a cocina.
 *   - comandas     : cada envío a cocina (lo que se imprime o se ve en la pantalla de cocina).
 *   - ventas.propina / ventas.cuentaId : la propina NO es ingreso (no suma al total de la venta) pero
 *     sí es dinero que entra a la caja si se pagó en efectivo; cuentaId deja rastro de la mesa.
 *   - cajas.propinas_efectivo : foto de las propinas en efectivo del turno, al cerrar.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, DECIMAL, DATE, TEXT, JSONB, BOOLEAN } = Sequelize;
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('mesas', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: { type: INTEGER, allowNull: false, references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE' },
        nombre: { type: STRING(60), allowNull: false },
        capacidad: { type: INTEGER, allowNull: true },
        activa: { type: BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DATE, allowNull: false },
        updatedAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('mesas', ['empresaId', 'nombre'], { unique: true, name: 'mesas_empresa_nombre_uq', transaction: t });

      await queryInterface.createTable('cuentas', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: { type: INTEGER, allowNull: false, references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE' },
        mesaId: { type: INTEGER, allowNull: true, references: { model: 'mesas', key: 'id' } },
        etiqueta: { type: STRING(80), allowNull: true }, // cuentas sin mesa: "Para llevar · Juan"
        usuarioId: { type: INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
        comensales: { type: INTEGER, allowNull: true },
        nota: { type: TEXT, allowNull: true },
        estado: { type: STRING(10), allowNull: false, defaultValue: 'ABIERTA' }, // ABIERTA | COBRADA | CANCELADA
        abierta_en: { type: DATE, allowNull: false },
        cerrada_en: { type: DATE, allowNull: true },
        motivo_cancelacion: { type: TEXT, allowNull: true },
        cancelada_por: { type: INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
        createdAt: { type: DATE, allowNull: false },
        updatedAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('cuentas', ['empresaId', 'estado'], { name: 'cuentas_empresa_estado_idx', transaction: t });
      // Una sola cuenta ABIERTA por mesa (también ante dos meseros abriéndola a la vez).
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX cuentas_abierta_mesa_uq ON cuentas ("mesaId") WHERE estado = 'ABIERTA' AND "mesaId" IS NOT NULL`,
        { transaction: t }
      );

      await queryInterface.createTable('comandas', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        empresaId: { type: INTEGER, allowNull: false, references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE' },
        cuentaId: { type: INTEGER, allowNull: false, references: { model: 'cuentas', key: 'id' }, onDelete: 'CASCADE' },
        usuarioId: { type: INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
        estado: { type: STRING(10), allowNull: false, defaultValue: 'PENDIENTE' }, // PENDIENTE | LISTA | ENTREGADA
        enviada_en: { type: DATE, allowNull: false },
        lista_en: { type: DATE, allowNull: true },
        entregada_en: { type: DATE, allowNull: true },
      }, { transaction: t });
      await queryInterface.addIndex('comandas', ['empresaId', 'estado'], { name: 'comandas_empresa_estado_idx', transaction: t });
      await queryInterface.addIndex('comandas', ['cuentaId'], { name: 'comandas_cuenta_idx', transaction: t });

      await queryInterface.createTable('cuenta_items', {
        id: { type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        cuentaId: { type: INTEGER, allowNull: false, references: { model: 'cuentas', key: 'id' }, onDelete: 'CASCADE' },
        productoId: { type: INTEGER, allowNull: true, references: { model: 'productos', key: 'id' } },
        servicioId: { type: INTEGER, allowNull: true, references: { model: 'servicios', key: 'id' } },
        cantidad: { type: DECIMAL(12, 3), allowNull: false },
        modificadores: { type: JSONB, allowNull: true }, // ids de los modificadores elegidos
        nota: { type: STRING(200), allowNull: true }, // "sin cebolla", "para llevar"
        usuarioId: { type: INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' } },
        comandaId: { type: INTEGER, allowNull: true, references: { model: 'comandas', key: 'id' }, onDelete: 'SET NULL' },
        estado: { type: STRING(10), allowNull: false, defaultValue: 'ACTIVO' }, // ACTIVO | ANULADO
        motivo_anulacion: { type: STRING(300), allowNull: true },
        anulado_por: { type: INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' } },
        ventaId: { type: INTEGER, allowNull: true, references: { model: 'ventas', key: 'id' } },
        createdAt: { type: DATE, allowNull: false },
      }, { transaction: t });
      await queryInterface.addIndex('cuenta_items', ['cuentaId'], { name: 'cuenta_items_cuenta_idx', transaction: t });
      await queryInterface.addIndex('cuenta_items', ['comandaId'], { name: 'cuenta_items_comanda_idx', transaction: t });

      await queryInterface.addColumn('ventas', 'propina', { type: DECIMAL(14, 2), allowNull: false, defaultValue: 0 }, { transaction: t });
      await queryInterface.addColumn('ventas', 'cuentaId', { type: INTEGER, allowNull: true, references: { model: 'cuentas', key: 'id' }, onDelete: 'SET NULL' }, { transaction: t });
      await queryInterface.addColumn('cajas', 'propinas_efectivo', { type: DECIMAL(14, 2), allowNull: true }, { transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeColumn('cajas', 'propinas_efectivo', { transaction: t });
      await queryInterface.removeColumn('ventas', 'cuentaId', { transaction: t });
      await queryInterface.removeColumn('ventas', 'propina', { transaction: t });
      await queryInterface.dropTable('cuenta_items', { transaction: t });
      await queryInterface.dropTable('comandas', { transaction: t });
      await queryInterface.dropTable('cuentas', { transaction: t });
      await queryInterface.dropTable('mesas', { transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
