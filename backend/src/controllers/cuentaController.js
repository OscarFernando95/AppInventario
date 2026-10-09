'use strict';

const { Op } = require('sequelize');
const { sequelize, Cuenta, CuentaItem, Comanda, Mesa, Producto, Servicio, Empresa, PrecioHorario } = require('../models');
const { ValidationError, ForbiddenError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { buildListWhere } = require('../utils/listFilters');
const { auditar } = require('../utils/audit');
const { tiene } = require('../middlewares/auth');
const { invalidateDashboard } = require('./reporteController');
const { invalidateInforme } = require('./informeController');
const { cargarModificadoresLinea } = require('../services/ventaService');
const { opcionesDe } = require('../middlewares/opciones');
const { promoVigente } = require('../services/precios');
const { validarSeleccion } = require('../services/grupos');
const { cargarGrupos } = require('../services/gruposDb');
const { fechaISO } = require('../services/lotes');
const { TIPOS_NO_VENDIBLES } = require('../services/recetas');
const {
  nombreDeCuenta, detalleDeCuenta, cuentasAbiertas, detalleDeComanda, cuentaAbiertaBloqueada, cobrarCuenta,
} = require('../services/cuentaService');

const noEncontrada = (res) => res.status(404).json({ error: 'Cuenta no encontrada' });

/** Cuentas por estado (ABIERTA por omisión). Las abiertas traen su resumen; las cerradas, un listado paginado. */
exports.getCuentas = async (req, res) => {
  const estado = req.query.estado || 'ABIERTA';
  if (estado === 'ABIERTA') return res.json(await cuentasAbiertas(req.empresaId));

  const { limit, offset } = parseListQuery(req.query);
  const { count, rows } = await Cuenta.findAndCountAll({
    where: { empresaId: req.empresaId, estado, ...buildListWhere(req.query, { fecha: 'cerrada_en' }) },
    include: [{ model: Mesa, as: 'mesa', attributes: ['id', 'nombre'] }],
    order: [['cerrada_en', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });
  setTotalCount(res, count);
  res.json(rows.map((c) => ({ id: c.id, estado: c.estado, nombre: nombreDeCuenta(c), abierta_en: c.abierta_en, cerrada_en: c.cerrada_en })));
};

exports.getCuenta = async (req, res) => {
  const cuenta = await detalleDeCuenta(req.empresaId, req.params.id);
  if (!cuenta) return noEncontrada(res);
  res.json(cuenta);
};

exports.abrirCuenta = async (req, res) => {
  const { mesaId, etiqueta, comensales, nota } = req.body;
  const id = await sequelize.transaction(async (t) => {
    if (mesaId) {
      const mesa = await Mesa.findOne({ where: { id: mesaId, empresaId: req.empresaId }, transaction: t });
      if (!mesa || !mesa.activa) throw new ValidationError('Mesa inválida o inactiva.');
      const abierta = await Cuenta.findOne({ where: { mesaId, estado: 'ABIERTA' }, transaction: t });
      if (abierta) throw new ValidationError(`«${mesa.nombre}» ya tiene una cuenta abierta.`);
    }
    try {
      const cuenta = await Cuenta.create({
        empresaId: req.empresaId, mesaId: mesaId || null, etiqueta: etiqueta || null, usuarioId: req.userId,
        comensales: comensales || null, nota: nota || null, abierta_en: new Date(),
      }, { transaction: t });
      return cuenta.id;
    } catch (err) {
      if (err && err.name === 'SequelizeUniqueConstraintError') throw new ValidationError('Esa mesa ya tiene una cuenta abierta.');
      throw err;
    }
  });
  res.status(201).json(await detalleDeCuenta(req.empresaId, id));
};

exports.updateCuenta = async (req, res) => {
  const ok = await sequelize.transaction(async (t) => {
    const cuenta = await cuentaAbiertaBloqueada(req, t, req.params.id);
    if (!cuenta) return false;
    const cambios = {};
    for (const campo of ['comensales', 'nota', 'etiqueta']) if (req.body[campo] !== undefined) cambios[campo] = req.body[campo];
    if (cambios.etiqueta === null && !cuenta.mesaId) throw new ValidationError('Una cuenta sin mesa necesita su etiqueta.');
    await cuenta.update(cambios, { transaction: t });
    return true;
  });
  if (!ok) return noEncontrada(res);
  res.json(await detalleDeCuenta(req.empresaId, req.params.id));
};

/** El ítem es de una persona de la mesa: no puede ser mayor que los comensales de la cuenta (si se indicaron). */
function validarComensal(cuenta, comensal) {
  if (comensal && cuenta.comensales && comensal > cuenta.comensales) {
    throw new ValidationError(`Esta cuenta tiene ${cuenta.comensales} comensal(es): no existe la persona ${comensal}.`);
  }
}

/** Mismo plato/producto, mismos extras y misma nota, aún sin enviar: se suma a la línea existente. */
const mismosExtras = (a, b) => JSON.stringify([...(a || [])].sort((x, y) => x - y)) === JSON.stringify([...(b || [])].sort((x, y) => x - y));

exports.agregarItem = async (req, res) => {
  const { productoId, servicioId, cantidad, modificadores, nota } = req.body;
  // Con «pedir por persona» apagado el ítem no se asigna a nadie (aunque llegue el dato).
  const ef = await opcionesDe(req);
  const comensal = ef.cuenta_por_persona ? req.body.comensal : undefined;
  const ok = await sequelize.transaction(async (t) => {
    const cuenta = await cuentaAbiertaBloqueada(req, t, req.params.id);
    if (!cuenta) return false;
    validarComensal(cuenta, comensal);

    let promo = null; // oferta por horario vigente al pedirlo
    let prod = null;
    if (productoId) {
      prod = await Producto.findOne({ where: { id: productoId, empresaId: req.empresaId }, transaction: t });
      if (!prod) throw new ValidationError('Producto inválido.');
      if (prod.tipo === 'COMBO' && !ef.combos) throw new ValidationError(`Los combos no están activados: «${prod.nombre_producto}» no se puede pedir.`);
      if (ef.agotados_manuales && prod.agotado_dia === fechaISO()) throw new ValidationError(`«${prod.nombre_producto}» está agotado por hoy.`);
      if (ef.precios_horario) {
        const reglas = await PrecioHorario.findAll({ where: { empresaId: req.empresaId, activo: true }, raw: true, transaction: t });
        promo = promoVigente(prod.toJSON(), reglas);
      }
      if (TIPOS_NO_VENDIBLES.includes(prod.tipo)) {
        throw new ValidationError(`"${prod.nombre_producto}" es un ${prod.tipo === 'INSUMO' ? 'insumo' : 'ingrediente preparado'}; no se vende directamente.`);
      }
      if (modificadores?.length && prod.tipo !== 'RECETA') throw new ValidationError('Solo los platos admiten modificadores.');
    } else {
      if (modificadores?.length) throw new ValidationError('Solo los platos admiten modificadores.');
      const serv = await Servicio.findOne({ where: { id: servicioId, empresaId: req.empresaId }, transaction: t });
      if (!serv) throw new ValidationError('Servicio inválido.');
    }
    const mods = [...new Set(modificadores || [])];
    const elegidos = await cargarModificadoresLinea(mods, req.empresaId, t); // existen, activos y de la empresa
    if (ef.modificadores_grupos && prod?.tipo === 'RECETA') {
      const falla = validarSeleccion(prod, await cargarGrupos(req.empresaId, { transaction: t }), elegidos);
      if (falla) throw new ValidationError(falla);
    }

    const iguales = await CuentaItem.findOne({
      where: { cuentaId: cuenta.id, estado: 'ACTIVO', comandaId: null, ventaId: null, productoId: productoId || null, servicioId: servicioId || null, nota: nota || null, comensal: comensal || null, precio_promo: promo ? promo.precio : null },
      transaction: t,
    });
    if (iguales && mismosExtras(iguales.modificadores, mods)) {
      await iguales.update({ cantidad: Math.round((Number(iguales.cantidad) + cantidad) * 1000) / 1000 }, { transaction: t });
    } else {
      await CuentaItem.create({
        cuentaId: cuenta.id, productoId: productoId || null, servicioId: servicioId || null, cantidad,
        modificadores: mods.length ? mods : null, nota: nota || null, comensal: comensal || null, usuarioId: req.userId, precio_promo: promo ? promo.precio : null, promo: promo ? promo.promo : null,
      }, { transaction: t });
    }
    return true;
  });
  if (!ok) return noEncontrada(res);
  res.status(201).json(await detalleDeCuenta(req.empresaId, req.params.id));
};

/** Ítem de la cuenta (bloqueada) que se puede tocar: activo y sin cobrar. */
async function itemEditable(t, cuenta, itemId) {
  const item = await CuentaItem.findOne({ where: { id: itemId, cuentaId: cuenta.id }, transaction: t, lock: t.LOCK.UPDATE });
  if (!item) throw new ValidationError('Ítem no encontrado en esta cuenta.');
  if (item.estado !== 'ACTIVO') throw new ValidationError('Este ítem ya está anulado.');
  if (item.ventaId) throw new ValidationError('Este ítem ya se cobró.');
  return item;
}

exports.editarItem = async (req, res) => {
  const ok = await sequelize.transaction(async (t) => {
    const cuenta = await cuentaAbiertaBloqueada(req, t, req.params.id);
    if (!cuenta) return false;
    const item = await itemEditable(t, cuenta, req.params.itemId);
    // A quién pertenece un ítem se puede cambiar siempre; su cantidad y nota, solo antes de enviarlo a cocina.
    if (item.comandaId && (req.body.cantidad !== undefined || req.body.nota !== undefined)) {
      throw new ValidationError('Este ítem ya se envió a cocina: anúlalo y vuelve a pedirlo.');
    }
    const cambios = {};
    if (req.body.cantidad !== undefined) cambios.cantidad = req.body.cantidad;
    if (req.body.nota !== undefined) cambios.nota = req.body.nota;
    if (req.body.comensal !== undefined && (await opcionesDe(req)).cuenta_por_persona) { validarComensal(cuenta, req.body.comensal); cambios.comensal = req.body.comensal; }
    await item.update(cambios, { transaction: t });
    return true;
  });
  if (!ok) return noEncontrada(res);
  res.json(await detalleDeCuenta(req.empresaId, req.params.id));
};

/** Quitar un ítem que aún no se envió a cocina: se borra, sin dejar rastro. */
exports.quitarItem = async (req, res) => {
  const ok = await sequelize.transaction(async (t) => {
    const cuenta = await cuentaAbiertaBloqueada(req, t, req.params.id);
    if (!cuenta) return false;
    const item = await itemEditable(t, cuenta, req.params.itemId);
    if (item.comandaId) throw new ValidationError('Este ítem ya se envió a cocina: usa «Anular» con un motivo.');
    await item.destroy({ transaction: t });
    return true;
  });
  if (!ok) return noEncontrada(res);
  res.json(await detalleDeCuenta(req.empresaId, req.params.id));
};

/** Anular un ítem ya enviado a cocina: queda registrado (motivo y quién) y la comanda lo muestra tachado. */
exports.anularItem = async (req, res) => {
  if (!tiene(req, 'mesas.anular_items')) return res.status(403).json({ error: 'No tienes permiso para anular ítems ya enviados a cocina.' });
  let datos;
  const ok = await sequelize.transaction(async (t) => {
    const cuenta = await cuentaAbiertaBloqueada(req, t, req.params.id);
    if (!cuenta) return false;
    const item = await itemEditable(t, cuenta, req.params.itemId);
    const prod = item.productoId ? await Producto.findByPk(item.productoId, { attributes: ['nombre_producto'], transaction: t }) : await Servicio.findByPk(item.servicioId, { attributes: ['nombre'], transaction: t });
    await item.update({ estado: 'ANULADO', motivo_anulacion: req.body.motivo, anulado_por: req.userId }, { transaction: t });
    datos = { cuentaId: cuenta.id, cuenta: nombreDeCuenta(cuenta), item: prod?.nombre_producto || prod?.nombre, cantidad: Number(item.cantidad), motivo: req.body.motivo, enviado: !!item.comandaId };
    return true;
  });
  if (!ok) return noEncontrada(res);
  auditar(req, 'cuenta_item_anulado', datos);
  res.json(await detalleDeCuenta(req.empresaId, req.params.id));
};

/**
 * Envía a preparación todo lo que aún no se ha enviado: una comanda por estación (Cocina, Barra…), según la
 * estación de cada plato. Devuelve las comandas creadas, listas para imprimir o mostrar en pantalla.
 */
exports.enviarACocina = async (req, res) => {
  let nombre; let numItems; let creadas;
  const ok = await sequelize.transaction(async (t) => {
    const cuenta = await cuentaAbiertaBloqueada(req, t, req.params.id);
    if (!cuenta) return false;
    const nuevos = await CuentaItem.findAll({
      where: { cuentaId: cuenta.id, estado: 'ACTIVO', comandaId: null, ventaId: null },
      include: [{ model: Producto, as: 'producto', attributes: ['id', 'estacion'], required: false }],
      order: [['id', 'ASC']], transaction: t, lock: { level: t.LOCK.UPDATE, of: CuentaItem },
    });
    if (nuevos.length === 0) throw new ValidationError('No hay ítems nuevos para enviar a cocina.');

    const empresa = await Empresa.findByPk(req.empresaId, { attributes: ['estaciones'], transaction: t });
    const estaciones = Array.isArray(empresa?.estaciones) && empresa.estaciones.length ? empresa.estaciones : ['Cocina'];
    // Un plato cuya estación ya no existe (se renombró o quitó) va a la primera.
    const estacionDe = (i) => (i.producto?.estacion && estaciones.includes(i.producto.estacion) ? i.producto.estacion : estaciones[0]);
    const grupos = new Map();
    for (const i of nuevos) grupos.set(estacionDe(i), [...(grupos.get(estacionDe(i)) || []), i]);

    creadas = [];
    const enviada = new Date();
    for (const estacion of estaciones.filter((e) => grupos.has(e))) {
      const comanda = await Comanda.create({ empresaId: req.empresaId, cuentaId: cuenta.id, usuarioId: req.userId, estacion, enviada_en: enviada }, { transaction: t });
      await CuentaItem.update({ comandaId: comanda.id }, { where: { id: grupos.get(estacion).map((i) => i.id) }, transaction: t });
      creadas.push({ id: comanda.id, estacion, numItems: grupos.get(estacion).length });
    }
    nombre = nombreDeCuenta(cuenta);
    numItems = nuevos.length;
    return true;
  });
  if (!ok) return noEncontrada(res);
  for (const c of creadas) auditar(req, 'comanda_enviada', { cuentaId: Number(req.params.id), comandaId: c.id, cuenta: nombre, numItems: c.numItems, estacion: c.estacion });
  const comandas = await Promise.all(creadas.map((c) => detalleDeComanda(req.empresaId, c.id)));
  res.status(201).json({ comandas, numItems });
};

exports.moverCuenta = async (req, res) => {
  let datos;
  const ok = await sequelize.transaction(async (t) => {
    const cuenta = await cuentaAbiertaBloqueada(req, t, req.params.id);
    if (!cuenta) return false;
    const destino = await Mesa.findOne({ where: { id: req.body.mesaId, empresaId: req.empresaId }, transaction: t });
    if (!destino || !destino.activa) throw new ValidationError('Mesa inválida o inactiva.');
    if (cuenta.mesaId === destino.id) throw new ValidationError('La cuenta ya está en esa mesa.');
    if (await Cuenta.findOne({ where: { mesaId: destino.id, estado: 'ABIERTA' }, transaction: t })) {
      throw new ValidationError(`«${destino.nombre}» ya tiene una cuenta abierta.`);
    }
    datos = { cuentaId: cuenta.id, desde: nombreDeCuenta(cuenta), hacia: destino.nombre };
    await cuenta.update({ mesaId: destino.id, etiqueta: cuenta.etiqueta }, { transaction: t });
    return true;
  });
  if (!ok) return noEncontrada(res);
  auditar(req, 'cuenta_movida', datos);
  res.json(await detalleDeCuenta(req.empresaId, req.params.id));
};

/**
 * Une dos cuentas abiertas (clientes que se cambian de mesa o se juntan): todo lo pedido de `cuentaId` pasa a
 * esta cuenta y aquella queda cancelada, con su mesa libre. Solo si de la otra aún no se cobró nada.
 */
exports.unirCuentas = async (req, res) => {
  const destinoId = Number(req.params.id);
  const origenId = req.body.cuentaId;
  if (destinoId === origenId) throw new ValidationError('Elige otra cuenta para unir.');
  let datos;
  const ok = await sequelize.transaction(async (t) => {
    // Se bloquean en orden de id para no cruzarse con otra unión o con un cobro.
    const [primera, segunda] = [destinoId, origenId].sort((a, b) => a - b);
    const a = await cuentaAbiertaBloqueada(req, t, primera);
    const b = await cuentaAbiertaBloqueada(req, t, segunda);
    if (!a || !b) return false;
    const destino = a.id === destinoId ? a : b;
    const origen = a.id === destinoId ? b : a;
    const cobrados = await CuentaItem.count({ where: { cuentaId: origen.id, ventaId: { [Op.ne]: null } }, transaction: t });
    if (cobrados > 0) throw new ValidationError(`«${nombreDeCuenta(origen)}» ya tiene una parte cobrada: termina de cobrarla antes de unirla.`);

    const [movidos] = await CuentaItem.update({ cuentaId: destino.id }, { where: { cuentaId: origen.id }, transaction: t });
    await Comanda.update({ cuentaId: destino.id }, { where: { cuentaId: origen.id }, transaction: t });
    const comensales = (destino.comensales || 0) + (origen.comensales || 0);
    await destino.update({ comensales: comensales || null }, { transaction: t });
    await origen.update({
      estado: 'CANCELADA', cerrada_en: new Date(), cancelada_por: req.userId, motivo_cancelacion: `Unida a la cuenta de ${nombreDeCuenta(destino)} (#${destino.id})`,
    }, { transaction: t });
    datos = { cuentaId: destino.id, destino: nombreDeCuenta(destino), origen: nombreDeCuenta(origen), numItems: movidos };
    return true;
  });
  if (!ok) return noEncontrada(res);
  auditar(req, 'cuentas_unidas', datos);
  res.json(await detalleDeCuenta(req.empresaId, destinoId));
};

exports.cancelarCuenta = async (req, res) => {
  let datos;
  const ok = await sequelize.transaction(async (t) => {
    const cuenta = await cuentaAbiertaBloqueada(req, t, req.params.id);
    if (!cuenta) return false;
    const items = await CuentaItem.findAll({ where: { cuentaId: cuenta.id, estado: 'ACTIVO' }, transaction: t, lock: t.LOCK.UPDATE });
    if (items.some((i) => i.ventaId)) throw new ValidationError('Ya se cobró una parte de esta cuenta: cobra lo que falta.');
    if (items.some((i) => i.comandaId) && !tiene(req, 'mesas.anular_items')) {
      throw new ForbiddenError('Esta cuenta tiene pedidos enviados a cocina: solo quien puede anularlos la cancela.');
    }
    await CuentaItem.update(
      { estado: 'ANULADO', motivo_anulacion: req.body.motivo, anulado_por: req.userId },
      { where: { id: items.map((i) => i.id) }, transaction: t }
    );
    await cuenta.update({ estado: 'CANCELADA', cerrada_en: new Date(), motivo_cancelacion: req.body.motivo, cancelada_por: req.userId }, { transaction: t });
    datos = { cuentaId: cuenta.id, cuenta: nombreDeCuenta(cuenta), motivo: req.body.motivo, numItems: items.length, enviados: items.filter((i) => i.comandaId).length };
    return true;
  });
  if (!ok) return noEncontrada(res);
  auditar(req, 'cuenta_cancelada', datos);
  res.json(await detalleDeCuenta(req.empresaId, req.params.id));
};

exports.cobrar = async (req, res) => {
  // Con la propina apagada nunca se cobra (aunque llegue el dato).
  if (!(await opcionesDe(req)).propina) req.body.propina = 0;
  const t = await sequelize.transaction();
  try {
    const r = await cobrarCuenta(req, t, req.params.id, req.body);
    if (!r) { await t.rollback(); return noEncontrada(res); }
    await t.commit();
    invalidateDashboard(req.empresaId);
    invalidateInforme(req.empresaId);
    auditar(req, 'venta_creada', {
      ventaId: r.venta.id, total: r.calc.total, clienteId: r.venta.clienteId, clienteNombre: r.clienteNombre, numItems: r.numItems,
      aCredito: r.aCredito, diasCredito: r.diasCredito, cuenta: nombreDeCuenta(r.cuenta), propina: Number(r.venta.propina),
    });
    res.status(201).json({ venta: r.venta, cuenta: await detalleDeCuenta(req.empresaId, r.cuenta.id), cuenta_cerrada: r.cuentaCerrada });
  } catch (err) {
    await t.rollback();
    throw err;
  }
};
