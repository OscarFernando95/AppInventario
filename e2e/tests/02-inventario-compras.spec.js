const { test, expect } = require('@playwright/test');
const { CAFE, entrar, ver, elegirOpcion } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

test.describe('Café E2E: inventario con presentación de compra, compra en kg y plato con receta', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
  });

  test('crea el proveedor y el cliente', async ({ page }) => {
    await page.goto('/app/proveedores');
    await page.getByRole('button', { name: 'Nuevo Proveedor' }).click();
    await page.getByLabel('Razón Social').fill('Molinos del Valle');
    await page.getByLabel('NIT').fill('800111222');
    await page.getByLabel('Nombre Contacto').fill('Pedro Molinero');
    await page.getByRole('button', { name: 'Agregar' }).click();
    await expect(page.getByText('Molinos del Valle')).toBeVisible();

    await page.goto('/app/clientes');
    await page.getByRole('button', { name: 'Nuevo Cliente' }).click();
    await page.getByLabel('Nombre o Razón Social').fill('Cliente Mostrador');
    await page.getByLabel('Número de documento').fill('222333444');
    await page.getByRole('button', { name: 'Dar de Alta' }).click();
    await expect(page.getByText('Cliente Mostrador')).toBeVisible();
  });

  test('un insumo en gramos con presentación en kg sugiere el factor 1000', async ({ page }) => {
    await page.goto('/app/inventario');
    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByLabel('¿Qué vas a registrar?').selectOption('INSUMO');
    await page.getByLabel('Código SKU').fill('HAR');
    await page.getByLabel('Descripción').fill('Harina de trigo');
    await page.getByLabel('Unidad de Medida (UBL)').selectOption('GRM');
    await page.getByLabel('Stock Físico Inicial').fill('0');

    await page.getByLabel('Compro en').selectOption('KGM');
    await expect(page.getByLabel(/^1 kg = /)).toHaveValue('1000'); // equivalencia estándar kg → g
    await ver(page, '02-presentacion');
    await page.getByRole('button', { name: 'Guardar en Base' }).click();

    const fila = page.getByRole('row', { name: /Harina de trigo/ });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText('Insumo');

    // Un segundo insumo, con stock y costo inicial (para el modificador "extra queso").
    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByLabel('¿Qué vas a registrar?').selectOption('INSUMO');
    await page.getByLabel('Código SKU').fill('QUE');
    await page.getByLabel('Descripción').fill('Queso mozzarella');
    await page.getByLabel('Unidad de Medida (UBL)').selectOption('GRM');
    await page.getByLabel('Stock Físico Inicial').fill('500');
    await page.getByLabel(/^Costo por g/).fill('30');
    await page.getByRole('button', { name: 'Guardar en Base' }).click();
    await expect(page.getByRole('row', { name: /Queso mozzarella/ })).toContainText('500');
  });

  test('compra 2,5 kg de harina: el stock queda en gramos y el costo por gramo', async ({ page }) => {
    await page.goto('/app/compras');
    await page.getByRole('button', { name: 'Iniciar Compra' }).click();

    // Una compra siempre lleva proveedor.
    await page.getByPlaceholder(/Buscar proveedor/).fill('Molinos');
    await page.getByRole('button', { name: /Molinos del Valle/ }).click();

    await page.getByText('Harina de trigo').first().click(); // tarjeta del catálogo
    const unidad = page.getByLabel('Unidad de compra de Harina de trigo');
    await expect(unidad).toHaveValue('pres'); // nace en la presentación (kg)
    await page.getByRole('spinbutton', { name: 'Cantidad de Harina de trigo' }).fill('2.5');
    await page.getByTitle('Costo por kg').fill('17333');
    await expect(page.getByText('$ 43.333').or(page.getByText('$43.333')).first()).toBeVisible(); // 2,5 × 17.333

    // Alternar a gramos conserva el total (2.500 g a $17,333).
    await unidad.selectOption('base');
    await expect(page.getByRole('spinbutton', { name: 'Cantidad de Harina de trigo' })).toHaveValue('2500');
    await unidad.selectOption('pres');
    await expect(page.getByRole('spinbutton', { name: 'Cantidad de Harina de trigo' })).toHaveValue('2.5');

    await page.getByRole('button', { name: 'Procesar e Ingresar' }).click();
    await expect(page.getByRole('row', { name: /Molinos del Valle/ })).toContainText('43.333');

    await page.goto('/app/inventario');
    const fila = page.getByRole('row', { name: /Harina de trigo/ });
    await expect(fila).toContainText('2.500 g');
    await expect(fila).toContainText('2,5 kg'); // equivalente en la presentación
  });

  test('crea el plato con receta y calcula costo, margen y porciones', async ({ page }) => {
    await page.goto('/app/inventario');
    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByLabel('¿Qué vas a registrar?').selectOption('RECETA');
    await page.getByLabel('Código SKU').fill('PAN');
    await page.getByLabel('Descripción').fill('Pan artesanal');
    await page.getByLabel('Precio del plato ($)').fill('11900');

    await page.getByRole('button', { name: 'Agregar ingrediente' }).click();
    await elegirOpcion(page, page.getByPlaceholder('Buscar insumo…'), 'Harina');
    await page.getByRole('spinbutton', { name: 'Cantidad (g)' }).fill('100'); // 100 g por porción
    await ver(page, '02-plato');
    await page.getByRole('button', { name: 'Guardar en Base' }).click();

    const fila = page.getByRole('row', { name: /Pan artesanal/ });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText('25 porciones'); // 2.500 g / 100 g
    await expect(fila).toContainText('Plato');
    // costo = 100 g × $17,333 = $1.733 ; precio sin IVA = 11.900 / 1,19 = 10.000 → margen ≈ 82,7 %
    await expect(fila).toContainText('1.733');
    await expect(fila).toContainText('82,7%');
  });
});
