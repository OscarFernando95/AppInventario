'use strict';

const { Producto, RecetaItem } = require('../models');
const { TIPOS_CON_RECETA, esPorLotes } = require('./recetas');

/**
 * Carga todas las recetas de la empresa como Map(productoId -> {
 * rendimiento, items }) para expandir sub-recetas sin ir a la BD por ingrediente.
 * Es una empresa de restaurante: son decenas/cientos de filas.
 * `overrides` permite probar una receta que aún no se guardó (validar ciclos).
 * `sinLotes` trata las preparaciones por lotes como cualquier otra (para validar ciclos).
 */
async function cargarRecetas(empresaId, { transaction, overrides, sinLotes = false } = {}) {
  const productos = await Producto.findAll({
    where: { empresaId, tipo: TIPOS_CON_RECETA },
    attributes: ['id', 'tipo', 'rendimiento', 'por_lotes'],
    transaction,
  });
  const ids = productos.map((p) => p.id);
  const items = ids.length
    ? await RecetaItem.findAll({ where: { productoId: ids }, attributes: ['productoId', 'insumoId', 'cantidad'], transaction })
    : [];

  const mapa = new Map(productos.map((p) => [p.id, {
    rendimiento: p.tipo === 'RECETA' ? 1 : (Number(p.rendimiento) || 1), lote: !sinLotes && esPorLotes(p), items: [],
  }]));
  for (const it of items) mapa.get(it.productoId).items.push({ insumoId: it.insumoId, cantidad: Number(it.cantidad) });

  for (const [id, ov] of overrides || []) mapa.set(id, ov);
  return mapa;
}

module.exports = { cargarRecetas };
