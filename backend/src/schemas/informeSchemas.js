'use strict';

const { z } = require('zod');

const TIPOS = ['ventas_resumen', 'compras_resumen', 'top_productos', 'top_clientes', 'top_proveedores'];

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'fecha inválida');

const informeQuery = z
  .object({
    tipo: z.enum(TIPOS),
    start: isoDate,
    end: isoDate,
  })
  .refine((q) => Date.parse(q.start) <= Date.parse(q.end), {
    message: 'la fecha inicial no puede ser posterior a la final',
    path: ['start'],
  });

module.exports = { informeQuery };
