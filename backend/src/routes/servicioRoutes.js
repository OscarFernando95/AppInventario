const express = require('express');
const router = express.Router();
const servicioController = require('../controllers/servicioController');
const { verifyToken } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { servicio, servicioUpdate } = require('../schemas/catalogoSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.get('/', asyncHandler(servicioController.getServicios));
router.post('/', validate({ body: servicio }), asyncHandler(servicioController.createServicio));
router.put('/:id', validate({ params: idParam, body: servicioUpdate }), asyncHandler(servicioController.updateServicio));

module.exports = router;
