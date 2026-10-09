'use strict';

const { z } = require('./common');

// `valores`: { clave: valor } (el servicio valida cada clave y su tipo). `perfil`: clave de un perfil. Uno u otro.
const opcionesUpdate = z.object({
  valores: z.record(z.string().max(60), z.union([z.boolean(), z.number(), z.array(z.string().max(60)).max(20)])).optional(),
  perfil: z.string().trim().max(40).optional(),
}).refine((d) => (d.valores ? 1 : 0) + (d.perfil ? 1 : 0) === 1, { message: 'Indica los valores a cambiar o un perfil, no ambos.' });

module.exports = { opcionesUpdate };
