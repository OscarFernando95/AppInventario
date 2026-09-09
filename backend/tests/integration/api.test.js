'use strict';

const request = require('supertest');
const bcrypt = require('bcrypt');
const { resetDb, seedBase } = require('./helpers');
const { invalidateAllProfiles } = require('../../src/middlewares/auth');

let app;
let models;
let ctx; // { empresa, producto, servicio, cliente, proveedor }
let agent;

beforeAll(async () => {
  await resetDb();
  app = require('../../src/app');
  models = require('../../src/models');
  ctx = await seedBase(models);

  agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ username: 'fadmin', contrasena: 'Clave1234' });
  expect(login.status).toBe(200);
});

afterAll(async () => {
  await models.sequelize.close();
});

const withEmpresa = (req) => req.set('X-Empresa-Id', String(ctx.empresa.id));

describe('POST /api/ventas — importes (N1) y precio de línea (N2)', () => {
  it('el descuento global se aplica como PORCENTAJE (N1)', async () => {
    // 1 unidad a $100.000 (usamos el servicio para no gastar stock), 10 % global.
    // Ajustamos el precio del servicio a 100.000 para la aritmética redonda.
    await models.Servicio.update({ precio: 100000, porcentaje_iva: 0 }, { where: { id: ctx.servicio.id } });

    const res = await withEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id,
      total: 1, // el cliente miente: se ignora
      descuento_global: 10, // porcentaje
      detalles: [{ productoId: null, servicioId: ctx.servicio.id, cantidad: 1, precio_unitario: 100000, precio_base: 100000 }],
    });

    expect(res.status).toBe(201);
    expect(Number(res.body.total)).toBe(90000); // 100.000 - 10 %
    expect(Number(res.body.descuento_global)).toBe(10);
    expect(Number(res.body.total_descuentos)).toBe(10000);
  });

  it('rechaza un precio de línea por encima del precio de lista (N2)', async () => {
    const res = await withEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id,
      detalles: [{ servicioId: ctx.servicio.id, cantidad: 1, precio_unitario: 999999, precio_base: 999999 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/precio de lista/i);
  });

  it('usa el precio_base de la BD, no el del cliente (N2)', async () => {
    // El cliente manda precio_base inflado; el descuento se calcula contra el real (100.000).
    const res = await withEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id,
      detalles: [{ servicioId: ctx.servicio.id, cantidad: 1, precio_unitario: 80000, precio_base: 999999 }],
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.total)).toBe(80000);
    // descuento de línea = (100.000 real - 80.000) * 1 = 20.000
    expect(Number(res.body.total_descuentos)).toBe(20000);
  });

  it('acepta y guarda cantidades fraccionarias (N4)', async () => {
    const antes = await models.Producto.findByPk(ctx.producto.id);
    const stockAntes = Number(antes.stock_actual);

    const res = await withEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id,
      detalles: [{ productoId: ctx.producto.id, cantidad: 2.5, precio_unitario: 1190, precio_base: 1190 }],
    });
    expect(res.status).toBe(201);

    const despues = await models.Producto.findByPk(ctx.producto.id);
    expect(Number(despues.stock_actual)).toBe(stockAntes - 2.5);

    const detalle = await models.VentaDetalle.findOne({ where: { ventaId: res.body.id } });
    expect(Number(detalle.cantidad)).toBe(2.5);
  });

  it('rechaza stock insuficiente', async () => {
    const res = await withEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id,
      detalles: [{ productoId: ctx.producto.id, cantidad: 999999, precio_unitario: 1190, precio_base: 1190 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/stock/i);
  });

  it('no permite vender un producto de otra empresa', async () => {
    const otra = await models.Empresa.create({ nombre: 'OtraCo', tipo_empresa: 'SIMPLE' });
    const ajeno = await models.Producto.create({
      empresaId: otra.id, codigo: 'X1', nombre_producto: 'Ajeno', precio_unitario: 100, stock_actual: 10,
    });
    const res = await withEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id,
      detalles: [{ productoId: ajeno.id, cantidad: 1, precio_unitario: 100, precio_base: 100 }],
    });
    expect(res.status).toBe(400);
  });

  it('exige sesión y empresa activa', async () => {
    const sinAuth = await request(app).post('/api/ventas').send({ detalles: [] });
    expect(sinAuth.status).toBe(401);

    const sinEmpresa = await agent.post('/api/ventas').send({ detalles: [{ servicioId: ctx.servicio.id, cantidad: 1, precio_unitario: 1 }] });
    expect(sinEmpresa.status).toBe(403);
  });
});

