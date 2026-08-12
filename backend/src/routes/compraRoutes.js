const express = require('express');
const router = express.Router();
const compraController = require('../controllers/compraController');
const { verifyToken } = require('../middlewares/auth');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.get('/', compraController.getCompras);
router.post('/', compraController.createCompra);

module.exports = router;
