'use strict';

const { fn, col, QueryTypes } = require('sequelize');
const { sequelize, AjusteInventario, Producto, Usuario } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { buildListWhere } = require('../utils/listFilters');
const { auditar } = require('../utils/audit');
const { unidadCorta } = require('../utils/unidades');
const { tiene } = require('../middlewares/auth');
const { armarDesviaciones } = require('../services/desviaciones');
const { invalidateDashboard } = require('./reporteController');
const { TIPOS_CON_RECETA, esPorLotes, redondear3 } = require('../services/recetas');

const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;


const FILTROS = (query) => buildListWhere(query, { fecha: 'fecha', igualdad: ['tipo', 'productoId'] });

/** Solo los productos con stock propio se ajustan (no platos ni preparaciones, salvo las que se producen por lotes). */
function exigirConStock(producto) {
  if (TIPOS_CON_RECETA.includes(producto.tipo) && !esPorLotes(producto)) {
    throw new ValidationError(`"${producto.nombre_producto}" no tiene stock propio (se descuenta de sus ingredientes).`);
  }
}

async function registrar(req, t, producto, tipo, nueva, motivo) {
  const anterior = Number(producto.stock_actual);
  const diferencia = redondear3(nueva - anterior);
  const costo = Number(producto.costo_promedio);
  await producto.update({ stock_actual: nueva }, { transaction: t });
  return AjusteInventario.create({
    empresaId: req.empresaId,
    productoId: producto.id,
    usuarioId: req.userId,
    tipo,
    cantidad_anterior: anterior,
    cantidad_nueva: nueva,
    diferencia,
    costo_unitario: costo,
    valor: redondear2(diferencia * costo),
    motivo: motivo || null,
    fecha: new Date(),
  }, { transaction: t });
}

