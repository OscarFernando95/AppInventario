const express = require('express');
const router = express.Router();
const rolController = require('../controllers/rolController');
const { verifyToken, requireModulo, requirePermiso } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam } = require('../schemas/common');
const { rolCreate, rolUpdate } = require('../schemas/rolSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});
router.use(requireModulo('Roles y permisos'));

// Listar sirve también a quien gestiona el personal (para asignar roles).
router.get('/', requirePermiso('roles.gestionar', 'usuarios.gestionar'), asyncHandler(rolController.getRoles));
router.post('/', requirePermiso('roles.gestionar'), validate({ body: rolCreate }), asyncHandler(rolController.createRol));
router.put('/:id', requirePermiso('roles.gestionar'), validate({ params: idParam, body: rolUpdate }), asyncHandler(rolController.updateRol));
router.delete('/:id', requirePermiso('roles.gestionar'), validate({ params: idParam }), asyncHandler(rolController.deleteRol));

module.exports = router;
