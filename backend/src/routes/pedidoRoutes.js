const express = require('express');
const router = express.Router();
const { verifyToken, requireModulo } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { pedidoCreate, pedidoCheckin } = require('../schemas/transaccionSchemas');
const pedidoController = require('../controllers/pedidoController');

router.use(verifyToken);
// Todos pueden leer y crear, dependiendo del módulo, asumimos acceso de empresa.
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Pedidos'));

router.get('/', asyncHandler(pedidoController.getPedidos));
router.post('/', validate({ body: pedidoCreate }), asyncHandler(pedidoController.createPedido));
router.post('/:id/checkin', validate({ params: idParam, body: pedidoCheckin }), asyncHandler(pedidoController.checkInPedido));

module.exports = router;
