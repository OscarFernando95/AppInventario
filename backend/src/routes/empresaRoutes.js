const express = require('express');
const router = express.Router();
const empresaController = require('../controllers/empresaController');
const { verifyToken, isBackofficeAdmin } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { empresaCreate, empresaUpdate } = require('../schemas/empresaSchemas');

router.use(verifyToken);
router.use(isBackofficeAdmin); // Solo BackOffice Admin gestiona empresas

router.get('/', asyncHandler(empresaController.getEmpresas));
router.post('/', validate({ body: empresaCreate }), asyncHandler(empresaController.createEmpresa));
router.put('/:id', validate({ params: idParam, body: empresaUpdate }), asyncHandler(empresaController.updateEmpresa));

module.exports = router;
