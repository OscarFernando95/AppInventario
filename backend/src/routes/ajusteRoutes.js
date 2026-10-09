const express = require('express');
const router = express.Router();
const ajusteController = require('../controllers/ajusteController');
const { verifyToken, requireModulo, requirePermiso } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { ajusteSalida, conteoFisico, ajusteListQuery, rangoQuery, desviacionesQuery, umbralDesviacion } = require('../schemas/restauranteSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Inventario'));

router.get('/', validate({ query: ajusteListQuery }), asyncHandler(ajusteController.getAjustes));
router.get('/resumen', validate({ query: rangoQuery }), asyncHandler(ajusteController.getResumen));
// Consumo teórico vs. conteo físico: detecta robos, desperdicio y recetas mal medidas. Es del administrador.
router.get('/desviaciones', requirePermiso('inventario.conteo'), validate({ query: desviacionesQuery }), asyncHandler(ajusteController.getDesviaciones));
router.put('/desviaciones/umbral', requirePermiso('inventario.conteo'), validate({ body: umbralDesviacion }), asyncHandler(ajusteController.setUmbralDesviacion));
router.post('/', validate({ body: ajusteSalida }), asyncHandler(ajusteController.registrarSalida));
// El conteo físico reescribe el stock: solo el administrador de la empresa.
router.post('/conteo', requirePermiso('inventario.conteo'), validate({ body: conteoFisico }), asyncHandler(ajusteController.registrarConteo));

module.exports = router;
