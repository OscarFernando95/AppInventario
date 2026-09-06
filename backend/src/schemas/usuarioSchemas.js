'use strict';

const { z } = require('zod');

const idParam = z.object({
  id: z.coerce.number().int().positive(),
});

const createUsuario = z.object({
  nombre: z.string().trim().min(1).max(150),
  username: z.string().trim().min(3).max(150),
  contrasena: z.string().min(1).max(200), // la política de complejidad la aplica hashPassword()
  rolId: z.coerce.number().int().positive(),
  empresaIds: z.array(z.coerce.number().int().positive()).optional(),
});

const updateUsuario = z.object({
  nombre: z.string().trim().min(1).max(150).optional(),
  username: z.string().trim().min(3).max(150).optional(),
  contrasena: z.string().min(1).max(200).optional(),
  rolId: z.coerce.number().int().positive().optional(),
  estado: z.boolean().optional(),
  empresaIds: z.array(z.coerce.number().int().positive()).optional(),
});

module.exports = { idParam, createUsuario, updateUsuario };
