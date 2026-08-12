const sequelize = require('./src/config/database');

async function fixCompra() {
  try {
    await sequelize.authenticate();
    console.log("Conectado");
    
    // Si proveedor_id en compras era FK y required. Lo hacemos null
    await sequelize.query('ALTER TABLE compras MODIFY COLUMN proveedorId INT NULL;');
    console.log("Columna proveedorId en compras modificada a NULL.");
    
    process.exit(0);
  } catch(e) {
    console.error('Error al parchear DB compra:', e);
    try {
        await sequelize.query('ALTER TABLE compras DROP FOREIGN KEY compras_ibfk_2;');
        await sequelize.query('ALTER TABLE compras MODIFY COLUMN proveedorId INT NULL;');
        console.log("Columna proveedorId modificada a NULL tras dropear FK.");
        process.exit(0);
    } catch (e2) {
       console.error("Fallo intento 2", e2);
       process.exit(1);
    }
  }
}
fixCompra();
