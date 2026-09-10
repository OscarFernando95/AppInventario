'use strict';

const multer = require('multer');
const { ValidationError } = require('../utils/errors');

// En memoria (no a disco): el archivo se procesa una sola vez y no necesita
// persistir — evita tener que limpiar temporales.
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const esXlsx = file.mimetype === MIME_XLSX || /\.xlsx$/i.test(file.originalname || '');
    // ValidationError (no un Error corriente): así errorHandler.js ya sabe
    // devolver 400 con este mensaje tal cual, sin tocar nada más.
    if (!esXlsx) return cb(new ValidationError('Solo se aceptan archivos .xlsx'));
    cb(null, true);
  },
});

module.exports = upload;
