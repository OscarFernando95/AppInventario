const { test, expect } = require('@playwright/test');
const { SUPER, CAFE, TIENDA, entrar, ver } = require('./ayudas');

test.describe('Backoffice: crear empresas con módulos amarrados y capital inicial', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, SUPER.usuario, SUPER.clave);
  });

  test('un restaurante sugiere sus módulos, los amarra y guarda el capital inicial', async ({ page }) => {
    await page.goto('/backoffice/empresas');
    await page.getByRole('button', { name: 'Registrar Inquilino' }).click();
    await page.getByRole('button', { name: /Empresa simple/ }).click();

    await page.getByLabel('Nombre / Razón social').fill(CAFE.nombre);
    await page.getByLabel('NIT').fill(CAFE.nit);
    await page.getByLabel('Contacto (email o teléfono)').fill('cafe@e2e.test');
    await page.getByLabel('Capital inicial ($)').fill(String(CAFE.capital));

    // Elegir el tipo de negocio preselecciona los módulos sugeridos…
    await page.getByLabel('Tipo de negocio').selectOption('RESTAURANTE');
    for (const modulo of ['Recetas', 'Caja', 'Gastos', 'Ventas', 'Compras', 'Mesas', 'Cocina']) {
      await expect(page.getByRole('checkbox', { name: new RegExp(`^${modulo}`) })).toBeChecked();
    }
    // …y los módulos "amarrados" quedan bloqueados mientras otro los necesita.
    await expect(page.getByRole('checkbox', { name: /^Inventario/ })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: /^Clientes/ })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: /^Proveedores/ })).toBeDisabled();
    await ver(page, '01-empresa-restaurante');

    // Ventas sigue bloqueado mientras Caja e Informes lo necesiten; al quitarlos se libera.
    await expect(page.getByRole('checkbox', { name: /^Ventas/ })).toBeDisabled();
    // Cocina necesita Mesas y Mesas necesita Ventas: también se quitan (el 11 las habilita después).
    await expect(page.getByRole('checkbox', { name: /^Mesas/ })).toBeDisabled(); // mientras Cocina esté marcada
    await page.getByRole('checkbox', { name: /^Cocina/ }).uncheck();
    await page.getByRole('checkbox', { name: /^Mesas/ }).uncheck();
    await page.getByRole('checkbox', { name: /^Caja/ }).uncheck();
    await page.getByRole('checkbox', { name: /^Informes/ }).uncheck();
    await expect(page.getByRole('checkbox', { name: /^Ventas/ })).toBeEnabled();
    // Volver a marcar Caja arrastra de nuevo lo que necesita (Ventas).
    await page.getByRole('checkbox', { name: /^Caja/ }).check();
    await expect(page.getByRole('checkbox', { name: /^Ventas/ })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /^Ventas/ })).toBeDisabled();
    await page.getByRole('checkbox', { name: /^Informes/ }).check();

    await page.getByRole('button', { name: 'Activar Servicio' }).click();
    const fila = page.getByRole('row', { name: new RegExp(CAFE.nombre) });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText('Restaurante / cafetería');
  });

  test('un comercio NO trae Caja marcada, pero se puede habilitar', async ({ page }) => {
    await page.goto('/backoffice/empresas');
    await page.getByRole('button', { name: 'Registrar Inquilino' }).click();
    await page.getByRole('button', { name: /Empresa simple/ }).click();
    await page.getByLabel('Nombre / Razón social').fill(TIENDA.nombre);
    await page.getByLabel('NIT').fill(TIENDA.nit);
    await page.getByLabel('Contacto (email o teléfono)').fill('tienda@e2e.test');

    await expect(page.getByLabel('Tipo de negocio')).toHaveValue('COMERCIO');
    const caja = page.getByRole('checkbox', { name: /^Caja/ });
    await expect(caja).not.toBeChecked();
    await expect(caja).toBeEnabled(); // disponible en cualquier tipo de empresa

    await page.getByRole('button', { name: 'Activar Servicio' }).click();
    await expect(page.getByRole('row', { name: new RegExp(TIENDA.nombre) })).toBeVisible();
  });

  test('crea los usuarios de cada empresa', async ({ page }) => {
    await page.goto('/backoffice/usuarios');

    const crear = async ({ nombre, username, rol, empresa }) => {
      await page.getByRole('button', { name: 'Asignar Administrador' }).click();
      await page.getByLabel('Nombre Ref.').fill(nombre);
      await page.getByLabel('Username (Log-In)').fill(username);
      await page.getByLabel('Contraseña Gen.').fill(CAFE.clave);
      await page.getByLabel('Nivel de Acceso').selectOption(String(rol));
      await page.getByRole('checkbox', { name: empresa }).check();
      await page.getByRole('button', { name: 'Crear Acceso' }).click();
      await expect(page.getByRole('row', { name: new RegExp(username) })).toBeVisible();
    };

    await crear({ nombre: 'Ana Admin Café', username: CAFE.admin, rol: 2, empresa: CAFE.nombre });
    await crear({ nombre: 'Carlos Cajero', username: CAFE.cajero, rol: 3, empresa: CAFE.nombre });
    await crear({ nombre: 'Tomás Tienda', username: TIENDA.admin, rol: 2, empresa: TIENDA.nombre });
  });
});
