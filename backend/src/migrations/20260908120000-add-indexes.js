'use strict';

/**
 * Índices para las claves foráneas y las consultas más frecuentes.
 *
 * PostgreSQL NO crea índices automáticamente sobre las FKs, así que sin esto
 * cada `WHERE empresaId = ?` y cada JOIN hacía un sequential scan.
 *
 * - Se omite el índice suelto de `empresaId` en ventas/compras/pedidos porque
 *   el índice compuesto `(empresaId, fecha)` ya sirve para filtrar solo por
 *   empresa (columna líder).
 * - Las tablas de unión ya tienen PK compuesta `(empresaId, xId)`, que cubre
 *   las búsquedas por `empresaId`; falta el índice por la OTRA columna.
 *
 * CREATE INDEX normal (no CONCURRENTLY): la BASE es pequeña (sistema de una
 * oficina) y la migración corre al desplegar. Para una BD grande habría que
 * usar CONCURRENTLY fuera de transacción.
 */

const INDEXES = [
  ['usuarios', ['rolId']],
  ['usuarios_empresas', ['usuarioId']],
  ['empresas_modulos', ['moduloId']],

  ['productos', ['empresaId']],
  ['proveedores', ['empresaId']],
  ['clientes', ['empresaId']],
  ['servicios', ['empresaId']],

  ['compras', ['empresaId', 'fecha']],
  ['compras', ['proveedorId']],
  ['compras', ['usuarioId']],
  ['compras_detalles', ['compraId']],
  ['compras_detalles', ['productoId']],

  ['pedidos', ['empresaId', 'fecha_pedido']],
  ['pedidos', ['proveedorId']],
  ['pedidos', ['usuarioId']],
  ['pedidos_detalles', ['pedidoId']],
  ['pedidos_detalles', ['productoId']],

  ['ventas', ['empresaId', 'fecha']],
  ['ventas', ['usuarioId']],
  ['ventas', ['clienteId']],
  ['ventas_detalles', ['ventaId']],
  ['ventas_detalles', ['productoId']],
  ['ventas_detalles', ['servicioId']],
];

const nameFor = (table, cols) => `${table}_${cols.join('_')}_idx`;

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      for (const [table, cols] of INDEXES) {
        await queryInterface.addIndex(table, cols, { name: nameFor(table, cols), transaction: t });
      }
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      for (const [table, cols] of INDEXES) {
        await queryInterface.removeIndex(table, nameFor(table, cols), { transaction: t });
      }
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
