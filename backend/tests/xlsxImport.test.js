const ExcelJS = require('exceljs');
const { COLUMNAS, normalizarCodigo, leerWorkbook, validarFilas } = require('../src/utils/xlsxImport');

/** Genera un buffer .xlsx en memoria con las filas dadas (arrays paralelos a COLUMNAS). */
async function bufferConFilas(headers, filas) {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet('Productos');
  hoja.addRow(headers);
  filas.forEach((f) => hoja.addRow(f));
  return wb.xlsx.writeBuffer();
}

describe('normalizarCodigo', () => {
  it('recorta espacios y sube a mayúsculas', () => {
    expect(normalizarCodigo('  prod-001 ')).toBe('PROD-001');
  });
  it('trata null/undefined como cadena vacía', () => {
    expect(normalizarCodigo(null)).toBe('');
    expect(normalizarCodigo(undefined)).toBe('');
  });
});

describe('leerWorkbook', () => {
  it('parsea filas válidas respetando el orden de columnas del encabezado', async () => {
    const buffer = await bufferConFilas(
      ['nombre_producto', 'codigo', 'precio_unitario', 'stock_actual'],
      [['Producto Uno', 'PROD-001', 15000, 10]]
    );
    const filas = await leerWorkbook(buffer);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      codigo: 'PROD-001',
      nombre_producto: 'Producto Uno',
      precio_unitario: 15000,
      stock_actual: 10,
    });
  });

  it('ignora filas completamente vacías', async () => {
    const buffer = await bufferConFilas(
      COLUMNAS,
      [['PROD-001', 'Producto Uno', '', 15000, 10, '', '', ''], ['', '', '', '', '', '', '', '']]
    );
    const filas = await leerWorkbook(buffer);
    expect(filas).toHaveLength(1);
  });

  it('rechaza el archivo si falta una columna obligatoria', async () => {
    const buffer = await bufferConFilas(['codigo', 'nombre_producto'], [['PROD-001', 'Producto Uno']]);
    await expect(leerWorkbook(buffer)).rejects.toThrow(/Faltan columnas obligatorias/);
  });
});

describe('validarFilas', () => {
  it('separa filas válidas de inválidas sin abortar el resto', () => {
    const filas = [
      { _fila: 2, codigo: 'PROD-001', nombre_producto: 'Válido', precio_unitario: 1000, stock_actual: 5 },
      { _fila: 3, codigo: 'PROD-002', nombre_producto: '', precio_unitario: 1000, stock_actual: 5 }, // nombre vacío
    ];
    const { validas, invalidas } = validarFilas(filas);
    expect(validas).toHaveLength(1);
    expect(validas[0].datos.codigo).toBe('PROD-001');
    expect(invalidas).toHaveLength(1);
    expect(invalidas[0].fila).toBe(3);
    expect(invalidas[0].error).toMatch(/nombre_producto/);
  });
});
