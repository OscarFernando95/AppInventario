'use strict';

const ExcelJS = require('exceljs');
const { producto: productoSchema } = require('../schemas/catalogoSchemas');

/**
 * Importación masiva de inventario desde un .xlsx.
 *
 * Columnas esperadas en la primera fila (mismos campos que el alta manual de
 * un producto, ver schemas/catalogoSchemas.js):
 *   codigo*, nombre_producto*, precio_unitario*, stock_actual*,
 *   descripcion, porcentaje_iva, unidad_medida, codigo_estandar
 * (* obligatorias)
 */
const COLUMNAS = [
  'codigo', 'nombre_producto', 'descripcion', 'precio_unitario',
  'stock_actual', 'porcentaje_iva', 'unidad_medida', 'codigo_estandar',
];
const REQUERIDAS = ['codigo', 'nombre_producto', 'precio_unitario', 'stock_actual'];

const MAX_FILAS = 5000;

/** Clave de deduplicación: mismo criterio para el archivo y para lo que ya existe en BD. */
function normalizarCodigo(codigo) {
  return String(codigo == null ? '' : codigo).trim().toUpperCase();
}

/** Valor de una celda de ExcelJS a string/number plano (sin fórmulas ni objetos ricos). */
function valorCelda(cell) {
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('result' in v) return v.result ?? ''; // celda con fórmula
    if (v instanceof Date) return v; // no se usa en ninguna columna, pero por si acaso
    return '';
  }
  return v;
}

/**
 * Lee la primera hoja de `buffer` y devuelve las filas como objetos planos
 * `{ codigo, nombre_producto, ..., _fila }` (`_fila` = número de fila real en
 * el Excel, para que los errores sean localizables por el usuario).
 *
 * Lanza un Error corriente (no ValidationError: lo traduce el controlador) si
 * el archivo no tiene ninguna hoja o le faltan columnas obligatorias.
 */
async function leerWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const hoja = workbook.worksheets[0];
  if (!hoja) throw new Error('El archivo no tiene ninguna hoja.');

  const headerRow = hoja.getRow(1);
  const indices = {}; // nombre de columna -> índice de celda (1-based)
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const nombre = String(cell.value || '').trim().toLowerCase();
    if (COLUMNAS.includes(nombre)) indices[nombre] = colNumber;
  });

  const faltantes = REQUERIDAS.filter((c) => !(c in indices));
  if (faltantes.length > 0) {
    throw new Error(`Faltan columnas obligatorias en el Excel: ${faltantes.join(', ')}.`);
  }

  if (hoja.rowCount - 1 > MAX_FILAS) {
    throw new Error(`El archivo tiene demasiadas filas (máximo ${MAX_FILAS}). Divídelo en partes.`);
  }

  const filas = [];
  for (let n = 2; n <= hoja.rowCount; n++) {
    const row = hoja.getRow(n);
    if (row.cellCount === 0) continue; // fila realmente vacía

    const obj = { _fila: n };
    let vacia = true;
    for (const col of COLUMNAS) {
      if (!(col in indices)) continue;
      const valor = valorCelda(row.getCell(indices[col]));
      if (valor !== '') vacia = false;
      obj[col] = valor;
    }
    if (!vacia) filas.push(obj);
  }
  return filas;
}

/**
 * Valida cada fila con el mismo schema zod del alta manual de producto.
 * No aborta ante la primera fila mala: las separa en `validas`/`invalidas`
 * para que el resto del archivo sí se pueda importar.
 */
function validarFilas(filas) {
  const validas = [];
  const invalidas = [];
  for (const fila of filas) {
    const { _fila, ...datos } = fila;
    const result = productoSchema.safeParse(datos);
    if (result.success) {
      validas.push({ _fila, datos: result.data });
    } else {
      const mensaje = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      invalidas.push({ fila: _fila, error: mensaje });
    }
  }
  return { validas, invalidas };
}

module.exports = { COLUMNAS, REQUERIDAS, MAX_FILAS, normalizarCodigo, leerWorkbook, validarFilas };
