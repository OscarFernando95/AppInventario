const ExcelJS = require('exceljs');
const { literal } = require('sequelize');
const { sequelize, Producto, RecetaItem, ModificadorItem, Empresa, CategoriaMenu, PrecioHorario, ComboItem } = require('../models');
const { opcionesDe } = require('../middlewares/opciones');
const { promoVigente } = require('../services/precios');
const { fechaISO } = require('../services/lotes');
const { ValidationError } = require('../utils/errors');
const { invalidateDashboard } = require('./reporteController');
const { COLUMNAS, normalizarCodigo, leerWorkbook, validarFilas } = require('../utils/xlsxImport');
const logger = require('../utils/logger');
const { auditar } = require('../utils/audit');
const { TIPOS_CON_RECETA, TIPOS_NO_COMPRABLES, consumoBase, costoDeConsumo, esPorLotes } = require('../services/recetas');
const { analizarProductos, objetivoDe } = require('../services/reposicion');
const { cargarRecetas } = require('../services/recetasDb');
const { margen } = require('../services/costos');
const { tiene } = require('../middlewares/auth');

/** Sin el permiso costos.ver el producto sale sin costo ni margen (en el listado y en las respuestas de crear/editar). */
const CAMPOS_DE_COSTO = ['costo', 'costo_promedio', 'margen', 'margen_pct'];
function segunPermisoDeCostos(req, producto) {
  const json = typeof producto.toJSON === 'function' ? producto.toJSON() : { ...producto };
  delete json.imagen; // la foto no viaja en estas respuestas (GET /api/menu/imagenes)
  if (tiene(req, 'costos.ver')) return json;
  for (const campo of CAMPOS_DE_COSTO) delete json[campo];
  return json;
}

