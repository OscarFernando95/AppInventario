'use strict';

const { Mesa, Cuenta } = require('../models');
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
  const [mesas, abiertas] = await Promise.all([
    Mesa.findAll({ where, order: [['nombre', 'ASC']] }),
    cuentasAbiertas(req.empresaId),
  ]);
  const porMesa = new Map(abiertas.filter((c) => c.mesaId).map((c) => [c.mesaId, c]));
  res.json({
    mesas: mesas.map((m) => ({ ...m.toJSON(), cuenta: porMesa.get(m.id) || null })),
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
