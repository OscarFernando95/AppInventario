const { test, expect } = require('@playwright/test');
const { CAFE, entrar, ver } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

const menu = (page) => page.getByRole('navigation', { name: 'Navegación principal' });
// Un PNG de 1×1 píxel, en memoria (no se escribe ningún archivo).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function interruptor(page, nombre, encendido) {
  const sw = page.getByRole('switch', { name: new RegExp(`^${nombre}`) });
  if ((await sw.isChecked()) !== encendido) await sw.click();
  if (encendido) await expect(sw).toBeChecked(); else await expect(sw).not.toBeChecked();
}

test.describe('Café E2E: menú con categorías, fotos, agotado por hoy y precios por horario', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
  });

  test('apagado, el catálogo del mesero es el de siempre y no hay pantalla de Menú', async ({ page }) => {
    await expect(menu(page).getByRole('link', { name: 'Menú', exact: true })).toHaveCount(0);
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir cuenta' }).click();
    await expect(page.getByRole('tablist', { name: 'Categorías' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Marcar .* como agotado por hoy/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Agregar Gaseosa E2E' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar cuenta' }).click();
    await page.getByRole('dialog').getByLabel('Motivo').fill('Prueba de catálogo');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar cuenta' }).click();
  });

  test('enciende las cuatro opciones, crea categorías y las ordena', async ({ page }) => {
    await page.goto('/app/opciones');
    for (const op of ['Categorías del menú', 'Fotos de los platos', 'Agotado por hoy', 'Precios por horario']) await interruptor(page, op, true);

    await menu(page).getByRole('link', { name: 'Menú', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Menú', level: 2 }).first()).toBeVisible();
    for (const nombre of ['Bebidas', 'Panadería']) {
      await page.getByLabel('Nueva categoría').fill(nombre);
      await page.getByRole('button', { name: 'Agregar', exact: true }).click();
      await expect(page.getByRole('row', { name: new RegExp(nombre) })).toBeVisible();
    }
    // Panadería primero.
    await page.getByRole('button', { name: 'Subir Panadería' }).click();
    await expect(page.getByRole('row').nth(1)).toContainText('Panadería');
    await expect(page.getByRole('row').nth(2)).toContainText('Bebidas');
  });

  test('asigna categoría y foto a los productos desde Inventario', async ({ page }) => {
    await page.goto('/app/inventario');
    await page.getByRole('button', { name: 'Editar Gaseosa E2E' }).click();
    await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Bebidas' });
    await page.getByLabel('Foto del producto').setInputFiles({ name: 'gaseosa.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('img', { name: 'Foto del producto' })).toBeVisible();
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await expect(page.getByRole('row', { name: /Gaseosa E2E/ })).toBeVisible();

    await page.getByRole('button', { name: 'Editar Pan artesanal' }).click();
    await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Panadería' });
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await expect(page.getByRole('row', { name: /Pan artesanal/ })).toBeVisible();
  });

  test('el catálogo del mesero muestra pestañas por categoría, la foto, y se puede marcar «agotado por hoy»', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir cuenta' }).click();

    const pestanas = page.getByRole('tablist', { name: 'Categorías' });
    await expect(pestanas.getByRole('tab').first()).toHaveText('Todo');
    await expect(pestanas.getByRole('tab', { name: 'Panadería' })).toBeVisible();
    await pestanas.getByRole('tab', { name: 'Bebidas' }).click();
    await expect(page.getByRole('button', { name: 'Agregar Gaseosa E2E' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agregar Pan artesanal' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Agregar Gaseosa E2E' }).locator('img')).toBeVisible(); // la foto
    await ver(page, '18-catalogo');

    await page.getByRole('button', { name: 'Marcar Gaseosa E2E como agotado por hoy' }).click();
    await expect(page.getByRole('button', { name: 'Agregar Gaseosa E2E' })).toBeDisabled();
    await expect(page.getByText('Agotado por hoy')).toBeVisible();
    await page.getByRole('button', { name: 'Volver a habilitar Gaseosa E2E' }).click();
    await expect(page.getByRole('button', { name: 'Agregar Gaseosa E2E' })).toBeEnabled();
  });

  test('una oferta por horario baja el precio en el catálogo, la cuenta lo conserva y el POS lo usa', async ({ page }) => {
    await page.goto('/app/menu');
    await page.getByRole('tab', { name: 'Precios por horario' }).click();
    await page.getByRole('button', { name: 'Nueva oferta' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Nueva oferta' });
    await dialogo.getByLabel(/^Nombre/).fill('Happy hour');
    await dialogo.getByLabel(/^Descuento/).fill('50');
    await dialogo.getByLabel(/^Desde las/).fill('00:00');
    await dialogo.getByLabel(/^Hasta las/).fill('23:59');
    await dialogo.getByLabel('Bebidas', { exact: true }).check();
    await dialogo.getByRole('button', { name: 'Guardar oferta' }).click();
    await expect(page.getByRole('row', { name: /Happy hour/ })).toContainText('50 % menos');
    await expect(page.getByRole('row', { name: /Happy hour/ })).toContainText('Bebidas');

    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' }).click();
    const gaseosa = page.getByRole('button', { name: 'Agregar Gaseosa E2E' });
    await expect(gaseosa).toContainText('1.500'); // 3.000 − 50 %
    await expect(gaseosa).toContainText('Happy hour');
    await gaseosa.click();
    const pedido = page.getByRole('region', { name: 'Cuenta' });
    await expect(pedido).toContainText('1 × Gaseosa E2E');
    await expect(pedido.getByText('Total').locator('..')).toContainText('1.500');

    // El POS también.
    await page.goto('/app/ventas');
    await page.getByRole('button', { name: /Iniciar POS/ }).click();
    await page.getByRole('button', { name: 'Cliente Mostrador' }).click();
    await page.getByText('Gaseosa E2E').first().click();
    await expect(page.getByText('Precio Base: $ 3.000').or(page.getByText('Precio Base: $3.000'))).toBeVisible();
    await expect(page.getByTitle('Precio Final de Venta')).toHaveValue('1500');
    await page.keyboard.press('Escape');
  });

  test('al cobrar, la venta respeta el precio de la oferta; apagadas las opciones todo vuelve a lo de siempre', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' }).click();
    await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
    const cobro = page.getByRole('dialog', { name: 'Cobrar · Mesa 1' });
    await expect(cobro.getByRole('button', { name: /^Cobrar \$/ })).toContainText('1.500');
    await cobro.getByRole('button', { name: /^Cobrar \$/ }).click();
    await page.getByRole('dialog', { name: 'Cobro registrado' }).getByRole('button', { name: 'Volver a las mesas' }).click();

    await page.goto('/app/opciones');
    for (const op of ['Categorías del menú', 'Fotos de los platos', 'Agotado por hoy', 'Precios por horario']) await interruptor(page, op, false);
    await expect(menu(page).getByRole('link', { name: 'Menú', exact: true })).toHaveCount(0);
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir cuenta' }).click();
    await expect(page.getByRole('tablist', { name: 'Categorías' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Agregar Gaseosa E2E' })).toContainText('3.000'); // sin oferta
    await page.getByRole('button', { name: 'Cancelar cuenta' }).click();
    await page.getByRole('dialog').getByLabel('Motivo').fill('Prueba de catálogo');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar cuenta' }).click();
  });

  test('la auditoría deja constancia del menú', async ({ page }) => {
    await page.goto('/app/auditoria');
    await page.getByLabel('Módulo').selectOption('Menú');
    for (const accion of ['Creó una categoría del menú', 'Reordenó las categorías del menú', 'Marcó un plato como agotado hoy', 'Creó una oferta por horario']) {
      await expect(page.getByRole('row', { name: new RegExp(accion) }).first()).toBeVisible();
    }
  });
});