exports.getProductos = async (req, res) => {
  const ef = await opcionesDe(req);
  const productos = await Producto.findAll({
    where: { empresaId: req.empresaId },
    // La foto pesa: va por aparte (GET /api/menu/imagenes); aquí solo se dice si tiene.
    attributes: { exclude: ['imagen'], include: [[literal('("Producto"."imagen" IS NOT NULL)'), 'tiene_imagen']] },
    include: [
      { model: RecetaItem, as: 'receta', attributes: ['insumoId', 'cantidad'] },
      { model: ComboItem, as: 'combo', attributes: ['productoId', 'cantidad'] },
    ],
    order: [['nombre_producto', 'ASC']],
  });

  const json = productos.map((p) => p.toJSON());
  const porId = new Map(json.map((p) => [p.id, p]));
  const analisis = analizarProductos(json);
  const costoPorId = new Map(json.map((p) => [p.id, Number(p.costo_promedio)]));
  // Una preparación por lotes sin producir aún no tiene costo registrado: mientras tanto vale lo que cuesta su receta.
  for (const p of json) {
    if (esPorLotes(p) && !(Number(p.costo_promedio) > 0)) costoPorId.set(p.id, costoDeConsumo(analisis.get(p.id).consumo, costoPorId));
  }

  // Costo de cada producto vendible (un combo cuesta la suma de sus componentes).
  const costoUnidad = new Map();
  for (const p of json) {
    if (p.tipo === 'COMBO') continue;
    costoUnidad.set(p.id, TIPOS_CON_RECETA.includes(p.tipo) ? (esPorLotes(p) ? costoPorId.get(p.id) : Math.round(costoDeConsumo(analisis.get(p.id).consumo, costoPorId) * 10000) / 10000) : Number(p.costo_promedio));
  }
  for (const p of json.filter((x) => x.tipo === 'COMBO')) {
    costoUnidad.set(p.id, Math.round((p.combo || []).reduce((a, c) => a + Number(c.cantidad) * (costoUnidad.get(c.productoId) || 0), 0) * 10000) / 10000);
  }

  // Menú (opciones encendidas): agotado por hoy y precio de horario vigente. Apagadas, el listado queda como siempre.
  const hoy = fechaISO();
  const reglas = ef.precios_horario ? (await PrecioHorario.findAll({ where: { empresaId: req.empresaId, activo: true }, raw: true })) : [];
  const ahora = new Date();

  res.json(json.map((p) => {
    const a = analisis.get(p.id);
    if (ef.agotados_manuales) p.agotado_hoy = p.agotado_dia === hoy;
    if (reglas.length && ['VENTA', 'RECETA', 'COMBO'].includes(p.tipo)) {
      const promo = promoVigente(p, reglas, ahora);
      if (promo) { p.precio_vigente = promo.precio; p.promo_nombre = promo.promo; }
    }
    // Disponible = lo que realmente se puede vender/usar: stock (producto, insumo), porciones (plato)
    // o unidades producibles (preparación). Con él y el mínimo sale el estado de reposición.
    p.disponible = a.disponible;
    p.estado_stock = a.estado;
    p.alerta_stock = a.alerta;
    p.stock_objetivo_efectivo = objetivoDe(p);
    if (p.tipo === 'COMBO') {
      // Un combo no tiene stock ni costo propios: salen de sus componentes.
      p.costo = costoUnidad.get(p.id);
      p.porciones_disponibles = a.disponible;
      p.combo = (p.combo || []).map((c) => ({ ...c, cantidad: Number(c.cantidad), nombre: porId.get(c.productoId)?.nombre_producto }));
    } else if (TIPOS_CON_RECETA.includes(p.tipo)) {
      // Un plato / preparación no tiene stock ni costo propios: salen de sus ingredientes.
      p.costo = esPorLotes(p) ? costoPorId.get(p.id) : Math.round(costoDeConsumo(a.consumo, costoPorId) * 10000) / 10000;
      if (p.tipo === 'RECETA') p.porciones_disponibles = a.disponible;
    } else {
      p.costo = Number(p.costo_promedio);
    }
    // Margen sobre el precio SIN IVA (el precio de lista incluye IVA).
    if (p.tipo === 'RECETA' || p.tipo === 'VENTA' || p.tipo === 'COMBO') Object.assign(p, margen(p.precio_unitario, p.porcentaje_iva, p.costo));
    return segunPermisoDeCostos(req, p);
  }));
};

/**
 * Valida tipo + receta de un producto y devuelve los ingredientes ya limpios.
 *   - tipo distinto de VENTA exige el módulo Recetas.
 *   - RECETA / PREPARACION: al menos 1 ingrediente; sin repetidos; ingredientes de
 *     la misma empresa que no sean platos; ni el propio producto; sin ciclos
 *     entre preparaciones.
 *   - Otros tipos: no admiten receta.
 * `recetaBody` undefined = "no tocar la receta existente" (solo en update).
 */
async function validarTipoYReceta(req, { tipo, recetaBody, productoId, rendimiento, t }) {
  if (tipo !== 'VENTA' && tipo !== 'COMBO' && !req.empresaModulos?.has('Recetas')) {
    throw new ValidationError('El módulo "Recetas" no está activo para esta empresa.');
  }
  if (!TIPOS_CON_RECETA.includes(tipo)) {
    if (recetaBody && recetaBody.length > 0) throw new ValidationError('Solo un plato o una preparación admite ingredientes.');
    return [];
  }
  if (recetaBody === undefined) return undefined;
  if (recetaBody.length === 0) throw new ValidationError('Un plato o preparación necesita al menos un ingrediente.');

  const ids = recetaBody.map((i) => i.insumoId);
  if (new Set(ids).size !== ids.length) throw new ValidationError('Hay ingredientes repetidos en la receta.');
  if (productoId && ids.includes(productoId)) throw new ValidationError('Un producto no puede ser ingrediente de sí mismo.');

  const insumos = await Producto.findAll({ where: { id: ids, empresaId: req.empresaId }, transaction: t });
  if (insumos.length !== ids.length) throw new ValidationError('Ingrediente inválido en la receta.');
  const plato = insumos.find((i) => i.tipo === 'RECETA');
  if (plato) throw new ValidationError(`"${plato.nombre_producto}" es un plato; no puede ser ingrediente.`);

  // Ciclos (A usa B y B usa A): se prueba la receta nueva sobre las existentes.
  if (productoId) {
    const recetas = await cargarRecetas(req.empresaId, {
      transaction: t,
      sinLotes: true, // un ciclo es un error aunque una preparación del camino tenga stock propio
      overrides: new Map([[productoId, { rendimiento: tipo === 'RECETA' ? 1 : rendimiento, items: recetaBody }]]),
    });
    try {
      consumoBase(productoId, recetas, 1);
    } catch {
      throw new ValidationError('La receta genera un ciclo: una preparación termina usándose a sí misma.');
    }
  }
  return recetaBody;
}

