const { Cliente } = require('../models');
const { auditar } = require('../utils/audit');

exports.getClientes = async (req, res) => {
  const clientes = await Cliente.findAll({
    where: { empresaId: req.empresaId },
    order: [['nombre', 'ASC']],
  });
  res.json(clientes);
};

exports.createCliente = async (req, res) => {
  const cliente = await Cliente.create({ ...req.body, empresaId: req.empresaId });
  auditar(req, 'cliente_creado', { id: cliente.id, nombre: cliente.nombre });
  res.status(201).json(cliente);
};

exports.updateCliente = async (req, res) => {
  const { id } = req.params;
  const cliente = await Cliente.findOne({ where: { id, empresaId: req.empresaId } });
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  await cliente.update(req.body);
  auditar(req, 'cliente_actualizado', { id: cliente.id, nombre: cliente.nombre });
  res.json(cliente);
};
