const { Proveedor } = require('../models');

exports.getProveedores = async (req, res) => {
  const proveedores = await Proveedor.findAll({
    where: { empresaId: req.empresaId },
    order: [['nombre', 'ASC']],
  });
  res.json(proveedores);
};

exports.createProveedor = async (req, res) => {
  const proveedor = await Proveedor.create({ ...req.body, empresaId: req.empresaId });
  res.status(201).json(proveedor);
};

exports.updateProveedor = async (req, res) => {
  const { id } = req.params;
  const proveedor = await Proveedor.findOne({ where: { id, empresaId: req.empresaId } });
  if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
  await proveedor.update(req.body);
  res.json(proveedor);
};
