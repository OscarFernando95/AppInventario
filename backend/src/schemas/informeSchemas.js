'use strict';

const { z } = require('zod');

const TIPOS = ['ventas_resumen', 'compras_resumen', 'top_productos', 'top_clientes', 'top_proveedores'];

// Fecha en formato YYYY-MM-DD (lo que emite <input type="date">). Se interpreta
// en la hora local del servidor, no en UTC (ver informeController).
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'usa el formato AAAA-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00`)), 'fecha inválida');

const MAX_WINDOW_DAYS = 366;

const informeQuery = z
  .object({
    tipo: z.enum(TIPOS),
    start: isoDate,
    end: isoDate,
  })
  .refine((q) => Date.parse(q.start) <= Date.parse(q.end), {
    message: 'la fecha inicial no puede ser posterior a la final',
    path: ['start'],
  })
  .refine(
    (q) => (Date.parse(q.end) - Date.parse(q.start)) / 86_400_000 <= MAX_WINDOW_DAYS,
    { message: `el rango no puede superar ${MAX_WINDOW_DAYS} días`, path: ['end'] }
  );

module.exports = { informeQuery };
