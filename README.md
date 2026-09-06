# AppInventario

Aplicación web para gestión de inventario, ventas, compras, proveedores, clientes, pedidos y servicios, con soporte multiempresa (multi-tenant) y roles de usuario.

## Stack tecnológico

**Backend**
- Node.js + Express 5
- Sequelize (ORM) + PostgreSQL 16 (migraciones y seeders con sequelize-cli)
- JWT para autenticación
- bcrypt para hash de contraseñas

**Frontend**
- React 19 + Vite
- React Router
- Zustand (estado global)
- Tailwind CSS
- Axios

**Infraestructura**
- Docker + Docker Compose (contenedores `db`, `backend`, `frontend`, `nginx`)
- Nginx como única puerta de entrada (puerto 80): `/api` → backend, resto → frontend

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
│       ├── migrations/   # Migraciones sequelize-cli (esquema)
│       └── seeders/      # Datos iniciales (roles, módulos, usuario admin)
├── frontend/         # SPA (React + Vite)
│   └── src/
│       ├── api/          # Cliente axios
│       ├── layouts/      # Layouts de la app
│       ├── pages/        # Vistas
│       └── store/        # Estado global (Zustand)
└── README.md
```

## Requisitos previos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows o Mac)
- [Git](https://git-scm.com/) (opcional, para clonar y actualizar)

No hace falta instalar Node.js ni PostgreSQL a mano: todo corre en contenedores.

## Instalación rápida

> **Guía completa y única fuente de verdad:** [`GUIA_INSTALACION.md`](./GUIA_INSTALACION.md)
> (incluye despliegue en el PC servidor de la oficina, backups y solución de problemas).

```bash
# 1. Clonar el repositorio
git clone <URL_DEL_REPOSITORIO>
cd AppInventario

# 2. Crear el .env de la raíz a partir de la plantilla y editar sus valores
cp .env.example .env      # editar al menos POSTGRES_PASSWORD y JWT_SECRET

# 3. Levantar los 4 contenedores (db, backend, frontend, nginx)
docker compose up -d --build

# 4. Verificar
docker compose ps
```

Acceso: **http://localhost** (mismo PC) o `http://<IP-DEL-SERVIDOR>` (otro PC de
la red). El backend aplica migraciones y datos iniciales solo al arrancar.

Usuario administrador inicial:

- **Usuario:** `admin`
- **Contraseña:** `Admin*123`

Apagar sin perder datos: `docker compose down` (**nunca** con `-v`).

## Variables de entorno

Un único archivo `.env` en la **raíz del proyecto** (copiado de `.env.example`)
alimenta a los 4 contenedores. Nunca se sube a Git.

| Variable            | Descripción                                              |
|---------------------|----------------------------------------------------------|
| `POSTGRES_USER`     | Usuario de la base de datos PostgreSQL                   |
| `POSTGRES_PASSWORD` | Contraseña de ese usuario (cámbiala)                     |
| `POSTGRES_DB`       | Nombre de la base de datos                               |
| `JWT_SECRET`        | Clave secreta para firmar los tokens JWT (cámbiala)      |

> `backend/.env.example` y `frontend/.env.example` solo se usan si corres esas
> partes sueltas sin Docker; para el uso normal se ignoran.

## Comandos útiles de Docker

```bash
docker compose up -d --build   # levantar / reconstruir tras cambios de código
docker compose ps              # estado de los contenedores
docker compose logs -f         # logs en tiempo real (Ctrl+C para salir)
docker compose logs backend    # logs de un solo servicio
docker compose restart backend # reiniciar un servicio sin perder datos
docker compose down            # apagar conservando los datos
```

Migraciones y seeders del backend (`sequelize-cli`) se aplican **solos** al
arrancar el contenedor `backend` (ver `backend/entrypoint.sh`).

## Notas de seguridad

- El archivo `.env` **nunca** debe subirse al repositorio (ya está en `.gitignore`).
- Cambia `POSTGRES_PASSWORD` y `JWT_SECRET` por valores propios antes de usar la aplicación en un entorno real.
- Cambia la contraseña del usuario `admin` desde la aplicación en el primer inicio de sesión.
- Solo el puerto 80 (Nginx) queda expuesto; `db`, `backend` y `frontend` viven en la red interna de Docker.

## Despliegue en producción

El despliegue en el PC servidor de la oficina (IP fija, firewall del puerto 80,
autoarranque de Docker, backups automáticos y actualización de versiones) está
documentado paso a paso en [`GUIA_INSTALACION.md`](./GUIA_INSTALACION.md).
