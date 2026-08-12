# Guía de instalación paso a paso (para principiantes)

Esta guía está pensada para alguien que **nunca ha instalado un proyecto desde GitHub**. Sigue los pasos en orden, sin saltarte ninguno.

El proyecto tiene dos partes que se ejecutan por separado:
- **backend**: el servidor (la API), en la carpeta `backend/`
- **frontend**: la aplicación web que ves en el navegador, en la carpeta `frontend/`

Ambas necesitan una base de datos **MySQL** para funcionar.

---

## ✅ Checklist rápido

Marca cada punto a medida que lo completes:

- [ ] Instalar Git
- [ ] Instalar Node.js (versión 18 o superior)
- [ ] Instalar Visual Studio Code
- [ ] Instalar MySQL 8 (Community Server)
- [ ] Descargar/clonar el proyecto
- [ ] Abrir el proyecto en Visual Studio Code
- [ ] Crear la base de datos y el usuario en MySQL
- [ ] Configurar el archivo `.env` del backend
- [ ] Instalar dependencias del backend (`npm install`)
- [ ] Crear las tablas y el usuario administrador (`npm run initdb`)
- [ ] Arrancar el backend (`npm run dev`)
- [ ] Configurar el archivo `.env` del frontend
- [ ] Instalar dependencias del frontend (`npm install`)
- [ ] Arrancar el frontend (`npm run dev`)
- [ ] Entrar a la aplicación en el navegador y hacer login

---

## Paso 1 — Instalar los programas necesarios

Instala esto en tu computadora **antes de tocar el proyecto**:

1. **Git** (para descargar el código): https://git-scm.com/downloads
2. **Node.js** versión 18 o superior (incluye `npm`): https://nodejs.org/ (descarga la versión "LTS")
3. **Visual Studio Code**: https://code.visualstudio.com/
4. **MySQL 8 (Community Server)**: https://dev.mysql.com/downloads/mysql/
   - Durante la instalación te pedirá definir una contraseña para el usuario `root`. **Anótala**, la necesitarás en el Paso 4.
   - En Windows, el instalador "MySQL Installer" incluye también "MySQL Workbench" (una interfaz gráfica opcional) y "MySQL Shell"/cliente de línea de comandos.
   - En Mac, puedes instalarlo desde el `.dmg` oficial o con Homebrew: `brew install mysql` y luego `brew services start mysql`.
   - Asegúrate de que el servicio de MySQL quede **iniciado/corriendo** después de instalarlo.

Para comprobar que Git y Node quedaron bien instalados, abre una terminal (en Windows: "Símbolo del sistema" o "PowerShell"; en Mac: "Terminal") y escribe:

```bash
git --version
node --version
npm --version
```

Si cada comando responde con un número de versión (por ejemplo `v20.11.0`), está todo listo.

---

## Paso 2 — Descargar el proyecto

Elige una de estas dos opciones:

### Opción A: Clonar con Git (recomendada)

Abre una terminal, ve a la carpeta donde quieras guardar el proyecto y ejecuta:

```bash
git clone <URL_DEL_REPOSITORIO>
cd AppInventario
```

(Reemplaza `<URL_DEL_REPOSITORIO>` por la URL del repositorio en GitHub, que se copia con el botón verde **"Code"** de la página del repositorio).

### Opción B: Descargar el ZIP

En la página del repositorio en GitHub, haz clic en **Code → Download ZIP**, y luego descomprime el archivo en la carpeta que prefieras.

---

## Paso 3 — Abrir el proyecto en Visual Studio Code

1. Abre Visual Studio Code.
2. Ve a **Archivo (File) → Abrir carpeta (Open Folder)**.
3. Selecciona la carpeta `AppInventario` que descargaste/clonaste.
4. Abre una terminal integrada: menú **Terminal → New Terminal** (o `Ctrl+ñ` / `Ctrl+backtick`).

Todos los comandos de los siguientes pasos se ejecutan en esa terminal.

---

## Paso 4 — Crear la base de datos en MySQL

Con MySQL ya instalado y corriendo (Paso 1), abre una terminal y conéctate como usuario `root`:

```bash
mysql -u root -p
```

Te pedirá la contraseña de `root` que definiste al instalar MySQL. Una vez dentro (verás el prompt `mysql>`), ejecuta estos comandos uno por uno para crear la base de datos y un usuario dedicado para la aplicación:

