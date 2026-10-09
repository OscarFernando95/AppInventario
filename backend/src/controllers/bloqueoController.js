'use strict';

const { Op } = require('sequelize');
const { sequelize, MesaBloqueo, Mesa, Cuenta, Usuario } = require('../models');
const { ValidationError } = require('../utils/errors');
const { auditar } = require('../utils/audit');
const { estaVigente } = require('../services/bloqueos');

const INCLUDE = [
  { model: Mesa, as: 'mesa', attributes: ['id', 'nombre'] },
  { model: Usuario, as: 'registro', attributes: ['id', 'nombre'] },
];

const fmt = (d) => new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Bloqueos vigentes y futuros (los ya vencidos o quitados no se listan). */
exports.getBloqueos = async (req, res) => {
  const ahora = new Date();
  const filas = await MesaBloqueo.findAll({
    where: { empresaId: req.empresaId, activo: true, hasta: { [Op.gt]: ahora } },
    include: INCLUDE,
    order: [['desde', 'ASC'], ['id', 'ASC']],
  });
  res.json(filas.map((b) => ({ ...b.toJSON(), vigente: estaVigente(b, ahora) })));
};

exports.createBloqueo = async (req, res) => {
  const { mesaId, desde, hasta, motivo } = req.body;
  const ahora = Date.now();
  if (hasta.getTime() <= ahora) throw new ValidationError('El bloqueo debe terminar en el futuro.');
  const id = await sequelize.transaction(async (t) => {
    const mesa = await Mesa.findOne({ where: { id: mesaId, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!mesa || !mesa.activa) throw new ValidationError('Mesa inválida o inactiva.');
    // Si el bloqueo empieza ya, la mesa no puede estar ocupada; a futuro sí (la cuenta de hoy terminará antes).
    if (desde.getTime() <= ahora &&(await Cuenta.findOne({ where: { mesaId: mesa.id, estado: 'ABIERTA' }, transaction: t }))) {
      throw new ValidationError(`«${mesa.nombre}» tiene una cuenta abierta: cóbrala o cancélala antes de bloquearla.`);
    }
    const choque = await MesaBloqueo.findOne({
      where: { mesaId: mesa.id, activo: true, desde: { [Op.lt]: hasta }, hasta: { [Op.gt]: desde } },
      transaction: t,
    });
    if (choque) throw new ValidationError(`«${mesa.nombre}» ya está bloqueada de ${fmt(choque.desde)} a ${fmt(choque.hasta)}.`);
    const b = await MesaBloqueo.create({ empresaId: req.empresaId, mesaId: mesa.id, usuarioId: req.userId, desde, hasta, motivo: motivo || null }, { transaction: t });
    return b.id;
  });
  const completo = await MesaBloqueo.findByPk(id, { include: INCLUDE });
  auditar(req, 'mesa_bloqueada', { bloqueoId: id, mesa: completo.mesa?.nombre, desde: fmt(completo.desde), hasta: fmt(completo.hasta), motivo });
  res.status(201).json({ ...completo.toJSON(), vigente: estaVigente(completo) });
};

/** Quitar el bloqueo: la mesa vuelve a servicio (el registro se conserva, inactivo). */
exports.deleteBloqueo = async (req, res) => {
  const b = await MesaBloqueo.findOne({ where: { id: req.params.id, empresaId: req.empresaId, activo: true }, include: INCLUDE });
  if (!b) return res.status(404).json({ error: 'Bloqueo no encontrado' });
  await b.update({ activo: false });
  auditar(req, 'mesa_desbloqueada', { bloqueoId: b.id, mesa: b.mesa?.nombre });
  res.json({ ok: true });
};
