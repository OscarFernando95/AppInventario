const express = require('express');
const router = express.Router();
const moduloController = require('../controllers/moduloController');
const { authenticate } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');

router.use(authenticate);
router.get('/', asyncHandler(moduloController.getModulos));

module.exports = router;
