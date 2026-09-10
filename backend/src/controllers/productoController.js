const ExcelJS = require('exceljs');
const { sequelize, Producto } = require('../models');
const { ValidationError } = require('../utils/errors');
const { invalidateDashboard } = require('./reporteController');
const { COLUMNAS, normalizarCodigo, leerWorkbook, validarFilas } = require('../utils/xlsxImport');
const logger = require('../utils/logger');

exports.getProductos = async (req, res) => {
  const productos = await Producto.findAll({
    where: { empresaId: req.empresaId },
    order: [['nombre_producto', 'ASC']],
  });
  res.json(productos);
};

exports.createProducto = async (req, res) => {
  const producto = await Producto.create({ ...req.body, empresaId: req.empresaId });
  invalidateDashboard(req.empresaId);
  res.status(201).json(producto);
};

exports.updateProducto = async (req, res) => {
  const { id } = req.params;
  const producto = await Producto.findOne({ where: { id, empresaId: req.empresaId } });
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

  // El stock lo mueven compras/ventas, no esta edición (el esquema lo omite).
  await producto.update(req.body);
  invalidateDashboard(req.empresaId);
  res.json(producto);
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
