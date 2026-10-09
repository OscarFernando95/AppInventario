/**
 * Avisos por WhatsApp y correo SIN servicio externo: se arma el enlace (wa.me / mailto) y la persona solo
 * pulsa «Enviar» en su propia aplicación. Sirve para recordar una reserva o avisar de una alerta.
 */

/** Deja solo dígitos; un celular colombiano de 10 dígitos que empieza por 3 lleva el prefijo 57. */
export function normalizarTelefonoCO(telefono) {
  const digitos = String(telefono ?? '').replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.length === 10 && digitos.startsWith('3')) return `57${digitos}`;
  return digitos.replace(/^00/, '');
}

/** Enlace de WhatsApp con el mensaje escrito; '' si no hay teléfono. */
export function enlaceWhatsApp(telefono, texto) {
  const numero = normalizarTelefonoCO(telefono);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : '';
}

/** Enlace mailto con asunto y cuerpo; '' si no hay correo. */
export function enlaceCorreo(correo, asunto, texto) {
  return correo ? `mailto:${correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}` : '';
}

/** Mensaje de recordatorio de una reserva. */
export function mensajeReserva({ nombre, fecha_hora: fecha, personas, mesa }, empresa) {
  const d = new Date(fecha);
  const dia = d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  const hora = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return `Hola ${nombre}, te recordamos tu reserva en ${empresa}: ${dia} a las ${hora} para ${personas} ${Number(personas) === 1 ? 'persona' : 'personas'}${mesa ? ` (${mesa})` : ''}. ¡Te esperamos! Si no puedes venir, avísanos por este medio.`;
}

/** Mensaje con las alertas de desviación (faltantes sobre el límite) de un conteo. */
export function mensajeAlertas(alertas, empresa, umbral) {
  const lineas = alertas.map((a) => `• ${a.nombre_producto}: faltaron ${a.faltante} (${a.desviacion_pct} % de lo que debía gastarse)`);
  return `Alerta de inventario en ${empresa}: faltantes por encima del ${umbral} %.\n${lineas.join('\n')}`;
}
