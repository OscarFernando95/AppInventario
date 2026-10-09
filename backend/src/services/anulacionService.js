'use strict';

const { Venta, VentaDetalle, Producto, Caja, Modificador, ModificadorItem, AbonoVenta } = require('../models');
const { ValidationError } = require('../utils/errors');
const { consumoConModificadores, redondear3 } = require('./recetas');
const { cargarRecetas } = require('./recetasDb');
const { registrarEgreso, esEfectivo } = require('./cajaService');

/**
 * Inventario que descontó una línea de venta ANTERIOR a que se guardara la foto del consumo:
 * se recalcula con los datos de hoy (mejor esfuerzo; las ventas nuevas guardan el consumo exacto).
 */
async function consumoDeLineaAntigua(detalle, empresaId, t) {
  if (!detalle.productoId) return []; // servicio: no mueve inventario
  const producto = await Producto.findOne({ where: { id: detalle.productoId, empresaId }, transaction: t });
  if (!producto) return [];
  const cantidad = Number(detalle.cantidad);
  if (producto.tipo !== 'RECETA') return [{ productoId: producto.id, cantidad }];

  const recetas = await cargarRecetas(empresaId, { transaction: t });
  const ids = (detalle.modificadores || []).map((m) => m.id);
  const mods = ids.length
    ? await Modificador.findAll({ where: { id: ids, empresaId }, include: [{ model: ModificadorItem, as: 'items' }], transaction: t })
    : [];
  const porPorcion = consumoConModificadores(
    producto.id, recetas,
    mods.map((m) => ({ items: m.items.map((i) => ({ insumoId: i.insumoId, cantidad: Number(i.cantidad) })) }))
  );
  return [...porPorcion].map(([productoId, porcion]) => ({ productoId, cantidad: redondear3(porcion * cantidad) }));
}

/**
 * Anula una venta: devuelve el inventario que descontó y la saca de los totales.
 *   - Caja ABIERTA (o sin caja): la venta simplemente deja de contar.
 *   - Caja ya CERRADA y venta cobrada en efectivo de contado: el turno cerrado no se reescribe;
 *     el dinero se devuelve como egreso DEVOLUCION de la caja abierta de quien anula.
 * Debe llamarse dentro de la transacción `t`. Devuelve { venta, devolucion } o null si no existe.
 */
async function anularVenta(req, t, ventaId, motivo) {
  const venta = await Venta.findOne({ where: { id: ventaId, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
  if (!venta) return null;
  if (venta.estado === 'ANULADA') throw new ValidationError('Esta venta ya está anulada.');

  // Con devoluciones parciales el inventario y el dinero ya se movieron en parte: no se anula completa.
  if (Number(venta.total_devuelto) > 0) {
    throw new ValidationError('Esta venta tiene devoluciones registradas: no se puede anular completa. Devuelve lo que falta.');
  }

  // Una venta a crédito con abonos tiene dinero cobrado: primero se anulan esos abonos.
  if (venta.forma_pago === '2') {
    const abonos = await AbonoVenta.count({ where: { ventaId: venta.id, estado: 'ACTIVO' }, transaction: t });
    if (abonos > 0) throw new ValidationError('Esta venta a crédito tiene abonos registrados: anúlalos primero en Cuentas por cobrar.');
  }

  // 1. Devolver el inventario (sumado por producto y bloqueado en orden de id).
  const detalles = await VentaDetalle.findAll({ where: { ventaId: venta.id }, transaction: t });
  const devolver = new Map();
  for (const d of detalles) {
    const lineas = Array.isArray(d.consumo) ? d.consumo : await consumoDeLineaAntigua(d, req.empresaId, t);
    for (const { productoId, cantidad } of lineas) {
      devolver.set(productoId, redondear3((devolver.get(productoId) || 0) + Number(cantidad)));
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

  // 2. Dinero: solo si la venta fue en efectivo en una caja que ya se cerró.
  let devolucion = null;
  if (venta.cajaId && req.empresaModulos?.has('Caja')) {
    const cajaVenta = await Caja.findByPk(venta.cajaId, { transaction: t, lock: t.LOCK.UPDATE });
    if (cajaVenta && cajaVenta.estado === 'CERRADA' && esEfectivo(venta.forma_pago, venta.medio_pago)) {
      const cajaAbierta = await Caja.findOne({
        where: { empresaId: req.empresaId, usuarioId: req.userId, estado: 'ABIERTA' }, transaction: t,
      });
      if (!cajaAbierta) {
        throw new ValidationError('Esta venta se cobró en efectivo en una caja que ya cerró: abre tu caja para registrar la devolución del dinero.');
      }
      devolucion = await registrarEgreso(req, t, {
        tipo: 'DEVOLUCION', concepto: `Devolución de la venta #${venta.id}`, monto: Number(venta.total) + Number(venta.propina || 0), ventaId: venta.id, // la propina cobrada también se devuelve
      });
    }
  }

  // 3. Marcar la venta (no se borra: queda en el historial).
  await venta.update({ estado: 'ANULADA', anulada_en: new Date(), anulada_por: req.userId, motivo_anulacion: motivo, saldo_pendiente: 0 }, { transaction: t });
  return { venta, devolucion };
}

module.exports = { anularVenta, consumoDeLineaAntigua };
