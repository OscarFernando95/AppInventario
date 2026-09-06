const { sequelize, Venta, VentaDetalle, Producto, Servicio, Cliente, Usuario, Empresa } = require('../models');
const { ValidationError } = require('../utils/errors');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

exports.getVentas = async (req, res) => {
  try {
    const ventas = await Venta.findAll({ 
      where: { empresaId: req.empresaId },
      include: [
        { model: Usuario, attributes: ['nombre'] }, 
        Cliente, 
        { model: VentaDetalle, include: [Producto, Servicio] },
        { model: Empresa, attributes: ['nombre', 'nit', 'contacto'] }
      ],
      order: [['fecha', 'DESC']]
    });
    res.json(ventas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener ventas' });
  }
};

exports.getVentaById = async (req, res) => {
  try {
    const venta = await Venta.findOne({
      where: { id: req.params.id, empresaId: req.empresaId },
      include: [
        { model: Usuario, attributes: ['nombre'] },
        Cliente,
        { model: VentaDetalle, include: [Producto, Servicio] },
        { model: Empresa, attributes: ['nombre', 'nit', 'contacto'] }
      ]
    });
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
    res.json(venta);
  } catch (error) {
    console.error('GET VENTA BY ID ERROR:', error);
    res.status(500).json({ error: 'Error al obtener venta' });
  }
};

exports.createVenta = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { clienteId, detalles, descuento_global, forma_pago, medio_pago } = req.body;

    if (!Array.isArray(detalles) || detalles.length === 0) {
      throw new ValidationError('La venta debe incluir al menos un detalle.');
    }

    if (clienteId) {
      const cliente = await Cliente.findOne({ where: { id: clienteId, empresaId: req.empresaId }, transaction: t });
      if (!cliente) throw new ValidationError('Cliente inválido');
    }

    let subtotal_bruto_acumulado = 0;
    let total_impuestos_acumulado = 0;
    const detallesProcesados = [];

    for (let item of detalles) {
      const cantidad = Number(item.cantidad);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        throw new ValidationError('Cantidad inválida en un detalle de la venta.');
      }
      let porcentaje_iva = 19;
      let modelInst = null;

      if (item.productoId) {
        // Lock de fila: evita que dos ventas concurrentes del mismo producto
        // lean el mismo stock y lo sobrevendan.
        modelInst = await Producto.findByPk(item.productoId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!modelInst || modelInst.empresaId != req.empresaId) throw new ValidationError('Producto inválido');
        if (modelInst.stock_actual < cantidad) throw new ValidationError(`Stock insuficiente: ${modelInst.nombre_producto}`);
        porcentaje_iva = Number(modelInst.porcentaje_iva || 0);

        await modelInst.update({
          stock_actual: modelInst.stock_actual - cantidad
        }, { transaction: t });
      } else if (item.servicioId) {
        modelInst = await Servicio.findByPk(item.servicioId, { transaction: t });
        if (!modelInst || modelInst.empresaId != req.empresaId) throw new ValidationError('Servicio inválido');
        porcentaje_iva = Number(modelInst.porcentaje_iva || 0);
      } else {
        throw new ValidationError('El detalle de venta debe incluir un producto o servicio válido.');
      }

      // POS: precio_unitario ya incluye IVA.
      // Base gravable = precio_unitario / (1 + (porcentaje_iva / 100))
      const divisorIva = 1 + (porcentaje_iva / 100);
      const precio_unitario_con_iva = Number(item.precio_unitario);
      if (!Number.isFinite(precio_unitario_con_iva) || precio_unitario_con_iva < 0) {
        throw new ValidationError('Precio unitario inválido en un detalle de la venta.');
      }
      const precio_unitario_sin_iva = precio_unitario_con_iva / divisorIva;

      const subtotal_bruto_linea = precio_unitario_sin_iva * cantidad;
      const total_linea_con_iva = precio_unitario_con_iva * cantidad;
      const valor_iva_linea = total_linea_con_iva - subtotal_bruto_linea;

      subtotal_bruto_acumulado += subtotal_bruto_linea;
      total_impuestos_acumulado += valor_iva_linea;

      detallesProcesados.push({
        productoId: item.productoId || null,
        servicioId: item.servicioId || null,
        cantidad,
        precio_unitario: precio_unitario_con_iva, // Con IVA
        precio_base: item.precio_base || precio_unitario_con_iva,
        porcentaje_iva,
        valor_iva: valor_iva_linea,
        subtotal_bruto: subtotal_bruto_linea
      });
    }

    // El total lo calcula el servidor a partir de los detalles; NO se confía en
    // el valor que envía el cliente.
    const descuento = round2(Math.max(0, Number(descuento_global) || 0));
    const totalCalculado = round2(subtotal_bruto_acumulado + total_impuestos_acumulado - descuento);
    if (totalCalculado < 0) throw new ValidationError('El descuento supera el total de la venta.');

    const venta = await Venta.create({
      empresaId: req.empresaId,
      usuarioId: req.userId,
      clienteId: clienteId || null,
      total: totalCalculado,
      descuento_global: descuento,
      forma_pago: forma_pago || '1',
      medio_pago: medio_pago || '10',
      subtotal_bruto: round2(subtotal_bruto_acumulado),
      total_impuestos: round2(total_impuestos_acumulado),
      estado_fe: 'NO_EMITIDA'
    }, { transaction: t });

    for (let det of detallesProcesados) {
      await VentaDetalle.create({
        ventaId: venta.id,
        ...det
      }, { transaction: t });
    }

    await t.commit();
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