describe('POST /api/compras — cantidades fraccionarias', () => {
  it('suma fracciones al stock', async () => {
    const antes = Number((await models.Producto.findByPk(ctx.producto.id)).stock_actual);
    const res = await withEmpresa(agent.post('/api/compras')).send({
      proveedorId: ctx.proveedor.id,
      detalles: [{ productoId: ctx.producto.id, descripcion_gasto: null, cantidad: 1.25, costo_unitario: 800 }],
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.total)).toBe(1000); // 1.25 * 800
    const despues = Number((await models.Producto.findByPk(ctx.producto.id)).stock_actual);
    expect(despues).toBe(antes + 1.25);
  });
});

const conEmpresa = (r) => r.set('X-Empresa-Id', String(ctx.empresa.id));

describe('Multi-tenant e integridad', () => {
  it('GET /api/productos no filtra productos de otra empresa', async () => {
    const otra = await models.Empresa.create({ nombre: 'Aislada', tipo_empresa: 'SIMPLE' });
    await models.Producto.create({
      empresaId: otra.id, codigo: 'SECRETO', nombre_producto: 'No debe verse', precio_unitario: 1, stock_actual: 1,
    });
    const res = await withEmpresa(agent.get('/api/productos'));
    expect(res.status).toBe(200);
    expect(res.body.some((p) => p.codigo === 'SECRETO')).toBe(false);
  });

  it('un FRONT_ADMIN no puede crear un usuario BACKOFFICE_ADMIN (escalada de rol)', async () => {
    const res = await withEmpresa(agent.post('/api/usuarios')).send({
      nombre: 'Intruso', username: 'intruso', contrasena: 'Clave1234', rolId: 1, empresaIds: [ctx.empresa.id],
    });
    expect(res.status).toBe(403);
  });

  it('rechaza `descuento_global` fuera de 0–100', async () => {
    const res = await withEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id,
      descuento_global: 500,
      detalles: [{ servicioId: ctx.servicio.id, cantidad: 1, precio_unitario: 100 }],
    });
    expect(res.status).toBe(400);
  });
});

describe('N5 — informes con zona horaria', () => {
  it('una venta de hoy aparece en el informe del día de hoy', async () => {
    await models.Servicio.update({ precio: 12345, porcentaje_iva: 0 }, { where: { id: ctx.servicio.id } });
    const venta = await withEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id,
      detalles: [{ servicioId: ctx.servicio.id, cantidad: 1, precio_unitario: 12345, precio_base: 12345 }],
    });
    expect(venta.status).toBe(201);

    const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (hora local del server)
    const inf = await withEmpresa(agent.get('/api/informes')).query({ tipo: 'ventas_resumen', start: hoy, end: hoy });
    expect(inf.status).toBe(200);
    expect(inf.body.some((v) => v.id === venta.body.id)).toBe(true);
  });

  it('rechaza fechas que no son YYYY-MM-DD', async () => {
    const inf = await withEmpresa(agent.get('/api/informes')).query({ tipo: 'ventas_resumen', start: 'ayer', end: '2026-01-01' });
    expect(inf.status).toBe(400);
  });
});

