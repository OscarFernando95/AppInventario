'use strict';

const UNIDADES_CORTAS = { 94: 'ud', KGM: 'kg', GRM: 'g', LBR: 'lb', ONZ: 'oz', LTR: 'L', MLT: 'ml', MTK: 'm²', HUR: 'h' };

/** Abreviatura de una unidad de medida (código DIAN) para frases de auditoría. */
const unidadCorta = (codigo) => UNIDADES_CORTAS[codigo] || 'ud';

module.exports = { unidadCorta };
