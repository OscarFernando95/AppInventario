const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Usuario, Role, Empresa, Modulo } = require('../models');

exports.login = async (req, res) => {
  try {
    const { username, contrasena } = req.body;
    
    const usuario = await Usuario.findOne({ 
      where: { username },
      include: [
        { model: Role },
        { model: Empresa, through: { attributes: [] }, include: [{ model: Modulo, through: { attributes: [] } }] }
      ]
    });

    if (!usuario || !usuario.estado) {
      return res.status(404).json({ error: 'Usuario no encontrado o inactivo' });
    }

    const isValid = await bcrypt.compare(contrasena, usuario.contrasena_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    const token = jwt.sign(
      { 
        id: usuario.id, 
        rolId: usuario.rolId,
        tipoRol: usuario.Role.tipo 
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '8h' }
    );

    res.json({
      mensaje: 'Login exitoso',
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        username: usuario.username,
        rol: usuario.Role.tipo,
        empresas: usuario.Empresas ? usuario.Empresas.map(emp => ({
          id: emp.id,
          nombre: emp.nombre,
          modulos: emp.Modulos ? emp.Modulos.map(m => m.nombre_codigo) : []
        })) : []
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};
