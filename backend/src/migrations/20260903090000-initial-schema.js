'use strict';

/**
 * Migración inicial — crea las 16 tablas del esquema:
 *   14 entidades + 2 tablas de unión (usuarios_empresas, empresas_modulos).
 *
 * Sustituye al antiguo `sequelize.sync({ alter/force })`. Refleja el estado
 * actual de los modelos en backend/src/models/ y las asociaciones declaradas
 * en models/index.js.
 *
 * Acciones de clave foránea (idénticas a las que generaba sync() en la BD MySQL):
 *   - FK obligatoria (allowNull:false) -> ON UPDATE CASCADE, ON DELETE CASCADE
 *   - FK opcional     (allowNull:true)  -> ON UPDATE CASCADE, ON DELETE SET NULL
 *
 * Nombres de columnas: se conservan en camelCase (empresaId, rolId, createdAt...)
 * tal como los definen los modelos; Sequelize siempre los entrecomilla.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { INTEGER, STRING, TEXT, BOOLEAN, DECIMAL, DATE, DATEONLY, ENUM, NOW } = Sequelize;

    const pk = () => ({ type: INTEGER, autoIncrement: true, primaryKey: true, allowNull: false });
    const stamps = () => ({
      createdAt: { type: DATE, allowNull: false },
      updatedAt: { type: DATE, allowNull: false },
    });
    const fk = (table, allowNull) => ({
      type: INTEGER,
      allowNull,
      references: { model: table, key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: allowNull ? 'SET NULL' : 'CASCADE',
    });

    const t = await queryInterface.sequelize.transaction();
    try {
      // 1. roles
      await queryInterface.createTable('roles', {
        id: pk(),
        nombre: { type: STRING, allowNull: false },
        tipo: { type: ENUM('BACKOFFICE_ADMIN', 'FRONT_ADMIN', 'FRONT_USER'), allowNull: false },
      }, { transaction: t });

      // 2. empresas
      await queryInterface.createTable('empresas', {
        id: pk(),
        nombre: { type: STRING, allowNull: false },
        nit: { type: STRING, allowNull: true },
        contacto: { type: STRING, allowNull: true },
        dv: { type: STRING(1), allowNull: true },
        tipo_persona: { type: STRING(1), allowNull: true, defaultValue: '1' },
        regimen_fiscal: { type: STRING, allowNull: true, defaultValue: 'O-48' },
        direccion_fisica: { type: STRING, allowNull: true },
        municipio_dane: { type: STRING(5), allowNull: true },
        departamento_dane: { type: STRING(2), allowNull: true },
        codigo_ciiu: { type: STRING, allowNull: true },
        email_facturacion: { type: STRING, allowNull: true },
        resolucion_numero: { type: STRING, allowNull: true },
        prefijo_facturacion: { type: STRING, allowNull: true },
        rango_desde: { type: INTEGER, allowNull: true },
        rango_hasta: { type: INTEGER, allowNull: true },
        fecha_vigencia_desde: { type: DATEONLY, allowNull: true },
        fecha_vigencia_hasta: { type: DATEONLY, allowNull: true },
        clave_tecnica: { type: STRING, allowNull: true },
        activa: { type: BOOLEAN, allowNull: true, defaultValue: true },
        ...stamps(),
      }, { transaction: t });

      // 3. modulos
      await queryInterface.createTable('modulos', {
        id: pk(),
        nombre_codigo: { type: STRING, allowNull: false, unique: true },
        descripcion: { type: STRING, allowNull: true },
      }, { transaction: t });

      // 4. usuarios
      await queryInterface.createTable('usuarios', {
        id: pk(),
        rolId: fk('roles', false),
        nombre: { type: STRING, allowNull: false },
        username: { type: STRING, allowNull: false, unique: true },
        contrasena_hash: { type: STRING, allowNull: false },
        estado: { type: BOOLEAN, allowNull: true, defaultValue: true },
        ...stamps(),
      }, { transaction: t });

      // 5. usuarios_empresas (unión N:M Usuario <-> Empresa)
      await queryInterface.createTable('usuarios_empresas', {
        empresaId: { ...fk('empresas', false), primaryKey: true },
        usuarioId: { ...fk('usuarios', false), primaryKey: true },
        ...stamps(),
      }, { transaction: t });

      // 6. empresas_modulos (unión N:M Empresa <-> Modulo)
      await queryInterface.createTable('empresas_modulos', {
        empresaId: { ...fk('empresas', false), primaryKey: true },
        moduloId: { ...fk('modulos', false), primaryKey: true },
        ...stamps(),
      }, { transaction: t });

      // 7. productos
      await queryInterface.createTable('productos', {
        id: pk(),
        empresaId: fk('empresas', false),
        codigo: { type: STRING, allowNull: false },
        nombre_producto: { type: STRING, allowNull: false },
        descripcion: { type: TEXT, allowNull: true },
        stock_actual: { type: INTEGER, allowNull: false, defaultValue: 0 },
        precio_unitario: { type: DECIMAL(10, 2), allowNull: false },
        porcentaje_iva: { type: DECIMAL(5, 2), allowNull: true, defaultValue: 19.00 },
        unidad_medida: { type: STRING, allowNull: true, defaultValue: '94' },
        codigo_estandar: { type: STRING, allowNull: true },
        ...stamps(),
      }, { transaction: t });

      // 8. proveedores
      await queryInterface.createTable('proveedores', {
        id: pk(),
        empresaId: fk('empresas', false),
        nombre: { type: STRING, allowNull: false },
        nit: { type: STRING, allowNull: false },
        contacto: { type: STRING, allowNull: true },
        telefono: { type: STRING, allowNull: true },
        email: { type: STRING, allowNull: true },
        direccion: { type: STRING, allowNull: true },
        ...stamps(),
      }, { transaction: t });

      // 9. clientes
      await queryInterface.createTable('clientes', {
        id: pk(),
        empresaId: fk('empresas', false),
        nombre: { type: STRING, allowNull: false },
        documento: { type: STRING, allowNull: true },
        email: { type: STRING, allowNull: true },
        telefono: { type: STRING, allowNull: true },
        direccion: { type: STRING, allowNull: true },
        tipo_documento: { type: STRING, allowNull: true, defaultValue: '13' },
        dv: { type: STRING(1), allowNull: true },
        tipo_persona: { type: STRING(1), allowNull: true, defaultValue: '2' },
        regimen_fiscal: { type: STRING, allowNull: true, defaultValue: 'R-99-PN' },
        municipio_dane: { type: STRING(5), allowNull: true },
        departamento_dane: { type: STRING(2), allowNull: true },
        ...stamps(),
      }, { transaction: t });

      // 10. servicios
      await queryInterface.createTable('servicios', {
        id: pk(),
        empresaId: fk('empresas', false),
        nombre: { type: STRING, allowNull: false },
        descripcion: { type: TEXT, allowNull: true },
        precio: { type: DECIMAL(10, 2), allowNull: false },
        porcentaje_iva: { type: DECIMAL(5, 2), allowNull: true, defaultValue: 19.00 },
        unidad_medida: { type: STRING, allowNull: true, defaultValue: 'ZZ' },
        codigo_estandar: { type: STRING, allowNull: true },
        ...stamps(),
      }, { transaction: t });

      // 11. compras
      await queryInterface.createTable('compras', {
        id: pk(),
        empresaId: fk('empresas', false),
        proveedorId: fk('proveedores', true),
        usuarioId: fk('usuarios', false),
        fecha: { type: DATE, allowNull: false, defaultValue: NOW },
        total: { type: DECIMAL(10, 2), allowNull: false },
        ...stamps(),
      }, { transaction: t });

      // 12. compras_detalles
      await queryInterface.createTable('compras_detalles', {
        id: pk(),
        compraId: fk('compras', false),
        productoId: fk('productos', true),
        descripcion_gasto: { type: STRING, allowNull: true },
        cantidad: { type: INTEGER, allowNull: false },
        costo_unitario: { type: DECIMAL(10, 2), allowNull: false },
      }, { transaction: t });

      // 13. pedidos
      await queryInterface.createTable('pedidos', {
        id: pk(),
        empresaId: fk('empresas', false),
        proveedorId: fk('proveedores', false),
        usuarioId: fk('usuarios', false),
        fecha_pedido: { type: DATE, allowNull: false, defaultValue: NOW },
        estado: {
          type: ENUM('PENDIENTE', 'COMPLETADO', 'CANCELADO'),
          allowNull: false,
          defaultValue: 'PENDIENTE',
        },
        total_estimado: { type: DECIMAL(10, 2), allowNull: false },
        ...stamps(),
      }, { transaction: t });

      // 14. pedidos_detalles
      await queryInterface.createTable('pedidos_detalles', {
        id: pk(),
        pedidoId: fk('pedidos', false),
        productoId: fk('productos', false),
        cantidad_pedida: { type: INTEGER, allowNull: false },
        costo_estimado: { type: DECIMAL(10, 2), allowNull: false },
      }, { transaction: t });

      // 15. ventas
      await queryInterface.createTable('ventas', {
        id: pk(),
        empresaId: fk('empresas', false),
        usuarioId: fk('usuarios', false),
        clienteId: fk('clientes', true),
        fecha: { type: DATE, allowNull: false, defaultValue: NOW },
        total: { type: DECIMAL(10, 2), allowNull: false },
        descuento_global: { type: DECIMAL(5, 2), allowNull: true, defaultValue: 0 },
        forma_pago: { type: STRING, allowNull: true, defaultValue: '1' },
        medio_pago: { type: STRING, allowNull: true, defaultValue: '10' },
        fecha_vencimiento: { type: DATEONLY, allowNull: true },
        subtotal_bruto: { type: DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
        total_impuestos: { type: DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
        total_descuentos: { type: DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
        estado_fe: { type: STRING, allowNull: true, defaultValue: 'NO_EMITIDA' },
        cufe: { type: STRING, allowNull: true },
        qr_data: { type: TEXT, allowNull: true },
        pdf_url: { type: STRING, allowNull: true },
        xml_url: { type: STRING, allowNull: true },
        ...stamps(),
      }, { transaction: t });

      // 16. ventas_detalles
      await queryInterface.createTable('ventas_detalles', {
        id: pk(),
        ventaId: fk('ventas', false),
        productoId: fk('productos', true),
        servicioId: fk('servicios', true),
        cantidad: { type: INTEGER, allowNull: false },
        precio_unitario: { type: DECIMAL(10, 2), allowNull: false },
        precio_base: { type: DECIMAL(10, 2), allowNull: true },
        porcentaje_iva: { type: DECIMAL(5, 2), allowNull: true, defaultValue: 0 },
        valor_iva: { type: DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
        subtotal_bruto: { type: DECIMAL(10, 2), allowNull: true, defaultValue: 0 },
      }, { transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      // Orden inverso al de creación para respetar las FK.
      const tables = [
        'ventas_detalles', 'ventas',
        'pedidos_detalles', 'pedidos',
        'compras_detalles', 'compras',
        'servicios', 'clientes', 'proveedores', 'productos',
        'empresas_modulos', 'usuarios_empresas',
        'usuarios', 'modulos', 'empresas', 'roles',
      ];
      for (const name of tables) {
        await queryInterface.dropTable(name, { transaction: t });
      }

      // En Postgres, dropTable NO elimina los tipos ENUM que creó Sequelize.
      if (queryInterface.sequelize.getDialect() === 'postgres') {
        await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_roles_tipo";', { transaction: t });
        await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_pedidos_estado";', { transaction: t });
      }

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
