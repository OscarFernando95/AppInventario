'use strict';

const { sequelize, AnulacionVenta, Venta, Cliente, Usuario } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { auditar } = require('../utils/audit');
const { invalidateDashboard } = require('./reporteController');
const { invalidateInforme } = require('./informeController');
const { anularVenta } = require('../services/anulacionService');

const esAdmin = (req) => req.tipoRol === 'FRONT_ADMIN';

const INCLUDES = [
  { model: Venta, as: 'venta', attributes: ['id', 'fecha', 'total', 'estado', 'forma_pago', 'medio_pago'], include: [{ model: Cliente, attributes: ['nombre'] }] },
  { model: Usuario, as: 'solicitante', attributes: ['id', 'nombre'] },
  { model: Usuario, as: 'resolutor', attributes: ['id', 'nombre'], required: false },
];

/** Auditoría + cachés tras anular. */
async function alAnular(req, venta, devolucion, extra = {}) {
  invalidateDashboard(req.empresaId);
  invalidateInforme(req.empresaId);
  const cliente = venta.clienteId ? await Cliente.findByPk(venta.clienteId, { attributes: ['nombre'] }) : null;
  auditar(req, 'venta_anulada', {
    ventaId: venta.id,
    total: Number(venta.total),
    motivo: venta.motivo_anulacion,
    clienteNombre: cliente?.nombre || null,
    devolucionDeCaja: !!devolucion,
    ...extra,
  });
}

/**
 * Un solo punto de entrada para "Anular venta":
 *   - Administrador: la anula en el acto.
 *   - Cualquier otro usuario: deja una SOLICITUD que el administrador aprueba o rechaza.
 */
exports.anularOSolicitar = async (req, res) => {
  const { motivo } = req.body;

  if (esAdmin(req)) {
    const r = await sequelize.transaction((t) => anularVenta(req, t, req.params.id, motivo));
    if (!r) return res.status(404).json({ error: 'Venta no encontrada' });
    await alAnular(req, r.venta, r.devolucion);
    return res.json({ resultado: 'ANULADA', venta: r.venta, devolucion: r.devolucion });
  }

  const venta = await Venta.findOne({ where: { id: req.params.id, empresaId: req.empresaId } });
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
  if (venta.estado === 'ANULADA') throw new ValidationError('Esta venta ya está anulada.');

  let solicitud;
  try {
    solicitud = await AnulacionVenta.create({
      empresaId: req.empresaId, ventaId: venta.id, solicitada_por: req.userId, motivo,
    });
  } catch (err) {
    if (err && err.name === 'SequelizeUniqueConstraintError') {
      throw new ValidationError('Esta venta ya tiene una solicitud de anulación pendiente.');
    }
    throw err;
  }
  auditar(req, 'venta_anulacion_solicitada', { ventaId: venta.id, total: Number(venta.total), motivo });
  res.status(201).json({ resultado: 'SOLICITADA', solicitud });
};

/** Solicitudes de la empresa (el administrador ve todas; los demás, las suyas). */
exports.getAnulaciones = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query, { defaultLimit: 50 });
  const where = { empresaId: req.empresaId, estado: req.query.estado || 'PENDIENTE' };
  if (!esAdmin(req)) where.solicitada_por = req.userId;
  const { count, rows } = await AnulacionVenta.findAndCountAll({
    where, include: INCLUDES, order: [['createdAt', 'DESC']], limit, offset,
  });
  setTotalCount(res, count);
  res.json(rows);
};

exports.aprobar = async (req, res) => {
  let solicitud;
  const r = await sequelize.transaction(async (t) => {
    solicitud = await AnulacionVenta.findOne({ where: { id: req.params.id, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!solicitud) return null;
    if (solicitud.estado !== 'PENDIENTE') throw new ValidationError('Esta solicitud ya fue resuelta.');
    const resultado = await anularVenta(req, t, solicitud.ventaId, solicitud.motivo);
    if (!resultado) throw new ValidationError('La venta de esta solicitud ya no existe.');
    await solicitud.update({ estado: 'APROBADA', resuelta_por: req.userId, resuelta_en: new Date() }, { transaction: t });
    return resultado;
  });
  if (!r) return res.status(404).json({ error: 'Solicitud no encontrada' });

  const solicitante = await Usuario.findByPk(solicitud.solicitada_por, { attributes: ['nombre'] });
  await alAnular(req, r.venta, r.devolucion, { solicitadaPor: solicitante?.nombre });
  res.json(await AnulacionVenta.findByPk(solicitud.id, { include: INCLUDES }));
};

exports.rechazar = async (req, res) => {
  const { comentario } = req.body;
  let ventaId;
  const ok = await sequelize.transaction(async (t) => {
    const solicitud = await AnulacionVenta.findOne({ where: { id: req.params.id, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!solicitud) return false;
    if (solicitud.estado !== 'PENDIENTE') throw new ValidationError('Esta solicitud ya fue resuelta.');
    ventaId = solicitud.ventaId;
    await solicitud.update({ estado: 'RECHAZADA', resuelta_por: req.userId, resuelta_en: new Date(), comentario: comentario || null }, { transaction: t });
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'Solicitud no encontrada' });

  auditar(req, 'venta_anulacion_rechazada', { ventaId, comentario: comentario || null });
  res.json(await AnulacionVenta.findByPk(req.params.id, { include: INCLUDES }));
};
