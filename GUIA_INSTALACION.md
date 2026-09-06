# Guía de instalación y despliegue — AppInventario

> **Esta es la única guía oficial.** Cubre tanto levantar el sistema en tu
> computadora para probarlo como dejarlo funcionando en el PC servidor de la
> oficina. En ambos casos el procedimiento es el mismo: **todo corre en Docker**.
> No hace falta instalar Node.js, PostgreSQL ni compilar nada a mano.

---

## 1. Cómo está armado el sistema

Al levantarlo, Docker arranca **4 contenedores** que trabajan juntos:

| Contenedor | Qué hace |
|---|---|
| `db`       | Base de datos PostgreSQL. Guarda toda la información. |
| `backend`  | La API (Node.js + Express). Aplica migraciones y datos iniciales solo al arrancar. |
| `frontend` | La aplicación web ya compilada (React). |
| `nginx`    | Única puerta de entrada. Publica el **puerto 80** y reparte el tráfico: `/api` va al backend, todo lo demás al frontend. |

Solo `nginx` queda expuesto al exterior. Los otros tres se comunican por una red
interna de Docker y no son accesibles directamente desde fuera.

---

## 2. Requisitos previos

- **Docker Desktop** instalado (Windows o Mac). Se descarga de la
  [página oficial de Docker](https://www.docker.com/products/docker-desktop/) y
  se instala como cualquier programa. En Windows pide reiniciar una vez.
  Asegúrate de que Docker Desktop esté **abierto y corriendo** (ícono de la
  ballena) antes de continuar.
- **Git** (opcional, para descargar y actualizar el proyecto):
  https://git-scm.com/downloads

Para comprobar que Docker quedó listo, abre una terminal (PowerShell en Windows,
Terminal en Mac) y escribe:

```bash
docker --version
docker compose version
```

Si ambos responden con un número de versión, está todo listo.

---

## 3. Descargar el proyecto

### Opción A — con Git (recomendada, permite actualizar después)

```bash
git clone <URL_DEL_REPOSITORIO>
cd AppInventario
```

### Opción B — descargar el ZIP

En GitHub: botón **Code → Download ZIP**, y descomprimir donde prefieras.

> ⚠️ Si copias la carpeta a mano al PC servidor, **no incluyas**
> `docker-compose.override.yml` (es solo para desarrollo; ver la sección 10).

---

## 4. Configurar el archivo `.env`

En la **raíz del proyecto** hay un archivo `.env.example`. Cópialo como `.env`:

```bash
# Windows PowerShell
copy .env.example .env

# Mac / Linux
cp .env.example .env
```

Abre el `.env` recién creado con un editor de texto y cambia **como mínimo**
estos dos valores por otros propios (no dejar los de ejemplo):

| Variable | Qué poner |
|---|---|
| `POSTGRES_USER`     | Nombre del usuario de la base de datos (ej. `appinventario`). |
| `POSTGRES_PASSWORD` | Una contraseña larga y propia. |
| `POSTGRES_DB`       | Nombre de la base de datos (ej. `appinventario`). |
| `JWT_SECRET`        | Un texto largo y aleatorio (sirve para firmar las sesiones). |

Este único `.env` alimenta a los 4 contenedores. **Nunca se sube a Git**
(ya está en `.gitignore`).

> Los archivos `backend/.env.example` y `frontend/.env.example` son **solo** para
> quien quiera correr esas partes sueltas sin Docker. Para el uso normal
> (Docker) se ignoran: basta con el `.env` de la raíz.

---

## 5. Levantar el sistema por primera vez

Desde la raíz del proyecto:

```bash
docker compose up -d --build
```

La primera vez tarda varios minutos: descarga las imágenes base y compila el
frontend y el backend. Al terminar, los contenedores quedan corriendo en
segundo plano.

El backend, al arrancar, **espera a que la base de datos esté lista y luego
aplica solo las migraciones y datos iniciales**. No hay ningún comando manual
de inicialización que ejecutar.

---

## 6. Verificar que todo esté corriendo

```bash
docker compose ps
```

Los 4 servicios (`db`, `backend`, `frontend`, `nginx`) deben aparecer como `Up`
(o `running` / `healthy`). Si alguno dice `Exit` o `Restarting`, revisa la
sección 11.

Para ver los registros en tiempo real:

```bash
docker compose logs -f
```

(`Ctrl+C` sale de la vista de logs; **no** apaga el sistema.)

---

## 7. Entrar a la aplicación

- **Desde el mismo PC** donde levantaste Docker: http://localhost
- **Desde otro PC de la misma red** (caso oficina): `http://<IP-DEL-SERVIDOR>`
  (ver sección 9 para fijar esa IP). No hace falta escribir puerto ni `/api`.

Usuario administrador inicial (creado automáticamente por los datos iniciales):

- **Usuario:** `admin`
- **Contraseña:** `Admin*123`

La primera vez, la aplicación **te obliga a cambiar la contraseña** del `admin`
antes de dejarte entrar: define una nueva (mínimo 8 caracteres, con al menos una
letra y un número) y continúa. Si llegas al panel, la instalación fue exitosa. 🎉

---

## 8. Uso diario: apagar y prender sin perder datos

```bash
# Apagar (conserva todos los datos)
docker compose down

# Volver a prender (ya no hace falta --build salvo que hayas cambiado el código)
docker compose up -d
```

> ⚠️ **NUNCA uses `docker compose down -v`.** El `-v` borra también los
> volúmenes, incluido el de PostgreSQL — eso elimina **toda la base de datos de
> forma permanente**. Solo tiene sentido si quieres empezar de cero a propósito.

Los contenedores tienen `restart: unless-stopped`, así que si el PC se reinicia
(corte de luz, Windows Update…) vuelven a levantarse solos, **siempre que Docker
Desktop arranque con el sistema** (ver sección 9).

---

## 9. Configuración específica del PC servidor de la oficina

Solo aplica cuando el sistema va a quedar fijo en un PC para que lo usen otros
empleados desde su navegador.

### 9.1 Dejar el PC encendido

Ese PC es literalmente el servidor: debe quedar **encendido y conectado a la
red** todo el tiempo que se quiera usar el sistema.

### 9.2 Darle una IP fija

Si la IP del PC servidor cambia sola, los demás dejan de poder entrar. Para
evitarlo, fija la IP de una de estas dos formas:

- **Reserva de IP en el router** (recomendado): entrar a la configuración del
  router (normalmente `192.168.0.1` o `192.168.1.1`) y buscar una opción tipo
  "Reserva de DHCP" o "IP fija por dispositivo", asociando la IP a la dirección
  MAC del PC servidor.
- **IP fija manual en Windows**: Panel de Control → Redes e Internet → Centro de
  redes y recursos compartidos → clic en la red actual → Propiedades →
  "Protocolo de Internet versión 4 (TCP/IPv4)" → Propiedades → "Usar la
  siguiente dirección IP" y completar IP, máscara y puerta de enlace (los mismos
  datos que ya tenía por DHCP).

