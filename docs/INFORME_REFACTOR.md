# Informe de refactorización — AppInventario

**Última actualización:** 2026-09-09 (análisis #2 + Fases 5, 6, 7 y 8 completadas — refactor cerrado)
**Alcance:** backend (Express + Sequelize + PostgreSQL 16), frontend (React 19 + Vite + TanStack Query), infraestructura Docker.
**Historial:** primer informe 2026-09-06 → Fases 0–4 implementadas y verificadas E2E → este documento re-audita el estado real y define las Fases 5–8.

---

## 1. Resumen ejecutivo

Las Fases 0–4 cerraron casi toda la deuda de seguridad, rendimiento y calidad del
primer informe: hoy el sistema tiene autenticación por cookie `httpOnly`, CSP
estricta, rate-limiting, validación `zod` en todos los endpoints, índices de BD,
caché de sesión y dashboard, 53 tests unitarios y contenedores endurecidos.

Este segundo análisis, centrado en las zonas que la revisión original **no cubrió
a fondo** (flujos POS, dinero extremo a extremo, autorización por módulos,
generación de PDF, zonas horarias), encontró:

| Severidad | Nuevos | Estado |
|---|---|---|
| 🔴 Crítico | 1 | **N1** descuento global (%/pesos) → ✅ **corregido (Fase 5)** |
| 🟠 Alto | 3 | **N2**, **N4** → ✅ **Fase 5** · **N3** gating por módulos → ✅ **Fase 6** |
| 🟡 Medio | 8 | **N6** → ✅ Fase 5 · **N9, N10, N14** → ✅ Fase 6 · **N5, N7, N8, N11, N12** → ✅ Fase 7 |
| 🔵 Bajo | 6 | **N15, N16 (base), N20** → ✅ Fases 6–7 · **N13, N17, N19** → ✅ Fase 8 |

**Plan:** Fases **5–8** en la sección 5.
**Fases 5, 6, 7 y 8 — ✅ completadas el 2026-09-09. Refactor cerrado; sin hallazgos abiertos.**
- Fase 5: el POS cobra bien el descuento global (%), precio de línea validado, cantidades fraccionarias.
- Fase 6: autorización por módulo en el backend, rutas del frontend gated, sesiones revocables.
- Fase 7: zona horaria (`TZ=America/Bogota`), informes limpios y cacheados, catálogos validados,
  N+1 de compra eliminado, importes a `DECIMAL(14,2)`.
- Fase 8: `Ventas`, `Compras`, `Pedidos` e `Informes` migrados a `useEmpresaQuery` + `useMutation`
  (sin `eslint-disable react-hooks/set-state-in-effect`); los `alert()` de los POS sustituidos por
  `FormError` + `apiError`; `getVentas` ya no incluye `Empresa` (N13); UI "cerrar mis otras sesiones"
  en `CambiarPassword`; `eslint frontend/src` a 0 errores.
- Suite de integración: **23 tests** (`npm run test:integration`); **62 unitarios**; E2E Docker verificado.

---

## 2. Estado de los hallazgos del primer informe

| Id | Área | Estado | Nota |
|---|---|---|---|
| S1 rate-limit login | Seguridad | ✅ | `express-rate-limit` 5/15 min + límite global |
| S2 volcado a disco | Seguridad | ✅ | eliminado |
| S3 token en JS | Seguridad | ✅ | cookie `httpOnly; SameSite=Strict`; sin refresh tokens (ver N-B) |
| S4 helmet / CSP | Seguridad | ✅ | `helmet` + CSP estricta en Nginx |
| S5 CORS abierto | Seguridad | ✅ | restringido a `FRONTEND_URL` |
| S6 enumeración login | Seguridad | ✅ | `401` uniforme + `bcrypt.compare` señuelo |
| S7 JWT_SECRET sin validar | Seguridad | ✅ | fail-fast al arrancar |
| S8 header laxo | Seguridad | ✅ | exige `Bearer` o cookie; `401` correcto |
| S9 fuga de `error.message` | Seguridad | ✅ | `ValidationError` vs. 500 genérico + log |
| S10 `express.json` sin límite | Seguridad | ✅ | `limit: '1mb'` |
| S11 contraseña admin por defecto | Seguridad | ✅ | `must_change_password` + pantalla forzada |
| S12 política de contraseñas | Seguridad | ✅ | mín. 8 + letra + número; bcrypt 12 |
| S13 logs / auditoría | Seguridad | ✅ | `morgan` + `utils/logger.js` (eventos JSON) |
| S14 healthcheck | Infra | ✅ | `/api/health` + `depends_on: service_healthy` |
| A1 fuga cross-tenant servicios | Multi-tenant | ✅ | guard `req.empresaId` en todas las rutas de tenant |
| A2 rol/permiso congelado en JWT | Multi-tenant | ✅ | `authenticate` revalida `estado`/rol cada request + **tabla `sesiones` con revocación** (Fase 6): logout, "cerrar todas mis sesiones", el cambio de contraseña cierra las demás. Sin refresh tokens (no aportan lo suficiente para oficina). |
| A3 escalada de rol | Multi-tenant | ✅ | whitelist `ROLES_ASIGNABLES` |
| A4 reglas de edición de usuarios | Multi-tenant | ✅ | no editar rol ≥, no autodesactivación |
| A5 colisión de `username` | Multi-tenant | ✅ | `errorHandler` mapea unique → 409 |
| A6 `modulosIds` sin validar | Multi-tenant | ✅ | `validarModulos()` en `empresaController` |
| D1 `total` del cliente | Integridad | ✅ | recalculado server-side (`services/calculo.js`) |
| D2 tenant de ids en compra/pedido | Integridad | ✅ | validado; `checkInPedido` ya no omite en silencio |
| D3 estado de `Pedido` | Integridad | ✅ | `PENDIENTE`/`COMPLETADO` coherentes |
| D4 carrera de stock | Integridad | ✅ | `lock: t.LOCK.UPDATE` en venta/compra/recepción |
| D5 fechas de informe | Integridad | ✅ | `zod`: fechas válidas, `start ≤ end`, ventana ≤ 366 d |
| D6 cantidades sin validar | Integridad | ✅ | `zod` exige `> 0`; columnas `cantidad`/`stock_actual` a `DECIMAL(12,3)` (Fase 5/N4) — soportan fracciones (kg/L) |
| D7 ramas MySQL | Calidad | ✅ | solo Postgres; `mysql2` desinstalado |
| P1 índices de FK | Rendimiento | ✅ | migración `20260908120000` (23 índices) |
| P2 query por request | Rendimiento | ✅ | `TtlCache` de perfil de sesión (30 s) + `invalidateUser` |
| P3 sin paginación | Rendimiento | ✅ | `?limit&offset` + `X-Total-Count` (default 200) |
| P4 `getUsuarios` filtra en memoria | Rendimiento | ✅ | `findAndCountAll` + `where` en la query |
| P5 bucles `await` | Rendimiento | ✅ | `bulkCreate` de detalles |
| P6 `getVentas` incluye `Empresa` | Rendimiento | ✅ | quitado en Fase 8 (N13); el PDF de una venta usa `GET /api/ventas/:id` |
| P7 sin compresión | Rendimiento | ✅ | `gzip` en Nginx |
| C1 caché de assets | Caché | ✅ | `immutable` + `index.html` `no-cache` |
| C2 caché del Nginx de entrada | Caché | ✅ | `no-store` en `/api/` |
| C3 `express.static` sin `maxAge` | Caché | ✅ | `maxAge: '1y', immutable` |
| C4 caché de dashboard/informes | Caché | ✅ | dashboard y **informes** cacheados 60 s + invalidación por venta/compra (Fase 7/N8) |
| C5 TanStack Query | Caché | ✅ | todas las páginas de datos migradas; `Ventas`/`Compras`/`Pedidos`/`Informes` a `useEmpresaQuery` + `useMutation` en Fase 8 |
| C6 refetch al cambiar de empresa | Caché | ✅ | `useEmpresaQuery` mete `empresaId` en la `queryKey` |
| I1 healthcheck backend | Infra | ✅ | hecho |
| I2 contenedor como root | Infra | ✅ | `USER node` |
| I5 límites de recursos | Infra | ✅ | `mem_limit` por servicio |
| I6 `authenticate()` duplicado | Infra | ✅ | `config/database.js` ya no conecta al importar (Fase 6/N20) |
| I7 rotación de logs Docker | Infra | ✅ | `max-size 10m`, `max-file 3` |
| Q1 `try/catch` repetido | Calidad | ✅ | `asyncHandler` + `errorHandler`; los `try/catch` que quedan en venta/compra/pedido son por la transacción (rollback) |
| Q2 validación de entrada | Calidad | ✅ | `zod` + `validate()` en todos los endpoints |
| Q3 404 JSON para `/api` | Calidad | ✅ | hecho |
| Q4 lógica de negocio en controladores | Calidad | ✅ | `services/calculo.js`, `services/catalogos.js` |
| Q5 tests | Calidad | ✅ | 62 unitarios + 23 de integración HTTP (`npm run test:integration`, requiere docker db) |
| Q6 scripts de debug | Calidad | ✅ | eliminados |
| Q7 ramas MySQL | Calidad | ✅ | eliminadas |
| Q10 interceptor axios en 403 | Calidad | ✅ | solo desloguea en `401` |

---

## 3. Hallazgos nuevos (2026-09-09)

### 🔴 N1 — El descuento global de la venta se cobra por un importe distinto al de la pantalla — ✅ CORREGIDO (Fase 5)

**Archivos:** [`Ventas.jsx`](../frontend/src/pages/app/Ventas.jsx#L162-L166) ·
[`services/calculo.js`](../backend/src/services/calculo.js#L44-L47) ·
[`generateInvoicePDF.js`](../frontend/src/utils/generateInvoicePDF.js#L237-L239)

El frontend maneja `descuento_global` como **porcentaje**:

```js
// Ventas.jsx
const getTotal = () => { const sub = getSubtotal(); return sub - (sub * (globalDiscount / 100)); };
// <input min="0" max="100" ... /> con etiqueta "%" y botones 5% / 10% / 15%
// submit:  descuento_global: globalDiscount || 0     // manda "10", el porcentaje
```

El backend lo resta como **monto absoluto en pesos**:

```js
// services/calculo.js  (calcularVenta)
const descuento = round2(Math.max(0, Number(descuentoGlobal) || 0));
const total = round2(subtotalBruto + totalImpuestos - descuento);   // resta 10, no 10%
```

El PDF vuelve a tratarlo como porcentaje y **calcula un tercer número**:

```js
// generateInvoicePDF.js
const globalDiscountPct = Number(venta.descuento_global || 0);
const globalDiscountAmount = subtotalAtSale * (globalDiscountPct / 100);
// imprime  "Dcto. Global (10%): -$X"  y aparte  "Total: formatCOP(venta.total)"
```

**Consecuencia concreta** — venta de $100.000 con "10 % de descuento global":

| | Importe |
|---|---|
| Pantalla de caja (`getTotal`) | **$90.000** |
| Guardado en BD y cobrado (`venta.total`) | **$99.990** (100.000 − 10) |
| PDF de la factura | muestra "Dcto. Global (10 %): −$10.000" pero el total impreso es **$99.990** |

El cliente paga un importe que no coincide con ninguna de las tres vistas, y la
factura es internamente contradictoria. El campo `Venta.descuento_global` guarda
`10` sin unidad definida, y `Venta.total_descuentos` (que debería llevar el monto)
**nunca se escribe**.

**✅ Corregido:** `calcularVenta` (servicio) trata `descuento_global` como
**porcentaje 0–100** (`clampPct`), aplica `total = (subtotal + iva) * (1 - pct/100)`,
guarda el `pct` en `descuento_global` y el monto (descuento por línea + global) en
`total_descuentos`. `ventaCreate` (zod) valida `0 ≤ pct ≤ 100`. El PDF ya asumía
porcentaje → ahora los tres números coinciden. Verificado E2E: venta de $100.000
con 10 % → pantalla, BD y PDF muestran **$90.000**. Tests: `calculo.test.js` (5 casos
nuevos) + `tests/integration/venta.test.js`.
> Nota: las ventas creadas ANTES del fix tienen `descuento_global` con un valor
> en pesos (histórico); no se migran retroactivamente.

---

### 🟠 N2 — El precio unitario de cada línea de venta lo fija el cliente sin control — ✅ CORREGIDO (Fase 5)

**Archivo:** [`transaccionSchemas.js`](../backend/src/schemas/transaccionSchemas.js#L20-L30) · [`ventaController.js`](../backend/src/controllers/ventaController.js#L83)

`ventaDetalle.precio_unitario` es `dinero` (`z.coerce.number().nonnegative()`): sin
tope y **sin relación con el precio real del producto**. `createVenta` usa
`Number(item.precio_unitario)` tal cual. Un `FRONT_USER` (o un cliente HTTP
manipulado) puede facturar cualquier producto a **$0** o a un valor arbitrario.

El POS legítimamente permite override manual de precio (campo editable + botón de
descuento por línea), así que no se puede prohibir del todo; pero hoy no hay:
- piso configurable (p.ej. no por debajo del X % del `precio_base`),
- registro de quién autorizó el precio especial,
- ni siquiera la garantía de que `precio_unitario ≤ precio_base` (se guarda
  `precio_base` pero no se valida contra él).

**✅ Corregido:** `createVenta` toma `precioBase` de `Producto.precio_unitario` /
`Servicio.precio` **en la BD** (ignora el `precio_base` del request), y valida
`0 ≤ precio_unitario ≤ precioBase`. Piso configurable con
`VENTA_DESCUENTO_LINEA_MAX_PCT` (default 100 = se puede llegar a $0; poner p.ej.
50 para no bajar del 50 % del precio de lista). Verificado E2E: precio de línea
por encima de la lista → `400` con mensaje claro.

---

### 🟠 N3 — La autorización por módulos vive solo en el frontend — ✅ CORREGIDO (Fase 6)

**Archivos:** [`FrontLayout.jsx`](../frontend/src/layouts/FrontLayout.jsx) · todas las rutas de `/api/*`

`FrontLayout` filtra el menú lateral por `activeEmpresa.modulos`, pero
`GET/POST /api/ventas`, `/api/compras`, `/api/pedidos`, `/api/informes`, etc.
**solo comprueban `req.empresaId`**, nunca si la empresa tiene contratado ese
módulo. Un `FRONT_USER` con sesión válida puede llamar por HTTP a cualquier
endpoint de su empresa aunque el módulo esté desactivado (menú oculto ≠ acceso
denegado).

**Fix (Fase 6):** middleware `requireModulo('VENTAS')` que consulta
`empresas_modulos` (cacheado junto al perfil de sesión) y devuelve `403` si falta.
Aplicarlo en las rutas correspondientes.

---

### 🟠 N4 — Cantidades fraccionarias: `zod` las acepta, la columna es INTEGER — ✅ CORREGIDO (Fase 5)

**Archivos:** [`transaccionSchemas.js`](../backend/src/schemas/transaccionSchemas.js#L5) ·
[`VentaDetalle.js`](../backend/src/models/VentaDetalle.js#L23) · [`CompraDetalle` migración]

`cantidad = z.coerce.number().positive()` (sin `.int()`). Pero `ventas_detalles.cantidad`,
`compras_detalles.cantidad`, `pedidos_detalles.cantidad_pedida` y `productos.stock_actual`
son **`INTEGER`**. Los inputs de cantidad de Compras y Pedidos son
`<input type="number">` de texto libre (`min="1"` no se valida en JS).

Enviar `cantidad: 2.5`:
- `calcularVenta` calcula bien el subtotal con 2.5,
- `VentaDetalle.bulkCreate({ cantidad: 2.5 })` → Postgres rechaza (`invalid input
  syntax for type integer`) → **500**, o Sequelize lo trunca según versión,
- el stock queda en un valor truncado.

Además `unidad_medida` ya ofrece **KGM / LTR / MTK** en los formularios → el
negocio probablemente **quiere** vender en fracciones.

**✅ Corregido — Opción A (fracciones), decisión del usuario ("mixto"):**
migración `20260910120000-cantidades-decimales` — `cantidad` (ventas_detalles,
compras_detalles), `cantidad_pedida` (pedidos_detalles) y `stock_actual`
(productos) pasan de `INTEGER` a **`DECIMAL(12,3)`** (cast sin pérdida). Modelos
actualizados. `zod` `cantidad` redondea a 3 decimales. Frontend: helper
`formatCantidad()` (quita ceros decimales: "97.750" → "97,75") aplicado a
Inventario, Ventas, Compras, Pedidos y el PDF; `Number()` explícito donde había
concatenación de strings al mover stock. Verificado E2E: venta de 2.5 kg,
compra de 1.25 kg, stock `100 → 96.5 → 97.75`.

---

### 🟡 N5 — Zona horaria: informes y dashboard usan la hora del contenedor (UTC) — ✅ CORREGIDO (Fase 7)

**Archivos:** [`informeController.js`](../backend/src/controllers/informeController.js#L21-L26) ·
[`reporteController.js`](../backend/src/controllers/reporteController.js#L20-L24)

- `informeController`: `endDate.setHours(23,59,59,999)` se ejecuta en la TZ del
  proceso (**UTC** en el contenedor).
- `reporteController`: `monthStart/monthEnd` con `new Date(y, m, 1)` — también UTC.

Para un usuario en Colombia (**UTC−5**), las ventas de la franja 19:00–24:00 hora
local caen en el **día siguiente** (o el mes siguiente en el borde) a efectos del
informe. Los totales del dashboard "mes en curso" y los rangos de los informes
quedan desfasados hasta 5 h en los límites.

**Fix (Fase 7):** `TZ=America/Bogota` en el contenedor `backend` (compose) +
repasar todos los `new Date(...)` que construyen límites de fecha. Confirmar que
las columnas `DATE` se leen/escriben con la TZ esperada.

---

### 🟡 N6 — `descuento_global` DECIMAL(5,2) y `total_descuentos` sin usar — ✅ CORREGIDO (Fase 5)

`empresas`… perdón, `ventas.descuento_global` es `DECIMAL(5,2)` → tope **999.99**.
Si N1 se corrige como porcentaje, el tipo aguanta (`10.00`); si se corrige como
monto, es inservible para pesos. `ventas.total_descuentos` `DECIMAL(10,2)` existe
en modelo y migración pero **nunca se escribe** — debería llevar el monto de
descuento (ítems + global) para la factura y los informes.

**✅ Corregido:** `descuento_global` queda como porcentaje → `DECIMAL(5,2)` aguanta
(`100.00`), sin migración. `createVenta` ya escribe `total_descuentos` con el monto
total (línea + global). _Ampliar los `DECIMAL(10,2)` de importes a `DECIMAL(12,2)`
sigue en Fase 7 (N15)._

---

### 🟡 N7 — `getVentaById` con `try/catch` propio en vez de `errorHandler` — ✅ CORREGIDO (Fase 7)

[`ventaController.js`](../backend/src/controllers/ventaController.js#L29-L46) — a
diferencia del resto, hace `console.error` + `res.status(500)` en el `catch`, sin
pasar el error al middleware central (no se registra como `unhandled_error` JSON,
no aplica el mapeo de errores de Sequelize). Es una lectura simple sin
transacción: no necesita `try/catch`.

**Fix (Fase 7):** quitar el `try/catch`; dejar que `asyncHandler` + `errorHandler`
lo gestionen.

---

### 🟡 N8 — `informeController` con validación redundante y sin `errorHandler` — ✅ CORREGIDO (Fase 7)

[`informeController.js`](../backend/src/controllers/informeController.js#L14-L107) —
el `if (!tipo || !start || !end)` es **código muerto** (la ruta ya valida con
`informeQuery`), y el `try/catch` propio evita el `errorHandler`. Además el
endpoint **no está cacheado** (C4 quedó a medias): recalcula agregados SQL en cada
visita.

**Fix (Fase 7):** limpiar; añadir caché TTL por `(empresaId, tipo, start, end)`
como el dashboard.

---

### 🟡 N9 — La ruta `/app/admin` es accesible para `FRONT_USER` — ✅ CORREGIDO (Fase 6)

[`App.jsx`](../frontend/src/App.jsx#L64-L79) — `ProtectedRoute` de `/app/*` admite
`FRONT_ADMIN` **y** `FRONT_USER`, incluida la ruta hija `admin` (gestión de
usuarios). El backend la protege (`allowAdmins` → `403`), así que un `FRONT_USER`
que navega a `/app/admin` ve la página cargar y fallar. Defensa en profundidad y
UX: falta un guard por rol en la ruta y ocultar la entrada del menú (hoy el menú
sí la oculta, pero la ruta directa no).

**Fix (Fase 6):** `ProtectedRoute allowedRoles={['FRONT_ADMIN']}` en `admin`;
además gate del menú/rutas de `/app/*` por módulo contratado.

---

### 🟡 N10 — La recepción de pedido no deja rastro ni valida contra el pedido — ✅ CORREGIDO (Fase 6)

[`pedidoController.checkInPedido`](../backend/src/controllers/pedidoController.js#L82-L145) —
crea una `Compra` a partir del pedido pero:
- `compras` no tiene columna `pedidoId` → no hay trazabilidad "esta compra vino
  del pedido X";
- `detalles_recibidos` no se compara con las líneas del pedido → se pueden
  "recibir" productos que no estaban pedidos, o cantidades arbitrarias.

**Fix (Fase 6):** columna `compras.pedidoId` (FK opcional) + validar que cada
`productoId` recibido esté en el pedido.

---

### 🟡 N11 — Endpoints de catálogos sin validación de query — ✅ CORREGIDO (Fase 7)

[`catalogoController.js`](../backend/src/controllers/catalogoController.js) —
`GET /api/catalogos/ciiu?q=&limit=` y `?departamento=` no pasan por `zod`;
`limit` se hace `Number(limit)` sin tope. Los datos están acotados (500 CIIU,
1123 municipios) así que el impacto es bajo, pero rompe la consistencia
"todo validado" y `getMunicipios` sin `departamento` devuelve las 1123 filas.

**Fix (Fase 7):** esquema `zod` para la query; `limit` acotado (p.ej. ≤ 100);
`getMunicipios` exigir `departamento` o paginar.

---

### 🟡 N12 — N+1 en `createCompra` — ✅ CORREGIDO (Fase 7)

[`compraController.js`](../backend/src/controllers/compraController.js#L36-L73) —
dos bucles seguidos sobre `detalles`, cada uno con un `Producto.findOne`/`findByPk`
por línea (validación de tenant + lock). Una compra de 20 líneas = 40 queries.

**Fix (Fase 7):** un `Producto.findAll({ where: { id: [...ids], empresaId }, lock })`
y trabajar con un `Map`.

---

### 🔵 N13 — `getVentas` sigue incluyendo `Empresa` — ✅ CORREGIDO (Fase 8)

(P6 del primer informe, no cerrado.) Cada venta del listado traía
`Empresa: { nombre, nit, contacto }` — redundante, la empresa activa ya se conoce.
`getVentaById` sí lo necesita (para el PDF). **Fix (Fase 8):** se quitó el `include` de
`getVentas`; el frontend descarga el PDF de una venta concreta con `GET /api/ventas/:id`
(`descargarPDF(ventaId)` en `Ventas.jsx`), que sí trae la empresa.

### 🔵 N14 — Empresa `FACTURACION_ELECTRONICA` sin campos DIAN obligatorios — ✅ CORREGIDO (Fase 6)

[`empresaSchemas.js`](../backend/src/schemas/empresaSchemas.js) — se puede crear una
empresa con `tipo_empresa: 'FACTURACION_ELECTRONICA'` sin `resolucion_numero`,
`prefijo_facturacion`, `rango_*` ni `clave_tecnica`. Baja prioridad (la FE no está
integrada). **Fix (Fase 6):** validación condicional (`superRefine`) según `tipo_empresa`.

### 🔵 N15 — `Venta.total` DECIMAL(10,2) → tope ~$100 M COP — ✅ CORREGIDO (Fase 7)

Una factura B2B grande podría superar `99 999 999.99`. `DECIMAL(12,2)` da margen.
**Fix (Fase 7):** ampliar el tipo de las columnas de importe en ventas/compras/pedidos.

### 🔵 N16 — Tests de integración HTTP — 🟡 arrancado (Fase 5)

Antes: 53 tests de lógica pura. **Fase 5** añadió la infraestructura
(`src/app.js`, `npm run test:integration`, base `appinventario_test`) y 8 tests
del flujo de venta/compra. **Pendiente (Fase 7):** ampliar a auth completo
(rate-limit, cambio de contraseña), escalada de rol, gating por módulo (Fase 6),
recepción de pedido, informes; y correr integración en CI.

### 🔵 N-B — Deuda arrastrada del backlog

- **N17** Migrar `Ventas`/`Compras`/`Pedidos`/`Informes` a TanStack Query (hoy
  `useEffect` + `eslint-disable react-hooks/set-state-in-effect`). → ✅ Fase 8.
- **N18** Refresh tokens / lista de revocación (A2 quedó a medias). → ✅ Fase 6.
- **N19** POS con 19 `alert()` en vez de `FormError`/`apiError` (ya adoptados en las
  otras 7 páginas). → ✅ Fase 8.
- **N20** `I6` — `sequelize.authenticate()` duplicado (`config/database.js` +
  `index.js`); cosmético. → ✅ Fase 6.

---

## 4. Historial de fases completadas (0–4)

Registro resumido; el detalle está en el git log (`99754fb`, `e24acc4`, `78d908b`).

### Fase 0 — Urgente (2026-09-06) ✅
Rate-limit login · quitar volcado a disco · guard `empresaId` en servicios · `total`
server-side · validar tenant de ids en compra/pedido · CORS restringido · `helmet` ·
fail-fast `JWT_SECRET` · `ValidationError` · 404 JSON · cache headers frontend ·
healthcheck backend + `depends_on: service_healthy`.

### Fase 1 — Seguridad y robustez (2026-09-06) ✅
Cookie de token redundante eliminada + **CSP estricta** · login anti-enumeración ·
`authenticate` revalida `estado`/rol en cada request · `must_change_password` (migr.
`20260906120000`) + pantalla forzada · política de contraseñas + bcrypt 12 · locks
`FOR UPDATE` de stock · validación `zod` de fechas de informe · `asyncHandler` +
`errorHandler` central · `validate()` con `zod` (auth/usuarios/informes) · interceptor
axios solo desloguea en `401` · `morgan` + `utils/logger.js`.

### Fase 2 — Rendimiento y caché (2026-09-08) ✅
Migración de **23 índices** (`20260908120000`) · `TtlCache` de perfil de sesión (30 s)
+ `invalidateUser` · paginación `?limit&offset` + `X-Total-Count` · `getUsuarios`
filtra en la query · `no-store` en `/api/` + `express.static` con `maxAge` · dashboard
cacheado 60 s + invalidación por escritura · `gzip` en Nginx · **TanStack Query**
(`QueryClientProvider`, `useEmpresaQuery`) — `DashboardUser` e `Inventario` migradas ·
`createUsuario` transaccional.

### Fase 3 — Calidad y deuda técnica (2026-09-08) ✅
`zod` + `validate()` en **todos** los endpoints (con helpers `emailOpc`/`enteroOpc`/
`optionalId`/`optionalText` para los `""`/`null` de los formularios; descarte de
campos desconocidos = anti mass-assignment) · **token en cookie `httpOnly; SameSite=Strict`**
+ `POST /api/auth/logout` · `services/calculo.js` (`calcularVenta`, `calcularTotalCompra`) ·
**Vitest** (42 tests) · scripts de debug eliminados · solo Postgres (`mysql2` fuera) ·
**ESLint frontend en 0 errores** · contenedor backend como `node` + `mem_limit` +
rotación de logs · `bulkCreate` de detalles · 9 páginas migradas a TanStack Query.
> Regresión encontrada y corregida en el cierre: los esquemas `zod` rechazaban el
> `null` explícito del POS (`servicioId:null`, `productoId:null`) → habría roto todas
> las ventas y compras. Corregido con `optionalId`/`optionalText` + 2 tests.

### Fase 4 — Alta de inquilinos y catálogos DANE/CIIU (2026-09-09) ✅
- Bug de alta (500 opaco por módulos hardcodeados 6–8 inexistentes) → seeder
  `20260909120200` + `GET /api/modulos` + `validarModulos()` + `errorHandler` mapea
  `SequelizeForeignKeyConstraintError` → 400.
- `components/FormError.jsx` + `utils/apiError.js` → banners de error reales en
  `Empresas`, `Clientes`, `Proveedores`, `Servicios`, `Inventario`, backoffice
  `Usuarios`, `AdminUsuarios` (los 3 POS siguen con `alert` → N19).
- Columna `empresas.tipo_empresa` (`SIMPLE` | `FACTURACION_ELECTRONICA`) + selector
  de tipo en el alta con formulario reducido para SIMPLE.
- Catálogos DANE/CIIU: migración `20260909120000` (`departamentos` 33, `municipios`
  1123, `actividades_ciiu` ~500) + datos vendorizados (`seeders/data/`, ver
  `FUENTES.md`) + `services/catalogos.js` (memoria) + `GET /api/catalogos/{departamentos,municipios,ciiu}`.
- `components/SearchableSelect.jsx` + `DaneLocationFields.jsx` (sin dependencias) en
  Empresas / Clientes / Proveedores (a `proveedores` se le añadieron `departamento_dane`/`municipio_dane`).
- DV automático del NIT (módulo 11 DIAN) en `utils/nit.js` (front y back).
- Favicon reemplazado (icono *Boxes*).
- +11 tests (`nit.test.js`, `catalogos.test.js`) → **53 en verde**.

---

## 5. Plan de corrección — Fases 5 a 8

### Fase 5 — Dinero e integridad de la venta — ✅ COMPLETADA (2026-09-09)

- [x] **N1** `descuento_global` = **porcentaje 0–100** en `services/calculo.js`
      (`clampPct`) + `total_descuentos` poblado + `zod` valida `[0,100]`. PDF
      coherente. Verificado E2E (UI, BD y PDF muestran $90.000 para 10 % sobre $100.000).
- [x] **N2** `precioBase` de la BD, no del request; `0 ≤ precio_unitario ≤ precioBase`;
      piso configurable `VENTA_DESCUENTO_LINEA_MAX_PCT`.
- [x] **N4** Migración `20260910120000` → `cantidad`/`stock_actual` a `DECIMAL(12,3)`;
      modelos + `zod` + `formatCantidad()` en el frontend + PDF.
- [x] **N6** `descuento_global` sigue `DECIMAL(5,2)` (aguanta 0–100); `total_descuentos` poblado.
- [x] **N16 (arranque)** Suite de integración `supertest` + Postgres de test:
      `src/index.js` dividido en `src/app.js` (app) + `src/index.js` (listen);
      `npm run test:integration` (necesita `docker compose up -d db`, usa la base
      `appinventario_test`). **8 tests**: descuento %, precio de línea fuera de rango,
      `precio_base` de la BD, cantidades fraccionarias (venta y compra), stock
      insuficiente, aislamiento cross-tenant, auth/empresa. Total: **61 unitarios + 8 integración**.

**Extra:** corregida la concatenación de strings al mover stock (`Number(stock) + Number(cantidad)`)
que la migración a DECIMAL habría roto en `compra`/`checkInPedido`.

### Fase 6 — Autorización y multi-tenant completo — ✅ COMPLETADA (2026-09-09)

- [x] **N3** Middleware `requireModulo('<Codigo>')` en `middlewares/auth.js`. El
      perfil de sesión cacheado ahora incluye `modulosPorEmpresa`; `requireEmpresa`
      expone `req.empresaModulos` (Set). Montado en las 8 rutas de tenant
      (`productos`→Inventario, `ventas`→Ventas, …). `updateEmpresa` con `modulosIds`
      llama `invalidateAllProfiles()`. Verificado E2E: empresa sin "Compras" →
      `GET /api/compras` = 403 `El módulo "Compras" no está activo`.
- [x] **N9** Frontend: `SoloFrontAdmin` en `/app/admin` (un `FRONT_USER` va a `/app`);
      `ModuloRoute` en las 8 rutas de módulo (redirige a `/app` si la empresa no lo
      tiene). Verificado: `f6user` (FRONT_USER) en `/app/admin` y `/app/compras` →
      redirige; menú lateral solo con los módulos contratados.
      Extra: `DashboardUser` no consulta `/pedidos` si falta el módulo; los POS usan
      `Promise.allSettled` y toleran 403 individuales (0 errores de consola).
- [x] **N18 / A2** Tabla `sesiones` (migración `20260911120000`) + `services/sessions.js`:
      cada login crea una fila con `jti` (incluido en el JWT); `authenticate` valida
      que la sesión siga vigente (existe / no revocada / no expirada), cacheado 30 s.
      Endpoints nuevos: `POST /api/auth/logout` (revoca la actual),
      `POST /api/auth/logout-all?mantener_actual=` (todas), `GET /api/auth/sessions`
      (lista). Cambiar la contraseña revoca las demás sesiones. Los tokens viejos
      (sin `jti`) se rechazan → re-login. _Se mantiene la expiración de 8 h; no se
      añadieron refresh tokens (no aportan lo suficiente para el despliegue de oficina)._
- [x] **N10** Columna `compras.pedidoId` (FK opcional, `SET NULL`) + asociación.
      `checkInPedido` la rellena y **rechaza productos que no estaban en el pedido**.
      Verificado E2E.
- [x] **N14** `empresaCreate` con `superRefine`: exige `resolucion_numero`,
      `prefijo_facturacion`, `rango_desde`, `rango_hasta`, `clave_tecnica` cuando
      `tipo_empresa === 'FACTURACION_ELECTRONICA'`. (El update no re-valida.)
- [x] **N20 / I6** `config/database.js` ya no llama a `authenticate()` al importar
      (evitaba abrir conexiones en tests/scripts). El chequeo lo hace solo `index.js`.

**Tests:** +8 de integración (gating por módulo, FRONT_USER en `/usuarios`, logout /
logout-all / sessions / cambio de contraseña, recepción de pedido con `pedidoId`).
`loginLimiter`/`apiLimiter` se saltan en `NODE_ENV=test`. Total: **62 unitarios + 16 integración**.

### Fase 7 — Correctness de informes, robustez y tests — ✅ COMPLETADA (2026-09-09)

- [x] **N5** `ENV TZ=America/Bogota` + `apk add tzdata` en el `Dockerfile` del
      backend; `TZ` sobreescribible en `docker-compose.yml`. `informeController`
      interpreta `start`/`end` (formato `YYYY-MM-DD`, exigido por zod) como hora
      **local** (`${start}T00:00:00` .. `${end}T23:59:59.999`). El dashboard ya
      calculaba el mes con `new Date(y, m, 1)` → ahora en hora local. Verificado
      E2E: contenedor en `GMT-0500`, venta de hoy aparece en el informe de hoy.
- [x] **N8** `informeController` reescrito: sin validación muerta, sin `try/catch`
      propio (→ `errorHandler`), y **cacheado 60 s** por `(empresaId, tipo, start, end)`
      con `Map<empresaId, TtlCache>`; `invalidateInforme(empresaId)` se llama al
      crear venta/compra/recepción (junto a `invalidateDashboard`). Cierra **C4**.
      Verificado: 2ª llamada = 1.7 ms; nueva venta → el informe la incluye.
- [x] **N7** `getVentaById` sin `try/catch` (lo gestiona `asyncHandler` + `errorHandler`).
- [x] **N11** `catalogoQuerySchemas.js` + `validate({ query })` en
      `/api/catalogos/municipios` (`departamento` de 1–2 dígitos) y `/ciiu`
      (`q` ≤ 100, `limit` 1–100). Verificado: `?limit=99999` → 400.
- [x] **N12** `createCompra`: un solo `Producto.findAll({ where: { id: [...] }, lock })`
      + `Map`, acumulando cantidades por producto. Elimina el doble bucle N+1.
- [x] **N15** Migración `20260912120000` — 14 columnas de importe de `DECIMAL(10,2)`
      → **`DECIMAL(14,2)`** (~$1 billón). Modelos actualizados. `porcentaje_iva` y
      `descuento_global` quedan en `DECIMAL(5,2)` (son %). Verificado: compra de $800 M.
- [x] **N16** +7 tests de integración (aislamiento multi-tenant, escalada de rol → 403,
      `descuento_global` fuera de rango, informe con TZ, fecha mal formada, `limit` de
      catálogo). `ForbiddenError` (subclase de `ValidationError`, status 403) para las
      denegaciones de autorización. **Total: 62 unitarios + 23 integración.**

**Extra:** `config/database.js` ya no llama `authenticate()` al importar (era **N20/I6**,
lo adelantó la Fase 6).

### Fase 8 — Frontend: cerrar TanStack Query y pulido — ✅ COMPLETADA (2026-09-09)

- [x] **N17 / C5** `Ventas`, `Compras`, `Pedidos` e `Informes` migrados a
      `useEmpresaQuery` + `useMutation`; eliminados los `eslint-disable
      react-hooks/set-state-in-effect` (y los `useEffect` de carga). `eslint frontend/src` a 0.
- [x] **N19** Los `alert()` de los POS sustituidos por `<FormError>` + `apiError()`;
      botones de envío deshabilitados con estado "Procesando…" mientras la mutación corre.
- [x] **N1 (frontend)** `Ventas.jsx` ya no envía `total` en el payload; el PDF se genera
      desde `GET /api/ventas/:id` (`descargarPDF`), usando los importes del backend.
- [x] **N13** `getVentas` sin `include: Empresa` (comentario que apunta a `GET /api/ventas/:id`).
- [x] **Extra** UI "Cerrar mis otras sesiones" en `CambiarPassword.jsx`
      (`POST /api/auth/logout-all?mantener_actual=true`; el backend devuelve `revocadas`).
- [x] Verificación E2E contra la pila Docker: compra con cantidad fraccionaria (10,5 → 14,5),
      venta con `descuento_global` 10 % (subtotal/impuestos/total coherentes), informes,
      `logout-all` con y sin `mantener_actual`. **62 unitarios + 23 integración** en verde.

**N20/I6** ya se había cerrado en la Fase 6 (`config/database.js` sin `authenticate()`).
_Pendiente no bloqueante:_ revisión visual fina del layout del PDF (la aritmética ya está verificada).

---

## 6. Riesgo residual / no auditado

- **Facturación electrónica DIAN** (`cufe`, `qr_data`, `pdf_url`, `xml_url`,
  `estado_fe`, resolución, clave técnica): son campos de un stub sin integración
  real. Cuando se integre habrá que auditar firmado, numeración por resolución,
  concurrencia de consecutivos y almacenamiento del XML/PDF.
- **`generateInvoicePDF.js`** (355 líneas): solo se revisó la aritmética de totales
  (→ N1). El layout, el manejo de páginas múltiples y los casos límite (0 ítems,
  nombres muy largos) no se probaron.
- **Concurrencia** más allá del stock: dos recepciones del mismo pedido en paralelo,
  dos altas de empresa con el mismo NIT (no hay `unique` en `empresas.nit`).
- **Backups**: el servicio opcional `docker-compose.backup.yml` no se ejecutó ni se
  probó la restauración en este ciclo.

---

## 7. Anexo — Cómo reproducir N1 (descuento global)

```bash
# con la pila levantada y un token de sesión de un FRONT_USER con empresa activa
curl -s -b cookies.txt -H "X-Empresa-Id: <ID>" -H 'Content-Type: application/json' \
  -X POST http://localhost/api/ventas -d '{
    "clienteId": <CID>,
    "total": 90000,
    "descuento_global": 10,
    "detalles": [{ "productoId": <PID>, "servicioId": null,
                   "cantidad": 1, "precio_unitario": 100000, "precio_base": 100000 }]
  }'
# Respuesta actual:  "total": "99990.00"   (100000 - 10)   ← debería ser 90000.00 (10%)
```

**Fix de referencia (`services/calculo.js`):**

```js
function calcularVenta(lineas, descuentoGlobalPct = 0) {
  // ... subtotalBruto, totalImpuestos como ahora ...
  const pct = Math.min(100, Math.max(0, Number(descuentoGlobalPct) || 0));
  const totalConIva = subtotalBruto + totalImpuestos;
  const descuentoItems = lineas.reduce(
    (a, l) => a + Math.max(0, (Number(l.precioBase) || Number(l.precioConIva)) - Number(l.precioConIva)) * Number(l.cantidad), 0);
  const descuentoGlobalMonto = round2(totalConIva * (pct / 100));
  return {
    subtotal_bruto: round2(subtotalBruto),
    total_impuestos: round2(totalImpuestos),
    descuento_global: pct,                                   // porcentaje
    total_descuentos: round2(descuentoItems + descuentoGlobalMonto),
    total: round2(totalConIva - descuentoGlobalMonto),
    detalles,
  };
}
```
