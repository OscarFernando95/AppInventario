'use strict';

/** Redondeo a 2 decimales, estable frente al ruido de coma flotante. */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Calcula los importes de una venta (modo POS: el precio unitario YA incluye IVA).
 * Función pura — no toca la base de datos.
 *
 * @param {{productoId?, servicioId?, cantidad:number, precioConIva:number,
 *          porcentajeIva:number, precioBase?:number}[]} lineas
 * @param {number} [descuentoGlobal=0]
 * @returns {{subtotal_bruto:number, total_impuestos:number, descuento_global:number,
 *           total:number, detalles:object[]}}
 */
function calcularVenta(lineas, descuentoGlobal = 0) {
  let subtotalBruto = 0;
  let totalImpuestos = 0;

  const detalles = lineas.map((l) => {
    const cantidad = Number(l.cantidad);
    const precioConIva = Number(l.precioConIva);
    const iva = Number(l.porcentajeIva || 0);

    const precioSinIva = precioConIva / (1 + iva / 100);
    const subtotalLinea = precioSinIva * cantidad;
    const totalLineaConIva = precioConIva * cantidad;
    const ivaLinea = totalLineaConIva - subtotalLinea;

    subtotalBruto += subtotalLinea;
    totalImpuestos += ivaLinea;

    return {
      productoId: l.productoId || null,
      servicioId: l.servicioId || null,
      cantidad,
      precio_unitario: precioConIva,
      precio_base: l.precioBase || precioConIva,
      porcentaje_iva: iva,
      valor_iva: ivaLinea,
      subtotal_bruto: subtotalLinea,
    };
  });

  const descuento = round2(Math.max(0, Number(descuentoGlobal) || 0));
  const total = round2(subtotalBruto + totalImpuestos - descuento);

  return {
    subtotal_bruto: round2(subtotalBruto),
    total_impuestos: round2(totalImpuestos),
    descuento_global: descuento,
    total,
    detalles,
  };
}

/** Total de una compra: suma de cantidad * costo unitario. Pura. */
function calcularTotalCompra(lineas) {
  return round2(
    lineas.reduce((acc, l) => acc + Number(l.cantidad) * Number(l.costoUnitario), 0)
  );
}

module.exports = { round2, calcularVenta, calcularTotalCompra };
