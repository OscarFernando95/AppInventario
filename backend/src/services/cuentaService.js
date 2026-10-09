'use strict';

const { Op } = require('sequelize');
const {
  Cuenta, CuentaItem, Comanda, Mesa, Producto, Servicio, Modificador, Usuario, Venta, ComboItem, Cliente,
} = require('../models');
const { ValidationError } = require('../utils/errors');
const { registrarVenta } = require('./ventaService');
const {
  precioDeItem, repartirItems, totalesDeCuenta, totalesPorComensal, redondear3, nombresDeTiempos, nombreDeTiempo, pendientesPorTiempo,
} = require('./cuentas');
const { efectivas } = require('./opciones');
const { opcionesGuardadas } = require('../middlewares/opciones');

const INCLUDE_ITEM = [
  {
    model: Producto, as: 'producto', attributes: ['id', 'nombre_producto', 'codigo', 'tipo', 'precio_unitario', 'porcentaje_iva', 'unidad_medida', 'estacion', 'tiempo_objetivo_min'],
    // De qué se compone un combo (para mostrarlo en la cuenta y en la comanda).
    include: [{ model: ComboItem, as: 'combo', required: false, attributes: ['cantidad'], include: [{ model: Producto, as: 'componente', attributes: ['nombre_producto'] }] }],
  },
  { model: Servicio, as: 'servicio', attributes: ['id', 'nombre', 'precio', 'porcentaje_iva'] },
];

/** Nombre con el que se identifica una cuenta: su mesa o, si es para llevar, su etiqueta. */
const nombreDeCuenta = (cuenta) => cuenta.mesa?.nombre || cuenta.etiqueta || `Cuenta #${cuenta.id}`;

/** Modificadores (nombre y precio extra) de los ids usados en un conjunto de ítems, por id. */
async function cargarModsDe(items, empresaId, transaction) {
  const ids = [...new Set(items.flatMap((i) => i.modificadores || []))];
  if (ids.length === 0) return new Map();
  const mods = await Modificador.findAll({ where: { id: ids, empresaId }, attributes: ['id', 'nombre', 'precio_extra'], transaction });
  return new Map(mods.map((m) => [m.id, { id: m.id, nombre: m.nombre, precio_extra: Number(m.precio_extra) }]));
}

/**
 * Pedir por tiempos de una empresa: si está encendida y cómo se llaman los tiempos. Se lee de lo guardado (con caché);
 * las pantallas de mesas ya exigen el módulo Mesas, así que no hace falta volver a revisarlo.
 */
async function tiemposDeEmpresa(empresaId) {
  const guardadas = await opcionesGuardadas(empresaId);
  return {
    activo: efectivas(guardadas, ['Mesas']).tiempos_servicio === true,
    nombres: nombresDeTiempos(guardadas.tiempos_nombres),
  };
}

/** Ítem de la BD -> JSON para el cliente, con su nombre, precio actual y subtotal. */
function itemJson(item, modsPorId) {
  const j = item.toJSON ? item.toJSON() : item;
  const modsDetalle = (j.modificadores || []).map((id) => modsPorId.get(id)).filter(Boolean);
  const precio = precioDeItem({ producto: j.producto, servicio: j.servicio, modsDetalle, precio_promo: j.precio_promo });
  return {
    id: j.id,
    productoId: j.productoId,
    servicioId: j.servicioId,
    nombre: j.producto ? j.producto.nombre_producto : j.servicio?.nombre,
    tipo: j.producto ? j.producto.tipo : 'SERVICIO',
    unidad_medida: j.producto?.unidad_medida,
    cantidad: Number(j.cantidad),
    precio_unitario: precio,
    promo: j.precio_promo != null ? j.promo : null,
    precio_lista: j.producto ? Number(j.producto.precio_unitario) : (j.servicio ? Number(j.servicio.precio) : null),
    subtotal: Math.round(Number(j.cantidad) * precio * 100) / 100,
    modificadores: modsDetalle,
    componentes: j.producto?.tipo === 'COMBO' ? (j.producto.combo || []).map((c) => ({ nombre: c.componente?.nombre_producto, cantidad: Number(c.cantidad) })) : [],
    nota: j.nota,
    comensal: j.comensal,
    tiempo: j.tiempo,
    estacion: j.producto ? j.producto.estacion : null,
    estado: j.estado,
    comandaId: j.comandaId,
    enviado: !!j.comandaId,
    ventaId: j.ventaId,
    motivo_anulacion: j.motivo_anulacion,
    creado: j.createdAt,
  };
}

