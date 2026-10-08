'use strict';

const { z, idRef, textoOpc, idParam } = require('./common');

const redondear3 = (n) => Math.round(n * 1000) / 1000;
const redondear2 = (n) => Math.round(n * 100) / 100;
const cantidadPositiva = z.coerce.number().positive().max(9_999).transform(redondear3);
const idOpc = z.preprocess((v) => (v === null || v === undefined || v === '' ? undefined : v), idRef.optional());
const fechaDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD).').optional();

// --- Mesas ---
const mesa = z.object({
  nombre: z.string().trim().min(1, 'Indica el nombre de la mesa.').max(60),
  capacidad: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(1).max(500).nullish()),
  activa: z.boolean().optional(),
});
const mesaUpdate = mesa.partial();

// --- Cuentas ---
const cuentaAbrir = z.object({
  mesaId: idOpc,
  etiqueta: z.string().trim().max(80).optional().nullable().transform((v) => v || undefined),
  comensales: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(500).optional()),
  nota: textoOpc,
}).refine((d) => d.mesaId || d.etiqueta, { message: 'Elige una mesa o escribe a quién va la cuenta (para llevar).' });

const cuentaUpdate = z.object({
  comensales: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(1).max(500).nullish()),
  nota: z.string().trim().max(500).nullish().transform((v) => (v === undefined ? undefined : (v || null))),
  etiqueta: z.string().trim().max(80).nullish().transform((v) => (v === undefined ? undefined : (v || null))),
});

const cuentaListQuery = z.object({
  estado: z.enum(['ABIERTA', 'COBRADA', 'CANCELADA']).optional(),
  desde: fechaDia,
  hasta: fechaDia,
  limit: z.any().optional(),
  offset: z.any().optional(),
});

const itemAgregar = z.object({
  productoId: idOpc,
  servicioId: idOpc,
  cantidad: cantidadPositiva.optional().default(1),
  modificadores: z.array(z.coerce.number().int().positive()).max(15).optional(),
  nota: z.string().trim().max(200).optional().nullable().transform((v) => v || undefined),
}).refine((d) => !!d.productoId !== !!d.servicioId, { message: 'Cada ítem es un producto o un servicio.' });

const itemEditar = z.object({
  cantidad: cantidadPositiva.optional(),
  nota: z.string().trim().max(200).nullish().transform((v) => (v === undefined ? undefined : (v || null))),
});

const itemAnular = z.object({ motivo: z.string().trim().min(3, 'Indica el motivo.').max(300) });

const cuentaMover = z.object({ mesaId: idRef });

const cuentaCancelar = z.object({ motivo: z.string().trim().min(3, 'Indica el motivo.').max(500) });

const cuentaCobrar = z.object({
  // Sin ítems se cobra todo lo pendiente; con ítems, solo esa parte (dividir la cuenta).
  items: z.array(z.object({ itemId: idRef, cantidad: cantidadPositiva })).max(200).optional(),
  clienteId: idOpc,
  descuento_global: z.coerce.number().min(0).max(100).optional(),
  forma_pago: z.string().trim().max(5).optional(),
  medio_pago: z.string().trim().max(5).optional(),
  dias_credito: z.coerce.number().int().min(0).max(365).optional(),
  // Propina voluntaria: no suma al total de la venta.
  propina: z.coerce.number().min(0).max(99_999_999).transform(redondear2).optional().default(0),
});

// --- Comandas ---
const ESTADOS_COMANDA = ['PENDIENTE', 'LISTA', 'ENTREGADA'];
const comandaListQuery = z.object({
  estado: z.string().regex(/^(PENDIENTE|LISTA|ENTREGADA)(,(PENDIENTE|LISTA|ENTREGADA))*$/, 'Estado no válido.').optional(),
});
const comandaEstado = z.object({ estado: z.enum(ESTADOS_COMANDA, { error: 'Estado no válido.' }) });

module.exports = {
  idParam, mesa, mesaUpdate, cuentaAbrir, cuentaUpdate, cuentaListQuery, itemAgregar, itemEditar, itemAnular,
  cuentaMover, cuentaCancelar, cuentaCobrar, comandaListQuery, comandaEstado, ESTADOS_COMANDA,
};
