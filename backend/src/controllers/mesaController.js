'use strict';

const { Op } = require('sequelize');
const { Mesa, Cuenta, Empresa, Reserva } = require('../models');
const { ValidationError } = require('../utils/errors');
const { auditar } = require('../utils/audit');
const { cuentasAbiertas } = require('../services/cuentaService');

/** Un nombre repetido (índice único por empresa) se traduce a un 400 legible. */
function traducirDuplicado(err) {
  if (err && err.name === 'SequelizeUniqueConstraintError') return new ValidationError('Ya existe una mesa con ese nombre.');
  return err;
}

/** Mesas con su cuenta abierta (si la tiene) y las cuentas abiertas sin mesa ("para llevar"). */
exports.getMesas = async (req, res) => {
  const where = { empresaId: req.empresaId, ...(req.query.todas ? {} : { activa: true }) };
  // Reservas pendientes que llegan pronto (o se atrasaron hasta una hora): se avisan en la tarjeta de la mesa.
  const ahora = Date.now();
  const proximas = await Reserva.findAll({
    where: { empresaId: req.empresaId, estado: 'PENDIENTE', mesaId: { [Op.ne]: null }, fecha_hora: { [Op.between]: [new Date(ahora - 60 * 60_000), new Date(ahora + 3 * 60 * 60_000)] } },
    attributes: ['id', 'mesaId', 'nombre', 'personas', 'fecha_hora'],
    order: [['fecha_hora', 'ASC']],
  });
  const reservaPorMesa = new Map();
  for (const r of proximas) if (!reservaPorMesa.has(r.mesaId)) reservaPorMesa.set(r.mesaId, r);
  const [mesas, abiertas, empresa] = await Promise.all([
    Mesa.findAll({ where, order: [['nombre', 'ASC']] }),
    cuentasAbiertas(req.empresaId),
    Empresa.findByPk(req.empresaId, { attributes: ['propina_sugerida_pct'] }),
  ]);
  const porMesa = new Map(abiertas.filter((c) => c.mesaId).map((c) => [c.mesaId, c]));
  res.json({
    config: { propina_sugerida_pct: Number(empresa?.propina_sugerida_pct ?? 10) },
    mesas: mesas.map((m) => ({ ...m.toJSON(), cuenta: porMesa.get(m.id) || null, reserva: reservaPorMesa.get(m.id) || null })),
    sin_mesa: abiertas.filter((c) => !c.mesaId),
  });
};

exports.createMesa = async (req, res) => {
  try {
    const mesa = await Mesa.create({ ...req.body, empresaId: req.empresaId });
    auditar(req, 'mesa_creada', { mesaId: mesa.id, nombre: mesa.nombre });
    res.status(201).json(mesa);
  } catch (err) {
    throw traducirDuplicado(err);
  }
};

exports.updateMesa = async (req, res) => {
  const mesa = await Mesa.findOne({ where: { id: req.params.id, empresaId: req.empresaId } });
  if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
  if (req.body.activa === false) {
    const abierta = await Cuenta.count({ where: { mesaId: mesa.id, estado: 'ABIERTA' } });
    if (abierta > 0) throw new ValidationError(`«${mesa.nombre}» tiene una cuenta abierta: cóbrala o cancélala antes de desactivarla.`);
  }
  try {
    await mesa.update(req.body);
  } catch (err) {
    throw traducirDuplicado(err);
  }
  auditar(req, 'mesa_actualizada', { mesaId: mesa.id, nombre: mesa.nombre, activa: mesa.activa });
  res.json(mesa);
};

/** Propina sugerida al cobrar (0 = no sugerir). */
exports.updateConfig = async (req, res) => {
  const { propina_sugerida_pct: pct } = req.body;
  await Empresa.update({ propina_sugerida_pct: pct }, { where: { id: req.empresaId } });
  auditar(req, 'propina_sugerida_cambiada', { pct });
  res.json({ propina_sugerida_pct: pct });
};
