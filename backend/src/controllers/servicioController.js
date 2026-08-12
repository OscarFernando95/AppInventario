const { Servicio } = require('../models');

exports.getServicios = async (req, res) => {
  try {
    const servicios = await Servicio.findAll({ where: { empresaId: req.empresaId } });
    res.json(servicios);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
};

exports.createServicio = async (req, res) => {
  try {
    const { nombre, descripcion, precio } = req.body;
    const servicio = await Servicio.create({
      empresaId: req.empresaId,
      nombre, descripcion, precio
    });
    res.status(201).json(servicio);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear servicio' });
  }
};

exports.updateServicio = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, precio } = req.body;
    const servicio = await Servicio.findOne({ where: { id, empresaId: req.empresaId } });
    if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado' });
    await servicio.update({ nombre, descripcion, precio });
    res.json(servicio);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar servicio' });
  }
};
