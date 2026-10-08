'use strict';

const { z } = require('./common');

const motivo = z.string({ error: 'Indica el motivo de la anulación.' }).trim().min(3, 'Indica el motivo de la anulación.').max(500);

const anularVenta = z.object({ motivo });
const rechazarAnulacion = z.object({ comentario: z.string().trim().max(500).optional() });
const anulacionesQuery = z.object({
  estado: z.enum(['PENDIENTE', 'APROBADA', 'RECHAZADA']).optional(),
  limit: z.any().optional(),
  offset: z.any().optional(),
});

module.exports = { anularVenta, rechazarAnulacion, anulacionesQuery };
