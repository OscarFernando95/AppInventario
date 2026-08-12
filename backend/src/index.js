const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const sequelize = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/authRoutes');
const empresaRoutes = require('./routes/empresaRoutes');
const usuarioRoutes = require('./routes/usuarioRoutes');
const productoRoutes = require('./routes/productoRoutes');
const proveedorRoutes = require('./routes/proveedorRoutes');
const compraRoutes = require('./routes/compraRoutes');
const ventaRoutes = require('./routes/ventaRoutes');
const reporteRoutes = require('./routes/reporteRoutes');
const clienteRoutes = require('./routes/clienteRoutes');
const servicioRoutes = require('./routes/servicioRoutes');
const pedidoRoutes = require('./routes/pedidoRoutes');
const informeRoutes = require('./routes/informeRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/empresas', empresaRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/reportes', reporteRoutes);
app.use('/api/productos', productoRoutes);
app.use('/api/proveedores', proveedorRoutes);
app.use('/api/compras', compraRoutes);
app.use('/api/ventas', ventaRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/servicios', servicioRoutes);
app.use('/api/pedidos', pedidoRoutes);
app.use('/api/informes', informeRoutes);

// Servir React (Frontend Build)
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));

// Cualquier otra ruta no capturada por /api se redirige al index.html de React
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// Sync DB
sequelize.sync({ alter: true }).then(() => {
  console.log('Modelos sincronizados con la Base de Datos.');
  app.listen(PORT, () => {
    console.log(`Servidor Backend corriendo en puerto ${PORT}`);
  });
}).catch(err => {
  console.error('No se pudo inicializar la base de datos:', err);
});
