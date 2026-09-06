'use strict';

const { z } = require('zod');

const loginSchema = z.object({
  username: z.string().trim().min(1, 'requerido').max(150),
  contrasena: z.string().min(1, 'requerido').max(200),
});

const changePasswordSchema = z.object({
  actual: z.string().min(1, 'requerido').max(200),
  nueva: z.string().min(1, 'requerido').max(200),
});

module.exports = { loginSchema, changePasswordSchema };