describe('N11 — validación de queries de catálogos', () => {
  it('rechaza un limit de CIIU fuera de rango', async () => {
    const res = await agent.get('/api/catalogos/ciiu').query({ limit: 99999 });
    expect(res.status).toBe(400);
  });
  it('acepta un limit válido', async () => {
    const res = await agent.get('/api/catalogos/ciiu').query({ limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(5);
  });
});

describe('N3 — gating por módulo', () => {
  it('403 cuando la empresa NO tiene el módulo contratado', async () => {
    const modulos = await ctx.empresa.getModulos();
    await ctx.empresa.setModulos(modulos.filter((m) => m.nombre_codigo !== 'Ventas'));
    invalidateAllProfiles(); // el cambio directo no pasa por el controlador

    const res = await conEmpresa(agent.get('/api/ventas'));
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/módulo "Ventas"/i);

    await ctx.empresa.setModulos(modulos);
    invalidateAllProfiles();
  });

  it('200 cuando el módulo está activo', async () => {
    expect((await conEmpresa(agent.get('/api/ventas'))).status).toBe(200);
  });
});

describe('N9 — un FRONT_USER no puede gestionar usuarios', () => {
  it('403 en /api/usuarios para FRONT_USER', async () => {
    const op = await models.Usuario.create({
      rolId: 3, nombre: 'Operativo', username: 'operativo',
      contrasena_hash: await bcrypt.hash('Clave1234', 10), estado: true, must_change_password: false,
    });
    await op.setEmpresas([ctx.empresa.id]);

    const userAgent = request.agent(app);
    await userAgent.post('/api/auth/login').send({ username: 'operativo', contrasena: 'Clave1234' });

    const res = await userAgent.get('/api/usuarios').set('X-Empresa-Id', String(ctx.empresa.id));
    expect(res.status).toBe(403);
  });
});

describe('N18 — sesiones y revocación', () => {
  const login = (a) => a.post('/api/auth/login').send({ username: 'sesuser', contrasena: 'Clave1234' });

  it('logout invalida la cookie de esa sesión', async () => {
    const a = request.agent(app);
    await login(a);
    expect((await a.get('/api/auth/sessions')).status).toBe(200);
    await a.post('/api/auth/logout');
    expect((await a.get('/api/auth/sessions')).status).toBe(401);
  });

  it('logout-all cierra las demás sesiones', async () => {
    const a1 = request.agent(app);
    const a2 = request.agent(app);
    await login(a1);
    await login(a2);

    expect((await a1.post('/api/auth/logout-all?mantener_actual=true')).status).toBe(200);

    expect((await a1.get('/api/auth/sessions')).status).toBe(200); // sigue viva
    expect((await a2.get('/api/auth/sessions')).status).toBe(401); // revocada
  });

  it('GET /api/auth/sessions lista las sesiones activas', async () => {
    const a = request.agent(app);
    await login(a);
    const res = await a.get('/api/auth/sessions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sesiones)).toBe(true);
    expect(res.body.sesiones.length).toBeGreaterThanOrEqual(1);
  });

  it('cambiar la contraseña cierra las demás sesiones', async () => {
    const a1 = request.agent(app);
    const a2 = request.agent(app);
    await login(a1);
    await login(a2);

    await a1.post('/api/auth/change-password').send({ actual: 'Clave1234', nueva: 'NuevaClave99' });
    expect((await a1.get('/api/auth/sessions')).status).toBe(200);
    expect((await a2.get('/api/auth/sessions')).status).toBe(401);

    await a1.post('/api/auth/change-password').send({ actual: 'NuevaClave99', nueva: 'Clave1234' });
  });
});

describe('N10 — recepción de pedido enlaza la compra y valida los productos', () => {
  it('la compra generada lleva pedidoId y rechaza productos ajenos al pedido', async () => {
    const ped = await conEmpresa(agent.post('/api/pedidos')).send({
      proveedorId: ctx.proveedor.id,
      detalles: [{ productoId: ctx.producto.id, cantidad_pedida: 5, costo_estimado: 800 }],
    });
    expect(ped.status).toBe(201);

    const otro = await models.Producto.create({
      empresaId: ctx.empresa.id, codigo: 'OT', nombre_producto: 'Otro', precio_unitario: 100, stock_actual: 0,
    });
    const malo = await conEmpresa(agent.post(`/api/pedidos/${ped.body.id}/checkin`)).send({
      detalles_recibidos: [{ productoId: otro.id, cantidad: 1, costo_unitario: 100 }],
    });
    expect(malo.status).toBe(400);
    expect(malo.body.error).toMatch(/no estaba en el pedido/i);

    const ok = await conEmpresa(agent.post(`/api/pedidos/${ped.body.id}/checkin`)).send({
      detalles_recibidos: [{ productoId: ctx.producto.id, cantidad: 5, costo_unitario: 800 }],
    });
    expect(ok.status).toBe(200);
    const compra = await models.Compra.findByPk(ok.body.compraId);
    expect(compra.pedidoId).toBe(ped.body.id);
  });
});
