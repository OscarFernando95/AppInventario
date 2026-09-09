'use strict';

const { Modulo } = require('../models');

// Lista de módulos contratables. La consume el formulario de alta de inquilinos
// (antes la lista estaba hardcodeada en el frontend y se desincronizó de la BD).
exports.getModulos = async (req, res) => {
  const modulos = await Modulo.findAll({
    attributes: ['id', 'nombre_codigo', 'descripcion'],
    order: [['id', 'ASC']],
  });
  res.json(modulos);
};
