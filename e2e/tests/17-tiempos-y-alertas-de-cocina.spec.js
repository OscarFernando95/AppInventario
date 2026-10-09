const path = require('path');
const { test, expect } = require('@playwright/test');
const { CAFE, entrar } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

const menu = (page) => page.getByRole('navigation', { name: 'Navegación principal' });
const RAIZ = path.resolve(__dirname, '..', '..');
const requerirBackend = (m) => require(path.join(RAIZ, 'backend', 'node_modules', m));

/**
 * «Envejece» las comandas pendientes de una mesa: les resta `minutos` a la hora de envío. Es la única forma de ver una
 * demora real sin esperar de verdad (la API no deja editar esa hora), así que se hace directo en la base de pruebas.
 */
async function envejecerComandas(mesa, minutos, estacion) {
  requerirBackend('dotenv').config({ path: path.join(RAIZ, '.env'), quiet: true });
  const { Client } = requerirBackend('pg');
  const cliente = new Client({
    connectionString: `postgres://${process.env.POSTGRES_USER || 'appinventario'}:${process.env.POSTGRES_PASSWORD || ''}@${process.env.E2E_DB_HOST || 'localhost'}:${process.env.E2E_DB_PORT || '5433'}/${process.env.E2E_DB_NAME || 'appinventario_e2e'}`,
  });
  await cliente.connect();
  try {
    const r = await cliente.query(
      `UPDATE comandas c SET enviada_en = c.enviada_en - make_interval(mins => $2::int)
         FROM cuentas u JOIN mesas m ON m.id = u."mesaId"
        WHERE c."cuentaId" = u.id AND u.estado = 'ABIERTA' AND c.estado = 'PENDIENTE' AND m.nombre = $1 AND ($3::text IS NULL OR c.estacion = $3)`,
      [mesa, minutos, estacion ?? null]
    );
    expect(r.rowCount).toBeGreaterThan(0);
  } finally {
    await cliente.end();
  }
}

const interruptor = (page, nombre) => page.getByRole('switch', { name: new RegExp(`^${nombre}`) });
const numero = (page, etiqueta) => page.getByRole('spinbutton', { name: etiqueta, exact: true });
const guardarNumero =(page, etiqueta) => page.getByRole('button', { name: `Guardar «${etiqueta}»` });

