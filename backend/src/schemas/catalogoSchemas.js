'use strict';

const { z, nombre, textoOpc, emailOpc, dinero } = require('./common');

const porcentajeIva = z.coerce.number().min(0).max(100).optional();

const producto = z.object({
  codigo: z.string().trim().min(1).max(100),
  nombre_producto: nombre,
  descripcion: textoOpc,
  stock_actual: z.coerce.number().int().min(0).optional(),
  precio_unitario: dinero,
  porcentaje_iva: porcentajeIva,
  unidad_medida: z.string().trim().max(20).optional(),
  codigo_estandar: textoOpc,
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
