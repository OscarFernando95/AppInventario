const express = require('express');
const router = express.Router();
const proveedorController = require('../controllers/proveedorController');
const { verifyToken } = require('../middlewares/auth');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.get('/', proveedorController.getProveedores);
router.post('/', proveedorController.createProveedor);
router.put('/:id', proveedorController.updateProveedor);

module.exports = router;
