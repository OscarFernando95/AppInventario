'use strict';

const { z, idRef } = require('./common');

const CATEGORIAS_GASTO = ['SERVICIOS', 'ARRIENDO', 'NOMINA', 'MANTENIMIENTO', 'TRANSPORTE', 'IMPUESTOS', 'OTROS'];

const fechaDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD).');

const gastoCreate = z.object({
  categoria: z.enum(CATEGORIAS_GASTO, { error: 'Categoría de gasto no válida.' }),
  descripcion: z.string().trim().min(1, 'Describe el gasto.').max(255),
  monto: z.coerce.number().positive('El monto debe ser mayor a 0.').max(99_999_999_999).transform((n) => Math.round(n * 100) / 100),
  // Opcional: un recibo no siempre tiene proveedor.
  proveedorId: z.preprocess((v) => (v === null || v === '' ? undefined : v), idRef.optional()),
  // Fecha del gasto (por defecto hoy): permite registrar el recibo de ayer.
  fecha: fechaDia.optional(),
  // true: sale en efectivo de la caja abierta del usuario (exige el módulo Caja).
  pagar_desde_caja: z.boolean().optional(),
});

const gastoListQuery = z.object({
  categoria: z.enum(CATEGORIAS_GASTO).optional(),
  estado: z.enum(['ACTIVO', 'ANULADO']).optional(),
  desde: fechaDia.optional(),
  hasta: fechaDia.optional(),
  limit: z.any().optional(),
  offset: z.any().optional(),
});

const gastoRango = z.object({ desde: fechaDia.optional(), hasta: fechaDia.optional() });

module.exports = { CATEGORIAS_GASTO, gastoCreate, gastoListQuery, gastoRango };
