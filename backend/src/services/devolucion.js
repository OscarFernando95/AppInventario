'use strict';

/**
 * Devolución parcial de ventas: cálculos puros (sin base de datos).
 */

const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const redondear3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const EPS = 0.0005;

/** Unidades que aún se pueden devolver de una línea de venta. */
const disponibleParaDevolver = (detalle) => redondear3(Number(detalle.cantidad) - Number(detalle.cantidad_devuelta || 0));

/**
 * Valor de devolver `cantidad` unidades de una línea. El precio de la línea ya trae su descuento y su IVA;
 * el descuento GLOBAL de la venta (%) se prorratea, para devolver lo que realmente pagó el cliente.
 */
function valorDeLinea(detalle, cantidad, descuentoGlobalPct = 0) {
  return redondear2(Number(cantidad) * Number(detalle.precio_unitario) * (1 - Number(descuentoGlobalPct || 0) / 100));
}

/**
 * Qué pasa con el valor devuelto según cómo se vendió:
 *   - Contado: todo es dinero que vuelve al cliente.
 *   - Crédito: primero se descuenta de lo que el cliente aún debe; solo lo que sobra (ya había pagado)
 *     es dinero que hay que devolverle.
 */
function repartoDeDinero({ total, formaPago, saldoPendiente }) {
  if (String(formaPago) !== '2') return { credito_reducido: 0, dinero_devuelto: redondear2(total) };
  const reducido = redondear2(Math.min(Number(saldoPendiente), Number(total)));
  return { credito_reducido: reducido, dinero_devuelto: redondear2(Number(total) - reducido) };
}

/**
 * Inventario que vuelve al reingresar `cantidadDevuelta` de las `cantidadVendida` de una línea:
 * lo que se descontó (foto `consumo`) en proporción. Devuelve [{ productoId, cantidad }].
 */
function reintegro(consumo, cantidadDevuelta, cantidadVendida) {
  const proporcion = Number(cantidadDevuelta) / Number(cantidadVendida);
  return (consumo || [])
    .map((c) => ({ productoId: c.productoId, cantidad: redondear3(Number(c.cantidad) * proporcion) }))
    .filter((c) => c.cantidad > 0);
}

/** NINGUNA · PARCIAL · TOTAL, según lo devuelto frente al total de la venta. */
function estadoDevolucion(venta) {
  const devuelto = Number(venta.total_devuelto || 0);
  if (devuelto <= 0.005) return 'NINGUNA';
  return devuelto >= Number(venta.total) - 0.005 ? 'TOTAL' : 'PARCIAL';
}

module.exports = { EPS, redondear2, redondear3, disponibleParaDevolver, valorDeLinea, repartoDeDinero, reintegro, estadoDevolucion };
