const express = require('express');
const router = express.Router();
const ventaController = require('../controllers/ventaController');
const { verifyToken } = require('../middlewares/auth');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.get('/', ventaController.getVentas);
router.get('/:id', ventaController.getVentaById);
router.post('/', ventaController.createVenta);

module.exports = router;
