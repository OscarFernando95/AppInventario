'use strict';

const catalogos = require('../services/catalogos');

// Catálogos de referencia (DANE / CIIU). Solo lectura, no dependen del tenant.
// El frontend los cachea de forma agresiva (react-query, staleTime infinito).

exports.getDepartamentos = async (req, res) => {
  res.json(await catalogos.getDepartamentos());
};

exports.getMunicipios = async (req, res) => {
  const { departamento } = req.query;
  res.json(await catalogos.getMunicipios(departamento || undefined));
};

exports.getCiiu = async (req, res) => {
  const { q, limit } = req.query;
  res.json(await catalogos.getCiiu({ q, limit: limit ? Number(limit) : undefined }));
};
