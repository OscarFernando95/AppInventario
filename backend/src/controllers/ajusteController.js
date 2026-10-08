'use strict';

const { fn, col } = require('sequelize');
const { sequelize, AjusteInventario, Producto, Usuario } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { buildListWhere } = require('../utils/listFilters');
const { auditar } = require('../utils/audit');
const { invalidateDashboard } = require('./reporteController');
const { TIPOS_CON_RECETA, redondear3 } = require('../services/recetas');

const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const UNIDADES_CORTAS = { 94: 'ud', KGM: 'kg', GRM: 'g', LBR: 'lb', ONZ: 'oz', LTR: 'L', MLT: 'ml', MTK: 'm²', HUR: 'h' };
const unidadCortaBackend = (codigo) => UNIDADES_CORTAS[codigo] || 'ud';

const FILTROS = (query) => buildListWhere(query, { fecha: 'fecha', igualdad: ['tipo', 'productoId'] });

/** Solo los productos con stock propio se ajustan (no platos ni preparaciones). */
function exigirConStock(producto) {
  if (TIPOS_CON_RECETA.includes(producto.tipo)) {
    throw new ValidationError(`"${producto.nombre_producto}" no tiene stock propio (se descuenta de sus ingredientes).`);
  }
}

async function registrar(req, t, producto, tipo, nueva, motivo) {
  const anterior = Number(producto.stock_actual);
  const diferencia = redondear3(nueva - anterior);
  const costo = Number(producto.costo_promedio);
  await producto.update({ stock_actual: nueva }, { transaction: t });
  return AjusteInventario.create({
    empresaId: req.empresaId,
    productoId: producto.id,
    usuarioId: req.userId,
    tipo,
    cantidad_anterior: anterior,
    cantidad_nueva: nueva,
    diferencia,
    costo_unitario: costo,
    valor: redondear2(diferencia * costo),
    motivo: motivo || null,
    fecha: new Date(),
  }, { transaction: t });
}

/** Merma / vencido / consumo interno: baja el stock de un producto. */
exports.registrarSalida = async (req, res) => {
  const { productoId, tipo, cantidad, motivo } = req.body;

  let producto;
  const ajuste = await sequelize.transaction(async (t) => {
    producto = await Producto.findOne({ where: { id: productoId, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!producto) throw new ValidationError('Producto inválido.');
    exigirConStock(producto);
    if (Number(producto.stock_actual) < cantidad) {
      throw new ValidationError(`No hay suficiente stock de "${producto.nombre_producto}" (hay ${Number(producto.stock_actual)}).`);
    }
    return registrar(req, t, producto, tipo, redondear3(Number(producto.stock_actual) - cantidad), motivo);
  });

  invalidateDashboard(req.empresaId);
  auditar(req, 'ajuste_inventario', {
    ajusteId: ajuste.id, productoId, productoNombre: producto.nombre_producto, tipo, cantidad, unidad: unidadCortaBackend(producto.unidad_medida), valor: Number(ajuste.valor),
  });
  res.status(201).json(ajuste);
};

/**
 * Conteo físico: el stock real reemplaza al del sistema. Solo se registra un
 * ajuste donde hay diferencia (stock teórico vs. real), valorizada al costo.
 */
exports.registrarConteo = async (req, res) => {
  const { items, motivo } = req.body;
  const ids = items.map((i) => i.productoId);
  if (new Set(ids).size !== ids.length) throw new ValidationError('Hay productos repetidos en el conteo.');

  const resultado = await sequelize.transaction(async (t) => {
    // Orden fijo de locks (por id) para no cruzarse con otra transacción.
    const productos = await Producto.findAll({
      where: { id: ids, empresaId: req.empresaId }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE,
    });
    if (productos.length !== ids.length) throw new ValidationError('Producto inválido en el conteo.');
    const contado = new Map(items.map((i) => [i.productoId, i.cantidad_contada]));

    const ajustes = [];
    let sinCambio = 0;
    for (const p of productos) {
      exigirConStock(p);
      const nueva = contado.get(p.id);
      if (Math.abs(nueva - Number(p.stock_actual)) < 0.0005) { sinCambio += 1; continue; }
      ajustes.push(await registrar(req, t, p, 'CONTEO', nueva, motivo));
    }
    return { ajustes, sinCambio };
  });

  invalidateDashboard(req.empresaId);
  const valor = redondear2(resultado.ajustes.reduce((a, x) => a + Number(x.valor), 0));
  auditar(req, 'conteo_fisico', { ajustados: resultado.ajustes.length, sinCambio: resultado.sinCambio, valor });
  res.status(201).json({ ajustados: resultado.ajustes.length, sin_cambio: resultado.sinCambio, valor_total: valor, ajustes: resultado.ajustes });
};

exports.getAjustes = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query);
  const { count, rows } = await AjusteInventario.findAndCountAll({
    where: { empresaId: req.empresaId, ...FILTROS(req.query) },
    include: [
      { model: Producto, attributes: ['nombre_producto', 'codigo', 'unidad_medida'] },
      { model: Usuario, attributes: ['nombre'] },
    ],
    order: [['fecha', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });
  setTotalCount(res, count);
  res.json(rows);
};

/** Pérdidas (y sobrantes) valorizadas por tipo, en el rango pedido. */
exports.getResumen = async (req, res) => {
  const filas = await AjusteInventario.findAll({
    where: { empresaId: req.empresaId, ...buildListWhere(req.query, { fecha: 'fecha' }) },
    attributes: ['tipo', [fn('COUNT', col('id')), 'num'], [fn('SUM', col('valor')), 'valor']],
    group: ['tipo'],
    raw: true,
  });
  const porTipo = filas.map((f) => ({ tipo: f.tipo, num: Number(f.num), valor: redondear2(f.valor) }));
  res.json({ por_tipo: porTipo, valor_total: redondear2(porTipo.reduce((a, f) => a + f.valor, 0)) });
};
