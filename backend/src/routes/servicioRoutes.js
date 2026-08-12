const express = require('express');
const router = express.Router();
const servicioController = require('../controllers/servicioController');
const { verifyToken } = require('../middlewares/auth');

router.use(verifyToken);
router.get('/', servicioController.getServicios);
router.post('/', servicioController.createServicio);
router.put('/:id', servicioController.updateServicio);

module.exports = router;