const INCLUDE_CUENTA = [
  { model: Mesa, as: 'mesa', attributes: ['id', 'nombre', 'capacidad'] },
  { model: Usuario, as: 'mesero', attributes: ['id', 'nombre'] },
  { model: Cliente, as: 'cliente', attributes: ['id', 'nombre'], required: false },
];

/** Cuenta + ítems + comandas + ventas generadas + totales, lista para pintar. */
async function detalleDeCuenta(empresaId, cuentaId, transaction) {
  const cuenta = await Cuenta.findOne({
    where: { id: cuentaId, empresaId },
    include: [
      ...INCLUDE_CUENTA,
      { model: CuentaItem, as: 'items', include: INCLUDE_ITEM },
      { model: Comanda, as: 'comandas', attributes: ['id', 'estado', 'tiempo', 'enviada_en', 'lista_en', 'entregada_en'] },
      { model: Venta, as: 'ventas', attributes: ['id', 'total', 'propina', 'fecha', 'estado', 'forma_pago', 'medio_pago'] },
    ],
    order: [[{ model: CuentaItem, as: 'items' }, 'id', 'ASC'], [{ model: Comanda, as: 'comandas' }, 'id', 'ASC'], [{ model: Venta, as: 'ventas' }, 'id', 'ASC']],
    transaction,
  });
  if (!cuenta) return null;
  const j = cuenta.toJSON();
  const mods = await cargarModsDe(j.items, empresaId, transaction);
  const items = cuenta.items.map((i) => itemJson(i, mods));
  const tiempos = await tiemposDeEmpresa(empresaId);
  // Con «Pedir por tiempos» apagada la cuenta se ve exactamente igual que siempre (sin campos de tiempos).
  const porTiempos = tiempos.activo ? {
    tiempo_actual: j.tiempo_actual,
    tiempos: pendientesPorTiempo(items.filter((i) => i.estado === 'ACTIVO' && !i.enviado && !i.ventaId), tiempos.nombres.length)
      .map((t) => ({ ...t, nombre: tiempos.nombres[t.numero - 1] })),
  } : {};
  return {
    ...porTiempos,
    id: j.id, estado: j.estado, mesa: j.mesa, etiqueta: j.etiqueta, nombre: nombreDeCuenta(j), mesero: j.mesero,
    cliente: j.cliente || null, referencia: j.referencia || null, comensales: j.comensales, nota: j.nota, abierta_en: j.abierta_en, cerrada_en: j.cerrada_en, motivo_cancelacion: j.motivo_cancelacion,
    items, comandas: j.comandas.map((c) => (c.tiempo == null ? c : { ...c, tiempo_nombre: nombreDeTiempo(tiempos.nombres, c.tiempo) })), ventas: j.ventas.map((v) => ({ ...v, total: Number(v.total), propina: Number(v.propina) })),
    totales: totalesDeCuenta(items.map((i) => ({ ...i, precio: i.precio_unitario }))),
    por_comensal: totalesPorComensal(items.map((i) => ({ ...i, precio: i.precio_unitario }))),
  };
}

/** Resumen de las cuentas ABIERTAS de la empresa (para el tablero de mesas). */
async function cuentasAbiertas(empresaId) {
  const cuentas = await Cuenta.findAll({
    where: { empresaId, estado: 'ABIERTA' },
    include: [
      ...INCLUDE_CUENTA,
      { model: CuentaItem, as: 'items', required: false, where: { estado: 'ACTIVO' }, include: INCLUDE_ITEM },
      { model: Comanda, as: 'comandas', required: false, where: { estado: { [Op.in]: ['PENDIENTE', 'LISTA'] } }, attributes: ['id', 'estado'] },
    ],
    order: [['abierta_en', 'ASC']],
  });
  const todos = cuentas.flatMap((c) => c.items);
  const mods = await cargarModsDe(todos, empresaId);
  return cuentas.map((c) => {
    const items = c.items.map((i) => itemJson(i, mods));
    const t = totalesDeCuenta(items.map((i) => ({ ...i, precio: i.precio_unitario })));
    return {
      id: c.id, mesaId: c.mesaId, etiqueta: c.etiqueta, nombre: nombreDeCuenta(c), mesero: c.mesero,
      comensales: c.comensales, abierta_en: c.abierta_en,
      num_items: items.filter((i) => !i.ventaId).length,
      por_enviar: items.filter((i) => !i.enviado && !i.ventaId).length,
      comandas_pendientes: c.comandas.filter((x) => x.estado === 'PENDIENTE').length,
      comandas_listas: c.comandas.filter((x) => x.estado === 'LISTA').length,
      total: t.pendiente, // lo que falta por cobrar
    };
  });
}

