const { armarDesviaciones } = require('../src/services/desviaciones');

const prod = (id, nombre, extra = {}) => ({ id, nombre_producto: nombre, codigo: `C${id}`, tipo: 'INSUMO', unidad_medida: 'GRM', costo_promedio: 2, ...extra });

describe('armarDesviaciones', () => {
  it('el faltante al contar se compara con lo que debió gastarse', () => {
    const { filas, totales } = armarDesviaciones({
      productos: [prod(1, 'Tomate')],
      ventas: [{ productoId: 1, cantidad: '500' }],
      producciones: [{ productoId: 1, cantidad: '500' }],
      ajustes: [{ productoId: 1, tipo: 'CONTEO', diferencia: '-80', valor: '-160' }],
    });
    expect(filas[0]).toMatchObject({
      consumo_ventas: 500, consumo_produccion: 500, consumo_teorico: 1000, conteo: -80, faltante: 80, sobrante: 0,
      valor_conteo: -160, desviacion_pct: 8, estado: 'FALTANTE', contado: true,
    });
    expect(totales).toMatchObject({ contados: 1, con_faltante: 1, valor_faltante: 160, valor_sobrante: 0 });
  });

  it('un sobrante no es faltante y no calcula porcentaje', () => {
    const { filas, totales } = armarDesviaciones({
      productos: [prod(1, 'Aceite')],
      ventas: [{ productoId: 1, cantidad: 100 }],
      ajustes: [{ productoId: 1, tipo: 'CONTEO', diferencia: 15, valor: 30 }],
    });
    expect(filas[0]).toMatchObject({ estado: 'SOBRANTE', sobrante: 15, faltante: 0, desviacion_pct: null });
    expect(totales).toMatchObject({ valor_sobrante: 30, valor_faltante: 0, con_faltante: 0 });
  });

  it('las mermas se reportan aparte y no cuentan como desviación', () => {
    const { filas, totales } = armarDesviaciones({
      productos: [prod(1, 'Leche')],
      ajustes: [
        { productoId: 1, tipo: 'MERMA', diferencia: -3, valor: -6 },
        { productoId: 1, tipo: 'VENCIDO', diferencia: -2, valor: -4 },
      ],
    });
    expect(filas[0]).toMatchObject({ mermas: 5, valor_mermas: 10, contado: false, estado: 'SIN_CONTEO', faltante: 0 });
    expect(totales.valor_mermas).toBe(10);
  });

  it('suma varios conteos del periodo y respeta el signo', () => {
    const { filas } = armarDesviaciones({
      productos: [prod(1, 'Azúcar')],
      ventas: [{ productoId: 1, cantidad: 1000 }],
      ajustes: [
        { productoId: 1, tipo: 'CONTEO', diferencia: -50, valor: -100 },
        { productoId: 1, tipo: 'CONTEO', diferencia: 20, valor: 40 },
      ],
    });
    expect(filas[0]).toMatchObject({ conteo: -30, valor_conteo: -60, faltante: 30, desviacion_pct: 3 });
  });

  it('ordena primero lo que más dinero faltó y omite productos sin movimiento', () => {
    const { filas } = armarDesviaciones({
      productos: [prod(1, 'A'), prod(2, 'B'), prod(3, 'C'), prod(4, 'Quieto')],
      ventas: [{ productoId: 1, cantidad: 10 }, { productoId: 3, cantidad: 50 }],
      ajustes: [
        { productoId: 2, tipo: 'CONTEO', diferencia: -10, valor: -500 },
        { productoId: 3, tipo: 'CONTEO', diferencia: -1, valor: -2 },
      ],
    });
    expect(filas.map((f) => f.nombre_producto)).toEqual(['B', 'C', 'A']);
  });

  it('una diferencia de redondeo no es una desviación', () => {
    const { filas } = armarDesviaciones({
      productos: [prod(1, 'Sal')],
      ventas: [{ productoId: 1, cantidad: 10 }],
      ajustes: [{ productoId: 1, tipo: 'CONTEO', diferencia: 0.0002, valor: 0 }],
    });
    expect(filas[0].estado).toBe('OK');
  });
});
