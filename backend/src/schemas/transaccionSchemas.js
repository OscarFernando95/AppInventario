'use strict';

const { z, dinero, idRef } = require('./common');

const cantidad = z.coerce.number().positive();

// --- Venta ---
const ventaDetalle = z
  .object({
    productoId: idRef.optional(),
    servicioId: idRef.optional(),
    cantidad,
    precio_unitario: dinero,
    precio_base: dinero.optional(),
  })
  .refine((d) => d.productoId || d.servicioId, {
    message: 'cada línea debe tener productoId o servicioId',
  });

const ventaCreate = z.object({
  clienteId: idRef.optional().nullable(),
  detalles: z.array(ventaDetalle).min(1),
  descuento_global: dinero.optional(),
  forma_pago: z.string().trim().max(5).optional(),
  medio_pago: z.string().trim().max(5).optional(),
});

// --- Compra ---
const compraDetalle = z
  .object({
    productoId: idRef.optional(),
    descripcion_gasto: z.string().trim().min(1).max(255).optional(),
    cantidad,
    costo_unitario: dinero,
  })
  .refine((d) => d.productoId || d.descripcion_gasto, {
    message: 'cada línea debe tener productoId o descripcion_gasto',
  });

const compraCreate = z.object({
  proveedorId: idRef,
  detalles: z.array(compraDetalle).min(1),
});

// --- Pedido ---
const pedidoDetalle = z.object({
  productoId: idRef,
  cantidad_pedida: cantidad,
  costo_estimado: dinero,
});

const pedidoCreate = z.object({
  proveedorId: idRef,
  detalles: z.array(pedidoDetalle).min(1),
});

const pedidoCheckin = z.object({
  detalles_recibidos: z
    .array(
      z.object({
        productoId: idRef,
        cantidad: z.coerce.number().min(0),
        costo_unitario: dinero,
      })
    )
    .min(1),
});

module.exports = { ventaCreate, compraCreate, pedidoCreate, pedidoCheckin };
