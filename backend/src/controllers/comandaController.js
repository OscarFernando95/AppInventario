'use strict';

const { sequelize, Comanda } = require('../models');
const { listarComandas, detalleDeComanda } = require('../services/cuentaService');

/** Comandas que cocina tiene a la vista (por omisión pendientes y listas), de la más antigua a la más nueva. */
exports.getComandas = async (req, res) => {
  const estados = req.query.estado ? req.query.estado.split(',') : undefined;
  res.json(await listarComandas(req.empresaId, estados));
};

exports.getComanda = async (req, res) => {
  const comanda = await detalleDeComanda(req.empresaId, req.params.id);
  if (!comanda) return res.status(404).json({ error: 'Comanda no encontrada' });
  res.json(comanda);
};

/** PENDIENTE -> LISTA (cocina) -> ENTREGADA (mesero). También se puede devolver a un estado anterior si se marcó por error. */
exports.cambiarEstado = async (req, res) => {
  const { estado } = req.body;
  const ok = await sequelize.transaction(async (t) => {
    const comanda = await Comanda.findOne({ where: { id: req.params.id, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!comanda) return false;
    const ahora = new Date();
    await comanda.update({
      estado,
      lista_en: estado === 'PENDIENTE' ? null : (comanda.lista_en || ahora),
      entregada_en: estado === 'ENTREGADA' ? ahora : null,
    }, { transaction: t });
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'Comanda no encontrada' });
  res.json(await detalleDeComanda(req.empresaId, req.params.id));
};
