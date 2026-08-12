const express = require('express');
const router = express.Router();
const informeController = require('../controllers/informeController');
const { verifyToken } = require('../middlewares/auth');

router.use(verifyToken);
// Validación Multi-Tenant
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.get('/', informeController.getInforme);

module.exports = router;
