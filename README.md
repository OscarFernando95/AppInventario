# AppInventario

Aplicación web para gestión de inventario, ventas, compras, proveedores, clientes, pedidos y servicios, con soporte multiempresa (multi-tenant) y roles de usuario.

## Stack tecnológico

**Backend**
- Node.js + Express 5
- Sequelize (ORM) + MySQL 8
- JWT para autenticación
- bcrypt para hash de contraseñas

**Frontend**
- React 19 + Vite
- React Router
- Zustand (estado global)
- Tailwind CSS
- Axios

## Estructura del proyecto

```
AppInventario/
├── backend/          # API REST (Express + Sequelize)
│   └── src/
│       ├── config/       # Configuración de la base de datos
│       ├── controllers/  # Lógica de negocio
│       ├── middlewares/  # Autenticación, etc.
│       ├── models/       # Modelos Sequelize
│       ├── routes/       # Rutas de la API
│       └── scripts/      # Scripts utilitarios (p.ej. initDB.js)
├── frontend/         # SPA (React + Vite)
│   └── src/
│       ├── api/          # Cliente axios
│       ├── layouts/      # Layouts de la app
│       ├── pages/        # Vistas
│       └── store/        # Estado global (Zustand)
└── README.md
```

## Requisitos previos

- [Node.js](https://nodejs.org/) 18 o superior (recomendado 20+)
- [Git](https://git-scm.com/)
- [MySQL 8](https://dev.mysql.com/downloads/mysql/) instalado y corriendo en tu máquina local

## Instalación rápida

> Si nunca has usado estas herramientas, sigue en cambio la guía detallada en [`GUIA_INSTALACION.md`](./GUIA_INSTALACION.md).

```bash
# 1. Clonar el repositorio
git clone <URL_DEL_REPOSITORIO>
cd AppInventario

# 2. Crear la base de datos y el usuario en tu MySQL local (una sola vez)
mysql -u root -p
```
```sql
CREATE DATABASE AppInventario;
CREATE USER 'userInventario'@'localhost' IDENTIFIED BY 'Cambiar*123';
GRANT ALL PRIVILEGES ON AppInventario.* TO 'userInventario'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```
```bash
# 3. Backend
cd backend
npm install
cp .env.example .env      # ajusta los valores si es necesario
npm run initdb             # crea las tablas y el usuario admin inicial
npm run dev                 # levanta la API en http://localhost:3000

# 4. Frontend (en otra terminal)
cd frontend
npm install
cp .env.example .env
npm run dev                 # levanta la app en http://localhost:5173
```

Usuario administrador inicial creado por `npm run initdb`:

- **Usuario:** `admin`
- **Contraseña:** `Admin*123`

## Variables de entorno

### `backend/.env`

| Variable      | Descripción                                   |
|---------------|------------------------------------------------|
| `PORT`        | Puerto del servidor backend (por defecto 3000) |
| `DB_HOST`     | Host de la base de datos MySQL                 |
| `DB_PORT`     | Puerto de MySQL (por defecto 3306)             |
| `DB_NAME`     | Nombre de la base de datos                     |
| `DB_USER`     | Usuario de la base de datos                    |
| `DB_PASSWORD` | Contraseña del usuario de la base de datos      |
| `JWT_SECRET`  | Clave secreta para firmar los tokens JWT        |

### `frontend/.env` (opcional en desarrollo)

| Variable       | Descripción                                              |
|----------------|-----------------------------------------------------------|
| `VITE_API_URL` | URL base del backend (ej. `http://localhost:3000/api`)   |

## Scripts disponibles

**backend/**
- `npm run dev` — levanta la API con recarga automática (nodemon)
- `npm start` — levanta la API en modo producción
- `npm run initdb` — **borra y recrea** las tablas, y crea roles, módulos y el usuario admin inicial

**frontend/**
- `npm run dev` — servidor de desarrollo de Vite
- `npm run build` — genera el build de producción en `frontend/dist`
- `npm run preview` — sirve el build de producción localmente
- `npm run lint` — ejecuta ESLint

## Notas de seguridad

- El archivo `.env` **nunca** debe subirse al repositorio (ya está en `.gitignore`).
- La contraseña `Cambiar*123` usada en los ejemplos es solo para desarrollo local. Usa una contraseña propia si la base de datos queda accesible fuera de tu máquina.
- Cambia `JWT_SECRET` y la contraseña del usuario `admin` antes de usar la aplicación en un entorno real.

## Despliegue en producción

El backend puede servir directamente el build del frontend:

```bash
cd frontend && npm run build
cd ../backend && npm start
```

El servidor Express sirve los archivos estáticos de `frontend/dist` y expone la API bajo `/api`.
