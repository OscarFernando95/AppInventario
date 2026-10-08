const { TIPOS_CON_RECETA } = require('../services/recetas');
const { promedioPonderado } = require('../services/costos');
const { aUnidadBase, presentacionDe } = require('../services/presentacion');
const { sequelize, Pedido, PedidoDetalle, Proveedor, Producto, Compra, CompraDetalle } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { buildListWhere } = require('../utils/listFilters');
const { invalidateDashboard } = require('./reporteController');
const { invalidateInforme } = require('./informeController');
const { calcularTotalCompra } = require('../services/calculo');
const { auditar } = require('../utils/audit');
const { registrarEgreso } = require('../services/cajaService');
const { condicionesDeCompra } = require('../services/cartera');

exports.getPedidos = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query);
  const where = {
    empresaId: req.empresaId,
    ...buildListWhere(req.query, { fecha: 'fecha_pedido', igualdad: ['proveedorId', 'estado'] }),
  };

  const total = await Pedido.count({ where });
  const pedidos = await Pedido.findAll({
    where,
    include: [
      { model: Proveedor, attributes: ['nombre', 'nit', 'contacto', 'email', 'telefono'] },
      {
        model: PedidoDetalle,
        include: [{ model: Producto, attributes: ['nombre_producto', 'codigo', 'unidad_medida', 'unidad_compra', 'factor_compra'] }],
      },
    ],
    order: [['fecha_pedido', 'DESC']],
    limit,
    offset,
  });

  setTotalCount(res, total);
  res.json(pedidos);
};

exports.createPedido = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { proveedorId, detalles } = req.body;

    const proveedor = await Proveedor.findOne({
      where: { id: proveedorId, empresaId: req.empresaId },
      transaction: t,
    });
    if (!proveedor) throw new ValidationError('Proveedor inválido');

    // Cada línea se lleva a la unidad BASE del producto (si se pidió en kg, caja…).
    const lineas = [];
    for (const item of detalles) {
      const producto = await Producto.findOne({
        where: { id: item.productoId, empresaId: req.empresaId },
        transaction: t,
      });
      if (!producto) throw new ValidationError('Producto inválido en un detalle del pedido.');
      if (TIPOS_CON_RECETA.includes(producto.tipo)) {
        throw new ValidationError(`"${producto.nombre_producto}" es un plato o preparación; no se pide (se piden sus ingredientes).`);
      }
      lineas.push({
        item,
        base: aUnidadBase(
          { cantidad: item.cantidad_pedida, costo: item.costo_estimado, enPresentacion: item.en_presentacion },
          presentacionDe(producto),
          producto.nombre_producto
        ),
      });
    }

    const totalEstimado = calcularTotalCompra(
      detalles.map((d) => ({ cantidad: d.cantidad_pedida, costoUnitario: d.costo_estimado }))
    );

    const pedido = await Pedido.create({
      empresaId: req.empresaId,
      proveedorId,
      usuarioId: req.userId,
      total_estimado: totalEstimado,
    }, { transaction: t });

    await PedidoDetalle.bulkCreate(
      lineas.map(({ item, base }) => ({
        pedidoId: pedido.id,
        productoId: item.productoId,
        cantidad_pedida: base.cantidad,
        costo_estimado: base.costo,
        unidad_presentacion: base.unidad_presentacion,
        factor_presentacion: base.factor_presentacion,
      })),
      { transaction: t }
    );

    await t.commit();
    auditar(req, 'pedido_creado', { pedidoId: pedido.id, total_estimado: totalEstimado, proveedorId, proveedorNombre: proveedor.nombre });
    res.status(201).json(pedido);
  } catch (error) {
    await t.rollback();
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('CREATE PEDIDO ERROR:', error);
    return res.status(500).json({ error: 'Error al crear el pedido' });
  }
};

