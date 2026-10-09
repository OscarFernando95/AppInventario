const express = require('express');
const router = express.Router();
const cajaController = require('../controllers/cajaController');
const { verifyToken, requireModulo, requirePermiso } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { cajaAbrir, cajaCerrar, cajaRetiro, cajaListQuery, balanceQuery } = require('../schemas/cajaSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Caja'));

router.get('/', validate({ query: cajaListQuery }), asyncHandler(cajaController.getCajas));
router.get('/actual', asyncHandler(cajaController.getCajaActual));
router.get('/base-sugerida', asyncHandler(cajaController.getBaseSugerida));
// Dinero de la empresa vs su capital inicial: información financiera, solo administrador.
router.get('/balance', requirePermiso('caja.balance'), validate({ query: balanceQuery }), asyncHandler(cajaController.getBalance));
router.get('/personal', asyncHandler(cajaController.getPersonal));
router.get('/propinas', requirePermiso('caja.balance'), validate({ query: balanceQuery }), asyncHandler(cajaController.getPropinas));
router.get('/:id', validate({ params: idParam }), asyncHandler(cajaController.getCajaById));
router.post('/retiros', validate({ body: cajaRetiro }), asyncHandler(cajaController.registrarRetiro));
router.post('/abrir', validate({ body: cajaAbrir }), asyncHandler(cajaController.abrirCaja));
router.post('/:id/cerrar', validate({ params: idParam, body: cajaCerrar }), asyncHandler(cajaController.cerrarCaja));

module.exports = router;
