'use strict';

/**
 * Informe de desviaciones de inventario (lógica pura).
 *
 *   consumo teórico = lo que debieron gastar las ventas según las recetas (neto de devoluciones
 *                     reingresadas) + lo que gastaron las producciones por lotes.
 *   conteo          = diferencia que apareció al contar (físico − sistema). El stock del sistema ya
 *                     descuenta el consumo teórico, así que lo que falta al contar es la desviación:
 *                     negativo = faltante, positivo = sobrante.
 *   mermas          = pérdidas ya reconocidas (merma, vencido, consumo interno): no son desviación.
 *
 * Entradas (filas de la consulta SQL, valores numéricos como string o number):
 *   productos     [{ id, nombre_producto, codigo, tipo, unidad_medida, costo_promedio }]
 *   ventas        [{ productoId, cantidad }]            consumo teórico de ventas
 *   producciones  [{ productoId, cantidad }]            ingredientes gastados produciendo lotes
 *   ajustes       [{ productoId, tipo, diferencia, valor }]  agrupados por producto y tipo
 */

const redondear3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const TIPOS_MERMA = ['MERMA', 'VENCIDO', 'CONSUMO_INTERNO'];
// Por debajo de esto una diferencia es ruido de redondeo, no una desviación.
const EPS = 0.0005;

function armarDesviaciones({ productos, ventas = [], producciones = [], ajustes = [] }) {
  const acumular = (filas) => {
    const m = new Map();
    for (const f of filas) m.set(Number(f.productoId), (m.get(Number(f.productoId)) || 0) + Number(f.cantidad));
    return m;
  };
  const deVentas = acumular(ventas);
  const deProduccion = acumular(producciones);

  const merma = new Map(); // productoId -> { cantidad, valor }  (positivos = pérdida)
  const conteo = new Map(); // productoId -> { diferencia, valor }
  for (const a of ajustes) {
    const id = Number(a.productoId);
    if (TIPOS_MERMA.includes(a.tipo)) {
      const m = merma.get(id) || { cantidad: 0, valor: 0 };
      m.cantidad += -Number(a.diferencia);
      m.valor += -Number(a.valor);
      merma.set(id, m);
    } else if (a.tipo === 'CONTEO') {
      const c = conteo.get(id) || { diferencia: 0, valor: 0 };
      c.diferencia += Number(a.diferencia);
      c.valor += Number(a.valor);
      conteo.set(id, c);
    }
  }

  const filas = productos.map((p) => {
    const consumoVentas = redondear3(deVentas.get(p.id) || 0);
    const consumoProduccion = redondear3(deProduccion.get(p.id) || 0);
    const teorico = redondear3(consumoVentas + consumoProduccion);
    const c = conteo.get(p.id);
    const m = merma.get(p.id);
    const dif = c ? redondear3(c.diferencia) : 0;
    const faltante = dif < -EPS ? redondear3(-dif) : 0;
    const sobrante = dif > EPS ? dif : 0;
    return {
      productoId: p.id,
      nombre_producto: p.nombre_producto,
      codigo: p.codigo,
      tipo: p.tipo,
      unidad_medida: p.unidad_medida,
      costo_unitario: Number(p.costo_promedio),
      consumo_ventas: consumoVentas,
      consumo_produccion: consumoProduccion,
      consumo_teorico: teorico,
      mermas: m ? redondear3(m.cantidad) : 0,
      valor_mermas: m ? redondear2(m.valor) : 0,
      contado: !!c,
      conteo: dif,
      valor_conteo: c ? redondear2(c.valor) : 0,
      faltante,
      sobrante,
      // Qué parte de lo que debía gastarse "desapareció": 100 de consumo teórico y 8 de faltante = 8 %.
      desviacion_pct: faltante > 0 && teorico > 0 ? redondear2((faltante / teorico) * 100) : null,
      estado: !c ? 'SIN_CONTEO' : faltante > 0 ? 'FALTANTE' : sobrante > 0 ? 'SOBRANTE' : 'OK',
    };
  }).filter((f) => f.consumo_teorico > 0 || f.contado || f.mermas > 0);

  // Lo que más dinero faltó primero; luego lo sobrante; luego lo contado sin diferencia y lo no contado por consumo.
  filas.sort((a, b) => a.valor_conteo - b.valor_conteo || b.consumo_teorico - a.consumo_teorico);

  const contados = filas.filter((f) => f.contado);
  const totales = {
    productos: filas.length,
    contados: contados.length,
    con_faltante: filas.filter((f) => f.estado === 'FALTANTE').length,
    valor_faltante: redondear2(contados.filter((f) => f.valor_conteo < 0).reduce((a, f) => a - f.valor_conteo, 0)),
    valor_sobrante: redondear2(contados.filter((f) => f.valor_conteo > 0).reduce((a, f) => a + f.valor_conteo, 0)),
    valor_mermas: redondear2(filas.reduce((a, f) => a + f.valor_mermas, 0)),
  };
  return { filas, totales };
}

/**
 * Cada conteo físico comparado contra el ANTERIOR del mismo producto (lógica pura).
 * `filas` = [{ id, productoId, fecha, previo, diferencia, valor, consumo_ventas, consumo_produccion, mermas }]
 * (consumos y mermas son los ocurridos entre el conteo anterior y este). Un faltante cuyo % del consumo teórico
 * llega a `umbralPct` es una alerta. Sin conteo anterior no hay con qué comparar: queda `sin_base`.
 */
function evaluarEventosDeConteo(filas, umbralPct) {
  return filas.map((f) => {
    const dif = redondear3(f.diferencia);
    const faltante = dif < -EPS ? redondear3(-dif) : 0;
    const sobrante = dif > EPS ? dif : 0;
    const teorico = redondear3(Number(f.consumo_ventas || 0) + Number(f.consumo_produccion || 0));
    const sinBase = !f.previo;
    const pct = !sinBase && faltante > 0 && teorico > 0 ? redondear2((faltante / teorico) * 100) : null;
    return {
      ajusteId: f.id,
      productoId: Number(f.productoId),
      fecha: f.fecha,
      previo: f.previo || null,
      sin_base: sinBase,
      consumo_teorico: teorico,
      mermas: redondear3(f.mermas || 0),
      conteo: dif,
      faltante,
      sobrante,
      valor_conteo: redondear2(f.valor),
      desviacion_pct: pct,
      alerta: pct != null && pct >= Number(umbralPct),
    };
  });
}

module.exports = { armarDesviaciones, evaluarEventosDeConteo };