/** Una comanda lista para imprimir o mostrar en cocina: mesa, mesero, hora e ítems (con sus extras y notas). */
async function detalleDeComanda(empresaId, comandaId, transaction) {
  const comanda = await Comanda.findOne({
    where: { id: comandaId, empresaId },
    include: [
      { model: Cuenta, as: 'cuenta', include: [{ model: Mesa, as: 'mesa', attributes: ['id', 'nombre'] }] },
      { model: Usuario, as: 'mesero', attributes: ['id', 'nombre'] },
      { model: CuentaItem, as: 'items', include: INCLUDE_ITEM },
    ],
    order: [[{ model: CuentaItem, as: 'items' }, 'id', 'ASC']],
    transaction,
  });
  if (!comanda) return null;
  return comandaJson(comanda, await cargarModsDe(comanda.items, empresaId, transaction), (await tiemposDeEmpresa(empresaId)).nombres);
}

function comandaJson(comanda, mods, nombresTiempos) {
  const items = comanda.items.map((i) => {
    const j = itemJson(i, mods);
    return {
      id: j.id, nombre: j.nombre, cantidad: j.cantidad, modificadores: j.modificadores.map((m) => m.nombre), componentes: j.componentes, nota: j.nota, comensal: j.comensal,
      anulado: j.estado === 'ANULADO', tiempo_objetivo_min: i.producto?.tiempo_objetivo_min ?? null,
    };
  });
  return {
    id: comanda.id,
    estado: comanda.estado,
    estacion: comanda.estacion,
    tiempo: comanda.tiempo ?? null,
    tiempo_nombre: nombreDeTiempo(nombresTiempos, comanda.tiempo ?? null),
    enviada_en: comanda.enviada_en,
    lista_en: comanda.lista_en,
    entregada_en: comanda.entregada_en,
    cuentaId: comanda.cuentaId,
    cuenta_estado: comanda.cuenta?.estado,
    cuenta: comanda.cuenta ? nombreDeCuenta(comanda.cuenta) : null,
    mesero: comanda.mesero?.nombre,
    items,
  };
}

/** Comandas en los estados pedidos (por omisión, las que cocina aún tiene a la vista), de la más antigua a la más nueva. */
async function listarComandas(empresaId, estados = ['PENDIENTE', 'LISTA'], estacion) {
  const comandas = await Comanda.findAll({
    where: { empresaId, estado: { [Op.in]: estados }, ...(estacion ? { estacion } : {}) },
    include: [
      { model: Cuenta, as: 'cuenta', include: [{ model: Mesa, as: 'mesa', attributes: ['id', 'nombre'] }] },
      { model: Usuario, as: 'mesero', attributes: ['id', 'nombre'] },
      { model: CuentaItem, as: 'items', include: INCLUDE_ITEM },
    ],
    order: [['enviada_en', 'ASC'], [{ model: CuentaItem, as: 'items' }, 'id', 'ASC']],
  });
  const mods = await cargarModsDe(comandas.flatMap((c) => c.items), empresaId);
  const { nombres } = await tiemposDeEmpresa(empresaId);
  return comandas.map((c) => comandaJson(c, mods, nombres));
}

