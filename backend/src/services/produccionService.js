'use strict';

const { Producto, Produccion } = require('../models');
const { ValidationError } = require('../utils/errors');
const { consumoBase, esPorLotes, redondear3 } = require('./recetas');
const { cargarRecetas } = require('./recetasDb');
const { promedioPonderado } = require('./costos');

const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Produce un lote de una preparación por lotes, dentro de la transacción `t`:
 * descuenta de cada ingrediente lo que gasta `cantidad` unidades (sub-recetas expandidas; otra
 * preparación por lotes cuenta como ingrediente con su propio stock), suma `cantidad` al stock de la
 * preparación y recalcula su costo como promedio ponderado con el costo de este lote.
 * Los locks se toman en orden de id para no cruzarse con ventas ni otras producciones.
 */
async function producir(req, t, { productoId, cantidad, motivo }) {
  const prep = await Producto.findOne({ where: { id: productoId, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
  if (!prep) throw new ValidationError('Preparación inválida.');
  if (!esPorLotes(prep)) throw new ValidationError(`"${prep.nombre_producto}" no se produce por lotes: actívalo en su ficha de Inventario.`);

  const recetas = await cargarRecetas(req.empresaId, { transaction: t });
  let consumo;
  try {
    consumo = consumoBase(prep.id, recetas, cantidad, new Map(), [], true);
  } catch {
    throw new ValidationError('La receta tiene un ciclo: una preparación termina usándose a sí misma.');
  }
  if (consumo.size === 0) throw new ValidationError(`"${prep.nombre_producto}" no tiene ingredientes configurados.`);

  const insumos = await Producto.findAll({
    where: { id: [...consumo.keys()], empresaId: req.empresaId }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE,
  });
  const porId = new Map(insumos.map((i) => [i.id, i]));
  const descontado = [];
  let costoTotal = 0;
  for (const id of [...consumo.keys()].sort((a, b) => a - b)) {
    const insumo = porId.get(id);
    const necesario = redondear3(consumo.get(id));
    if (!insumo || Number(insumo.stock_actual) < necesario) {
      throw new ValidationError(`Stock insuficiente de "${insumo ? insumo.nombre_producto : 'un ingrediente'}" para producir "${prep.nombre_producto}".`);
    }
    await insumo.update({ stock_actual: redondear3(Number(insumo.stock_actual) - necesario) }, { transaction: t });
    costoTotal += necesario * Number(insumo.costo_promedio);
    descontado.push({ productoId: id, cantidad: necesario });
  }

  const costoUnitario = costoTotal / cantidad;
  await prep.update({
    costo_promedio: promedioPonderado(prep.stock_actual, prep.costo_promedio, cantidad, costoUnitario),
    stock_actual: redondear3(Number(prep.stock_actual) + cantidad),
  }, { transaction: t });

  const produccion = await Produccion.create({
    empresaId: req.empresaId,
    productoId: prep.id,
    usuarioId: req.userId,
    cantidad,
    costo_unitario: Math.round(costoUnitario * 10000) / 10000,
    costo_total: redondear2(costoTotal),
    consumo: descontado,
    motivo: motivo || null,
    fecha: new Date(),
  }, { transaction: t });
  return { produccion, prep };
}

/**
 * Deshace un lote: devuelve los ingredientes y quita lo producido. Solo si todo el lote sigue en
 * existencia (si ya se usó en platos, hay que registrar la diferencia como merma).
 */
async function anularProduccion(req, t, produccionId) {
  const produccion = await Produccion.findOne({ where: { id: produccionId, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
  if (!produccion) return null;
  if (produccion.estado === 'ANULADA') throw new ValidationError('Esta producción ya está anulada.');

  const ids = [produccion.productoId, ...produccion.consumo.map((c) => c.productoId)];
  const productos = await Producto.findAll({
    where: { id: [...new Set(ids)], empresaId: req.empresaId }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE,
  });
  const porId = new Map(productos.map((p) => [p.id, p]));

  const prep = porId.get(produccion.productoId);
  if (!prep || Number(prep.stock_actual) < Number(produccion.cantidad) - 1e-9) {
    throw new ValidationError(`Ya se usó parte de este lote (quedan ${Number(prep?.stock_actual || 0)} de ${Number(produccion.cantidad)}). Registra lo que falta como merma en Ajustes.`);
  }
  await prep.update({ stock_actual: redondear3(Number(prep.stock_actual) - Number(produccion.cantidad)) }, { transaction: t });
  for (const { productoId, cantidad } of produccion.consumo) {
    const insumo = porId.get(productoId);
    if (insumo) await insumo.update({ stock_actual: redondear3(Number(insumo.stock_actual) + Number(cantidad)) }, { transaction: t });
  }

  await produccion.update({ estado: 'ANULADA', anulada_en: new Date(), anulada_por: req.userId }, { transaction: t });
  return { produccion, prep };
}

module.exports = { producir, anularProduccion };
