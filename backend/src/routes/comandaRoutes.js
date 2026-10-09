const express = require('express');
const router = express.Router();
const comandaController = require('../controllers/comandaController');
const { verifyToken } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam, comandaListQuery, comandaEstado } = require('../schemas/mesaSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

// La pantalla de cocina (módulo Cocina) y el mesero que reimprime una comanda (módulo Mesas) usan lo mismo.
router.use((req, res, next) => {
  const tiene = (modulos) => ['Cocina', 'Mesas'].some((m) => modulos && modulos.has(m));
  if (req.tipoRol === 'BACKOFFICE_ADMIN') return next();
  if (!tiene(req.empresaModulos)) return res.status(403).json({ error: 'Los módulos "Mesas" o "Cocina" no están activos para esta empresa' });
  if (!tiene(req.accesoModulos)) return res.status(403).json({ error: 'Tu rol no tiene acceso a las comandas' });
  next();
});

router.get('/', validate({ query: comandaListQuery }), asyncHandler(comandaController.getComandas));
router.get('/:id', validate({ params: idParam }), asyncHandler(comandaController.getComanda));
router.post('/:id/estado', validate({ params: idParam, body: comandaEstado }), asyncHandler(comandaController.cambiarEstado));

module.exports = router;
