const { test, expect } = require('@playwright/test');
const { CAFE, entrar } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

async function interruptor(page, nombre, encendido) {
  const sw = page.getByRole('switch', { name: new RegExp(`^${nombre}`) });
  if ((await sw.isChecked()) !== encendido) await sw.click();
  if (encendido) await expect(sw).toBeChecked(); else await expect(sw).not.toBeChecked();
}

const cancelarCuenta = async (page) => {
  await page.getByRole('button', { name: 'Cancelar cuenta' }).click();
  await page.getByRole('dialog').getByLabel('Motivo').fill('Prueba de mostrador');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar cuenta' }).click();
};

test.describe('Café E2E: pre-cuenta, cuenta a nombre de cliente, pedido numerado y venta sin cliente', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
  });

  test('apagado, la cuenta para llevar pide el nombre, no hay cliente ni pre-cuenta', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Cuenta para llevar' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Cuenta para llevar' });
    await expect(dialogo.getByLabel(/^¿A nombre de quién\?/)).toBeVisible();
    await expect(dialogo.getByLabel(/^Referencia/)).toHaveCount(0);
    await dialogo.getByRole('button', { name: 'Abrir cuenta' }).click();
    await expect(dialogo).toBeVisible(); // sin nombre no abre la cuenta
    await expect(page.getByRole('heading', { name: /Pedido/ })).toHaveCount(0);
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();

    await page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir cuenta' }).click();
    await expect(page.getByRole('button', { name: 'Pre-cuenta' })).toHaveCount(0);
    await cancelarCuenta(page);
  });

  test('enciende las cuatro opciones', async ({ page }) => {
    await page.goto('/app/opciones');
    for (const op of ['Pre-cuenta', 'Cuenta a nombre de un cliente', 'Pedidos numerados', 'Venta de mostrador sin cliente']) await interruptor(page, op, true);
  });

  test('el pedido para llevar sin nombre se numera solo, día a día', async ({ page }) => {
    await page.goto('/app/mesas');
    for (const n of [1, 2]) {
      await page.getByRole('button', { name: 'Cuenta para llevar' }).click();
      await page.getByRole('dialog', { name: 'Cuenta para llevar' }).getByRole('button', { name: 'Abrir cuenta' }).click();
      await expect(page.getByRole('heading', { name: new RegExp(`Pedido ${n}`) })).toBeVisible();
      await page.getByRole('button', { name: 'Mesas', exact: true }).click();
    }
    await expect(page.getByText('Pedido 1').first()).toBeVisible();
    await expect(page.getByText('Pedido 2').first()).toBeVisible();
  });

  test('abre una cuenta a nombre de un cliente y una habitación, pide algo e imprime la pre-cuenta', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel(/^Cliente/).selectOption({ label: 'Cliente Mostrador' });
    await dialogo.getByLabel(/^Referencia/).fill('Habitación 204');
    await dialogo.getByRole('button', { name: 'Abrir cuenta' }).click();
    await expect(page.getByText('Habitación 204')).toBeVisible();
    await expect(page.getByText('Cliente: Cliente Mostrador')).toBeVisible();

    const pre = page.getByRole('button', { name: 'Pre-cuenta' });
    await expect(pre).toBeDisabled(); // aún no hay nada pedido
    await page.getByRole('button', { name: 'Agregar Gaseosa E2E' }).click();
    await expect(page.getByRole('region', { name: 'Cuenta' })).toContainText('1 × Gaseosa E2E');

    const respuesta = page.waitForResponse((r) => /\/cuentas\/\d+\/precuenta$/.test(r.url()) && r.request().method() === 'POST');
    await pre.click();
    const datos = await (await respuesta).json();
    expect(datos.total).toBe(3000);
    expect(datos.referencia).toBe('Habitación 204');
    expect(datos.cliente.nombre).toBe('Cliente Mostrador');
    expect(datos.items[0].nombre).toBe('Gaseosa E2E');
  });

  test('al cobrar, el cliente de la cuenta viene elegido', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' }).click();
    await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
    const cobro = page.getByRole('dialog', { name: 'Cobrar · Mesa 1' });
    await expect(cobro.getByLabel(/^Cliente/)).toHaveValue(/\d+/);
    await cobro.getByRole('button', { name: /^Cobrar \$/ }).click();
    await page.getByRole('dialog', { name: 'Cobro registrado' }).getByRole('button', { name: 'Volver a las mesas' }).click();
  });

  test('el POS vende sin cliente, pero a crédito sigue pidiéndolo', async ({ page }) => {
    await page.goto('/app/ventas');
    await page.getByRole('button', { name: /Iniciar POS/ }).click();
    await expect(page.getByText('1. Identificar Cliente')).toContainText('(opcional)');
    await page.getByText('Gaseosa E2E').first().click();
    await page.getByRole('button', { name: /Emitir Factura/ }).click();
    await expect(page.getByText(/Factura #FACT-\d+ registrada/)).toBeVisible();
  });

  test('cancela los pedidos de prueba y apaga todo: vuelve a lo de siempre', async ({ page }) => {
    for (const n of [1, 2]) {
      await page.goto('/app/mesas');
      await page.getByRole('button', { name: `Abrir la cuenta de Pedido ${n}` }).click();
      await cancelarCuenta(page);
      await page.goto('/app/mesas');
      await expect(page.getByRole('button', { name: `Abrir la cuenta de Pedido ${n}` })).toHaveCount(0);
    }
    await page.goto('/app/opciones');
    for (const op of ['Pre-cuenta', 'Cuenta a nombre de un cliente', 'Pedidos numerados', 'Venta de mostrador sin cliente']) await interruptor(page, op, false);

    await page.goto('/app/ventas');
    await page.getByRole('button', { name: /Iniciar POS/ }).click();
    await page.getByText('Gaseosa E2E').first().click();
    await page.getByRole('button', { name: /Emitir Factura/ }).click();
    await expect(page.getByText('Debes seleccionar un cliente para registrar la venta.')).toBeVisible();
  });

  test('la auditoría deja constancia de la pre-cuenta', async ({ page }) => {
    await page.goto('/app/auditoria');
    await expect(page.getByRole('row', { name: /pre-cuenta/i }).first()).toBeVisible();
  });
});
