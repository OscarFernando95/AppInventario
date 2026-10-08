'use strict';

const { cargarProductosConReceta } = require('../services/inventarioDb');
const { analizarProductos, calcularReposicion, objetivoDe } = require('../services/reposicion');

/**
 * Alertas de stock mínimo (de TODOS los tipos de producto) y qué pedir para reponer.
 * Las alertas dicen qué está bajo; las sugerencias, qué comprar (los platos y las preparaciones
 * no se compran: se piden sus ingredientes).
 */
exports.getReposicion = async (req, res) => {
  const productos = await cargarProductosConReceta(req.empresaId);
  const analisis = analizarProductos(productos);

  const alertas = productos
    .filter((p) => analisis.get(p.id).alerta)
    .map((p) => {
      const a = analisis.get(p.id);
      return {
        productoId: p.id,
        nombre_producto: p.nombre_producto,
        codigo: p.codigo,
        tipo: p.tipo,
        unidad_medida: p.unidad_medida,
        disponible: a.disponible,
        stock_minimo: Number(p.stock_minimo),
        stock_objetivo: objetivoDe(p),
        estado: a.estado,
      };
    })
    .sort((x, y) => (x.estado !== 'AGOTADO') - (y.estado !== 'AGOTADO') || x.disponible / x.stock_minimo - y.disponible / y.stock_minimo);

  res.json({
    resumen: {
      agotados: alertas.filter((a) => a.estado === 'AGOTADO').length,
      bajos: alertas.filter((a) => a.estado === 'BAJO').length,
    },
    alertas,
    sugerencias: calcularReposicion(productos, analisis),
  });
};
