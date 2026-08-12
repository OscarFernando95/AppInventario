const sequelize = require('./src/config/database');

async function fix() {
  try {
    await sequelize.authenticate();
    console.log("Conectado");
    
    // Primero hay que dropear la FK si existe. En MySQL alter: true aveces la crea erroneamente o falla.
    // Pero si falla crearla, no existe. Solo debemos hacer alter column.
    await sequelize.query('ALTER TABLE compras_detalles MODIFY COLUMN productoId INT NULL;');
    console.log("Columna productoId modificada a NULL.");
    
    process.exit(0);
  } catch(e) {
    console.error('Error al parchear DB:', e);
    // Podría ser que hay que quitar el constraint viejo
    try {
        await sequelize.query('ALTER TABLE compras_detalles DROP FOREIGN KEY compras_detalles_ibfk_2;');
        await sequelize.query('ALTER TABLE compras_detalles MODIFY COLUMN productoId INT NULL;');
        console.log("Columna productoId modificada a NULL tras dropear FK.");
        process.exit(0);
    } catch (e2) {
       console.error("Fallo intento 2", e2);
       process.exit(1);
    }
  }
}
fix();
