'use strict';

const { Op } = require('sequelize');
const { sequelize, CategoriaMenu, PrecioHorario, Producto } = require('../models');
const { ValidationError } = require('../utils/errors');
const { auditar } = require('../utils/audit');
const { fechaISO } = require('../services/lotes');
const { precioHorario: esquemaOferta } = require('../schemas/menuSchemas');

const TIPOS_DE_MENU = ['VENTA', 'RECETA', 'COMBO'];

/** Un nombre repetido (índice único por empresa) se traduce a un 400 legible. */
const traducirDuplicado = (err, que) => (err && err.name === 'SequelizeUniqueConstraintError' ? new ValidationError(`Ya existe ${que} con ese nombre.`) : err);

// ── Categorías ──────────────────────────────────────────────────────────────────────────────
exports.getCategorias = async (req, res) => {
  const where = { empresaId: req.empresaId, ...(req.query.todas ? {} : { activa: true }) };
  res.json(await CategoriaMenu.findAll({ where, order: [['orden', 'ASC'], ['nombre', 'ASC']] }));
};

exports.createCategoria = async (req, res) => {
  try {
    // Sin orden indicado va al final.
    const max = await CategoriaMenu.max('orden', { where: { empresaId: req.empresaId } });
    const cat = await CategoriaMenu.create({ ...req.body, orden: req.body.orden ?? ((max ?? -1) + 1), empresaId: req.empresaId });
    auditar(req, 'categoria_menu_creada', { categoriaId: cat.id, nombre: cat.nombre });
    res.status(201).json(cat);
  } catch (err) {
    throw traducirDuplicado(err, 'una categoría');
  }
};

exports.updateCategoria = async (req, res) => {
  const cat = await CategoriaMenu.findOne({ where: { id: req.params.id, empresaId: req.empresaId } });
  if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
  try {
    await cat.update(req.body);
  } catch (err) {
    throw traducirDuplicado(err, 'una categoría');
  }
  auditar(req, 'categoria_menu_actualizada', { categoriaId: cat.id, nombre: cat.nombre, activa: cat.activa });
  res.json(cat);
};

/** Reordena las categorías: la posición en `ids` pasa a ser su orden. */
exports.ordenarCategorias = async (req, res) => {
  const { ids } = req.body;
  await sequelize.transaction(async (t) => {
    const validas = await CategoriaMenu.count({ where: { id: ids, empresaId: req.empresaId }, transaction: t });
    if (validas !== new Set(ids).size) throw new ValidationError('Una de las categorías no existe.');
    for (const [i, id] of ids.entries()) await CategoriaMenu.update({ orden: i }, { where: { id, empresaId: req.empresaId }, transaction: t });
  });
  auditar(req, 'categorias_menu_ordenadas', { categorias: ids.length });
  res.json(await CategoriaMenu.findAll({ where: { empresaId: req.empresaId }, order: [['orden', 'ASC'], ['nombre', 'ASC']] }));
};

// ── Agotado por hoy ─────────────────────────────────────────────────────────────────────────
exports.setAgotado = async (req, res) => {
  const prod = await Producto.findOne({ where: { id: req.params.id, empresaId: req.empresaId } });
  if (!prod || !TIPOS_DE_MENU.includes(prod.tipo)) return res.status(404).json({ error: 'Producto no encontrado' });
  await prod.update({ agotado_dia: req.body.agotado ? fechaISO() : null });
  auditar(req, 'producto_agotado', { productoId: prod.id, productoNombre: prod.nombre_producto, agotado: req.body.agotado });
  res.json({ id: prod.id, agotado_hoy: req.body.agotado });
};

// ── Fotos ───────────────────────────────────────────────────────────────────────────────────
/** { [productoId]: dataUrl } de los productos que tienen foto (aparte del listado para no cargarlo con imágenes). */
exports.getImagenes = async (req, res) => {
  const filas = await Producto.findAll({ where: { empresaId: req.empresaId, imagen: { [Op.ne]: null } }, attributes: ['id', 'imagen'], raw: true });
  res.json(Object.fromEntries(filas.map((f) => [f.id, f.imagen])));
};

// ── Precios por horario ─────────────────────────────────────────────────────────────────────
/** Los productos y categorías de una regla deben ser de la empresa. */
async function validarAlcance(req, { producto_ids: ps = [], categoria_ids: cs = [] }) {
  if (ps.length) {
    const n = await Producto.count({ where: { id: ps, empresaId: req.empresaId } });
    if (n !== new Set(ps).size) throw new ValidationError('Uno de los productos de la oferta no existe.');
  }
  if (cs.length) {
    const n = await CategoriaMenu.count({ where: { id: cs, empresaId: req.empresaId } });
    if (n !== new Set(cs).size) throw new ValidationError('Una de las categorías de la oferta no existe.');
  }
}

exports.getPreciosHorario = async (req, res) => {
  res.json(await PrecioHorario.findAll({ where: { empresaId: req.empresaId }, order: [['nombre', 'ASC']] }));
};

exports.createPrecioHorario = async (req, res) => {
  await validarAlcance(req, req.body);
  const regla = await PrecioHorario.create({ ...req.body, empresaId: req.empresaId });
  auditar(req, 'precio_horario_creado', { reglaId: regla.id, nombre: regla.nombre });
  res.status(201).json(regla);
};

