const { sequelize, Venta, VentaDetalle, Producto, Servicio, Cliente, Usuario, Empresa } = require('../models');

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
    const { clienteId, total, detalles, descuento_global } = req.body;

    const venta = await Venta.create({
      empresaId: req.empresaId,
      usuarioId: req.userId,
      clienteId: clienteId || null,
      total,
      descuento_global: descuento_global || 0
    }, { transaction: t });

    for (let item of detalles) {
      console.log("PROCESANDO ITEM:", item);
      if (item.productoId) {
        const producto = await Producto.findByPk(item.productoId, { transaction: t });
        if (!producto || producto.empresaId != req.empresaId) {
          console.error("Producto Fallido:", producto, item, "req.empresaId:", req.empresaId);
          throw new Error('Producto inválido');
        }
        if (producto.stock_actual < item.cantidad) {
          throw new Error(`Stock insuficiente: ${producto.nombre_producto}`);
        }

        await VentaDetalle.create({
          ventaId: venta.id,
          productoId: item.productoId,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          precio_base: item.precio_base || item.precio_unitario
        }, { transaction: t });

        await producto.update({
          stock_actual: producto.stock_actual - Number(item.cantidad)
        }, { transaction: t });
      } else if (item.servicioId) {
        const servicio = await Servicio.findByPk(item.servicioId, { transaction: t });
        if (!servicio || servicio.empresaId != req.empresaId) {
          console.error("Servicio Fallido:", servicio, "req.empresaId:", req.empresaId, "item:", item);
          throw new Error('Servicio inválido');
        }

        await VentaDetalle.create({
          ventaId: venta.id,
          servicioId: item.servicioId,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          precio_base: item.precio_base || item.precio_unitario
        }, { transaction: t });
      } else {
        throw new Error('El detalle de venta debe incluir un producto o servicio válido.');
      }
    }

    await t.commit();
    res.status(201).json(venta);
  } catch (error) {
    await t.rollback();
    console.error("CREATE VENTA ERROR:", error);
    require('fs').writeFileSync('/tmp/venta_error.json', JSON.stringify({ body: req.body, error: error.stack }));
    res.status(400).json({ error: 'Error al registrar la venta: ' + error.message });
  }
};

