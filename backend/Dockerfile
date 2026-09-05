# ---------- Stage 1: build ----------
# Instala TODAS las dependencias (incluye devDependencies) para validar que el
# proyecto instala limpio con el lockfile completo antes de armar la imagen final.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# ---------- Stage 2: production ----------
FROM node:20-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

# postgresql-client aporta pg_isready, usado por entrypoint.sh para esperar a la BD.
RUN apk add --no-cache postgresql-client

# Dependencias de producción únicamente (sin nodemon ni sequelize-cli).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# sequelize-cli solo se necesita para migraciones/seeders, no en runtime normal.
# Se instala aparte con --no-save (no queda declarado como dependencia de
# producción en package.json) y se invoca vía "npx sequelize-cli" (ver
# package.json y entrypoint.sh). Al instalarse en build time, en cada arranque
# del contenedor ya está disponible localmente sin tocar la red.
# --include=dev es necesario: con NODE_ENV=production ya seteado, npm trata
# cualquier paquete listado en devDependencies como omitido por defecto (incluso
# pedido por nombre explícito) y no lo instala realmente ("up to date" sin hacer nada).
RUN npm install sequelize-cli@6.6.5 --no-save --include=dev

# Código fuente y configuración de sequelize-cli.
COPY src ./src
COPY .sequelizerc ./

COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
