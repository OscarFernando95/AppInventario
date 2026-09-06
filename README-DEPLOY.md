# Despliegue — AppInventario

> **Este documento se unificó con la guía de instalación.**
> Toda la información de instalación y despliegue (requisitos, `.env`,
> `docker compose up`, IP fija, firewall, backups, actualización y solución de
> problemas) está ahora en un único lugar:
>
> ### 👉 [`GUIA_INSTALACION.md`](./GUIA_INSTALACION.md)

## Resumen rápido

Todo corre en Docker (contenedores `db`, `backend`, `frontend`, `nginx`):

```bash
cp .env.example .env          # y editar POSTGRES_PASSWORD y JWT_SECRET
docker compose up -d --build  # levantar
docker compose ps             # verificar
```

Acceso: `http://localhost` (mismo PC) o `http://<IP-DEL-SERVIDOR>` (red de la
oficina). Login inicial: `admin` / `Admin*123`.

Apagar sin perder datos: `docker compose down` — **nunca** con `-v`.

Los pasos completos y las notas de servidor están en
[`GUIA_INSTALACION.md`](./GUIA_INSTALACION.md).
