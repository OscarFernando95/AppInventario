'use strict';

/**
 * Catálogos de referencia (DANE / CIIU) servidos desde memoria.
 *
 * Son datos estáticos (se pueblan una vez por seeder y no cambian en runtime),
 * así que se cargan de la BD la primera vez que se piden y se cachean para
 * siempre. Si algún día hay que refrescarlos, reiniciar el proceso.
 */

const { Departamento, Municipio, ActividadCiiu } = require('../models');

let cachePromise = null;

async function cargar() {
  const [departamentos, municipios, ciiu] = await Promise.all([
    Departamento.findAll({ attributes: ['codigo_dane', 'nombre'], order: [['nombre', 'ASC']], raw: true }),
    Municipio.findAll({ attributes: ['codigo_dane', 'nombre', 'departamento_codigo'], order: [['nombre', 'ASC']], raw: true }),
    ActividadCiiu.findAll({ attributes: ['codigo', 'descripcion'], order: [['codigo', 'ASC']], raw: true }),
  ]);

  const municipioPorCodigo = new Map(municipios.map((m) => [m.codigo_dane, m]));

  return { departamentos, municipios, ciiu, municipioPorCodigo };
}

function getCache() {
  if (!cachePromise) {
    cachePromise = cargar().catch((err) => {
      cachePromise = null; // permite reintentar en la siguiente petición
      throw err;
    });
  }
  return cachePromise;
}

async function getDepartamentos() {
  return (await getCache()).departamentos;
}

async function getMunicipios(codigoDepartamento) {
  const { municipios } = await getCache();
  if (!codigoDepartamento) return municipios;
  return municipios.filter((m) => m.departamento_codigo === codigoDepartamento);
}

async function getCiiu({ q, limit } = {}) {
  const { ciiu } = await getCache();
  let lista = ciiu;
  if (q) {
    const needle = String(q).trim().toLowerCase();
    lista = ciiu.filter(
      (a) => a.codigo.includes(needle) || a.descripcion.toLowerCase().includes(needle)
    );
  }
  return limit ? lista.slice(0, limit) : lista;
}

async function getMunicipioByCodigo(codigo) {
  return (await getCache()).municipioPorCodigo.get(codigo) || null;
}

module.exports = { getDepartamentos, getMunicipios, getCiiu, getMunicipioByCodigo };
