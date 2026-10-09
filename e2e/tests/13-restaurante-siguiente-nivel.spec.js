const { test, expect } = require('@playwright/test');
const { CAFE, entrar, ver, elegirOpcion } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

const menu = (page) => page.getByRole('navigation', { name: 'Navegación principal' });

/** "YYYY-MM-DDTHH:mm" (hora local del navegador) dentro de `horas` horas, para un <input type="datetime-local">. */
const enHoras = (page, horas) => page.evaluate((h) => {
  const d = new Date(Date.now() + h * 3_600_000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}, horas);

async function asegurarCaja(page) {
  await page.goto('/app/caja');
  if (await page.getByText('No tienes una caja abierta').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Abrir caja' }).first().click();
    await page.getByRole('dialog').getByLabel('Base inicial en efectivo ($)').fill('0');
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir caja' }).click();
  }
  await expect(page.getByText('CAJA ABIERTA')).toBeVisible();
}

test.describe('Café E2E: reservas, unir cuentas, aviso de cocina, propinas, lotes y desviaciones', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
  });

  test('una reserva marca la mesa en el tablero y, al llegar, se sienta y abre la cuenta', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Nueva reserva' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Nueva reserva' });
    await dialogo.getByLabel(/^A nombre de/).fill('Familia Pérez');
    await dialogo.getByLabel('Teléfono').fill('3001112233');
    await dialogo.getByLabel(/^Día y hora/).fill(await enHoras(page, 1));
    await dialogo.getByLabel(/^Personas/).fill('4');
    await dialogo.getByLabel('Mesa', { exact: true }).selectOption({ label: 'Mesa 2' });
    await dialogo.getByRole('button', { name: 'Guardar reserva' }).click();

    await expect(page.getByRole('region', { name: 'Reservas de hoy' })).toContainText('Familia Pérez');
    await expect(page.getByRole('button', { name: 'Abrir cuenta en Mesa 2' })).toContainText('Reservada');
    await ver(page, '13-reservas');

    // La misma mesa no admite otra reserva casi a la misma hora.
    await page.getByRole('button', { name: 'Nueva reserva' }).click();
    const otra = page.getByRole('dialog', { name: 'Nueva reserva' });
    await otra.getByLabel(/^A nombre de/).fill('Otro grupo');
    await otra.getByLabel(/^Día y hora/).fill(await enHoras(page, 1.5));
    await otra.getByLabel('Mesa', { exact: true }).selectOption({ label: 'Mesa 2' });
    await otra.getByRole('button', { name: 'Guardar reserva' }).click();
    await expect(otra).toContainText('ya está reservada para Familia Pérez');
    await otra.getByRole('button', { name: 'Cancelar' }).click();

    await page.getByRole('button', { name: 'Sentar la reserva de Familia Pérez' }).click();
    const sentar = page.getByRole('dialog', { name: 'Sentar a Familia Pérez' });
    await expect(sentar.getByLabel(/^Mesa libre/)).toHaveValue(/\d+/); // viene la mesa reservada
    await sentar.getByRole('button', { name: 'Abrir cuenta' }).click();
    await expect(page.getByRole('heading', { name: /Mesa 2/ })).toBeVisible();
    await page.getByRole('button', { name: 'Agregar Gaseosa E2E' }).click();
    await expect(page.getByRole('region', { name: 'Cuenta' })).toContainText('1 × Gaseosa E2E');
  });

  test('une la cuenta de la Mesa 2 con la de la Mesa 1: todo queda en una y la otra mesa libre', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir cuenta' }).click();
    await page.getByRole('button', { name: 'Agregar Gaseosa E2E' }).click();

    await page.getByRole('button', { name: 'Unir con otra cuenta' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Unir con otra cuenta' });
    const valor = await dialogo.locator('option', { hasText: 'Mesa 2' }).getAttribute('value');
    await dialogo.getByLabel(/^Cuenta que se une a esta/).selectOption(valor);
    await dialogo.getByRole('button', { name: 'Unir cuentas' }).click();
    await expect(page.getByText('Cuentas unidas')).toBeVisible();
    const pedido = page.getByRole('region', { name: 'Cuenta' });
    await expect(pedido.getByRole('listitem').filter({ hasText: 'Gaseosa E2E' })).toHaveCount(2);
    await expect(pedido.getByText('Total').locator('..')).toContainText('6.000');

    await page.getByRole('button', { name: 'Mesas', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Abrir cuenta en Mesa 2' })).toBeVisible(); // quedó libre
  });

  test('cuando cocina marca la comanda como lista, el mesero ve un aviso en el tablero', async ({ page, browser }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' }).click();
    await page.getByRole('button', { name: /^Enviar \(2\)/ }).click();
    await expect(page.getByText(/Comanda #\d+ enviada a cocina/)).toBeVisible();
    await page.getByRole('button', { name: 'Mesas', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' })).toContainText('En preparación');

    // En otra sesión (la cocina) se marca lista.
    const contexto = await browser.newContext();
    const cocina = await contexto.newPage();
    await entrar(cocina, CAFE.admin, CAFE.clave);
    await cocina.goto('/app/cocina');
    // (puede haber comandas viejas de la misma mesa sin marcar: la nueva es la última)
    await cocina.getByRole('article', { name: /de Mesa 1$/ }).last().getByRole('button', { name: 'Lista', exact: true }).click();
    await expect(cocina.getByRole('region', { name: 'Listas' }).getByRole('article')).not.toHaveCount(0);
    await contexto.close();

    // El tablero se refresca solo cada 10 s y avisa.
    await expect(page.getByText('Cocina terminó una comanda de Mesa 1')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' })).toContainText('Lista en cocina');
    await page.getByRole('button', { name: 'Cerrar aviso' }).first().click();
    await expect(page.getByText('Cocina terminó una comanda de Mesa 1')).toHaveCount(0);
  });

  test('la propina sugerida es configurable: al cobrar se ofrece la que fijó el administrador', async ({ page }) => {
    await asegurarCaja(page);
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Configurar mesas' }).click();
    const config = page.getByRole('dialog', { name: 'Configurar mesas' });
    await config.getByLabel('Propina sugerida al cobrar (%)').fill('12');
    await config.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(config.getByText('Hoy se sugiere 12 %')).toBeVisible();
    await config.getByRole('button', { name: 'Listo' }).click();

    await page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' }).click();
    await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
    const cobro = page.getByRole('dialog', { name: 'Cobrar · Mesa 1' });
    await expect(cobro.getByRole('radio', { name: /^10 %/ })).toHaveCount(0);
    await cobro.getByRole('radio', { name: /^12 %/ }).check({ force: true });
    await expect(cobro).toContainText('Total a pagar');
    await cobro.getByRole('button', { name: /^Cobrar \$/ }).click(); // 6.000 + 12 % = 720 → 700
    const hecho = page.getByRole('dialog', { name: 'Cobro registrado' });
    await expect(hecho).toContainText('700 de propina');
    await hecho.getByRole('button', { name: 'Volver a las mesas' }).click();
  });

  test('entrega las propinas repartidas entre dos personas y el informe dice cuánto recibió cada una', async ({ page }) => {
    await page.goto('/app/caja');
    await page.getByRole('button', { name: /Sacar dinero/ }).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Sacar dinero de la caja' });
    await dialogo.getByRole('radio', { name: /Entregar propinas/ }).check({ force: true });
    await dialogo.getByLabel('Concepto').fill('Propinas repartidas');
    await dialogo.getByLabel('Monto ($)').fill('1000');
    await dialogo.getByLabel('Ana Admin Café').check();
    await dialogo.getByLabel('Carlos Cajero').check();
    await dialogo.getByRole('button', { name: 'Dividir en partes iguales' }).click();
    await expect(dialogo.getByLabel('Parte de Ana Admin Café')).toHaveValue('500');
    await expect(dialogo.getByLabel('Parte de Carlos Cajero')).toHaveValue('500');
    // Si no suma, no deja.
    await dialogo.getByLabel('Parte de Carlos Cajero').fill('300');
    await dialogo.getByRole('button', { name: 'Registrar egreso' }).click();
    await expect(dialogo).toContainText('deben coincidir');
    await dialogo.getByLabel('Parte de Carlos Cajero').fill('500');
    await dialogo.getByRole('button', { name: 'Registrar egreso' }).click();
    await expect(dialogo).toHaveCount(0);

    const seccion = page.getByRole('region', { name: 'Propinas' });
    await expect(seccion).toContainText('Carlos Cajero');
    await expect(seccion.getByRole('listitem').filter({ hasText: 'Carlos Cajero' })).toContainText('500');
    await expect(seccion).toContainText('Entregadas');
  });

  test('una preparación con vida útil muestra el vencimiento de cada lote y sugiere cuánto producir', async ({ page }) => {
    await page.goto('/app/inventario');
    await page.getByRole('button', { name: 'Editar Salsa E2E' }).click();
    await page.getByLabel('Vida útil de un lote (días)').fill('3');
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await expect(page.getByRole('row', { name: /Salsa E2E/ })).toBeVisible();

    await page.goto('/app/recetas');
    await page.getByRole('tab', { name: 'Producción' }).click();
    await elegirOpcion(page, page.getByPlaceholder('Buscar preparación…'), 'Salsa E2E');
    await page.getByLabel(/^Cantidad preparada/).fill('1000');
    await page.getByRole('button', { name: 'Registrar producción' }).click();
    await expect(page.getByText(/Producción registrada: 1\.000 ml/)).toBeVisible();

    const lotes = page.getByRole('region', { name: 'Lotes en existencia' });
    await expect(lotes).toContainText('Salsa E2E');
    await expect(lotes).toContainText('vence'); // el lote nuevo trae su fecha
    await expect(lotes).toContainText('Vigente');
    await ver(page, '13-lotes');

    // «Cuánto producir»: con las ventas de ayer y hoy y 30 días de cobertura falta salsa; el botón rellena el formulario.
    const sug = page.getByRole('region', { name: 'Cuánto producir' });
    await sug.getByLabel('Promediar ventas de (días)').fill('1');
    await sug.getByLabel('Tener cubiertos (días)').fill('30');
    const boton = sug.getByRole('button', { name: /^Producir .* de Salsa E2E/ });
    await expect(boton).toBeVisible();
    await boton.click();
    await expect(page.getByLabel(/^Cantidad preparada/)).not.toHaveValue('');
  });

  test('un faltante sobre el límite frente al conteo anterior dispara la alerta', async ({ page }) => {
    await page.goto('/app/ajustes');
    await page.getByRole('tab', { name: 'Conteo físico' }).click();
    await page.getByPlaceholder('Código o nombre…').fill('Tomate');
    // El sistema trae el tomate tras producir 1.000 ml más de salsa (−800 g); en el estante faltan 100 g.
    const sistema = await page.getByRole('row', { name: /Tomate E2E/ }).getByRole('cell').nth(1).innerText();
    const gramos = Number(sistema.replace(/[^\d]/g, ''));
    await page.getByLabel('Contado de Tomate E2E').fill(String(gramos - 100));
    await page.getByRole('button', { name: 'Revisar y confirmar' }).click();
    await page.getByRole('dialog', { name: 'Confirmar conteo físico' }).getByRole('button', { name: 'Aplicar conteo' }).click();
    const resultado = page.getByRole('dialog', { name: 'Conteo registrado' });
    await expect(resultado.getByRole('alert')).toContainText('Faltantes sobre el límite de 5 %');
    await expect(resultado.getByRole('alert')).toContainText('Tomate E2E');
    await resultado.getByRole('button', { name: 'Cerrar', exact: true }).last().click();

    await page.getByRole('tab', { name: 'Desviaciones' }).click();
    await page.getByLabel('Entre conteos').check({ force: true });
    const fila = page.getByRole('row', { name: /Tomate E2E/ }).first();
    await expect(fila).toContainText('Alerta');
    await expect(fila).toContainText('contra el del');
    await expect(page.getByRole('status').filter({ hasText: 'faltante sobre el límite' })).toBeVisible();

    // Subir el límite por encima del faltante apaga la alerta.
    await page.getByLabel('Alertar si falta más de (%)').fill('50');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Límite de alerta actual: 50 %')).toBeVisible();
    await expect(page.getByRole('row', { name: /Tomate E2E/ }).first()).not.toContainText('Alerta');
    await page.getByLabel('Alertar si falta más de (%)').fill('5');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Límite de alerta actual: 5 %')).toBeVisible();
  });

  test('la auditoría deja constancia de reservas, unión de cuentas, reparto y alerta', async ({ page }) => {
    await page.goto('/app/auditoria');
    await page.getByLabel('Módulo').selectOption('Mesas');
    for (const accion of ['Registró una reserva', 'Sentó una reserva', 'Unió dos cuentas', 'Cambió la propina sugerida']) {
      await expect(page.getByRole('row', { name: new RegExp(accion) }).first()).toBeVisible();
    }
    await page.getByLabel('Módulo').selectOption('Caja');
    await expect(page.getByRole('row', { name: /repartidas entre 2 personas/ })).toBeVisible();
    await page.getByLabel('Módulo').selectOption('Inventario');
    await expect(page.getByRole('row', { name: /Alerta: faltante de inventario sobre el límite/ }).first()).toBeVisible();
  });
});
