'use strict';

const { sequelize, Produccion, Producto, Usuario } = require('../models');
const { Op } = require('sequelize');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { buildListWhere } = require('../utils/listFilters');
const { auditar } = require('../utils/audit');
const { invalidateDashboard } = require('./reporteController');
const { producir, anularProduccion } = require('../services/produccionService');
const { tiene } = require('../middlewares/auth');
const { unidadCorta } = require('../utils/unidades');
const { consumoDeVentasPorProducto } = require('../services/consumoSql');
const { lotesEnExistencia, sugerirProduccion, fechaISO } = require('../services/lotes');

/** Sin el permiso costos.ver la producción sale sin costos. */
function segunPermisoDeCostos(req, produccion) {
  if (tiene(req, 'costos.ver')) return produccion;
  const json = typeof produccion.toJSON === 'function' ? produccion.toJSON() : { ...produccion };
  delete json.costo_unitario;
  delete json.costo_total;
  return json;
}

exports.getProducciones = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query);
  const { count, rows } = await Produccion.findAndCountAll({
    where: { empresaId: req.empresaId, ...buildListWhere(req.query, { fecha: 'fecha', igualdad: ['productoId', 'estado'] }) },
    include: [
      { model: Producto, attributes: ['nombre_producto', 'codigo', 'unidad_medida'] },
      { model: Usuario, attributes: ['nombre'] },
    ],
    order: [['fecha', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });
  setTotalCount(res, count);
  res.json(rows.map((r) => segunPermisoDeCostos(req, r)));
};

exports.createProduccion = async (req, res) => {
  const { productoId, cantidad, motivo } = req.body;
  const { produccion, prep } = await sequelize.transaction((t) => producir(req, t, { productoId, cantidad, motivo }));

  invalidateDashboard(req.empresaId);
  auditar(req, 'produccion_registrada', {
    produccionId: produccion.id, productoId, productoNombre: prep.nombre_producto, cantidad, unidad: unidadCorta(prep.unidad_medida),
  });
  res.status(201).json(segunPermisoDeCostos(req, produccion));
};

exports.anular = async (req, res) => {
  const resultado = await sequelize.transaction((t) => anularProduccion(req, t, Number(req.params.id)));
  if (!resultado) return res.status(404).json({ error: 'Producción no encontrada' });
  if (!resultado.produccion) throw new ValidationError('No se pudo anular.');

  invalidateDashboard(req.empresaId);
  auditar(req, 'produccion_anulada', {
    produccionId: resultado.produccion.id, productoId: resultado.prep.id, productoNombre: resultado.prep.nombre_producto, cantidad: Number(resultado.produccion.cantidad), unidad: unidadCorta(resultado.prep.unidad_medida),
  });
  res.json(segunPermisoDeCostos(req, resultado.produccion));
};

/** Preparaciones por lotes con su vida útil y los lotes que siguen en existencia (con lo que ya venció). */
exports.getLotes = async (req, res) => {
  const preps = await Producto.findAll({
    where: { empresaId: req.empresaId, tipo: 'PREPARACION', por_lotes: true },
    attributes: ['id', 'nombre_producto', 'codigo', 'unidad_medida', 'stock_actual', 'vida_util_dias'],
    order: [['nombre_producto', 'ASC']],
  });
  const hoy = fechaISO();
  const salida = [];
  for (const p of preps) {
    const stock = Number(p.stock_actual);
    // Con tener los lotes de los últimos 120 días basta: el stock casi nunca llega más atrás.
    const lotes = stock > 0
      ? await Produccion.findAll({
        where: { empresaId: req.empresaId, productoId: p.id, estado: 'ACTIVA', fecha: { [Op.gte]: new Date(Date.now() - 120 * 86_400_000) } },
        attributes: ['id', 'fecha', 'cantidad', 'vence_en'],
        raw: true,
      })
      : [];
    const r = lotesEnExistencia(lotes, stock, hoy);
    salida.push({
      productoId: p.id, nombre_producto: p.nombre_producto, codigo: p.codigo, unidad_medida: p.unidad_medida,
      stock, vida_util_dias: p.vida_util_dias, ...r,
    });
  }
  res.json(salida);
};

/** Cuánto producir hoy de cada preparación por lotes, según lo que se vendió en los últimos `dias`. */
exports.getSugerencias = async (req, res) => {
  const dias = req.query.dias || 14;
  const cobertura = req.query.cobertura || 1;
  const preps = await Producto.findAll({
    where: { empresaId: req.empresaId, tipo: 'PREPARACION', por_lotes: true },
    attributes: ['id', 'nombre_producto', 'codigo', 'unidad_medida', 'stock_actual', 'rendimiento'],
    order: [['nombre_producto', 'ASC']],
  });
  const desde = new Date(Date.now() - dias * 86_400_000);
  const consumo = new Map((await consumoDeVentasPorProducto(req.empresaId, { desde, productoIds: preps.map((p) => p.id) })).map((c) => [c.productoId, c.cantidad]));
  res.json({
    dias,
    cobertura,
    sugerencias: preps.map((p) => ({
      productoId: p.id, nombre_producto: p.nombre_producto, codigo: p.codigo, unidad_medida: p.unidad_medida,
      stock: Number(p.stock_actual), rendimiento: Number(p.rendimiento),
      consumo_periodo: consumo.get(p.id) || 0,
      ...sugerirProduccion({ stock: Number(p.stock_actual), consumoTotal: consumo.get(p.id) || 0, dias, cobertura }),
    })).sort((a, b) => b.sugerido - a.sugerido),
  });
};
