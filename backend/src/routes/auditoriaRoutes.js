const express = require('express');
const router = express.Router();
const logController = require('../controllers/logController');
const { verifyToken, isFrontAdmin } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { logsQuery } = require('../schemas/logSchemas');

router.use(verifyToken);
// Solo el administrador de empresa; la consulta va acotada a su empresa activa
// (logController.getAuditoria fija where.empresaId = req.empresaId).
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});
router.use(isFrontAdmin);

router.get('/', validate({ query: logsQuery }), asyncHandler(logController.getAuditoria));

module.exports = router;
