'use strict';

const { z, dinero, textoOpc } = require('./common');

const redondear2 = (n) => Math.round(n * 100) / 100;
const monto = dinero.max(99_999_999_999).transform(redondear2);

const cajaAbrir = z.object({
  monto_inicial: monto.optional().default(0),
  observaciones: textoOpc,
});

const cajaCerrar = z.object({
  monto_contado: monto,
  observaciones: textoOpc,
});

const cajaRetiro = z.object({
  // RETIRO: el dueño saca dinero. PROPINA: se entregan al personal las propinas recibidas en efectivo.
  tipo: z.enum(['RETIRO', 'PROPINA']).optional().default('RETIRO'),
  concepto: z.string().trim().min(1, 'Indica el concepto.').max(255),
  monto: monto.refine((n) => n > 0, 'El monto debe ser mayor a 0.'),
});

// `desde`/`hasta`: YYYY-MM-DD (se pasan tal cual a buildListWhere).
const fechaDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD).').optional();
const cajaListQuery = z.object({
  estado: z.enum(['ABIERTA', 'CERRADA']).optional(),
  desde: fechaDia,
  hasta: fechaDia,
  limit: z.any().optional(),
  offset: z.any().optional(),
});

const balanceQuery = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD).').optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD).').optional(),
});

module.exports = { cajaAbrir, cajaCerrar, cajaRetiro, cajaListQuery, balanceQuery };
