const { Cliente } = require('../models');

exports.getClientes = async (req, res) => {
  try {
    const clientes = await Cliente.findAll({ where: { empresaId: req.empresaId } });
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
};

exports.createCliente = async (req, res) => {
  try {
    const { nombre, documento, email, telefono, direccion } = req.body;
    const cliente = await Cliente.create({
      empresaId: req.empresaId,
      nombre, documento, email, telefono, direccion
    });
    res.status(201).json(cliente);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear cliente' });
  }
};

exports.updateCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, documento, email, telefono, direccion } = req.body;
    const cliente = await Cliente.findOne({ where: { id, empresaId: req.empresaId } });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    await cliente.update({ nombre, documento, email, telefono, direccion });
    res.json(cliente);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
};
