'use strict';

const { sequelize, ListaEspera, Mesa, Cuenta } = require('../models');
const { ValidationError } = require('../utils/errors');
const { auditar } = require('../utils/audit');
const { detalleDeCuenta } = require('../services/cuentaService');
const { exigirMesaSinBloqueo } = require('../services/bloqueosDb');

/** Minutos que lleva (o llevó) esperando: hasta que se atendió, o hasta ahora si sigue esperando. */
const minutosEspera = (e, ahora = Date.now()) => Math.max(0, Math.floor(((e.atendida_en ? new Date(e.atendida_en).getTime() : ahora) - new Date(e.creada_en).getTime()) / 60_000));

const aJson = (e, ahora) => ({ ...e.toJSON(), minutos_espera: minutosEspera(e, ahora) });

/** Quienes esperan (por omisión), de quien lleva más tiempo a quien menos. */
exports.getListaEspera = async (req, res) => {
  const estado = req.query.estado || 'ESPERANDO';
  const filas = await ListaEspera.findAll({
    where: { empresaId: req.empresaId, estado },
    order: [['creada_en', 'ASC'], ['id', 'ASC']],
    limit: 300,
  });
  const ahora = Date.now();
  res.json(filas.map((e) => aJson(e, ahora)));
};

exports.createListaEspera = async (req, res) => {
  const e = await ListaEspera.create({ ...req.body, empresaId: req.empresaId, usuarioId: req.userId, creada_en: new Date() });
  auditar(req, 'lista_espera_agregada', { esperaId: e.id, nombre: e.nombre, personas: e.personas });
  res.status(201).json(aJson(e));
};

/** Se cancela o no llegó (solo si sigue esperando). */
exports.updateListaEspera = async (req, res) => {
  const e = await sequelize.transaction(async (t) => {
    const fila = await ListaEspera.findOne({ where: { id: req.params.id, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!fila) return null;
    if (fila.estado !== 'ESPERANDO') throw new ValidationError('Esta persona ya no está esperando.');
    await fila.update({ estado: req.body.estado, atendida_en: new Date() }, { transaction: t });
    return fila;
  });
  if (!e) return res.status(404).json({ error: 'No está en la lista de espera' });
  auditar(req, 'lista_espera_actualizada', { esperaId: e.id, nombre: e.nombre, estado: e.estado });
  res.json(aJson(e));
};

/** Ya hay mesa: se abre la cuenta con sus comensales y queda SENTADO (mismo camino que sentar una reserva). */
exports.sentarListaEspera = async (req, res) => {
  let cuentaId; let datos;
  const ok = await sequelize.transaction(async (t) => {
    const e = await ListaEspera.findOne({ where: { id: req.params.id, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!e) return false;
    if (e.estado !== 'ESPERANDO') throw new ValidationError('Esta persona ya no está esperando.');
    const mesa = await Mesa.findOne({ where: { id: req.body.mesaId, empresaId: req.empresaId }, transaction: t });
    if (!mesa || !mesa.activa) throw new ValidationError('Mesa inválida o inactiva.');
    if (await Cuenta.findOne({ where: { mesaId: mesa.id, estado: 'ABIERTA' }, transaction: t })) throw new ValidationError(`«${mesa.nombre}» ya tiene una cuenta abierta.`);
    await exigirMesaSinBloqueo(req, mesa, t);
    try {
      const cuenta = await Cuenta.create({
        empresaId: req.empresaId, mesaId: mesa.id, usuarioId: req.userId, comensales: e.personas, nota: `Lista de espera: ${e.nombre}`, abierta_en: new Date(),
      }, { transaction: t });
      cuentaId = cuenta.id;
    } catch (err) {
      if (err && err.name === 'SequelizeUniqueConstraintError') throw new ValidationError('Esa mesa ya tiene una cuenta abierta.');
      throw err;
    }
    await e.update({ estado: 'SENTADO', cuentaId, atendida_en: new Date() }, { transaction: t });
    datos = { esperaId: e.id, nombre: e.nombre, mesa: mesa.nombre, estado: 'SENTADO' };
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'No está en la lista de espera' });
  auditar(req, 'lista_espera_actualizada', datos);
  res.status(201).json(await detalleDeCuenta(req.empresaId, cuentaId));
};
