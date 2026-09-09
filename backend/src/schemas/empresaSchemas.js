'use strict';

const { z, nombre, textoOpc, emailOpc, enteroOpc } = require('./common');

const base = z.object({
  nombre,
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
  modulosIds: z.array(z.coerce.number().int().positive()).optional(),
});

const empresaCreate = base;
const empresaUpdate = base.partial().extend({ activa: z.boolean().optional() });

module.exports = { empresaCreate, empresaUpdate };
