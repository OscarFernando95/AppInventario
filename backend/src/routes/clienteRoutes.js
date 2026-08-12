const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const { verifyToken } = require('../middlewares/auth');

router.use(verifyToken);
router.get('/', clienteController.getClientes);
router.post('/', clienteController.createCliente);
router.put('/:id', clienteController.updateCliente);

module.exports = router;