async function abrirCuentaLibre(page, mesa) {
  await page.goto('/app/mesas');
  await page.getByRole('button', { name: `Abrir cuenta en ${mesa}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Abrir cuenta' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(mesa) })).toBeVisible();
}

async function pedirPan(page) {
  await page.getByRole('button', { name: 'Agregar Pan artesanal' }).click();
  await page.getByRole('dialog', { name: 'Pan artesanal' }).getByRole('button', { name: 'Agregar' }).click();
}

test.describe('Café E2E: pedir por tiempos, alertas de demora en cocina y sonido de comanda nueva', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
  });

  test('apagadas por omisión; el administrador las enciende desde Opciones y se validan los minutos', async ({ page }) => {
    await page.goto('/app/opciones');
    await expect(page.getByRole('heading', { name: 'Cocina y servicio' })).toBeVisible();
    for (const op of ['Pedir por tiempos', 'Alertas de demora en cocina', 'Sonido cuando llega una comanda nueva']) {
      await expect(interruptor(page, op)).not.toBeChecked(); // lo nuevo nace apagado
    }
    // Lo que depende de otra opción apagada se ve deshabilitado
    await expect(numero(page, 'Minutos para marcar en rojo')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Agregar' }).last()).toBeDisabled();

    for (const op of ['Pedir por tiempos', 'Alertas de demora en cocina', 'Sonido cuando llega una comanda nueva']) {
      await interruptor(page, op).click(); // cambia cuando el servidor responde
      await expect(interruptor(page, op)).toBeChecked();
    }

    // El rojo debe superar al amarillo: 25 > 20 (el rojo de siempre) se rechaza con un mensaje claro
    const amarillo = numero(page, 'Minutos para marcar en amarillo');
    const rojo = numero(page, 'Minutos para marcar en rojo');
    await expect(amarillo).toHaveValue('10');
    await expect(rojo).toHaveValue('20');
    await amarillo.fill('25');
    await guardarNumero(page, 'Minutos para marcar en amarillo').click();
    await expect(page.getByText(/Los minutos del rojo \(20\) deben ser más que los del amarillo \(25\)/)).toBeVisible();
    // Valores válidos y bajos para poder verlos en la prueba: amarillo 3, rojo 6
    await amarillo.fill('3');
    await guardarNumero(page, 'Minutos para marcar en amarillo').click();
    await expect(guardarNumero(page, 'Minutos para marcar en amarillo')).toBeDisabled(); // ya quedó guardado
    await rojo.fill('6');
    await guardarNumero(page, 'Minutos para marcar en rojo').click();
    await expect(guardarNumero(page, 'Minutos para marcar en rojo')).toBeDisabled();

    // Nombres de los tiempos: chips editables (agregar un cuarto, guardar y quitarlo)
    const nombres = page.getByRole('list', { name: 'Nombres de los tiempos', exact: true });
    await expect(nombres.getByRole('listitem')).toHaveCount(3);
    await page.getByLabel('Nuevo elemento de Nombres de los tiempos').fill('Café');
    await page.getByRole('button', { name: 'Agregar' }).last().click();
    await guardarNumero(page, 'Nombres de los tiempos').click();
    await expect(guardarNumero(page, 'Nombres de los tiempos')).toBeDisabled();
    await page.reload();
    await expect(page.getByRole('list', { name: 'Nombres de los tiempos', exact: true }).getByRole('listitem')).toHaveCount(4);
    await page.getByRole('button', { name: 'Quitar «Café» de Nombres de los tiempos' }).click();
    await guardarNumero(page, 'Nombres de los tiempos').click();
    await expect(page.getByRole('list', { name: 'Nombres de los tiempos', exact: true }).getByRole('listitem')).toHaveCount(3);
    await expect(guardarNumero(page, 'Nombres de los tiempos')).toBeDisabled();
  });

  test('Inventario ofrece el tiempo objetivo de preparación de cada plato', async ({ page }) => {
    await page.goto('/app/inventario');
    await page.getByRole('button', { name: 'Editar Pan artesanal' }).click();
    await page.getByLabel('Tiempo objetivo de preparación (min)').fill('1');
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await expect(page.getByRole('row', { name: /Pan artesanal/ })).toBeVisible();
    await page.getByRole('button', { name: 'Editar Pan artesanal' }).click();
    await expect(page.getByLabel('Tiempo objetivo de preparación (min)')).toHaveValue('1');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  });

  test('pide la entrada y el plato fuerte: «Enviar» solo manda la entrada y «Disparar» el plato fuerte', async ({ page }) => {
    await abrirCuentaLibre(page, 'Mesa 2');
    const tiempos = page.getByRole('radiogroup', { name: 'Pedir para el tiempo' });
    await expect(tiempos.getByRole('radio', { name: 'Entrada' })).toBeChecked(); // el tiempo en curso
    await page.getByRole('button', { name: 'Agregar Gaseosa E2E' }).click(); // entrada (su estación es la Barra)
    await tiempos.getByRole('radio', { name: 'Plato fuerte' }).check({ force: true });
    await pedirPan(page);

    const pedido = page.getByRole('region', { name: 'Cuenta' });
    await expect(pedido.getByLabel('Tiempo de Gaseosa E2E')).toHaveValue('1');
    await expect(pedido.getByLabel('Tiempo de Pan artesanal')).toHaveValue('2');
    await expect(pedido.getByRole('button', { name: /^Enviar \(1\)/ })).toBeVisible(); // solo cuenta lo enviable
    await expect(pedido.getByRole('button', { name: 'Disparar: Plato fuerte (1)' })).toBeVisible();

    await pedido.getByRole('button', { name: /^Enviar \(1\)/ }).click();
    await expect(page.getByText(/Comanda #\d+ \(Barra\) enviada a cocina\. Tiempo: Entrada\./)).toBeVisible();
    await expect(pedido.getByRole('button', { name: /^Enviar \(0\)/ })).toBeDisabled();
    await expect(pedido.getByLabel('Tiempo de Pan artesanal')).toBeVisible(); // lo que espera sigue editable
    await expect(pedido.getByLabel('Tiempo de Gaseosa E2E')).toHaveCount(0); // lo enviado ya no

    // Cocina solo tiene la entrada de la Mesa 2, con el nombre de su tiempo
    await menu(page).getByRole('link', { name: 'Cocina', exact: true }).click();
    const tarjetas = page.getByRole('article', { name: /de Mesa 2$/ });
    await expect(tarjetas).toHaveCount(1);
    await expect(tarjetas.first()).toContainText('Gaseosa E2E');
    await expect(tarjetas.first()).toContainText(/entrada/i);

    // Dispara el siguiente tiempo
    await menu(page).getByRole('link', { name: 'Mesas', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir la cuenta de Mesa 2' }).click();
    await page.getByRole('button', { name: 'Disparar: Plato fuerte (1)' }).click();
    await expect(page.getByText(/Comanda #\d+ enviada a cocina\. Tiempo: Plato fuerte\./)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Disparar:/ })).toHaveCount(0); // ya no queda nada en espera
    await expect(page.getByRole('region', { name: 'Cuenta' }).getByRole('listitem').filter({ hasText: 'Entrada' }).first()).toBeVisible();

    await menu(page).getByRole('link', { name: 'Cocina', exact: true }).click();
    await expect(page.getByRole('article', { name: /de Mesa 2$/ })).toHaveCount(2);
    const fuerte = page.getByRole('article', { name: /de Mesa 2$/ }).filter({ hasText: 'Pan artesanal' });
    await expect(fuerte).toContainText(/plato fuerte/i);
    await expect(fuerte).not.toContainText('Gaseosa E2E');
  });

  test('cocina marca en amarillo y en rojo con los minutos de la empresa y señala el plato demorado', async ({ page }) => {
    await page.goto('/app/cocina');
    const pan = page.getByRole('article', { name: /de Mesa 2$/ }).filter({ hasText: 'Pan artesanal' });
    const gaseosa = page.getByRole('article', { name: /de Mesa 2$/ }).filter({ hasText: 'Gaseosa E2E' });
    await expect(pan).toHaveClass(/border-emerald-200/);
    await expect(gaseosa).toHaveClass(/border-emerald-200/);
    await expect(pan).not.toContainText('Demorado');

    // 4 minutos de espera: la gaseosa va en amarillo (3 min) y el pan, con objetivo de 1 min, ya está demorado → rojo
    await envejecerComandas('Mesa 2', 4);
    await expect(gaseosa).toHaveClass(/border-amber-300/, { timeout: 25_000 });
    await expect(pan).toHaveClass(/border-red-300/, { timeout: 25_000 });
    await expect(pan).toContainText('Demorado +3 min');
    await expect(gaseosa).not.toContainText('Demorado'); // sin objetivo propio no se marca el ítem

    // 7 minutos: la gaseosa también llega al rojo (6 min) solo por el reloj
    await envejecerComandas('Mesa 2', 3, 'Barra');
    await expect(gaseosa).toHaveClass(/border-red-300/, { timeout: 25_000 });
    await expect(gaseosa).not.toContainText('Demorado');
  });

  test('suena y avisa «Llegó una comanda nueva» cuando otra sesión envía una; el primer dato no avisa y se puede silenciar', async ({ page, browser }) => {
    // Cuenta los pitidos sin depender del audio real del navegador
    await page.addInitScript(() => {
      const Real = window.AudioContext;
      window.__pitidos = 0;
      window.AudioContext = function Contador(...args) { window.__pitidos += 1; return new Real(...args); };
    });
    await page.goto('/app/cocina');
    await expect(page.getByRole('button', { name: 'Silenciar el sonido en este equipo' })).toBeVisible();
    await expect(page.getByRole('article', { name: /de Mesa 2$/ })).toHaveCount(2);
    await page.waitForTimeout(1500);
    await expect(page.getByText(/Llegó una comanda nueva/)).toHaveCount(0); // lo que ya estaba al abrir no avisa
    expect(await page.evaluate(() => window.__pitidos)).toBe(0);

    // Otra sesión (el mesero) envía una comanda desde la Mesa 1
    const contexto = await browser.newContext();
    const otra = await contexto.newPage();
    try {
      await entrar(otra, CAFE.admin, CAFE.clave);
      await abrirCuentaLibre(otra, 'Mesa 1');
      await otra.getByRole('button', { name: 'Agregar Gaseosa E2E' }).click();
      await otra.getByRole('button', { name: /^Enviar \(1\)/ }).click();
      await expect(otra.getByText(/enviada a cocina/)).toBeVisible();

      const aviso = page.getByRole('status').filter({ hasText: 'Llegó una comanda nueva' });
      await expect(aviso).toContainText('Mesa 1', { timeout: 25_000 });
      await expect.poll(() => page.evaluate(() => window.__pitidos)).toBeGreaterThan(0);
      await aviso.getByRole('button', { name: 'Entendido' }).click();
      await expect(aviso).toHaveCount(0);

      // Silenciado en este equipo: avisa en pantalla pero no suena (y se recuerda en el navegador)
      await page.getByRole('button', { name: 'Silenciar el sonido en este equipo' }).click();
      await expect(page.getByRole('button', { name: 'Sonido silenciado en este equipo' })).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem('cocina-silenciar-comandas'))).toBe('1');
      const pitidos = await page.evaluate(() => window.__pitidos);
      await otra.getByRole('button', { name: 'Agregar Gaseosa E2E' }).click();
      await otra.getByRole('button', { name: /^Enviar \(1\)/ }).click();
      await expect(otra.getByText(/enviada a cocina/).last()).toBeVisible();
      await expect(aviso).toBeVisible({ timeout: 25_000 });
      expect(await page.evaluate(() => window.__pitidos)).toBe(pitidos);
      await page.getByRole('button', { name: 'Sonido silenciado en este equipo' }).click(); // vuelve a sonar
      await expect(page.getByRole('button', { name: 'Silenciar el sonido en este equipo' })).toBeVisible();
    } finally {
      await contexto.close();
    }
  });

  test('un pedido por tiempos que espera se ve en la cuenta; la auditoría deja constancia del tiempo disparado', async ({ page }) => {
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' }).click();
    await page.getByRole('radiogroup', { name: 'Pedir para el tiempo' }).getByRole('radio', { name: 'Postre' }).check({ force: true });
    await page.getByRole('button', { name: 'Agregar Gaseosa E2E' }).click();
    const pedido = page.getByRole('region', { name: 'Cuenta' });
    await expect(pedido.getByRole('button', { name: 'Disparar: Postre (1)' })).toBeVisible();
    await expect(pedido.getByRole('button', { name: /^Enviar \(0\)/ })).toBeDisabled();

    await page.goto('/app/auditoria');
    await page.getByLabel('Módulo').selectOption('Mesas');
    await expect(page.getByRole('row', { name: /Disparó un tiempo de servicio/ }).first()).toContainText('«Plato fuerte»');
    await expect(page.getByRole('row', { name: /Envió una comanda a cocina/ }).filter({ hasText: 'tiempo «Entrada»' }).first()).toBeVisible();
  });

  test('apagadas, todo vuelve a ser como siempre: «Enviar» manda todo de una vez y no hay marcas ni sonido', async ({ page }) => {
    // Deja los minutos y el objetivo como estaban y apaga las tres funciones
    await page.goto('/app/inventario');
    await page.getByRole('button', { name: 'Editar Pan artesanal' }).click();
    await page.getByLabel('Tiempo objetivo de preparación (min)').fill('');
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await expect(page.getByRole('row', { name: /Pan artesanal/ })).toBeVisible();

    await page.goto('/app/opciones');
    await numero(page, 'Minutos para marcar en rojo').fill('20');
    await guardarNumero(page, 'Minutos para marcar en rojo').click();
    await expect(guardarNumero(page, 'Minutos para marcar en rojo')).toBeDisabled();
    await numero(page, 'Minutos para marcar en amarillo').fill('10');
    await guardarNumero(page, 'Minutos para marcar en amarillo').click();
    await expect(guardarNumero(page, 'Minutos para marcar en amarillo')).toBeDisabled();
    for (const op of ['Pedir por tiempos', 'Alertas de demora en cocina', 'Sonido cuando llega una comanda nueva']) {
      await interruptor(page, op).click();
      await expect(interruptor(page, op)).not.toBeChecked();
    }
    await expect(numero(page, 'Minutos para marcar en rojo')).toBeDisabled();

    // La Mesa 1 tenía un pedido esperando su tiempo: ahora se envía junto con todo lo demás
    await page.goto('/app/mesas');
    await page.getByRole('button', { name: 'Abrir la cuenta de Mesa 1' }).click();
    await expect(page.getByRole('radiogroup', { name: 'Pedir para el tiempo' })).toHaveCount(0);
    await expect(page.getByLabel('Tiempo de Gaseosa E2E')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Disparar:/ })).toHaveCount(0);
    await page.getByRole('button', { name: /^Enviar \(1\)/ }).click();
    const aviso = page.getByText(/Comanda #\d+ \(Barra\) enviada a cocina\./);
    await expect(aviso).toBeVisible();
    await expect(aviso).not.toContainText('Tiempo:');

    // Cocina: sin botón de sonido, sin etiqueta de tiempo y con los 10 / 20 minutos de siempre (la comanda de 7 min sigue en verde)
    await menu(page).getByRole('link', { name: 'Cocina', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cocina', level: 2 }).first()).toBeVisible();
    await expect(page.getByRole('article', { name: /de Mesa 2$/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /sonido en este equipo/i })).toHaveCount(0);
    await expect(page.getByText('Demorado')).toHaveCount(0);
    for (const t of await page.getByRole('article', { name: /de Mesa 2$/ }).all()) await expect(t).toHaveClass(/border-emerald-200/);
    await expect(page.getByRole('article', { name: /de Mesa 1$/ }).last()).not.toContainText(/postre|entrada|plato fuerte/i);
  });

  test('cobra las dos cuentas: las mesas quedan libres y las comandas salen de cocina', async ({ page }) => {
    for (const mesa of ['Mesa 2', 'Mesa 1']) {
      await page.goto('/app/mesas');
      await page.getByRole('button', { name: `Abrir la cuenta de ${mesa}` }).click();
      await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
      await page.getByRole('dialog', { name: `Cobrar · ${mesa}` }).getByRole('button', { name: /^Cobrar \$/ }).click();
      const final = page.getByRole('dialog', { name: 'Cobro registrado' });
      await expect(final).toContainText('La cuenta quedó cobrada');
      await final.getByRole('button', { name: 'Volver a las mesas' }).click();
      await expect(page.getByRole('button', { name: `Abrir cuenta en ${mesa}` })).toBeVisible();
    }
    await page.goto('/app/cocina');
    await expect(page.getByText('Sin comandas pendientes.')).toBeVisible();
  });
});
