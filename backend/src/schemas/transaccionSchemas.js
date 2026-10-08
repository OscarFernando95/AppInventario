'use strict';

const { z, dinero } = require('./common');

// Cantidad: admite fracciones (kg, litros, metros) hasta 3 decimales; la columna
// es DECIMAL(12,3). Se redondea a 3 decimales para no depender de la precisión
// exacta de coma flotante del cliente.
const cantidad = z.coerce
  .number()
  .positive()
  .max(9_999_999)
  .transform((n) => Math.round(n * 1000) / 1000);

// Porcentaje 0–100 (descuento global de la venta).
const porcentaje = z.coerce.number().min(0).max(100);

// id opcional que tolera null / "" (los formularios POS mandan el id que NO
// aplica como null explícito: p. ej. servicioId:null en una línea de producto).
const optionalId = z.preprocess(
  (v) => (v === null || v === undefined || v === '' ? undefined : v),
  z.coerce.number().int().positive().optional()
);
// --- Venta ---
const ventaDetalle = z
  .object({
    productoId: optionalId,
    servicioId: optionalId,
    cantidad,
    precio_unitario: dinero,
    precio_base: dinero.optional(),
    // Modificadores elegidos (solo platos): ids de /api/modificadores.
    modificadores: z.array(z.coerce.number().int().positive()).max(15).optional(),
  })
  .refine((d) => d.productoId || d.servicioId, {
    message: 'cada línea debe tener productoId o servicioId',
  });

const ventaCreate = z.object({
  clienteId: optionalId,
  detalles: z.array(ventaDetalle).min(1),
  // Porcentaje 0–100 (así lo maneja la UI y el PDF). El backend ignora `total` y
  // `precio_base` que manda el cliente.
  descuento_global: porcentaje.optional(),
  forma_pago: z.string().trim().max(5).optional(),
  // Solo con forma_pago '2' (crédito): plazo en días (por defecto 30).
  dias_credito: z.coerce.number().int().min(0).max(365).optional(),
  medio_pago: z.string().trim().max(5).optional(),
});

// --- Compra ---
// Una compra es de MERCANCÍA (productos) y siempre lleva proveedor. Los gastos
// operativos (recibos, arriendo…) tienen su propio módulo: /api/gastos.
const compraDetalle = z.object({
  productoId: z.coerce.number().int().positive(),
  cantidad,
  costo_unitario: dinero,
  // true: cantidad y costo vienen en la presentación de compra del producto (kg, caja…).
  en_presentacion: z.boolean().optional(),
});

const compraCreate = z.object({
  proveedorId: z.coerce.number().int().positive(),
  detalles: z.array(compraDetalle).min(1),
  // true: se paga en efectivo de la caja abierta del usuario (exige el módulo Caja).
  pago_desde_caja: z.boolean().optional(),
  // CREDITO: queda una deuda con el proveedor (módulo Cuentas por pagar) con este plazo en días (por defecto 30).
  forma_pago: z.enum(['CONTADO', 'CREDITO']).optional(),
  dias_credito: z.coerce.number().int().min(0).max(365).optional(),
});

// --- Pedido ---
const pedidoDetalle = z.object({
  productoId: z.coerce.number().int().positive(),
  cantidad_pedida: cantidad,
  costo_estimado: dinero,
  en_presentacion: z.boolean().optional(),
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
        en_presentacion: z.boolean().optional(),
      })
    )
    .min(1),
  pago_desde_caja: z.boolean().optional(),
  forma_pago: z.enum(['CONTADO', 'CREDITO']).optional(),
  dias_credito: z.coerce.number().int().min(0).max(365).optional(),
});

module.exports = { ventaCreate, compraCreate, pedidoCreate, pedidoCheckin };
