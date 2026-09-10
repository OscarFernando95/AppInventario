const express = require('express');
const router = express.Router();
const productoController = require('../controllers/productoController');
const { authenticate, verifyToken, requireModulo } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const upload = require('../middlewares/upload');
const { idParam } = require('../schemas/common');
const { producto, productoUpdate, importarProductosOpciones } = require('../schemas/catalogoSchemas');

// La plantilla es genérica (no depende de la empresa) y se descarga con un
// <a href> plano, que no puede mandar el header X-Empresa-Id: basta con estar
// autenticado.
router.get('/plantilla', authenticate, asyncHandler(productoController.descargarPlantilla));

router.use(verifyToken);
// Solo operan dentro de una empresa
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Inventario'));

router.get('/', asyncHandler(productoController.getProductos));
router.post('/', validate({ body: producto }), asyncHandler(productoController.createProducto));
router.post(
  '/importar',
  upload.single('archivo'),
  validate({ body: importarProductosOpciones }),
  asyncHandler(productoController.importarProductos)
);
router.put('/:id', validate({ params: idParam, body: productoUpdate }), asyncHandler(productoController.updateProducto));

module.exports = router;
