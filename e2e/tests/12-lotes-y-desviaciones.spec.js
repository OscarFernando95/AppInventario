const { test, expect } = require('@playwright/test');
const { CAFE, entrar, ver, elegirOpcion } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

test.describe('Café E2E: preparaciones por lotes y desviaciones del inventario', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
  });

  test('crea una salsa «por lotes», su ingrediente y un plato que la usa', async ({ page }) => {
    await page.goto('/app/inventario');

    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByLabel('¿Qué vas a registrar?').selectOption('INSUMO');
    await page.getByLabel('Código SKU').fill('TOM');
    await page.getByLabel('Descripción').fill('Tomate E2E');
    await page.getByLabel('Unidad de Medida (UBL)').selectOption('GRM');
    await page.getByLabel('Stock Físico Inicial').fill('5000');
    await page.getByLabel(/^Costo por g/).fill('2');
    await page.getByRole('button', { name: 'Guardar en Base' }).click();
    await expect(page.getByRole('row', { name: /Tomate E2E/ })).toContainText('5.000 g');

    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByLabel('¿Qué vas a registrar?').selectOption('PREPARACION');
    await page.getByLabel('Código SKU').fill('SAL');
    await page.getByLabel('Descripción').fill('Salsa E2E');
    await page.getByLabel('Unidad de Medida (UBL)').selectOption('MLT');
    await page.getByLabel('Rendimiento de la receta').fill('1000');
    await page.getByLabel('Prepararla por lotes (con su propio stock)').check();
    await page.getByRole('button', { name: 'Agregar ingrediente' }).click();
    await elegirOpcion(page, page.getByPlaceholder('Buscar insumo…'), 'Tomate E2E');
    await page.getByRole('spinbutton', { name: /^Cantidad/ }).fill('800'); // 800 g por 1.000 ml
    await page.getByRole('button', { name: 'Guardar en Base' }).click();
    const salsa = page.getByRole('row', { name: /Salsa E2E/ });
    await expect(salsa).toContainText('Preparación');
    await expect(salsa).toContainText('0 ml preparados');

    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByLabel('¿Qué vas a registrar?').selectOption('RECETA');
    await page.getByLabel('Código SKU').fill('PAS');
    await page.getByLabel('Descripción').fill('Pasta E2E');
    await page.getByLabel('Precio del plato ($)').fill('20000');
    await page.getByRole('button', { name: 'Agregar ingrediente' }).click();
    await elegirOpcion(page, page.getByPlaceholder('Buscar insumo…'), 'Salsa E2E');
    await page.getByRole('spinbutton', { name: /^Cantidad/ }).fill('200'); // 200 ml de salsa por plato
    await page.getByRole('button', { name: 'Guardar en Base' }).click();
    // Sin producir salsa, el plato no se puede preparar.
    await expect(page.getByRole('row', { name: /Pasta E2E/ })).toContainText('0 porciones');
  });

  test('registra la producción de 2 litros: descuenta el tomate y suma el stock de la salsa', async ({ page }) => {
    await page.goto('/app/recetas');
    await page.getByRole('tab', { name: 'Producción' }).click();
    await elegirOpcion(page, page.getByPlaceholder('Buscar preparación…'), 'Salsa E2E');
    await page.getByLabel(/^Cantidad preparada/).fill('2000');
    await expect(page.getByText('Se descontará del inventario')).toBeVisible();
    await expect(page.getByText(/Tomate E2E: 1\.600 g/)).toBeVisible(); // 800 g × 2
    await ver(page, '12-produccion');
    await page.getByRole('button', { name: 'Registrar producción' }).click();
    await expect(page.getByText(/Producción registrada: 2\.000 ml de Salsa E2E/)).toBeVisible();
    await expect(page.getByRole('row', { name: /Salsa E2E/ })).toContainText('ACTIVA');

    await page.goto('/app/inventario');
    await expect(page.getByRole('row', { name: /Salsa E2E/ })).toContainText('2.000 ml preparados');
    await expect(page.getByRole('row', { name: /Tomate E2E/ })).toContainText('3.400 g');
    await expect(page.getByRole('row', { name: /Pasta E2E/ })).toContainText('10 porciones'); // 2.000 ml / 200 ml
  });

  test('producir sin ingredientes suficientes lo impide y avisa', async ({ page }) => {
    await page.goto('/app/recetas');
    await page.getByRole('tab', { name: 'Producción' }).click();
    await elegirOpcion(page, page.getByPlaceholder('Buscar preparación…'), 'Salsa E2E');
    await page.getByLabel(/^Cantidad preparada/).fill('10000'); // pediría 8.000 g y solo hay 3.400
    await expect(page.getByText(/Tomate E2E: 8\.000 g — solo hay 3\.400/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Registrar producción' })).toBeDisabled();
  });

  test('vender el plato (por una cuenta de mesa) descuenta la salsa, no el tomate', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir cuenta en Mesa 2' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir cuenta' }).click();
    await page.getByRole('button', { name: 'Agregar Pasta E2E' }).click();
    const extras = page.getByRole('dialog', { name: 'Pasta E2E' }); // un plato con modificadores pide la selección
    await extras.getByLabel('Cantidad').fill('2');
    await extras.getByRole('button', { name: 'Agregar' }).click();
    await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
    await page.getByRole('dialog', { name: 'Cobrar · Mesa 2' }).getByRole('button', { name: /^Cobrar \$/ }).click();
    await page.getByRole('dialog', { name: 'Cobro registrado' }).getByRole('button', { name: 'Volver a las mesas' }).click();

    await page.goto('/app/inventario');
    await expect(page.getByRole('row', { name: /Salsa E2E/ })).toContainText('1.600 ml preparados'); // 2.000 − 2 × 200
    await expect(page.getByRole('row', { name: /Tomate E2E/ })).toContainText('3.400 g'); // intacto
  });

  test('un lote ya usado no se puede deshacer', async ({ page }) => {
    await page.goto('/app/recetas');
    await page.getByRole('tab', { name: 'Producción' }).click();
    await page.getByRole('button', { name: /Deshacer la producción/ }).first().click();
    await page.getByRole('dialog', { name: 'Deshacer producción' }).getByRole('button', { name: 'Deshacer producción' }).click();
    await expect(page.getByText(/Ya se usó parte de este lote/)).toBeVisible();
  });

  test('el conteo físico encuentra 100 g menos de tomate y las desviaciones lo comparan con lo que debió gastarse', async ({ page }) => {
    await page.goto('/app/ajustes');
    await page.getByRole('tab', { name: 'Conteo físico' }).click();
    await page.getByPlaceholder('Código o nombre…').fill('Tomate');
    await page.getByLabel('Contado de Tomate E2E').fill('3300'); // el sistema dice 3.400
    await page.getByRole('button', { name: 'Revisar y confirmar' }).click();
    await page.getByRole('dialog', { name: 'Confirmar conteo físico' }).getByRole('button', { name: 'Aplicar conteo' }).click();
    await expect(page.getByText('Stock corregido.')).toBeVisible();
    await page.getByRole('dialog', { name: 'Conteo registrado' }).getByRole('button', { name: 'Cerrar', exact: true }).last().click();

    await page.getByRole('tab', { name: 'Desviaciones' }).click();
    const fila = page.getByRole('row', { name: /Tomate E2E/ });
    await expect(fila).toContainText('1.600 g'); // lo que debió gastarse: producción de 2 litros
    await expect(fila).toContainText('-100 g'); // faltante al contar
    await expect(fila).toContainText('Faltante');
    await expect(fila).toContainText('6,3%'); // 100 / 1.600
    await ver(page, '12-desviaciones');
    await expect(page.getByText('Faltante al contar').locator('..')).toContainText('200'); // 100 g × $2
    // «Solo faltantes» deja únicamente lo problemático.
    await page.getByLabel('Solo faltantes').check();
    await expect(page.getByRole('row', { name: /Tomate E2E/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Salsa E2E/ })).toHaveCount(0);
  });

  test('la auditoría registra la producción', async ({ page }) => {
    await page.goto('/app/auditoria');
    await page.getByLabel('Módulo').selectOption('Recetas');
    await expect(page.getByRole('row', { name: /Registró una producción por lotes/ })).toContainText('Salsa E2E');
  });
});