Anota esa IP: es la que todos los empleados usarán en su navegador.

### 9.3 Abrir el puerto 80 en el Firewall de Windows

Sin esto, los demás PCs no podrán conectarse aunque el sistema esté corriendo.

**PowerShell como Administrador:**

```powershell
New-NetFirewallRule -DisplayName "AppInventario HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
```

**O por interfaz gráfica:** "Firewall de Windows Defender con seguridad
avanzada" → Reglas de entrada → Nueva regla → **Puerto** → TCP, puerto **80** →
Permitir la conexión → marcar los perfiles que correspondan → Nombre
"AppInventario HTTP".

### 9.4 Que Docker arranque con Windows

Docker Desktop → Configuración → General → activar **"Start Docker Desktop when
you log in"**. Con eso, tras un reinicio los contenedores vuelven solos.

---

## 10. Actualizar el sistema a una versión nueva del código

```bash
git pull                       # trae los cambios (si clonaste con Git)
docker compose up -d --build   # reconstruye y reemplaza los contenedores
```

Los datos de la base **no se pierden**: viven en un volumen aparte. Las
migraciones nuevas se aplican solas al arrancar el backend.

---

## 11. Backups de la base de datos

Hay un servicio **opcional** de backups automáticos (diarios a las 3:00 AM, con
14 días de retención). Se activa agregando su archivo al comando:

```bash
docker compose -f docker-compose.yml -f docker-compose.backup.yml up -d
```

Los archivos quedan en `backups/dumps/` del propio PC servidor. El detalle de
cómo hacer un backup manual y cómo **restaurar** uno está en
[`backups/README.md`](backups/README.md). Restauración de emergencia, en
resumen:

```powershell
docker compose stop backend
docker compose exec -T db psql -U <POSTGRES_USER> -d <POSTGRES_DB> < backups/dumps/backup_2026-09-05_030000.sql
docker compose start backend
```

(Reemplaza `<POSTGRES_USER>` y `<POSTGRES_DB>` por los valores de tu `.env`.)

---

## 12. Solo para desarrollo en tu máquina

- **`docker-compose.override.yml`** ya está en el repo y Docker Compose lo
  aplica automáticamente al hacer `docker compose up` en tu equipo. Publica el
  puerto de PostgreSQL en `localhost:5433` para que puedas conectarte con
  pgAdmin / DBeaver / psql. Este archivo está en `.gitignore` y **no debe llegar
  al PC servidor del cliente**.
- Cada vez que cambies código del backend o del frontend, aplica los cambios
  con `docker compose up -d --build`.
- Para reiniciar desde cero (borra la base de datos): `docker compose down -v`
  y luego `docker compose up -d --build`.

---

## 13. Solución de problemas

| Síntoma | Qué revisar |
|---|---|
| `docker compose up` falla al empezar | Docker Desktop no está abierto/corriendo. Ábrelo y espera a que el ícono de la ballena deje de animarse. |
| Un servicio queda en `Exit` o `Restarting` | `docker compose logs <servicio>` (ej. `docker compose logs backend`) para ver el error concreto. |
| La web no carga en `http://localhost` | `docker compose ps` — `nginx` y `frontend` deben estar `Up`. Revisa que nada más esté usando el puerto 80. |
| La web carga pero no trae datos / errores de red | `docker compose logs backend`. Suele ser la base de datos: revisa que `db` esté `healthy` y que el `.env` tenga las credenciales correctas. |
| Otros PCs de la oficina no pueden entrar | IP fija del servidor (9.2), regla de firewall del puerto 80 (9.3), y que estén en la **misma red**. Prueba `http://<IP>` desde el propio servidor primero. |
| `db` no arranca / error de contraseña tras cambiar el `.env` | Si ya existía un volumen con otra contraseña, Postgres conserva la primera. Para un entorno nuevo: `docker compose down -v` y volver a levantar (esto borra datos). |
| Olvidaste la contraseña de `admin` | En un entorno de prueba: `docker compose down -v && docker compose up -d --build` recrea el admin (`admin` / `Admin*123`). En producción, restaura desde un backup. |
| Cambiaste código y no se refleja | Falta reconstruir: `docker compose up -d --build`. |
