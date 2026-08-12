const bcrypt = require('bcrypt');
const { sequelize, Role, Usuario, Modulo } = require('../models');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const initDB = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ force: true }); // PRECAUCIÓN: Elimina las tablas para recrearlas
    console.log('Base de datos sincronizada y limpia.');

    // Crear Roles base
    const backAdmin = await Role.create({ nombre: 'Súper Administrador', tipo: 'BACKOFFICE_ADMIN' });
    const frontAdmin = await Role.create({ nombre: 'Administrador de Empresa', tipo: 'FRONT_ADMIN' });
    const frontUser = await Role.create({ nombre: 'Usuario Operativo', tipo: 'FRONT_USER' });

    console.log('Roles creados.');

    await Modulo.bulkCreate([
      { id: 1, nombre_codigo: 'Inventario' },
      { id: 2, nombre_codigo: 'Ventas' },
      { id: 3, nombre_codigo: 'Compras' },
      { id: 4, nombre_codigo: 'Proveedores' },
      { id: 5, nombre_codigo: 'Informes' }
    ]);
    console.log('Módulos semilla creados.');

    // Crear Usuario Admin BackOffice
    const hash = await bcrypt.hash('Admin*123', 10);
    await Usuario.create({
      empresaId: null, // Global, sin empresa específica
      rolId: backAdmin.id,
      nombre: 'Súper Administrador',
      username: 'admin',
      contrasena_hash: hash,
      estado: true
    });

    console.log('Usuario SuperAdmin creado correctamente (admin / Admin*123).');
    process.exit(0);
  } catch (error) {
    console.error('Error inicializando DB:', error);
    process.exit(1);
  }
};

initDB();
