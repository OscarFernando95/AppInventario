# Informe de refactorización — AppInventario

**Fecha:** 2026-09-06
**Alcance:** backend (Express + Sequelize + PostgreSQL), frontend (React + Vite),
infraestructura Docker.
**Objetivo:** identificar puntos de mejora, vulnerabilidades, manejo de caché y
seguridad, con un plan de corrección priorizado.

---

## 1. Resumen ejecutivo

El sistema es funcional y la migración a Docker/Postgres está bien encaminada,
pero hay **deuda de seguridad y de robustez** que conviene cerrar antes de
ponerlo en producción en la oficina, más varias oportunidades claras de
rendimiento y de caché.

| Severidad | Cantidad | Ejemplos |
|---|---|---|
| 🔴 Crítico | 3 | Sin rate-limit en login · volcado de `req.body` a disco · `total` de venta/compra confiado al cliente |
| 🟠 Alto | 12 | CORS abierto · sin `helmet` · escalada de privilegios de rol · fuga cross-tenant en `servicios` · sin índices en FKs · sin cache headers en assets |
| 🟡 Medio | 18 | Enumeración de usuarios · errores que filtran `error.message` · sin paginación · condición de carrera en stock · sin caché de dashboard |
| 🔵 Bajo | 15 | Sin logs de auditoría · scripts de debug en el repo · ramas MySQL muertas · sin límites de recursos en contenedores |

Hay un **plan por fases** en la sección 9. La Fase 0 (correcciones urgentes, ~1–2
días) no cambia arquitectura.

---

## 2. Seguridad

