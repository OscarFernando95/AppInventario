const express = require('express');
const router = express.Router();
const gastoController = require('../controllers/gastoController');
const { verifyToken, requireModulo, requirePermiso } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { gastoCreate, gastoListQuery, gastoRango } = require('../schemas/gastoSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Gastos'));

router.get('/', validate({ query: gastoListQuery }), asyncHandler(gastoController.getGastos));
router.get('/resumen', validate({ query: gastoRango }), asyncHandler(gastoController.getResumen));
router.post('/', validate({ body: gastoCreate }), asyncHandler(gastoController.createGasto));
// Anular reescribe cifras ya reportadas: solo el administrador de la empresa.
router.post('/:id/anular', requirePermiso('gastos.anular'), validate({ params: idParam }), asyncHandler(gastoController.anularGasto));

module.exports = router;
