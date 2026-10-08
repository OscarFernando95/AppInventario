const express = require('express');
const router = express.Router();
const anulacionController = require('../controllers/anulacionController');
const { verifyToken, requireModulo, isFrontAdmin } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { rechazarAnulacion, anulacionesQuery } = require('../schemas/anulacionSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});
router.use(requireModulo('Ventas'));

router.get('/', validate({ query: anulacionesQuery }), asyncHandler(anulacionController.getAnulaciones));
// Resolver solicitudes reescribe cifras ya reportadas: solo el administrador de la empresa.
router.post('/:id/aprobar', isFrontAdmin, validate({ params: idParam }), asyncHandler(anulacionController.aprobar));
router.post('/:id/rechazar', isFrontAdmin, validate({ params: idParam, body: rechazarAnulacion }), asyncHandler(anulacionController.rechazar));

module.exports = router;
