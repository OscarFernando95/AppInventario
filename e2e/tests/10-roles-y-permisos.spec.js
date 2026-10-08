const { test, expect } = require('@playwright/test');
const { CAFE, entrar, ver, cambiarModulo } = require('./ayudas');

test.describe.configure({ mode: 'serial' });

const ROL = 'Cajero sin costos';
const MESERO = { usuario: 'cafe_mesero', nombre: 'Mesero Café' };
const menu = (page) => page.getByRole('navigation', { name: 'Navegación principal' });

test.describe('Café E2E: roles y permisos parametrizables', () => {
  test('el backoffice habilita el módulo y el administrador ve los roles base', async ({ page, browser }) => {
    await cambiarModulo(browser, CAFE.nombre, 'Roles y permisos', true);

    await entrar(page, CAFE.admin, CAFE.clave);
    await menu(page).getByRole('link', { name: 'Roles y permisos' }).click();
    await expect(page.getByRole('heading', { name: 'Roles y permisos', level: 2 }).first()).toBeVisible();
    const base = page.getByRole('region', { name: 'Roles base' });
    await expect(base).toContainText('Administrador');
    await expect(base).toContainText('Operativo');
    await expect(page.getByText('Aún no has creado roles propios')).toBeVisible();
  });

  test('crea el rol «Cajero sin costos»: solo Ventas y Caja, sin permisos especiales', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/roles');
    await page.getByRole('button', { name: 'Nuevo rol' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Nuevo rol' });
    await dialogo.getByLabel('Nombre del rol').fill(ROL);
    await dialogo.getByLabel('Descripción (opcional)').fill('Atiende el mostrador');
    await dialogo.getByLabel('Todos los módulos de la empresa').uncheck();
    await dialogo.getByLabel('Caja', { exact: true }).check();
    // Caja necesita Ventas, y Ventas necesita Inventario y Clientes: se marcan solos.
    for (const m of ['Ventas', 'Inventario', 'Clientes']) await expect(dialogo.getByLabel(m, { exact: true })).toBeChecked();
    await expect(dialogo.getByLabel('Compras', { exact: true })).not.toBeChecked();
    await ver(page, '10-rol');
    await dialogo.getByRole('button', { name: 'Guardar rol' }).click();

    const fila = page.getByRole('row', { name: new RegExp(ROL) });
    await expect(fila).toContainText('Atiende el mostrador');
    await expect(fila).toContainText('4 de'); // Caja, Ventas, Inventario y Clientes
  });

  test('crea un usuario con ese rol desde Administración', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/admin');
    await page.getByLabel('Nombre Completo').fill(MESERO.nombre);
    await page.getByLabel('Nombre de Usuario').fill(MESERO.usuario);
    await page.getByLabel('Seña de Acceso').fill(CAFE.clave);
    await page.getByLabel('Nivel de Seguridad').selectOption({ label: ROL });
    await page.getByRole('button', { name: 'Dar de Alta' }).click();
    await expect(page.getByLabel(`Rol de ${MESERO.nombre}`)).toHaveValue(/^propio:/);
  });

  test('el usuario solo ve sus módulos, sin costos, y no entra al resto', async ({ page }) => {
    await entrar(page, MESERO.usuario, CAFE.clave);
    const nav = menu(page);
    for (const visible of ['Ventas', 'Caja', 'Inventario', 'Clientes']) await expect(nav.getByRole('link', { name: visible, exact: true })).toBeVisible();
    for (const oculto of ['Compras', 'Gastos', 'Informes', 'Recetas', 'Auditoría', 'Administración', 'Roles y permisos', 'Cuentas por pagar']) {
      await expect(nav.getByRole('link', { name: oculto, exact: true })).toHaveCount(0);
    }
    await expect(page.getByText('CAJERO SIN COSTOS')).toBeVisible();

    await page.goto('/app/inventario');
    await expect(page.getByRole('columnheader', { name: 'Costo / Margen' })).toHaveCount(0); // el administrador sí la ve (más abajo)

    await page.goto('/app/compras'); // ruta bloqueada: vuelve al inicio
    await expect(page).toHaveURL(/\/app$/);
    await page.goto('/app/admin');
    await expect(page).toHaveURL(/\/app$/);
  });

  test('sin permisos especiales solo puede solicitar anulaciones, no devolver', async ({ page }) => {
    await entrar(page, MESERO.usuario, CAFE.clave);
    await page.goto('/app/ventas');
    await expect(page.getByRole('button', { name: /Ver detalle de la factura/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Devolver productos/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Solicitar anulación de la factura/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Anular la factura/ })).toHaveCount(0);
  });

  test('el administrador sí ve costos; al darle «devolver» al rol, el cambio llega sin reiniciar', async ({ page, browser }) => {
    const admin = await entrar(page, CAFE.admin, CAFE.clave).then(() => page);
    await admin.goto('/app/inventario');
    await expect(admin.getByRole('columnheader', { name: 'Costo / Margen' })).toBeVisible();

    // El mesero deja su sesión abierta mientras el administrador cambia el rol.
    const contexto = await browser.newContext();
    const mesero = await contexto.newPage();
    await entrar(mesero, MESERO.usuario, CAFE.clave);
    await mesero.goto('/app/ventas');
    await expect(mesero.getByRole('button', { name: /Devolver productos/ })).toHaveCount(0);

    await admin.goto('/app/roles');
    await admin.getByRole('button', { name: `Editar el rol ${ROL}` }).click();
    const dialogo = admin.getByRole('dialog', { name: 'Editar rol' });
    await dialogo.getByRole('checkbox', { name: /Registrar devoluciones de ventas/ }).check();
    await dialogo.getByRole('button', { name: 'Guardar rol' }).click();
    await expect(admin.getByRole('row', { name: new RegExp(ROL) })).toContainText('1');

    await mesero.reload();
    await expect(mesero.getByRole('button', { name: /Devolver productos de la factura/ }).first()).toBeVisible();
    await contexto.close();
  });

  test('un rol en uso no se elimina; al pasar a la persona a Operativo, sí', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/roles');
    await page.getByRole('button', { name: `Eliminar el rol ${ROL}` }).click();
    const dialogo = page.getByRole('dialog', { name: 'Eliminar rol' });
    await dialogo.getByRole('button', { name: 'Eliminar rol' }).click();
    await expect(dialogo).toContainText('Hay 1 usuario');
    await dialogo.getByRole('button', { name: 'Volver' }).click();

    await page.goto('/app/admin');
    await page.getByLabel(`Rol de ${MESERO.nombre}`).selectOption({ label: 'Usuario Operativo' });
    await expect(page.getByLabel(`Rol de ${MESERO.nombre}`)).toHaveValue('base:3');

    await page.goto('/app/roles');
    await page.getByRole('button', { name: `Eliminar el rol ${ROL}` }).click();
    await page.getByRole('dialog', { name: 'Eliminar rol' }).getByRole('button', { name: 'Eliminar rol' }).click();
    await expect(page.getByText('Aún no has creado roles propios')).toBeVisible();
  });

  test('la auditoría deja constancia de los roles', async ({ page }) => {
    await entrar(page, CAFE.admin, CAFE.clave);
    await page.goto('/app/auditoria');
    await page.getByLabel('Módulo').selectOption('Usuarios');
    for (const accion of ['Creó un rol', 'Modificó un rol', 'Eliminó un rol']) {
      await expect(page.getByRole('row', { name: new RegExp(accion) })).toBeVisible();
    }
  });
});
