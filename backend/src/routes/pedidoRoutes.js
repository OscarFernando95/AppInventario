const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const pedidoController = require('../controllers/pedidoController');

router.use(verifyToken);
// Todos pueden leer y crear, dependiendo del módulo, asumimos acceso de empresa.
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.get('/', pedidoController.getPedidos);
router.post('/', pedidoController.createPedido);
router.post('/:id/checkin', pedidoController.checkInPedido);

module.exports = router;
