const express = require('express');
const router = express.Router();
const mesaController = require('../controllers/mesaController');
const { verifyToken, requireModulo, requirePermiso } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam, mesa, mesaUpdate, mesaConfig } = require('../schemas/mesaSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Mesas'));

router.get('/', asyncHandler(mesaController.getMesas));
router.post('/', requirePermiso('mesas.gestionar'), validate({ body: mesa }), asyncHandler(mesaController.createMesa));
router.put('/config', requirePermiso('mesas.gestionar'), validate({ body: mesaConfig }), asyncHandler(mesaController.updateConfig));
router.put('/:id', requirePermiso('mesas.gestionar'), validate({ params: idParam, body: mesaUpdate }), asyncHandler(mesaController.updateMesa));

module.exports = router;
