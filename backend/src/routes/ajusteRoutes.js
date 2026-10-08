const express = require('express');
const router = express.Router();
const ajusteController = require('../controllers/ajusteController');
const { verifyToken, requireModulo, isFrontAdmin } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { ajusteSalida, conteoFisico, ajusteListQuery, rangoQuery } = require('../schemas/restauranteSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Inventario'));

router.get('/', validate({ query: ajusteListQuery }), asyncHandler(ajusteController.getAjustes));
router.get('/resumen', validate({ query: rangoQuery }), asyncHandler(ajusteController.getResumen));
router.post('/', validate({ body: ajusteSalida }), asyncHandler(ajusteController.registrarSalida));
// El conteo físico reescribe el stock: solo el administrador de la empresa.
router.post('/conteo', isFrontAdmin, validate({ body: conteoFisico }), asyncHandler(ajusteController.registrarConteo));

module.exports = router;
