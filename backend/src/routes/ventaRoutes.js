const express = require('express');
const router = express.Router();
const ventaController = require('../controllers/ventaController');
const { verifyToken, requireModulo } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { ventaCreate } = require('../schemas/transaccionSchemas');
const { anularVenta } = require('../schemas/anulacionSchemas');
const anulacionController = require('../controllers/anulacionController');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Ventas'));

router.get('/', asyncHandler(ventaController.getVentas));
router.get('/:id', validate({ params: idParam }), asyncHandler(ventaController.getVentaById));
// Administrador: anula en el acto. Otro usuario: deja una solicitud para que el administrador la apruebe.
router.post('/:id/anular', validate({ params: idParam, body: anularVenta }), asyncHandler(anulacionController.anularOSolicitar));
router.post('/', validate({ body: ventaCreate }), asyncHandler(ventaController.createVenta));

module.exports = router;
