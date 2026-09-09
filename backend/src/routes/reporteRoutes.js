const express = require('express');
const router = express.Router();
const reporteController = require('../controllers/reporteController');
const { verifyToken } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Solo para empresas' });
  next();
});

router.get('/dashboard', asyncHandler(reporteController.getDashboardData));

module.exports = router;
