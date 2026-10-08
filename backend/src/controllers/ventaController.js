const { sequelize, Venta, VentaDetalle, Producto, Servicio, Cliente, Usuario, Empresa, Caja, Modificador, ModificadorItem } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { buildListWhere } = require('../utils/listFilters');
const { auditar } = require('../utils/audit');
const { invalidateDashboard } = require('./reporteController');
const { invalidateInforme } = require('./informeController');
const { calcularVenta } = require('../services/calculo');
const { TIPOS_NO_VENDIBLES, redondear3, consumoConModificadores } = require('../services/recetas');
const { cargarRecetas } = require('../services/recetasDb');

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
  for (const insumoId of [...consumo.keys()].sort((x, y) => x - y)) {
    const porPorcion = consumo.get(insumoId);
    const insumo = await Producto.findByPk(insumoId, { transaction: t, lock: t.LOCK.UPDATE });
    const necesario = redondear3(porPorcion * cantidad);
    if (!insumo || Number(insumo.stock_actual) < necesario) {
      throw new ValidationError(`Stock insuficiente de "${insumo ? insumo.nombre_producto : 'un ingrediente'}" para preparar "${plato.nombre_producto}".`);
    }
    await insumo.update({ stock_actual: redondear3(Number(insumo.stock_actual) - necesario) }, { transaction: t });
    costoPorcion += porPorcion * Number(insumo.costo_promedio);
  }
  return costoPorcion;
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
    items: m.items.map((i) => ({ insumoId: i.insumoId, cantidad: Number(i.cantidad) })),
  }));
}

exports.getVentas = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query);
  const where = {
    empresaId: req.empresaId,
    ...buildListWhere(req.query, { fecha: 'fecha', igualdad: ['clienteId'] }),
  };

  const total = await Venta.count({ where });
  const ventas = await Venta.findAll({
    where,
    // La empresa activa ya la conoce el cliente; para el PDF de una venta
    // concreta se usa GET /api/ventas/:id (que sí incluye Empresa).
    include: [
      { model: Usuario, attributes: ['nombre'] },
      Cliente,
      { model: VentaDetalle, include: [Producto, Servicio] },
    ],
    order: [['fecha', 'DESC']],
    limit,
    offset,
  });

  setTotalCount(res, total);
  res.json(ventas);
};

exports.getVentaById = async (req, res) => {
  const venta = await Venta.findOne({
    where: { id: req.params.id, empresaId: req.empresaId },
    include: [
      { model: Usuario, attributes: ['nombre'] },
      Cliente,
      { model: VentaDetalle, include: [Producto, Servicio] },
      { model: Empresa, attributes: ['nombre', 'nit', 'contacto'] },
    ],
  });
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
  res.json(venta);
};

exports.createVenta = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { clienteId, detalles, descuento_global, forma_pago, medio_pago } = req.body;

    let clienteNombre = null;
    if (clienteId) {
      const cliente = await Cliente.findOne({ where: { id: clienteId, empresaId: req.empresaId }, transaction: t });
      if (!cliente) throw new ValidationError('Cliente inválido');
      clienteNombre = cliente.nombre;
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
      const precioVenta = Number(item.precio_unitario);
      let porcentajeIva = 0;
      let precioBase = 0; // precio de lista: SIEMPRE de la BD, nunca del cliente
      let nombre = '';
      let costoUnitario = 0; // costo de lo vendido por unidad (foto para rentabilidad)
      let modsLinea = [];

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
        if (prod.tipo === 'RECETA') {
          // Plato: descuenta sus ingredientes (sub-recetas y modificadores incluidos);
          // su propio stock no cuenta.
          modsLinea = await cargarModificadoresLinea(item.modificadores, req.empresaId, t);
          recetas ??= await cargarRecetas(req.empresaId, { transaction: t });
          precioBase += modsLinea.reduce((a, m) => a + m.precio_extra, 0);
          costoUnitario = await descontarConsumo(prod, consumoConModificadores(prod.id, recetas, modsLinea), cantidad, t);
        } else {
          if (Number(prod.stock_actual) < cantidad) throw new ValidationError(`Stock insuficiente: ${prod.nombre_producto}`);
          await prod.update({ stock_actual: Number(prod.stock_actual) - cantidad }, { transaction: t });
          costoUnitario = Number(prod.costo_promedio);
        }
      } else {
        const serv = await Servicio.findByPk(item.servicioId, { transaction: t });
        if (!serv || serv.empresaId !== req.empresaId) throw new ValidationError('Servicio inválido');
        porcentajeIva = Number(serv.porcentaje_iva || 0);
        precioBase = Number(serv.precio);
        nombre = serv.nombre;
      }

      // El precio de venta no puede superar el de lista ni bajar del piso permitido.
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
        modificadores: modsLinea.map((m) => ({ id: m.id, nombre: m.nombre, precio_extra: m.precio_extra })),
      });
    }

    // Los importes los calcula el servidor; NO se confía en el total ni en el
    // precio_base del cliente. `descuento_global` es un porcentaje 0–100.
    const calc = calcularVenta(lineas, descuento_global);

    const venta = await Venta.create({
      empresaId: req.empresaId,
      usuarioId: req.userId,
      cajaId: caja ? caja.id : null,
      clienteId: clienteId || null,
      total: calc.total,
      descuento_global: calc.descuento_global,
      total_descuentos: calc.total_descuentos,
      forma_pago: forma_pago || '1',
      medio_pago: medio_pago || '10',
      subtotal_bruto: calc.subtotal_bruto,
      total_impuestos: calc.total_impuestos,
      estado_fe: 'NO_EMITIDA',
    }, { transaction: t });

    await VentaDetalle.bulkCreate(
      calc.detalles.map((d) => ({ ...d, ventaId: venta.id })),
      { transaction: t }
    );

    await t.commit();
    invalidateDashboard(req.empresaId);
    invalidateInforme(req.empresaId);
    auditar(req, 'venta_creada', { ventaId: venta.id, total: calc.total, clienteId: venta.clienteId, clienteNombre, numItems: lineas.length });
    res.status(201).json(venta);
  } catch (error) {
    await t.rollback();
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('CREATE VENTA ERROR:', error);
    return res.status(500).json({ error: 'Error al registrar la venta' });
  }
};

