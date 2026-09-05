const { Producto } = require('../models');

exports.getProductos = async (req, res) => {
  try {
    const productos = await Producto.findAll({ where: { empresaId: req.empresaId } });
    res.json(productos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener productos' });
  }
};

exports.createProducto = async (req, res) => {
  try {
    const { codigo, nombre_producto, descripcion, stock_actual, precio_unitario, porcentaje_iva, unidad_medida, codigo_estandar } = req.body;
    const producto = await Producto.create({
      empresaId: req.empresaId,
      codigo,
      nombre_producto,
      descripcion,
      stock_actual: stock_actual || 0,
      precio_unitario,
      porcentaje_iva: porcentaje_iva || 19,
      unidad_medida: unidad_medida || '94',
      codigo_estandar
    });
    res.status(201).json(producto);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear producto' });
  }
};

exports.updateProducto = async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo, nombre_producto, descripcion, precio_unitario, porcentaje_iva, unidad_medida, codigo_estandar } = req.body;
    
    const producto = await Producto.findOne({ where: { id, empresaId: req.empresaId } });
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

    // Note: Stock is modified by Compras/Ventas primarily
    await producto.update({ codigo, nombre_producto, descripcion, precio_unitario, porcentaje_iva, unidad_medida, codigo_estandar });
    res.json(producto);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
};
