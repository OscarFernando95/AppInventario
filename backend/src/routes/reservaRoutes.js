const express = require('express');
const router = express.Router();
const reservaController = require('../controllers/reservaController');
const { verifyToken, requireModulo } = require('../middlewares/auth');
const { requireOpcion } = require('../middlewares/opciones');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam, reserva, reservaUpdate, reservaListQuery, reservaSentar } = require('../schemas/mesaSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Mesas'));
router.use(requireOpcion('reservas'));

router.get('/', validate({ query: reservaListQuery }), asyncHandler(reservaController.getReservas));
router.post('/', validate({ body: reserva }), asyncHandler(reservaController.createReserva));
router.patch('/:id', validate({ params: idParam, body: reservaUpdate }), asyncHandler(reservaController.updateReserva));
router.post('/:id/sentar', validate({ params: idParam, body: reservaSentar }), asyncHandler(reservaController.sentarReserva));

module.exports = router;
