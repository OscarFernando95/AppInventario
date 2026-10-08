const { test, expect } = require('@playwright/test');
const { TIENDA, entrar, cambiarModulo } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

const cambiarCaja = (browser, habilitar) => cambiarModulo(browser, TIENDA.nombre, 'Caja', habilitar);

test.describe('Tienda E2E (comercio): la caja es opcional y el cambio se ve sin cerrar sesión', () => {
  test('sin el módulo Caja el POS vende sin pedir abrir caja', async ({ page }) => {
    await entrar(page, TIENDA.admin, TIENDA.clave);
    await expect(page.getByRole('link', { name: 'Caja', exact: true })).toHaveCount(0);

    // Datos mínimos por la API de la sesión abierta (la empresa activa sale de /auth/me).
    const me = await (await page.request.get('/api/auth/me')).json();
    const cabecera = { 'X-Empresa-Id': String(me.usuario.empresas[0].id) };
    const producto = await page.request.post('/api/productos', {
      headers: cabecera,
      data: { codigo: 'CAM', nombre_producto: 'Camiseta básica', precio_unitario: 50000, porcentaje_iva: 0, stock_actual: 10 },
    });
    expect(producto.ok()).toBeTruthy();
    const cliente = await page.request.post('/api/clientes', { headers: cabecera, data: { nombre: 'Cliente Tienda', documento: '555666777' } });
    expect(cliente.ok()).toBeTruthy();

    await page.goto('/app/ventas');
    await expect(page.getByText('No tienes una caja abierta')).toHaveCount(0);
    await page.getByRole('button', { name: /Iniciar POS/ }).click();
    await page.getByRole('button', { name: 'Cliente Tienda' }).click();
    await page.getByText('Camiseta básica').first().click();
    await page.getByRole('button', { name: /Emitir Factura/ }).click();
    await expect(page.getByText(/Factura #FACT-\d+ registrada/)).toBeVisible();
  });

  test('al habilitar Caja aparece sin volver a iniciar sesión y entonces sí exige abrirla', async ({ page, browser }) => {
    await entrar(page, TIENDA.admin, TIENDA.clave);
    await page.goto('/app/ventas');
    await expect(page.getByRole('button', { name: /Iniciar POS/ })).toBeEnabled();

    await cambiarCaja(browser, true);

    await page.reload(); // misma sesión, sin pasar por el login
    await expect(page.getByRole('link', { name: 'Caja', exact: true })).toBeVisible();
    await expect(page.getByText('No tienes una caja abierta')).toBeVisible();
    await expect(page.getByRole('button', { name: /Iniciar POS/ })).toBeDisabled();
  });

  test('al quitar Caja otra vez deja de exigirla', async ({ page, browser }) => {
    await entrar(page, TIENDA.admin, TIENDA.clave);
    await page.goto('/app/ventas');
    await expect(page.getByRole('button', { name: /Iniciar POS/ })).toBeDisabled();

    await cambiarCaja(browser, false);

    await page.reload();
    await expect(page.getByRole('link', { name: 'Caja', exact: true })).toHaveCount(0);
    await expect(page.getByText('No tienes una caja abierta')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Iniciar POS/ })).toBeEnabled();
  });
});
