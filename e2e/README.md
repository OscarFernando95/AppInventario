# Pruebas de navegador (E2E)

Playwright recorre la aplicación real en un navegador: login, backoffice, inventario, compras en kg,
POS con modificadores, caja (abrir, egresos, cerrar y PDF), gastos, auditoría y caja opcional.

## Cómo correrlas

```bash
docker compose up -d db          # Postgres (puerto 5433 del override de desarrollo)
cd e2e
npm install
npx playwright install chromium  # una sola vez (~100 MB, queda en la caché de Playwright)
npm test
```

`npm test` levanta todo por su cuenta (`servidor.js`): recrea la base `appinventario_e2e` con las
migraciones y los seeders reales, compila el frontend y sirve todo en el puerto 4010. No toca tu
base de desarrollo ni tu `frontend/dist`.

Los archivos `tests/01…05` son **una historia encadenada** (el 01 crea las empresas y usuarios que
usan los demás), así que se corren juntos y en orden.

## No deja archivos

Sin capturas, trazas, vídeos ni reportes: todo lo temporal va a la carpeta temporal del sistema y
`correr.js` la borra al terminar. Para depurar un fallo: `E2E_CONSERVAR=1 npm test` conserva capturas
(de los fallos y de las llamadas a `ver(page, nombre)`) en `<tmp>/appinventario-e2e/`; **bórrala a
mano al terminar**.

## Variables

| Variable | Por defecto | Para qué |
|---|---|---|
| `E2E_PORT` | 4010 | puerto del servidor de pruebas |
| `E2E_DB_HOST` / `E2E_DB_PORT` / `E2E_DB_NAME` | localhost / 5433 / appinventario_e2e | base de pruebas |
| `E2E_CONSERVAR` | – | `1` conserva los temporales para depurar |
