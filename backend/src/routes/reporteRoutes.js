const express = require('express');
const router = express.Router();
const reporteController = require('../controllers/reporteController');
const { verifyToken } = require('../middlewares/auth');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Solo para empresas' });
  next();
});

router.get('/dashboard', reporteController.getDashboardData);

module.exports = router;
