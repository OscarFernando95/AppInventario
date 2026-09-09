'use strict';

const { z } = require('zod');

const idParam = z.object({ id: z.coerce.number().int().positive() });

// Texto obligatorio con recorte de espacios.
const nombre = z.string().trim().min(1).max(255);
// Texto opcional; "" y null se normalizan a undefined.
const textoOpc = z.string().trim().max(500).optional().nullable().transform((v) => v || undefined);
// Email opcional: los formularios mandan "" cuando el campo va vacío → se trata
// como ausente (no como email inválido).
const emailOpc = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().trim().email().max(255).optional()
);
const dinero = z.coerce.number().nonnegative();
// Entero opcional que trata "" como ausente (inputs numéricos vacíos del form).
const enteroOpc = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.coerce.number().int().optional()
);
const cantidadEntera = z.coerce.number().int().positive();
const idRef = z.coerce.number().int().positive();

module.exports = { z, idParam, nombre, textoOpc, emailOpc, dinero, enteroOpc, cantidadEntera, idRef };
