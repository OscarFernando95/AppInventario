const { Empresa, Modulo } = require('../models');
const { ValidationError } = require('../utils/errors');
const { invalidateAllProfiles } = require('../middlewares/auth');
const { parseListQuery, setTotalCount } = require('../utils/pagination');

/**
 * Comprueba que todos los ids de módulo existan. Antes, un id inexistente
 * (p.ej. porque el frontend ofrecía más módulos de los sembrados) reventaba en
 * `setModulos` con un error de FK que se traducía en un 500 opaco.
 */
/** Traduce la violación del índice único de `empresas.nit` a un 409 legible. */
function traducirNitDuplicado(err) {
  if (err && err.name === 'SequelizeUniqueConstraintError') {
    const e = new ValidationError('Ya existe una empresa registrada con ese NIT.');
    e.status = 409;
    return e;
  }
  return err;
}

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
  // Antes usaba findAll() sin X-Total-Count: el dashboard de backoffice
  // (que solo pide `?limit=1` para leer el total del header) siempre recibía
  // "undefined" y mostraba "0 Empresas activas" aunque sí hubiera empresas.
  const { limit, offset } = parseListQuery(req.query, { defaultLimit: 200 });
  const { count, rows } = await Empresa.findAndCountAll({
    include: Modulo,
    order: [['nombre', 'ASC']],
    limit,
    offset,
    distinct: true, // el include de Modulo es many-to-many; sin esto, count() infla con el join
  });
  setTotalCount(res, count);
  res.json(rows);
};

exports.createEmpresa = async (req, res) => {
  const { modulosIds, ...datos } = req.body;
  await validarModulos(modulosIds);

  let empresa;
  try {
    empresa = await Empresa.create(datos);
  } catch (err) {
    throw traducirNitDuplicado(err);
  }
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

  try {
    await empresa.update(datos);
  } catch (err) {
    throw traducirNitDuplicado(err);
  }
  if (modulosIds) {
    await empresa.setModulos(modulosIds);
    // El cambio de módulos afecta el gating de todos los usuarios de la empresa.
    invalidateAllProfiles();
  }

  const actualizada = await Empresa.findByPk(id, { include: Modulo });
  res.json(actualizada);
};
