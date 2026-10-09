const { test, expect } = require('@playwright/test');
const { CAFE, TIENDA, entrar } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

const menu = (page) => page.getByRole('navigation', { name: 'Navegación principal' });

test.describe('Opciones: cada función se prende y se apaga sin afectar al resto', () => {
  test('el administrador del café ve la pantalla de opciones; una tienda de comercio ni siquiera el enlace', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await expect(menu(page).getByRole('link', { name: 'Opciones', exact: true })).toBeVisible();
    await menu(page).getByRole('link', { name: 'Opciones', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Opciones', level: 2 }).first()).toBeVisible();
    for (const op of ['Reservas', 'Plano del local', 'Unir cuentas', 'Pedir y cobrar por persona', 'Propina al cobrar']) {
      await expect(page.getByRole('switch', { name: new RegExp(`^${op}`) })).toBeChecked(); // lo que ya existía, encendido
    }

    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await entrar(page, TIENDA.admin, TIENDA.clave);
    await expect(menu(page).getByRole('link', { name: 'Opciones', exact: true })).toHaveCount(0);
    await expect(menu(page).getByRole('link', { name: 'Mesas', exact: true })).toHaveCount(0);
  });

  test('apagar «Reservas» quita esa sección de Mesas y nada más; encenderla la devuelve', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/opciones');
    await page.getByRole('switch', { name: /^Reservas/ }).click(); // el interruptor cambia cuando el servidor responde
    await expect(page.getByRole('switch', { name: /^Reservas/ })).not.toBeChecked();

    await page.goto('/app/mesas');
    await expect(page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' }).or(page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' }))).toBeVisible();
    await expect(page.getByRole('region', { name: 'Reservas de hoy' })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Plano' })).toBeAttached(); // lo demás sigue ahí

    await page.goto('/app/opciones');
    await page.getByRole('switch', { name: /^Reservas/ }).click();
    await expect(page.getByRole('switch', { name: /^Reservas/ })).toBeChecked();
    await page.goto('/app/mesas');
    await expect(page.getByRole('region', { name: 'Reservas de hoy' })).toBeVisible();
  });

  test('el perfil «Cafetería» apaga plano, unir, reservas y por persona; «Restaurante» los devuelve', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/opciones');
    await page.getByRole('button', { name: /Cafetería \(mostrador\)/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Aplicar perfil' }).click();
    await expect(page.getByRole('switch', { name: /^Plano del local/ })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: /^Propina al cobrar/ })).toBeChecked();

    await page.goto('/app/mesas');
    await expect(page.getByRole('radio', { name: 'Plano' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Reservas de hoy' })).toHaveCount(0);

    await page.goto('/app/opciones');
    await page.getByRole('button', { name: /Restaurante completo/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Aplicar perfil' }).click();
    await expect(page.getByRole('switch', { name: /^Plano del local/ })).toBeChecked();
    await page.goto('/app/mesas');
    await expect(page.getByRole('radio', { name: 'Plano' })).toBeAttached();
    // «Restaurante» enciende además lo esencial de sala y cocina (lista de espera, tiempos, pre-cuenta…).
    await page.goto('/app/opciones');
    await expect(page.getByRole('switch', { name: /^Lista de espera/ })).toBeChecked();
    await expect(page.getByRole('switch', { name: /^Pre-cuenta/ })).toBeChecked();
    await expect(page.getByRole('switch', { name: /^Pedidos numerados/ })).not.toBeChecked();
  });

  test('«Lo básico» apaga todo; las funciones de siempre se vuelven a prender para seguir con los demás flujos', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/opciones');
    await page.getByRole('button', { name: /Lo básico/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Aplicar perfil' }).click();
    await expect(page.getByRole('switch', { name: /^Lista de espera/ })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: /^Reservas/ }).first()).not.toBeChecked();
    for (const nombre of ['Reservas', 'Plano del local', 'Unir cuentas', 'Pedir y cobrar por persona', 'Propina al cobrar']) {
      const sw = page.getByRole('switch', { name: new RegExp(`^${nombre}`) }).first();
      await sw.click();
      await expect(sw).toBeChecked();
    }
  });

  test('la auditoría deja constancia del cambio de opciones', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/auditoria');
    await page.getByLabel('Módulo').selectOption('Mesas');
    await expect(page.getByRole('row', { name: /Aplicó un perfil de opciones/ }).first()).toBeVisible();
    await expect(page.getByRole('row', { name: /Cambió las opciones del restaurante/ }).first()).toBeVisible();
  });
});
