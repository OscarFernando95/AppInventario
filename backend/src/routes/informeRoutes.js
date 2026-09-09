const express = require('express');
const router = express.Router();
const informeController = require('../controllers/informeController');
const { verifyToken, requireModulo } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { informeQuery } = require('../schemas/informeSchemas');

router.use(verifyToken);
// Validación Multi-Tenant
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Informes'));

router.get('/', validate({ query: informeQuery }), asyncHandler(informeController.getInforme));

module.exports = router;
