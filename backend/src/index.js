const app = require('./app');
const sequelize = require('./config/database');

const PORT = process.env.PORT || 3000;

// El esquema de la base de datos se gestiona con migraciones (npm run migrate),
// NO con sequelize.sync(). Ver src/migrations/ y src/scripts/initDB.js.
sequelize.authenticate()
  .then(() => console.log('Conexión a la base de datos verificada.'))
  .catch((err) => console.error('Aviso: no se pudo verificar la conexión a la BD al arrancar:', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Servidor Backend corriendo en puerto ${PORT}`);
    });
  });
