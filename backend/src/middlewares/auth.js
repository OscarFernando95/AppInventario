const jwt = require('jsonwebtoken');

const { Usuario, Empresa } = require('../models');

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).json({ error: 'Token no proveído' });

  jwt.verify(token.split(' ')[1] || token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Token inválido' });
    req.userId = decoded.id;
    req.rolId = decoded.rolId;
    req.tipoRol = decoded.tipoRol;

    if (req.tipoRol === 'BACKOFFICE_ADMIN') return next();

    const headerEmpresaId = req.headers['x-empresa-id'];
    if (!headerEmpresaId) return res.status(403).json({ error: 'Falta configurar empresa activa en cabecera' });

    try {
      const user = await Usuario.findByPk(req.userId, { include: Empresa });
      const hasAccess = user && user.Empresas && user.Empresas.some(e => e.id == headerEmpresaId);
      if (!hasAccess) return res.status(403).json({ error: 'Acceso denegado a esta empresa' });
      
      req.empresaId = headerEmpresaId;
      next();
    } catch (dbErr) {
      res.status(500).json({ error: 'Error verificando accesos de empresa' });
    }
  });
};

const isBackofficeAdmin = (req, res, next) => {
  if (req.tipoRol !== 'BACKOFFICE_ADMIN') {
    return res.status(403).json({ error: 'Requiere rol de BackOffice Admin' });
  }
  next();
};

const isFrontAdmin = (req, res, next) => {
  if (req.tipoRol !== 'FRONT_ADMIN') {
    return res.status(403).json({ error: 'Requiere rol de Administrador de Empresa' });
  }
  next();
};

module.exports = { verifyToken, isBackofficeAdmin, isFrontAdmin };
