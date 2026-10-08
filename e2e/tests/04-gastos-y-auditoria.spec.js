const { test, expect } = require('@playwright/test');
const { CAFE, entrar, ver } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

test.describe('Café E2E: gastos sin proveedor y auditoría gerencial', () => {
  test('registra un gasto SIN proveedor, lo anula y deja otro activo', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/gastos');

    await page.getByRole('button', { name: 'Registrar gasto' }).click();
    let dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Descripción').fill('Recibo de energía');
    await dialogo.getByLabel('Monto ($)').fill('150000');
    // Sin caja abierta no se puede pagar "de la caja": la casilla está deshabilitada y lo explica.
    await expect(dialogo.getByRole('checkbox', { name: /Pagado en efectivo de la caja/ })).toBeDisabled();
    await expect(dialogo.getByText(/No tienes caja abierta/)).toBeVisible();
    await dialogo.getByRole('button', { name: 'Registrar gasto' }).click();

    let fila = page.getByRole('row', { name: /Recibo de energía/ });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText('Otro medio');
    await expect(fila).toContainText('ACTIVO');

    // Anular (solo administrador)
    await page.getByRole('button', { name: 'Anular gasto Recibo de energía' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Anular gasto' }).click();
    fila = page.getByRole('row', { name: /Recibo de energía/ });
    await expect(fila).toContainText('ANULADO');

    // Otro gasto, esta vez con categoría y proveedor opcional sin usar.
    await page.getByRole('button', { name: 'Registrar gasto' }).click();
    dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Categoría').selectOption('ARRIENDO');
    await dialogo.getByLabel('Descripción').fill('Arriendo del local');
    await dialogo.getByLabel('Monto ($)').fill('2000000');
    await dialogo.getByRole('button', { name: 'Registrar gasto' }).click();
    await expect(page.getByRole('row', { name: /Arriendo del local/ })).toContainText('ACTIVO');

    // Los totales no cuentan lo anulado: 2.000.000 del arriendo + 10.000 del domiciliario (ya pagado de la caja).
    await expect(page.getByText('Total gastos').locator('..')).toContainText('2.010.000');

    // El dashboard suma los gastos del mes.
    await page.goto('/app');
    await expect(page.getByText('Gastos Mes').locator('..').locator('..')).toContainText('2.010.000');
  });

  test('la auditoría cuenta qué hizo cada usuario, a qué hora y en qué empresa', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/auditoria');
    await expect(page.getByRole('heading', { name: 'Actividad de la empresa' })).toBeVisible();

    const fila = (texto) => page.getByRole('row', { name: texto });
    const venta = fila(/Registró una venta/);
    await expect(venta).toContainText('Ana Admin Café');
    await expect(venta).toContainText('Café E2E');
    await expect(venta).toContainText(/Venta #1 por \$\s?13\.900 a Cliente Mostrador \(1 ítem\)/);

    await expect(fila(/Abrió caja/)).toContainText(/base de \$\s?50\.000/);
    await expect(fila(/Cerró caja/)).toContainText(/faltaron \$\s?900/);
    await expect(fila(/Sacó dinero de la caja/)).toContainText('Consignación al banco');
    await expect(fila(/Registró un gasto.*Domiciliario/)).toContainText('pagado de la caja');
    await expect(fila(/Anuló un gasto/)).toContainText('Recibo de energía');
    await expect(fila(/Creó un plato/)).toContainText('Pan artesanal');
    await expect(fila(/Creó un insumo.*Harina/)).toBeVisible();
    await expect(fila(/Registró una compra/)).toContainText('Molinos del Valle');

    // Es la vista gerencial: nada técnico.
    const texto = await page.locator('main').innerText();
    for (const tecnico of ['api_error', 'login_ok', 'unhandled', 'ADVERTENCIA', 'Nivel']) {
      expect(texto).not.toContain(tecnico);
    }
    await ver(page, '04-auditoria');

    // Filtros: por módulo y por usuario.
    await page.getByLabel('Módulo').selectOption('Caja');
    await expect(page.getByRole('row', { name: /Registró una venta/ })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Abrió caja/ })).toBeVisible();
    await page.getByLabel('Módulo').selectOption('');
    await page.getByLabel('Usuario').selectOption({ label: 'Ana Admin Café' });
    await expect(page.getByRole('row', { name: /Registró una venta/ })).toBeVisible();
  });

  test('el cajero ve su propia actividad limitada: sin auditoría y obligado a abrir caja', async ({ page }) => {
    await entrar(page, CAFE.cajero, CAFE.clave);

    // Auditoría es del administrador: no aparece en el menú y la ruta lo devuelve al inicio.
    await expect(page.getByRole('link', { name: 'Auditoría' })).toHaveCount(0);
    await page.goto('/app/auditoria');
    await expect(page).toHaveURL(/\/app$/);

    // Empresa con módulo Caja: sin caja abierta no puede vender.
    await page.goto('/app/ventas');
    await expect(page.getByText('No tienes una caja abierta')).toBeVisible();
    await expect(page.getByRole('button', { name: /Iniciar POS/ })).toBeDisabled();

    // Abre SU caja y ya puede vender.
    await page.goto('/app/caja');
    await page.getByRole('button', { name: 'Abrir caja' }).first().click();
    await page.getByRole('dialog').getByLabel('Base inicial en efectivo ($)').fill('20000');
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir caja' }).click();
    await expect(page.getByText('CAJA ABIERTA')).toBeVisible();
    // El cajero no ve el balance de la empresa (solo el administrador).
    await expect(page.getByRole('region', { name: 'Dinero de la empresa' })).toHaveCount(0);
    await page.goto('/app/ventas');
    await expect(page.getByRole('button', { name: /Iniciar POS/ })).toBeEnabled();
  });

  test('el administrador ve en la auditoría que Carlos abrió caja', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/auditoria');
    await page.getByLabel('Usuario').selectOption({ label: 'Carlos Cajero' });
    const fila = page.getByRole('row', { name: /Abrió caja/ });
    await expect(fila).toContainText('Carlos Cajero');
    await expect(fila).toContainText(/base de \$\s?20\.000/);
  });
});
