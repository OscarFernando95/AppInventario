'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

/**
 * Consumo teórico de las VENTAS por producto en un rango: lo que descontó `ventas_detalles.consumo`
 * (ingredientes de un plato, o el producto mismo), neto de lo que volvió al inventario por devoluciones.
 * Devuelve [{ productoId, cantidad }]. `desde`/`hasta` son Date; `productoIds` limita los productos.
 */
async function consumoDeVentasPorProducto(empresaId, { desde, hasta, productoIds } = {}) {
  const replacements = { empresaId };
  const filtros = [];
  if (desde) { filtros.push('AND v."fecha" >= :desde'); replacements.desde = desde; }
  if (hasta) { filtros.push('AND v."fecha" <= :hasta'); replacements.hasta = hasta; }
  if (productoIds) {
    if (productoIds.length === 0) return [];
    filtros.push('AND (e->>\'productoId\')::int IN (:productoIds)');
    replacements.productoIds = productoIds;
  }
  const filas = await sequelize.query(
    `SELECT (e->>'productoId')::int AS "productoId",
            SUM((e->>'cantidad')::numeric * GREATEST(0, 1 - vd."cantidad_reingresada" / NULLIF(vd."cantidad", 0))) AS cantidad
       FROM "ventas_detalles" vd
       JOIN "ventas" v ON v."id" = vd."ventaId"
       CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(vd."consumo") = 'array' THEN vd."consumo" ELSE '[]'::jsonb END) AS e
      WHERE v."empresaId" = :empresaId AND v."estado" = 'ACTIVA' ${filtros.join(' ')}
      GROUP BY 1`,
    { type: QueryTypes.SELECT, replacements }
  );
  return filas.map((f) => ({ productoId: Number(f.productoId), cantidad: Number(f.cantidad) }));
}

module.exports = { consumoDeVentasPorProducto };
