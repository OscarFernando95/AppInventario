const { Producto } = require('../models');
const { invalidateDashboard } = require('./reporteController');

exports.getProductos = async (req, res) => {
  const productos = await Producto.findAll({
    where: { empresaId: req.empresaId },
    order: [['nombre_producto', 'ASC']],
  });
  res.json(productos);
};

exports.createProducto = async (req, res) => {
  const producto = await Producto.create({ ...req.body, empresaId: req.empresaId });
  invalidateDashboard(req.empresaId);
  res.status(201).json(producto);
};

exports.updateProducto = async (req, res) => {
  const { id } = req.params;
  const producto = await Producto.findOne({ where: { id, empresaId: req.empresaId } });
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

  // El stock lo mueven compras/ventas, no esta edición (el esquema lo omite).
  await producto.update(req.body);
  invalidateDashboard(req.empresaId);
  res.json(producto);
};
