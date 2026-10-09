const express = require('express');
const router = express.Router();
const opcionController = require('../controllers/opcionController');
const { verifyToken, requirePermiso } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { opcionesUpdate } = require('../schemas/opcionSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

// Cualquier usuario de la empresa las lee (cada pantalla decide qué mostrar); solo quien administra las cambia.
router.get('/', asyncHandler(opcionController.getOpciones));
router.put('/', requirePermiso('opciones.gestionar'), validate({ body: opcionesUpdate }), asyncHandler(opcionController.updateOpciones));

module.exports = router;