exports.updatePrecioHorario = async (req, res) => {
  const regla = await PrecioHorario.findOne({ where: { id: req.params.id, empresaId: req.empresaId } });
  if (!regla) return res.status(404).json({ error: 'Oferta no encontrada' });
  // La oferta completa (lo que había + lo que cambia) debe seguir siendo válida.
  const actual = regla.toJSON();
  const mezclada = esquemaOferta.safeParse({ ...actual, valor: Number(actual.valor), ...req.body });
  if (!mezclada.success) throw new ValidationError(mezclada.error.issues[0].message);
  await validarAlcance(req, mezclada.data);
  await regla.update(mezclada.data);
  auditar(req, 'precio_horario_actualizado', { reglaId: regla.id, nombre: regla.nombre, activo: regla.activo });
  res.json(regla);
};

exports.deletePrecioHorario = async (req, res) => {
  const regla = await PrecioHorario.findOne({ where: { id: req.params.id, empresaId: req.empresaId } });
  if (!regla) return res.status(404).json({ error: 'Oferta no encontrada' });
  await regla.destroy();
  auditar(req, 'precio_horario_eliminado', { reglaId: regla.id, nombre: regla.nombre });
  res.json({ ok: true });
};

// ── Grupos de modificadores ─────────────────────────────────────────────────────────────────
const { GrupoModificador, ProductoGrupo, Modificador } = require('../models');

const GRUPO_INCLUDE = [{ model: Producto, as: 'platos', attributes: ['id'], through: { attributes: [] } }];
const grupoJson = (g) => ({ ...g.toJSON(), platos: undefined, productoIds: g.platos.map((p) => p.id) });

exports.getGrupos = async (req, res) => {
  const grupos = await GrupoModificador.findAll({ where: { empresaId: req.empresaId }, include: GRUPO_INCLUDE, order: [['orden', 'ASC'], ['nombre', 'ASC']] });
  res.json(grupos.map(grupoJson));
};

/** Los platos del grupo deben ser de la empresa y ser platos (RECETA). */
async function validarPlatos(req, ids = [], t) {
  if (!ids.length) return;
  const n = await Producto.count({ where: { id: ids, empresaId: req.empresaId, tipo: 'RECETA' }, transaction: t });
  if (n !== new Set(ids).size) throw new ValidationError('Uno de los platos del grupo no existe o no es un plato.');
}

exports.createGrupo = async (req, res) => {
  const { productoIds, ...datos } = req.body;
  try {
    const id = await sequelize.transaction(async (t) => {
      await validarPlatos(req, productoIds, t);
      const max = await GrupoModificador.max('orden', { where: { empresaId: req.empresaId }, transaction: t });
      const g = await GrupoModificador.create({ ...datos, orden: datos.orden ?? ((max ?? -1) + 1), empresaId: req.empresaId }, { transaction: t });
      if (productoIds?.length) await ProductoGrupo.bulkCreate([...new Set(productoIds)].map((p) => ({ productoId: p, grupoId: g.id })), { transaction: t });
      return g.id;
    });
    auditar(req, 'grupo_modificadores_creado', { grupoId: id, nombre: datos.nombre, obligatorio: !!datos.obligatorio });
    res.status(201).json(grupoJson(await GrupoModificador.findByPk(id, { include: GRUPO_INCLUDE })));
  } catch (err) {
    throw traducirDuplicado(err, 'un grupo');
  }
};

exports.updateGrupo = async (req, res) => {
  const { productoIds, ...datos } = req.body;
  try {
    const ok = await sequelize.transaction(async (t) => {
      const g = await GrupoModificador.findOne({ where: { id: req.params.id, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
      if (!g) return false;
      if (productoIds) await validarPlatos(req, productoIds, t);
      await g.update(datos, { transaction: t });
      if (productoIds) {
        await ProductoGrupo.destroy({ where: { grupoId: g.id }, transaction: t });
        if (productoIds.length) await ProductoGrupo.bulkCreate([...new Set(productoIds)].map((p) => ({ productoId: p, grupoId: g.id })), { transaction: t });
      }
      return true;
    });
    if (!ok) return res.status(404).json({ error: 'Grupo no encontrado' });
    const g = await GrupoModificador.findByPk(req.params.id, { include: GRUPO_INCLUDE });
    auditar(req, 'grupo_modificadores_actualizado', { grupoId: g.id, nombre: g.nombre, activo: g.activo });
    res.json(grupoJson(g));
  } catch (err) {
    throw traducirDuplicado(err, 'un grupo');
  }
};

/** Se elimina el grupo; sus modificadores quedan como extras sueltos. */
exports.deleteGrupo = async (req, res) => {
  const g = await GrupoModificador.findOne({ where: { id: req.params.id, empresaId: req.empresaId } });
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  await Modificador.update({ grupoId: null }, { where: { grupoId: g.id } });
  await g.destroy();
  auditar(req, 'grupo_modificadores_eliminado', { grupoId: g.id, nombre: g.nombre });
  res.json({ ok: true });
};
