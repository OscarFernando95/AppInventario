'use strict';

const { z, idRef, textoOpc } = require('./common');

const redondear3 = (n) => Math.round(n * 1000) / 1000;
const cantidadPositiva = z.coerce.number().positive().max(9_999_999).transform(redondear3);
const cantidadConSigno = z.coerce
  .number()
  .min(-9_999_999)
  .max(9_999_999)
  .transform(redondear3)
  .refine((n) => n !== 0, 'La cantidad no puede ser 0.');
const fechaDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD).').optional();

// --- Ajustes de inventario ---
const TIPOS_SALIDA = ['MERMA', 'VENCIDO', 'CONSUMO_INTERNO'];

const ajusteSalida = z.object({
  productoId: idRef,
  tipo: z.enum(TIPOS_SALIDA, { error: 'Tipo de ajuste no válido.' }),
  cantidad: cantidadPositiva,
  motivo: textoOpc,
});

const conteoFisico = z.object({
  items: z.array(z.object({
    productoId: idRef,
    cantidad_contada: z.coerce.number().min(0).max(9_999_999).transform(redondear3),
  })).min(1).max(500),
  motivo: textoOpc,
});

const ajusteListQuery = z.object({
  tipo: z.enum([...TIPOS_SALIDA, 'CONTEO']).optional(),
  productoId: z.preprocess((v) => (v === '' ? undefined : v), idRef.optional()),
  desde: fechaDia,
  hasta: fechaDia,
  limit: z.any().optional(),
  offset: z.any().optional(),
});

const rangoQuery = z.object({ desde: fechaDia, hasta: fechaDia });

// Informe de desviaciones: por rango de fechas (por omisión) o «entre conteos».
const desviacionesQuery = z.object({ desde: fechaDia, hasta: fechaDia, modo: z.enum(['rango', 'conteos']).optional() });
const umbralDesviacion = z.object({ desviacion_alerta_pct: z.coerce.number().min(0).max(100).transform((n) => Math.round(n * 100) / 100) });

// --- Producción de preparaciones por lotes ---
const produccionCreate = z.object({
  productoId: idRef,
  cantidad: cantidadPositiva,
  motivo: textoOpc,
});

const produccionListQuery = z.object({
  productoId: z.preprocess((v) => (v === '' ? undefined : v), idRef.optional()),
  estado: z.enum(['ACTIVA', 'ANULADA']).optional(),
  desde: fechaDia,
  hasta: fechaDia,
  limit: z.any().optional(),
  offset: z.any().optional(),
});

const sugerenciasQuery = z.object({
  // Días de ventas que se promedian y días que se quiere tener cubiertos.
  dias: z.coerce.number().int().min(1).max(90).optional().default(14),
  cobertura: z.coerce.number().min(0.25).max(30).optional().default(1),
});

// --- Modificadores ---
const modificadorItem = z.object({ insumoId: idRef, cantidad: cantidadConSigno });

const modificador = z.object({
  nombre: z.string().trim().min(1).max(100),
  precio_extra: z.coerce.number().min(0).max(99_999_999).transform((n) => Math.round(n * 100) / 100).optional(),
  activo: z.boolean().optional(),
  // Con signo: positiva agrega ingrediente ("extra shot"), negativa lo quita ("sin azúcar").
  items: z.array(modificadorItem).max(30).optional(),
});
const modificadorUpdate = modificador.partial();

module.exports = {
  TIPOS_SALIDA, ajusteSalida, conteoFisico, ajusteListQuery, rangoQuery, desviacionesQuery, umbralDesviacion, produccionCreate, produccionListQuery, sugerenciasQuery, modificador, modificadorUpdate,
};
