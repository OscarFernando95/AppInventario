#!/bin/sh
set -e

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
MAX_ATTEMPTS=30

echo "Esperando a que Postgres esté disponible en ${DB_HOST}:${DB_PORT}..."
attempt=0
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo "Postgres no respondió tras ${MAX_ATTEMPTS} intentos. Abortando."
    exit 1
  fi
  echo "  Postgres no responde todavía (intento ${attempt}/${MAX_ATTEMPTS}), reintentando en 2s..."
  sleep 2
done
echo "Postgres disponible."

# El seeder (src/seeders/*) verifica internamente si el usuario admin ya existe antes
# de insertar, y sequelize-cli además registra los seeders ya ejecutados en la tabla
# "sequelize_seeders". Por eso migrate + seed son seguros de correr en cada arranque:
# en reinicios simplemente no hacen nada porque ya está todo aplicado.
echo "Aplicando migraciones..."
npm run migrate

echo "Verificando datos iniciales..."
npm run seed

echo "Iniciando servidor..."
exec node src/index.js
