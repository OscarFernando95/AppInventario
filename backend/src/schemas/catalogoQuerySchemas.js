'use strict';

const { z } = require('zod');

const municipiosQuery = z.object({
  departamento: z.string().trim().regex(/^\d{1,2}$/).optional(),
});

const ciiuQuery = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

module.exports = { municipiosQuery, ciiuQuery };
