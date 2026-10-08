const express = require('express');
const router = express.Router();
const pagarController = require('../controllers/pagarController');
const { verifyToken, requireModulo, isFrontAdmin } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { pagoCreate, listaCartera } = require('../schemas/carteraSchemas');
const { z } = require('zod');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});
router.use(requireModulo('Cuentas por pagar'));
// Lo que se le debe a los proveedores y su pago son decisiones del administrador de la empresa.
router.use(isFrontAdmin);

const proveedorParam = z.object({ proveedorId: z.coerce.number().int().positive() });
const compraParam = z.object({ compraId: z.coerce.number().int().positive() });

router.get('/', validate({ query: listaCartera }), asyncHandler(pagarController.getDeudas));
router.get('/resumen', asyncHandler(pagarController.getResumen));
router.get('/proveedores/:proveedorId/estado-cuenta', validate({ params: proveedorParam }), asyncHandler(pagarController.getEstadoCuenta));
router.post('/pagos/:id/anular', validate({ params: idParam }), asyncHandler(pagarController.anularPago));
router.get('/:compraId/pagos', validate({ params: compraParam }), asyncHandler(pagarController.getPagos));
router.post('/:compraId/pagos', validate({ params: compraParam, body: pagoCreate }), asyncHandler(pagarController.crearPago));

module.exports = router;
