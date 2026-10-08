'use strict';

const { Venta, VentaDetalle, Producto, Caja, DevolucionVenta, DevolucionVentaDetalle, Modificador, ModificadorItem } = require('../models');
const { ValidationError } = require('../utils/errors');
const { registrarEgreso, esEfectivo } = require('./cajaService');
const { consumoDeLineaAntigua } = require('./anulacionService');
const {
  EPS, redondear2, redondear3, disponibleParaDevolver, valorDeLinea, repartoDeDinero, reintegro,
} = require('./devolucion');

/**
 * Registra una devolución parcial (o total, por partes) de una venta, dentro de la transacción `t`:
 *   - valida cantidades contra lo vendido y lo ya devuelto;
 *   - devuelve al inventario lo que se pida reingresar (proporcional a lo que se descontó);
 *   - reparte el valor: dinero que vuelve al cliente y/o deuda que se le descuenta (venta a crédito);
 *   - si el dinero sale en efectivo de la caja, registra el egreso DEVOLUCION de la caja abierta de quien devuelve.
 * `items` = [{ ventaDetalleId, cantidad, reingresar }].
 */
async function registrarDevolucion(req, t, ventaId, { items, motivo, reembolso }) {
  const venta = await Venta.findOne({ where: { id: ventaId, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
  if (!venta) return null;
  if (venta.estado === 'ANULADA') throw new ValidationError('Esta venta está anulada: no admite devoluciones.');

  const detalles = await VentaDetalle.findAll({ where: { ventaId: venta.id }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });
  const porId = new Map(detalles.map((d) => [d.id, d]));

  // 1. Validar y valorar cada línea.
  const ids = items.map((i) => i.ventaDetalleId);
  if (new Set(ids).size !== ids.length) throw new ValidationError('Hay líneas repetidas en la devolución.');
  const lineas = items.map((item) => {
    const d = porId.get(item.ventaDetalleId);
    if (!d) throw new ValidationError('Una de las líneas no pertenece a esta venta.');
    const disponible = disponibleParaDevolver(d);
    if (Number(item.cantidad) > disponible + EPS) {
      throw new ValidationError(`Solo se pueden devolver ${disponible} de la línea #${d.id} (ya se devolvió ${Number(d.cantidad_devuelta)} de ${Number(d.cantidad)}).`);
    }
    return { d, cantidad: redondear3(item.cantidad), reingresar: !!item.reingresar, valor: valorDeLinea(d, item.cantidad, venta.descuento_global) };
  });

  // Si con esto queda todo devuelto, el total es exactamente lo que falta (sin desfases de centavos).
  const pendiente = redondear2(Number(venta.total) - Number(venta.total_devuelto));
  const quedaTodoDevuelto = detalles.every((d) => {
    const item = lineas.find((l) => l.d.id === d.id);
    return disponibleParaDevolver(d) - (item ? item.cantidad : 0) <= EPS;
  });
  let total = redondear2(lineas.reduce((a, l) => a + l.valor, 0));
  if (quedaTodoDevuelto) {
    lineas[lineas.length - 1].valor = redondear2(lineas[lineas.length - 1].valor + (pendiente - total));
    total = pendiente;
  }
  if (total > pendiente + 0.005) throw new ValidationError('Lo que se devuelve supera el valor pendiente de la venta.');
  if (!(total > 0)) throw new ValidationError('No hay nada que devolver.');

  // 2. Inventario: lo que se reingresa vuelve en proporción a lo que se descontó (productos, o ingredientes de un plato).
  const devolver = new Map();
  for (const l of lineas) {
    if (!l.reingresar || !l.d.productoId) continue;
    const foto = Array.isArray(l.d.consumo) ? l.d.consumo : await consumoDeLineaAntigua(l.d, req.empresaId, t);
    for (const { productoId, cantidad } of reintegro(foto, l.cantidad, l.d.cantidad)) {
      devolver.set(productoId, redondear3((devolver.get(productoId) || 0) + cantidad));
    }
  }
  if (devolver.size > 0) {
    const productos = await Producto.findAll({
      where: { id: [...devolver.keys()], empresaId: req.empresaId }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE,
    });
    for (const p of productos) {
      await p.update({ stock_actual: redondear3(Number(p.stock_actual) + devolver.get(p.id)) }, { transaction: t });
    }
  }

  // 3. Dinero: a crédito se descuenta primero de la deuda; el resto (o todo, si fue de contado) vuelve al cliente.
  const { credito_reducido: reducido, dinero_devuelto: dinero } = repartoDeDinero({
    total, formaPago: venta.forma_pago, saldoPendiente: venta.saldo_pendiente,
  });
  const conCaja = !!req.empresaModulos?.has('Caja');
  // Por omisión: efectivo de la caja si la venta se cobró en efectivo de contado; si no, por el mismo medio (fuera de caja).
  let via = null;
  if (dinero > 0) {
    via = reembolso || (esEfectivo(venta.forma_pago, venta.medio_pago) ? 'CAJA' : 'OTRO');
    if (via === 'CAJA' && !conCaja) via = 'OTRO'; // sin módulo Caja no hay caja de dónde sacar el efectivo
  }

  const devolucion = await DevolucionVenta.create({
    empresaId: req.empresaId, ventaId: venta.id, usuarioId: req.userId, fecha: new Date(), motivo,
    total, credito_reducido: reducido, dinero_devuelto: dinero, reembolso: via,
  }, { transaction: t });
  await DevolucionVentaDetalle.bulkCreate(
    lineas.map((l) => ({ devolucionId: devolucion.id, ventaDetalleId: l.d.id, cantidad: l.cantidad, valor: l.valor, reingresada: l.reingresar ? l.cantidad : 0 })),
    { transaction: t }
  );
  for (const l of lineas) {
    await l.d.update({
      cantidad_devuelta: redondear3(Number(l.d.cantidad_devuelta) + l.cantidad),
      cantidad_reingresada: redondear3(Number(l.d.cantidad_reingresada) + (l.reingresar ? l.cantidad : 0)),
    }, { transaction: t });
  }
  await venta.update({
    total_devuelto: redondear2(Number(venta.total_devuelto) + total),
    saldo_pendiente: redondear2(Number(venta.saldo_pendiente) - reducido),
  }, { transaction: t });

  let movimiento = null;
  if (via === 'CAJA') {
    const cajaAbierta = await Caja.findOne({ where: { empresaId: req.empresaId, usuarioId: req.userId, estado: 'ABIERTA' }, transaction: t });
    if (!cajaAbierta) throw new ValidationError('Para devolver efectivo debes tener tu caja abierta (o elige devolver por otro medio).');
    movimiento = await registrarEgreso(req, t, {
      tipo: 'DEVOLUCION', concepto: `Devolución de la venta #${venta.id}`, monto: dinero, ventaId: venta.id, devolucionId: devolucion.id,
    });
  }
  return { venta, devolucion, movimiento, lineas };
}

module.exports = { registrarDevolucion };
