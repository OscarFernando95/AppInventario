'use strict';

const { Op } = require('sequelize');
const { sequelize, Reserva, Mesa, Cuenta, Usuario } = require('../models');
const { ValidationError } = require('../utils/errors');
const { auditar } = require('../utils/audit');
const { detalleDeCuenta } = require('../services/cuentaService');
const { fechaISO } = require('../services/lotes');

// Dos reservas de la misma mesa deben quedar separadas por al menos este tiempo.
const VENTANA_MIN = 90;

const INCLUDE = [
  { model: Mesa, as: 'mesa', attributes: ['id', 'nombre'] },
  { model: Usuario, as: 'registro', attributes: ['id', 'nombre'] },
];

const fmtHora = (d) => new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Una mesa no puede tener dos reservas pendientes a menos de `VENTANA_MIN` minutos una de otra. */
async function validarMesaLibre(empresaId, mesaId, fechaHora, ignorarId, transaction) {
  if (!mesaId) return;
  const mesa = await Mesa.findOne({ where: { id: mesaId, empresaId }, transaction });
  if (!mesa || !mesa.activa) throw new ValidationError('Mesa inválida o inactiva.');
  const t = new Date(fechaHora).getTime();
  const choque = await Reserva.findOne({
    where: {
      empresaId, mesaId, estado: 'PENDIENTE',
      ...(ignorarId ? { id: { [Op.ne]: ignorarId } } : {}),
      fecha_hora: { [Op.between]: [new Date(t - VENTANA_MIN * 60_000 + 1), new Date(t + VENTANA_MIN * 60_000 - 1)] },
    },
    transaction,
  });
  if (choque) throw new ValidationError(`«${mesa.nombre}» ya está reservada para ${choque.nombre} a las ${fmtHora(choque.fecha_hora)}.`);
}

/** Reservas de un día (hoy por omisión), de la más próxima a la más lejana. */
exports.getReservas = async (req, res) => {
  const dia = req.query.fecha || fechaISO();
  const reservas = await Reserva.findAll({
    where: {
      empresaId: req.empresaId,
      fecha_hora: { [Op.between]: [new Date(`${dia}T00:00:00`), new Date(`${dia}T23:59:59.999`)] },
      ...(req.query.estado ? { estado: req.query.estado } : {}),
    },
    include: INCLUDE,
    order: [['fecha_hora', 'ASC'], ['id', 'ASC']],
  });
  res.json(reservas);
};

exports.createReserva = async (req, res) => {
  const reserva = await sequelize.transaction(async (t) => {
    if (new Date(req.body.fecha_hora).getTime() < Date.now() - 15 * 60_000) throw new ValidationError('La fecha de la reserva ya pasó.');
    await validarMesaLibre(req.empresaId, req.body.mesaId, req.body.fecha_hora, null, t);
    return Reserva.create({ ...req.body, mesaId: req.body.mesaId || null, empresaId: req.empresaId, usuarioId: req.userId }, { transaction: t });
  });
  const completa = await Reserva.findByPk(reserva.id, { include: INCLUDE });
  auditar(req, 'reserva_creada', { reservaId: reserva.id, nombre: reserva.nombre, personas: reserva.personas, mesa: completa.mesa?.nombre, fecha: fmtHora(reserva.fecha_hora) });
  res.status(201).json(completa);
};

exports.updateReserva = async (req, res) => {
  const reserva = await sequelize.transaction(async (t) => {
    const r = await Reserva.findOne({ where: { id: req.params.id, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!r) return null;
    if (r.estado === 'SENTADA') throw new ValidationError('Esta reserva ya se sentó.');
    const cambios = { ...req.body };
    const sigue = (cambios.estado || r.estado) === 'PENDIENTE';
    if (sigue && (cambios.mesaId !== undefined || cambios.fecha_hora !== undefined)) {
      await validarMesaLibre(req.empresaId, cambios.mesaId !== undefined ? cambios.mesaId : r.mesaId, cambios.fecha_hora || r.fecha_hora, r.id, t);
    }
    await r.update(cambios, { transaction: t });
    return r;
  });
  if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });
  const completa = await Reserva.findByPk(reserva.id, { include: INCLUDE });
  auditar(req, 'reserva_actualizada', { reservaId: reserva.id, nombre: reserva.nombre, mesa: completa.mesa?.nombre, estado: req.body.estado });
  res.json(completa);
};

/** Llegaron: se abre la cuenta de la mesa (la de la reserva u otra libre) con sus comensales y la reserva queda SENTADA. */
exports.sentarReserva = async (req, res) => {
  let cuentaId; let datos;
  const ok = await sequelize.transaction(async (t) => {
    const r = await Reserva.findOne({ where: { id: req.params.id, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!r) return false;
    if (r.estado !== 'PENDIENTE') throw new ValidationError('Esta reserva ya no está pendiente.');
    const mesaId = req.body.mesaId || r.mesaId;
    if (!mesaId) throw new ValidationError('Elige la mesa donde se sientan.');
    const mesa = await Mesa.findOne({ where: { id: mesaId, empresaId: req.empresaId }, transaction: t });
    if (!mesa || !mesa.activa) throw new ValidationError('Mesa inválida o inactiva.');
    if (await Cuenta.findOne({ where: { mesaId, estado: 'ABIERTA' }, transaction: t })) throw new ValidationError(`«${mesa.nombre}» ya tiene una cuenta abierta.`);
    try {
      const cuenta = await Cuenta.create({
        empresaId: req.empresaId, mesaId, usuarioId: req.userId, comensales: r.personas, nota: `Reserva de ${r.nombre}`, abierta_en: new Date(),
      }, { transaction: t });
      cuentaId = cuenta.id;
    } catch (err) {
      if (err && err.name === 'SequelizeUniqueConstraintError') throw new ValidationError('Esa mesa ya tiene una cuenta abierta.');
      throw err;
    }
    await r.update({ estado: 'SENTADA', cuentaId, mesaId }, { transaction: t });
    datos = { reservaId: r.id, nombre: r.nombre, mesa: mesa.nombre, estado: 'SENTADA' };
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'Reserva no encontrada' });
  auditar(req, 'reserva_actualizada', datos);
  res.status(201).json(await detalleDeCuenta(req.empresaId, cuentaId));
};
