'use strict';

const { Op, fn, col } = require('sequelize');
const { Caja, CajaMovimiento, Venta, Compra, Gasto, Empresa } = require('../models');
const { ValidationError } = require('../utils/errors');

const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Medio de pago '10' = Efectivo; forma_pago '1' = Contado (una venta a crédito
// no mete dinero a la caja aunque se marque "efectivo").
const esEfectivo = (forma, medio) => String(forma) === '1' && String(medio) === '10';

/**
 * Totales de una caja: ventas por forma/medio de pago y egresos.
 *   efectivo_esperado = base + ventas de contado en efectivo − egresos de caja.
 * Los ingresos de la caja solo entran por ventas; todo lo que sale (retiros,
 * gastos y compras pagados desde la caja) es un egreso registrado.
 */
async function calcularResumen(caja, transaction) {
  const filas = await Venta.findAll({
    where: { cajaId: caja.id, estado: 'ACTIVA' }, // una venta anulada ya no cuenta en el turno
    attributes: ['forma_pago', 'medio_pago', [fn('COUNT', col('id')), 'num'], [fn('SUM', col('total')), 'total']],
    group: ['forma_pago', 'medio_pago'],
    raw: true,
    transaction,
  });
  const medios = filas.map((f) => ({
    forma_pago: f.forma_pago,
    medio_pago: f.medio_pago,
    num: Number(f.num),
    total: redondear2(Number(f.total)),
  }));
  const num_ventas = medios.reduce((a, m) => a + m.num, 0);
  const total_ventas = redondear2(medios.reduce((a, m) => a + m.total, 0));
  const ventas_efectivo = redondear2(
    medios.filter((m) => esEfectivo(m.forma_pago, m.medio_pago)).reduce((a, m) => a + m.total, 0)
  );

  const egresosTotal = await CajaMovimiento.sum('monto', { where: { cajaId: caja.id }, transaction });
  const total_egresos = redondear2(egresosTotal || 0);

  return {
    num_ventas,
    total_ventas,
    ventas_efectivo,
    total_egresos,
    efectivo_esperado: redondear2(Number(caja.monto_inicial) + ventas_efectivo - total_egresos),
    medios,
  };
}

/**
 * Registra un egreso en la caja ABIERTA del usuario (retiro, o gasto/compra pagado
 * en efectivo). Debe llamarse dentro de una transacción `t`: bloquea la caja (el
 * mismo lock que ventas y cierre) y rechaza sacar más efectivo del que hay.
 */
async function registrarEgreso(req, t, { tipo, concepto, monto, gastoId = null, compraId = null, ventaId = null }) {
  const caja = await Caja.findOne({
    where: { empresaId: req.empresaId, usuarioId: req.userId, estado: 'ABIERTA' },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!caja) throw new ValidationError('Para pagar desde la caja debes tener una caja abierta.');

  const resumen = await calcularResumen(caja, t);
  if (Number(monto) > resumen.efectivo_esperado + 0.005) {
    throw new ValidationError(`La caja solo tiene ${resumen.efectivo_esperado.toLocaleString('es-CO')} en efectivo; no alcanza para ${Number(monto).toLocaleString('es-CO')}.`);
  }

  return CajaMovimiento.create({
    empresaId: req.empresaId,
    cajaId: caja.id,
    usuarioId: req.userId,
    tipo,
    concepto,
    monto: redondear2(monto),
    fecha: new Date(),
    gastoId,
    compraId,
    ventaId,
  }, { transaction: t });
}

const rangoFecha = (desde, hasta) => {
  if (!desde && !hasta) return undefined;
  const r = {};
  if (desde) r[Op.gte] = new Date(`${desde}T00:00:00`);
  if (hasta) r[Op.lte] = new Date(`${hasta}T23:59:59.999`);
  return r;
};

async function flujos(empresaId, desde, hasta) {
  const fecha = rangoFecha(desde, hasta);
  const f = fecha ? { fecha } : {};
  const [contado, credito, compras, gastos, retiros] = await Promise.all([
    Venta.sum('total', { where: { empresaId, estado: 'ACTIVA', forma_pago: '1', ...f } }),
    Venta.sum('total', { where: { empresaId, estado: 'ACTIVA', forma_pago: '2', ...f } }),
    Compra.sum('total', { where: { empresaId, ...f } }),
    Gasto.sum('monto', { where: { empresaId, estado: 'ACTIVO', ...f } }),
    CajaMovimiento.sum('monto', { where: { empresaId, tipo: 'RETIRO', ...f } }),
  ]);
  const r = {
    ventas: redondear2(contado || 0),
    ventas_credito: redondear2(credito || 0),
    compras: redondear2(compras || 0),
    gastos: redondear2(gastos || 0),
    retiros: redondear2(retiros || 0),
  };
  r.neto = redondear2(r.ventas - r.compras - r.gastos - r.retiros);
  return r;
}

/**
 * Dinero de la empresa frente a su capital inicial.
 *   dinero_actual = capital inicial + ventas cobradas − compras − gastos − retiros
 * Los ingresos solo entran por ventas de contado (las de crédito se muestran aparte,
 * "por cobrar"). Un gasto o compra pagado desde la caja NO se vuelve a restar como
 * retiro: ya está en compras/gastos. `variacion` = cuánto creció (o bajó) la base.
 */
async function calcularBalance(empresaId, { desde, hasta } = {}) {
  const empresa = await Empresa.findByPk(empresaId, { attributes: ['capital_inicial'] });
  const capital = redondear2(empresa?.capital_inicial || 0);

  const acumulado = await flujos(empresaId);
  const dinero_actual = redondear2(capital + acumulado.neto);
  const variacion = redondear2(dinero_actual - capital);

  const cajasAbiertas = await Caja.findAll({ where: { empresaId, estado: 'ABIERTA' }, attributes: ['id', 'monto_inicial', 'usuarioId'] });
  let efectivo_en_cajas = 0;
  for (const c of cajasAbiertas) efectivo_en_cajas += (await calcularResumen(c)).efectivo_esperado;

  return {
    capital_inicial: capital,
    dinero_actual,
    variacion,
    variacion_pct: capital > 0 ? redondear2((variacion / capital) * 100) : null,
    acumulado,
    periodo: desde || hasta ? await flujos(empresaId, desde, hasta) : null,
    efectivo_en_cajas: redondear2(efectivo_en_cajas),
    cajas_abiertas: cajasAbiertas.length,
  };
}

module.exports = { calcularResumen, registrarEgreso, calcularBalance, esEfectivo, redondear2 };
