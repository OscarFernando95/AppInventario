const express = require('express');
const router = express.Router();
const produccionController = require('../controllers/produccionController');
const { verifyToken, requireModulo, requirePermiso } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { produccionCreate, produccionListQuery, sugerenciasQuery } = require('../schemas/restauranteSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Recetas'));

router.get('/', validate({ query: produccionListQuery }), asyncHandler(produccionController.getProducciones));
router.get('/lotes', asyncHandler(produccionController.getLotes));
router.get('/sugerencias', validate({ query: sugerenciasQuery }), asyncHandler(produccionController.getSugerencias));
router.post('/', validate({ body: produccionCreate }), asyncHandler(produccionController.createProduccion));
// Deshacer un lote devuelve ingredientes al inventario: lo decide quien puede ajustarlo (conteo).
router.post('/:id/anular', requirePermiso('inventario.conteo'), validate({ params: idParam }), asyncHandler(produccionController.anular));

module.exports = router;
