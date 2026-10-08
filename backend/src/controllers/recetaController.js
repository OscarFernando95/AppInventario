'use strict';

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Rentabilidad REAL de lo vendido en el rango: por producto/plato, unidades,
 * ingresos netos (sin IVA, con el descuento de línea; sin el descuento global),
 * costo de lo vendido (foto guardada en cada venta) y margen.
 */
exports.getRentabilidad = async (req, res) => {
  const { desde, hasta } = req.query;
  const filtros = [];
  const replacements = { empresaId: req.empresaId };
  if (desde) { filtros.push('AND v."fecha" >= :desde'); replacements.desde = new Date(`${desde}T00:00:00`); }
  if (hasta) { filtros.push('AND v."fecha" <= :hasta'); replacements.hasta = new Date(`${hasta}T23:59:59.999`); }

  const filas = await sequelize.query(
    `SELECT vd."productoId" AS "productoId", p."nombre_producto", p."codigo", p."tipo",
            SUM(vd."cantidad") AS unidades,
            SUM(vd."subtotal_bruto") AS ingresos,
            SUM(vd."cantidad" * vd."costo_unitario") AS costo
       FROM "ventas_detalles" vd
       JOIN "ventas" v ON v."id" = vd."ventaId"
       JOIN "productos" p ON p."id" = vd."productoId"
      WHERE v."empresaId" = :empresaId AND vd."productoId" IS NOT NULL ${filtros.join(' ')}
      GROUP BY vd."productoId", p."nombre_producto", p."codigo", p."tipo"`,
    { type: QueryTypes.SELECT, replacements }
  );

  const filasOut = filas.map((f) => {
    const ingresos = redondear2(f.ingresos);
    const costo = redondear2(f.costo);
    const margen = redondear2(ingresos - costo);
    return {
      productoId: f.productoId,
      nombre_producto: f.nombre_producto,
      codigo: f.codigo,
      tipo: f.tipo,
      unidades: Number(f.unidades),
      ingresos,
      costo,
      margen,
      margen_pct: ingresos > 0 ? redondear2((margen / ingresos) * 100) : 0,
    };
  }).sort((a, b) => b.margen - a.margen);

  const ingresos = redondear2(filasOut.reduce((a, f) => a + f.ingresos, 0));
  const costo = redondear2(filasOut.reduce((a, f) => a + f.costo, 0));
  const margen = redondear2(ingresos - costo);
  res.json({
    filas: filasOut,
    totales: { ingresos, costo, margen, margen_pct: ingresos > 0 ? redondear2((margen / ingresos) * 100) : 0 },
  });
};
