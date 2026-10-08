const { test, expect } = require('@playwright/test');
const { CAFE, entrar, ver } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

/** "… 59 porciones …" -> 59 (lo que se puede preparar del plato, leído de Inventario). */
async function porcionesDePan(page) {
  await page.goto('/app/inventario');
  const texto = await page.getByRole('row', { name: /Pan artesanal/ }).innerText();
  return Number(texto.match(/([\d.]+) porciones/)[1].replace('.', ''));
}

test.describe('Café E2E: devolución parcial de una venta', () => {
  let porciones0;

  test('vende 2 panes en efectivo (en la caja abierta del administrador)', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    porciones0 = await porcionesDePan(page);

    await page.goto('/app/caja');
    const antes = await page.getByText('Efectivo esperado').locator('..').innerText();
    expect(antes).toContain('35.100');

    await page.goto('/app/ventas');
    await page.getByRole('button', { name: /Iniciar POS/ }).click();
    await page.getByRole('button', { name: 'Cliente Mostrador' }).click();
    await page.getByText('Pan artesanal').first().click();
    await page.getByRole('dialog', { name: /Personalizar Pan artesanal/ }).getByRole('button', { name: 'Agregar al carrito' }).click();
    await page.getByRole('button', { name: 'Aumentar cantidad de Pan artesanal' }).click();
    await page.getByRole('button', { name: /Emitir Factura/ }).click();
    await expect(page.getByText(/Total \$\s?23\.800/)).toBeVisible(); // 2 × 11.900
    await page.keyboard.press('Escape');

    expect(await porcionesDePan(page)).toBe(porciones0 - 2);
  });

  test('devuelve 1 pan sin reingresarlo: el dinero sale de la caja y el inventario no se toca', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/ventas');
    await page.getByRole('button', { name: /Devolver productos de la factura/ }).first().click();

    const dialogo = page.getByRole('dialog', { name: 'Devolver productos' });
    await dialogo.getByLabel('Cantidad a devolver de Pan artesanal').fill('1');
    await expect(dialogo.getByLabel('Reingresar Pan artesanal al inventario')).not.toBeChecked(); // un plato preparado se desecha
    await dialogo.getByLabel('Motivo').fill('El pan llegó frío');
    const resumen = dialogo.getByRole('status', { name: 'Resumen de la devolución' });
    await expect(resumen).toContainText('11.900');
    await expect(dialogo.getByLabel('Cómo se devuelve el dinero')).toHaveValue('CAJA');
    await ver(page, '09-devolucion');
    await dialogo.getByRole('button', { name: 'Registrar devolución' }).click();

    const hecha = page.getByRole('dialog', { name: 'Devolución registrada' });
    await expect(hecha).toContainText('del efectivo de tu caja');
    const [nota] = await Promise.all([
      page.waitForEvent('download', (d) => d.suggestedFilename().startsWith('NotaDevolucion_')),
      hecha.getByRole('button', { name: 'Descargar nota de devolución' }).click(),
    ]);
    expect(nota.suggestedFilename()).toMatch(/^NotaDevolucion_DEV-\d{4}_\d{4}-\d{2}-\d{2}\.pdf$/);
    await nota.delete();
    await hecha.getByRole('button', { name: 'Cerrar', exact: true }).last().click();

    await expect(page.getByText('DEV. PARCIAL')).toBeVisible();
    await page.goto('/app/caja');
    await expect(page.getByText('Efectivo esperado').locator('..')).toContainText('47.000'); // 35.100 + 23.800 − 11.900
    await expect(page.getByText('Devolución', { exact: true }).first()).toBeVisible();
    expect(await porcionesDePan(page)).toBe(porciones0 - 2); // el pan desechado no volvió a la cocina
  });

  test('devuelve el segundo pan reingresándolo: la venta queda DEVUELTA y el pan vuelve al inventario', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/ventas');
    await page.getByRole('button', { name: /Devolver productos de la factura/ }).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Devolver productos' });

    await expect(dialogo.getByLabel('Cantidad a devolver de Pan artesanal')).toHaveAttribute('max', '1'); // ya se devolvió 1 de 2
    await dialogo.getByLabel('Cantidad a devolver de Pan artesanal').fill('1');
    await dialogo.getByLabel('Reingresar Pan artesanal al inventario').check();
    await dialogo.getByLabel('Motivo').fill('Se reutiliza en el menú del día');
    await dialogo.getByRole('button', { name: 'Registrar devolución' }).click();
    await page.getByRole('dialog', { name: 'Devolución registrada' }).getByRole('button', { name: 'Cerrar', exact: true }).last().click();

    await expect(page.getByText('DEVUELTA')).toBeVisible();
    const fila = page.getByRole('row').filter({ hasText: 'DEVUELTA' });
    await expect(fila.getByRole('button', { name: /Devolver productos de la factura/ })).toHaveCount(0); // ya no hay nada que devolver
    await expect(page.getByRole('button', { name: /Anular la factura/ }).first()).toBeVisible(); // otras ventas sí se pueden anular
    expect(await porcionesDePan(page)).toBe(porciones0 - 1);

    // Detalle de la venta: las dos devoluciones, cada una con su nota.
    await page.goto('/app/ventas');
    await page.getByRole('button', { name: /Ver detalle de la factura/ }).first().click();
    const detalle = page.getByRole('dialog', { name: /Visualizador|Detalle|Factura/ }).or(page.getByText(/Devoluciones \(/).locator('..'));
    await expect(page.getByText(/Devoluciones \(\$\s?23\.800 en total\)/)).toBeVisible();
    await expect(page.getByText(/El pan llegó frío/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nota PDF' })).toHaveCount(2);
    expect(detalle).toBeTruthy();
  });

  test('el balance, la auditoría y los permisos reflejan la devolución', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/caja');
    await expect(page.getByRole('region', { name: 'Dinero de la empresa' })).toContainText('Devoluciones a clientes');

    await page.goto('/app/auditoria');
    await page.getByLabel('Módulo').selectOption('Ventas');
    const filas = page.getByRole('row', { name: /Registró una devolución/ });
    await expect(filas).toHaveCount(2);
    await expect(filas.first()).toContainText('Ana Admin Café');
    await expect(page.getByRole('row', { name: /Registró una devolución.*llegó frío/ })).toContainText('de la caja');
  });

  test('el cajero ve las ventas pero no puede devolver (decide el administrador)', async ({ page }) => {
    await entrar(page, CAFE.cajero, CAFE.clave);
    await page.goto('/app/ventas');
    await expect(page.getByRole('button', { name: /Ver detalle de la factura/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Devolver productos/ })).toHaveCount(0);
  });
});
