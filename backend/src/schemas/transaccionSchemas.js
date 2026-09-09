'use strict';

const { z, dinero } = require('./common');

const cantidad = z.coerce.number().positive();

// id opcional que tolera null / "" (los formularios POS mandan el id que NO
// aplica como null explícito: p. ej. servicioId:null en una línea de producto).
const optionalId = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? undefined : v),
  z.coerce.number().int().positive().optional()
);
// texto opcional que tolera null / "".
const optionalText = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? undefined : v),
  z.string().trim().min(1).max(255).optional()
);

// --- Venta ---
const ventaDetalle = z
  .object({
    productoId: optionalId,
    servicioId: optionalId,
    cantidad,
    precio_unitario: dinero,
    precio_base: dinero.optional(),
  })
  .refine((d) => d.productoId || d.servicioId, {
    message: 'cada línea debe tener productoId o servicioId',
  });

const ventaCreate = z.object({
  clienteId: optionalId,
  detalles: z.array(ventaDetalle).min(1),
  descuento_global: dinero.optional(),
  forma_pago: z.string().trim().max(5).optional(),
  medio_pago: z.string().trim().max(5).optional(),
});

// --- Compra ---
const compraDetalle = z
  .object({
    productoId: optionalId,
    descripcion_gasto: optionalText,
    cantidad,
    costo_unitario: dinero,
  })
  .refine((d) => d.productoId || d.descripcion_gasto, {
    message: 'cada línea debe tener productoId o descripcion_gasto',
  });

const compraCreate = z.object({
  proveedorId: z.coerce.number().int().positive(),
  detalles: z.array(compraDetalle).min(1),
});

// --- Pedido ---
const pedidoDetalle = z.object({
  productoId: z.coerce.number().int().positive(),
  cantidad_pedida: cantidad,
  costo_estimado: dinero,
});

const pedidoCreate = z.object({
  proveedorId: z.coerce.number().int().positive(),
  detalles: z.array(pedidoDetalle).min(1),
});

const pedidoCheckin = z.object({
  detalles_recibidos: z
    .array(
      z.object({
        productoId: z.coerce.number().int().positive(),
        cantidad: z.coerce.number().min(0),
        costo_unitario: dinero,
      })
    )
    .min(1),
});

module.exports = { ventaCreate, compraCreate, pedidoCreate, pedidoCheckin };
