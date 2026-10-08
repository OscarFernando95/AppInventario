const { test, expect } = require('@playwright/test');
const { CAFE, entrar, ver, elegirOpcion } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

test.describe('Café E2E: modificadores, caja, venta de un plato, egresos y cierre con PDF', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
  });

  test('crea el modificador "Extra queso" (suma al precio y gasta queso)', async ({ page }) => {
    await page.goto('/app/recetas');
    await page.getByRole('tab', { name: 'Modificadores' }).click();
    await page.getByRole('button', { name: 'Nuevo modificador' }).click();

    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel(/^Nombre/).fill('Extra queso');
    await dialogo.getByLabel('Precio extra ($)').fill('2000');
    await dialogo.getByRole('button', { name: 'Agregar ingrediente' }).click();
    await elegirOpcion(page, dialogo.getByPlaceholder('Buscar…'), 'Queso');
    await dialogo.getByRole('spinbutton', { name: /^Cant\./ }).fill('20');
    await dialogo.getByRole('button', { name: 'Guardar' }).click();

    const fila = page.getByRole('row', { name: /Extra queso/ });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText(/\+\$\s?2\.000/); // el formato COP usa un espacio duro después del $
    await expect(fila).toContainText('Queso mozzarella');
  });

  test('abrir caja: sugiere el capital inicial y arranca con la base indicada', async ({ page }) => {
    await page.goto('/app/caja');
    await expect(page.getByText('No tienes una caja abierta')).toBeVisible();
    await page.getByRole('button', { name: 'Abrir caja' }).first().click();

    const dialogo = page.getByRole('dialog');
    // Primera caja de la empresa: se sugiere el capital inicial que fijó el súper administrador.
    await expect(dialogo.getByRole('button', { name: /Usar \$\s?1\.000\.000/ })).toBeVisible();
    await dialogo.getByLabel('Base inicial en efectivo ($)').fill('50000');
    await dialogo.getByRole('button', { name: 'Abrir caja' }).click();

    await expect(page.getByText('CAJA ABIERTA')).toBeVisible();
    await expect(page.getByText('Efectivo esperado').locator('..')).toContainText('50.000');
  });

  test('vende un pan con extra queso en el POS: descuenta harina y queso', async ({ page }) => {
    await page.goto('/app/ventas');
    await page.getByRole('button', { name: /Iniciar POS/ }).click();

    await page.getByRole('button', { name: 'Cliente Mostrador' }).click(); // cliente frecuente
    await page.getByText('Pan artesanal').first().click(); // tarjeta del plato
    const selector = page.getByRole('dialog', { name: /Personalizar Pan artesanal/ });
    await selector.getByText('Extra queso').click();
    await ver(page, '03-pos-modificadores');
    await selector.getByRole('button', { name: 'Agregar al carrito' }).click();

    await expect(page.getByText('Pan artesanal (Extra queso)')).toBeVisible();
    await page.getByRole('button', { name: /Emitir Factura/ }).click();
    await expect(page.getByText(/Factura #FACT-0001 registrada/)).toBeVisible();
    await expect(page.getByText(/Total \$\s?13\.900/)).toBeVisible(); // 11.900 + 2.000 de extra
    await page.getByRole('button', { name: /Nueva venta/ }).click().catch(() => {});
  });

  test('el inventario refleja la venta: 100 g de harina y 20 g de queso menos', async ({ page }) => {
    await page.goto('/app/inventario');
    await expect(page.getByRole('row', { name: /Harina de trigo/ })).toContainText('2.400 g');
    await expect(page.getByRole('row', { name: /Queso mozzarella/ })).toContainText('480 g');
    await expect(page.getByRole('row', { name: /Pan artesanal/ })).toContainText('24 porciones');
  });

  test('saca dinero de la caja: un retiro y el pago de un gasto en efectivo', async ({ page }) => {
    await page.goto('/app/caja');
    await expect(page.getByText('Efectivo esperado').locator('..')).toContainText('63.900'); // 50.000 + 13.900

    // Retiro de efectivo
    await page.getByRole('button', { name: 'Sacar dinero / pagar' }).click();
    let dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Concepto').fill('Consignación al banco');
    await dialogo.getByLabel('Monto ($)').fill('20000');
    await dialogo.getByRole('button', { name: 'Registrar egreso' }).click();
    await expect(page.getByText('Consignación al banco')).toBeVisible();

    // Gasto pagado en efectivo
    await page.getByRole('button', { name: 'Sacar dinero / pagar' }).click();
    dialogo = page.getByRole('dialog');
    await dialogo.getByText('Pagar un gasto').click();
    await dialogo.getByLabel('Categoría').selectOption('TRANSPORTE');
    await dialogo.getByLabel('Descripción del gasto').fill('Domiciliario');
    await dialogo.getByLabel('Monto ($)').fill('10000');
    await dialogo.getByRole('button', { name: 'Registrar egreso' }).click();

    await expect(page.getByText('Egresos del turno')).toBeVisible();
    await expect(page.getByText('Domiciliario')).toBeVisible();
    await expect(page.getByText('Egresos de caja').locator('..')).toContainText('30.000');
    await expect(page.getByText('Efectivo esperado').locator('..')).toContainText('33.900'); // 63.900 − 30.000
  });

  test('no deja sacar más efectivo del que hay', async ({ page }) => {
    await page.goto('/app/caja');
    await page.getByRole('button', { name: 'Sacar dinero / pagar' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Concepto').fill('Demasiado');
    await dialogo.getByLabel('Monto ($)').fill('5000000');
    await dialogo.getByRole('button', { name: 'Registrar egreso' }).click();
    await expect(dialogo.getByText(/no alcanza/)).toBeVisible();
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('cierra la caja con una diferencia y descarga el PDF del cierre', async ({ page }) => {
    await page.goto('/app/caja');
    await page.getByRole('button', { name: 'Cerrar caja' }).first().click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('33.900'); // efectivo esperado
    await dialogo.getByLabel('Efectivo contado ($)').fill('33000');
    await expect(dialogo.getByText(/Faltan \$\s?900/)).toBeVisible();
    await dialogo.getByRole('button', { name: 'Cerrar caja' }).click();

    const cerrada = page.getByRole('dialog', { name: 'Caja cerrada' });
    await expect(cerrada).toContainText('CAJA-0001 cerrada correctamente');
    const [descarga] = await Promise.all([
      // El PDF se abre en una pestaña (window.open) Y se guarda con su nombre: se espera esta segunda descarga.
      page.waitForEvent('download', (d) => d.suggestedFilename().startsWith('Cierre_')),
      cerrada.getByRole('button', { name: 'Descargar PDF' }).click(),
    ]);
    expect(descarga.suggestedFilename()).toMatch(/^Cierre_CAJA-0001_\d{4}-\d{2}-\d{2}\.pdf$/);
    await descarga.delete(); // no dejar el PDF en disco
    await cerrada.getByRole('button', { name: 'Cerrar', exact: true }).last().click();

    await expect(page.getByRole('row', { name: /CAJA-0001/ })).toContainText('CERRADA');
  });

  test('el dinero de la empresa se compara con el capital inicial', async ({ page }) => {
    await page.goto('/app/caja');
    const panel = page.getByRole('region', { name: 'Dinero de la empresa' });
    await expect(panel).toContainText('1.000.000'); // capital inicial
    // +13.900 de ventas − 43.333 de compra − 10.000 de gasto − 20.000 de retiro: ha disminuido
    await expect(panel).toContainText('Ha disminuido');
    await ver(page, '03-balance');
  });
});
