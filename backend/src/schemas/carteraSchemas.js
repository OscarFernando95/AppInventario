'use strict';

const { z, idRef, textoOpc } = require('./common');

const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const monto = z.coerce.number().positive('El monto debe ser mayor a 0.').max(99_999_999_999).transform(redondear2);

// Medios de pago del POS: 10 efectivo, 42 consignación, 47 transferencia, 48 tarjeta crédito, 49 tarjeta débito.
const MEDIOS = ['10', '42', '47', '48', '49'];

const abonoCreate = z.object({
  monto,
  medio_pago: z.enum(MEDIOS, { error: 'Medio de pago no válido.' }).default('10'),
  nota: textoOpc,
});

const pagoCreate = z.object({
  monto,
  // CAJA: sale en efectivo de la caja abierta del usuario. OTRO: banco, transferencia, etc.
  origen: z.enum(['CAJA', 'OTRO'], { error: 'Origen del pago no válido.' }).default('OTRO'),
  nota: textoOpc,
});

const listaCartera = z.object({
  estado: z.enum(['PENDIENTES', 'VENCIDAS', 'PAGADAS', 'TODAS']).optional(),
  clienteId: z.preprocess((v) => (v === '' ? undefined : v), idRef.optional()),
  proveedorId: z.preprocess((v) => (v === '' ? undefined : v), idRef.optional()),
  limit: z.any().optional(),
  offset: z.any().optional(),
});

module.exports = { MEDIOS, abonoCreate, pagoCreate, listaCartera };
