'use strict';

const { Empresa } = require('../models');
const { ValidationError } = require('../utils/errors');
const { auditar } = require('../utils/audit');
const { OPCIONES, PERFILES, efectivas, aplicarCambios, valoresDePerfil, catalogoPara } = require('../services/opciones');
const { opcionesGuardadas, olvidarOpciones } = require('../middlewares/opciones');

const modulos = (req) => [...(req.empresaModulos || [])];

/** Lo que necesita la pantalla (y cada página para saber qué mostrar): valores efectivos, catálogo aplicable y perfiles. */
async function respuesta(req) {
  const guardadas = await opcionesGuardadas(req.empresaId);
  return {
    valores: efectivas(guardadas, modulos(req)),
    guardadas,
    catalogo: catalogoPara(modulos(req)),
    perfiles: PERFILES.map(({ clave, etiqueta, descripcion }) => ({ clave, etiqueta, descripcion })),
  };
}

exports.getOpciones = async (req, res) => {
  res.json(await respuesta(req));
};

/** Cambia opciones sueltas (`valores`) o aplica un perfil completo (`perfil`). */
exports.updateOpciones = async (req, res) => {
  const { valores, perfil } = req.body;
  const empresa = await Empresa.findByPk(req.empresaId, { attributes: ['id', 'opciones'] });
  let nuevas;
  try {
    nuevas = perfil
      ? valoresDePerfil(perfil, modulos(req))
      : aplicarCambios(empresa.opciones || {}, valores, modulos(req));
  } catch (err) {
    throw new ValidationError(err.message);
  }
  const antes = efectivas(empresa.opciones || {}, modulos(req));
  await empresa.update({ opciones: nuevas });
  olvidarOpciones(req.empresaId);

  const despues = efectivas(nuevas, modulos(req));
  const cambiadas = OPCIONES.filter((o) => JSON.stringify(antes[o.clave]) !== JSON.stringify(despues[o.clave]));
  auditar(req, 'opciones_cambiadas', {
    perfil: perfil || null,
    activadas: cambiadas.filter((o) => despues[o.clave] === true).map((o) => o.etiqueta).join(', '),
    desactivadas: cambiadas.filter((o) => despues[o.clave] === false).map((o) => o.etiqueta).join(', '),
    ajustadas: cambiadas.filter((o) => typeof despues[o.clave] !== 'boolean').map((o) => o.etiqueta).join(', '),
  });
  res.json(await respuesta(req));
};
