const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');
const { verifyToken } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam, createUsuario, updateUsuario } = require('../schemas/usuarioSchemas');

router.use(verifyToken);

const allowAdmins = (req, res, next) => {
  if (req.tipoRol === 'BACKOFFICE_ADMIN' || req.tipoRol === 'FRONT_ADMIN') {
    return next();
  }
  return res.status(403).json({ error: 'No autorizado' });
};

router.use(allowAdmins);

router.get('/', asyncHandler(usuarioController.getUsuarios));
router.post('/', validate({ body: createUsuario }), asyncHandler(usuarioController.createUsuario));
router.put('/:id', validate({ params: idParam, body: updateUsuario }), asyncHandler(usuarioController.updateUsuario));

module.exports = router;
