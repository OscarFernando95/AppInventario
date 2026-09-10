'use strict';

const { z, enteroOpc } = require('./common');

const NIVELES = ['info', 'warn', 'error'];

// Igual que informeSchemas.isoDate: formato de <input type="date">, se
// interpreta en hora local del servidor (no en UTC).
const isoDateOpc = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'usa el formato AAAA-MM-DD')
    .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00`)), 'fecha inválida')
    .optional()
);

const textoOptFiltro = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().trim().max(80).optional());

const logsQuery = z.object({
  evento: textoOptFiltro,
  nivel: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.enum(NIVELES).optional()),
  desde: isoDateOpc,
  hasta: isoDateOpc,
  // Se validan aquí para que lleguen coaccionados; el clamping final
  // (default/máximo) lo hace parseListQuery en el controlador.
  limit: enteroOpc,
  offset: enteroOpc,
});

module.exports = { logsQuery, NIVELES };
