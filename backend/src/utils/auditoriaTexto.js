'use strict';

/**
 * Vista GERENCIAL de la auditoría: convierte un evento técnico de `logs_eventos`
 * (nombre de evento + `detalle` JSON) en una frase que entiende un administrador:
 * "Ana Pérez · Registró una venta · Venta #12 por $45.000 a Cliente Test".
 *
 * Solo los eventos listados aquí son "gerenciales" (acciones de negocio). El resto
 * (errores de API, intentos de login fallidos, etc.) es técnico y solo lo ve el
 * súper administrador en el backoffice.
 *
 * Los textos se arman con lo que cada controlador guardó en `detalle`; si falta un
 * nombre (eventos viejos) se cae al número (#id) sin romper.
 */

const cop = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n) || 0);
const num = (n) => Number(n).toLocaleString('es-CO', { maximumFractionDigits: 3 });
const plural = (n, uno, varios) => `${n} ${Number(n) === 1 ? uno : varios}`;

const CATEGORIAS_GASTO = {
  SERVICIOS: 'servicios', ARRIENDO: 'arriendo', NOMINA: 'nómina', MANTENIMIENTO: 'mantenimiento',
  TRANSPORTE: 'transporte', IMPUESTOS: 'impuestos', OTROS: 'otros',
};
const SUSTANTIVO_PRODUCTO = { VENTA: 'producto', INSUMO: 'insumo', PREPARACION: 'preparación', RECETA: 'plato' };
const sustantivo = (d) => SUSTANTIVO_PRODUCTO[d.tipo] || 'producto';
const ref = (nombre, id, prefijo = '#') => (nombre ? `«${nombre}»` : (id != null ? `${prefijo}${id}` : ''));

/** Módulos por los que se puede filtrar la vista (orden = orden del menú del filtro). */
const MODULOS = ['Ventas', 'Cuentas por cobrar', 'Compras', 'Cuentas por pagar', 'Pedidos', 'Inventario', 'Caja', 'Mesas', 'Gastos', 'Clientes', 'Proveedores', 'Servicios', 'Recetas', 'Usuarios'];

