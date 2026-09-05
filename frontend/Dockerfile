# ---------- Stage 1: build ----------
FROM node:20-alpine AS build
WORKDIR /app

# Ruta relativa fija en build time: el backend queda siempre detrás de /api del
# mismo origen (vía Nginx), sin importar la IP del PC servidor en la red del cliente.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- Stage 2: production ----------
# Nginx liviano SOLO para servir los estáticos del build (dist/). El proxy a /api
# y el punto de entrada público (puerto 80 del host) los maneja el Nginx del
# Bloque 4, un contenedor aparte.
FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
