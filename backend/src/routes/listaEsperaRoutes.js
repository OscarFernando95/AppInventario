const express = require('express');
const router = express.Router();
const listaEsperaController = require('../controllers/listaEsperaController');
const { verifyToken, requireModulo } = require('../middlewares/auth');
const { requireOpcion } = require('../middlewares/opciones');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { idParam, listaEspera, listaEsperaUpdate, listaEsperaListQuery, listaEsperaSentar } = require('../schemas/mesaSchemas');

router.use(verifyToken);
router.use((req, res, next) => {
  if (!req.empresaId) return res.status(403).json({ error: 'Requiere pertenecer a una empresa' });
  next();
});

router.use(requireModulo('Mesas'));
router.use(requireOpcion('lista_espera'));

router.get('/', validate({ query: listaEsperaListQuery }), asyncHandler(listaEsperaController.getListaEspera));
router.post('/', validate({ body: listaEspera }), asyncHandler(listaEsperaController.createListaEspera));
router.patch('/:id', validate({ params: idParam, body: listaEsperaUpdate }), asyncHandler(listaEsperaController.updateListaEspera));
router.post('/:id/sentar', validate({ params: idParam, body: listaEsperaSentar }), asyncHandler(listaEsperaController.sentarListaEspera));

module.exports = router;
