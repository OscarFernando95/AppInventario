'use strict';

const { Modulo } = require('../models');
const { REQUIERE } = require('../services/modulos');

// Lista de módulos contratables. La consume el formulario de alta de inquilinos
// (antes la lista estaba hardcodeada en el frontend y se desincronizó de la BD).
exports.getModulos = async (req, res) => {
  const modulos = await Modulo.findAll({
    attributes: ['id', 'nombre_codigo', 'descripcion'],
    order: [['id', 'ASC']],
  });
  // `requiere`: módulos que deben estar contratados para poder contratar este.
  res.json(modulos.map((m) => ({ ...m.toJSON(), requiere: REQUIERE[m.nombre_codigo] || [] })));
};
