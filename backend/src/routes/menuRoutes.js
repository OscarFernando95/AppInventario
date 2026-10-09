const express = require('express');
const router = express.Router();
const menuController = require('../controllers/menuController');
const { verifyToken, requirePermiso } = require('../middlewares/auth');
const { requireOpcion } = require('../middlewares/opciones');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { z, idParam } = require('../schemas/common');
const { categoria, categoriaUpdate, categoriasOrden, agotado, precioHorario, precioHorarioUpdate, grupo, grupoUpdate } = require('../schemas/menuSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

// El menú lo usan el mesero (Mesas), el mostrador (Ventas) y quien arma el catálogo (Inventario / Recetas).
router.use((req, res, next) => {
  if (req.tipoRol === 'BACKOFFICE_ADMIN') return next();
  const alguno = ['Mesas', 'Ventas', 'Inventario', 'Recetas'].some((m) => req.empresaModulos?.has(m) && req.accesoModulos?.has(m));
  if (!alguno) return res.status(403).json({ error: 'Tu rol no tiene acceso al menú' });
  next();
});

const todasQuery = z.object({ todas: z.string().optional() });

// Categorías
router.get('/categorias', requireOpcion('menu_categorias'), validate({ query: todasQuery }), asyncHandler(menuController.getCategorias));
router.post('/categorias', requireOpcion('menu_categorias'), requirePermiso('menu.gestionar'), validate({ body: categoria }), asyncHandler(menuController.createCategoria));
router.put('/categorias/orden', requireOpcion('menu_categorias'), requirePermiso('menu.gestionar'), validate({ body: categoriasOrden }), asyncHandler(menuController.ordenarCategorias));
router.put('/categorias/:id', requireOpcion('menu_categorias'), requirePermiso('menu.gestionar'), validate({ params: idParam, body: categoriaUpdate }), asyncHandler(menuController.updateCategoria));

// Agotado por hoy: lo marca cualquiera que atiende (no hace falta ser administrador).
router.post('/agotado/:id', requireOpcion('agotados_manuales'), validate({ params: idParam, body: agotado }), asyncHandler(menuController.setAgotado));

// Fotos
router.get('/imagenes', requireOpcion('menu_fotos'), asyncHandler(menuController.getImagenes));

// Precios por horario
router.get('/precios-horario', requireOpcion('precios_horario'), asyncHandler(menuController.getPreciosHorario));
router.post('/precios-horario', requireOpcion('precios_horario'), requirePermiso('menu.gestionar'), validate({ body: precioHorario }), asyncHandler(menuController.createPrecioHorario));
router.put('/precios-horario/:id', requireOpcion('precios_horario'), requirePermiso('menu.gestionar'), validate({ params: idParam, body: precioHorarioUpdate }), asyncHandler(menuController.updatePrecioHorario));
router.delete('/precios-horario/:id', requireOpcion('precios_horario'), requirePermiso('menu.gestionar'), validate({ params: idParam }), asyncHandler(menuController.deletePrecioHorario));

// Grupos de modificadores
router.get('/grupos', requireOpcion('modificadores_grupos'), asyncHandler(menuController.getGrupos));
router.post('/grupos', requireOpcion('modificadores_grupos'), requirePermiso('menu.gestionar'), validate({ body: grupo }), asyncHandler(menuController.createGrupo));
router.put('/grupos/:id', requireOpcion('modificadores_grupos'), requirePermiso('menu.gestionar'), validate({ params: idParam, body: grupoUpdate }), asyncHandler(menuController.updateGrupo));
router.delete('/grupos/:id', requireOpcion('modificadores_grupos'), requirePermiso('menu.gestionar'), validate({ params: idParam }), asyncHandler(menuController.deleteGrupo));

module.exports = router;
