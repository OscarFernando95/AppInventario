const { Modulo, Empresa } = require('./src/models');
const sequelize = require('./src/config/database');

async function seedPedidoModule() {
  try {
    await sequelize.authenticate();
    const [mod] = await Modulo.findOrCreate({
      where: { nombre_codigo: 'Pedidos' }
    });
    
    // Assign to all existing companies to save hassle
    const empresas = await Empresa.findAll();
    for (let e of empresas) {
       await e.addModulo(mod);
    }
    console.log("Modulo Pedidos creado y asignado a todas las empresas.");
    process.exit(0);
  } catch (error) {
    console.error("Error al inyectar módulo:", error);
    process.exit(1);
  }
}
seedPedidoModule();
