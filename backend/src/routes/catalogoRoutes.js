const express = require('express');
const router = express.Router();
const catalogoController = require('../controllers/catalogoController');
const { authenticate } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { municipiosQuery, ciiuQuery } = require('../schemas/catalogoQuerySchemas');

// Basta con estar autenticado: los catálogos no son datos de un tenant y los
// usan tanto el BackOffice (alta de empresas) como el Front (clientes/proveedores).
router.use(authenticate);

router.get('/departamentos', asyncHandler(catalogoController.getDepartamentos));
router.get('/municipios', validate({ query: municipiosQuery }), asyncHandler(catalogoController.getMunicipios));
router.get('/ciiu', validate({ query: ciiuQuery }), asyncHandler(catalogoController.getCiiu));

module.exports = router;