/**
 * Presentación de compra coherente: sin unidad_compra el factor vuelve a 1; con
 * unidad hay que decir cuántas unidades base trae. Platos y preparaciones no se
 * compran, así que tampoco llevan presentación.
 */
function normalizarPresentacion(datos, tipo, actual) {
  const out = { ...datos };
  if (TIPOS_NO_COMPRABLES.includes(tipo)) {
    if (out.unidad_compra) throw new ValidationError('Un plato, preparación o combo no se compra: no lleva presentación de compra.');
    out.unidad_compra = null;
    out.factor_compra = 1;
    return out;
  }
  const unidad = out.unidad_compra !== undefined ? out.unidad_compra : actual?.unidad_compra;
  if (!unidad) {
    if (out.unidad_compra !== undefined) { out.unidad_compra = null; out.factor_compra = 1; }
    return out;
  }
  // Si se manda la unidad hay que mandar también el factor (no se hereda el de otra unidad).
  const factor = out.unidad_compra ? out.factor_compra : (out.factor_compra ?? Number(actual?.factor_compra));
  if (!(factor > 0)) {
    throw new ValidationError('Indica cuántas unidades base trae la presentación de compra (factor).');
  }
  return out;
}

/**
 * Campos que no aplican según el tipo: costo en platos/preparaciones (en una preparación por lotes lo
 * calcula cada producción), rendimiento y lotes fuera de las preparaciones.
 */
function limpiarPorTipo(datos, tipo) {
  const limpio = { ...datos };
  if (TIPOS_NO_COMPRABLES.includes(tipo)) delete limpio.costo_promedio;
  if (tipo !== 'PREPARACION') { delete limpio.rendimiento; limpio.por_lotes = false; limpio.vida_util_dias = null; }
  if (tipo === 'PREPARACION' && limpio.por_lotes === false) limpio.vida_util_dias = null;
  if (!['VENTA', 'RECETA', 'COMBO'].includes(tipo)) { limpio.estacion = null; limpio.tiempo_objetivo_min = null; } // solo lo que se vende pasa por una estación
  return limpio;
}

/**
 * Valida y limpia los componentes de un combo: el combo debe estar activado (opción «combos»), tener al menos dos
 * productos distintos de la empresa que sean platos o productos de venta (no insumos, preparaciones ni otros combos).
 */
async function validarCombo(req, comboBody, comboId, t) {
  const ef = await opcionesDe(req);
  if (!ef.combos) throw new ValidationError('Los combos no están activados: un administrador puede activarlos en Opciones.');
  if (!comboBody || comboBody.length < 2) throw new ValidationError('Un combo necesita al menos dos productos.');
  const ids = comboBody.map((c) => c.productoId);
  if (new Set(ids).size !== ids.length) throw new ValidationError('Hay productos repetidos en el combo.');
  if (comboId && ids.includes(comboId)) throw new ValidationError('Un combo no puede incluirse a sí mismo.');
  const comps = await Producto.findAll({ where: { id: ids, empresaId: req.empresaId }, transaction: t });
  if (comps.length !== ids.length) throw new ValidationError('Producto inválido en el combo.');
  const malo = comps.find((c) => !['VENTA', 'RECETA'].includes(c.tipo));
  if (malo) throw new ValidationError(`"${malo.nombre_producto}" no puede ir en un combo: solo platos y productos de venta.`);
  return comboBody;
}

