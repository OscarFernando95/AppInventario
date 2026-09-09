const { Empresa, Modulo } = require('../models');
const { ValidationError } = require('../utils/errors');

/**
 * Comprueba que todos los ids de módulo existan. Antes, un id inexistente
 * (p.ej. porque el frontend ofrecía más módulos de los sembrados) reventaba en
 * `setModulos` con un error de FK que se traducía en un 500 opaco.
 */
async function validarModulos(modulosIds) {
  if (!modulosIds || modulosIds.length === 0) return;
  const encontrados = await Modulo.findAll({ where: { id: modulosIds }, attributes: ['id'] });
  if (encontrados.length !== modulosIds.length) {
    const ok = new Set(encontrados.map((m) => m.id));
    const faltan = modulosIds.filter((id) => !ok.has(id));
    throw new ValidationError(`Módulos inexistentes: ${faltan.join(', ')}`);
  }
}

exports.getEmpresas = async (req, res) => {
  const empresas = await Empresa.findAll({ include: Modulo, order: [['nombre', 'ASC']] });
  res.json(empresas);
};

exports.createEmpresa = async (req, res) => {
  const { modulosIds, ...datos } = req.body;
  await validarModulos(modulosIds);

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

  await validarModulos(modulosIds);

  await empresa.update(datos);
  if (modulosIds) {
    await empresa.setModulos(modulosIds);
  }

  const actualizada = await Empresa.findByPk(id, { include: Modulo });
  res.json(actualizada);
};
