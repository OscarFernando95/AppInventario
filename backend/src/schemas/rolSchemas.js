'use strict';

const { z } = require('zod');

const permisos = z.array(z.string().trim().min(1).max(60)).max(100);
const modulos = z.array(z.string().trim().min(1).max(60)).max(50).nullable();

const rolCreate = z.object({
  nombre: z.string().trim().min(2).max(80),
  descripcion: z.string().trim().max(300).optional().nullable(),
  permisos,
  modulos: modulos.optional(), // omitido o null = todos los módulos de la empresa
});

const rolUpdate = rolCreate.partial();

module.exports = { rolCreate, rolUpdate };
