const { test, expect } = require('@playwright/test');
const { CAFE, entrar, ver } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

test.describe('Café E2E: anulación de ventas (solicitud del cajero, aprobación y anulación directa)', () => {
  test('el cajero vende un pan y pide anularlo: la venta sigue activa hasta que el administrador decida', async ({ page }) => {
    await entrar(page, CAFE.cajero, CAFE.clave); // Carlos tiene su caja abierta desde el flujo 04
    await page.goto('/app/ventas');
    await page.getByRole('button', { name: /Iniciar POS/ }).click();
    await page.getByRole('button', { name: 'Cliente Mostrador' }).click();
    await page.getByText('Pan artesanal').first().click();
    await page.getByRole('dialog', { name: /Personalizar Pan artesanal/ }).getByRole('button', { name: 'Agregar al carrito' }).click();
    await page.getByRole('button', { name: /Emitir Factura/ }).click();
    await expect(page.getByText(/Factura #FACT-\d+ registrada/)).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /Solicitar anulación de la factura/ }).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Solicitar anulación' });
    await expect(dialogo).toContainText('el administrador revisa tu solicitud');
    await dialogo.getByLabel('Motivo').fill('El cliente se arrepintió');
    await dialogo.getByRole('button', { name: 'Enviar solicitud' }).click();

    await expect(page.getByText(/Solicitud enviada/)).toBeVisible();
    await expect(page.getByText('Anulación pedida')).toBeVisible();
    await expect(page.getByText(/esperando al administrador/)).toBeVisible();
    // El cajero no puede resolverla.
    await expect(page.getByRole('button', { name: /Aprobar anulación/ })).toHaveCount(0);
  });

  test('el administrador aprueba: la venta queda ANULADA y el pan vuelve al inventario', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/inventario');
    await expect(page.getByRole('row', { name: /Pan artesanal/ })).toContainText('23 porciones'); // 2.300 g con la venta del cajero

    await page.goto('/app/ventas');
    await expect(page.getByText(/1 solicitud\(es\) de anulación por resolver/)).toBeVisible();
    await expect(page.getByText(/El cliente se arrepintió/)).toBeVisible();
    await ver(page, '06-solicitud');
    await page.getByRole('button', { name: /Aprobar anulación de la factura/ }).click();

    await expect(page.getByText(/Solicitud aprobada/)).toBeVisible();
    await expect(page.getByRole('row', { name: /ANULADA/ })).toHaveCount(1); // solo la del cajero, por ahora
    await expect(page.getByText(/solicitud\(es\) de anulación por resolver/)).toHaveCount(0);

    await page.goto('/app/inventario');
    await expect(page.getByRole('row', { name: /Pan artesanal/ })).toContainText('24 porciones');
  });

  test('anulación directa de una venta en efectivo de una caja ya cerrada: pide abrir caja y registra la devolución', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/ventas');
    const anular = async () => {
      await page.getByRole('row', { name: /FACT-0001/ }).getByRole('button', { name: 'Anular la factura 1' }).click();
      const dialogo = page.getByRole('dialog', { name: 'Anular venta' });
      await dialogo.getByLabel('Motivo').fill('Venta de prueba duplicada');
      await dialogo.getByRole('button', { name: 'Anular venta' }).click();
      return dialogo;
    };

    // Sin caja abierta no hay de dónde devolver el efectivo.
    const dialogo = await anular();
    await expect(dialogo.getByText(/abre tu caja/i)).toBeVisible();
    await dialogo.getByRole('button', { name: 'Volver' }).click();

    await page.goto('/app/caja');
    await page.getByRole('button', { name: 'Abrir caja' }).first().click();
    await page.getByRole('dialog').getByLabel('Base inicial en efectivo ($)').fill('50000');
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir caja' }).click();
    await expect(page.getByText('CAJA ABIERTA')).toBeVisible();

    await page.goto('/app/ventas');
    await anular();
    await expect(page.getByText(/Venta anulada/)).toBeVisible();
    await expect(page.getByRole('row', { name: /FACT-0001/ })).toContainText('ANULADA');

    // La devolución de $13.900 salió de la caja abierta; el turno cerrado no se tocó.
    await page.goto('/app/caja');
    await expect(page.getByText('Devolución de la venta #1')).toBeVisible();
    await expect(page.getByText('Efectivo esperado').locator('..')).toContainText('36.100'); // 50.000 − 13.900
  });

  test('la auditoría cuenta quién pidió, quién anuló y por qué', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/auditoria');
    await page.getByLabel('Módulo').selectOption('Ventas');
    await expect(page.getByRole('row', { name: /Pidió anular una venta/ })).toContainText('Carlos Cajero');
    const aprobada = page.getByRole('row', { name: /Anuló una venta.*solicitada por Carlos Cajero/ });
    await expect(aprobada).toContainText('El cliente se arrepintió');
    const directa = page.getByRole('row', { name: /Anuló una venta.*dinero devuelto de la caja/ });
    await expect(directa).toContainText('Venta de prueba duplicada');
    await expect(directa).toContainText('Ana Admin Café');
  });
});
