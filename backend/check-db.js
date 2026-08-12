const { authRoutes } = require('./src/routes/authRoutes'); // just to check if it parses
const { Empresa, Usuario, Proveedor, Producto } = require('./src/models');

async function check() {
  try {
    const empresas = await Empresa.count();
    const usuarios = await Usuario.count();
    const prods = await Producto.count();
    const provs = await Proveedor.count();
    console.log(`Empresas: ${empresas}, Usuarios: ${usuarios}, Productos: ${prods}, Proveedores: ${provs}`);
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
}
check();
