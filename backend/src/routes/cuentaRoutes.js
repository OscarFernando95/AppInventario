const express = require('express');
const router = express.Router();
const cuentaController = require('../controllers/cuentaController');
const { verifyToken, requireModulo } = require('../middlewares/auth');
const { requireOpcion } = require('../middlewares/opciones');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { z } = require('../schemas/common');
const {
  idParam, cuentaAbrir, cuentaUpdate, cuentaListQuery, itemAgregar, itemEditar, itemAnular, cuentaMover, cuentaUnir, cuentaCancelar, cuentaCobrar,
} = require('../schemas/mesaSchemas');

const itemParams = z.object({ id: z.coerce.number().int().positive(), itemId: z.coerce.number().int().positive() });

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Mesas'));

router.get('/', validate({ query: cuentaListQuery }), asyncHandler(cuentaController.getCuentas));
router.post('/', validate({ body: cuentaAbrir }), asyncHandler(cuentaController.abrirCuenta));
router.get('/:id', validate({ params: idParam }), asyncHandler(cuentaController.getCuenta));
router.patch('/:id', validate({ params: idParam, body: cuentaUpdate }), asyncHandler(cuentaController.updateCuenta));

router.post('/:id/items', validate({ params: idParam, body: itemAgregar }), asyncHandler(cuentaController.agregarItem));
router.patch('/:id/items/:itemId', validate({ params: itemParams, body: itemEditar }), asyncHandler(cuentaController.editarItem));
router.delete('/:id/items/:itemId', validate({ params: itemParams }), asyncHandler(cuentaController.quitarItem));
router.post('/:id/items/:itemId/anular', validate({ params: itemParams, body: itemAnular }), asyncHandler(cuentaController.anularItem));

router.post('/:id/enviar', validate({ params: idParam }), asyncHandler(cuentaController.enviarACocina));
router.post('/:id/mover', validate({ params: idParam, body: cuentaMover }), asyncHandler(cuentaController.moverCuenta));
router.post('/:id/unir', requireOpcion('unir_cuentas'), validate({ params: idParam, body: cuentaUnir }), asyncHandler(cuentaController.unirCuentas));
router.post('/:id/cancelar', validate({ params: idParam, body: cuentaCancelar }), asyncHandler(cuentaController.cancelarCuenta));
router.post('/:id/cobrar', validate({ params: idParam, body: cuentaCobrar }), asyncHandler(cuentaController.cobrar));

module.exports = router;