/** Bloquea la cuenta (serializa meseros y cajero sobre la misma cuenta) y exige que siga ABIERTA. */
async function cuentaAbiertaBloqueada(req, t, cuentaId) {
  const cuenta = await Cuenta.findOne({
    where: { id: cuentaId, empresaId: req.empresaId }, include: [{ model: Mesa, as: 'mesa', attributes: ['id', 'nombre'] }], transaction: t, lock: { level: t.LOCK.UPDATE, of: Cuenta },
  });
  if (!cuenta) return null;
  if (cuenta.estado !== 'ABIERTA') throw new ValidationError(`Esta cuenta ya está ${cuenta.estado === 'COBRADA' ? 'cobrada' : 'cancelada'}.`);
  return cuenta;
}

/**
 * Cobra (todo o una parte de) una cuenta, dentro de la transacción `t`: arma una venta con los ítems
 * elegidos —si se cobra solo parte de un ítem, el resto queda pendiente— y, si ya no queda nada por
 * cobrar, cierra la cuenta. Una cuenta se puede dividir en tantas ventas como haga falta.
 */
async function cobrarCuenta(req, t, cuentaId, body) {
  const cuenta = await cuentaAbiertaBloqueada(req, t, cuentaId);
  if (!cuenta) return null;

  const pendientes = await CuentaItem.findAll({
    where: { cuentaId: cuenta.id, estado: 'ACTIVO', ventaId: null }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE,
  });
  if (pendientes.length === 0) throw new ValidationError('No hay nada por cobrar en esta cuenta.');

  let reparto;
  try {
    reparto = repartirItems(pendientes, body.items);
  } catch (err) {
    if (String(err.message).startsWith('SELECCION:')) throw new ValidationError(err.message.slice('SELECCION:'.length));
    throw err;
  }

  const detalles = reparto.cobrar.map(({ item, cantidad }) => ({
    productoId: item.productoId || undefined,
    servicioId: item.servicioId || undefined,
    cantidad,
    modificadores: item.modificadores || undefined,
    precio_promo: item.precio_promo ?? undefined, // precio de horario con que se pidió (la venta lo respeta)
  }));
  const { venta, calc, clienteNombre, aCredito, diasCredito, numItems } = await registrarVenta(req, t, {
    // Una cuenta a nombre de un cliente se cobra a ese cliente salvo que se indique otro.
    clienteId: body.clienteId ?? cuenta.clienteId ?? undefined,
    detalles,
    descuento_global: body.descuento_global,
    forma_pago: body.forma_pago,
    medio_pago: body.medio_pago,
    dias_credito: body.dias_credito,
  }, { cuentaId: cuenta.id, propina: body.propina || 0 });

  // Cobrar solo una parte de un ítem: la parte cobrada se queda en el ítem y el resto pasa a uno nuevo, aún pendiente.
  for (const { item, restante } of reparto.partir) {
    await CuentaItem.create({
      cuentaId: cuenta.id, productoId: item.productoId, servicioId: item.servicioId, cantidad: restante, modificadores: item.modificadores,
      nota: item.nota, comensal: item.comensal, tiempo: item.tiempo, usuarioId: item.usuarioId, comandaId: item.comandaId, estado: 'ACTIVO',
    }, { transaction: t });
  }
  for (const { item, cantidad } of reparto.cobrar) {
    await item.update({ cantidad: redondear3(cantidad), ventaId: venta.id }, { transaction: t });
  }

  const quedan = await CuentaItem.count({ where: { cuentaId: cuenta.id, estado: 'ACTIVO', ventaId: null }, transaction: t });
  if (quedan === 0) {
    await cuenta.update({ estado: 'COBRADA', cerrada_en: new Date() }, { transaction: t });
    // Si ya se pagó todo, lo que cocina tuviera pendiente de esta cuenta ya se sirvió: sale de su pantalla.
    await Comanda.update({ estado: 'ENTREGADA', entregada_en: new Date() }, { where: { cuentaId: cuenta.id, estado: { [Op.in]: ['PENDIENTE', 'LISTA'] } }, transaction: t });
  }

  return { cuenta, venta, calc, clienteNombre, aCredito, diasCredito, numItems, cuentaCerrada: quedan === 0 };
}

module.exports = {
  tiemposDeEmpresa, nombreDeCuenta, detalleDeCuenta, cuentasAbiertas, detalleDeComanda, listarComandas, cuentaAbiertaBloqueada, cobrarCuenta, cargarModsDe,
};