exports.checkInPedido = async (req, res) => {
  // Transmutar el pedido en una compra real con las cantidades recibidas.
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { detalles_recibidos, pago_desde_caja: desdeCaja } = req.body;
    const tieneCartera = !!req.empresaModulos?.has('Cuentas por pagar');
    if (desdeCaja && !req.empresaModulos?.has('Caja')) {
      throw new ValidationError('El módulo "Caja" no está activo: no se puede pagar desde la caja.');
    }

    // Lock de la fila del pedido: dos recepciones concurrentes del mismo pedido
    // no pueden leer ambas `estado = 'PENDIENTE'` y abonar el stock dos veces.
    // `of: Pedido` porque con el include a PedidoDetalle un FOR UPDATE plano
    // fallaría sobre el lado nullable del LEFT JOIN.
    const pedido = await Pedido.findOne({
      where: { id, empresaId: req.empresaId },
      include: [{ model: PedidoDetalle }],
      lock: { level: t.LOCK.UPDATE, of: Pedido },
      transaction: t,
    });
    if (!pedido || !['PENDIENTE', 'PARCIAL'].includes(pedido.estado)) {
      throw new ValidationError('Pedido no encontrado o ya procesado');
    }
    // Línea del pedido por producto (para validar pertenencia y acumular lo recibido).
    const lineaPorProducto = new Map((pedido.PedidoDetalles || []).map((d) => [d.productoId, d]));

    // Validar todo (pertenencia al pedido + tenant + lock de stock) antes de tocar nada.
    const items = [];
    for (const item of detalles_recibidos) {
      const cantidad = Number(item.cantidad);
      if (cantidad === 0) continue;
      const linea = lineaPorProducto.get(Number(item.productoId));
      if (!linea) {
        throw new ValidationError('Se recibió un producto que no estaba en el pedido.');
      }
      const producto = await Producto.findOne({
        where: { id: item.productoId, empresaId: req.empresaId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!producto) throw new ValidationError('Producto inválido en la recepción del pedido.');
      // Lo recibido puede capturarse en la presentación (kg, caja…): se usa la de la
      // línea del pedido (foto) o, si se pidió en unidad base, la del producto.
      const presentacion = linea.unidad_presentacion
        ? { unidad: linea.unidad_presentacion, factor: Number(linea.factor_presentacion) }
        : presentacionDe(producto);
      const base = aUnidadBase(
        { cantidad, costo: item.costo_unitario, enPresentacion: item.en_presentacion },
        presentacion,
        producto.nombre_producto
      );
      items.push({ producto, linea, cantidad: base.cantidad, costo: base.costo, costoExacto: base.costoExacto, base, totalLinea: cantidad * Number(item.costo_unitario) });
    }
    if (items.length === 0) throw new ValidationError('No se recibió ninguna cantidad.');

    // El total sale de lo capturado (cantidad × costo no cambia al convertir de unidad).
    const totalReal = Math.round(items.reduce((acc, i) => acc + i.totalLinea, 0) * 100) / 100;

    const compra = await Compra.create({
      empresaId: req.empresaId,
      proveedorId: pedido.proveedorId,
      usuarioId: req.userId,
      pedidoId: pedido.id, // trazabilidad
      total: totalReal,
      ...condicionesDeCompra(req.body, totalReal, tieneCartera), // contado o a crédito (deuda con el proveedor)
    }, { transaction: t });

    await CompraDetalle.bulkCreate(
      items.map((i) => ({
        compraId: compra.id,
        productoId: i.producto.id,
        cantidad: i.cantidad,
        costo_unitario: i.costo,
        unidad_presentacion: i.base.unidad_presentacion,
        factor_presentacion: i.base.factor_presentacion,
      })),
      { transaction: t }
    );

    for (const i of items) {
      await i.producto.update(
        {
          stock_actual: Number(i.producto.stock_actual) + i.cantidad,
          costo_promedio: promedioPonderado(i.producto.stock_actual, i.producto.costo_promedio, i.cantidad, i.costoExacto),
        },
        { transaction: t }
      );
      // Acumular lo recibido en la línea del pedido.
      await i.linea.update(
        { cantidad_recibida: Number(i.linea.cantidad_recibida) + i.cantidad },
        { transaction: t }
      );
    }

    // El pedido queda COMPLETADO solo si todas sus líneas ya alcanzaron lo
    // pedido; si no, queda PARCIAL y se puede volver a recibir después.
    const todoRecibido = (pedido.PedidoDetalles || []).every(
      (d) => Number(d.cantidad_recibida) >= Number(d.cantidad_pedida)
    );
    const nuevoEstado = todoRecibido ? 'COMPLETADO' : 'PARCIAL';
    await pedido.update({ estado: nuevoEstado }, { transaction: t });

    // La mercancía recibida se pagó en efectivo de la caja: egreso del turno.
    if (desdeCaja) {
      await registrarEgreso(req, t, { tipo: 'COMPRA', concepto: `Recepción pedido #${pedido.id}`, monto: totalReal, compraId: compra.id });
    }

    const proveedorNombre = (await Proveedor.findByPk(pedido.proveedorId, { attributes: ['nombre'], transaction: t }))?.nombre;
    await t.commit();
    invalidateDashboard(req.empresaId);
    invalidateInforme(req.empresaId);
    auditar(req, 'pedido_recibido', { pedidoId: pedido.id, compraId: compra.id, completo: todoRecibido, proveedorNombre });
    res.status(200).json({
      compraId: compra.id,
      estado: nuevoEstado,
      message: todoRecibido ? 'Recepción completada' : 'Recepción parcial registrada',
    });
  } catch (error) {
    await t.rollback();
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('CHECK-IN PEDIDO ERROR:', error);
    return res.status(500).json({ error: 'Error al procesar la recepción del pedido' });
  }
};
