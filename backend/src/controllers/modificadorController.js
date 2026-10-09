'use strict';

const { sequelize, Modificador, ModificadorItem, Producto, GrupoModificador } = require('../models');
const { opcionesDe } = require('../middlewares/opciones');
const { ValidationError } = require('../utils/errors');
const { auditar } = require('../utils/audit');

const INCLUDE_ITEMS = [{
  model: ModificadorItem,
  as: 'items',
  attributes: ['insumoId', 'cantidad'],
  include: [{ model: Producto, as: 'insumo', attributes: ['nombre_producto', 'unidad_medida'] }],
}];

/** Un nombre repetido (índice único por empresa) se traduce a un 400 legible. */
function traducirDuplicado(err) {
  if (err && err.name === 'SequelizeUniqueConstraintError') {
    return new ValidationError('Ya existe un modificador con ese nombre.');
  }
  return err;
}

/** El grupo de un modificador solo se guarda con la opción encendida y debe ser de la empresa. */
async function aplicarGrupo(req, datos) {
  if (!(await opcionesDe(req)).modificadores_grupos) { delete datos.grupoId; return; }
  if (datos.grupoId) {
    const n = await GrupoModificador.count({ where: { id: datos.grupoId, empresaId: req.empresaId } });
    if (!n) throw new ValidationError('Grupo inválido.');
  }
}

/** Los ingredientes de un modificador: de la empresa, sin repetir y que no sean platos. */
async function validarItems(req, items, t) {
  if (!items || items.length === 0) return [];
  const ids = items.map((i) => i.insumoId);
  if (new Set(ids).size !== ids.length) throw new ValidationError('Hay ingredientes repetidos en el modificador.');
  const productos = await Producto.findAll({ where: { id: ids, empresaId: req.empresaId }, transaction: t });
  if (productos.length !== ids.length) throw new ValidationError('Ingrediente inválido en el modificador.');
  const plato = productos.find((p) => p.tipo === 'RECETA');
  if (plato) throw new ValidationError(`"${plato.nombre_producto}" es un plato; no puede ser ingrediente.`);
  return items;
}

exports.getModificadores = async (req, res) => {
  const where = { empresaId: req.empresaId, ...(req.query.todos ? {} : { activo: true }) };
  const mods = await Modificador.findAll({ where, include: INCLUDE_ITEMS, order: [['nombre', 'ASC']] });
  res.json(mods);
};

exports.createModificador = async (req, res) => {
  const { items, ...datos } = req.body;
  await aplicarGrupo(req, datos);
  try {
    const id = await sequelize.transaction(async (t) => {
      const limpios = await validarItems(req, items, t);
      const mod = await Modificador.create({ ...datos, empresaId: req.empresaId }, { transaction: t });
      if (limpios.length) {
        await ModificadorItem.bulkCreate(limpios.map((i) => ({ modificadorId: mod.id, insumoId: i.insumoId, cantidad: i.cantidad })), { transaction: t });
      }
      return mod.id;
    });
    auditar(req, 'modificador_creado', { modificadorId: id, nombre: datos.nombre });
    res.status(201).json(await Modificador.findByPk(id, { include: INCLUDE_ITEMS }));
  } catch (err) {
    throw traducirDuplicado(err);
  }
};

exports.updateModificador = async (req, res) => {
  const { items, ...datos } = req.body;
  await aplicarGrupo(req, datos);
  try {
    const ok = await sequelize.transaction(async (t) => {
      const mod = await Modificador.findOne({ where: { id: req.params.id, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
      if (!mod) return false;
      const limpios = items === undefined ? undefined : await validarItems(req, items, t);
      await mod.update(datos, { transaction: t });
      if (limpios !== undefined) {
        await ModificadorItem.destroy({ where: { modificadorId: mod.id }, transaction: t });
        if (limpios.length) {
          await ModificadorItem.bulkCreate(limpios.map((i) => ({ modificadorId: mod.id, insumoId: i.insumoId, cantidad: i.cantidad })), { transaction: t });
        }
      }
      return true;
    });
    if (!ok) return res.status(404).json({ error: 'Modificador no encontrado' });
    const actualizado = await Modificador.findByPk(req.params.id, { include: INCLUDE_ITEMS });
    auditar(req, 'modificador_actualizado', { modificadorId: Number(req.params.id), nombre: actualizado.nombre });
    res.json(actualizado);
  } catch (err) {
    throw traducirDuplicado(err);
  }
};
