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
const estacionesLista = z.array(z.string().trim().min(1).max(30)).min(1, 'Deja al menos una estación.').max(6, 'Máximo 6 estaciones.')
  .refine((l) => new Set(l.map((e) => e.toLowerCase())).size === l.length, 'Hay estaciones repetidas.');
const mesaConfig = z.object({
  propina_sugerida_pct: z.coerce.number().min(0).max(30).transform((n) => Math.round(n * 100) / 100).optional(),
  estaciones: estacionesLista.optional(),
}).refine((d) => d.propina_sugerida_pct !== undefined || d.estaciones !== undefined, { message: 'No hay nada que cambiar.' });
const mesaPesos = z.object({
  pesos: z.array(z.object({ usuarioId: idRef, peso: z.coerce.number().min(0).max(100).transform(redondear2) })).min(1).max(100),
});
const mesaPlano = z.object({
  posiciones: z.array(z.object({
    id: idRef,
    x: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(0).max(100).nullable()),
    y: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(0).max(100).nullable()),
  })).min(1).max(300),
});

// --- Cuentas ---
const cuentaAbrir = z.object({
  mesaId: idOpc,
  etiqueta: z.string().trim().max(80).optional().nullable().transform((v) => v || undefined),
  comensales: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(500).optional()),
  nota: textoOpc,
  // Con «pedidos numerados» una cuenta para llevar sin nombre toma el siguiente número del día.
  numerar: z.boolean().optional(),
  // Con «cuenta a nombre de»: cliente y/o referencia (habitación, grupo).
  clienteId: idOpc,
  referencia: z.string().trim().max(80).optional().nullable().transform((v) => v || undefined),
}).refine((d) => d.mesaId || d.etiqueta || d.numerar, { message: 'Elige una mesa o escribe a quién va la cuenta (para llevar).' });

const cuentaUpdate = z.object({
  comensales: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(1).max(500).nullish()),
  nota: z.string().trim().max(500).nullish().transform((v) => (v === undefined ? undefined : (v || null))),
  etiqueta: z.string().trim().max(80).nullish().transform((v) => (v === undefined ? undefined : (v || null))),
  clienteId: z.preprocess((v) => (v === '' ? null : v), idRef.nullish()),
  referencia: z.string().trim().max(80).nullish().transform((v) => (v === undefined ? undefined : (v || null))),
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
  // De qué persona de la mesa es el ítem (para cobrarle a cada quien lo suyo).
  comensal: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(50).optional()),
  // Tiempo de servicio (1 = entrada, 2 = plato fuerte…). Solo se respeta con la opción «Pedir por tiempos».
  tiempo: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().int().min(1).max(4).optional()),
}).refine((d) => !!d.productoId !== !!d.servicioId, { message: 'Cada ítem es un producto o un servicio.' });

const itemEditar = z.object({
  cantidad: cantidadPositiva.optional(),
  comensal: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(1).max(50).nullish()),
  nota: z.string().trim().max(200).nullish().transform((v) => (v === undefined ? undefined : (v || null))),
  tiempo: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().int().min(1).max(4).optional()),
});

const itemAnular = z.object({ motivo: z.string().trim().min(3, 'Indica el motivo.').max(300) });

const cuentaMover = z.object({ mesaId: idRef });

const cuentaUnir = z.object({ cuentaId: idRef });

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

// --- Reservas ---
const fechaHora = z.coerce.date({ error: 'Fecha y hora inválidas.' });
const reserva = z.object({
  mesaId: idOpc,
  nombre: z.string().trim().min(1, 'Indica el nombre de quien reserva.').max(120),
  telefono: z.string().trim().max(40).optional().nullable().transform((v) => v || undefined),
  personas: z.coerce.number().int().min(1, 'Indica cuántas personas.').max(500),
  fecha_hora: fechaHora,
  nota: textoOpc,
});
const reservaUpdate = reserva.partial().extend({
  mesaId: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().positive().nullish()),
  estado: z.enum(['PENDIENTE', 'CANCELADA', 'NO_LLEGO']).optional(),
});
const reservaListQuery = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD).').optional(),
  // Rango de días (solo con «Calendario de reservas» encendido; si no, se ignora).
  desde: fechaDia,
  hasta: fechaDia,
  estado: z.enum(['PENDIENTE', 'SENTADA', 'CANCELADA', 'NO_LLEGO']).optional(),
});
const reservaSentar = z.object({ mesaId: idOpc });

// --- Lista de espera ---
const listaEspera = z.object({
  nombre: z.string().trim().min(1, 'Indica el nombre de quien espera.').max(120),
  telefono: z.string().trim().max(40).optional().nullable().transform((v) => v || undefined),
  personas: z.coerce.number({ error: 'Indica cuántas personas.' }).int().min(1, 'Indica cuántas personas.').max(500),
  nota: textoOpc,
});
const listaEsperaUpdate = z.object({ estado: z.enum(['CANCELADO', 'NO_LLEGO'], { error: 'Estado no válido.' }) });
const listaEsperaListQuery = z.object({ estado: z.enum(['ESPERANDO', 'SENTADO', 'CANCELADO', 'NO_LLEGO'], { error: 'Estado no válido.' }).optional() });
const listaEsperaSentar = z.object({ mesaId: idRef });

// --- Bloqueo de mesas ---
const bloqueo = z.object({
  mesaId: idRef,
  desde: z.coerce.date({ error: 'Fecha y hora de inicio inválidas.' }),
  hasta: z.coerce.date({ error: 'Fecha y hora de fin inválidas.' }),
  motivo: z.string().trim().max(200).optional().nullable().transform((v) => v || undefined),
}).refine((d) => d.hasta > d.desde, { message: 'El bloqueo debe terminar después de empezar.', path: ['hasta'] });

// --- Tiempo de ocupación ---
const ocupacionQuery = z.object({ desde: fechaDia, hasta: fechaDia });

// --- Comandas ---
const ESTADOS_COMANDA = ['PENDIENTE', 'LISTA', 'ENTREGADA'];
const comandaListQuery = z.object({
  estacion: z.string().trim().max(30).optional(),
  estado: z.string().regex(/^(PENDIENTE|LISTA|ENTREGADA)(,(PENDIENTE|LISTA|ENTREGADA))*$/, 'Estado no válido.').optional(),
});
const comandaEstado = z.object({ estado: z.enum(ESTADOS_COMANDA, { error: 'Estado no válido.' }) });

module.exports = {
  idParam, mesa, mesaUpdate, mesaConfig, mesaPesos, mesaPlano, cuentaAbrir, cuentaUpdate, cuentaListQuery, itemAgregar, itemEditar, itemAnular,
  cuentaMover, cuentaUnir, cuentaCancelar, reserva, reservaUpdate, reservaListQuery, reservaSentar, cuentaCobrar, comandaListQuery, comandaEstado, ESTADOS_COMANDA,
  listaEspera, listaEsperaUpdate, listaEsperaListQuery, listaEsperaSentar, bloqueo, ocupacionQuery,
};
