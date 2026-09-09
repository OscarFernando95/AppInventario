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

> **Drill verificado (2026-09-09).** Se probó el ciclo completo: `backup.sh`
> genera el dump (~112 KB para la base actual), y `psql < dump` sobre una base
> **recién creada** restaura sin un solo error (esquema + 8 migraciones + datos;
> conteos de filas idénticos al origen). El runbook de abajo es el que se
> ejecutó.

**Antes de restaurar:** el dump es SQL en texto plano (`pg_dump -F p`). Sobre una
base que ya tiene datos, los `INSERT`/`CREATE` chocan con lo existente y la
restauración puede quedar a medias. **Restaura siempre sobre una base vacía.**

1. Detén el backend para que no escriba mientras restauras:

   ```bash
   docker compose stop backend
   ```

2. Recrea la base vacía. **Esto borra todos los datos actuales de la base**,
   tenlo claro antes de correrlo:

   ```bash
   docker compose exec db psql -U <POSTGRES_USER> -d postgres -c "DROP DATABASE IF EXISTS \"<POSTGRES_DB>\" WITH (FORCE);"
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

### Probar la restauración sin tocar la base real

Para un simulacro periódico, restaura en una base descartable y compara conteos:

```bash
docker compose exec -T db psql -U <POSTGRES_USER> -d postgres -c 'CREATE DATABASE restore_test;'
docker compose exec -T db psql -U <POSTGRES_USER> -d restore_test < backups/dumps/<dump>.sql
docker compose exec -T db psql -U <POSTGRES_USER> -d restore_test -c '\dt' -c 'SELECT count(*) FROM usuarios;'
docker compose exec -T db psql -U <POSTGRES_USER> -d postgres -c 'DROP DATABASE restore_test;'
```
