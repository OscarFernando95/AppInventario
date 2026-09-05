const { Op } = require('sequelize');
const { sequelize, Venta, VentaDetalle, Compra, CompraDetalle, Producto, Cliente, Proveedor } = require('../models');

/**
 * Referencia cualificada y entrecomillada a "tabla"."columna", con las comillas
 * propias del dialecto activo. Necesario dentro de sequelize.literal(), donde
 * Sequelize no entrecomilla por nosotros: sin comillas, Postgres pliega los
 * identificadores a minúsculas y pierde el alias de tabla que él mismo genera
 * (p. ej. "VentaDetalle"). Además, 'precio_unitario' existe tanto en
 * ventas_detalles como en productos, así que hay que cualificar sí o sí.
 */
const qcol = (table, column) =>
  sequelize.getDialect() === 'postgres'
    ? `"${table}"."${column}"`
    : `\`${table}\`.\`${column}\``;

exports.getInforme = async (req, res) => {
  try {
    const { tipo, start, end } = req.query;
    if (!tipo || !start || !end) {
      return res.status(400).json({ error: 'Faltan parámetros: tipo, start, end' });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);

    const whereVenta = { empresaId: req.empresaId, fecha: { [Op.between]: [startDate, endDate] } };
    const whereCompra = { empresaId: req.empresaId, fecha: { [Op.between]: [startDate, endDate] } };

    switch (tipo) {
      case 'ventas_resumen': {
        const ventas = await Venta.findAll({
          where: whereVenta,
          include: [{ model: Cliente, attributes: ['nombre', 'documento'] }, VentaDetalle],
          order: [['fecha', 'DESC']]
        });
        return res.json(ventas);
      }
      
      case 'compras_resumen': {
        const compras = await Compra.findAll({
          where: whereCompra,
          include: [{ model: Proveedor, attributes: ['nombre', 'nit'] }, { model: CompraDetalle, include: [Producto] }],
          order: [['fecha', 'DESC']]
        });
        return res.json(compras);
      }
      
      case 'top_productos': {
        const topProductos = await VentaDetalle.findAll({
          attributes: [
            'productoId',
            [sequelize.col('Producto.nombre_producto'), 'nombre_producto'],
            [sequelize.fn('SUM', sequelize.col('cantidad')), 'total_vendido'],
            [sequelize.fn('SUM', sequelize.literal(
              `${qcol('VentaDetalle', 'cantidad')} * ${qcol('VentaDetalle', 'precio_unitario')}`
            )), 'ingreso_total']
          ],
          include: [{ model: Venta, attributes: [], where: whereVenta }, { model: Producto, attributes: [] }],
          group: ['productoId', 'Producto.nombre_producto'],
          order: [[sequelize.col('total_vendido'), 'DESC']],
          raw: true
        });
        return res.json(topProductos);
      }
      
      case 'top_clientes': {
        const topClientes = await Venta.findAll({
          where: whereVenta,
          attributes: [
            'clienteId',
            [sequelize.col('Cliente.nombre'), 'nombre_cliente'],
            [sequelize.fn('COUNT', sequelize.col('Venta.id')), 'total_compras'],
            [sequelize.fn('SUM', sequelize.col('total')), 'dinero_gastado']
          ],
          include: [{ model: Cliente, attributes: [] }],
          group: ['clienteId', 'Cliente.nombre'],
          order: [[sequelize.col('dinero_gastado'), 'DESC']],
          raw: true
        });
        return res.json(topClientes);
      }
      
      case 'top_proveedores': {
        const topProveedores = await Compra.findAll({
          where: whereCompra,
          attributes: [
            'proveedorId',
            [sequelize.col('Proveedor.nombre'), 'nombre_prov'],
            [sequelize.col('Proveedor.nit'), 'nit_prov'],
            [sequelize.fn('COUNT', sequelize.col('Compra.id')), 'total_ordenes'],
            [sequelize.fn('SUM', sequelize.col('total')), 'dinero_invertido']
          ],
          include: [{ model: Proveedor, attributes: [] }],
          group: ['proveedorId', 'Proveedor.nombre', 'Proveedor.nit'],
          order: [[sequelize.col('dinero_invertido'), 'DESC']],
          raw: true
        });
        return res.json(topProveedores);
      }

      default:
        return res.status(400).json({ error: 'Tipo de informe no válido' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al generar informe' });
  }
};
