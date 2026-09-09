'use strict';

const { z, textoOpc, emailOpc, enteroOpc } = require('./common');

const base = z.object({
  nombre: z.string({ error: 'El nombre de la empresa es obligatorio.' }).trim().min(1, 'El nombre de la empresa es obligatorio.').max(255),
  nit: textoOpc,
  contacto: textoOpc,
  dv: z.string().trim().max(1).optional(),
  tipo_persona: z.string().trim().max(1).optional(),
  regimen_fiscal: z.string().trim().max(20).optional(),
  direccion_fisica: textoOpc,
  municipio_dane: z.string().trim().max(5).optional(),
  departamento_dane: z.string().trim().max(2).optional(),
  codigo_ciiu: textoOpc,
  email_facturacion: emailOpc,
  resolucion_numero: textoOpc,
  prefijo_facturacion: textoOpc,
  rango_desde: enteroOpc,
  rango_hasta: enteroOpc,
  fecha_vigencia_desde: z.string().trim().optional().transform((v) => v || undefined),
  fecha_vigencia_hasta: z.string().trim().optional().transform((v) => v || undefined),
  clave_tecnica: textoOpc,
  tipo_empresa: z.enum(['SIMPLE', 'FACTURACION_ELECTRONICA'], { error: 'Tipo de empresa no válido.' }).optional(),
  modulosIds: z.array(z.coerce.number().int().positive()).optional(),
});

// Una empresa de FACTURACION_ELECTRONICA necesita los datos de la resolución DIAN.
const DIAN_REQUERIDOS = ['resolucion_numero', 'prefijo_facturacion', 'rango_desde', 'rango_hasta', 'clave_tecnica'];
const exigirDatosDian = (val, ctx) => {
  if (val.tipo_empresa !== 'FACTURACION_ELECTRONICA') return;
  for (const campo of DIAN_REQUERIDOS) {
    if (val[campo] === undefined || val[campo] === null || val[campo] === '') {
      ctx.addIssue({ code: 'custom', path: [campo], message: `Requerido para facturación electrónica.` });
    }
  }
};

const empresaCreate = base.superRefine(exigirDatosDian);
// En update no se re-valida (la empresa puede completar los datos en otra edición).
const empresaUpdate = base.partial().extend({ activa: z.boolean().optional() });

module.exports = { empresaCreate, empresaUpdate };
