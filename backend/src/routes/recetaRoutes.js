const express = require('express');
const router = express.Router();
const recetaController = require('../controllers/recetaController');
const { verifyToken, requireModulo, requirePermiso } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { rangoQuery } = require('../schemas/restauranteSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Recetas'));

router.get('/rentabilidad', requirePermiso('costos.ver'), validate({ query: rangoQuery }), asyncHandler(recetaController.getRentabilidad));

module.exports = router;