const EVENTOS = {
  // Ventas
  venta_creada: {
    modulo: 'Ventas',
    accion: () => 'Registró una venta',
    descripcion: (d) => `Venta #${d.ventaId} por ${cop(d.total)}${d.clienteNombre ? ` a ${d.clienteNombre}` : ''}${d.numItems ? ` (${plural(d.numItems, 'ítem', 'ítems')})` : ''}${d.aCredito ? ` · a crédito (${d.diasCredito} días)` : ''}${d.cuenta ? ` · ${d.cuenta}` : ''}${Number(d.propina) > 0 ? ` · propina ${cop(d.propina)}` : ''}`,
  },
  venta_anulada: {
    modulo: 'Ventas',
    accion: () => 'Anuló una venta',
    descripcion: (d) => `Venta #${d.ventaId} por ${cop(d.total)}${d.clienteNombre ? ` de ${d.clienteNombre}` : ''}${d.motivo ? ` · motivo: ${d.motivo}` : ''}${d.solicitadaPor ? ` · solicitada por ${d.solicitadaPor}` : ''}${d.devolucionDeCaja ? ' · dinero devuelto de la caja' : ''}`,
  },
  venta_devolucion: {
    modulo: 'Ventas',
    accion: () => 'Registró una devolución',
    descripcion: (d) => `${cop(d.total)} de la venta #${d.ventaId}${d.clienteNombre ? ` de ${d.clienteNombre}` : ''}${d.motivo ? ` · motivo: ${d.motivo}` : ''}${Number(d.creditoReducido) > 0 ? ` · ${cop(d.creditoReducido)} menos de deuda` : ''}${Number(d.dineroDevuelto) > 0 ? ` · ${cop(d.dineroDevuelto)} devueltos ${d.reembolso === 'CAJA' ? 'de la caja' : 'por otro medio'}` : ''}`,
  },
  venta_anulacion_solicitada: {
    modulo: 'Ventas',
    accion: () => 'Pidió anular una venta',
    descripcion: (d) => `Venta #${d.ventaId} por ${cop(d.total)}${d.motivo ? ` · motivo: ${d.motivo}` : ''}`,
  },
  venta_anulacion_rechazada: {
    modulo: 'Ventas',
    accion: () => 'Rechazó la anulación de una venta',
    descripcion: (d) => `Venta #${d.ventaId}${d.comentario ? ` · ${d.comentario}` : ''}`,
  },
  // Cartera
  abono_registrado: {
    modulo: 'Cuentas por cobrar',
    accion: () => 'Recibió un abono de un cliente',
    descripcion: (d) => `${cop(d.monto)}${d.clienteNombre ? ` de ${d.clienteNombre}` : ''} a la venta #${d.ventaId}${d.medio_pago === '10' ? ' · en efectivo' : ''} · ${Number(d.saldo) > 0 ? `saldo ${cop(d.saldo)}` : 'quedó pagada'}`,
  },
  abono_anulado: {
    modulo: 'Cuentas por cobrar',
    accion: () => 'Anuló un abono',
    descripcion: (d) => `Abono de ${cop(d.monto)} a la venta #${d.ventaId}`,
  },
  pago_proveedor_registrado: {
    modulo: 'Cuentas por pagar',
    accion: () => 'Pagó a un proveedor',
    descripcion: (d) => `${cop(d.monto)}${d.proveedorNombre ? ` a ${d.proveedorNombre}` : ''} por la compra #${d.compraId}${d.origen === 'CAJA' ? ' · de la caja' : ''} · ${Number(d.saldo) > 0 ? `aún debe ${cop(d.saldo)}` : 'quedó pagada'}`,
  },
  pago_proveedor_anulado: {
    modulo: 'Cuentas por pagar',
    accion: () => 'Anuló un pago a proveedor',
    descripcion: (d) => `Pago de ${cop(d.monto)} de la compra #${d.compraId}`,
  },
  // Compras y pedidos
  compra_creada: {
    modulo: 'Compras',
    accion: () => 'Registró una compra',
    descripcion: (d) => `Compra #${d.compraId} por ${cop(d.total)}${d.proveedorNombre ? ` a ${d.proveedorNombre}` : ''}${d.pagoDesdeCaja ? ' · pagada de la caja' : ''}${d.aCredito ? ` · a crédito (${d.diasCredito} días)` : ''}`,
  },
  pedido_creado: {
    modulo: 'Pedidos',
    accion: () => 'Creó un pedido a proveedor',
    descripcion: (d) => `Pedido #${d.pedidoId} por ${cop(d.total_estimado)} (estimado)${d.proveedorNombre ? ` a ${d.proveedorNombre}` : ''}`,
  },
  pedido_recibido: {
    modulo: 'Pedidos',
    accion: (d) => (d.completo ? 'Recibió un pedido completo' : 'Recibió un pedido parcialmente'),
    descripcion: (d) => `Pedido #${d.pedidoId}${d.proveedorNombre ? ` de ${d.proveedorNombre}` : ''}${d.completo ? '' : ' · falta mercancía por llegar'}`,
  },
  // Inventario
  producto_creado: {
    modulo: 'Inventario',
    accion: (d) => `Creó un ${sustantivo(d)}`,
    descripcion: (d) => `${ref(d.nombre_producto, d.productoId)}${d.codigo ? ` · código ${d.codigo}` : ''}`,
  },
  producto_actualizado: {
    modulo: 'Inventario',
    accion: (d) => `Modificó un ${sustantivo(d)}`,
    descripcion: (d) => `${ref(d.nombre_producto, d.productoId)}${d.codigo ? ` · código ${d.codigo}` : ''}`,
  },
  importacion_productos: {
    modulo: 'Inventario',
    accion: () => 'Importó productos desde Excel',
    descripcion: (d) => `${plural(d.creados || 0, 'nuevo', 'nuevos')}, ${plural(d.actualizados || 0, 'actualizado', 'actualizados')}, ${plural(d.omitidos || 0, 'omitido', 'omitidos')}`,
  },
  ajuste_inventario: {
    modulo: 'Inventario',
    accion: (d) => ({ MERMA: 'Registró una merma', VENCIDO: 'Registró producto vencido', CONSUMO_INTERNO: 'Registró consumo interno' }[d.tipo] || 'Ajustó el inventario'),
    descripcion: (d) => `${ref(d.productoNombre, d.productoId)}${d.cantidad != null ? ` · ${num(d.cantidad)} ${d.unidad || ''}`.trimEnd() : ''} · pérdida ${cop(Math.abs(d.valor))}`,
  },
  conteo_fisico: {
    modulo: 'Inventario',
    accion: () => 'Hizo un conteo físico de inventario',
    descripcion: (d) => `${plural(d.ajustados || 0, 'producto ajustado', 'productos ajustados')}, ${d.sinCambio || 0} sin diferencia · diferencia valorizada ${cop(d.valor)}`,
  },
  produccion_registrada: {
    modulo: 'Recetas',
    accion: () => 'Registró una producción por lotes',
    descripcion: (d) => `${num(d.cantidad)}${d.unidad ? ` ${d.unidad}` : ''} de ${ref(d.productoNombre, d.productoId)}`,
  },
  produccion_anulada: {
    modulo: 'Recetas',
    accion: () => 'Anuló una producción por lotes',
    descripcion: (d) => `${num(d.cantidad)}${d.unidad ? ` ${d.unidad}` : ''} de ${ref(d.productoNombre, d.productoId)}`,
  },
  desviacion_alerta: {
    modulo: 'Inventario',
    accion: () => 'Alerta: faltante de inventario sobre el límite',
    descripcion: (d) => `${ref(d.productoNombre, d.productoId)} · faltaron ${num(d.faltante)}${d.unidad ? ` ${d.unidad}` : ''} (${num(d.pct)} % de lo que debió gastarse; límite ${num(d.umbral)} %)`,
  },
  desviacion_contacto: { modulo: 'Inventario', accion: () => 'Cambió a quién se avisa de las alertas de desviación', descripcion: (d) => [d.whatsapp ? 'WhatsApp' : null, d.correo ? 'correo' : null].filter(Boolean).join(' y ') || 'Sin contactos' },
  desviacion_umbral: {
    modulo: 'Inventario',
    accion: () => 'Cambió el límite de alerta de desviaciones',
    descripcion: (d) => `Ahora ${num(d.pct)} %`,
  },
  // Caja
  caja_abierta: {
    modulo: 'Caja',
    accion: () => 'Abrió caja',
    descripcion: (d) => `Caja #${d.cajaId} con base de ${cop(d.monto_inicial)}`,
  },
  caja_cerrada: {
    modulo: 'Caja',
    accion: () => 'Cerró caja',
    descripcion: (d) => {
      const dif = Number(d.diferencia) || 0;
      return `Caja #${d.cajaId} · vendió ${cop(d.total_ventas)}${d.total_egresos ? ` · egresos ${cop(d.total_egresos)}` : ''} · ${dif === 0 ? 'cuadró exacto' : `${dif < 0 ? 'faltaron' : 'sobraron'} ${cop(Math.abs(dif))}`}`;
    },
  },
  caja_retiro: {
    modulo: 'Caja',
    accion: () => 'Sacó dinero de la caja',
    descripcion: (d) => `${cop(d.monto)}${d.concepto ? ` · ${d.concepto}` : ''}`,
  },
  caja_propinas: {
    modulo: 'Caja',
    accion: () => 'Entregó las propinas al personal',
    descripcion: (d) => `${cop(d.monto)}${d.concepto ? ` · ${d.concepto}` : ''}${d.repartidas ? ` · repartidas entre ${plural(d.repartidas, 'persona', 'personas')}` : ''}`,
  },
  // Mesas y cocina
  comanda_enviada: {
    modulo: 'Mesas',
    accion: () => 'Envió una comanda a cocina',
    descripcion: (d) => `${d.cuenta || `Cuenta #${d.cuentaId}`} · comanda #${d.comandaId}${d.estacion ? ` (${d.estacion})` : ''} · ${plural(d.numItems || 0, 'ítem', 'ítems')}`,
  },
  cuenta_item_anulado: {
    modulo: 'Mesas',
    accion: (d) => (d.enviado ? 'Anuló un pedido ya enviado a cocina' : 'Anuló un pedido'),
    descripcion: (d) => `${d.cuenta || `Cuenta #${d.cuentaId}`} · ${d.cantidad != null ? `${num(d.cantidad)} × ` : ''}${d.item || 'ítem'}${d.motivo ? ` · motivo: ${d.motivo}` : ''}`,
  },
  cuenta_cancelada: {
    modulo: 'Mesas',
    accion: () => 'Canceló una cuenta',
    descripcion: (d) => `${d.cuenta || `Cuenta #${d.cuentaId}`}${d.numItems ? ` · ${plural(d.numItems, 'ítem', 'ítems')}${d.enviados ? ` (${d.enviados} ya enviados a cocina)` : ''}` : ''}${d.motivo ? ` · motivo: ${d.motivo}` : ''}`,
  },
  cuentas_unidas: {
    modulo: 'Mesas',
    accion: () => 'Unió dos cuentas',
    descripcion: (d) => `${d.origen} pasó a ${d.destino} (${plural(d.numItems || 0, 'ítem', 'ítems')})`,
  },
  reserva_creada: {
    modulo: 'Mesas',
    accion: () => 'Registró una reserva',
    descripcion: (d) => `${d.nombre} · ${plural(d.personas || 0, 'persona', 'personas')}${d.mesa ? ` · ${d.mesa}` : ''}${d.fecha ? ` · ${d.fecha}` : ''}`,
  },
  reserva_actualizada: {
    modulo: 'Mesas',
    accion: (d) => (d.estado === 'CANCELADA' ? 'Canceló una reserva' : d.estado === 'NO_LLEGO' ? 'Marcó una reserva como «no llegó»' : d.estado === 'SENTADA' ? 'Sentó una reserva' : 'Modificó una reserva'),
    descripcion: (d) => `${d.nombre}${d.mesa ? ` · ${d.mesa}` : ''}`,
  },
  cuenta_movida: {
    modulo: 'Mesas',
    accion: () => 'Cambió una cuenta de mesa',
    descripcion: (d) => `De ${d.desde} a ${d.hacia}`,
  },
  propina_sugerida_cambiada: { modulo: 'Mesas', accion: () => 'Cambió la propina sugerida', descripcion: (d) => (Number(d.pct) > 0 ? `Ahora ${num(d.pct)} %` : 'Ya no se sugiere propina') },
  opciones_cambiadas: {
    modulo: 'Mesas',
    accion: (d) => (d.perfil ? 'Aplicó un perfil de opciones' : 'Cambió las opciones del restaurante'),
    descripcion: (d) => [d.perfil ? `perfil «${d.perfil}»` : null, d.activadas ? `activó: ${d.activadas}` : null, d.desactivadas ? `apagó: ${d.desactivadas}` : null, d.ajustadas ? `ajustó: ${d.ajustadas}` : null].filter(Boolean).join(' · ') || 'Sin cambios',
  },
  estaciones_cambiadas: { modulo: 'Mesas', accion: () => 'Cambió las estaciones de preparación', descripcion: (d) => d.estaciones },
  propina_pesos_cambiados: { modulo: 'Mesas', accion: () => 'Cambió el reparto de propinas', descripcion: (d) => `Pesos de ${plural(d.personas || 0, 'persona', 'personas')}` },
  plano_actualizado: { modulo: 'Mesas', accion: () => 'Acomodó el plano del local', descripcion: (d) => plural(d.mesas || 0, 'mesa', 'mesas') },
  mesa_creada: { modulo: 'Mesas', accion: () => 'Creó una mesa', descripcion: (d) => ref(d.nombre, d.mesaId) },
  mesa_actualizada: { modulo: 'Mesas', accion: (d) => (d.activa === false ? 'Desactivó una mesa' : 'Modificó una mesa'), descripcion: (d) => ref(d.nombre, d.mesaId) },
  // Gastos
  gasto_creado: {
    modulo: 'Gastos',
    accion: () => 'Registró un gasto',
    descripcion: (d) => `${d.descripcion || `Gasto #${d.gastoId}`} por ${cop(d.monto)}${d.categoria ? ` (${CATEGORIAS_GASTO[d.categoria] || d.categoria})` : ''} · ${d.origen_pago === 'CAJA' ? 'pagado de la caja' : 'pagado por otro medio'}`,
  },
  gasto_anulado: {
    modulo: 'Gastos',
    accion: () => 'Anuló un gasto',
    descripcion: (d) => `${d.descripcion || `Gasto #${d.gastoId}`}${d.monto != null ? ` por ${cop(d.monto)}` : ''}`,
  },
  // Terceros y catálogo
  cliente_creado: { modulo: 'Clientes', accion: () => 'Creó un cliente', descripcion: (d) => ref(d.nombre, d.id) },
  cliente_actualizado: { modulo: 'Clientes', accion: () => 'Modificó un cliente', descripcion: (d) => ref(d.nombre, d.id) },
  proveedor_creado: { modulo: 'Proveedores', accion: () => 'Creó un proveedor', descripcion: (d) => ref(d.nombre, d.id) },
  proveedor_actualizado: { modulo: 'Proveedores', accion: () => 'Modificó un proveedor', descripcion: (d) => ref(d.nombre, d.id) },
  servicio_creado: { modulo: 'Servicios', accion: () => 'Creó un servicio', descripcion: (d) => ref(d.nombre, d.id) },
  servicio_actualizado: { modulo: 'Servicios', accion: () => 'Modificó un servicio', descripcion: (d) => ref(d.nombre, d.id) },
  modificador_creado: { modulo: 'Recetas', accion: () => 'Creó un modificador de platos', descripcion: (d) => ref(d.nombre, d.modificadorId) },
  modificador_actualizado: { modulo: 'Recetas', accion: () => 'Modificó un modificador de platos', descripcion: (d) => ref(d.nombre, d.modificadorId) },
  // Personal
  usuario_creado: {
    modulo: 'Usuarios',
    accion: () => 'Creó un usuario',
    descripcion: (d) => `${d.nombre ? `${d.nombre} ` : ''}(@${d.username})${d.rol ? ` · rol: ${d.rol}` : ''}`.trim(),
  },
  usuario_actualizado: {
    modulo: 'Usuarios',
    accion: () => 'Modificó un usuario',
    descripcion: (d) => `${d.nombre ? `${d.nombre} ` : ''}(@${d.username})${d.rol ? ` · rol: ${d.rol}` : ''}`.trim(),
  },
  rol_creado: { modulo: 'Usuarios', accion: () => 'Creó un rol', descripcion: (d) => `${ref(d.nombre, d.rolId)} · ${plural(d.numPermisos, 'permiso', 'permisos')}` },
  rol_actualizado: { modulo: 'Usuarios', accion: () => 'Modificó un rol', descripcion: (d) => `${ref(d.nombre, d.rolId)} · ${plural(d.numPermisos, 'permiso', 'permisos')}` },
  rol_eliminado: { modulo: 'Usuarios', accion: () => 'Eliminó un rol', descripcion: (d) => ref(d.nombre, d.rolId) },
};

/** Nombres de evento que entran en la vista gerencial. */
const EVENTOS_GERENCIALES = Object.keys(EVENTOS);

/** Nombres de evento de un módulo (para filtrar por módulo en la consulta). */
const eventosDeModulo = (modulo) => Object.entries(EVENTOS).filter(([, v]) => v.modulo === modulo).map(([k]) => k);

/** { modulo, accion, descripcion } para un evento; null si no es gerencial. */
function describirEvento(evento, detalle) {
  const def = EVENTOS[evento];
  if (!def) return null;
  const d = detalle || {};
  let descripcion;
  try {
    descripcion = def.descripcion(d);
  } catch {
    descripcion = '';
  }
  return { modulo: def.modulo, accion: def.accion(d), descripcion };
}

module.exports = { describirEvento, EVENTOS_GERENCIALES, eventosDeModulo, MODULOS, cop };
