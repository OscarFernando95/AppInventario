'use strict';

const { sequelize, Produccion, Producto, Usuario } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { buildListWhere } = require('../utils/listFilters');
const { auditar } = require('../utils/audit');
const { invalidateDashboard } = require('./reporteController');
const { producir, anularProduccion } = require('../services/produccionService');
const { tiene } = require('../middlewares/auth');
const { unidadCorta } = require('../utils/unidades');

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