```sql
CREATE DATABASE AppInventario;
CREATE USER 'userInventario'@'localhost' IDENTIFIED BY 'Cambiar*123';
GRANT ALL PRIVILEGES ON AppInventario.* TO 'userInventario'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> Puedes usar otra contraseña si prefieres — solo recuerda que deberás escribir el mismo valor en el archivo `.env` del backend (Paso 5).

Si prefieres una interfaz gráfica en vez de la terminal, puedes usar **MySQL Workbench** (incluido en el instalador de Windows) o **TablePlus/DBeaver** para crear la base de datos y el usuario de la misma forma.

---

## Paso 5 — Configurar y arrancar el backend

1. En la terminal:

   ```bash
   cd backend
   npm install
   ```

   Esto instala todas las dependencias del servidor (puede tardar unos minutos).

2. Crea el archivo de configuración copiando la plantilla incluida:

   ```bash
   cp .env.example .env
   ```

   > En Windows PowerShell, si `cp` no funciona, usa: `copy .env.example .env`

   Si usaste exactamente los mismos valores del Paso 4 (`AppInventario` / `userInventario` / `Cambiar*123`), **no necesitas cambiar nada** — los valores por defecto ya coinciden. Si usaste otro nombre de base de datos, usuario o contraseña, abre el archivo `.env` (recién creado) en VS Code y ajusta `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` con tus datos reales.

3. Crea las tablas de la base de datos y el usuario administrador inicial:

   ```bash
   npm run initdb
   ```

   Si todo sale bien, verás un mensaje como:
   `Usuario SuperAdmin creado correctamente (admin / Admin*123).`

   > ⚠️ Este comando **borra y recrea** las tablas. Solo ejecútalo la primera vez (o cuando quieras reiniciar todo desde cero).

4. Arranca el servidor backend:

   ```bash
   npm run dev
   ```

   Deberías ver en la terminal:
   ```
   Base de datos conectada correctamente.
   Modelos sincronizados con la Base de Datos.
   Servidor Backend corriendo en puerto 3000
   ```

   **Deja esta terminal abierta y corriendo.** El backend debe seguir funcionando mientras usas la aplicación.

---

## Paso 6 — Configurar y arrancar el frontend

Abre una **segunda terminal** en VS Code (icono `+` en el panel de terminal, o `Terminal → New Terminal`), para no cerrar la del backend.

1. En la nueva terminal:

   ```bash
   cd frontend
   npm install
   ```

2. Crea el archivo de configuración:

   ```bash
   cp .env.example .env
   ```

   El valor por defecto (`VITE_API_URL=http://localhost:3000/api`) ya apunta al backend que arrancaste en el Paso 5, así que no necesitas cambiar nada si usaste el puerto 3000.

3. Arranca el frontend:

   ```bash
   npm run dev
   ```

   Verás algo como:
   ```
   VITE ready
   ➜  Local:   http://localhost:5173/
   ```

---

## Paso 7 — Usar la aplicación

1. Abre tu navegador y entra a: **http://localhost:5173**
2. Inicia sesión con el usuario administrador creado en el Paso 5:
   - **Usuario:** `admin`
   - **Contraseña:** `Admin*123`

Si ves la pantalla de login y puedes entrar, ¡la instalación fue exitosa! 🎉

---

## Resumen: cómo volver a arrancar el proyecto en el futuro

Una vez instalado todo (Pasos 1 a 6 no se repiten, excepto `npm run initdb`), para volver a trabajar en el proyecto solo necesitas asegurarte de que el servicio de MySQL esté corriendo, y luego:

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

---

## Solución de problemas comunes

| Problema | Posible causa / solución |
|---|---|
| `Error al conectar a la base de datos` | El servicio de MySQL no está corriendo, o los datos en `backend/.env` no coinciden con los que creaste en el Paso 4. En Windows revisa "Servicios" (busca `MySQL80`); en Mac, `brew services list` o revisa MySQL en Preferencias del Sistema. |
| `Access denied for user` al conectar | El usuario/contraseña de `backend/.env` no coincide con lo creado en MySQL. Repite el Paso 4 o corrige el `.env`. |
| `EADDRINUSE` o "puerto ya en uso" | Ya hay algo corriendo en ese puerto (3000 o 5173). Cierra la otra terminal/proceso o cambia el puerto en el `.env`. |
| El frontend carga pero no trae datos / errores de red | Verifica que el backend esté corriendo y que `frontend/.env` tenga `VITE_API_URL=http://localhost:3000/api`. |
| `npm install` falla | Verifica tu versión de Node (`node --version`, debe ser 18+) y tu conexión a internet. |
| `mysql` no reconocido en la terminal | El instalador de MySQL no agregó el cliente al PATH del sistema. En Windows, usa el "MySQL Command Line Client" desde el menú Inicio; en Mac, agrega `/usr/local/mysql/bin` (o la ruta de tu instalación) al PATH, o abre la conexión desde MySQL Workbench. |
| Olvidaste la contraseña de `admin` | Vuelve a ejecutar `npm run initdb` dentro de `backend/` (esto reinicia toda la base de datos). |
