'use strict';

const { Producto, RecetaItem, ComboItem } = require('../models');

/** Productos de la empresa con su receta (JSON plano), listos para analizarProductos. */
async function cargarProductosConReceta(empresaId, { transaction } = {}) {
  const productos = await Producto.findAll({
    where: { empresaId },
    include: [
      { model: RecetaItem, as: 'receta', attributes: ['insumoId', 'cantidad'] },
      { model: ComboItem, as: 'combo', attributes: ['productoId', 'cantidad'] },
    ],
    order: [['nombre_producto', 'ASC']],
    transaction,
  });
  return productos.map((p) => p.toJSON());
}

module.exports = { cargarProductosConReceta };
