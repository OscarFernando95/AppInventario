const { sequelize, Empresa, Usuario, Proveedor, Producto } = require('./src/models');
async function check() {
  try {
    const empresas = await Empresa.count();
    const usuarios = await Usuario.count();
    const prods = await Producto.count();
    console.log(`Empresas: ${empresas}, Usuarios: ${usuarios}, Productos: ${prods}`);
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
check();
