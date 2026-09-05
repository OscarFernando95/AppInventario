# Guía de instalación — AppInventario (servidor local en la oficina)

Esta guía explica cómo dejar el sistema funcionando en un PC de la oficina
("el servidor"), para que los demás empleados lo usen desde su navegador
sin instalar nada.

---

## 1. Requisitos previos

- El PC que va a hacer de servidor debe tener instalado **Docker Desktop**
  (Windows). Se descarga desde la página oficial de Docker y se instala
  como cualquier programa (Siguiente, Siguiente, Finalizar). Requiere
  reiniciar el PC una vez terminada la instalación.
- Ese PC debe quedar **encendido y conectado a la red** todo el tiempo que
  se quiera usar el sistema (es literalmente el servidor).

---

## 2. Darle una IP fija al PC servidor

Si la IP del PC servidor cambia sola (por ejemplo, al reiniciar el router),
los demás empleados dejan de poder entrar porque la dirección que tenían
guardada ya no es la correcta. Para evitarlo, hay que fijar la IP. Dos
formas, cualquiera de las dos sirve:

- **Reserva de IP en el router** (recomendado): entrar a la configuración
  del router (normalmente `192.168.0.1` o `192.168.1.1` en el navegador) y
  buscar una opción tipo "Reserva de DHCP" o "IP fija por dispositivo",
  asociando la IP a la dirección MAC del PC servidor.
- **IP fija manual en Windows**: Panel de Control → Redes e Internet →
  Centro de redes y recursos compartidos → clic en la red actual →
  Propiedades → "Protocolo de Internet versión 4 (TCP/IPv4)" → Propiedades →
  marcar "Usar la siguiente dirección IP" y completar IP, máscara y puerta
  de enlace (los mismos datos que ya tenía asignados por DHCP, para no
  chocar con otro equipo de la red).

Anota esa IP: es la que todos los empleados van a usar en su navegador.

---

## 3. Abrir el puerto 80 en el Firewall de Windows

Sin este paso, los demás PCs de la oficina no van a poder conectarse aunque
el sistema esté corriendo.

**Opción rápida (PowerShell como Administrador):**

```powershell
New-NetFirewallRule -DisplayName "AppInventario HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
```

**Opción por interfaz gráfica:**

1. Buscar "Firewall de Windows Defender con seguridad avanzada" en el menú
   de inicio.
2. Clic derecho en "Reglas de entrada" → "Nueva regla".
3. Tipo de regla: **Puerto**.
4. Protocolo: **TCP**, puerto específico: **80**.
5. Acción: **Permitir la conexión**.
6. Perfil: marcar los tres (Dominio, Privado, Público) o solo el que
   corresponda a la red de la oficina.
7. Nombre: por ejemplo "AppInventario HTTP".

---

## 4. Levantar el sistema por primera vez

1. Copiar la carpeta del proyecto al PC servidor (o clonarla con `git clone`
   si tienen Git instalado).
2. Abrir una terminal (PowerShell) dentro de la carpeta del proyecto.
3. Copiar el archivo de variables de entorno de ejemplo y completarlo:

   ```powershell
   copy .env.example .env
   ```

   Abrir `.env` con el Bloc de notas y cambiar como mínimo
   `POSTGRES_PASSWORD` y `JWT_SECRET` por valores propios (no dejar los de
   ejemplo).

4. Levantar todo el sistema:

   ```powershell
   docker compose up -d --build
   ```

   La primera vez tarda varios minutos (descarga imágenes y compila el
   frontend y el backend). Al terminar, el sistema queda corriendo en
   segundo plano.

---

## 5. Verificar que todo esté corriendo

```powershell
docker compose ps
```

Los 4 servicios (`db`, `backend`, `frontend`, `nginx`) deben aparecer con
estado `Up` (o `running`/`healthy`). Si alguno dice `Exit` o `Restarting`,
algo falló — ver la sección 9.

Para ver qué está pasando en tiempo real:

```powershell
docker compose logs -f
```

(`Ctrl+C` para salir de la vista de logs, esto no apaga el sistema).

---

## 6. Acceder desde otros PCs de la oficina

En el navegador de cualquier PC de la misma red, entrar a:

```
http://<IP-DEL-SERVIDOR>
```

Reemplazando `<IP-DEL-SERVIDOR>` por la IP fija del paso 2 (por ejemplo
`http://192.168.1.50`). No hace falta escribir ningún puerto ni `/api`,
solo la IP.

---

## 7. Apagar y prender el sistema sin perder datos

- **Apagar el sistema conservando los datos** (lo normal):

  ```powershell
  docker compose down
  ```

- **Volver a prenderlo:**

  ```powershell
  docker compose up -d
  ```

  (ya no hace falta `--build` salvo que se haya cambiado el código).

- ⚠️ **NUNCA uses `docker compose down -v`** salvo que quieras borrar la
  base de datos por completo. El `-v` elimina también los volúmenes,
  incluyendo el volumen donde vive toda la información de Postgres. Es
  borrado permanente e irreversible salvo que tengas un backup.

Si el PC se reinicia solo (corte de luz, Windows Update, etc.), Docker
Desktop debe estar configurado para iniciar junto con Windows (se activa en
Docker Desktop → Configuración → General → "Start Docker Desktop when you
log in"). Con eso, los contenedores se levantan solos gracias al
`restart: unless-stopped` que ya tienen configurado.

---

## 8. Restaurar un backup en caso de emergencia

Los backups automáticos (si se activó ese servicio opcional) quedan en la
carpeta `backups/dumps/` del propio PC servidor. Los pasos detallados para
restaurar uno están en [`backups/README.md`](backups/README.md). En
resumen:

```powershell
docker compose stop backend
docker compose exec -T db psql -U <POSTGRES_USER> -d <POSTGRES_DB> < backups/dumps/backup_2026-09-05_030000.sql
docker compose start backend
```

---

## 9. Si algo no funciona

1. **Ver los logs de todo:**

   ```powershell
   docker compose logs
   ```

2. **Ver los logs de un solo servicio** (por ejemplo, si la web no carga
   pero sospechas que es el backend):

   ```powershell
   docker compose logs backend
   ```

3. **Reiniciar un solo servicio** (sin tocar los demás ni perder datos):

   ```powershell
   docker compose restart backend
   ```

4. **Reiniciar todo el sistema:**

   ```powershell
   docker compose restart
   ```

5. Si nada de lo anterior ayuda, como último recurso (sin perder datos,
   `down` sin `-v`):

   ```powershell
   docker compose down
   docker compose up -d --build
   ```
