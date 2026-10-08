const express = require('express');
const router = express.Router();
const modificadorController = require('../controllers/modificadorController');
const { verifyToken, requireModulo } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { modificador, modificadorUpdate } = require('../schemas/restauranteSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Recetas'));

router.get('/', asyncHandler(modificadorController.getModificadores));
router.post('/', validate({ body: modificador }), asyncHandler(modificadorController.createModificador));
router.put('/:id', validate({ params: idParam, body: modificadorUpdate }), asyncHandler(modificadorController.updateModificador));

module.exports = router;
