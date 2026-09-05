# Imagen liviana con cron: alpine trae busybox (que incluye crond) de fábrica,
# solo hace falta el cliente de Postgres para pg_dump.
FROM alpine:3.20

RUN apk add --no-cache postgresql16-client

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

COPY crontab /etc/crontabs/root

# "-f" mantiene crond en primer plano (para que el contenedor no se apague solo).
ENTRYPOINT ["crond", "-f", "-d", "8"]