### 🔴 S1 — Sin límite de intentos en el login (fuerza bruta)
[`authRoutes.js:5`](../backend/src/routes/authRoutes.js#L5) — `POST /api/auth/login`
no tiene rate limiting. Un atacante en la LAN puede probar miles de contraseñas.
**Fix:** `express-rate-limit` en el login (p.ej. 5 intentos / 15 min / IP + usuario)
y un limitador global más laxo para toda la API.

### 🔴 S2 — Volcado de la petición a disco en cada error de venta
[`ventaController.js`](../backend/src/controllers/ventaController.js) —
`require('fs').writeFileSync('/tmp/venta_error.json', JSON.stringify({ body: req.body, error: error.stack }))`.
Escribe **todo el cuerpo de la petición** (datos de clientes, montos) a un archivo
en cada error, sin rotación. Fuga de datos + llenado de disco del contenedor.
**Fix:** eliminar esa línea; usar el logger estructurado (S13).

### 🔴 D1 — El `total` de venta/compra viene del cliente
Ver sección 4 (Integridad). Es también un problema de seguridad: permite
registrar ventas con `total: 0`.

### 🟠 S3 — Token de sesión accesible por JavaScript (riesgo XSS)
[`authStore.js`](../frontend/src/store/authStore.js) guarda el JWT en
`localStorage` (vía `persist`) **y** en una cookie `token` creada con `js-cookie`
(no `httpOnly`, sin `Secure`, sin `SameSite`). Cualquier XSS roba la sesión de 8 h.
Además la cookie **no se usa** (axios lee del store).
**Fix:** ideal — que el backend emita una cookie `httpOnly; Secure; SameSite=Strict`
y el front deje de tocar el token. Mínimo — eliminar la cookie redundante y añadir
una CSP estricta (S4) para reducir la superficie de XSS.

### 🟠 S4 — Sin cabeceras de seguridad (`helmet`)
[`index.js:10`](../backend/src/index.js#L10) — no hay `helmet`, ni CSP, ni
`X-Frame-Options`, ni `X-Content-Type-Options`, ni HSTS.
**Fix:** `app.use(helmet())` + CSP (en Express o en el `nginx/nginx.conf` de
entrada). Clickjacking hoy es trivial.

### 🟠 S5 — CORS completamente abierto
[`index.js:10`](../backend/src/index.js#L10) — `app.use(cors())` acepta cualquier
origen. La variable `FRONTEND_URL` ya está en `docker-compose.yml` pero no se usa.
**Fix:** `cors({ origin: process.env.FRONTEND_URL, credentials: true })`, o
eliminar CORS por completo (todo es mismo origen detrás de Nginx).

### 🟠 S6 — Enumeración de usuarios en el login
[`authController.js:17-24`](../backend/src/controllers/authController.js#L17-L24) —
devuelve `404 "Usuario no encontrado o inactivo"` vs `401 "Contraseña incorrecta"`,
y solo ejecuta `bcrypt.compare` si el usuario existe (diferencia de _timing_
medible). Permite descubrir usuarios válidos.
**Fix:** respuesta y código uniformes (`401 "Credenciales inválidas"`); ejecutar
un `bcrypt.compare` contra un hash dummy cuando el usuario no exista.

### 🟠 S7 — `JWT_SECRET` sin validar al arrancar
[`authController.js:32`](../backend/src/controllers/authController.js#L32),
[`auth.js:9`](../backend/src/middlewares/auth.js#L9) — si la variable falta, la
app arranca igual y falla en runtime (o firma con `undefined`).
**Fix:** _fail-fast_ en el arranque: abortar si `!process.env.JWT_SECRET` o si
mide menos de 32 caracteres.

### 🟠 A3 — Escalada de privilegios al crear/editar usuarios
Ver sección 3 (Autorización). Un `FRONT_ADMIN` puede asignar `rolId = 1`
(BACKOFFICE_ADMIN).

### 🟠 A1 — Fuga cross-tenant en `/api/servicios`
Ver sección 3.

### 🟡 S8 — `verifyToken` laxo con el esquema del header
[`auth.js:7-9`](../backend/src/middlewares/auth.js#L7-L9) — acepta el token con o
sin prefijo `Bearer` (`token.split(' ')[1] || token`), y devuelve `403` cuando
falta el token (debería ser `401`).
**Fix:** exigir `Authorization: Bearer <token>`; `401` para token ausente/inválido,
`403` solo para permisos insuficientes.

### 🟡 S9 — Los errores filtran `error.message` al cliente
`pedidoController` (`det: error.message`), `compraController`, `ventaController`
(`'... ' + error.message`), `reporteController`. Expone detalles internos / SQL.
**Fix:** loguear en el servidor, responder mensaje genérico + un `requestId`.

### 🟡 S10 — `express.json()` sin `limit`
[`index.js:11`](../backend/src/index.js#L11) — Nginx corta en 20 MB, pero el
backend debería tener su propio límite (`express.json({ limit: '100kb' })`).

### 🟡 S11 — Contraseña de admin por defecto, sin forzar cambio
El seeder crea `admin / Admin*123` (documentado públicamente). Nada obliga a
cambiarla.
**Fix:** columna `must_change_password` y pantalla de cambio obligatorio en el
primer login.

### 🟡 S12 — Sin política de contraseñas en el servidor
`createUsuario` / `updateUsuario` aceptan cualquier `contrasena`. `bcrypt` usa 10
rondas.
**Fix:** validar longitud/complejidad mínima en el backend; subir a 12 rondas.

### 🔵 S13 — Sin logs de acceso ni auditoría
No hay `morgan`/`winston`. Imposible investigar un incidente.
**Fix:** `morgan` para acceso + un logger JSON para eventos de negocio (login,
creación de usuarios, ventas).

### 🔵 S14 — Sin `/health` ni healthcheck del backend
Ver sección 7 (Infra).

---

## 3. Multi-tenant y autorización

### 🟠 A1 — `servicioRoutes` no valida `req.empresaId`
[`servicioRoutes.js`](../backend/src/routes/servicioRoutes.js) es el único módulo
transaccional **sin** el guard `if (!req.empresaId) return 403`. En
[`servicioController.js`](../backend/src/controllers/servicioController.js), si un
`BACKOFFICE_ADMIN` (que no tiene `empresaId`) llama `GET /api/servicios`, el
`where: { empresaId: undefined }` según la versión de Sequelize lanza un 500 o
**omite el filtro y devuelve los servicios de todas las empresas**. `createServicio`
insertaría con `empresaId` nulo.
**Fix:** añadir el mismo middleware de `productoRoutes`.

### 🟠 A3 — Escalada de privilegios de rol
[`usuarioController.js:26-52`](../backend/src/controllers/usuarioController.js#L26-L52)
y `updateUsuario` — el `rolId` se toma de `req.body` sin restringir. Un
`FRONT_ADMIN` puede crear/editar un usuario con `rolId = 1` (BACKOFFICE_ADMIN) o
`FRONT_ADMIN` de su empresa y escalar.
**Fix:** _whitelist_ de roles asignables según quién llama:
`FRONT_ADMIN` solo puede asignar `FRONT_ADMIN`/`FRONT_USER`; nunca BackOffice.

### 🟠 A2 — El rol y los permisos viven congelados en el JWT 8 h
[`authController.js:26-34`](../backend/src/controllers/authController.js#L26-L34) —
`tipoRol` y `rolId` se meten en el token. Si se revoca acceso a una empresa, se
cambia el rol o se **desactiva** al usuario, el token sigue siendo válido hasta 8 h.
`verifyToken` revalida la pertenencia a la empresa contra la BD (bien) pero **no**
revalida `usuario.estado` ni el rol actual.
**Fix corto:** revalidar `estado` (y opcionalmente el rol) en `verifyToken`.
**Fix medio:** access token corto (15–30 min) + refresh token, o tabla de sesiones
con lista de revocación.

### 🟡 A4 — Reglas de edición de usuarios incompletas
`updateUsuario` deja a un `FRONT_ADMIN` cambiar `username`/`rolId`/`estado` de
cualquier usuario de su empresa, incluido otro `FRONT_ADMIN` o él mismo (puede
autodesactivarse).
**Fix:** no permitir editar usuarios de rol igual o superior; no permitir
autodesactivación.

### 🟡 A5 — Colisión de `username` cae en error 500 genérico
La `unique constraint` de `username` no se comprueba antes; el `catch` responde
`500 "Error al crear usuario"`.
**Fix:** validar existencia y responder `409` con mensaje claro.

### 🔵 A6 — `empresaController` no valida `modulosIds`
`setModulos(modulosIds)` sin comprobar que existan.

---

## 4. Integridad de datos y lógica de negocio

### 🔴 D1 — `total` de venta/compra se guarda tal cual del cliente
[`ventaController.js`](../backend/src/controllers/ventaController.js) `createVenta`
y [`compraController.js`](../backend/src/controllers/compraController.js)
`createCompra` — el backend recalcula `subtotal_bruto` y `total_impuestos`, pero
guarda `total` **directamente de `req.body`** sin compararlo. Un cliente puede
enviar `total: 1`.
**Fix:** calcular `total` en el servidor a partir de los detalles y descartar el
del cliente (o rechazar si difiere más de 1 centavo).

### 🟠 D2 — No se valida el tenant de `proveedorId` / `productoId` en compras y pedidos
`createCompra`, `createPedido` y `checkInPedido` no verifican que `proveedorId`
pertenezca a `req.empresaId`. `createPedido` tampoco valida `productoId` de los
detalles. `checkInPedido` sí valida el producto, pero si no pertenece
**omite el stock en silencio y aun así crea el `CompraDetalle`** (queda
inconsistente).
**Fix:** validar pertenencia al tenant de todo id recibido; lanzar error (no
omitir) si algo no cuadra.

### 🟡 D3 — Estado de `Pedido` inconsistente
`checkInPedido` compara `pedido.estado !== 'PENDIENTE'` y cierra a `'COMPLETADO'`,
pero `createPedido` no fija `estado` explícito (depende del default del modelo).
Revisar el enum y unificar (`PENDIENTE` / `COMPLETADO` / `CANCELADO`).

### 🟡 D4 — Condición de carrera en el stock
[`ventaController.js`](../backend/src/controllers/ventaController.js) hace
`Producto.findByPk(id, { transaction: t })` (sin `lock: t.LOCK.UPDATE`), valida
stock y luego resta. Dos ventas concurrentes del mismo producto pueden
**sobrevender**. Igual al sumar en compra/checkin.
**Fix:** `SELECT ... FOR UPDATE` (`lock: t.LOCK.UPDATE`) al leer el producto
dentro de la transacción, o `UPDATE ... SET stock = stock - :n WHERE stock >= :n`
atómico.

### 🟡 D5 — Fechas de informe sin validar
[`informeController.js`](../backend/src/controllers/informeController.js) y
[`reporteController.js`](../backend/src/controllers/reporteController.js) —
`new Date(start)` con entrada basura produce `Invalid Date` → error 500.
**Fix:** validar formato y rango (`start <= end`, ventana máxima).

### 🔵 D6 — Cantidades sin validar
`Number(item.cantidad)` sin comprobar `> 0` ni numérico en varios controladores;
cantidades negativas inflarían stock o total.

### 🔵 D7 — Lógica dual MySQL/Postgres en los controladores
`datePart()` en `reporteController` y `qcol()` en `informeController` ramifican por
dialecto. Deuda de migración: ya se usa solo Postgres.

---

## 5. Rendimiento y base de datos

### 🟠 P1 — Sin índices en las claves foráneas
[`20260903090000-initial-schema.js`](../backend/src/migrations/20260903090000-initial-schema.js)
crea las tablas sin índices salvo los `unique`. PostgreSQL **no** indexa las FKs
automáticamente. Cada `where: { empresaId }` y cada JOIN
(`ventas_detalles.ventaId`, `compras.proveedorId`, `productos.empresaId`,
`usuarios_empresas`, …) hace _sequential scan_. Con crecimiento de datos degrada
rápido.
**Fix:** migración nueva que añade índices a todas las columnas `*Id` y compuestos
frecuentes: `ventas(empresaId, fecha)`, `compras(empresaId, fecha)`,
`productos(empresaId)`, `ventas_detalles(ventaId)`, etc.

### 🟠 P2 — Consulta extra por cada request autenticado
[`auth.js:21`](../backend/src/middlewares/auth.js#L21) —
`Usuario.findByPk(userId, { include: Empresa })` en **cada** petición de un usuario
no-backoffice. Consulta + JOIN por request.
**Fix:** caché en memoria con TTL corto (30–60 s) de
`userId → { estado, empresaIds }`, invalidada al cambiar accesos. (Meter
`empresaIds` en el JWT es alternativa, pero empeora A2.)

### 🟡 P3 — Sin paginación
`getVentas`, `getCompras`, `getPedidos`, `getUsuarios` e informes usan `findAll`
sin límite, con includes anidados (`VentaDetalle → Producto, Servicio, Empresa`).
Respuestas que crecen sin techo.
**Fix:** `limit`/`offset` + `?page=`, con orden estable y `count` total.

### 🟡 P4 — `getUsuarios` filtra en memoria
[`usuarioController.js:11-19`](../backend/src/controllers/usuarioController.js#L11-L19)
— para `FRONT_ADMIN` trae **todos** los usuarios del sistema y luego
`usuariosRaw.filter(...)`. Ineficiente y trae datos de otros tenants al proceso.
**Fix:** filtrar en la query con `include: [{ model: Empresa, where: { id: req.empresaId } }]`.

### 🟡 P5 — Bucles `await` secuenciales en creación de documentos
Ventas/compras/pedidos crean los detalles uno a uno. Para volúmenes normales es
aceptable; usar `bulkCreate`.

### 🔵 P6 — `getVentas` incluye la `Empresa` completa en cada venta
Redundante: la empresa activa ya se conoce en el cliente.

### 🔵 P7 — Sin compresión en Nginx
`nginx/nginx.conf` no activa `gzip`/`brotli`; los JSON grandes viajan sin comprimir.

---

## 6. Manejo de caché

### 🟠 C1 — Los assets del frontend no tienen caché de larga duración
[`frontend/nginx.conf`](../frontend/nginx.conf) no envía `Cache-Control`. Vite
genera nombres con hash (`/assets/app.[hash].js`), que deberían servirse como
`Cache-Control: public, max-age=31536000, immutable`, mientras que `index.html`
debe ser `no-cache` para que tras cada _deploy_ el navegador tome el HTML nuevo
(que referencia los chunks nuevos). Sin esto: revalidación innecesaria en cada
carga y, si algún proxy cachea `index.html`, errores tipo _"Failed to fetch
dynamically imported module"_ tras actualizar.
**Fix:**
```nginx
location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
location = /index.html {
    add_header Cache-Control "no-cache";
}
```

### 🟡 C2 — El Nginx de entrada no fija política de caché
[`nginx/nginx.conf`](../nginx/nginx.conf) — añadir `Cache-Control: no-store` en
`location /api/` (evita cacheo por proxies intermedios) y caché larga para
estáticos.

### 🟡 C3 — `express.static` sin `maxAge`
[`index.js:41`](../backend/src/index.js#L41) — ruta muerta en Docker (Nginx sirve
el front), pero activa en el modo "el backend sirve el build". Añadir
`express.static(path, { maxAge: '1y', immutable: true, index: false })` y servir
`index.html` con `no-cache`.

### 🟡 C4 — Sin caché de datos costosos y poco cambiantes
`/api/reportes/dashboard` y `/api/informes` recalculan agregados SQL
(`SUM`, `COUNT`, `EXTRACT`) en cada visita.
**Fix:** caché en memoria con TTL (~60 s) por `empresaId`, o
`Cache-Control: private, max-age=30` + `ETag` en la respuesta.

### 🔵 C5 — El frontend no tiene capa de caché de datos de servidor
`Inventario.jsx` y las demás páginas hacen `useEffect(() => fetchX(), [])`: cada
navegación entre vistas = request nuevo, sin deduplicación ni _stale-while-
revalidate_.
**Fix:** adoptar **TanStack Query** (o SWR) con `staleTime` razonable.

### 🔵 C6 — Refetch no reacciona al cambio de empresa activa
`useEffect(..., [])` con dependencias vacías: si el usuario cambia
`activeEmpresa` sin remontar el componente, la lista queda obsoleta. Añadir
`activeEmpresa.id` a las dependencias (o usarlo como `key`/`queryKey`).

---

## 7. Infraestructura / Docker

| Id | Severidad | Hallazgo |
|---|---|---|
| I1 | 🟠 | `backend` sin `healthcheck` en `docker-compose.yml`; `nginx` depende de él sin `condition: service_healthy` → 502 en el arranque. Añadir `/api/health` + healthcheck. |
| I2 | 🟡 | El contenedor `backend` corre como **root**. Añadir `USER node` en el `Dockerfile`. |
| I5 | 🟡 | Sin límites de recursos (`mem_limit` / `deploy.resources`). Un _runaway_ del backend puede tumbar el PC servidor. |
| I7 | 🟡 | Sin rotación de logs de Docker (`logging.options.max-size`). El disco del servidor se puede llenar. |
| I4 | 🔵 | El `.env` no se valida contra los valores de ejemplo (documentado en la guía, aceptable). |
| I6 | 🔵 | `sequelize.authenticate()` se ejecuta en `config/database.js` **e** `index.js`; el `.catch` de `database.js` solo loguea. Unificar. |

---

## 8. Calidad de código y mantenibilidad

| Id | Hallazgo | Fix |
|---|---|---|
| Q1 | `try/catch` + `res.status(500)` repetido en cada controlador | `asyncHandler` + middleware de errores central |
| Q2 | Sin validación de entrada; los controladores desestructuran `req.body` a ciegas | `zod` / `express-validator` con esquema por endpoint |
| Q3 | El catch-all `app.get('/*splat')` ([`index.js:44`](../backend/src/index.js#L44)) devuelve `index.html` (200 HTML) para rutas `/api/*` inexistentes | `app.use('/api', (req,res) => res.status(404).json(...))` antes del catch-all |
| Q4 | Lógica de negocio (IVA, stock) embebida en controladores | Extraer a `services/` para testear |
| Q5 | Cero tests (`npm test` = `exit 1`) | Jest/Vitest + supertest: auth, multi-tenant, cálculo de venta |
| Q6 | Scripts sueltos de depuración en `backend/`: `check-db.js`, `fix-compra.js`, `fix-db.js`, `test-db.js`, `seed-pedido.js` | Sacar del repo o mover a `scripts/` documentados |
| Q7 | Ramas MySQL muertas (`reporteController`, `informeController`, `connection.js`, `.env.example`) y dependencia `mysql2` | Eliminar; dejar solo Postgres |
| Q10 | El interceptor de axios ([`axios.js:25`](../frontend/src/api/axios.js#L25)) hace `logout()` global también con `403` | Separar: `401` → logout; `403` → mostrar error sin cerrar sesión |

---

## 9. Plan de corrección por fases

### Fase 0 — Urgente (~1–2 días, sin cambio de arquitectura) — ✅ COMPLETADA (2026-09-06)

- [x] **S2** Eliminar el `writeFileSync` de `ventaController`.
- [x] **A1** Añadir guard `req.empresaId` a `servicioRoutes`.
- [x] **A3** Whitelist de roles asignables en `createUsuario`/`updateUsuario` (`validarRolAsignable`, vía `Role.tipo`).
- [x] **D1** Recalcular `total` en el servidor (venta y compra); se ignora el del cliente.
- [x] **D2** Validar tenant de `proveedorId`/`productoId` en compra y pedido; `checkInPedido` ya no omite productos ajenos en silencio.
- [x] **S1** `express-rate-limit` en `/api/auth/login` (5 / 15 min) + límite global laxo + `trust proxy`.
- [x] **S5** CORS restringido a `FRONTEND_URL` (lista); sin la variable, CORS desactivado (mismo origen).
- [x] **S4** `helmet()` (CSP delegada al Nginx de entrada — Fase 1).
- [x] **S7** _Fail-fast_ si falta `JWT_SECRET` o mide < 32 caracteres.
- [x] **S9** `ValidationError` para reglas de negocio (400 con mensaje) vs. genérico 500 + `console.error` para lo inesperado.
- [x] **Q3** `404` JSON para rutas `/api/*` desconocidas.
- [x] **C1** Cache headers en `frontend/nginx.conf` (`immutable` para `/assets/`, `no-cache` para `index.html`).
- [x] **I1** `/api/health` + `healthcheck` del backend y `depends_on: condition: service_healthy` en Nginx.

Extra incluido: `express.json({ limit: '1mb' })` (S10), validación de cantidades/precios negativos o no numéricos en venta/compra/pedido (D6), validación de cliente por tenant en venta.

### Fase 1 — Seguridad y robustez — ✅ COMPLETADA (2026-09-06)

- [x] **S3** Eliminada la cookie de token redundante (`js-cookie` desinstalado); **CSP estricta** en `nginx/nginx.conf` (`script-src 'self'`, gracias a desactivar el polyfill de modulepreload en `vite.config.js`) + `X-Frame-Options: DENY`, `Referrer-Policy`. _Pendiente (Fase 2/3): mover el token a cookie `httpOnly` con refresh tokens._
- [x] **S6** Login uniforme: siempre `401 "Credenciales inválidas"`, siempre un `bcrypt.compare` (contra un hash señuelo si el usuario no existe) para timing constante.
- [x] **A2** `authenticate` recarga el usuario de la BD en cada request, verifica `estado` y refresca `rolId`/`tipoRol` (ya no se confía en el rol del token). Expiración configurable con `JWT_EXPIRES_IN` (default 8h). _Pendiente: refresh tokens / lista de revocación._
- [x] **S10** `express.json({ limit: '1mb' })` (hecho en Fase 0).
- [x] **S11** `must_change_password` (migración `20260906120000`): el `admin` sembrado arranca obligado a cambiar la contraseña; endpoint `POST /api/auth/change-password`; pantalla `/cambiar-password` en el frontend con redirección forzada.
- [x] **S12** `src/utils/password.js`: política (mín. 8, letra + número) aplicada en alta/edición de usuarios y cambio de contraseña; `bcrypt` a **12 rondas**.
- [x] **D4** `lock: t.LOCK.UPDATE` al leer el producto antes de mover stock (venta, compra, recepción de pedido).
- [x] **D5** Validación de `tipo`/`start`/`end` del informe con zod (fechas válidas y `start <= end`).
- [x] **Q1** `asyncHandler` + `errorHandler` central (mapea `ValidationError`→400, unique→409, payload grande→413, resto→500 genérico + log).
- [x] **Q2** `validate(schema)` con zod; esquemas para auth, usuarios e informes. _Pendiente: extender a productos/ventas/compras/etc._
- [x] **Q10** El interceptor de axios solo desloguea en `401` (antes también en `403`).
- [x] **S13** `morgan` (log de acceso HTTP) + `src/utils/logger.js` (eventos JSON: `login_ok`, `login_fail`, `password_changed`, `unhandled_error`).

Verificado con la pila Docker completa: flujo de cambio de contraseña forzado E2E (navegador), revocación de sesión al desactivar usuario, CSP sin romper la SPA (0 errores de consola), cabeceras y caché correctas, rate-limit y 404 JSON.

Migración pendiente de aplicar en producción: `docker compose up -d --build` corre `20260906120000-add-must-change-password` automáticamente.

### Fase 2 — Rendimiento y caché — ✅ COMPLETADA (2026-09-08)

- [x] **P1** Migración `20260908120000-add-indexes`: 23 índices sobre FKs + compuestos `(empresaId, fecha)` en ventas/compras/pedidos. Verificado en Postgres.
- [x] **P2** `src/utils/ttlCache.js` + caché de sesión en `authenticate` (`userId → {estado, rolId, tipoRol, empresaIds}`, TTL 30 s, `AUTH_CACHE_TTL_MS`). `usuarioController` llama `invalidateUser()` al editar → un cambio de estado/rol/empresas se refleja al instante.
- [x] **P3** Paginación en `getVentas`/`getCompras`/`getPedidos`/`getUsuarios`: `?limit=&offset=` + cabecera `X-Total-Count` (expuesta vía CORS). Compatible: sin params devuelve las 200 más recientes (antes: todo). Informes acotados a una ventana máx. de 366 días.
- [x] **P4** `getUsuarios` filtra por empresa en la query (con `findAndCountAll` + `distinct`), ya no en memoria.
- [x] **C2/C3** `nginx/nginx.conf`: `Cache-Control: no-store` en `/api/`. `express.static` con `maxAge: '1y', immutable` e `index.html` con `no-cache`.
- [x] **C4** `/api/reportes/dashboard` cacheado 60 s por empresa (`DASHBOARD_CACHE_TTL_MS`); se invalida al crear venta/compra, recepción de pedido y alta/edición de producto. El dashboard también dejó de usar `EXTRACT()` sobre la columna (ahora rango `[inicioMes, inicioMesSiguiente)` → usa el índice).
- [x] **P7** `gzip` en `nginx/nginx.conf` (`gzip_proxied any`, JSON/JS/CSS/SVG). Verificado (`Content-Encoding: gzip` en los assets).
- [x] **C5/C6** TanStack Query en el frontend: `QueryClientProvider` en `main.jsx` (`staleTime` 30 s), hook `useEmpresaQuery` que mete el id de la empresa activa en la `queryKey`. Migradas `DashboardUser` (ahora usa el endpoint agregado y cacheado, 1 petición en vez de 4) e `Inventario` (query + mutation con invalidación). _Pendiente: migrar el resto de páginas al mismo patrón (mecánico)._

Extra: `createUsuario` ahora es transaccional (evita usuarios huérfanos si `setEmpresas` falla).

Verificado E2E con la pila Docker: migración de índices aplicada, dashboard renderiza datos reales cacheados (0 errores de consola), navegación entre vistas sin re-fetch, `X-Total-Count`, gzip, cabeceras de caché, ventana de informe.

### Fase 3 — Calidad y deuda técnica — ✅ COMPLETADA (2026-09-08)

- [x] **Q2 (resto)** Esquemas zod + `validate()` en productos, proveedores, clientes, servicios, ventas, compras, pedidos, empresas. Helpers `emailOpc`/`enteroOpc`/`textoOpc` para tolerar los `""` de los formularios. Los esquemas descartan campos desconocidos → protección anti mass-assignment. Controladores de catálogo adelgazados (spread validado, sin `try/catch` propio → `errorHandler`).
- [x] **S3 (completo)** Token movido a **cookie `httpOnly; SameSite=Strict`** (`cookie-parser`): inaccesible desde JavaScript, inmune a robo por XSS. `POST /api/auth/logout` la limpia. `authenticate` lee cookie o `Bearer` (scripts/tests). Frontend: `withCredentials`, sin token en el store, `logout` async. `SameSite=Strict` cubre CSRF. _Refresh tokens: no incluidos (expiración de 8h + revalidación de `estado` en cada request son suficientes para el despliegue de oficina); documentado como mejora futura si se requiere sesión persistente._
- [x] **Q4** Capa `src/services/calculo.js`: `calcularVenta` (desglose de IVA POS) y `calcularTotalCompra`, funciones puras. Los controladores de venta/compra/pedido las usan y quedaron más finos.
- [x] **Q5** Suite **Vitest**: 40 tests (`npm test`) — cálculo de venta/IVA, política de contraseñas + bcrypt 12, paginación, `TtlCache`, y todos los esquemas zod (venta/compra/pedido/informe/producto).
- [x] **Q6** Eliminados `check-db.js`, `fix-compra.js`, `fix-db.js`, `test-db.js`, `seed-pedido.js`.
- [x] **Q7** Solo Postgres: `connection.js` sin `DB_DIALECT`, `qcol` sin rama MySQL, `mysql2` desinstalado, `.env.example` limpio.
- [x] **Lint** ESLint del frontend en **0 errores** (venía de 34): catch sin binding, imports/estado sin usar, `useEffect` reordenados. Los 3 `set-state-in-effect` de las páginas POS quedan con `eslint-disable` puntual + nota (pendiente su migración a TanStack Query).
- [x] **I2/I5/I7** Backend corre como usuario `node` (no root); `mem_limit` por contenedor (db 512m, backend 384m, nginx/frontend 128m); rotación de logs de Docker (`max-size 10m`, `max-file 3`) vía ancla YAML.
- [x] **P5** `bulkCreate` de detalles en venta/compra/pedido/recepción.
- [x] **C5 (parcial)** Migradas a TanStack Query: `DashboardUser`, `Inventario`, `Clientes`, `Proveedores`, `Servicios`, `AdminUsuarios`, `DashboardAdmin`, backoffice `Empresas` y `Usuarios`. _Pendientes: `Ventas`, `Compras`, `Pedidos`, `Informes` (formularios POS complejos; su lectura de listas sigue con `useEffect`)._

Verificado E2E con la pila Docker: cookie httpOnly (login/navegación/reload/logout, invisible a JS), creación de cliente vía formulario migrado con invalidación de caché, validación zod (`""` de formularios, campos desconocidos), recálculo de `total` de venta tras el refactor a servicio, todas las páginas cargan sin errores de consola, 40 tests en verde, contenedor backend como `node`.

### Deuda restante (Fase 4, opcional)

- Migrar `Ventas`/`Compras`/`Pedidos`/`Informes` a TanStack Query.
- Refresh tokens si se necesita sesión más larga sin re-login.
- Tests de integración HTTP (supertest contra un Postgres de test).
- `getVentas` incluye `Empresa` (atributos limitados) — se puede quitar si el frontend no lo usa.

---

## 10. Anexo — Snippets de referencia para la Fase 0

**S1 — rate limit del login**
```js
// backend/src/middlewares/rateLimit.js
const rateLimit = require('express-rate-limit');
exports.loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, espera unos minutos.' },
});
// authRoutes.js
router.post('/login', loginLimiter, authController.login);
```

**S5 + S4 + S10 — arranque endurecido**
```js
// index.js
const helmet = require('helmet');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET ausente o demasiado corto. Abortando.');
  process.exit(1);
}
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '100kb' }));
```

**D1 — total server-side (venta)**
```js
const totalCalculado = detallesProcesados.reduce(
  (acc, d) => acc + d.subtotal_bruto + d.valor_iva, 0
) - (Number(descuento_global) || 0);
// usar totalCalculado en Venta.create, ignorar req.body.total
```

**A3 — roles asignables**
```js
const ROLES_ASIGNABLES = {
  BACKOFFICE_ADMIN: [1, 2, 3],
  FRONT_ADMIN: [2, 3], // nunca BACKOFFICE_ADMIN
};
if (!ROLES_ASIGNABLES[req.tipoRol]?.includes(Number(rolId))) {
  return res.status(403).json({ error: 'Rol no permitido' });
}
```

**Q3 — 404 JSON para API**
```js
// después de montar todas las rutas /api, antes de express.static
app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));
```
