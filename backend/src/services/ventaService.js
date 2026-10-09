'use strict';

const { Venta, VentaDetalle, Producto, Servicio, Cliente, Caja, Modificador, ModificadorItem, ComboItem } = require('../models');
const { ValidationError } = require('../utils/errors');
const { calcularVenta } = require('./calculo');
const { calcularVencimiento, redondear2 } = require('./cartera');
const { TIPOS_NO_VENDIBLES, redondear3, consumoConModificadores } = require('./recetas');
const { cargarRecetas } = require('./recetasDb');
const { opcionesDe } = require('../middlewares/opciones');
const { validarSeleccion } = require('./grupos');
const { cargarGrupos } = require('./gruposDb');
const { fechaISO } = require('./lotes');

// Descuento máximo permitido sobre el precio de lista de una línea (%). Por
// defecto 100 (se puede llegar a $0). Poner p.ej. 50 para no vender por debajo
// de la mitad del precio de lista.
const MAX_DESC_LINEA_PCT = Math.min(100, Math.max(0, Number(process.env.VENTA_DESCUENTO_LINEA_MAX_PCT || 100)));

/**
 * Descuenta del inventario los ingredientes de `cantidad` porciones de un plato.
 * `consumo` = Map(insumoBaseId -> cantidad por porción), con sub-recetas y
 * modificadores ya expandidos. Bloquea cada insumo (FOR UPDATE, en orden de id
 * para no cruzar locks) y falla si alguno no alcanza. Devuelve el costo de UNA
 * porción (foto para el reporte de rentabilidad). Dentro de la transacción de la venta.
 */
async function descontarConsumo(plato, consumo, cantidad, t) {
  if (consumo.size === 0) throw new ValidationError(`El plato "${plato.nombre_producto}" no tiene receta configurada.`);

  let costoPorcion = 0;
  const descontado = []; // [{ productoId, cantidad }] total de la línea, para poder devolverlo exacto
  for (const insumoId of [...consumo.keys()].sort((x, y) => x - y)) {
    const porPorcion = consumo.get(insumoId);
    const insumo = await Producto.findByPk(insumoId, { transaction: t, lock: t.LOCK.UPDATE });
    const necesario = redondear3(porPorcion * cantidad);
    if (!insumo || Number(insumo.stock_actual) < necesario) {
      throw new ValidationError(`Stock insuficiente de "${insumo ? insumo.nombre_producto : 'un ingrediente'}" para preparar "${plato.nombre_producto}".`);
    }
    await insumo.update({ stock_actual: redondear3(Number(insumo.stock_actual) - necesario) }, { transaction: t });
    costoPorcion += porPorcion * Number(insumo.costo_promedio);
    descontado.push({ productoId: insumoId, cantidad: necesario });
  }
  return { costoPorcion, consumo: descontado };
}

/** Modificadores elegidos en una línea: activos, de la empresa, con sus ingredientes. */
async function cargarModificadoresLinea(ids, empresaId, t) {
  const unicos = [...new Set(ids || [])];
  if (unicos.length === 0) return [];
  const mods = await Modificador.findAll({
    where: { id: unicos, empresaId, activo: true },
    include: [{ model: ModificadorItem, as: 'items' }],
    transaction: t,
  });
  if (mods.length !== unicos.length) throw new ValidationError('Modificador inválido o inactivo.');
  return mods.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    precio_extra: Number(m.precio_extra),
    grupoId: m.grupoId ?? null,
    items: m.items.map((i) => ({ insumoId: i.insumoId, cantidad: Number(i.cantidad) })),
  }));
}

/**
 * Registra una venta completa dentro de la transacción `t`: valida cliente, caja abierta, stock y
 * precios contra la BD, descuenta inventario (platos: sus ingredientes), calcula los importes en el
 * servidor y crea la venta con sus líneas. Lo usan el POS (createVenta) y el cobro de una cuenta de mesa.
 *
 * `body` = { clienteId, detalles: [{ productoId|servicioId, cantidad, precio_unitario?, modificadores? }],
 *            descuento_global, forma_pago, medio_pago, dias_credito }. Una línea sin `precio_unitario` se vende al
 * precio de lista. `extras` = { cuentaId, propina } para ventas que salen de una cuenta de mesa.
 * Lanza ValidationError ante cualquier regla de negocio incumplida (el llamador hace rollback).
 */
