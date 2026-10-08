'use strict';

const { fn, col } = require('sequelize');
const { sequelize, Gasto, CajaMovimiento, Caja, Proveedor, Usuario } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { buildListWhere } = require('../utils/listFilters');
const { auditar } = require('../utils/audit');
const { invalidateDashboard } = require('./reporteController');
const { registrarEgreso, redondear2 } = require('../services/cajaService');

const FILTROS = (query) => buildListWhere(query, { fecha: 'fecha', igualdad: ['categoria', 'estado'] });

const INCLUDES = [
  { model: Proveedor, attributes: ['id', 'nombre'] },
  { model: Usuario, as: 'usuario', attributes: ['nombre'] },
];

exports.getGastos = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query);
  const { count, rows } = await Gasto.findAndCountAll({
    where: { empresaId: req.empresaId, ...FILTROS(req.query) },
    include: INCLUDES,
    order: [['fecha', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });
  setTotalCount(res, count);
  res.json(rows);
};

/** Total por categoría (solo gastos activos) en el rango pedido. */
exports.getResumen = async (req, res) => {
  const filas = await Gasto.findAll({
    where: { empresaId: req.empresaId, estado: 'ACTIVO', ...buildListWhere(req.query, { fecha: 'fecha' }) },
    attributes: ['categoria', [fn('COUNT', col('id')), 'num'], [fn('SUM', col('monto')), 'total']],
    group: ['categoria'],
    raw: true,
  });
  const por_categoria = filas.map((f) => ({ categoria: f.categoria, num: Number(f.num), total: redondear2(f.total) }))
    .sort((a, b) => b.total - a.total);
  res.json({ por_categoria, total: redondear2(por_categoria.reduce((a, f) => a + f.total, 0)) });
};

exports.createGasto = async (req, res) => {
  const { proveedorId, fecha, pagar_desde_caja: desdeCaja, ...datos } = req.body;
  if (desdeCaja && !req.empresaModulos?.has('Caja')) {
    throw new ValidationError('El módulo "Caja" no está activo: no se puede pagar desde la caja.');
  }

  const gasto = await sequelize.transaction(async (t) => {
    if (proveedorId) {
      const prov = await Proveedor.findOne({ where: { id: proveedorId, empresaId: req.empresaId }, transaction: t });
      if (!prov) throw new ValidationError('Proveedor inválido.');
    }
    const nuevo = await Gasto.create({
      ...datos,
      empresaId: req.empresaId,
      usuarioId: req.userId,
      proveedorId: proveedorId || null,
      // Con fecha explícita se guarda al mediodía (evita saltos de día por zona horaria).
      fecha: fecha ? new Date(`${fecha}T12:00:00`) : new Date(),
      origen_pago: desdeCaja ? 'CAJA' : 'OTRO',
    }, { transaction: t });

    if (desdeCaja) {
      await registrarEgreso(req, t, { tipo: 'GASTO', concepto: datos.descripcion, monto: datos.monto, gastoId: nuevo.id });
    }
    return nuevo;
  });

  invalidateDashboard(req.empresaId);
  auditar(req, 'gasto_creado', { gastoId: gasto.id, descripcion: gasto.descripcion, categoria: gasto.categoria, monto: Number(gasto.monto), origen_pago: gasto.origen_pago });
  res.status(201).json(await Gasto.findByPk(gasto.id, { include: INCLUDES }));
};

/**
 * Anula un gasto (queda en el historial pero deja de contar). Si salió de la
 * caja, el efectivo vuelve a ella — solo mientras esa caja siga abierta: un
 * turno cerrado ya cuadró y no se reescribe.
 */
exports.anularGasto = async (req, res) => {
  let anulado;
  const ok = await sequelize.transaction(async (t) => {
    const gasto = await Gasto.findOne({ where: { id: req.params.id, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!gasto) return false;
    anulado = gasto;
    if (gasto.estado === 'ANULADO') throw new ValidationError('Este gasto ya está anulado.');

    if (gasto.origen_pago === 'CAJA') {
      const mov = await CajaMovimiento.findOne({ where: { gastoId: gasto.id }, transaction: t });
      if (mov) {
        const caja = await Caja.findByPk(mov.cajaId, { transaction: t, lock: t.LOCK.UPDATE });
        if (caja.estado !== 'ABIERTA') {
          throw new ValidationError('La caja donde se pagó este gasto ya fue cerrada; no se puede anular.');
        }
        await mov.destroy({ transaction: t });
      }
    }
    await gasto.update({ estado: 'ANULADO', anulado_en: new Date(), anulado_por: req.userId }, { transaction: t });
    return true;
  });
  if (!ok) return res.status(404).json({ error: 'Gasto no encontrado' });

  invalidateDashboard(req.empresaId);
  auditar(req, 'gasto_anulado', { gastoId: Number(req.params.id), descripcion: anulado.descripcion, monto: Number(anulado.monto) });
  res.json(await Gasto.findByPk(req.params.id, { include: INCLUDES }));
};
