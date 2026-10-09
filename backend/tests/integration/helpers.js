'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const { Client } = require('pg');
const bcrypt = require('bcrypt');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const SEQUELIZE_CLI = require.resolve('sequelize-cli/lib/sequelize');

/** Recrea la base de datos de test y corre todas las migraciones. */
async function resetDb() {
  const admin = new Client({ connectionString: process.env.TEST_DB_ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${process.env.TEST_DB_NAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${process.env.TEST_DB_NAME}`);
  await admin.end();

  execFileSync(process.execPath, [SEQUELIZE_CLI, 'db:migrate'], {
    cwd: BACKEND_ROOT,
    stdio: 'pipe',
    env: process.env,
  });
}

/**
 * Datos mínimos para probar el flujo de venta/compra:
 *   - roles, módulos
 *   - 1 empresa con TODOS los módulos
 *   - 1 usuario FRONT_ADMIN (fadmin / Clave1234)
 *   - 1 producto (precio 1190, IVA 19, stock 100), 1 servicio, 1 cliente, 1 proveedor
 */
async function seedBase(models) {
  const { Role, Modulo, Empresa, Usuario, Producto, Servicio, Cliente, Proveedor } = models;

  await Role.bulkCreate([
    { id: 1, nombre: 'Súper Administrador', tipo: 'BACKOFFICE_ADMIN' },
    { id: 2, nombre: 'Administrador de Empresa', tipo: 'FRONT_ADMIN' },
    { id: 3, nombre: 'Usuario Operativo', tipo: 'FRONT_USER' },
  ]);
  // Recetas y Caja existen en el catálogo pero NO se asignan a la empresa base:
  // Caja obliga a abrir caja antes de vender y rompería los tests de ventas.
  // Los tests de restaurante/caja los activan a mano.
  const todos = await Modulo.bulkCreate(
    ['Inventario', 'Ventas', 'Compras', 'Proveedores', 'Informes', 'Clientes', 'Servicios', 'Pedidos', 'Recetas', 'Caja', 'Gastos', 'Cuentas por cobrar', 'Cuentas por pagar', 'Roles y permisos', 'Mesas', 'Cocina']
      .map((nombre_codigo, i) => ({ id: i + 1, nombre_codigo })),
    { returning: true }
  );
  const modulos = todos.filter((m) => !['Recetas', 'Caja', 'Cuentas por cobrar', 'Cuentas por pagar', 'Roles y permisos', 'Mesas', 'Cocina'].includes(m.nombre_codigo));

  const empresa = await Empresa.create({ nombre: 'TestCo', nit: '900123456', tipo_empresa: 'SIMPLE' });
  await empresa.setModulos(modulos.map((m) => m.id));

  const usuario = await Usuario.create({
    rolId: 2,
    nombre: 'Front Admin',
    username: 'fadmin',
    contrasena_hash: await bcrypt.hash('Clave1234', 10),
    estado: true,
    must_change_password: false,
  });
  await usuario.setEmpresas([empresa.id]);

  // Usuario aparte para los tests de sesiones (no queremos revocar `fadmin`).
  const usuarioSesiones = await Usuario.create({
    rolId: 2,
    nombre: 'Sesiones',
    username: 'sesuser',
    contrasena_hash: await bcrypt.hash('Clave1234', 10),
    estado: true,
    must_change_password: false,
  });
  await usuarioSesiones.setEmpresas([empresa.id]);

  const producto = await Producto.create({
    empresaId: empresa.id, codigo: 'P1', nombre_producto: 'Widget',
    precio_unitario: 1190, porcentaje_iva: 19, stock_actual: 100,
  });
  const servicio = await Servicio.create({
    empresaId: empresa.id, nombre: 'Instalación', precio: 50000, porcentaje_iva: 19,
  });
  const cliente = await Cliente.create({ empresaId: empresa.id, nombre: 'Cliente Test' });
  const proveedor = await Proveedor.create({ empresaId: empresa.id, nombre: 'Proveedor Test', nit: '800999888' });

  return { empresa, usuario, usuarioSesiones, producto, servicio, cliente, proveedor };
}

/** Deja la empresa con los módulos base + los extra indicados (el catálogo debe existir: lo crea seedBase). */
async function activarModulos(models, empresa, invalidar, extra = []) {
  const todos = await models.Modulo.findAll();
  const base = ['Inventario', 'Ventas', 'Compras', 'Proveedores', 'Informes', 'Clientes', 'Servicios', 'Pedidos', 'Gastos', 'Cuentas por cobrar', 'Cuentas por pagar'];
  const nombres = new Set([...base, ...extra]);
  await empresa.setModulos(todos.filter((m) => nombres.has(m.nombre_codigo)).map((m) => m.id));
  invalidar(); // el cambio directo no pasa por el controlador
}

/** Crea un usuario de la empresa e inicia sesión con él. */
async function loginNuevoUsuario(request, app, models, empresa, { username, rolId = 3, nombre = username }) {
  const u = await models.Usuario.create({
    rolId, nombre, username, contrasena_hash: await bcrypt.hash('Clave1234', 10), estado: true, must_change_password: false,
  });
  await u.setEmpresas([empresa.id]);
  const a = request.agent(app);
  const res = await a.post('/api/auth/login').send({ username, contrasena: 'Clave1234' });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión como ${username}: ${res.status}`);
  return { agent: a, usuario: u };
}

module.exports = { resetDb, seedBase, activarModulos, loginNuevoUsuario };
