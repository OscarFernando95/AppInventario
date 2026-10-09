'use strict';

const { z, nombre, textoOpc, emailOpc, dinero, idRef } = require('./common');
const { TIPOS_PRODUCTO } = require('../services/recetas');

const porcentajeIva = z.coerce.number().min(0).max(100).optional();

// Stock / cantidades de receta: admiten fracciones (g, ml, kg, litros) hasta 3
// decimales (columna DECIMAL(12,3)).
const redondear3 = (n) => Math.round(n * 1000) / 1000;
const stockInicial = z.coerce.number().min(0).max(9_999_999).transform(redondear3);
const cantidadReceta = z.coerce.number().positive().max(9_999_999).transform(redondear3);

const recetaItem = z.object({ insumoId: idRef, cantidad: cantidadReceta });

const producto = z.object({
  codigo: z.string().trim().min(1).max(100),
  nombre_producto: nombre,
  descripcion: textoOpc,
  stock_actual: stockInicial.optional(),
  precio_unitario: dinero,
  porcentaje_iva: porcentajeIva,
  unidad_medida: z.string().trim().max(20).optional(),
  codigo_estandar: textoOpc,
  // Stock mínimo (0 = sin alerta) y "reponer hasta" (null = el doble del mínimo). Valen para todos los
  // tipos: en un plato son porciones; en una preparación, unidades producibles.
  stock_minimo: stockInicial.optional(),
  stock_objetivo: z.preprocess((v) => (v === '' ? null : v), stockInicial.nullish()),
  // Costo por unidad base (insumos y productos de venta); las compras lo
  // recalculan como promedio ponderado. Hasta 4 decimales (gramos baratos).
  costo_promedio: z.coerce.number().min(0).max(99_999_999).transform((n) => Math.round(n * 10000) / 10000).optional(),
  // Presentación de compra: "1 <unidad_compra> = <factor_compra> unidades base".
  // '' / null la quita (y deja el factor en 1).
  unidad_compra: z.string().trim().max(30).nullish().transform((v) => (v === undefined ? undefined : (v || null))),
  factor_compra: z.coerce.number().positive().max(99_999_999).transform((n) => Math.round(n * 1e6) / 1e6).optional(),
  // Solo preparaciones: cuánto produce la receta (en la unidad del producto).
  rendimiento: cantidadReceta.optional(),
  // Solo preparaciones: con stock propio, se producen por lotes (módulo Recetas, «Producción»).
  por_lotes: z.boolean().optional(),
  // Solo preparaciones por lotes: días que dura un lote (vacío/null = no vence).
  vida_util_dias: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(1).max(3650).nullish()),
  // VENTA (por defecto) | INSUMO | PREPARACION | RECETA. Distinto de VENTA exige el módulo Recetas.
  tipo: z.enum(TIPOS_PRODUCTO, { error: 'Tipo de producto no válido.' }).optional(),
  // Ingredientes de un plato o preparación (solo con tipo RECETA / PREPARACION).
  receta: z.array(recetaItem).max(60).optional(),
});
// En update no se toca el stock (lo mueven compras/ventas).
const productoUpdate = producto.partial().omit({ stock_actual: true });

const proveedor = z.object({
  nombre,
  nit: z.string().trim().min(1).max(50),
  contacto: textoOpc,
  telefono: textoOpc,
  email: emailOpc,
  direccion: textoOpc,
  departamento_dane: z.string().trim().max(2).optional(),
  municipio_dane: z.string().trim().max(5).optional(),
});
const proveedorUpdate = proveedor.partial();

const cliente = z.object({
  nombre,
  documento: textoOpc,
  email: emailOpc,
  telefono: textoOpc,
  direccion: textoOpc,
  tipo_documento: z.string().trim().max(5).optional(),
  // Tope de deuda en ventas a crédito (vacío = sin tope).
  cupo_credito: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().min(0).max(99_999_999_999).nullish()),
  dv: z.string().trim().max(1).optional(),
  tipo_persona: z.string().trim().max(1).optional(),
  regimen_fiscal: z.string().trim().max(20).optional(),
  municipio_dane: z.string().trim().max(5).optional(),
  departamento_dane: z.string().trim().max(2).optional(),
});
const clienteUpdate = cliente.partial();

const servicio = z.object({
  nombre,
  descripcion: textoOpc,
  precio: dinero,
  porcentaje_iva: porcentajeIva,
  unidad_medida: z.string().trim().max(20).optional(),
  codigo_estandar: textoOpc,
});
const servicioUpdate = servicio.partial();

// Opciones de conflicto para la importación masiva de productos (multipart:
// llegan como campos de texto junto al archivo, por eso no hay coerción de
// tipos más allá del enum).
const importarProductosOpciones = z.object({
  modoCantidad: z.enum(['sumar', 'reemplazar']),
  modoPrecio: z.enum(['conservar', 'actualizar']),
});

module.exports = {
  producto, productoUpdate,
  proveedor, proveedorUpdate,
  cliente, clienteUpdate,
  servicio, servicioUpdate,
  importarProductosOpciones,
};
