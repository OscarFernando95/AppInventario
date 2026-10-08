'use strict';

// Datos compartidos por los flujos. Las pruebas son una historia encadenada sobre la
// misma base de datos (ver playwright.config.js): cada archivo parte de lo que dejó el anterior.
const SUPER = { usuario: 'admin', clave: 'Admin*123' };
const CAFE = { nombre: 'Café E2E', nit: '900555111', capital: 1000000, admin: 'cafe_admin', cajero: 'cafe_cajero', clave: 'Clave1234' };
const TIENDA = { nombre: 'Tienda E2E', nit: '900555222', admin: 'tienda_admin', clave: 'Clave1234' };

/** Inicia sesión por el formulario real. Si el usuario tiene una sola empresa entra directo a /app. */
async function entrar(page, usuario, clave) {
  await page.goto('/login');
  await page.getByLabel('Usuario de Acceso').fill(usuario);
  await page.getByLabel('Contraseña').fill(clave);
  await page.getByRole('button', { name: 'Entrar al Sistema' }).click();
  await page.waitForURL(/\/(app|backoffice)/);
}

/** Cierra la sesión actual (vacía cookie y almacenamiento) para poder entrar con otro usuario. */
async function salir(page) {
  await page.context().clearCookies();
  await page.evaluate(() => { localStorage.clear(); });
}

/** "$ 1.234.567" / "$1.234.567" -> 1234567 (los montos se muestran con puntos y símbolo). */
const aNumero = (texto) => Number(String(texto).replace(/[^\d-]/g, ''));

const os = require('os');
const path = require('path');

/**
 * Captura de pantalla SOLO para depurar (E2E_CONSERVAR=1) y siempre en la carpeta temporal del
 * sistema, nunca dentro del proyecto. Sin esa variable no hace nada.
 */
async function ver(page, nombre) {
  if (process.env.E2E_CONSERVAR !== '1') return;
  await page.screenshot({ path: path.join(os.tmpdir(), 'appinventario-e2e', 'capturas', `${nombre}.png`), fullPage: true });
}

module.exports = { ver, SUPER, CAFE, TIENDA, entrar, salir, aNumero };

/** Elige una opción de un SearchableSelect (combobox con búsqueda): escribe y pulsa la opción. */
async function elegirOpcion(page, combobox, texto) {
  await combobox.click();
  await combobox.fill(texto);
  await page.getByRole('option', { name: new RegExp(texto, 'i') }).first().click();
}

/** Habilita o quita un módulo de una empresa desde el backoffice, en otra sesión del navegador. */
async function cambiarModulo(browser, nombreEmpresa, modulo, habilitar) {
  const { expect } = require('@playwright/test');
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  try {
    await entrar(page, SUPER.usuario, SUPER.clave);
    await page.goto('/backoffice/empresas');
    await page.getByRole('button', { name: `Editar ${nombreEmpresa}` }).click();
    const caja = page.getByRole('checkbox', { name: new RegExp(`^${modulo}`) });
    if (habilitar) await caja.check(); else await caja.uncheck();
    await page.getByRole('button', { name: 'Guardar Cambios' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    await contexto.close();
  }
}

Object.assign(module.exports, { elegirOpcion, cambiarModulo });
