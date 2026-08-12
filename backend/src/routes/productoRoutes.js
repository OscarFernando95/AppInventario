const express = require('express');
const router = express.Router();
const productoController = require('../controllers/productoController');
const { verifyToken } = require('../middlewares/auth');

router.use(verifyToken);
// Solo operan dentro de una empresa
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.get('/', productoController.getProductos);
router.post('/', productoController.createProducto);
router.put('/:id', productoController.updateProducto);

module.exports = router;
