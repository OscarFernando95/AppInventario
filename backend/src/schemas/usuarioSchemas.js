'use strict';

const { z } = require('zod');

const idParam = z.object({
  id: z.coerce.number().int().positive(),
});

const createUsuario = z.object({
  nombre: z.string().trim().min(1).max(150),
  username: z.string().trim().min(3).max(150),
  contrasena: z.string().min(1).max(200), // la política de complejidad la aplica hashPassword()
  rolId: z.coerce.number().int().positive().optional(), // rol base; se omite al asignar un rol propio
  rolEmpresaId: z.coerce.number().int().positive().optional().nullable(), // rol propio de la empresa
  empresaIds: z.array(z.coerce.number().int().positive()).optional(),
}).refine((d) => d.rolId || d.rolEmpresaId, { message: 'Indica el rol del usuario', path: ['rolId'] });

const updateUsuario = z.object({
  nombre: z.string().trim().min(1).max(150).optional(),
  username: z.string().trim().min(3).max(150).optional(),
  contrasena: z.string().min(1).max(200).optional(),
  rolId: z.coerce.number().int().positive().optional(),
  rolEmpresaId: z.coerce.number().int().positive().optional().nullable(),
  estado: z.boolean().optional(),
  empresaIds: z.array(z.coerce.number().int().positive()).optional(),
});

module.exports = { idParam, createUsuario, updateUsuario };
