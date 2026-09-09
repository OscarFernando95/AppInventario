const express = require('express');
const router = express.Router();
const compraController = require('../controllers/compraController');
const { verifyToken } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { compraCreate } = require('../schemas/transaccionSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.get('/', asyncHandler(compraController.getCompras));
router.post('/', validate({ body: compraCreate }), asyncHandler(compraController.createCompra));

module.exports = router;
