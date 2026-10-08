'use strict';

/** Redondeo a 2 decimales, estable frente al ruido de coma flotante. */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const clampPct = (n) => Math.min(100, Math.max(0, Number(n) || 0));

/**
 * Calcula los importes de una venta (modo POS: el precio unitario YA incluye IVA).
 * Función pura — no toca la base de datos.
 *
 * `descuentoGlobalPct` es un **porcentaje 0–100** (así lo maneja la UI y el PDF).
 * `precioBase` de cada línea es el precio de lista (viene de la BD, no del
 * cliente); la diferencia `precioBase - precioConIva` es el descuento por línea.
 *
 * @param {{productoId?, servicioId?, cantidad:number, precioConIva:number,
 *          porcentajeIva:number, precioBase:number}[]} lineas
 * @param {number} [descuentoGlobalPct=0]
 * @returns {{subtotal_bruto:number, total_impuestos:number, descuento_global:number,
 *           total_descuentos:number, total:number, detalles:object[]}}
 */
function calcularVenta(lineas, descuentoGlobalPct = 0) {
  let subtotalBruto = 0;
  let totalImpuestos = 0;
  let descuentoItems = 0;

  const detalles = lineas.map((l) => {
    const cantidad = Number(l.cantidad);
    const precioConIva = Number(l.precioConIva);
    const precioBase = Number(l.precioBase ?? l.precioConIva);
    const iva = Number(l.porcentajeIva || 0);

    const precioSinIva = precioConIva / (1 + iva / 100);
    const subtotalLinea = precioSinIva * cantidad;
    const totalLineaConIva = precioConIva * cantidad;
    const ivaLinea = totalLineaConIva - subtotalLinea;

    subtotalBruto += subtotalLinea;
    totalImpuestos += ivaLinea;
    descuentoItems += Math.max(0, precioBase - precioConIva) * cantidad;

    return {
      productoId: l.productoId || null,
      servicioId: l.servicioId || null,
      cantidad,
      precio_unitario: precioConIva,
      precio_base: precioBase,
      porcentaje_iva: iva,
      valor_iva: ivaLinea,
      subtotal_bruto: subtotalLinea,
      costo_unitario: Number(l.costoUnitario || 0),
      consumo: l.consumo && l.consumo.length ? l.consumo : null,
      modificadores: l.modificadores && l.modificadores.length ? l.modificadores : null,
    };
  });

  const pct = clampPct(descuentoGlobalPct);
  const totalConIva = subtotalBruto + totalImpuestos;
  const descuentoGlobalMonto = round2(totalConIva * (pct / 100));

  return {
    subtotal_bruto: round2(subtotalBruto),
    total_impuestos: round2(totalImpuestos),
    descuento_global: pct, // porcentaje 0–100
    total_descuentos: round2(descuentoItems + descuentoGlobalMonto),
    total: round2(totalConIva - descuentoGlobalMonto),
    detalles,
  };
}

/** Total de una compra: suma de cantidad * costo unitario. Pura. */
function calcularTotalCompra(lineas) {
  return round2(
    lineas.reduce((acc, l) => acc + Number(l.cantidad) * Number(l.costoUnitario), 0)
  );
}

module.exports = { round2, clampPct, calcularVenta, calcularTotalCompra };
