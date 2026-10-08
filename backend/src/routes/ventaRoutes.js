const express = require('express');
const router = express.Router();
const ventaController = require('../controllers/ventaController');
const { verifyToken, requireModulo, requirePermiso } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { ventaCreate } = require('../schemas/transaccionSchemas');
const { anularVenta, devolucionCreate } = require('../schemas/anulacionSchemas');
const devolucionController = require('../controllers/devolucionController');
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
router.get('/:id/devoluciones', validate({ params: idParam }), asyncHandler(devolucionController.getDevoluciones));
// Devolver parte de una venta reescribe inventario y dinero: por ahora solo el administrador.
router.post('/:id/devoluciones', requirePermiso('ventas.devolver'), validate({ params: idParam, body: devolucionCreate }), asyncHandler(devolucionController.crearDevolucion));
router.post('/', validate({ body: ventaCreate }), asyncHandler(ventaController.createVenta));

module.exports = router;
