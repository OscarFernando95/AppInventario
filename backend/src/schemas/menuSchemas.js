'use strict';

const { z, idRef } = require('./common');

const redondear2 = (n) => Math.round(n * 100) / 100;
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM).');

const categoria = z.object({
  nombre: z.string().trim().min(1, 'Indica el nombre de la categoría.').max(60),
  orden: z.coerce.number().int().min(0).max(9999).optional(),
  activa: z.boolean().optional(),
});
const categoriaUpdate = categoria.partial();
const categoriasOrden = z.object({ ids: z.array(idRef).min(1).max(200) });

const agotado = z.object({ agotado: z.boolean() });

const idsOpc = z.array(idRef).max(500).optional();
const precioHorarioBase = z.object({
  nombre: z.string().trim().min(1, 'Indica el nombre de la oferta.').max(80),
  tipo: z.enum(['PORCENTAJE', 'PRECIO_FIJO'], { error: 'Tipo de oferta no válido.' }),
  valor: z.coerce.number().min(0).max(99_999_999).transform(redondear2),
  dias: z.array(z.coerce.number().int().min(0).max(6)).min(1, 'Elige al menos un día.').max(7)
    .transform((d) => [...new Set(d)].sort((a, b) => a - b)),
  hora_inicio: hora,
  hora_fin: hora,
  producto_ids: idsOpc,
  categoria_ids: idsOpc,
  activo: z.boolean().optional(),
});
const reglasDeOferta = (esquema) => esquema.refine((d) => d.tipo !== 'PORCENTAJE' || (d.valor > 0 && d.valor <= 100), { message: 'El descuento debe estar entre 0 y 100 %.', path: ['valor'] })
  .refine((d) => d.hora_inicio !== d.hora_fin, { message: 'La hora de inicio y la de fin no pueden ser iguales.', path: ['hora_fin'] });
const precioHorario = reglasDeOferta(precioHorarioBase);
// En una edición puede llegar solo un campo (p. ej. apagar la oferta): el controlador valida la oferta completa ya mezclada.
const precioHorarioUpdate = precioHorarioBase.partial();

module.exports = { categoria, categoriaUpdate, categoriasOrden, agotado, precioHorario, precioHorarioUpdate };
