const { Servicio } = require('../models');
const { auditar } = require('../utils/audit');

exports.getServicios = async (req, res) => {
  const servicios = await Servicio.findAll({
    where: { empresaId: req.empresaId },
    order: [['nombre', 'ASC']],
  });
  res.json(servicios);
};

exports.createServicio = async (req, res) => {
  const servicio = await Servicio.create({ ...req.body, empresaId: req.empresaId });
  auditar(req, 'servicio_creado', { id: servicio.id, nombre: servicio.nombre });
  res.status(201).json(servicio);
};

exports.updateServicio = async (req, res) => {
  const { id } = req.params;
  const servicio = await Servicio.findOne({ where: { id, empresaId: req.empresaId } });
  if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado' });
  await servicio.update(req.body);
  auditar(req, 'servicio_actualizado', { id: servicio.id, nombre: servicio.nombre });
  res.json(servicio);
};
