#!/bin/sh
set -e

DUMP_DIR="/dumps"
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
FILENAME="backup_${TIMESTAMP}.sql"

mkdir -p "$DUMP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

log "Generando backup: $FILENAME"
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -F p -f "$DUMP_DIR/$FILENAME"
log "Backup guardado en $DUMP_DIR/$FILENAME ($(du -h "$DUMP_DIR/$FILENAME" | cut -f1))"

log "Eliminando backups con más de ${RETENTION_DAYS} días..."
find "$DUMP_DIR" -name 'backup_*.sql' -type f -mtime "+${RETENTION_DAYS}" -print -delete

log "Backups actuales en $DUMP_DIR:"
ls -lh "$DUMP_DIR"
