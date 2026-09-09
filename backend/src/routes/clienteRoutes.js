const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const { verifyToken } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { cliente, clienteUpdate } = require('../schemas/catalogoSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.get('/', asyncHandler(clienteController.getClientes));
router.post('/', validate({ body: cliente }), asyncHandler(clienteController.createCliente));
router.put('/:id', validate({ params: idParam, body: clienteUpdate }), asyncHandler(clienteController.updateCliente));

module.exports = router;