/** Merma / vencido / consumo interno: baja el stock de un producto. */
exports.registrarSalida = async (req, res) => {
  const { productoId, tipo, cantidad, motivo } = req.body;

  let producto;
  const ajuste = await sequelize.transaction(async (t) => {
    producto = await Producto.findOne({ where: { id: productoId, empresaId: req.empresaId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!producto) throw new ValidationError('Producto inválido.');
    exigirConStock(producto);
    if (Number(producto.stock_actual) < cantidad) {
      throw new ValidationError(`No hay suficiente stock de "${producto.nombre_producto}" (hay ${Number(producto.stock_actual)}).`);
    }
    return registrar(req, t, producto, tipo, redondear3(Number(producto.stock_actual) - cantidad), motivo);
  });

  invalidateDashboard(req.empresaId);
  auditar(req, 'ajuste_inventario', {
    ajusteId: ajuste.id, productoId, productoNombre: producto.nombre_producto, tipo, cantidad, unidad: unidadCorta(producto.unidad_medida), valor: Number(ajuste.valor),
  });
  res.status(201).json(ajuste);
};

/**
 * Conteo físico: el stock real reemplaza al del sistema. Solo se registra un
 * ajuste donde hay diferencia (stock teórico vs. real), valorizada al costo.
 */
exports.registrarConteo = async (req, res) => {
  const { items, motivo } = req.body;
  const ids = items.map((i) => i.productoId);
  if (new Set(ids).size !== ids.length) throw new ValidationError('Hay productos repetidos en el conteo.');

  const resultado = await sequelize.transaction(async (t) => {
    // Orden fijo de locks (por id) para no cruzarse con otra transacción.
    const productos = await Producto.findAll({
      where: { id: ids, empresaId: req.empresaId }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE,
    });
    if (productos.length !== ids.length) throw new ValidationError('Producto inválido en el conteo.');
    const contado = new Map(items.map((i) => [i.productoId, i.cantidad_contada]));

    const ajustes = [];
    let sinCambio = 0;
    for (const p of productos) {
      exigirConStock(p);
      const nueva = contado.get(p.id);
      if (Math.abs(nueva - Number(p.stock_actual)) < 0.0005) { sinCambio += 1; continue; }
      ajustes.push(await registrar(req, t, p, 'CONTEO', nueva, motivo));
    }
    return { ajustes, sinCambio };
  });

  invalidateDashboard(req.empresaId);
  const valor = redondear2(resultado.ajustes.reduce((a, x) => a + Number(x.valor), 0));
  auditar(req, 'conteo_fisico', { ajustados: resultado.ajustes.length, sinCambio: resultado.sinCambio, valor });
  res.status(201).json({ ajustados: resultado.ajustes.length, sin_cambio: resultado.sinCambio, valor_total: valor, ajustes: resultado.ajustes });
};

exports.getAjustes = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query);
  const { count, rows } = await AjusteInventario.findAndCountAll({
    where: { empresaId: req.empresaId, ...FILTROS(req.query) },
    include: [
      { model: Producto, attributes: ['nombre_producto', 'codigo', 'unidad_medida'] },
      { model: Usuario, attributes: ['nombre'] },
    ],
    order: [['fecha', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });
  setTotalCount(res, count);
  res.json(rows);
};

/** Pérdidas (y sobrantes) valorizadas por tipo, en el rango pedido. */
exports.getResumen = async (req, res) => {
  const filas = await AjusteInventario.findAll({
    where: { empresaId: req.empresaId, ...buildListWhere(req.query, { fecha: 'fecha' }) },
    attributes: ['tipo', [fn('COUNT', col('id')), 'num'], [fn('SUM', col('valor')), 'valor']],
    group: ['tipo'],
    raw: true,
  });
  const porTipo = filas.map((f) => ({ tipo: f.tipo, num: Number(f.num), valor: redondear2(f.valor) }));
  res.json({ por_tipo: porTipo, valor_total: redondear2(porTipo.reduce((a, f) => a + f.valor, 0)) });
};

/** Condición de fechas (hora local) sobre una columna de fecha, y sus parámetros. */
function condicionDeFechas(columna, { desde, hasta }, replacements) {
  const partes = [];
  if (desde) { partes.push(`AND ${columna} >= :desde`); replacements.desde = new Date(`${desde}T00:00:00`); }
  if (hasta) { partes.push(`AND ${columna} <= :hasta`); replacements.hasta = new Date(`${hasta}T23:59:59.999`); }
  return partes.join(' ');
}

/**
 * Informe de desviaciones: por producto, lo que DEBIÓ gastarse según las recetas (consumo teórico de
 * las ventas, neto de lo que volvió por devoluciones, más lo que gastaron las producciones por lotes)
 * contra lo que apareció o faltó al contar (conteo físico) y las mermas registradas.
 * El conteo ya compara contra el stock del sistema, que descuenta el consumo teórico: su diferencia
 * es la desviación (faltante si es negativa, sobrante si es positiva).
 */
exports.getDesviaciones = async (req, res) => {
  const replacements = { empresaId: req.empresaId };
  const fechasVenta = condicionDeFechas('v."fecha"', req.query, replacements);
  const fechasProduccion = condicionDeFechas('pr."fecha"', req.query, replacements);
  const fechasAjuste = condicionDeFechas('a."fecha"', req.query, replacements);

  const [ventas, producciones, ajustes] = await Promise.all([
    sequelize.query(
      `SELECT (e->>'productoId')::int AS "productoId",
              SUM((e->>'cantidad')::numeric * GREATEST(0, 1 - vd."cantidad_reingresada" / NULLIF(vd."cantidad", 0))) AS cantidad
         FROM "ventas_detalles" vd
         JOIN "ventas" v ON v."id" = vd."ventaId"
         CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(vd."consumo") = 'array' THEN vd."consumo" ELSE '[]'::jsonb END) AS e
        WHERE v."empresaId" = :empresaId AND v."estado" = 'ACTIVA' ${fechasVenta}
        GROUP BY 1`,
      { type: QueryTypes.SELECT, replacements }
    ),
    sequelize.query(
      `SELECT (e->>'productoId')::int AS "productoId", SUM((e->>'cantidad')::numeric) AS cantidad
         FROM "producciones" pr
         CROSS JOIN LATERAL jsonb_array_elements(pr."consumo") AS e
        WHERE pr."empresaId" = :empresaId AND pr."estado" = 'ACTIVA' ${fechasProduccion}
        GROUP BY 1`,
      { type: QueryTypes.SELECT, replacements }
    ),
    sequelize.query(
      `SELECT a."productoId", a."tipo", SUM(a."diferencia") AS diferencia, SUM(a."valor") AS valor
         FROM "ajustes_inventario" a
        WHERE a."empresaId" = :empresaId ${fechasAjuste}
        GROUP BY a."productoId", a."tipo"`,
      { type: QueryTypes.SELECT, replacements }
    ),
  ]);

  const ids = [...new Set([...ventas, ...producciones, ...ajustes].map((f) => Number(f.productoId)))];
  const productos = ids.length
    ? await Producto.findAll({ where: { id: ids, empresaId: req.empresaId }, attributes: ['id', 'nombre_producto', 'codigo', 'tipo', 'unidad_medida', 'costo_promedio'], raw: true })
    : [];

  const informe = armarDesviaciones({ productos, ventas, producciones, ajustes });
  if (!tiene(req, 'costos.ver')) {
    for (const f of informe.filas) { delete f.valor_conteo; delete f.valor_mermas; delete f.costo_unitario; }
    informe.totales = { productos: informe.totales.productos, con_faltante: informe.totales.con_faltante };
  }
  res.json(informe);
};