/** El tiempo objetivo de un plato solo se guarda con «Alertas de demora en cocina» encendida; si no, se ignora. */
async function ignorarObjetivoSinAlertas(req, datos) {
  if (datos.tiempo_objetivo_min === undefined) return;
  if (!(await opcionesDe(req)).cocina_alertas) delete datos.tiempo_objetivo_min;
}

/** "Reponer hasta" no puede quedar por debajo del mínimo (con los valores que quedarían tras guardar). */
function validarObjetivo(minimo, objetivo) {
  if (objetivo != null && Number(minimo) > 0 && Number(objetivo) < Number(minimo)) {
    throw new ValidationError('«Reponer hasta» no puede ser menor que el stock mínimo.');
  }
}

/** La estación de un plato debe ser una de las de la empresa (Configurar mesas). */
async function validarEstacion(req, estacion) {
  if (!estacion) return;
  const empresa = await Empresa.findByPk(req.empresaId, { attributes: ['estaciones'] });
  const lista = Array.isArray(empresa?.estaciones) ? empresa.estaciones : ['Cocina'];
  if (!lista.includes(estacion)) throw new ValidationError(`La estación «${estacion}» no existe: elige ${lista.map((e) => `«${e}»`).join(', ')}.`);
}

/**
 * Los campos de menú (categoría, orden, foto) solo se guardan con su opción encendida; con la opción apagada se ignoran
 * (así una empresa que no los usa no los toca por error). La categoría debe ser de la empresa.
 */
async function aplicarOpcionesDeMenu(req, datos) {
  const ef = await opcionesDe(req);
  if (!ef.menu_categorias) { delete datos.categoriaId; delete datos.orden_menu; }
  if (!ef.menu_fotos) delete datos.imagen;
  if (datos.categoriaId) {
    const cat = await CategoriaMenu.count({ where: { id: datos.categoriaId, empresaId: req.empresaId } });
    if (!cat) throw new ValidationError('Categoría inválida.');
  }
}

exports.createProducto = async (req, res) => {
  const { receta: recetaBody, combo: comboBody, ...datos } = req.body;
  await validarEstacion(req, datos.estacion);
  await aplicarOpcionesDeMenu(req, datos);
  await ignorarObjetivoSinAlertas(req, datos);
  const tipo = datos.tipo || 'VENTA';
  validarObjetivo(datos.stock_minimo ?? 0, datos.stock_objetivo);

  const producto = await sequelize.transaction(async (t) => {
    const receta = await validarTipoYReceta(req, {
      tipo, recetaBody: recetaBody ?? (TIPOS_CON_RECETA.includes(tipo) ? [] : undefined), rendimiento: datos.rendimiento || 1, t,
    });
    // El stock de un plato / preparación no se usa (se vende con el de sus insumos).
    const combo = tipo === 'COMBO' ? await validarCombo(req, comboBody, null, t) : undefined;
    const nuevo = await Producto.create(
      { ...limpiarPorTipo(normalizarPresentacion(datos, tipo), tipo), tipo, empresaId: req.empresaId, ...(TIPOS_NO_COMPRABLES.includes(tipo) ? { stock_actual: 0 } : {}) },
      { transaction: t }
    );
    if (combo) await ComboItem.bulkCreate(combo.map((c) => ({ comboId: nuevo.id, productoId: c.productoId, cantidad: c.cantidad })), { transaction: t });
    if (receta && receta.length > 0) {
      await RecetaItem.bulkCreate(receta.map((i) => ({ productoId: nuevo.id, insumoId: i.insumoId, cantidad: i.cantidad })), { transaction: t });
    }
    return nuevo;
  });

  invalidateDashboard(req.empresaId);
  auditar(req, 'producto_creado', { productoId: producto.id, nombre_producto: producto.nombre_producto, codigo: producto.codigo, tipo });
  res.status(201).json(segunPermisoDeCostos(req, producto));
};

