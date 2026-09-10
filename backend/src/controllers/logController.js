const { Op } = require('sequelize');
const { LogEvento, Usuario, Empresa } = require('../models');
const { parseListQuery, setTotalCount } = require('../utils/pagination');

/**
 * Consulta paginada y filtrable de `logs_eventos`. La usa tanto el backoffice
 * (todos los eventos de todas las empresas) como la vista de auditoría del
 * FRONT_ADMIN (acotada a su empresa vía `whereBase`).
 */
async function listarEventos(req, res, whereBase = {}) {
  const { evento, nivel, desde, hasta, usuarioId } = req.query;
  const { limit, offset } = parseListQuery(req.query, { defaultLimit: 50, maxLimit: 200 });

  const where = { ...whereBase };
  if (evento) where.evento = evento;
  if (nivel) where.nivel = nivel;
  if (usuarioId) where.usuarioId = Number(usuarioId);
  if (desde || hasta) {
    where.creado_en = {};
    // Mismo criterio que informeController: rango en hora local del servidor.
    if (desde) where.creado_en[Op.gte] = new Date(`${desde}T00:00:00`);
    if (hasta) where.creado_en[Op.lte] = new Date(`${hasta}T23:59:59.999`);
  }

  const { count, rows } = await LogEvento.findAndCountAll({
    where,
    include: [
      { model: Usuario, attributes: ['id', 'nombre', 'username'], required: false },
      { model: Empresa, attributes: ['id', 'nombre'], required: false },
    ],
    order: [['creado_en', 'DESC']],
    limit,
    offset,
  });

  setTotalCount(res, count);
  res.json(rows);
}

// Backoffice: todos los eventos, sin acotar.
exports.getLogs = (req, res) => listarEventos(req, res, {});

// FRONT_ADMIN: solo los eventos de su empresa activa.
exports.getAuditoria = (req, res) => listarEventos(req, res, { empresaId: req.empresaId });

exports.listarEventos = listarEventos;
