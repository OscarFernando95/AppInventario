'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize, Empresa, Producto } = require('../models');
const { evaluarEventosDeConteo } = require('./desviaciones');

/** % de faltante a partir del cual un conteo es una alerta (por empresa). */
async function umbralDeAlerta(empresaId) {
  const empresa = await Empresa.findByPk(empresaId, { attributes: ['desviacion_alerta_pct'] });
  return Number(empresa?.desviacion_alerta_pct ?? 5);
}

/**
 * Conteos físicos con su diferencia contra el conteo anterior del mismo producto: qué se gastó entre uno y otro
 * (ventas y producciones) y qué mermas se registraron. Se limita por fechas o por ids de ajuste.
 */
async function eventosDeConteo(empresaId, { desde, hasta, ajusteIds, umbral } = {}) {
  const replacements = { empresaId };
  const filtros = [];
  if (desde) { filtros.push('AND a."fecha" >= :desde'); replacements.desde = new Date(`${desde}T00:00:00`); }
  if (hasta) { filtros.push('AND a."fecha" <= :hasta'); replacements.hasta = new Date(`${hasta}T23:59:59.999`); }
  if (ajusteIds) {
    if (ajusteIds.length === 0) return [];
    filtros.push('AND a."id" IN (:ajusteIds)');
    replacements.ajusteIds = ajusteIds;
  }

  const filas = await sequelize.query(
    `SELECT a."id", a."productoId", a."fecha", a."diferencia", a."valor", prev."fecha" AS previo,
            COALESCE(cv."cantidad", 0) AS consumo_ventas,
            COALESCE(cp."cantidad", 0) AS consumo_produccion,
            COALESCE(mm."cantidad", 0) AS mermas
       FROM "ajustes_inventario" a
       LEFT JOIN LATERAL (
         SELECT MAX(p."fecha") AS "fecha" FROM "ajustes_inventario" p
          WHERE p."empresaId" = a."empresaId" AND p."productoId" = a."productoId" AND p."tipo" = 'CONTEO' AND p."fecha" < a."fecha"
       ) prev ON true
       LEFT JOIN LATERAL (
         SELECT SUM((e->>'cantidad')::numeric * GREATEST(0, 1 - vd."cantidad_reingresada" / NULLIF(vd."cantidad", 0))) AS "cantidad"
           FROM "ventas_detalles" vd
           JOIN "ventas" v ON v."id" = vd."ventaId"
           CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(vd."consumo") = 'array' THEN vd."consumo" ELSE '[]'::jsonb END) AS e
          WHERE v."empresaId" = a."empresaId" AND v."estado" = 'ACTIVA' AND (e->>'productoId')::int = a."productoId"
            AND prev."fecha" IS NOT NULL AND v."fecha" > prev."fecha" AND v."fecha" <= a."fecha"
       ) cv ON true
       LEFT JOIN LATERAL (
         SELECT SUM((e->>'cantidad')::numeric) AS "cantidad"
           FROM "producciones" pr
           CROSS JOIN LATERAL jsonb_array_elements(pr."consumo") AS e
          WHERE pr."empresaId" = a."empresaId" AND pr."estado" = 'ACTIVA' AND (e->>'productoId')::int = a."productoId"
            AND prev."fecha" IS NOT NULL AND pr."fecha" > prev."fecha" AND pr."fecha" <= a."fecha"
       ) cp ON true
       LEFT JOIN LATERAL (
         SELECT SUM(-m."diferencia") AS "cantidad" FROM "ajustes_inventario" m
          WHERE m."empresaId" = a."empresaId" AND m."productoId" = a."productoId" AND m."tipo" IN ('MERMA', 'VENCIDO', 'CONSUMO_INTERNO')
            AND prev."fecha" IS NOT NULL AND m."fecha" > prev."fecha" AND m."fecha" <= a."fecha"
       ) mm ON true
      WHERE a."empresaId" = :empresaId AND a."tipo" = 'CONTEO' ${filtros.join(' ')}
      ORDER BY a."fecha" DESC, a."id" DESC`,
    { type: QueryTypes.SELECT, replacements }
  );

  const eventos = evaluarEventosDeConteo(filas, umbral ?? await umbralDeAlerta(empresaId));
  const ids = [...new Set(eventos.map((e) => e.productoId))];
  const productos = ids.length
    ? await Producto.findAll({ where: { id: ids, empresaId }, attributes: ['id', 'nombre_producto', 'codigo', 'unidad_medida', 'tipo'], raw: true })
    : [];
  const porId = new Map(productos.map((p) => [p.id, p]));
  return eventos.map((e) => ({ ...e, ...(porId.get(e.productoId) ? {
    nombre_producto: porId.get(e.productoId).nombre_producto, codigo: porId.get(e.productoId).codigo, unidad_medida: porId.get(e.productoId).unidad_medida,
  } : {}) }));
}

module.exports = { umbralDeAlerta, eventosDeConteo };
