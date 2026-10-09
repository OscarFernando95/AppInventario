const { test, expect } = require('@playwright/test');
const { CAFE, entrar } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

// iPad en vertical con pantalla táctil: el mesero toma el pedido con el dedo.
test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });

const MIN_TACTIL = 40; // px: alto mínimo cómodo para el dedo en los botones de uso frecuente

const sinDesborde = async (page) => {
  const ancho = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, ventana: window.innerWidth }));
  expect(ancho.doc, 'la página no debe desplazarse hacia los lados').toBeLessThanOrEqual(ancho.ventana + 1);
};

/** Botones visibles más bajos que MIN_TACTIL (con su nombre) dentro de `ambito`. */
const botonesChicos = (ambito) => ambito.evaluate((raiz, min) => {
  const chicos = [];
  for (const b of raiz.querySelectorAll('button:not([disabled]), a[href], [role="switch"], [role="tab"], [role="radio"]')) {
    const r = b.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < min) chicos.push(`${(b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40)} (${Math.round(r.height)}px)`);
  }
  return chicos;
}, MIN_TACTIL);

test.describe('Café E2E: el mesero en una tablet', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
  });

  test('el tablero de mesas cabe en la pantalla y sus botones se pueden tocar', async ({ page }) => {
    await page.goto('/app/mesas');
    await expect(page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' })).toBeVisible();
    await sinDesborde(page);
    expect(await botonesChicos(page.locator('main'))).toEqual([]);
  });

  test('abre una cuenta, pide con un toque, envía y cobra sin salirse de la pantalla', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' }).tap();
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir cuenta' }).tap();
    await expect(page.getByRole('region', { name: 'Cuenta' })).toBeVisible();
    await sinDesborde(page);

    await page.getByRole('button', { name: 'Agregar Gaseosa E2E' }).tap();
    await expect(page.getByRole('region', { name: 'Cuenta' })).toContainText('1 × Gaseosa E2E');
    expect(await botonesChicos(page.locator('main'))).toEqual([]);

    await page.getByRole('button', { name: 'Cobrar', exact: true }).tap();
    const cobro = page.getByRole('dialog', { name: 'Cobrar · Mesa 1' });
    await expect(cobro).toBeVisible();
    const caja = await cobro.boundingBox();
    expect(caja.x).toBeGreaterThanOrEqual(0);
    expect(caja.x + caja.width).toBeLessThanOrEqual(820);
    await cobro.getByRole('button', { name: /^Cobrar \$/ }).tap();
    await page.getByRole('dialog', { name: 'Cobro registrado' }).getByRole('button', { name: 'Volver a las mesas' }).tap();
  });

  test('el punto de venta (POS) también cabe en la tablet', async ({ page }) => {
    await page.goto('/app/ventas');
    await page.getByRole('button', { name: /Iniciar POS/ }).tap();
    await expect(page.getByText('Gaseosa E2E').first()).toBeVisible();
    await sinDesborde(page);
  });
});
