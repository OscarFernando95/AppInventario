const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginLimiter } = require('../middlewares/rateLimit');
const { authenticate } = require('../middlewares/auth');
const asyncHandler = require('../middlewares/asyncHandler');
const validate = require('../middlewares/validate');
const { loginSchema, changePasswordSchema } = require('../schemas/authSchemas');

router.post('/login', loginLimiter, validate({ body: loginSchema }), asyncHandler(authController.login));

router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(authController.changePassword)
);

module.exports = router;
