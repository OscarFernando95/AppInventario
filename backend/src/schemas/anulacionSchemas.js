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

// --- Devolución parcial de una venta ---
const redondear3 = (n) => Math.round(n * 1000) / 1000;
const devolucionCreate = z.object({
  items: z.array(z.object({
    ventaDetalleId: z.coerce.number().int().positive(),
    cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0.').max(9_999_999).transform(redondear3),
    // true: lo devuelto vuelve al inventario (un plato ya preparado normalmente no).
    reingresar: z.boolean().optional().default(false),
  })).min(1, 'Elige qué se devuelve.').max(200),
  motivo,
  // Cómo se devuelve el dinero (si hay): efectivo de la caja o por otro medio (tarjeta, transferencia…).
  reembolso: z.enum(['CAJA', 'OTRO']).optional(),
});

module.exports.devolucionCreate = devolucionCreate;