async function registrarVenta(req, t, body, { cuentaId = null, propina = 0, exigirGrupos = false } = {}) {
  const { clienteId, detalles, descuento_global, forma_pago, medio_pago, dias_credito } = body;
  const aCredito = String(forma_pago) === '2';
  if (aCredito) {
    if (!req.empresaModulos?.has('Cuentas por cobrar')) {
      throw new ValidationError('Para vender a crédito habilita el módulo "Cuentas por cobrar".');
    }
    if (!clienteId) throw new ValidationError('Una venta a crédito necesita un cliente.');
  }
  const diasCredito = aCredito ? (dias_credito ?? 30) : null;
  const ef = await opcionesDe(req); // funciones opcionales encendidas de esta empresa

  let clienteNombre = null;
  let clienteRow = null;
  if (clienteId) {
    // A crédito se bloquea la fila del cliente: dos ventas simultáneas no pueden pasarse del cupo.
    clienteRow = await Cliente.findOne({
      where: { id: clienteId, empresaId: req.empresaId }, transaction: t, ...(aCredito ? { lock: t.LOCK.UPDATE } : {}),
    });
    if (!clienteRow) throw new ValidationError('Cliente inválido');
    clienteNombre = clienteRow.nombre;
  }

  // Con el módulo Caja, toda venta se registra en la caja abierta del usuario.
  // El lock serializa "vender" y "cerrar caja": una venta no puede colarse
  // después de que el cierre tomó la foto de los totales.
  let caja = null;
  if (req.empresaModulos?.has('Caja')) {
    caja = await Caja.findOne({
      where: { empresaId: req.empresaId, usuarioId: req.userId, estado: 'ABIERTA' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!caja) throw new ValidationError('Debes abrir caja antes de registrar ventas.');
  }

  // Valida cada línea contra la BD (tenant + stock + precio), aplica el efecto
  // en stock y arma la entrada para el cálculo de importes.
  const lineas = [];
  let recetas = null; // se carga una sola vez, solo si hay platos
  for (const item of detalles) {
    const cantidad = Number(item.cantidad);
    let precioVenta = item.precio_unitario == null ? null : Number(item.precio_unitario); // sin precio = el de lista
    let porcentajeIva = 0;
    let precioBase = 0; // precio de lista: SIEMPRE de la BD, nunca del cliente
    let nombre = '';
    let costoUnitario = 0; // costo de lo vendido por unidad (foto para rentabilidad)
    let modsLinea = [];
    let extrasMods = 0; // lo que suman los modificadores al precio
    let consumoLinea = null; // inventario descontado por esta línea (para anulaciones)

    if (item.modificadores?.length && !item.productoId) {
      throw new ValidationError('Solo los platos admiten modificadores.');
    }

    if (item.productoId) {
      // Lock de fila: dos ventas concurrentes del mismo producto no pueden
      // leer el mismo stock y sobrevenderlo.
      const prod = await Producto.findByPk(item.productoId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!prod || prod.empresaId !== req.empresaId) throw new ValidationError('Producto inválido');
      if (TIPOS_NO_VENDIBLES.includes(prod.tipo)) {
        throw new ValidationError(`"${prod.nombre_producto}" es un ${prod.tipo === 'INSUMO' ? 'insumo' : 'ingrediente preparado'}; no se vende directamente.`);
      }
      if (prod.tipo !== 'RECETA' && item.modificadores?.length) {
        throw new ValidationError('Solo los platos admiten modificadores.');
      }
      porcentajeIva = Number(prod.porcentaje_iva || 0);
      precioBase = Number(prod.precio_unitario);
      nombre = prod.nombre_producto;
      if (ef.agotados_manuales && prod.agotado_dia === fechaISO()) throw new ValidationError(`«${prod.nombre_producto}» está agotado por hoy.`);
      if (prod.tipo === 'COMBO') {
        // Combo: se vende a su precio y descuenta lo de TODOS sus componentes (platos y productos), de una sola vez.
        if (!ef.combos) throw new ValidationError(`Los combos no están activados: «${prod.nombre_producto}» no se puede vender.`);
        const partes = await ComboItem.findAll({ where: { comboId: prod.id }, include: [{ model: Producto, as: 'componente' }], order: [['productoId', 'ASC']], transaction: t });
        if (partes.length === 0) throw new ValidationError(`El combo "${prod.nombre_producto}" no tiene componentes.`);
        recetas ??= await cargarRecetas(req.empresaId, { transaction: t });
        const porCombo = new Map(); // productoId -> cantidad por 1 combo
        for (const c of partes) {
          const comp = c.componente;
          if (!comp || !['VENTA', 'RECETA'].includes(comp.tipo)) throw new ValidationError(`El combo "${prod.nombre_producto}" tiene un componente no válido.`);
          if (ef.agotados_manuales && comp.agotado_dia === fechaISO()) throw new ValidationError(`«${comp.nombre_producto}» (parte de «${prod.nombre_producto}») está agotado por hoy.`);
          const consumoComp = comp.tipo === 'RECETA' ? consumoConModificadores(comp.id, recetas, []) : new Map([[comp.id, 1]]);
          for (const [id, q] of consumoComp) porCombo.set(id, (porCombo.get(id) || 0) + q * Number(c.cantidad));
        }
        const r = await descontarConsumo(prod, porCombo, cantidad, t);
        costoUnitario = r.costoPorcion;
        consumoLinea = r.consumo;
      } else if (prod.tipo === 'RECETA') {
        // Plato: descuenta sus ingredientes (sub-recetas y modificadores incluidos);
        // su propio stock no cuenta.
        modsLinea = await cargarModificadoresLinea(item.modificadores, req.empresaId, t);
        if (exigirGrupos && ef.modificadores_grupos) {
          // Con grupos de modificadores activados, el mostrador debe elegir los obligatorios (punto de cocción, leche…).
          const falla = validarSeleccion(prod, await cargarGrupos(req.empresaId, { transaction: t }), modsLinea);
          if (falla) throw new ValidationError(falla);
        }
        recetas ??= await cargarRecetas(req.empresaId, { transaction: t });
        extrasMods = modsLinea.reduce((a, m) => a + m.precio_extra, 0);
        precioBase += extrasMods;
        const r = await descontarConsumo(prod, consumoConModificadores(prod.id, recetas, modsLinea), cantidad, t);
        costoUnitario = r.costoPorcion;
        consumoLinea = r.consumo;
      } else {
        if (Number(prod.stock_actual) < cantidad) throw new ValidationError(`Stock insuficiente: ${prod.nombre_producto}`);
        await prod.update({ stock_actual: Number(prod.stock_actual) - cantidad }, { transaction: t });
        costoUnitario = Number(prod.costo_promedio);
        consumoLinea = [{ productoId: prod.id, cantidad }];
      }
    } else {
      const serv = await Servicio.findByPk(item.servicioId, { transaction: t });
      if (!serv || serv.empresaId !== req.empresaId) throw new ValidationError('Servicio inválido');
      porcentajeIva = Number(serv.porcentaje_iva || 0);
      precioBase = Number(serv.precio);
      nombre = serv.nombre;
    }

    // El precio de venta no puede superar el de lista ni bajar del piso permitido.
    // Oferta por horario con la que se pidió (cuentas de mesa): se vende a ese precio + extras, sin descuento adicional.
    if (precioVenta == null && item.precio_promo != null && ef.precios_horario) precioVenta = Number(item.precio_promo) + extrasMods;
    if (precioVenta == null) precioVenta = precioBase;
    if (precioVenta > precioBase + 0.005) {
      throw new ValidationError(`El precio de "${nombre}" no puede superar el precio de lista (${precioBase}).`);
    }
    const pisoLinea = precioBase * (1 - MAX_DESC_LINEA_PCT / 100);
    if (precioVenta < pisoLinea - 0.005) {
      throw new ValidationError(`El descuento en "${nombre}" supera el máximo permitido (${MAX_DESC_LINEA_PCT}%).`);
    }

    lineas.push({
      productoId: item.productoId || null,
      servicioId: item.servicioId || null,
      cantidad,
      precioConIva: precioVenta,
      porcentajeIva,
      precioBase, // de la BD
      costoUnitario,
      consumo: consumoLinea,
      modificadores: modsLinea.map((m) => ({ id: m.id, nombre: m.nombre, precio_extra: m.precio_extra })),
    });
  }

  // Los importes los calcula el servidor; NO se confía en el total ni en el
  // precio_base del cliente. `descuento_global` es un porcentaje 0–100.
  const calc = calcularVenta(lineas, descuento_global);

  // Cupo de crédito: lo que ya debe + esta venta no puede pasar del tope del cliente.
  if (aCredito && clienteRow.cupo_credito != null) {
    const deuda = redondear2(await Venta.sum('saldo_pendiente', {
      where: { empresaId: req.empresaId, clienteId, estado: 'ACTIVA' }, transaction: t,
    }) || 0);
    const cupo = Number(clienteRow.cupo_credito);
    if (deuda + calc.total > cupo + 0.005) {
      throw new ValidationError(
        `Supera el cupo de crédito de ${clienteNombre}: debe ${deuda.toLocaleString('es-CO')}, esta venta suma ${calc.total.toLocaleString('es-CO')} y su cupo es ${cupo.toLocaleString('es-CO')}.`
      );
    }
  }

  const venta = await Venta.create({
    empresaId: req.empresaId,
    usuarioId: req.userId,
    cajaId: caja ? caja.id : null,
    cuentaId,
    propina: redondear2(propina),
    clienteId: clienteId || null,
    total: calc.total,
    descuento_global: calc.descuento_global,
    total_descuentos: calc.total_descuentos,
    forma_pago: forma_pago || '1',
    medio_pago: medio_pago || '10',
    // Crédito: todo el total queda por cobrar hasta que el cliente abone.
    saldo_pendiente: aCredito ? calc.total : 0,
    dias_credito: diasCredito,
    fecha_vencimiento: aCredito ? calcularVencimiento(diasCredito) : null,
    subtotal_bruto: calc.subtotal_bruto,
    total_impuestos: calc.total_impuestos,
    estado_fe: 'NO_EMITIDA',
  }, { transaction: t });

  await VentaDetalle.bulkCreate(
    calc.detalles.map((d) => ({ ...d, ventaId: venta.id })),
    { transaction: t }
  );

  return { venta, calc, clienteNombre, aCredito, diasCredito, numItems: lineas.length };
}

module.exports = { registrarVenta, descontarConsumo, cargarModificadoresLinea, MAX_DESC_LINEA_PCT };
