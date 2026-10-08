const express = require('express');
const router = express.Router();
const cobrarController = require('../controllers/cobrarController');
const { verifyToken, requireModulo, isFrontAdmin } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { abonoCreate, listaCartera } = require('../schemas/carteraSchemas');
const { z } = require('zod');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});
router.use(requireModulo('Cuentas por cobrar'));

const clienteParam = z.object({ clienteId: z.coerce.number().int().positive() });
const ventaParam = z.object({ ventaId: z.coerce.number().int().positive() });

router.get('/', validate({ query: listaCartera }), asyncHandler(cobrarController.getCuentas));
router.get('/resumen', asyncHandler(cobrarController.getResumen));
router.get('/clientes/:clienteId/estado-cuenta', validate({ params: clienteParam }), asyncHandler(cobrarController.getEstadoCuenta));
// Cualquier usuario puede cobrar un abono; anularlo (reescribe cifras) es del administrador.
router.post('/abonos/:id/anular', isFrontAdmin, validate({ params: idParam }), asyncHandler(cobrarController.anularAbono));
router.get('/:ventaId/abonos', validate({ params: ventaParam }), asyncHandler(cobrarController.getAbonos));
router.post('/:ventaId/abonos', validate({ params: ventaParam, body: abonoCreate }), asyncHandler(cobrarController.crearAbono));

module.exports = router;
