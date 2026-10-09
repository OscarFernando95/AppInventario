const express = require('express');
const router = express.Router();
const bloqueoController = require('../controllers/bloqueoController');
const { verifyToken, requireModulo, requirePermiso } = require('../middlewares/auth');
const { requireOpcion } = require('../middlewares/opciones');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam, bloqueo } = require('../schemas/mesaSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Mesas'));
router.use(requireOpcion('bloqueo_mesas'));

router.get('/', asyncHandler(bloqueoController.getBloqueos));
router.post('/', requirePermiso('mesas.gestionar'), validate({ body: bloqueo }), asyncHandler(bloqueoController.createBloqueo));
router.delete('/:id', requirePermiso('mesas.gestionar'), validate({ params: idParam }), asyncHandler(bloqueoController.deleteBloqueo));

module.exports = router;
