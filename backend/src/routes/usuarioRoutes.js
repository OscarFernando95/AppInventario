const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');
const { verifyToken } = require('../middlewares/auth');

router.use(verifyToken);

const allowAdmins = (req, res, next) => {
  if (req.tipoRol === 'BACKOFFICE_ADMIN' || req.tipoRol === 'FRONT_ADMIN') {
    return next();
  }
  return res.status(403).json({ error: 'No autorizado' });
};

router.use(allowAdmins);

router.get('/', usuarioController.getUsuarios);
router.post('/', usuarioController.createUsuario);
router.put('/:id', usuarioController.updateUsuario);

module.exports = router;
