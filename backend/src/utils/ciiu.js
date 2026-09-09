'use strict';

/**
 * Aplana el árbol CIIU Rev. 4 A.C. (data/ciiu-rev4ac.json):
 *
 *   seccion -> { titulo, divisiones: { division -> { titulo,
 *     subdivisiones: { grupo -> { titulo, actividades: { codigo4: descripcion } } } } } }
 *
 * a una lista de `{ codigo, descripcion, division, seccion }`.
 *
 * La fuente trae un puñado de entradas basura (notas en prosa, códigos con
 * longitud rara): se descartan quedándose solo con códigos de 4 dígitos.
 */
function flattenCiiu(tree) {
  const out = [];
  const vistos = new Set();
  for (const [seccion, secData] of Object.entries(tree || {})) {
    for (const [division, divData] of Object.entries(secData.divisiones || {})) {
      for (const grupo of Object.values(divData.subdivisiones || {})) {
        for (const [codigo, descripcion] of Object.entries(grupo.actividades || {})) {
          if (!/^\d{4}$/.test(codigo) || vistos.has(codigo)) continue;
          vistos.add(codigo);
          out.push({ codigo, descripcion: String(descripcion).trim(), division, seccion });
        }
      }
    }
  }
  return out;
}

module.exports = { flattenCiiu };
