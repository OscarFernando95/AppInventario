'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Borra todo lo que las pruebas dejaron en la carpeta temporal (capturas, trazas, el build del
// frontend de pruebas). Con E2E_CONSERVAR=1 se conserva para poder revisar un fallo.
module.exports = async () => {
  if (process.env.E2E_CONSERVAR === '1') return;
  fs.rmSync(path.join(os.tmpdir(), (process.env.E2E_CARPETA || 'appinventario-e2e')), { recursive: true, force: true });
};
