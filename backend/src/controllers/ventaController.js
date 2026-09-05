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
    const { clienteId, total, detalles, descuento_global, forma_pago, medio_pago } = req.body;

    let subtotal_bruto_acumulado = 0;
    let total_impuestos_acumulado = 0;
    const detallesProcesados = [];

    for (let item of detalles) {
      let porcentaje_iva = 19;
      let modelInst = null;
      
      if (item.productoId) {
        modelInst = await Producto.findByPk(item.productoId, { transaction: t });
        if (!modelInst || modelInst.empresaId != req.empresaId) throw new Error('Producto inválido');
        if (modelInst.stock_actual < item.cantidad) throw new Error(`Stock insuficiente: ${modelInst.nombre_producto}`);
        porcentaje_iva = Number(modelInst.porcentaje_iva || 0);
        
        await modelInst.update({
          stock_actual: modelInst.stock_actual - Number(item.cantidad)
        }, { transaction: t });
      } else if (item.servicioId) {
        modelInst = await Servicio.findByPk(item.servicioId, { transaction: t });
        if (!modelInst || modelInst.empresaId != req.empresaId) throw new Error('Servicio inválido');
        porcentaje_iva = Number(modelInst.porcentaje_iva || 0);
      } else {
        throw new Error('El detalle de venta debe incluir un producto o servicio válido.');
      }

      // POS: precio_unitario ya incluye IVA. 
      // Base gravable = precio_unitario / (1 + (porcentaje_iva / 100))
      const divisorIva = 1 + (porcentaje_iva / 100);
      const precio_unitario_con_iva = Number(item.precio_unitario);
      const precio_unitario_sin_iva = precio_unitario_con_iva / divisorIva;
      
      const subtotal_bruto_linea = precio_unitario_sin_iva * Number(item.cantidad);
      const total_linea_con_iva = precio_unitario_con_iva * Number(item.cantidad);
      const valor_iva_linea = total_linea_con_iva - subtotal_bruto_linea;

      subtotal_bruto_acumulado += subtotal_bruto_linea;
      total_impuestos_acumulado += valor_iva_linea;

      detallesProcesados.push({
        productoId: item.productoId || null,
        servicioId: item.servicioId || null,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario, // Con IVA
        precio_base: item.precio_base || item.precio_unitario,
        porcentaje_iva,
        valor_iva: valor_iva_linea,
        subtotal_bruto: subtotal_bruto_linea
      });
    }

    const venta = await Venta.create({
      empresaId: req.empresaId,
      usuarioId: req.userId,
      clienteId: clienteId || null,
      total,
      descuento_global: descuento_global || 0,
      forma_pago: forma_pago || '1',
      medio_pago: medio_pago || '10',
      subtotal_bruto: subtotal_bruto_acumulado,
      total_impuestos: total_impuestos_acumulado,
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
    console.error("CREATE VENTA ERROR:", error);
    require('fs').writeFileSync('/tmp/venta_error.json', JSON.stringify({ body: req.body, error: error.stack }));
    res.status(400).json({ error: 'Error al registrar la venta: ' + error.message });
  }
};

