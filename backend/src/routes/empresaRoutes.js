const express = require('express');
const router = express.Router();
const empresaController = require('../controllers/empresaController');
const { verifyToken, isBackofficeAdmin } = require('../middlewares/auth');

router.use(verifyToken);
router.use(isBackofficeAdmin); // Solo BackOffice Admin gestiona empresas

router.get('/', empresaController.getEmpresas);
router.post('/', empresaController.createEmpresa);
router.put('/:id', empresaController.updateEmpresa);

module.exports = router;
