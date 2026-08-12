const { Proveedor } = require('../models');

exports.getProveedores = async (req, res) => {
  try {
    const proveedores = await Proveedor.findAll({ where: { empresaId: req.empresaId } });
    res.json(proveedores);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
};

exports.createProveedor = async (req, res) => {
  try {
    const { nombre, nit, contacto, telefono, email, direccion } = req.body;
    const proveedor = await Proveedor.create({ 
      empresaId: req.empresaId, 
      nombre, nit, contacto, telefono, email, direccion 
    });
    res.status(201).json(proveedor);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
};

exports.updateProveedor = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, nit, contacto, telefono, email, direccion } = req.body;
    const proveedor = await Proveedor.findOne({ where: { id, empresaId: req.empresaId } });
    if(!proveedor) return res.status(404).json({error: 'No encontrado'});
    await proveedor.update({ nombre, nit, contacto, telefono, email, direccion });
    res.json(proveedor);
  } catch(error) { res.status(500).json({error: 'Error'}) }
};
