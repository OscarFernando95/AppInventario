const { Empresa, Modulo } = require('../models');

exports.getEmpresas = async (req, res) => {
  try {
    const empresas = await Empresa.findAll({ include: Modulo });
    res.json(empresas);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener empresas' });
  }
};

exports.createEmpresa = async (req, res) => {
  try {
    const {
      nombre, nit, contacto, modulosIds,
      dv, tipo_persona, regimen_fiscal, direccion_fisica, municipio_dane, departamento_dane,
      codigo_ciiu, email_facturacion, resolucion_numero, prefijo_facturacion,
      rango_desde, rango_hasta, fecha_vigencia_desde, fecha_vigencia_hasta, clave_tecnica
    } = req.body;
    const empresa = await Empresa.create({
      nombre, nit, contacto,
      dv, tipo_persona, regimen_fiscal, direccion_fisica, municipio_dane, departamento_dane,
      codigo_ciiu, email_facturacion, resolucion_numero, prefijo_facturacion,
      rango_desde, rango_hasta, fecha_vigencia_desde, fecha_vigencia_hasta, clave_tecnica
    });
    if (modulosIds && modulosIds.length > 0) {
      await empresa.setModulos(modulosIds);
    }
    const empresaConModulos = await Empresa.findByPk(empresa.id, { include: Modulo });
    res.status(201).json(empresaConModulos);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear empresa' });
  }
};

exports.updateEmpresa = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre, nit, contacto, activa, modulosIds,
      dv, tipo_persona, regimen_fiscal, direccion_fisica, municipio_dane, departamento_dane,
      codigo_ciiu, email_facturacion, resolucion_numero, prefijo_facturacion,
      rango_desde, rango_hasta, fecha_vigencia_desde, fecha_vigencia_hasta, clave_tecnica
    } = req.body;
    const empresa = await Empresa.findByPk(id);
    
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' });
    
    await empresa.update({
      nombre, nit, contacto, activa,
      dv, tipo_persona, regimen_fiscal, direccion_fisica, municipio_dane, departamento_dane,
      codigo_ciiu, email_facturacion, resolucion_numero, prefijo_facturacion,
      rango_desde, rango_hasta, fecha_vigencia_desde, fecha_vigencia_hasta, clave_tecnica
    });
    if (modulosIds) {
      await empresa.setModulos(modulosIds);
    }
    
    const empresaActualizada = await Empresa.findByPk(id, { include: Modulo });
    res.json(empresaActualizada);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar empresa' });
  }
};
