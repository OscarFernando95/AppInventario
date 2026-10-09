const { test, expect } = require('@playwright/test');
const { CAFE, entrar, ver } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

const menu = (page) => page.getByRole('navigation', { name: 'Navegación principal' });
const enHoras = (page, horas) => page.evaluate((h) => {
  const d = new Date(Date.now() + h * 3_600_000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}, horas);

test.describe('Café E2E: estaciones, cuenta por comensal, plano, pesos de propina, ranking y etiquetas', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
  });

  test('el administrador crea la estación «Barra» y asigna la gaseosa a ella', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Configurar mesas' }).click();
    const config = page.getByRole('dialog', { name: 'Configurar mesas' });
    await config.getByLabel('Nueva estación').fill('Barra');
    await config.getByRole('button', { name: 'Agregar estación' }).click();
    await config.getByRole('button', { name: 'Guardar estaciones' }).click();
    await expect(config.getByRole('button', { name: 'Quitar la estación Barra' })).toBeVisible();
    await expect(config.getByRole('button', { name: 'Guardar estaciones' })).toBeDisabled(); // ya quedó guardado
    await config.getByRole('button', { name: 'Listo' }).click();

    await page.goto('/app/inventario');
    await page.getByRole('button', { name: 'Editar Gaseosa E2E' }).click();
    await page.getByLabel('Estación que lo prepara').selectOption('Barra');
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await expect(page.getByRole('row', { name: /Gaseosa E2E/ })).toBeVisible();
  });

  test('acomoda las mesas en el plano (arrastrando) y el tablero las muestra donde se pusieron', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Configurar mesas' }).click();
    await page.getByRole('dialog', { name: 'Configurar mesas' }).getByRole('button', { name: 'Acomodar plano' }).click();
    const editor = page.getByRole('dialog', { name: 'Plano del local' });
    await editor.getByRole('button', { name: 'Poner Mesa 1 en el plano' }).click();

    // Arrastra la Mesa 1 hacia abajo a la derecha (las mesas nuevas nacen en el centro: se ubica una antes de poner la otra).
    const lienzo = editor.getByRole('application', { name: 'Plano del local' });
    const caja = await lienzo.boundingBox();
    const chip = editor.getByRole('button', { name: 'Mesa Mesa 1 en el plano' });
    const c = await chip.boundingBox();
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width * 0.8, caja.y + caja.height * 0.75, { steps: 8 });
    await page.mouse.up();
    await editor.getByRole('button', { name: 'Poner Mesa 2 en el plano' }).click();
    await expect(editor.getByText('Todas las mesas están en el plano.')).toBeVisible();
    await editor.getByRole('button', { name: 'Guardar plano' }).click();
    await expect(editor).toHaveCount(0);
    await page.getByRole('dialog', { name: 'Configurar mesas' }).getByRole('button', { name: 'Listo' }).click();

    await page.getByRole('radio', { name: 'Plano' }).check({ force: true });
    const plano = page.getByRole('group', { name: 'Plano del local' });
    const m1 = plano.getByRole('button', { name: 'Abrir cuenta en Mesa 1' });
    const m2 = plano.getByRole('button', { name: 'Abrir cuenta en Mesa 2' });
    await expect(m2).toBeVisible();
    const marco = await plano.boundingBox();
    const b1 = await m1.boundingBox();
    expect((b1.x + b1.width / 2 - marco.x) / marco.width).toBeGreaterThan(0.7); // quedó a la derecha
    expect((b1.y + b1.height / 2 - marco.y) / marco.height).toBeGreaterThan(0.6); // y abajo
    await ver(page, '14-plano');
    await page.getByRole('radio', { name: 'Tarjetas' }).check({ force: true });
  });

  test('un pedido con cocina y barra genera una comanda por estación y cada pantalla ve la suya', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' }).click();
    await page.getByRole('dialog').getByLabel('Comensales (opcional)').fill('2');
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir cuenta' }).click();

    await page.getByRole('button', { name: 'Agregar Pan artesanal' }).click();
    await page.getByRole('dialog', { name: 'Pan artesanal' }).getByRole('button', { name: 'Agregar' }).click();
    await page.getByRole('button', { name: 'Agregar Gaseosa E2E' }).click();
    await page.getByRole('button', { name: /^Enviar \(2\)/ }).click();
    await expect(page.getByText(/Comandas #\d+ \(Cocina\) y #\d+ \(Barra\) enviadas a cocina/)).toBeVisible();

    await menu(page).getByRole('link', { name: 'Cocina', exact: true }).click();
    await page.getByRole('tab', { name: /^Barra/ }).click();
    const barra = page.getByRole('article', { name: /de Mesa 1$/ });
    await expect(barra).toHaveCount(1);
    await expect(barra).toContainText('Gaseosa E2E');
    await expect(barra).toContainText('Barra');
    await expect(barra).not.toContainText('Pan artesanal');
    await page.getByRole('tab', { name: /^Cocina/ }).click();
    await expect(page.getByRole('article', { name: /de Mesa 1$/ }).last()).toContainText('Pan artesanal');
  });

  test('pide para dos personas y cobra a cada una lo suyo; al pagar todo, las comandas salen de cocina', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' }).click();
    // Lo enviado antes era «para todos»: se lo asignamos a la persona 1; luego se pide para la persona 2.
    await page.getByLabel('Persona de Pan artesanal').selectOption('1');
    await page.getByRole('radio', { name: 'Persona 2' }).check({ force: true });
    await page.getByRole('button', { name: 'Agregar Gaseosa E2E' }).click();
    const pedido = page.getByRole('region', { name: 'Cuenta' });
    await expect(pedido.getByText('Por persona')).toBeVisible();
    await expect(pedido).toContainText('Persona 1');
    await expect(pedido).toContainText('Persona 2');
    await ver(page, '14-por-persona');

    await page.getByRole('button', { name: 'Cobrar lo de la persona 2' }).click();
    const cobro = page.getByRole('dialog', { name: 'Cobrar · Mesa 1' });
    await expect(cobro.getByRole('button', { name: /^Cobrar \$/ })).toContainText('3.000'); // solo su gaseosa
    await cobro.getByRole('button', { name: /^Cobrar \$/ }).click();
    const hecho = page.getByRole('dialog', { name: 'Cobro registrado' });
    await expect(hecho).toContainText('Falta por cobrar');
    await hecho.getByRole('button', { name: 'Seguir con la cuenta' }).click();

    await page.getByRole('button', { name: 'Cobrar', exact: true }).click(); // el resto: lo de la persona 1 y lo compartido
    await page.getByRole('dialog', { name: 'Cobrar · Mesa 1' }).getByRole('button', { name: /^Cobrar \$/ }).click();
    const final = page.getByRole('dialog', { name: 'Cobro registrado' });
    await expect(final).toContainText('La cuenta quedó cobrada');
    await final.getByRole('button', { name: 'Volver a las mesas' }).click();

    // Cocina ya no tiene pendiente nada de esa cuenta: con una sola estación activa desaparecen las pestañas.
    await page.goto('/app/cocina');
    await expect(page.getByRole('tab', { name: /^Barra/ })).toHaveCount(0);
  });

  test('el recordatorio de una reserva abre WhatsApp con el mensaje listo', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Nueva reserva' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Nueva reserva' });
    await dialogo.getByLabel(/^A nombre de/).fill('Marta Ruiz');
    await dialogo.getByLabel('Teléfono').fill('300 555 1234');
    await dialogo.getByLabel(/^Día y hora/).fill(await enHoras(page, 2));
    await dialogo.getByLabel(/^Personas/).fill('3');
    await dialogo.getByRole('button', { name: 'Guardar reserva' }).click();
    const enlace = page.getByRole('link', { name: 'Recordar la reserva de Marta Ruiz por WhatsApp' });
    await expect(enlace).toBeVisible();
    const href = await enlace.getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/573005551234\?text=/);
    expect(decodeURIComponent(href)).toContain('Hola Marta Ruiz');
    expect(decodeURIComponent(href)).toContain('3 personas');
    await page.getByRole('button', { name: 'Cancelar la reserva de Marta Ruiz' }).click();
  });

  test('con pesos distintos, «Repartir según los pesos» da a cada quien en proporción', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Configurar mesas' }).click();
    const config = page.getByRole('dialog', { name: 'Configurar mesas' });
    await config.getByLabel('Peso de Carlos Cajero').fill('2');
    await config.getByRole('button', { name: 'Guardar pesos' }).click();
    await expect(config.getByRole('button', { name: 'Guardar pesos' })).toBeDisabled();
    await config.getByRole('button', { name: 'Listo' }).click();

    await page.goto('/app/caja');
    await page.getByRole('button', { name: /Sacar dinero/ }).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Sacar dinero de la caja' });
    await dialogo.getByRole('radio', { name: /Entregar propinas/ }).check({ force: true });
    await dialogo.getByLabel('Monto ($)').fill('1000');
    await dialogo.getByRole('button', { name: 'Repartir según los pesos' }).click();
    const ana = Number(await dialogo.getByLabel('Parte de Ana Admin Café').inputValue());
    const carlos = Number(await dialogo.getByLabel('Parte de Carlos Cajero').inputValue());
    expect(carlos).toBeCloseTo(ana * 2, 1); // pesa el doble
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('a quién avisar de las alertas y el ranking de pérdidas del mes', async ({ page }) => {
    await page.goto('/app/ajustes');
    await page.getByRole('tab', { name: 'Desviaciones' }).click();
    await page.getByLabel('Avisar a (WhatsApp)').fill('300 111 2233');
    await page.getByLabel('Avisar a (correo)').fill('dueno@cafe.co');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByLabel('Avisar a (correo)')).toHaveValue('dueno@cafe.co');

    await page.getByRole('radio', { name: 'Entre conteos' }).check({ force: true });
    const wa = page.getByRole('link', { name: 'Avisar por WhatsApp' });
    await expect(wa).toBeVisible();
    expect(await wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/573001112233\?text=/);
    expect(await page.getByRole('link', { name: 'Avisar por correo' }).getAttribute('href')).toMatch(/^mailto:dueno@cafe\.co\?subject=/);

    await page.getByRole('radio', { name: 'Ranking del mes' }).check({ force: true });
    await expect(page.getByText('Perdido en el mes')).toBeVisible();
    await expect(page.getByRole('row', { name: /Tomate E2E/ })).toBeVisible();
    await ver(page, '14-ranking');
  });

  test('imprime la etiqueta de un lote sin errores y marca cuál usar primero', async ({ page }) => {
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await page.goto('/app/recetas');
    await page.getByRole('tab', { name: 'Producción' }).click();
    await expect(page.getByRole('region', { name: 'Lotes en existencia' })).toContainText('Usar primero');
    await page.getByRole('button', { name: /Imprimir la etiqueta del lote/ }).first().click();
    await page.waitForTimeout(500);
    expect(errores).toEqual([]);
  });

  test('la auditoría deja constancia de estaciones, pesos, plano y contactos', async ({ page }) => {
    await page.goto('/app/auditoria');
    await page.getByLabel('Módulo').selectOption('Mesas');
    for (const accion of ['Cambió las estaciones de preparación', 'Cambió el reparto de propinas', 'Acomodó el plano del local']) {
      await expect(page.getByRole('row', { name: new RegExp(accion) }).first()).toBeVisible();
    }
    await page.getByLabel('Módulo').selectOption('Inventario');
    await expect(page.getByRole('row', { name: /Cambió a quién se avisa de las alertas/ }).first()).toBeVisible();
  });
});
