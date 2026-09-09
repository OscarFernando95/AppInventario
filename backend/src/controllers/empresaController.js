const { Empresa, Modulo } = require('../models');

exports.getEmpresas = async (req, res) => {
  const empresas = await Empresa.findAll({ include: Modulo, order: [['nombre', 'ASC']] });
  res.json(empresas);
};

exports.createEmpresa = async (req, res) => {
  const { modulosIds, ...datos } = req.body;
  const empresa = await Empresa.create(datos);
  if (modulosIds && modulosIds.length > 0) {
    await empresa.setModulos(modulosIds);
  }
  const conModulos = await Empresa.findByPk(empresa.id, { include: Modulo });
  res.status(201).json(conModulos);
};

exports.updateEmpresa = async (req, res) => {
  const { id } = req.params;
  const { modulosIds, ...datos } = req.body;

  const empresa = await Empresa.findByPk(id);
  if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });

  await empresa.update(datos);
  if (modulosIds) {
    await empresa.setModulos(modulosIds);
  }

  const actualizada = await Empresa.findByPk(id, { include: Modulo });
  res.json(actualizada);
};
