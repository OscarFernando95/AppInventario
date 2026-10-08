const { test, expect } = require('@playwright/test');
const { CAFE, entrar, ver, cambiarModulo } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

const CLIENTE = 'Cliente Crédito';

test.describe('Café E2E: cuentas por cobrar y por pagar', () => {
  test('habilita Cuentas por cobrar y fija un cupo de crédito de $20.000 a un cliente nuevo', async ({ page, browser }) => {
    await cambiarModulo(browser, CAFE.nombre, 'Cuentas por cobrar', true);

    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/clientes');
    await page.getByRole('button', { name: 'Nuevo Cliente' }).click();
    await page.getByLabel('Nombre o Razón Social').fill(CLIENTE);
    await page.getByLabel('Número de documento').fill('555111222');
    await page.getByLabel(/^Cupo de crédito/).fill('20000');
    await page.getByRole('button', { name: 'Dar de Alta' }).click();
    await expect(page.getByText(CLIENTE)).toBeVisible();
  });

  test('vende a crédito un pan: queda por cobrar; la segunda venta supera el cupo y se rechaza', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/ventas');

    const venderUnPan = async () => {
      await page.getByRole('button', { name: /Iniciar POS/ }).click();
      await page.getByRole('button', { name: CLIENTE }).click();
      await page.getByText('Pan artesanal').first().click();
      await page.getByRole('dialog', { name: /Personalizar Pan artesanal/ }).getByRole('button', { name: 'Agregar al carrito' }).click();
      await page.locator('select:has(option[value="2"])').selectOption('2'); // Forma de pago: a crédito
      await page.getByLabel('Plazo (días)').fill('15');
      await expect(page.getByText(/Queda por cobrar/)).toContainText('11.900');
      await page.getByRole('button', { name: /Emitir Factura/ }).click();
    };

    await venderUnPan();
    await expect(page.getByText(/Factura #FACT-\d+ registrada/)).toBeVisible();
    await page.keyboard.press('Escape');

    // Segunda: 11.900 + 11.900 > cupo de 20.000.
    await venderUnPan();
    await expect(page.getByText(/Supera el cupo de crédito de Cliente Crédito/)).toBeVisible();
    await ver(page, '08-cupo');
    await page.keyboard.press('Escape');
  });

  test('cuentas por cobrar: abono en efectivo entra a la caja; se anula; se paga por transferencia', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);

    // Efectivo esperado de la caja del administrador antes de cobrar.
    await page.goto('/app/caja');
    await expect(page.getByText('Efectivo esperado').locator('..')).toContainText('36.100');

    await page.goto('/app/cuentas-por-cobrar');
    await expect(page.getByRole('region', { name: 'Resumen de cartera' })).toContainText('11.900');
    const fila = page.getByRole('row', { name: new RegExp(CLIENTE) });
    await expect(fila).toContainText('11.900');
    await expect(fila).toContainText('Vence en 15 d');

    // Abono parcial de $5.000 en efectivo
    await fila.getByRole('button', { name: /Abonar la factura/ }).click();
    let dialogo = page.getByRole('dialog', { name: 'Registrar abono' });
    await expect(dialogo.getByLabel(/^Monto/)).toHaveValue('11900'); // sugiere el saldo
    await expect(dialogo).toContainText('El efectivo entra a tu caja abierta');
    await dialogo.getByLabel(/^Monto/).fill('5000');
    await dialogo.getByRole('button', { name: 'Registrar abono' }).click();
    await expect(page.getByText(/Saldo pendiente: \$\s?6\.900/)).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(CLIENTE) })).toContainText('6.900');
    await ver(page, '08-cartera');

    await page.goto('/app/caja');
    await expect(page.getByText('Abonos en efectivo').locator('..')).toContainText('5.000');
    await expect(page.getByText('Efectivo esperado').locator('..')).toContainText('41.100'); // 36.100 + 5.000

    // Anular el abono: la deuda sube y el efectivo vuelve.
    await page.goto('/app/cuentas-por-cobrar');
    await page.getByRole('button', { name: /Ver abonos de la factura/ }).click();
    await page.getByRole('button', { name: /Anular el abono de/ }).click();
    await expect(page.getByText(/Abono anulado/)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).last().click();
    await expect(page.getByRole('row', { name: new RegExp(CLIENTE) })).toContainText('11.900');
    await page.goto('/app/caja');
    await expect(page.getByText('Efectivo esperado').locator('..')).toContainText('36.100');

    // Estado de cuenta en PDF
    await page.goto('/app/cuentas-por-cobrar');
    const [pdf] = await Promise.all([
      page.waitForEvent('download', (d) => d.suggestedFilename().startsWith('EstadoCuenta_Cliente_')),
      page.getByRole('button', { name: `Estado de cuenta de ${CLIENTE}` }).click(),
    ]);
    expect(pdf.suggestedFilename()).toMatch(/^EstadoCuenta_Cliente_Cliente_Cr.dito_\d{4}-\d{2}-\d{2}\.pdf$/u);
    await pdf.delete();

    // Pago total por transferencia: queda pagada y sale de "Con saldo".
    await page.getByRole('button', { name: /Abonar la factura/ }).click();
    dialogo = page.getByRole('dialog', { name: 'Registrar abono' });
    await dialogo.getByLabel('Medio de pago').selectOption('47');
    await dialogo.getByRole('button', { name: 'Registrar abono' }).click();
    await expect(page.getByText(/la venta quedó pagada/)).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(CLIENTE) })).toHaveCount(0);
    await page.getByLabel('Estado').selectOption('PAGADAS');
    await expect(page.getByRole('row', { name: new RegExp(CLIENTE) })).toContainText('PAGADA');
  });

  test('compra a crédito en Compras: queda en Cuentas por pagar y se paga (caja y banco)', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/compras');
    await page.getByRole('button', { name: 'Iniciar Compra' }).click();
    await page.getByPlaceholder(/Buscar proveedor/).fill('Molinos');
    await page.getByRole('button', { name: /Molinos del Valle/ }).first().click();
    await page.getByText('Queso mozzarella').first().click();
    await page.getByRole('spinbutton', { name: 'Cantidad de Queso mozzarella' }).fill('100'); // 100 g × $30 = $3.000

    // A crédito: ya no se puede "pagar de la caja" al registrar.
    await page.getByRole('radio', { name: 'A crédito' }).check();
    await page.getByLabel('Plazo del crédito en días').fill('20');
    await expect(page.getByText(/Queda una deuda con el proveedor/)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Pagar en efectivo de la caja/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Procesar e Ingresar' }).click();
    await expect(page.getByRole('row', { name: /Molinos del Valle/ }).first()).toBeVisible();

    await page.goto('/app/cuentas-por-pagar');
    await expect(page.getByRole('region', { name: 'Resumen de cartera' })).toContainText('3.000');
    const fila = page.getByRole('row', { name: /Molinos del Valle/ });
    await expect(fila).toContainText('Vence en 20 d');

    // Pago parcial de $1.000 con efectivo de la caja
    await page.goto('/app/caja');
    await expect(page.getByText('Efectivo esperado').locator('..')).toContainText('36.100');
    await page.goto('/app/cuentas-por-pagar');
    await fila.getByRole('button', { name: /Pagar la compra/ }).click();
    let dialogo = page.getByRole('dialog', { name: 'Registrar pago' });
    await dialogo.getByLabel('¿Con qué se paga?').selectOption('CAJA');
    await dialogo.getByLabel(/^Monto/).fill('1000');
    await dialogo.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(page.getByText(/Saldo pendiente: \$\s?2\.000/)).toBeVisible();
    await page.goto('/app/caja');
    await expect(page.getByText('Efectivo esperado').locator('..')).toContainText('35.100'); // salió de la caja
    await expect(page.getByText('Pago proveedor')).toBeVisible();

    // El resto por banco: no toca la caja.
    await page.goto('/app/cuentas-por-pagar');
    await page.getByRole('row', { name: /Molinos del Valle/ }).getByRole('button', { name: /Pagar la compra/ }).click();
    dialogo = page.getByRole('dialog', { name: 'Registrar pago' });
    await dialogo.getByRole('button', { name: 'Registrar pago' }).click(); // saldo completo por defecto, origen "Banco"
    await expect(page.getByText(/la compra quedó pagada/)).toBeVisible();
    await expect(page.getByRole('row', { name: /Molinos del Valle/ })).toHaveCount(0);
    await page.goto('/app/caja');
    await expect(page.getByText('Efectivo esperado').locator('..')).toContainText('35.100');
  });

  test('el balance y la auditoría cuentan abonos y pagos; el dashboard resume la cartera', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/caja');
    const panel = page.getByRole('region', { name: 'Dinero de la empresa' });
    await expect(panel).toContainText('Abonos de clientes');
    await expect(panel).toContainText('Pagos a proveedores');
    await ver(page, '08-balance');

    await page.goto('/app/auditoria');
    await page.getByLabel('Módulo').selectOption('Cuentas por cobrar');
    await expect(page.getByRole('row', { name: /Recibió un abono de un cliente/ }).first()).toContainText('Cliente Crédito');
    await page.getByLabel('Módulo').selectOption('Cuentas por pagar');
    await expect(page.getByRole('row', { name: /Pagó a un proveedor/ }).first()).toContainText('Molinos del Valle');
    await page.getByLabel('Módulo').selectOption('Ventas');
    await expect(page.getByRole('row', { name: /Registró una venta.*a crédito \(15 días\)/ })).toBeVisible();

    await page.goto('/app');
    await expect(page.getByRole('button', { name: /Te deben/ })).toContainText('Nada vencido');
    await expect(page.getByRole('button', { name: /Debes/ })).toContainText('Nada vencido');
  });

  test('el cajero cobra abonos, pero no ve ni gestiona las deudas con proveedores', async ({ page }) => {
    await entrar(page, CAFE.cajero, CAFE.clave);
    await expect(page.getByRole('link', { name: 'Cuentas por cobrar' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cuentas por pagar' })).toHaveCount(0);
    await page.goto('/app/cuentas-por-pagar');
    await expect(page).toHaveURL(/\/app$/);
    await page.goto('/app/cuentas-por-cobrar');
    await expect(page.getByRole('heading', { name: 'Cuentas por cobrar' }).first()).toBeVisible();
  });
});
