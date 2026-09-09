const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();
const { apiLimiter } = require('./middlewares/rateLimit');
const errorHandler = require('./middlewares/errorHandler');

// --- Fail-fast: sin JWT_SECRET la autenticación no es segura, no arrancamos ---
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET ausente o de menos de 32 caracteres. Define uno en el .env y reinicia.');
  process.exit(1);
}

const app = express();

// Detrás de Nginx: confiar en el primer proxy para obtener la IP real del
// cliente (necesario para el rate limiting y los logs).
app.set('trust proxy', 1);

// helmet aporta X-Frame-Options, X-Content-Type-Options, HSTS, etc.
// La CSP se define en el Nginx de entrada (nginx/nginx.conf), que es quien
// sirve el HTML; aquí se desactiva para no romper el modo "Express sirve el build".
app.use(helmet({ contentSecurityPolicy: false }));

// CORS: solo orígenes explícitos en FRONTEND_URL (lista separada por comas).
// En el despliegue normal el frontend se sirve desde el mismo origen vía Nginx,
// así que no hace falta CORS; esto cubre el modo desarrollo (Vite en :5173).
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : false,
  credentials: true,
  exposedHeaders: ['X-Total-Count'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Log de acceso HTTP (a stdout — Docker lo captura). Se omite el healthcheck y
// se silencia en los tests.
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { skip: (req) => req.path === '/api/health' }));
}

// Healthcheck (lo usa docker-compose). Sin auth, sin tocar la BD.
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api', apiLimiter);

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/empresas', require('./routes/empresaRoutes'));
app.use('/api/modulos', require('./routes/moduloRoutes'));
app.use('/api/catalogos', require('./routes/catalogoRoutes'));
app.use('/api/usuarios', require('./routes/usuarioRoutes'));
app.use('/api/reportes', require('./routes/reporteRoutes'));
app.use('/api/productos', require('./routes/productoRoutes'));
app.use('/api/proveedores', require('./routes/proveedorRoutes'));
app.use('/api/compras', require('./routes/compraRoutes'));
app.use('/api/ventas', require('./routes/ventaRoutes'));
app.use('/api/clientes', require('./routes/clienteRoutes'));
app.use('/api/servicios', require('./routes/servicioRoutes'));
app.use('/api/pedidos', require('./routes/pedidoRoutes'));
app.use('/api/informes', require('./routes/informeRoutes'));

// Rutas /api desconocidas -> 404 JSON (no el index.html de React).
app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));

// Servir React (Frontend Build). En el despliegue con Docker esto no se usa
// (Nginx sirve el frontend), pero sí en el modo "el backend sirve el build".
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath, {
  index: false, // el index.html lo sirve el catch-all de abajo, con no-cache
  maxAge: '1y',
  immutable: true, // los assets de Vite llevan hash en el nombre
}));

// Cualquier otra ruta no capturada por /api se redirige al index.html de React.
app.get('/*splat', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// Middleware de errores central (siempre el último).
app.use(errorHandler);

module.exports = app;
