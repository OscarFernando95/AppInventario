const { Op } = require('sequelize');
const { LogEvento, Usuario, Empresa } = require('../models');
const { parseListQuery, setTotalCount } = require('../utils/pagination');

exports.getLogs = async (req, res) => {
  const { evento, nivel, desde, hasta } = req.query;
  const { limit, offset } = parseListQuery(req.query, { defaultLimit: 50, maxLimit: 200 });

  const where = {};
  if (evento) where.evento = evento;
  if (nivel) where.nivel = nivel;
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
};