exports.updateProducto = async (req, res) => {
  const { id } = req.params;
  const { receta: recetaBody, combo: comboBody, ...datos } = req.body;
  await validarEstacion(req, datos.estacion);
  await aplicarOpcionesDeMenu(req, datos);
  await ignorarObjetivoSinAlertas(req, datos);

  const producto = await sequelize.transaction(async (t) => {
    const actual = await Producto.findOne({ where: { id, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!actual) return null;

    const tipo = datos.tipo || actual.tipo;
    validarObjetivo(
      datos.stock_minimo ?? actual.stock_minimo,
      datos.stock_objetivo !== undefined ? datos.stock_objetivo : actual.stock_objetivo
    );
    const cambiaTipo = tipo !== actual.tipo;
    if (cambiaTipo && (tipo === 'COMBO' || actual.tipo === 'COMBO')) throw new ValidationError('Un producto no se convierte en combo ni deja de serlo: crea uno nuevo.');
    if (cambiaTipo && await ComboItem.count({ where: { productoId: actual.id }, transaction: t }) > 0) {
      throw new ValidationError('Este producto es parte de un combo: quítalo del combo antes de cambiarle el tipo.');
    }
    // Una preparación por lotes con existencias no puede dejar de serlo ni cambiar de tipo: ese stock quedaría huérfano.
    if (esPorLotes(actual) && Number(actual.stock_actual) > 0 && (cambiaTipo || datos.por_lotes === false)) {
      throw new ValidationError(`"${actual.nombre_producto}" tiene ${Number(actual.stock_actual)} en existencias: regístralas como merma o consúmelas antes de dejar de producirla por lotes.`);
    }
    if (cambiaTipo) {
      const comoIngrediente = await RecetaItem.count({ where: { insumoId: actual.id }, transaction: t })
        + await ModificadorItem.count({ where: { insumoId: actual.id }, transaction: t });
      if (comoIngrediente > 0 && (tipo === 'RECETA' || actual.tipo === 'PREPARACION')) {
        throw new ValidationError(tipo === 'RECETA'
          ? 'Este producto es ingrediente de otros platos o modificadores; no puede convertirse en plato.'
          : 'Esta preparación se usa como ingrediente; no puede dejar de ser preparación.');
      }
    }

    // Al convertir en plato/preparación hay que mandar la receta; si ya lo era y
    // no se manda, se conserva la que tiene.
    const nuevoConReceta = TIPOS_CON_RECETA.includes(tipo) && !TIPOS_CON_RECETA.includes(actual.tipo);
    const pedirReceta = nuevoConReceta ? (recetaBody ?? []) : recetaBody;
    const rendimiento = datos.rendimiento ?? Number(actual.rendimiento);
    const receta = await validarTipoYReceta(req, { tipo, recetaBody: pedirReceta, productoId: actual.id, rendimiento, t });

    // El stock lo mueven compras/ventas, no esta edición (el esquema lo omite).
    await actual.update({ ...limpiarPorTipo(normalizarPresentacion(datos, tipo, actual), tipo), tipo }, { transaction: t });

    // Combo: si se manda la lista de componentes, se reemplaza completa.
    if (tipo === 'COMBO' && comboBody !== undefined) {
      const combo = await validarCombo(req, comboBody, actual.id, t);
      await ComboItem.destroy({ where: { comboId: actual.id }, transaction: t });
      await ComboItem.bulkCreate(combo.map((c) => ({ comboId: actual.id, productoId: c.productoId, cantidad: c.cantidad })), { transaction: t });
    }

    // Receta: si cambia o el producto deja de tener receta, se reemplaza completa.
    if (receta !== undefined) {
      await RecetaItem.destroy({ where: { productoId: actual.id }, transaction: t });
      if (receta.length > 0) {
        await RecetaItem.bulkCreate(receta.map((i) => ({ productoId: actual.id, insumoId: i.insumoId, cantidad: i.cantidad })), { transaction: t });
      }
    }
    return actual;
  });
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

  invalidateDashboard(req.empresaId);
  auditar(req, 'producto_actualizado', { productoId: producto.id, nombre_producto: producto.nombre_producto, codigo: producto.codigo, tipo: producto.tipo });
  res.json(segunPermisoDeCostos(req, producto));
};

/**
 * Importación masiva desde .xlsx (ver utils/xlsxImport.js para el parseo y la
 * validación de cada fila). Deduplica por `codigo` normalizado dentro de la
 * empresa: si ya existe, actualiza cantidad/precio según las opciones
 * elegidas; si no, lo crea. El resto de campos de un producto existente no se
 * tocan en un conflicto (evita que una celda vacía del Excel borre un dato ya
 * curado a mano).
 */
exports.importarProductos = async (req, res) => {
  if (!req.file) throw new ValidationError('No se recibió ningún archivo.');
  const { modoCantidad, modoPrecio } = req.body;

  let filas;
  try {
    filas = await leerWorkbook(req.file.buffer);
  } catch (err) {
    throw new ValidationError(err.message);
  }
  if (filas.length === 0) throw new ValidationError('El archivo no tiene filas con datos.');

  const { validas, invalidas } = validarFilas(filas);

  const resultado = await sequelize.transaction(async (t) => {
    const existentes = await Producto.findAll({
      where: { empresaId: req.empresaId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    const porCodigo = new Map(existentes.map((p) => [normalizarCodigo(p.codigo), p]));

    const creados = [];
    const actualizados = [];

    for (const { _fila, datos } of validas) {
      const clave = normalizarCodigo(datos.codigo);
      const existente = porCodigo.get(clave);
      const cantidadFila = Number(datos.stock_actual || 0);

      if (!existente) {
        const nuevo = await Producto.create({ ...datos, empresaId: req.empresaId }, { transaction: t });
        porCodigo.set(clave, nuevo); // por si el propio archivo repite el código dos veces
        creados.push({ fila: _fila, codigo: nuevo.codigo });
        continue;
      }

      const cambios = {};
      cambios.stock_actual = modoCantidad === 'sumar'
        ? Number(existente.stock_actual) + cantidadFila
        : cantidadFila;
      if (modoPrecio === 'actualizar') cambios.precio_unitario = datos.precio_unitario;

      await existente.update(cambios, { transaction: t });
      actualizados.push({ fila: _fila, codigo: existente.codigo });
    }

    return { creados, actualizados };
  });

  const omitidos = invalidas; // [{ fila, error }]
  invalidateDashboard(req.empresaId);
  logger.info('importacion_productos', {
    empresaId: req.empresaId,
    userId: req.userId,
    creados: resultado.creados.length,
    actualizados: resultado.actualizados.length,
    omitidos: omitidos.length,
  });

  res.json({
    totalFilas: filas.length,
    creados: resultado.creados,
    actualizados: resultado.actualizados,
    omitidos,
  });
};

/** Plantilla .xlsx descargable con las columnas exactas que espera el import. */
exports.descargarPlantilla = async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet('Productos');
  hoja.addRow(COLUMNAS);
  hoja.addRow(['PROD-001', 'Producto de ejemplo', 'Descripción opcional', 15000, 10, 19, '94', '']);
  hoja.getRow(1).font = { bold: true };
  hoja.columns.forEach((col) => { col.width = 20; });

  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="plantilla_productos.xlsx"',
  });
  await workbook.xlsx.write(res);
  res.end();
};
