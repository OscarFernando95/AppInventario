const express = require('express');
const router = express.Router();
const ventaController = require('../controllers/ventaController');
const { verifyToken } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { ventaCreate } = require('../schemas/transaccionSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.get('/', asyncHandler(ventaController.getVentas));
router.get('/:id', validate({ params: idParam }), asyncHandler(ventaController.getVentaById));
router.post('/', validate({ body: ventaCreate }), asyncHandler(ventaController.createVenta));

module.exports = router;
