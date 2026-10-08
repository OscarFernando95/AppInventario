const express = require('express');
const router = express.Router();
const auditoriaController = require('../controllers/auditoriaController');
const { verifyToken, isFrontAdmin } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { auditoriaQuery } = require('../schemas/logSchemas');

router.use(verifyToken);
// Solo el administrador de empresa; la consulta va acotada a su empresa activa
// (auditoriaController filtra por req.empresaId). Vista GERENCIAL: frases legibles,
// no el log técnico (ese es /api/logs, solo backoffice).
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});
router.use(isFrontAdmin);

router.get('/', validate({ query: auditoriaQuery }), asyncHandler(auditoriaController.getActividad));
router.get('/filtros', asyncHandler(auditoriaController.getFiltros));

module.exports = router;
