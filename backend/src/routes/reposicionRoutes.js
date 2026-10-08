const express = require('express');
const router = express.Router();
const reposicionController = require('../controllers/reposicionController');
const { verifyToken, requireModulo } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});
router.use(requireModulo('Inventario'));

router.get('/', asyncHandler(reposicionController.getReposicion));

module.exports = router;
