const { test, expect } = require('@playwright/test');
const { CAFE, entrar, ver } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

const menu = (page) => page.getByRole('navigation', { name: 'Navegación principal' });
const OPCIONES = ['Lista de espera', 'Bloqueo de mesas', 'Tiempo de ocupación', 'Calendario de reservas'];
const interruptor = (page, nombre) => page.getByRole('switch', { name: new RegExp(`^${nombre}`) });

/** Fecha y hora local dentro de `horas` horas, en el formato de un input datetime-local. */
const enHoras = (page, horas) => page.evaluate((h) => {
  const d = new Date(Date.now() + h * 3_600_000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}, horas);

/** Abre una caja con base 0 si no hay una abierta (cobrar la exige). */
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

/** Lo que muestra una tarjeta del informe de ocupación como número (la primera cifra de la tarjeta). */
async function cifraDe(page, titulo) {
  const tarjeta = page.getByRole('group', { name: titulo });
  await expect(tarjeta).toContainText(/\d/); // espera a que llegue el informe (antes muestra «—»)
  const texto = await tarjeta.innerText();
  return Number(texto.split('\n').map((l) => l.trim()).find((l) => /^\d[\d.,]*$/.test(l)).replace(/\./g, '').replace(',', '.'));
}

test.describe('Café E2E: lista de espera, bloqueo de mesas, tiempo de ocupación y calendario de reservas', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
  });

  test('nacen apagadas: Mesas se ve como siempre y las cuatro funciones no aparecen', async ({ page }) => {
    await page.goto('/app/opciones');
    for (const op of OPCIONES) await expect(interruptor(page, op)).not.toBeChecked();

    await page.goto('/app/mesas');
    await expect(page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Reservas de hoy' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Lista de espera' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Bloquear mesas' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Ocupación' })).toHaveCount(0);
    await expect(page.getByRole('radiogroup', { name: 'Vista de las reservas' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Nueva reserva' })).toBeVisible();
  });

  test('el administrador enciende las cuatro funciones desde Opciones', async ({ page }) => {
    await page.goto('/app/opciones');
    for (const op of OPCIONES) {
      await interruptor(page, op).click(); // el interruptor cambia cuando el servidor responde
      await expect(interruptor(page, op)).toBeChecked();
    }
    await ver(page, '16-opciones');
  });

  test('lista de espera: anota, avisa por WhatsApp, saca a quien no llegó y sienta a quien ya tiene mesa', async ({ page }) => {
    await page.goto('/app/mesas');
    const lista = page.getByRole('region', { name: 'Lista de espera' });
    await expect(lista).toContainText('Nadie está esperando mesa.');

    const anotar = async (nombre, telefono, personas) => {
      await lista.getByLabel('Nombre').fill(nombre);
      await lista.getByLabel('Teléfono').fill(telefono);
      await lista.getByLabel('Personas').fill(String(personas));
      await lista.getByRole('button', { name: 'Agregar a la lista' }).click();
      await expect(lista.getByText(nombre, { exact: true })).toBeVisible();
    };
    await anotar('Laura Vega', '300 222 3344', 3);
    await anotar('Pedro Soto', '', 2);
    await anotar('Temporal Prueba', '', 1);
    await expect(lista.getByRole('heading', { name: /3 esperando/ })).toBeVisible();
    await expect(lista).toContainText(/ahora mismo|hace \d+ min/);

    // El aviso de WhatsApp sale solo para quien dejó teléfono, con el mensaje listo.
    const aviso = lista.getByRole('link', { name: 'Avisar a Laura Vega por WhatsApp' });
    await expect(aviso).toBeVisible();
    await expect(lista.getByRole('link', { name: 'Avisar a Pedro Soto por WhatsApp' })).toHaveCount(0);
    const href = await aviso.getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/573002223344\?text=/);
    expect(decodeURIComponent(href)).toContain('Hola Laura Vega, tu mesa en Café E2E ya está lista');
    await ver(page, '16-lista-espera');

    // «No llegó» y «Cancelar» los sacan de la lista.
    await lista.getByRole('button', { name: 'Pedro Soto no llegó' }).click();
    await expect(lista.getByText('Pedro Soto', { exact: true })).toHaveCount(0);
    await lista.getByRole('button', { name: 'Quitar a Temporal Prueba de la lista' }).click();
    await expect(lista.getByText('Temporal Prueba', { exact: true })).toHaveCount(0);

    // Sentar a Laura: elige una mesa libre y se abre su cuenta con 3 comensales.
    await lista.getByRole('button', { name: 'Sentar a Laura Vega' }).click();
    const sentar = page.getByRole('dialog', { name: 'Sentar a Laura Vega' });
    await sentar.getByLabel(/^Mesa libre/).selectOption({ label: 'Mesa 1' });
    await sentar.getByRole('button', { name: 'Abrir cuenta' }).click();
    await expect(page.getByRole('heading', { name: /Mesa 1/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Persona 3' })).toBeAttached(); // la cuenta nació con los 3 comensales de la lista
    await page.getByRole('button', { name: /^Mesas$/ }).first().click();
    await expect(page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Lista de espera' })).toContainText('Nadie está esperando mesa.');
  });

  test('bloqueo: no se bloquea una mesa ocupada; una bloqueada no deja abrir cuenta ni reservar ni sentar', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Bloquear mesas' }).click();
    const modal = page.getByRole('dialog', { name: 'Bloqueo de mesas' });

    // Mesa 1 tiene la cuenta de Laura abierta: no se puede bloquear ahora.
    await modal.getByLabel(/^Mesa/).selectOption({ label: 'Mesa 1' });
    await modal.getByRole('button', { name: 'Bloquear mesa' }).click();
    await expect(modal).toContainText('tiene una cuenta abierta');

    // Mesa 2 está libre: se bloquea dos horas por un evento.
    await modal.getByLabel(/^Mesa/).selectOption({ label: 'Mesa 2' });
    await modal.getByLabel('Motivo').fill('Evento privado');
    await modal.getByRole('button', { name: 'Bloquear mesa' }).click();
    await expect(modal.getByRole('button', { name: 'Quitar el bloqueo de Mesa 2' })).toBeVisible();
    await modal.getByRole('button', { name: 'Listo' }).click();

    const tarjeta = page.getByRole('group', { name: 'Mesa 2 bloqueada' });
    await expect(tarjeta).toContainText(/Bloqueada hasta \d{2}:\d{2} \(Evento privado\)/);
    await expect(page.getByRole('button', { name: 'Abrir cuenta en Mesa 2' })).toHaveCount(0); // no deja abrir cuenta
    await ver(page, '16-bloqueo');

    // Una reserva dentro del bloqueo se rechaza.
    await page.getByRole('button', { name: 'Nueva reserva' }).click();
    const reserva = page.getByRole('dialog', { name: 'Nueva reserva' });
    await reserva.getByLabel(/^A nombre de/).fill('Reserva Bloqueada');
    await reserva.getByLabel(/^Día y hora/).fill(await enHoras(page, 1));
    await reserva.getByLabel('Mesa', { exact: true }).selectOption({ label: 'Mesa 2' });
    await reserva.getByRole('button', { name: 'Guardar reserva' }).click();
    await expect(reserva).toContainText('está bloqueada');
    await reserva.getByRole('button', { name: 'Cancelar' }).click();

    // Al sentar a alguien de la lista, la mesa bloqueada ni siquiera se ofrece.
    const lista = page.getByRole('region', { name: 'Lista de espera' });
    await lista.getByLabel('Nombre').fill('Rosa Mejía');
    await lista.getByRole('button', { name: 'Agregar a la lista' }).click();
    await lista.getByRole('button', { name: 'Sentar a Rosa Mejía' }).click();
    const sentar = page.getByRole('dialog', { name: 'Sentar a Rosa Mejía' });
    await expect(sentar.getByLabel(/^Mesa libre/)).toBeVisible();
    await expect(sentar.locator('option', { hasText: 'Mesa 2' })).toHaveCount(0);
    await sentar.getByRole('button', { name: 'Volver' }).click();
    await lista.getByRole('button', { name: 'Quitar a Rosa Mejía de la lista' }).click();
    await expect(lista.getByText('Rosa Mejía', { exact: true })).toHaveCount(0);

    // Desbloquear devuelve la mesa a servicio.
    await tarjeta.getByRole('button', { name: 'Desbloquear Mesa 2' }).click();
    await expect(page.getByRole('button', { name: 'Abrir cuenta en Mesa 2' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Mesa 2 bloqueada' })).toHaveCount(0);
  });

  test('calendario de reservas: día a día, selector de fecha, vista de la semana y acciones en otro día', async ({ page }) => {
    await page.goto('/app/mesas');
    const cal = page.getByRole('region', { name: 'Calendario de reservas' });
    await expect(cal).toBeVisible();
    await expect(page.getByRole('region', { name: 'Reservas de hoy' })).toHaveCount(0); // ahora es el calendario

    // Mañana: la hora ya viene prellenada con ese día.
    await cal.getByRole('button', { name: 'Ir al día siguiente' }).click();
    await expect(cal).toContainText('No hay reservas para este día.');
    await cal.getByRole('button', { name: 'Nueva reserva' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Nueva reserva' });
    const manana = await dialogo.getByLabel(/^Día y hora/).inputValue();
    expect(manana).toMatch(/T20:00$/);
    await dialogo.getByLabel(/^A nombre de/).fill('Cena Torres');
    await dialogo.getByLabel('Teléfono').fill('300 777 8899');
    await dialogo.getByLabel(/^Personas/).fill('4');
    await dialogo.getByRole('button', { name: 'Guardar reserva' }).click();
    await expect(cal.getByText(/Cena Torres/)).toBeVisible();

    // Hoy no la tiene; el selector de fecha lleva de nuevo a mañana.
    await cal.getByRole('button', { name: 'Hoy' }).click();
    await expect(cal.getByText(/Cena Torres/)).toHaveCount(0);
    await cal.getByLabel('Fecha de las reservas').fill(manana.slice(0, 10));
    await expect(cal.getByText(/Cena Torres/)).toBeVisible();

    // Vista de la semana: 7 columnas y, tocando el día, vuelve a la lista de ese día.
    await cal.getByRole('radio', { name: 'Semana' }).check({ force: true });
    const dias = cal.locator('[aria-label^="Reservas del "]');
    await expect(dias).toHaveCount(7);
    const columna = dias.filter({ hasText: 'Cena Torres' });
    await expect(columna).toHaveCount(1);
    await expect(columna).toContainText('4 personas');
    await ver(page, '16-semana');
    await cal.getByRole('button', { name: 'Ir a la semana siguiente' }).click();
    await expect(cal.getByText(/Cena Torres/)).toHaveCount(0);
    await cal.getByRole('button', { name: 'Ir a la semana anterior' }).click();
    await columna.getByRole('button', { name: /^Ver el/ }).click();
    await expect(cal.getByRole('radio', { name: 'Día' })).toBeChecked();

    // Las acciones funcionan también en otro día: recordatorio por WhatsApp y cancelar.
    const enlace = cal.getByRole('link', { name: 'Recordar la reserva de Cena Torres por WhatsApp' });
    expect(await enlace.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/573007778899\?text=/);
    await expect(cal.getByRole('button', { name: 'Sentar la reserva de Cena Torres' })).toBeVisible();
    await expect(cal.getByRole('button', { name: 'Cena Torres no llegó' })).toBeVisible();
    await cal.getByRole('button', { name: 'Cancelar la reserva de Cena Torres' }).click();
    await expect(cal).toContainText('Cancelada');
  });

  test('tiempo de ocupación: una cuenta que se cobra suma al informe y a su mesa', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('tab', { name: 'Ocupación' }).click();
    const informe = page.getByRole('region', { name: 'Ocupación de las mesas' });
    await expect(informe.getByRole('group', { name: 'Cuentas cobradas' })).toBeVisible();
    const antes = await cifraDe(page, 'Cuentas cobradas');
    expect(antes).toBeGreaterThan(0); // las pruebas anteriores ya cobraron cuentas de mesa
    const filaAntes = await informe.getByRole('row', { name: /^Mesa 1 / }).innerText();
    const cuentasMesa1Antes = Number(filaAntes.split('\t')[1]);

    // Se cobra la cuenta de Laura (Mesa 1): una gaseosa.
    await asegurarCaja(page);
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' }).click();
    await page.getByRole('button', { name: 'Agregar Gaseosa E2E' }).click();
    await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
    await page.getByRole('dialog', { name: 'Cobrar · Mesa 1' }).getByRole('button', { name: /^Cobrar \$/ }).click();
    await page.getByRole('dialog', { name: 'Cobro registrado' }).getByRole('button', { name: 'Volver a las mesas' }).click();

    await page.getByRole('tab', { name: 'Ocupación' }).click();
    await expect(informe.getByRole('group', { name: 'Cuentas cobradas' })).toContainText(new RegExp(`Cuentas cobradas\\s*${antes + 1}\\s*En`));
    const filaDespues = await informe.getByRole('row', { name: /^Mesa 1 / }).innerText();
    expect(Number(filaDespues.split('\t')[1])).toBe(cuentasMesa1Antes + 1);
    await expect(informe.getByRole('group', { name: 'Tiempo promedio por mesa' })).toContainText(/\d+ min|\d+ h/);
    await expect(informe.getByRole('group', { name: 'Rotación por mesa por día' })).toBeVisible();
    await expect(informe.getByRole('list', { name: 'Cuentas abiertas por hora' })).toBeVisible();
    await ver(page, '16-ocupacion');

    // Un rango al revés avisa; un rango solo de mañana en adelante no tiene cuentas.
    const manana = (await enHoras(page, 24)).slice(0, 10);
    await informe.getByLabel('Desde').fill(manana);
    await informe.getByLabel('Hasta').fill(manana);
    await expect(informe.getByRole('group', { name: 'Cuentas cobradas' })).toContainText(/Cuentas cobradas\s*0\s*En 1 día/);
    await informe.getByLabel('Hasta').fill((await enHoras(page, -48)).slice(0, 10));
    await expect(informe.getByRole('alert')).toContainText('no puede ser posterior');
  });

  test('la auditoría deja constancia de la lista de espera y los bloqueos', async ({ page }) => {
    await page.goto('/app/auditoria');
    await page.getByLabel('Módulo').selectOption('Mesas');
    for (const accion of ['Anotó a alguien en la lista de espera', 'Sentó a alguien de la lista de espera', 'Marcó «no llegó» en la lista de espera', 'Sacó a alguien de la lista de espera', 'Bloqueó una mesa', 'Desbloqueó una mesa']) {
      await expect(page.getByRole('row', { name: new RegExp(accion) }).first()).toBeVisible();
    }
  });

  test('al apagarlas desaparecen todas y Mesas queda como siempre; el servidor las corta', async ({ page }) => {
    await page.goto('/app/opciones');
    for (const op of OPCIONES) {
      await interruptor(page, op).click();
      await expect(interruptor(page, op)).not.toBeChecked();
    }
    // Lo que ya existía sigue encendido.
    await expect(interruptor(page, 'Reservas')).toBeChecked();

    await page.goto('/app/mesas');
    await expect(page.getByRole('button', { name: 'Abrir cuenta en Mesa 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir cuenta en Mesa 2' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Reservas de hoy' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Lista de espera' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Calendario de reservas' })).toHaveCount(0);
    await expect(page.getByRole('radiogroup', { name: 'Vista de las reservas' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Bloquear mesas' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Ocupación' })).toHaveCount(0);

    // Aunque alguien llame a la API directamente, el servidor responde que no está activada.
    for (const ruta of ['/api/lista-espera', '/api/bloqueos', '/api/mesas/ocupacion']) {
      const res = await page.request.get(ruta);
      expect(res.status(), ruta).toBe(403);
    }
  });
});
