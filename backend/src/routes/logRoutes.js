const express = require('express');
const router = express.Router();
const logController = require('../controllers/logController');
const { verifyToken, isBackofficeAdmin } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { logsQuery } = require('../schemas/logSchemas');

router.use(verifyToken);
router.use(isBackofficeAdmin); // Vista global de todas las empresas, no de una sola.

router.get('/', validate({ query: logsQuery }), asyncHandler(logController.getLogs));

module.exports = router;
