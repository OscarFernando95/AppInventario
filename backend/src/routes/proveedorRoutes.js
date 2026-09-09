const express = require('express');
const router = express.Router();
const proveedorController = require('../controllers/proveedorController');
const { verifyToken, requireModulo } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { proveedor, proveedorUpdate } = require('../schemas/catalogoSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Proveedores'));

router.get('/', asyncHandler(proveedorController.getProveedores));
router.post('/', validate({ body: proveedor }), asyncHandler(proveedorController.createProveedor));
router.put('/:id', validate({ params: idParam, body: proveedorUpdate }), asyncHandler(proveedorController.updateProveedor));

module.exports = router;
