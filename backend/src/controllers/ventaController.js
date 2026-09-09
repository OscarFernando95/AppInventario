const { sequelize, Venta, VentaDetalle, Producto, Servicio, Cliente, Usuario, Empresa } = require('../models');
const { ValidationError } = require('../utils/errors');
const { parseListQuery, setTotalCount } = require('../utils/pagination');
const { invalidateDashboard } = require('./reporteController');
const { calcularVenta } = require('../services/calculo');

exports.getVentas = async (req, res) => {
  const { limit, offset } = parseListQuery(req.query);
  const where = { empresaId: req.empresaId };

  const total = await Venta.count({ where });
  const ventas = await Venta.findAll({
    where,
    include: [
      { model: Usuario, attributes: ['nombre'] },
      Cliente,
      { model: VentaDetalle, include: [Producto, Servicio] },
      { model: Empresa, attributes: ['nombre', 'nit', 'contacto'] },
    ],
    order: [['fecha', 'DESC']],
    limit,
    offset,
  });

  setTotalCount(res, total);
  res.json(ventas);
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

    if (clienteId) {
      const cliente = await Cliente.findOne({ where: { id: clienteId, empresaId: req.empresaId }, transaction: t });
      if (!cliente) throw new ValidationError('Cliente inválido');
    }

    // Valida cada línea contra la BD (tenant + stock), aplica el efecto en stock
    // y arma la entrada para el cálculo de importes.
    const lineas = [];
    for (const item of detalles) {
      const cantidad = Number(item.cantidad);
      let porcentajeIva = 0;

      if (item.productoId) {
        // Lock de fila: dos ventas concurrentes del mismo producto no pueden
        // leer el mismo stock y sobrevenderlo.
        const prod = await Producto.findByPk(item.productoId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!prod || prod.empresaId !== req.empresaId) throw new ValidationError('Producto inválido');
        if (prod.stock_actual < cantidad) throw new ValidationError(`Stock insuficiente: ${prod.nombre_producto}`);
        porcentajeIva = Number(prod.porcentaje_iva || 0);
        await prod.update({ stock_actual: prod.stock_actual - cantidad }, { transaction: t });
      } else {
        const serv = await Servicio.findByPk(item.servicioId, { transaction: t });
        if (!serv || serv.empresaId !== req.empresaId) throw new ValidationError('Servicio inválido');
        porcentajeIva = Number(serv.porcentaje_iva || 0);
      }

      lineas.push({
        productoId: item.productoId || null,
        servicioId: item.servicioId || null,
        cantidad,
        precioConIva: Number(item.precio_unitario),
        porcentajeIva,
        precioBase: item.precio_base,
      });
    }

    // Los importes los calcula el servidor; NO se confía en el total del cliente.
    const calc = calcularVenta(lineas, descuento_global);
    if (calc.total < 0) throw new ValidationError('El descuento supera el total de la venta.');

    const venta = await Venta.create({
      empresaId: req.empresaId,
      usuarioId: req.userId,
      clienteId: clienteId || null,
      total: calc.total,
      descuento_global: calc.descuento_global,
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

