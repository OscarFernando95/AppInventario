const { test, expect } = require('@playwright/test');
const { CAFE, entrar, ver } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

test.describe('Café E2E: stock mínimo en todos los tipos, reposición y pedido sugerido', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
  });

  test('configura el mínimo de un insumo y de un plato; ambos quedan en alerta', async ({ page }) => {
    await page.goto('/app/inventario');

    // Insumo: 2.500 g en bodega, mínimo 3.000 g, reponer hasta 5.000 g.
    await page.getByRole('button', { name: 'Editar Harina de trigo' }).click();
    await page.getByLabel(/^Stock mínimo/).fill('3000');
    await page.getByLabel(/^Reponer hasta/).fill('5000');
    await page.getByRole('button', { name: 'Actualizar' }).click();
    const harina = page.getByRole('row', { name: /Harina de trigo/ });
    await expect(harina).toContainText('Bajo el mínimo');
    await expect(harina).toContainText('mín. 3.000');

    // Plato: el mínimo se mide en PORCIONES (25 disponibles, mínimo 30).
    await page.getByRole('button', { name: 'Editar Pan artesanal' }).click();
    await expect(page.getByLabel(/^Stock mínimo \(porciones\)/)).toBeVisible();
    await page.getByLabel(/^Stock mínimo/).fill('30');
    await page.getByRole('button', { name: 'Actualizar' }).click();
    const pan = page.getByRole('row', { name: /Pan artesanal/ });
    await expect(pan).toContainText('25 porciones');
    await expect(pan).toContainText('Bajo el mínimo');

    // El filtro "En o bajo su mínimo" muestra ambos y oculta el queso (sin mínimo).
    await page.getByLabel('Stock', { exact: true }).selectOption('bajo');
    await expect(page.getByRole('row', { name: /Harina de trigo/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Pan artesanal/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Queso mozzarella/ })).toHaveCount(0);
  });

  test('el dashboard avisa y Reposición explica qué pedir (los platos piden sus ingredientes)', async ({ page }) => {
    await page.goto('/app');
    const aviso = page.getByRole('status').filter({ hasText: 'en o bajo su stock mínimo' });
    await expect(aviso).toContainText('2 producto(s)');
    await aviso.getByRole('button', { name: 'Ver reposición' }).click();
    await expect(page).toHaveURL(/\/app\/reposicion/);

    const alertas = page.getByRole('row', { name: /BAJO/ });
    await expect(alertas.filter({ hasText: 'Harina de trigo' })).toContainText('2.500 g');
    await expect(alertas.filter({ hasText: 'Pan artesanal' })).toContainText('25 porciones');

    // Harina: su objetivo (5.000 g) vs. lo que pide el pan para llegar a 60 porciones (6.000 g) -> 3.500 g = 3,5 kg.
    const sugerencia = page.getByRole('row', { name: /Harina de trigo.*Insumo.*3,5 kg/ });
    await expect(sugerencia).toContainText('= 3.500 g');
    await expect(sugerencia).toContainText('Para: Pan artesanal');
    await expect(page.getByRole('row', { name: /Pan artesanal.*Plato.*Pedir/ })).toHaveCount(0); // un plato no se pide
    await ver(page, '07-reposicion');
  });

  test('crea el pedido sugerido (en kg), lo recibe y las alertas desaparecen', async ({ page }) => {
    await page.goto('/app/reposicion');
    await page.getByRole('button', { name: 'Crear pedido con lo seleccionado' }).click();

    // La orden se abre con la harina ya cargada en kg.
    await expect(page).toHaveURL(/\/app\/pedidos/);
    await expect(page.getByLabel('Unidad del pedido de Harina de trigo')).toHaveValue('pres');
    await expect(page.locator('input[type=number][value="3.5"]')).toBeVisible(); // 3,5 kg sugeridos
    await page.getByPlaceholder(/Buscar proveedor/).fill('Molinos');
    await page.getByRole('button', { name: /Molinos del Valle/ }).first().click();
    await page.getByRole('button', { name: /Procesar Orden de Compra/ }).click();

    const fila = page.getByRole('row', { name: /Molinos del Valle/ });
    await expect(fila).toContainText('PENDIENTE');
    await fila.getByRole('button', { name: 'Recibir', exact: true }).click();
    await page.getByRole('button', { name: /Confirmar recepción/ }).click();
    await expect(page.getByRole('row', { name: /Molinos del Valle/ })).toContainText('COMPLETADO');

    await page.goto('/app/reposicion');
    await expect(page.getByText('Todo en orden')).toBeVisible();
    await expect(page.getByText('Nada que pedir por ahora')).toBeVisible();
    await page.goto('/app/inventario');
    await expect(page.getByRole('row', { name: /Harina de trigo/ })).toContainText('6.000 g'); // 2.500 + 3.500
    await expect(page.getByRole('row', { name: /Pan artesanal/ })).toContainText('60 porciones');
  });
});
