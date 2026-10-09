'use strict';

const { Op } = require('sequelize');
const { MesaBloqueo, Mesa } = require('../models');
const { ValidationError } = require('../utils/errors');
const { opcionesDe } = require('../middlewares/opciones');
const { textoBloqueo, textoBloqueoReserva } = require('./bloqueos');

// Duración que se le supone a una reserva para ver si cae dentro de un bloqueo (la misma ventana entre reservas).
const DURACION_RESERVA_MIN = 90;

/** Bloqueo en vigor ahora mismo para la mesa (o null). */
const bloqueoVigente = (mesaId, ahora, transaction) => MesaBloqueo.findOne({
  where: { mesaId, activo: true, desde: { [Op.lte]: ahora }, hasta: { [Op.gt]: ahora } },
  order: [['hasta', 'DESC']],
  transaction,
});

/**
 * Con «Bloqueo de mesas» encendido, no deja abrir una cuenta (o sentar a alguien) en una mesa bloqueada ahora.
 * Con la opción apagada no hace nada (ni consulta la base de datos).
 */
async function exigirMesaSinBloqueo(req, mesa, transaction) {
  if (!(await opcionesDe(req)).bloqueo_mesas) return;
  const ahora = new Date();
  const b = await bloqueoVigente(mesa.id, ahora, transaction);
  if (b) throw new ValidationError(textoBloqueo(mesa.nombre, b, ahora));
}

/** Con «Bloqueo de mesas» encendido, una reserva no puede caer dentro de un bloqueo de su mesa. */
async function exigirReservaSinBloqueo(req, mesaId, fechaHora, transaction) {
  if (!mesaId || !(await opcionesDe(req)).bloqueo_mesas) return;
  const inicio = new Date(fechaHora);
  const fin = new Date(inicio.getTime() + DURACION_RESERVA_MIN * 60_000);
  const b = await MesaBloqueo.findOne({
    where: { mesaId, activo: true, desde: { [Op.lt]: fin }, hasta: { [Op.gt]: inicio } },
    order: [['desde', 'ASC']],
    transaction,
  });
  if (!b) return;
  const mesa = await Mesa.findByPk(mesaId, { attributes: ['nombre'], transaction });
  throw new ValidationError(textoBloqueoReserva(mesa?.nombre || `#${mesaId}`, b, inicio));
}

module.exports = { DURACION_RESERVA_MIN, bloqueoVigente, exigirMesaSinBloqueo, exigirReservaSinBloqueo };
