'use strict';

const { GrupoModificador, Producto } = require('../models');

/** Grupos de modificadores activos de la empresa, planos y con los ids de los platos a los que aplican. */
async function cargarGrupos(empresaId, { transaction } = {}) {
  const grupos = await GrupoModificador.findAll({
    where: { empresaId, activo: true },
    include: [{ model: Producto, as: 'platos', attributes: ['id'], through: { attributes: [] } }],
    order: [['orden', 'ASC'], ['nombre', 'ASC']],
    transaction,
  });
  return grupos.map((g) => ({
    id: g.id, nombre: g.nombre, obligatorio: g.obligatorio, max_selecciones: g.max_selecciones, todos: g.todos, orden: g.orden, activo: g.activo,
    producto_ids: g.platos.map((p) => p.id),
  }));
}

module.exports = { cargarGrupos };
