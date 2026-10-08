'use strict';

const { Op, fn, col } = require('sequelize');
const { LogEvento, Usuario, Empresa } = require('../models');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { describirEvento, EVENTOS_GERENCIALES, eventosDeModulo, MODULOS } = require('../utils/auditoriaTexto');

/**
 * Auditoría GERENCIAL de la empresa activa: quién (usuario), cuándo (fecha y
 * hora) y de qué empresa hizo qué cosa, en frases legibles. Solo acciones de
 * negocio; el detalle técnico (requests, errores, niveles) es del backoffice.
 */
exports.getActividad = async (req, res) => {
  const { modulo, usuarioId, desde, hasta } = req.query;
  const { limit, offset } = parseListQuery(req.query, { defaultLimit: 50, maxLimit: 200 });

  const where = {
    empresaId: req.empresaId,
    evento: { [Op.in]: modulo ? eventosDeModulo(modulo) : EVENTOS_GERENCIALES },
  };
  if (usuarioId) where.usuarioId = Number(usuarioId);
  if (desde || hasta) {
    where.creado_en = {};
    // Mismo criterio que el resto de listados: rango en hora local del servidor.
    if (desde) where.creado_en[Op.gte] = new Date(`${desde}T00:00:00`);
    if (hasta) where.creado_en[Op.lte] = new Date(`${hasta}T23:59:59.999`);
  }

  const { count, rows } = await LogEvento.findAndCountAll({
    where,
    include: [
      { model: Usuario, attributes: ['id', 'nombre', 'username'], required: false },
      { model: Empresa, attributes: ['id', 'nombre'], required: false },
    ],
    order: [['creado_en', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });

  setTotalCount(res, count);
  res.json(rows.map((r) => ({
    id: r.id,
    fecha: r.creado_en,
    usuario: r.Usuario ? { id: r.Usuario.id, nombre: r.Usuario.nombre, username: r.Usuario.username } : null,
    empresa: r.Empresa ? { id: r.Empresa.id, nombre: r.Empresa.nombre } : null,
    ...describirEvento(r.evento, r.detalle),
  })));
};

/** Opciones de los filtros: módulos y usuarios que han hecho algo en la empresa. */
exports.getFiltros = async (req, res) => {
  const filas = await LogEvento.findAll({
    where: { empresaId: req.empresaId, evento: { [Op.in]: EVENTOS_GERENCIALES }, usuarioId: { [Op.ne]: null } },
    attributes: [[fn('DISTINCT', col('usuarioId')), 'usuarioId']],
    raw: true,
  });
  const ids = filas.map((f) => f.usuarioId);
  const usuarios = ids.length
    ? await Usuario.findAll({ where: { id: ids }, attributes: ['id', 'nombre', 'username'], order: [['nombre', 'ASC']] })
    : [];
  res.json({ modulos: MODULOS, usuarios });
};
