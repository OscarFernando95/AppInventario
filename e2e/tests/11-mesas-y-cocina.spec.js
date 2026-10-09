const { test, expect } = require('@playwright/test');
const { CAFE, entrar, ver, cambiarModulo } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

const menu = (page) => page.getByRole('navigation', { name: 'Navegación principal' });

/** Abre una caja con base 0 si el usuario no tiene una abierta (cobrar la exige). */
async function asegurarCaja(page) {
  await page.goto('/app/caja');
  const sin = page.getByText('No tienes una caja abierta');
  if (await sin.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Abrir caja' }).first().click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Base inicial en efectivo ($)').fill('0');
    await dialogo.getByRole('button', { name: 'Abrir caja' }).click();
  }
  await expect(page.getByText('CAJA ABIERTA')).toBeVisible();
}

test.describe('Café E2E: mesas, comandas a cocina, división de cuenta y propina', () => {
  test('el backoffice habilita Cocina (que arrastra Mesas) y el administrador ve ambos módulos', async ({ page, browser }) => {
    await cambiarModulo(browser, CAFE.nombre, 'Cocina', true);
    await entrar(page, CAFE.admin, CAFE.clave);
    await expect(menu(page).getByRole('link', { name: 'Mesas', exact: true })).toBeVisible();
    await expect(menu(page).getByRole('link', { name: 'Cocina', exact: true })).toBeVisible();
  });

  test('configura dos mesas y crea la bebida del menú', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/mesas');
    await expect(page.getByText('Aún no hay mesas')).toBeVisible();
    await page.getByRole('button', { name: 'Configurar mesas' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Configurar mesas' });
    for (const nombre of ['Mesa 1', 'Mesa 2']) {
      await dialogo.getByLabel('Nueva mesa').fill(nombre);
      await dialogo.getByRole('button', { name: 'Agregar', exact: true }).click();
      await expect(dialogo.getByText(nombre, { exact: true })).toBeVisible();
    }
    await dialogo.getByRole('button', { name: 'Listo' }).click();
    await expect(page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir cuenta en Mesa 2' })).toBeVisible();
    await expect(page.getByText('0 de 2 mesas ocupadas')).toBeVisible();

    await page.goto('/app/inventario');
    await page.getByRole('button', { name: 'Nuevo Producto' }).click();
    await page.getByLabel('¿Qué vas a registrar?').selectOption('VENTA');
    await page.getByLabel('Código SKU').fill('GAS');
    await page.getByLabel('Descripción').fill('Gaseosa E2E');
    await page.getByLabel('Precio de Venta ($)').fill('3000');
    await page.getByLabel('Stock Físico Inicial').fill('20');
    await page.getByRole('button', { name: 'Guardar en Base' }).click();
    await expect(page.getByRole('row', { name: /Gaseosa E2E/ })).toBeVisible();
  });

  test('abre la cuenta de la Mesa 1 y pide un pan con extra queso, una nota y dos gaseosas', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' }).click();
    await page.getByRole('dialog').getByLabel('Comensales (opcional)').fill('2');
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir cuenta' }).click();
    await expect(page.getByRole('heading', { name: /Mesa 1/ })).toBeVisible();

    // Un plato con extras abre la selección de extras y la nota para cocina.
    await page.getByRole('button', { name: 'Agregar Pan artesanal' }).click();
    const extras = page.getByRole('dialog', { name: 'Pan artesanal' });
    await extras.getByLabel(/^Extra queso/).check();
    await extras.getByLabel('Nota para cocina (opcional)').fill('Bien tostado');
    await extras.getByRole('button', { name: 'Agregar' }).click();

    // Una bebida sin extras se agrega con un toque; el segundo toque suma a la misma línea.
    await page.getByRole('button', { name: 'Agregar Gaseosa E2E' }).click();
    await page.getByRole('button', { name: 'Agregar Gaseosa E2E' }).click();

    const pedido = page.getByRole('region', { name: 'Cuenta' });
    await expect(pedido).toContainText('1 × Pan artesanal');
    await expect(pedido).toContainText('+ Extra queso');
    await expect(pedido).toContainText('Bien tostado');
    await expect(pedido).toContainText('2 × Gaseosa E2E');
    await expect(pedido.getByText('Total').locator('..')).toContainText('19.900'); // 11.900 + 2.000 + 2 × 3.000
    await ver(page, '11-cuenta');
  });

  test('envía a cocina: la comanda aparece en la pantalla de cocina y se marca lista y entregada', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' }).click();
    // Con pantalla de cocina no se imprime por omisión.
    await expect(page.getByLabel('Imprimir la comanda al enviar')).not.toBeChecked();
    await page.getByRole('button', { name: /^Enviar \(2\)/ }).click();
    await expect(page.getByText(/Comanda #\d+ enviada a cocina/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Cuenta' })).toContainText('En preparación');

    await menu(page).getByRole('link', { name: 'Cocina', exact: true }).click();
    const tarjeta = page.getByRole('article', { name: /de Mesa 1$/ });
    await expect(tarjeta).toContainText('1 × Pan artesanal');
    await expect(tarjeta).toContainText('+ Extra queso');
    await expect(tarjeta).toContainText('» Bien tostado');
    await expect(tarjeta).toContainText('2 × Gaseosa E2E');
    await ver(page, '11-cocina');

    await tarjeta.getByRole('button', { name: 'Lista', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Listas' }).getByRole('article', { name: /de Mesa 1$/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Pendientes' }).getByRole('article')).toHaveCount(0);

    // El mesero ve en la cuenta que ya salió.
    await page.goto('/app/mesas');
    await expect(page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' })).toContainText('Lista en cocina');

    await page.goto('/app/cocina');
    await page.getByRole('region', { name: 'Listas' }).getByRole('button', { name: 'Entregada' }).click();
    await expect(page.getByRole('article')).toHaveCount(0);
  });

  test('un pedido ya enviado solo se quita anulándolo con motivo', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' }).click();
    await page.getByRole('button', { name: 'Agregar Gaseosa E2E' }).click(); // una tercera
    const pedido = page.getByRole('region', { name: 'Cuenta' });
    await expect(pedido).toContainText('1 × Gaseosa E2E');
    await page.getByRole('button', { name: /^Enviar \(1\)/ }).click();
    await expect(page.getByText(/Comanda #\d+ enviada/)).toBeVisible();

    // No hay botón de quitar en lo enviado, solo «Anular»; exige un motivo.
    await pedido.getByRole('listitem').filter({ hasText: '1 × Gaseosa E2E' }).getByRole('button', { name: 'Anular' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Anular pedido ya enviado' });
    await expect(dialogo.getByRole('button', { name: 'Anular pedido' })).toBeDisabled();
    await dialogo.getByLabel('Motivo').fill('El cliente se arrepintió');
    await dialogo.getByRole('button', { name: 'Anular pedido' }).click();
    await expect(pedido).toContainText('Anulado: El cliente se arrepintió');
    await expect(pedido.getByText('Total').locator('..')).toContainText('19.900'); // lo anulado no cuenta
  });

  test('divide la cuenta: una gaseosa con propina, y luego el resto', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await asegurarCaja(page);
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' }).click();

    await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
    const cobro = page.getByRole('dialog', { name: 'Cobrar · Mesa 1' });
    await cobro.getByRole('button', { name: 'Ninguno' }).click();
    await cobro.getByLabel('Cantidad a cobrar de Gaseosa E2E').fill('1');
    await cobro.getByRole('radio', { name: /^10 %/ }).check({ force: true });
    await expect(cobro).toContainText('Total a pagar');
    await expect(cobro.getByRole('button', { name: /^Cobrar \$/ })).toContainText('3.300'); // 3.000 + 10 % de propina
    // Dividir en partes iguales solo calcula.
    await cobro.getByLabel('Dividir en partes iguales (solo calcula)').fill('3');
    await expect(cobro).toContainText('Cada uno paga');
    await cobro.getByRole('button', { name: /^Cobrar \$/ }).click();

    const hecho = page.getByRole('dialog', { name: 'Cobro registrado' });
    await expect(hecho).toContainText('3.000');
    await expect(hecho).toContainText('300 de propina');
    await expect(hecho).toContainText('Falta por cobrar');
    await hecho.getByRole('button', { name: 'Seguir con la cuenta' }).click();

    const pedido = page.getByRole('region', { name: 'Cuenta' });
    await expect(pedido).toContainText('Ya cobrado');
    await expect(pedido).toContainText('Cobrado · venta');

    // El resto: pan con extra queso + la otra gaseosa, sin propina.
    await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
    await page.getByRole('dialog', { name: 'Cobrar · Mesa 1' }).getByRole('button', { name: /^Cobrar \$/ }).click();
    const final = page.getByRole('dialog', { name: 'Cobro registrado' });
    await expect(final).toContainText('La cuenta quedó cobrada');
    await final.getByRole('button', { name: 'Volver a las mesas' }).click();
    await expect(page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' })).toBeVisible(); // la mesa quedó libre
  });

  test('la propina entra a la caja pero no a las ventas, y se entrega al personal', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/caja');
    await expect(page.getByText('Propinas en efectivo').locator('..')).toContainText('300');
    await page.getByRole('button', { name: /Sacar dinero/ }).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Sacar dinero de la caja' });
    await dialogo.getByRole('radio', { name: /Entregar propinas/ }).check({ force: true });
    await dialogo.getByLabel('Concepto').fill('Propinas del turno');
    await dialogo.getByLabel('Monto ($)').fill('300');
    await dialogo.getByRole('button', { name: 'Registrar egreso' }).click();
    await expect(page.getByText('Propinas del turno')).toBeVisible();
  });

  test('la auditoría deja constancia de la comanda, el pedido anulado y la propina', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/auditoria');
    await page.getByLabel('Módulo').selectOption('Mesas');
    await expect(page.getByRole('row', { name: /Envió una comanda a cocina/ }).first()).toBeVisible();
    await expect(page.getByRole('row', { name: /Anuló un pedido ya enviado a cocina/ })).toContainText('El cliente se arrepintió');
    await page.getByLabel('Módulo').selectOption('Ventas');
    await expect(page.getByRole('row', { name: /Mesa 1 · propina/ })).toBeVisible();
  });
});
