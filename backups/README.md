# Backups de la base de datos

## Automático

El servicio opcional `backup` (definido en `docker-compose.backup.yml`) corre
todos los días a las **3:00 AM** dentro del contenedor y genera un archivo
`backup_AAAA-MM-DD_HHMMSS.sql` en `backups/dumps/` (carpeta del host, montada
como volumen — sobrevive aunque se borren los contenedores). Cada corrida
también borra automáticamente los backups con más de 14 días.

Para activarlo:

```bash
docker compose -f docker-compose.yml -f docker-compose.backup.yml up -d
```

Queda separado del `docker-compose.yml` principal a propósito: es un servicio
opcional, así que se activa explícitamente agregando el segundo archivo, en
vez de arrancar siempre sin que se note.

Para ver el historial de corridas:

```bash
docker compose logs backup
```

## Backup manual (a demanda)

```bash
docker compose exec backup /usr/local/bin/backup.sh
```

(o, sin el servicio `backup` activo, directo contra `db`:)

```bash
docker compose exec -T db pg_dump -U <POSTGRES_USER> -d <POSTGRES_DB> > backups/dumps/backup_manual.sql
```

## Restaurar un backup

**Antes de restaurar:** esto sobreescribe datos existentes con conflicto de
claves (usuarios, IDs, etc.) puede fallar a mitad de camino si la base ya
tiene información. Lo más seguro es restaurar sobre una base **vacía**.

1. Detén el backend para que no escriba mientras restauras:

   ```bash
   docker compose stop backend
   ```

2. (Opcional pero recomendado) Recrea la base vacía. **Esto borra todos los
   datos actuales de la base**, tenlo claro antes de correrlo:

   ```bash
   docker compose exec db psql -U <POSTGRES_USER> -d postgres -c "DROP DATABASE \"<POSTGRES_DB>\";"
   docker compose exec db psql -U <POSTGRES_USER> -d postgres -c "CREATE DATABASE \"<POSTGRES_DB>\";"
   ```

3. Restaura el backup elegido:

   ```bash
   docker compose exec -T db psql -U <POSTGRES_USER> -d <POSTGRES_DB> < backups/dumps/backup_2026-09-05_030000.sql
   ```

4. Vuelve a levantar el backend:

   ```bash
   docker compose start backend
   ```

Reemplaza `<POSTGRES_USER>` y `<POSTGRES_DB>` por los valores de tu `.env`
(por defecto `appinventario` y `appinventario`).
