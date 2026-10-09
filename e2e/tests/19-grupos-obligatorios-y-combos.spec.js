const { test, expect } = require('@playwright/test');
const { CAFE, entrar, ver, elegirOpcion } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

const menu = (page) => page.getByRole('navigation', { name: 'Navegación principal' });

async function interruptor(page, nombre, encendido) {
  const sw = page.getByRole('switch', { name: new RegExp(`^${nombre}`) });
  if ((await sw.isChecked()) !== encendido) await sw.click();
  if (encendido) await expect(sw).toBeChecked(); else await expect(sw).not.toBeChecked();
}

test.describe('Café E2E: grupos de modificadores obligatorios y combos', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
  });

  test('apagado, el plato con modificadores se pide como siempre y no hay combos ni grupos', async ({ page }) => {
    await page.goto('/app/recetas');
    await page.getByRole('tab', { name: 'Modificadores' }).click();
    await expect(page.getByRole('region', { name: 'Grupos de modificadores' })).toHaveCount(0);
    await page.goto('/app/inventario');
    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await expect(page.getByLabel('¿Qué vas a registrar?').locator('option', { hasText: 'Combo' })).toHaveCount(0);
  });

  test('enciende las dos opciones y crea el grupo obligatorio «Punto de cocción» para el pan', async ({ page }) => {
    await page.goto('/app/opciones');
    await interruptor(page, 'Grupos de modificadores obligatorios', true);
    await interruptor(page, 'Combos', true);

    await page.goto('/app/recetas');
    await page.getByRole('tab', { name: 'Modificadores' }).click();
    await page.getByRole('button', { name: 'Nuevo grupo' }).click();
    const grupo = page.getByRole('dialog', { name: 'Nuevo grupo' });
    await grupo.getByLabel(/^Nombre del grupo/).fill('Punto de cocción');
    await grupo.getByLabel(/^Obligatorio/).check();
    await elegirOpcion(page, grupo.getByPlaceholder('Buscar plato…'), 'Pan artesanal');
    await grupo.getByRole('button', { name: 'Guardar grupo' }).click();
    await expect(page.getByRole('region', { name: 'Grupos de modificadores' })).toContainText('Punto de cocción');
    await expect(page.getByRole('region', { name: 'Grupos de modificadores' })).toContainText('Obligatorio · elige uno');

    for (const nombre of ['Bien tostado', 'Poco tostado']) {
      await page.getByRole('button', { name: 'Nuevo modificador' }).click();
      const dialogo = page.getByRole('dialog', { name: 'Nuevo modificador' });
      await dialogo.getByLabel(/^Nombre/).fill(nombre);
      await dialogo.getByLabel('Grupo').selectOption({ label: 'Punto de cocción' });
      await dialogo.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByRole('row', { name: new RegExp(nombre) })).toContainText('Punto de cocción');
    }
  });

  test('el mesero no puede pedir el pan sin elegir el punto; elige uno y agrega', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir cuenta' }).click();

    await page.getByRole('button', { name: 'Agregar Pan artesanal' }).click();
    const modal = page.getByRole('dialog', { name: 'Pan artesanal' });
    const grupo = modal.getByRole('group', { name: /Punto de cocción/ });
    await expect(grupo).toBeVisible();
    await expect(grupo.getByText('Obligatorio', { exact: true })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Agregar', exact: true })).toBeDisabled();
    await expect(modal.getByText('Elige punto de cocción (obligatorio).')).toBeVisible();
    await modal.getByRole('radio', { name: /Bien tostado/ }).check();
    await modal.getByRole('radio', { name: /Poco tostado/ }).check(); // grupo de elección única: cambia, no suma
    await expect(modal.getByRole('radio', { name: /Bien tostado/ })).not.toBeChecked();
    await modal.getByRole('checkbox', { name: /Extra queso/ }).check(); // un extra suelto sigue siendo opcional
    await expect(modal.getByRole('button', { name: 'Agregar', exact: true })).toBeEnabled();
    await ver(page, '19-grupos');
    await modal.getByRole('button', { name: 'Agregar', exact: true }).click();
    const pedido = page.getByRole('region', { name: 'Cuenta' });
    await expect(pedido).toContainText('Poco tostado');
    await expect(pedido).toContainText('Extra queso');
  });

  test('crea el combo «Desayuno» con pan y gaseosa; aparece disponible en Inventario', async ({ page }) => {
    await page.goto('/app/inventario');
    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByLabel('¿Qué vas a registrar?').selectOption('COMBO');
    await page.getByLabel('Código SKU').fill('CMB');
    await page.getByLabel('Descripción').fill('Desayuno E2E');
    await page.getByLabel('Precio de Venta ($)').fill('12000');
    await page.getByRole('button', { name: 'Agregar componente' }).click();
    await elegirOpcion(page, page.getByPlaceholder('Buscar plato o producto…').first(), 'Pan artesanal');
    await page.getByRole('button', { name: 'Agregar componente' }).click();
    await elegirOpcion(page, page.getByPlaceholder('Buscar plato o producto…').nth(1), 'Gaseosa E2E');
    // Con un solo componente no deja guardar.
    await page.getByRole('button', { name: 'Quitar componente' }).nth(1).click();
    await page.getByRole('button', { name: 'Guardar en Base' }).click();
    await expect(page.getByText('Un combo necesita al menos dos productos.')).toBeVisible();
    await page.getByRole('button', { name: 'Agregar componente' }).click();
    await elegirOpcion(page, page.getByPlaceholder('Buscar plato o producto…').nth(1), 'Gaseosa E2E');
    await page.getByRole('button', { name: 'Guardar en Base' }).click();

    const fila = page.getByRole('row', { name: /Desayuno E2E/ });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText('Combo');
    await expect(fila).toContainText('combos');
  });

  test('el combo se pide, sale en la comanda con sus componentes y se cobra', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' }).click();
    await page.getByRole('button', { name: 'Agregar Desayuno E2E' }).click();
    const pedido = page.getByRole('region', { name: 'Cuenta' });
    await expect(pedido).toContainText('1 × Desayuno E2E');
    await expect(pedido).toContainText('Incluye: Pan artesanal, Gaseosa E2E');
    await page.getByRole('button', { name: /^Enviar \(2\)/ }).click();
    await expect(page.getByText(/enviada/)).toBeVisible();

    await menu(page).getByRole('link', { name: 'Cocina', exact: true }).click();
    const tarjeta = page.getByRole('article', { name: /de Mesa 1$/ }).last();
    await expect(tarjeta).toContainText('1 × Desayuno E2E');
    await expect(tarjeta).toContainText('• 1 Pan artesanal');
    await expect(tarjeta).toContainText('• 1 Gaseosa E2E');

    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' }).click();
    await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
    await page.getByRole('dialog', { name: 'Cobrar · Mesa 1' }).getByRole('button', { name: /^Cobrar \$/ }).click();
    await page.getByRole('dialog', { name: 'Cobro registrado' }).getByRole('button', { name: 'Volver a las mesas' }).click();
  });

  test('apagadas las opciones, el combo ya no se ofrece y el pan se pide sin grupos', async ({ page }) => {
    await page.goto('/app/opciones');
    await interruptor(page, 'Combos', false);
    await interruptor(page, 'Grupos de modificadores obligatorios', false);

    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir cuenta' }).click();
    await expect(page.getByRole('button', { name: 'Agregar Desayuno E2E' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Agregar Pan artesanal' }).click();
    const modal = page.getByRole('dialog', { name: 'Pan artesanal' });
    await expect(modal.getByRole('group', { name: /Punto de cocción/ })).toHaveCount(0);
    await expect(modal.getByRole('button', { name: 'Agregar', exact: true })).toBeEnabled();
    await modal.getByRole('button', { name: 'Agregar', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Cuenta' })).toContainText('1 × Pan artesanal');
    await page.getByRole('button', { name: 'Cancelar cuenta' }).click();
    await page.getByRole('dialog').getByLabel('Motivo').fill('Prueba de grupos');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar cuenta' }).click();
  });

  test('la auditoría deja constancia del grupo', async ({ page }) => {
    await page.goto('/app/auditoria');
    await page.getByLabel('Módulo').selectOption('Menú');
    await expect(page.getByRole('row', { name: /Creó un grupo de modificadores/ }).first()).toBeVisible();
  });
});
