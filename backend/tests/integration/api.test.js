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

// YYYY-MM-DD de hoy en hora LOCAL (como lo interpretan los filtros del servidor);
// new Date().toISOString() daría la fecha UTC, que de noche en Colombia ya es mañana.
const fechaLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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

    const hoy = fechaLocal(); // YYYY-MM-DD en hora LOCAL del server (toISOString daría el día UTC)
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

describe('GET /api/productos/plantilla — descarga sin header de empresa', () => {
  it('un FRONT_ADMIN la descarga solo con la sesión (el <a href> no manda X-Empresa-Id)', async () => {
    const res = await agent.get('/api/productos/plantilla');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
  });

  it('sigue exigiendo sesión', async () => {
    const res = await request(app).get('/api/productos/plantilla');
    expect(res.status).toBe(401);
  });

  it('el resto de /api/productos sí exige empresa activa', async () => {
    const res = await agent.get('/api/productos');
    expect(res.status).toBe(403);
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

describe('Recepción parcial de pedidos', () => {
  it('recibir menos de lo pedido deja el pedido PARCIAL y acumula al completarlo', async () => {
    const ped = await conEmpresa(agent.post('/api/pedidos')).send({
      proveedorId: ctx.proveedor.id,
      detalles: [{ productoId: ctx.producto.id, cantidad_pedida: 10, costo_estimado: 500 }],
    });
    expect(ped.status).toBe(201);
    const stockAntes = Number((await models.Producto.findByPk(ctx.producto.id)).stock_actual);

    const parcial = await conEmpresa(agent.post(`/api/pedidos/${ped.body.id}/checkin`)).send({
      detalles_recibidos: [{ productoId: ctx.producto.id, cantidad: 4, costo_unitario: 500 }],
    });
    expect(parcial.status).toBe(200);
    expect(parcial.body.estado).toBe('PARCIAL');
    expect(Number((await models.Producto.findByPk(ctx.producto.id)).stock_actual)).toBe(stockAntes + 4);

    const resto = await conEmpresa(agent.post(`/api/pedidos/${ped.body.id}/checkin`)).send({
      detalles_recibidos: [{ productoId: ctx.producto.id, cantidad: 6, costo_unitario: 500 }],
    });
    expect(resto.status).toBe(200);
    expect(resto.body.estado).toBe('COMPLETADO');
    expect(Number((await models.Producto.findByPk(ctx.producto.id)).stock_actual)).toBe(stockAntes + 10);

    const detalle = await models.PedidoDetalle.findOne({ where: { pedidoId: ped.body.id } });
    expect(Number(detalle.cantidad_recibida)).toBe(10);
  });
});

describe('Filtros de listado (ventas / compras / pedidos)', () => {
  it('GET /api/compras y /api/pedidos aceptan filtros sin romper', async () => {
    const compras = await conEmpresa(agent.get('/api/compras')).query({ desde: '2020-01-01', hasta: '2030-12-31' });
    expect(compras.status).toBe(200);
    expect(Array.isArray(compras.body)).toBe(true);

    const pedidos = await conEmpresa(agent.get('/api/pedidos')).query({ estado: 'PENDIENTE' });
    expect(pedidos.status).toBe(200);
    expect(pedidos.body.every((p) => p.estado === 'PENDIENTE')).toBe(true);

    const ventas = await conEmpresa(agent.get('/api/ventas')).query({ clienteId: ctx.cliente.id });
    expect(ventas.status).toBe(200);
  });
});

describe('Fase 9 — recepción de pedido concurrente (doble abono de stock)', () => {
  it('dos check-ins simultáneos del mismo pedido: solo uno abona stock', async () => {
    const ped = await conEmpresa(agent.post('/api/pedidos')).send({
      proveedorId: ctx.proveedor.id,
      detalles: [{ productoId: ctx.producto.id, cantidad_pedida: 3, costo_estimado: 800 }],
    });
    expect(ped.status).toBe(201);

    const antes = Number((await models.Producto.findByPk(ctx.producto.id)).stock_actual);

    const payload = { detalles_recibidos: [{ productoId: ctx.producto.id, cantidad: 3, costo_unitario: 800 }] };
    const [r1, r2] = await Promise.all([
      conEmpresa(agent.post(`/api/pedidos/${ped.body.id}/checkin`)).send(payload),
      conEmpresa(agent.post(`/api/pedidos/${ped.body.id}/checkin`)).send(payload),
    ]);

    const estados = [r1.status, r2.status].sort();
    expect(estados).toEqual([200, 400]);

    const despues = Number((await models.Producto.findByPk(ctx.producto.id)).stock_actual);
    expect(despues).toBe(antes + 3); // no + 6

    const compras = await models.Compra.findAll({ where: { pedidoId: ped.body.id } });
    expect(compras.length).toBe(1);
  });
});

describe('Fase 9 — NIT de empresa único', () => {
  it('rechaza una segunda empresa con el mismo NIT (normalizado)', async () => {
    await models.Empresa.create({ nombre: 'NIT-A', nit: '901222333', tipo_empresa: 'SIMPLE' });
    await expect(
      models.Empresa.create({ nombre: 'NIT-B', nit: '901222333', tipo_empresa: 'SIMPLE' })
    ).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
  });

  it('permite varias empresas sin NIT (índice parcial)', async () => {
    await models.Empresa.create({ nombre: 'SinNit-1', tipo_empresa: 'SIMPLE' });
    await expect(
      models.Empresa.create({ nombre: 'SinNit-2', tipo_empresa: 'SIMPLE' })
    ).resolves.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Restaurantes: módulos amarrados, recetas e inventario por ingredientes, caja
// ---------------------------------------------------------------------------

/** Deja la empresa base con los módulos base + los extra indicados. */
async function activarModulos(extra = []) {
  const todos = await models.Modulo.findAll();
  const base = ['Inventario', 'Ventas', 'Compras', 'Proveedores', 'Informes', 'Clientes', 'Servicios', 'Pedidos', 'Gastos', 'Cuentas por cobrar', 'Cuentas por pagar'];
  const nombres = new Set([...base, ...extra]);
  await ctx.empresa.setModulos(todos.filter((m) => nombres.has(m.nombre_codigo)).map((m) => m.id));
  invalidateAllProfiles(); // el cambio directo no pasa por el controlador
}

describe('Módulos amarrados (dependencias) y tipo de negocio', () => {
  let bo; // agente BACKOFFICE_ADMIN
  let ids; // nombre -> id de módulo

  beforeAll(async () => {
    const admin = await models.Usuario.create({
      rolId: 1, nombre: 'BO', username: 'boadmin',
      contrasena_hash: await bcrypt.hash('Clave1234', 10), estado: true, must_change_password: false,
    });
    expect(admin.id).toBeTruthy();
    bo = request.agent(app);
    const login = await bo.post('/api/auth/login').send({ username: 'boadmin', contrasena: 'Clave1234' });
    expect(login.status).toBe(200);
    ids = Object.fromEntries((await models.Modulo.findAll()).map((m) => [m.nombre_codigo, m.id]));
  });

  it('GET /api/modulos expone lo que requiere cada módulo', async () => {
    const res = await bo.get('/api/modulos');
    expect(res.status).toBe(200);
    const ventas = res.body.find((m) => m.nombre_codigo === 'Ventas');
    expect(ventas.requiere).toEqual(['Inventario', 'Clientes']);
    expect(res.body.find((m) => m.nombre_codigo === 'Recetas').requiere).toEqual(['Inventario']);
  });

  it('rechaza contratar Ventas sin Inventario ni Clientes', async () => {
    const res = await bo.post('/api/empresas').send({ nombre: 'Solo Ventas', nit: '901000001', modulosIds: [ids.Ventas] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Ventas requiere Inventario y Clientes/);
  });

  it('rechaza Compras sin Proveedores y reporta todas las carencias', async () => {
    const res = await bo.post('/api/empresas').send({
      nombre: 'Compras mal', nit: '901000002', modulosIds: [ids.Inventario, ids.Compras, ids.Caja],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Compras requiere Proveedores/);
    expect(res.body.error).toMatch(/Caja requiere Ventas/);
  });

  it('crea un restaurante con módulos completos y guarda su tipo de negocio', async () => {
    const res = await bo.post('/api/empresas').send({
      nombre: 'Café Central', nit: '901000003', tipo_negocio: 'RESTAURANTE',
      modulosIds: [ids.Inventario, ids.Clientes, ids.Ventas, ids.Recetas, ids.Caja],
    });
    expect(res.status).toBe(201);
    expect(res.body.tipo_negocio).toBe('RESTAURANTE');
    expect(res.body.Modulos.map((m) => m.nombre_codigo).sort()).toEqual(['Caja', 'Clientes', 'Inventario', 'Recetas', 'Ventas']);
  });

  it('el tipo de negocio es COMERCIO por defecto y se puede cambiar al editar', async () => {
    const creada = await bo.post('/api/empresas').send({ nombre: 'Tienda', nit: '901000004', modulosIds: [ids.Inventario] });
    expect(creada.status).toBe(201);
    expect(creada.body.tipo_negocio).toBe('COMERCIO');

    const editada = await bo.put(`/api/empresas/${creada.body.id}`).send({ tipo_negocio: 'RESTAURANTE' });
    expect(editada.status).toBe(200);
    expect(editada.body.tipo_negocio).toBe('RESTAURANTE');
  });

  it('rechaza un tipo de negocio desconocido', async () => {
    const res = await bo.post('/api/empresas').send({ nombre: 'X', nit: '901000005', tipo_negocio: 'FABRICA' });
    expect(res.status).toBe(400);
  });

  it('al editar también valida las dependencias', async () => {
    const creada = await bo.post('/api/empresas').send({ nombre: 'Edit', nit: '901000006', modulosIds: [ids.Inventario] });
    const res = await bo.put(`/api/empresas/${creada.body.id}`).send({ modulosIds: [ids.Inventario, ids.Pedidos] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Pedidos requiere Proveedores/);
  });
});

describe('Restaurante — insumos, recetas y venta de platos', () => {
  let leche; let cafe; let capuchino;

  const crearProducto = (body) => conEmpresa(agent.post('/api/productos')).send({
    precio_unitario: 1000, porcentaje_iva: 0, ...body,
  });
  const stockDe = async (id) => Number((await models.Producto.findByPk(id)).stock_actual);
  const vender = (productoId, cantidad, extra = {}) => conEmpresa(agent.post('/api/ventas')).send({
    clienteId: ctx.cliente.id,
    detalles: [{ productoId, cantidad, precio_unitario: 6000, precio_base: 6000 }],
    ...extra,
  });

  beforeAll(async () => { await activarModulos([]); });
  afterAll(async () => { await activarModulos([]); });

  it('sin el módulo Recetas no se crean insumos ni platos', async () => {
    const res = await crearProducto({ codigo: 'X-INS', nombre_producto: 'Sin módulo', tipo: 'INSUMO' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Recetas/);
  });

  it('crea insumos con stock fraccionario y un plato con su receta', async () => {
    await activarModulos(['Recetas']);
    const l = await crearProducto({ codigo: 'LECHE', nombre_producto: 'Leche', tipo: 'INSUMO', unidad_medida: 'MLT', stock_actual: 1000 });
    const c = await crearProducto({ codigo: 'CAFE', nombre_producto: 'Café molido', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 100.5 });
    expect(l.status).toBe(201);
    expect(c.status).toBe(201);
    leche = l.body; cafe = c.body;
    expect(Number(c.body.stock_actual)).toBe(100.5);

    const plato = await crearProducto({
      codigo: 'CAPU', nombre_producto: 'Capuchino', tipo: 'RECETA', precio_unitario: 6000, stock_actual: 99,
      receta: [{ insumoId: leche.id, cantidad: 200 }, { insumoId: cafe.id, cantidad: 15 }],
    });
    expect(plato.status).toBe(201);
    capuchino = plato.body;
    expect(Number(capuchino.stock_actual)).toBe(0); // el stock propio de un plato se ignora
  });

  it('GET /api/productos devuelve la receta y las porciones disponibles', async () => {
    const res = await conEmpresa(agent.get('/api/productos'));
    const plato = res.body.find((p) => p.id === capuchino.id);
    expect(plato.receta).toHaveLength(2);
    // leche: 1000/200 = 5 · café: 100.5/15 = 6.7 -> manda la leche
    expect(plato.porciones_disponibles).toBe(5);
  });

  it('vender un plato descuenta los ingredientes de su receta', async () => {
    const res = await vender(capuchino.id, 2);
    expect(res.status).toBe(201);
    expect(await stockDe(leche.id)).toBe(600);
    expect(await stockDe(cafe.id)).toBe(70.5);
    expect(await stockDe(capuchino.id)).toBe(0);
  });

  it('rechaza (y no descuenta nada) si falta un ingrediente', async () => {
    const res = await vender(capuchino.id, 4); // leche: 800 > 600
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Stock insuficiente de "Leche" para preparar "Capuchino"/);
    expect(await stockDe(leche.id)).toBe(600);
    expect(await stockDe(cafe.id)).toBe(70.5);
  });

  it('acumula el consumo de un mismo ingrediente entre líneas de la venta', async () => {
    const res = await conEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id,
      detalles: [
        { productoId: capuchino.id, cantidad: 2, precio_unitario: 6000, precio_base: 6000 }, // 400 de leche
        { productoId: capuchino.id, cantidad: 2, precio_unitario: 6000, precio_base: 6000 }, // otros 400 > 200 restantes
      ],
    });
    expect(res.status).toBe(400);
    expect(await stockDe(leche.id)).toBe(600); // la transacción deshizo la primera línea
  });

  it('un insumo no se vende directamente', async () => {
    const res = await vender(leche.id, 1);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/insumo/i);
  });

  it('un plato no puede comprarse ni pedirse', async () => {
    const compra = await conEmpresa(agent.post('/api/compras')).send({
      proveedorId: ctx.proveedor.id,
      detalles: [{ productoId: capuchino.id, cantidad: 1, costo_unitario: 100 }],
    });
    expect(compra.status).toBe(400);
    expect(compra.body.error).toMatch(/plato/i);

    const pedido = await conEmpresa(agent.post('/api/pedidos')).send({
      proveedorId: ctx.proveedor.id,
      detalles: [{ productoId: capuchino.id, cantidad_pedida: 1, costo_estimado: 100 }],
    });
    expect(pedido.status).toBe(400);
  });

  it('valida la receta: sin ingredientes, repetidos o con un plato como ingrediente', async () => {
    const vacia = await crearProducto({ codigo: 'P-V', nombre_producto: 'Vacío', tipo: 'RECETA', receta: [] });
    expect(vacia.status).toBe(400);

    const repetidos = await crearProducto({
      codigo: 'P-R', nombre_producto: 'Repetido', tipo: 'RECETA',
      receta: [{ insumoId: leche.id, cantidad: 1 }, { insumoId: leche.id, cantidad: 2 }],
    });
    expect(repetidos.status).toBe(400);
    expect(repetidos.body.error).toMatch(/repetidos/);

    const anidado = await crearProducto({
      codigo: 'P-A', nombre_producto: 'Anidado', tipo: 'RECETA',
      receta: [{ insumoId: capuchino.id, cantidad: 1 }],
    });
    expect(anidado.status).toBe(400);
    expect(anidado.body.error).toMatch(/es un plato/);
  });

  it('no admite ingredientes de otra empresa', async () => {
    const otra = await models.Empresa.create({ nombre: 'Otra', tipo_empresa: 'SIMPLE' });
    const ajeno = await models.Producto.create({
      empresaId: otra.id, codigo: 'AJENO', nombre_producto: 'Ajeno', precio_unitario: 1, tipo: 'INSUMO',
    });
    const res = await crearProducto({
      codigo: 'P-X', nombre_producto: 'Con ajeno', tipo: 'RECETA', receta: [{ insumoId: ajeno.id, cantidad: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it('editar la receta la reemplaza; editar sin mandarla la conserva', async () => {
    const sinTocar = await conEmpresa(agent.put(`/api/productos/${capuchino.id}`)).send({ precio_unitario: 6500 });
    expect(sinTocar.status).toBe(200);
    expect(await models.RecetaItem.count({ where: { productoId: capuchino.id } })).toBe(2);

    const nueva = await conEmpresa(agent.put(`/api/productos/${capuchino.id}`)).send({
      receta: [{ insumoId: leche.id, cantidad: 150 }],
    });
    expect(nueva.status).toBe(200);
    const items = await models.RecetaItem.findAll({ where: { productoId: capuchino.id } });
    expect(items).toHaveLength(1);
    expect(Number(items[0].cantidad)).toBe(150);
  });

  it('un ingrediente en uso no puede convertirse en plato', async () => {
    const res = await conEmpresa(agent.put(`/api/productos/${leche.id}`)).send({
      tipo: 'RECETA', receta: [{ insumoId: cafe.id, cantidad: 1 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ingrediente de otros platos/);
  });

  it('un plato sin receta configurada no se puede vender', async () => {
    const huerfano = await models.Producto.create({
      empresaId: ctx.empresa.id, codigo: 'H', nombre_producto: 'Huérfano', precio_unitario: 6000, tipo: 'RECETA',
    });
    const res = await vender(huerfano.id, 1);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no tiene receta/);
  });

  it('el dashboard no alerta platos sin mínimo configurado', async () => {
    const res = await conEmpresa(agent.get('/api/reportes/dashboard'));
    expect(res.status).toBe(200);
    expect(res.body.productosBajoStock.some((p) => p.tipo === 'RECETA')).toBe(false);
  });
});

describe('Flujo de caja (apertura, ventas y cierre)', () => {
  let cajaId;
  const venderServicio = (extra = {}) => conEmpresa(agent.post('/api/ventas')).send({
    clienteId: ctx.cliente.id,
    detalles: [{ servicioId: ctx.servicio.id, cantidad: 1, precio_unitario: 100000, precio_base: 100000 }],
    ...extra,
  });

  beforeAll(async () => {
    await models.Servicio.update({ precio: 100000, porcentaje_iva: 0 }, { where: { id: ctx.servicio.id } });
    await activarModulos(['Caja']);
  });
  afterAll(async () => { await activarModulos([]); });

  it('no se puede vender sin caja abierta', async () => {
    const res = await venderServicio();
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/abrir caja/i);
  });

  it('sin el módulo Caja el endpoint responde 403', async () => {
    await activarModulos([]);
    expect((await conEmpresa(agent.get('/api/caja/actual'))).status).toBe(403);
    await activarModulos(['Caja']);
  });

  it('GET /api/caja/actual es null mientras no haya caja abierta', async () => {
    const res = await conEmpresa(agent.get('/api/caja/actual'));
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('abre caja con base y rechaza abrir una segunda', async () => {
    const res = await conEmpresa(agent.post('/api/caja/abrir')).send({ monto_inicial: 50000, observaciones: 'Turno mañana' });
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('ABIERTA');
    expect(Number(res.body.monto_inicial)).toBe(50000);
    cajaId = res.body.id;

    const otra = await conEmpresa(agent.post('/api/caja/abrir')).send({ monto_inicial: 0 });
    expect(otra.status).toBe(400);
    expect(otra.body.error).toMatch(/caja abierta/i);
  });

  it('las ventas quedan ligadas a la caja y el resumen separa efectivo de otros medios', async () => {
    const efectivo = await venderServicio({ medio_pago: '10' });
    const tarjeta = await venderServicio({ medio_pago: '48' });
    const credito = await venderServicio({ forma_pago: '2', medio_pago: '10' });
    for (const r of [efectivo, tarjeta, credito]) {
      expect(r.status).toBe(201);
      expect(r.body.cajaId).toBe(cajaId);
    }

    const res = await conEmpresa(agent.get('/api/caja/actual'));
    expect(res.body.id).toBe(cajaId);
    expect(res.body.resumen.num_ventas).toBe(3);
    expect(res.body.resumen.total_ventas).toBe(300000);
    expect(res.body.resumen.ventas_efectivo).toBe(100000); // la de crédito no entra
    expect(res.body.resumen.efectivo_esperado).toBe(150000); // base + efectivo
  });

  it('un FRONT_USER no puede ver ni cerrar la caja de otro usuario', async () => {
    const u = await models.Usuario.create({
      rolId: 3, nombre: 'Cajero', username: 'cajero',
      contrasena_hash: await bcrypt.hash('Clave1234', 10), estado: true, must_change_password: false,
    });
    await u.setEmpresas([ctx.empresa.id]);
    const cajero = request.agent(app);
    expect((await cajero.post('/api/auth/login').send({ username: 'cajero', contrasena: 'Clave1234' })).status).toBe(200);

    const ver = await withEmpresa(cajero.get(`/api/caja/${cajaId}`));
    expect(ver.status).toBe(404);
    const cerrar = await withEmpresa(cajero.post(`/api/caja/${cajaId}/cerrar`)).send({ monto_contado: 0 });
    expect(cerrar.status).toBe(404);
    const lista = await withEmpresa(cajero.get('/api/caja'));
    expect(lista.body).toHaveLength(0);
  });

  it('cierra la caja: guarda la foto del turno y calcula la diferencia', async () => {
    const res = await conEmpresa(agent.post(`/api/caja/${cajaId}/cerrar`)).send({
      monto_contado: 148000, observaciones: 'Faltaron 2.000',
    });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('CERRADA');
    expect(Number(res.body.efectivo_esperado)).toBe(150000);
    expect(Number(res.body.monto_contado)).toBe(148000);
    expect(Number(res.body.diferencia)).toBe(-2000);
    expect(res.body.resumen.num_ventas).toBe(3);
    expect(res.body.usuarioCierre.nombre).toBe('Front Admin');
  });

  it('no se puede cerrar dos veces ni vender después del cierre', async () => {
    const dos = await conEmpresa(agent.post(`/api/caja/${cajaId}/cerrar`)).send({ monto_contado: 1 });
    expect(dos.status).toBe(400);
    expect(dos.body.error).toMatch(/ya está cerrada/i);

    expect((await venderServicio()).status).toBe(400);
  });

  it('GET /api/caja/:id devuelve el detalle con las ventas del turno (para el PDF)', async () => {
    const res = await conEmpresa(agent.get(`/api/caja/${cajaId}`));
    expect(res.status).toBe(200);
    expect(res.body.ventas).toHaveLength(3);
    expect(res.body.Empresa.nombre).toBe('TestCo');
    expect(res.body.resumen.medios.length).toBeGreaterThan(0);
  });

  it('el historial lista las cajas y filtra por estado', async () => {
    const todas = await conEmpresa(agent.get('/api/caja'));
    expect(todas.status).toBe(200);
    expect(todas.body.length).toBeGreaterThanOrEqual(1);
    const abiertas = await conEmpresa(agent.get('/api/caja?estado=ABIERTA'));
    expect(abiertas.body).toHaveLength(0);
  });

  it('tras cerrar se puede abrir una caja nueva', async () => {
    const res = await conEmpresa(agent.post('/api/caja/abrir')).send({});
    expect(res.status).toBe(201);
    expect(Number(res.body.monto_inicial)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Restaurantes fase B: costo promedio, margen, rentabilidad, mermas y conteo
// ---------------------------------------------------------------------------
describe('Fase B — costos, margen y ajustes de inventario', () => {
  let harina; let pan; let lector;

  const crearProducto = (body) => conEmpresa(agent.post('/api/productos')).send({
    precio_unitario: 1000, porcentaje_iva: 0, ...body,
  });
  const dbProducto = (id) => models.Producto.findByPk(id);

  beforeAll(async () => { await activarModulos(['Recetas']); });
  afterAll(async () => { await activarModulos([]); });

  it('el costo inicial se guarda y cada compra lo recalcula como promedio ponderado', async () => {
    const res = await crearProducto({
      codigo: 'HAR', nombre_producto: 'Harina', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 1000, costo_promedio: 2,
    });
    expect(res.status).toBe(201);
    harina = res.body;
    expect(Number(harina.costo_promedio)).toBe(2);

    const compra = await conEmpresa(agent.post('/api/compras')).send({
      proveedorId: ctx.proveedor.id,
      detalles: [{ productoId: harina.id, cantidad: 1000, costo_unitario: 4 }],
    });
    expect(compra.status).toBe(201);
    const h = await dbProducto(harina.id);
    expect(Number(h.stock_actual)).toBe(2000);
    expect(Number(h.costo_promedio)).toBe(3); // (1000×2 + 1000×4) / 2000
  });

  it('la recepción de un pedido también recalcula el costo', async () => {
    const ped = await conEmpresa(agent.post('/api/pedidos')).send({
      proveedorId: ctx.proveedor.id,
      detalles: [{ productoId: harina.id, cantidad_pedida: 2000, costo_estimado: 5 }],
    });
    const rec = await conEmpresa(agent.post(`/api/pedidos/${ped.body.id}/checkin`)).send({
      detalles_recibidos: [{ productoId: harina.id, cantidad: 2000, costo_unitario: 5 }],
    });
    expect(rec.status).toBe(200);
    expect(Number((await dbProducto(harina.id)).costo_promedio)).toBe(4); // (2000×3 + 2000×5) / 4000
    // Se deja el costo en 3 y el stock en 2000 para el resto de pruebas.
    await models.Producto.update({ costo_promedio: 3, stock_actual: 2000 }, { where: { id: harina.id } });
  });

  it('con stock agotado, el costo pasa a ser el de la nueva compra', async () => {
    const p = (await crearProducto({ codigo: 'VACIO', nombre_producto: 'Sin stock', tipo: 'INSUMO', stock_actual: 0, costo_promedio: 99 })).body;
    await conEmpresa(agent.post('/api/compras')).send({
      proveedorId: ctx.proveedor.id, detalles: [{ productoId: p.id, cantidad: 10, costo_unitario: 7 }],
    });
    expect(Number((await dbProducto(p.id)).costo_promedio)).toBe(7);
  });

  it('GET /api/productos calcula costo del plato, margen sobre precio sin IVA y porciones', async () => {
    const plato = await crearProducto({
      codigo: 'PAN', nombre_producto: 'Pan', tipo: 'RECETA', precio_unitario: 11900, porcentaje_iva: 19,
      receta: [{ insumoId: harina.id, cantidad: 100 }],
    });
    expect(plato.status).toBe(201);
    pan = plato.body;

    const lista = (await conEmpresa(agent.get('/api/productos'))).body;
    const p = lista.find((x) => x.id === pan.id);
    expect(p.costo).toBe(300); // 100 g × $3
    expect(p.precio_neto).toBe(10000); // 11.900 / 1,19
    expect(p.margen).toBe(9700);
    expect(p.margen_pct).toBe(97);
    expect(p.porciones_disponibles).toBe(20);
    expect(lista.find((x) => x.id === harina.id).costo).toBe(3);
  });

  it('cada venta guarda el costo de lo vendido y el reporte de rentabilidad lo usa', async () => {
    const res = await conEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id,
      detalles: [{ productoId: pan.id, cantidad: 2, precio_unitario: 11900, precio_base: 11900 }],
    });
    expect(res.status).toBe(201);
    const det = await models.VentaDetalle.findOne({ where: { ventaId: res.body.id } });
    expect(Number(det.costo_unitario)).toBe(300);

    // Un cambio posterior del costo NO altera lo ya vendido.
    await models.Producto.update({ costo_promedio: 10 }, { where: { id: harina.id } });
    const rent = await conEmpresa(agent.get('/api/recetas/rentabilidad'));
    expect(rent.status).toBe(200);
    const fila = rent.body.filas.find((f) => f.productoId === pan.id);
    expect(fila.unidades).toBe(2);
    expect(fila.ingresos).toBe(20000);
    expect(fila.costo).toBe(600);
    expect(fila.margen).toBe(19400);
    expect(fila.margen_pct).toBe(97);
    expect(rent.body.totales.margen).toBeGreaterThanOrEqual(19400);
    await models.Producto.update({ costo_promedio: 3 }, { where: { id: harina.id } });
  });

  it('la rentabilidad acepta rango de fechas y rechaza formatos inválidos', async () => {
    expect((await conEmpresa(agent.get('/api/recetas/rentabilidad?desde=2020-01-01&hasta=2020-01-02'))).body.filas).toEqual([]);
    expect((await conEmpresa(agent.get('/api/recetas/rentabilidad?desde=ayer'))).status).toBe(400);
  });

  it('una merma baja el stock y se valoriza al costo', async () => {
    const antes = Number((await dbProducto(harina.id)).stock_actual);
    const res = await conEmpresa(agent.post('/api/ajustes')).send({ productoId: harina.id, tipo: 'MERMA', cantidad: 50, motivo: 'Se humedeció' });
    expect(res.status).toBe(201);
    expect(Number(res.body.diferencia)).toBe(-50);
    expect(Number(res.body.valor)).toBe(-150);
    expect(Number((await dbProducto(harina.id)).stock_actual)).toBe(antes - 50);
  });

  it('rechaza mermar más de lo que hay, ajustar un plato o un tipo desconocido', async () => {
    const mucho = await conEmpresa(agent.post('/api/ajustes')).send({ productoId: harina.id, tipo: 'VENCIDO', cantidad: 999999 });
    expect(mucho.status).toBe(400);
    expect(mucho.body.error).toMatch(/no hay suficiente stock/i);

    const plato = await conEmpresa(agent.post('/api/ajustes')).send({ productoId: pan.id, tipo: 'MERMA', cantidad: 1 });
    expect(plato.status).toBe(400);
    expect(plato.body.error).toMatch(/no tiene stock propio/);

    expect((await conEmpresa(agent.post('/api/ajustes')).send({ productoId: harina.id, tipo: 'ROBO', cantidad: 1 })).status).toBe(400);
  });

  it('el conteo físico fija el stock real y solo registra donde hay diferencia', async () => {
    const otro = (await crearProducto({ codigo: 'SAL', nombre_producto: 'Sal', tipo: 'INSUMO', stock_actual: 500, costo_promedio: 1 })).body;
    const stockHarina = Number((await dbProducto(harina.id)).stock_actual);

    const res = await conEmpresa(agent.post('/api/ajustes/conteo')).send({
      motivo: 'Inventario de cierre de mes',
      items: [
        { productoId: harina.id, cantidad_contada: stockHarina - 100 }, // faltan 100 g
        { productoId: otro.id, cantidad_contada: 500 }, // cuadra
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.ajustados).toBe(1);
    expect(res.body.sin_cambio).toBe(1);
    expect(res.body.valor_total).toBe(-300);
    expect(Number((await dbProducto(harina.id)).stock_actual)).toBe(stockHarina - 100);
    expect(res.body.ajustes[0].tipo).toBe('CONTEO');
  });

  it('el conteo es solo para el administrador y rechaza productos repetidos', async () => {
    const u = await models.Usuario.create({
      rolId: 3, nombre: 'Operario', username: 'operario',
      contrasena_hash: await bcrypt.hash('Clave1234', 10), estado: true, must_change_password: false,
    });
    await u.setEmpresas([ctx.empresa.id]);
    lector = request.agent(app);
    expect((await lector.post('/api/auth/login').send({ username: 'operario', contrasena: 'Clave1234' })).status).toBe(200);

    const conteo = { items: [{ productoId: harina.id, cantidad_contada: 1 }] };
    expect((await withEmpresa(lector.post('/api/ajustes/conteo')).send(conteo)).status).toBe(403);
    // …pero un operario sí puede registrar una merma.
    expect((await withEmpresa(lector.post('/api/ajustes')).send({ productoId: harina.id, tipo: 'CONSUMO_INTERNO', cantidad: 1 })).status).toBe(201);

    const dup = await conEmpresa(agent.post('/api/ajustes/conteo')).send({
      items: [{ productoId: harina.id, cantidad_contada: 1 }, { productoId: harina.id, cantidad_contada: 2 }],
    });
    expect(dup.status).toBe(400);
  });

  it('el historial lista ajustes, filtra por tipo y resume las pérdidas valorizadas', async () => {
    const lista = await conEmpresa(agent.get('/api/ajustes?tipo=MERMA'));
    expect(lista.status).toBe(200);
    expect(lista.body.length).toBeGreaterThanOrEqual(1);
    expect(lista.body.every((a) => a.tipo === 'MERMA')).toBe(true);
    expect(lista.body[0].Producto.nombre_producto).toBeTruthy();
    expect(Number(lista.headers['x-total-count'])).toBeGreaterThanOrEqual(1);

    const resumen = await conEmpresa(agent.get('/api/ajustes/resumen'));
    expect(resumen.status).toBe(200);
    expect(resumen.body.por_tipo.map((r) => r.tipo)).toEqual(expect.arrayContaining(['MERMA', 'CONTEO']));
    expect(resumen.body.valor_total).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// Restaurantes fase C: sub-recetas y modificadores
// ---------------------------------------------------------------------------
describe('Fase C — sub-recetas (preparaciones)', () => {
  let tomate; let aceite; let salsa; let pizza;

  const crearProducto = (body) => conEmpresa(agent.post('/api/productos')).send({
    precio_unitario: 1000, porcentaje_iva: 0, ...body,
  });
  const stockDe = async (id) => Number((await models.Producto.findByPk(id)).stock_actual);
  const vender = (productoId, cantidad, extra = {}) => conEmpresa(agent.post('/api/ventas')).send({
    clienteId: ctx.cliente.id,
    detalles: [{ productoId, cantidad, precio_unitario: 20000, precio_base: 20000, ...extra }],
  });

  beforeAll(async () => { await activarModulos(['Recetas']); });
  afterAll(async () => { await activarModulos([]); });

  it('crea una preparación con rendimiento y un plato que la usa', async () => {
    tomate = (await crearProducto({ codigo: 'TOM', nombre_producto: 'Tomate', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 5000, costo_promedio: 1 })).body;
    aceite = (await crearProducto({ codigo: 'ACE', nombre_producto: 'Aceite', tipo: 'INSUMO', unidad_medida: 'MLT', stock_actual: 1000, costo_promedio: 2 })).body;

    const s = await crearProducto({
      codigo: 'SALSA', nombre_producto: 'Salsa base', tipo: 'PREPARACION', unidad_medida: 'MLT', rendimiento: 1000, stock_actual: 77, costo_promedio: 55,
      receta: [{ insumoId: tomate.id, cantidad: 800 }, { insumoId: aceite.id, cantidad: 100 }],
    });
    expect(s.status).toBe(201);
    salsa = s.body;
    expect(Number(salsa.stock_actual)).toBe(0); // una preparación no guarda stock
    expect(Number(salsa.rendimiento)).toBe(1000);
    expect(Number(salsa.costo_promedio)).toBe(0); // el costo sale de la receta

    const p = await crearProducto({
      codigo: 'PIZZA', nombre_producto: 'Pizza', tipo: 'RECETA', precio_unitario: 20000,
      receta: [{ insumoId: salsa.id, cantidad: 150 }, { insumoId: aceite.id, cantidad: 10 }],
    });
    expect(p.status).toBe(201);
    pizza = p.body;
  });

  it('el costo y las porciones se calculan expandiendo la sub-receta', async () => {
    const lista = (await conEmpresa(agent.get('/api/productos'))).body;
    // salsa: 800 g tomate + 100 ml aceite por 1000 ml -> (800×1 + 100×2) / 1000 = $1 por ml
    expect(lista.find((x) => x.id === salsa.id).costo).toBe(1);
    // pizza: 150 ml salsa (120 g tomate + 15 ml aceite) + 10 ml aceite -> 120×1 + 25×2 = 170
    const p = lista.find((x) => x.id === pizza.id);
    expect(p.costo).toBe(170);
    expect(p.porciones_disponibles).toBe(40); // aceite: 1000 / 25
  });

  it('vender el plato descuenta los ingredientes base de la preparación', async () => {
    const res = await vender(pizza.id, 2);
    expect(res.status).toBe(201);
    expect(await stockDe(tomate.id)).toBe(4760); // 5000 - 2×120
    expect(await stockDe(aceite.id)).toBe(950); // 1000 - 2×25
    expect(await stockDe(salsa.id)).toBe(0);
    const det = await models.VentaDetalle.findOne({ where: { ventaId: res.body.id } });
    expect(Number(det.costo_unitario)).toBe(170);
  });

  it('rechaza si falta un ingrediente de la sub-receta', async () => {
    await models.Producto.update({ stock_actual: 100 }, { where: { id: tomate.id } });
    const res = await vender(pizza.id, 1); // necesita 120 g de tomate
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Stock insuficiente de "Tomate" para preparar "Pizza"/);
    expect(await stockDe(aceite.id)).toBe(950); // nada se descontó
    await models.Producto.update({ stock_actual: 4760 }, { where: { id: tomate.id } });
  });

  it('una preparación no se vende, no se compra ni se pide', async () => {
    const venta = await vender(salsa.id, 1);
    expect(venta.status).toBe(400);
    expect(venta.body.error).toMatch(/no se vende directamente/);

    const compra = await conEmpresa(agent.post('/api/compras')).send({
      proveedorId: ctx.proveedor.id, detalles: [{ productoId: salsa.id, cantidad: 1, costo_unitario: 1 }],
    });
    expect(compra.status).toBe(400);
    const pedido = await conEmpresa(agent.post('/api/pedidos')).send({
      proveedorId: ctx.proveedor.id, detalles: [{ productoId: salsa.id, cantidad_pedida: 1, costo_estimado: 1 }],
    });
    expect(pedido.status).toBe(400);
  });

  it('detecta ciclos entre preparaciones', async () => {
    const b = await crearProducto({
      codigo: 'SALSAB', nombre_producto: 'Salsa picante', tipo: 'PREPARACION', unidad_medida: 'MLT', rendimiento: 500,
      receta: [{ insumoId: salsa.id, cantidad: 200 }],
    });
    expect(b.status).toBe(201);

    // salsa base -> salsa picante -> salsa base
    const ciclo = await conEmpresa(agent.put(`/api/productos/${salsa.id}`)).send({
      receta: [{ insumoId: b.body.id, cantidad: 10 }],
    });
    expect(ciclo.status).toBe(400);
    expect(ciclo.body.error).toMatch(/ciclo/);
    // y una preparación tampoco puede usarse a sí misma
    const propio = await conEmpresa(agent.put(`/api/productos/${salsa.id}`)).send({ receta: [{ insumoId: salsa.id, cantidad: 1 }] });
    expect(propio.status).toBe(400);
  });

  it('una preparación en uso no deja de serlo; un plato sigue sin poder ser ingrediente', async () => {
    const res = await conEmpresa(agent.put(`/api/productos/${salsa.id}`)).send({ tipo: 'INSUMO' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/se usa como ingrediente/);

    const anidado = await crearProducto({
      codigo: 'X-PLATO', nombre_producto: 'Plato en plato', tipo: 'RECETA', receta: [{ insumoId: pizza.id, cantidad: 1 }],
    });
    expect(anidado.status).toBe(400);
  });

  it('el dashboard no alerta platos ni preparaciones sin mínimo configurado', async () => {
    const res = await conEmpresa(agent.get('/api/reportes/dashboard'));
    expect(res.body.productosBajoStock.some((p) => ['RECETA', 'PREPARACION'].includes(p.tipo))).toBe(false);
  });
});

describe('Fase C — modificadores de platos', () => {
  let tomate; let aceite; let salsa; let pizza; let extraQueso; let sinSalsa;

  const crearProducto = (body) => conEmpresa(agent.post('/api/productos')).send({
    precio_unitario: 1000, porcentaje_iva: 0, ...body,
  });
  const stockDe = async (id) => Number((await models.Producto.findByPk(id)).stock_actual);
  const vender = (detalle) => conEmpresa(agent.post('/api/ventas')).send({
    clienteId: ctx.cliente.id,
    detalles: [{ productoId: pizza.id, cantidad: 1, precio_unitario: 20000, precio_base: 20000, ...detalle }],
  });

  beforeAll(async () => {
    await activarModulos(['Recetas']);
    tomate = (await crearProducto({ codigo: 'M-TOM', nombre_producto: 'Tomate M', tipo: 'INSUMO', stock_actual: 5000, costo_promedio: 1 })).body;
    aceite = (await crearProducto({ codigo: 'M-ACE', nombre_producto: 'Aceite M', tipo: 'INSUMO', stock_actual: 1000, costo_promedio: 2 })).body;
    salsa = (await crearProducto({
      codigo: 'M-SAL', nombre_producto: 'Salsa M', tipo: 'PREPARACION', rendimiento: 1000,
      receta: [{ insumoId: tomate.id, cantidad: 800 }, { insumoId: aceite.id, cantidad: 100 }],
    })).body;
    pizza = (await crearProducto({
      codigo: 'M-PIZ', nombre_producto: 'Pizza M', tipo: 'RECETA', precio_unitario: 20000,
      receta: [{ insumoId: salsa.id, cantidad: 150 }, { insumoId: aceite.id, cantidad: 10 }],
    })).body;
  });
  afterAll(async () => { await activarModulos([]); });

  it('crea modificadores con precio extra e ingredientes con signo', async () => {
    const a = await conEmpresa(agent.post('/api/modificadores')).send({
      nombre: 'Extra queso', precio_extra: 2000, items: [{ insumoId: aceite.id, cantidad: 5 }],
    });
    expect(a.status).toBe(201);
    extraQueso = a.body;
    expect(extraQueso.items).toHaveLength(1);

    const b = await conEmpresa(agent.post('/api/modificadores')).send({
      nombre: 'Sin salsa', items: [{ insumoId: salsa.id, cantidad: -150 }],
    });
    expect(b.status).toBe(201);
    sinSalsa = b.body;
    expect(Number(sinSalsa.items[0].cantidad)).toBe(-150);
    expect(Number(sinSalsa.precio_extra)).toBe(0);
  });

  it('valida nombre único, ingredientes y exige el módulo Recetas', async () => {
    const dup = await conEmpresa(agent.post('/api/modificadores')).send({ nombre: 'Extra queso' });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/ya existe/i);

    const plato = await conEmpresa(agent.post('/api/modificadores')).send({
      nombre: 'Con plato', items: [{ insumoId: pizza.id, cantidad: 1 }],
    });
    expect(plato.status).toBe(400);

    const cero = await conEmpresa(agent.post('/api/modificadores')).send({
      nombre: 'En cero', items: [{ insumoId: aceite.id, cantidad: 0 }],
    });
    expect(cero.status).toBe(400);

    await activarModulos([]);
    expect((await conEmpresa(agent.get('/api/modificadores'))).status).toBe(403);
    await activarModulos(['Recetas']);
  });

  it('un extra suma al precio y al consumo; la factura guarda los modificadores', async () => {
    const res = await vender({ cantidad: 2, precio_unitario: 22000, precio_base: 22000, modificadores: [extraQueso.id] });
    expect(res.status).toBe(201);
    expect(Number(res.body.total)).toBe(44000);
    // por pizza: aceite 15 (salsa) + 10 (receta) + 5 (extra) = 30
    expect(await stockDe(aceite.id)).toBe(1000 - 60);
    expect(await stockDe(tomate.id)).toBe(5000 - 240);

    const det = await models.VentaDetalle.findOne({ where: { ventaId: res.body.id } });
    expect(det.modificadores).toEqual([{ id: extraQueso.id, nombre: 'Extra queso', precio_extra: 2000 }]);
    expect(Number(det.costo_unitario)).toBe(120 + 30 * 2); // tomate 120×1 + aceite 30×2
  });

  it('el precio no puede superar el de lista MÁS los extras', async () => {
    const caro = await vender({ precio_unitario: 22001, modificadores: [extraQueso.id] });
    expect(caro.status).toBe(400);
    expect(caro.body.error).toMatch(/precio de lista/);
    // sin el modificador, el mismo precio tampoco se permite
    expect((await vender({ precio_unitario: 22000 })).status).toBe(400);
  });

  it('"sin salsa" quita la sub-receta del consumo', async () => {
    const tomateAntes = await stockDe(tomate.id);
    const aceiteAntes = await stockDe(aceite.id);
    const res = await vender({ modificadores: [sinSalsa.id] });
    expect(res.status).toBe(201);
    expect(await stockDe(tomate.id)).toBe(tomateAntes); // sin tomate: la salsa no se usó
    expect(await stockDe(aceite.id)).toBe(aceiteAntes - 10); // solo el aceite de la receta
  });

  it('un modificador inactivo, inexistente o en una línea que no es plato se rechaza', async () => {
    await conEmpresa(agent.put(`/api/modificadores/${extraQueso.id}`)).send({ activo: false });
    const inactivo = await vender({ modificadores: [extraQueso.id] });
    expect(inactivo.status).toBe(400);
    expect(inactivo.body.error).toMatch(/inactivo/i);
    expect((await vender({ modificadores: [999999] })).status).toBe(400);

    const enProducto = await conEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id,
      detalles: [{ productoId: ctx.producto.id, cantidad: 1, precio_unitario: 1190, modificadores: [sinSalsa.id] }],
    });
    expect(enProducto.status).toBe(400);
    expect(enProducto.body.error).toMatch(/solo los platos/i);
    await conEmpresa(agent.put(`/api/modificadores/${extraQueso.id}`)).send({ activo: true });
  });

  it('editar un modificador reemplaza sus ingredientes; la lista oculta inactivos salvo ?todos', async () => {
    const edit = await conEmpresa(agent.put(`/api/modificadores/${extraQueso.id}`)).send({
      precio_extra: 2500, items: [{ insumoId: tomate.id, cantidad: 10 }, { insumoId: aceite.id, cantidad: 2 }],
    });
    expect(edit.status).toBe(200);
    expect(edit.body.items).toHaveLength(2);
    expect(Number(edit.body.precio_extra)).toBe(2500);

    await conEmpresa(agent.put(`/api/modificadores/${sinSalsa.id}`)).send({ activo: false });
    const activos = (await conEmpresa(agent.get('/api/modificadores'))).body.map((m) => m.nombre);
    expect(activos).toContain('Extra queso');
    expect(activos).not.toContain('Sin salsa');
    const todos = (await conEmpresa(agent.get('/api/modificadores?todos=1'))).body.map((m) => m.nombre);
    expect(todos).toContain('Sin salsa');

    expect((await conEmpresa(agent.put('/api/modificadores/999999')).send({ nombre: 'X' })).status).toBe(404);
  });

  it('un ingrediente usado en un modificador no puede convertirse en plato', async () => {
    const res = await conEmpresa(agent.put(`/api/productos/${aceite.id}`)).send({
      tipo: 'RECETA', receta: [{ insumoId: tomate.id, cantidad: 1 }],
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Presentación de compra: se compra en kg / caja y se gasta en g / unidades
// ---------------------------------------------------------------------------
describe('Presentación de compra (comprar en kg, gastar en g)', () => {
  let harina;

  const crearProducto = (body) => conEmpresa(agent.post('/api/productos')).send({
    precio_unitario: 1000, porcentaje_iva: 0, ...body,
  });
  const dbProducto = (id) => models.Producto.findByPk(id);
  const comprar = (detalle) => conEmpresa(agent.post('/api/compras')).send({
    proveedorId: ctx.proveedor.id, detalles: [{ productoId: harina.id, ...detalle }],
  });

  beforeAll(async () => { await activarModulos(['Recetas']); });
  afterAll(async () => { await activarModulos([]); });

  it('un producto guarda su presentación de compra (unidad + factor)', async () => {
    const res = await crearProducto({
      codigo: 'HAR-PRES', nombre_producto: 'Harina presentación', tipo: 'INSUMO', unidad_medida: 'GRM',
      stock_actual: 0, unidad_compra: 'KGM', factor_compra: 1000,
    });
    expect(res.status).toBe(201);
    harina = res.body;
    expect(harina.unidad_compra).toBe('KGM');
    expect(Number(harina.factor_compra)).toBe(1000);
    const lista = (await conEmpresa(agent.get('/api/productos'))).body;
    expect(lista.find((p) => p.id === harina.id).unidad_compra).toBe('KGM');
  });

  it('exige el factor con la unidad y no admite presentación en platos', async () => {
    const sinFactor = await crearProducto({ codigo: 'X1', nombre_producto: 'Sin factor', tipo: 'INSUMO', unidad_compra: 'KGM' });
    expect(sinFactor.status).toBe(400);
    expect(sinFactor.body.error).toMatch(/factor/);

    const factorCero = await crearProducto({ codigo: 'X2', nombre_producto: 'Factor cero', tipo: 'INSUMO', unidad_compra: 'KGM', factor_compra: 0 });
    expect(factorCero.status).toBe(400);

    const plato = await crearProducto({
      codigo: 'X3', nombre_producto: 'Plato con presentación', tipo: 'RECETA',
      receta: [{ insumoId: harina.id, cantidad: 100 }], unidad_compra: 'CAJA', factor_compra: 2,
    });
    expect(plato.status).toBe(400);
  });

  it('comprar en presentación suma el stock en unidad base y el costo por unidad base', async () => {
    const res = await comprar({ cantidad: 2.5, costo_unitario: 17333, en_presentacion: true });
    expect(res.status).toBe(201);
    expect(Number(res.body.total)).toBe(43332.5); // 2,5 kg × $17.333 (no cambia al convertir)

    const p = await dbProducto(harina.id);
    expect(Number(p.stock_actual)).toBe(2500);
    expect(Number(p.costo_promedio)).toBe(17.333);

    const det = await models.CompraDetalle.findOne({ where: { compraId: res.body.id } });
    expect(Number(det.cantidad)).toBe(2500);
    expect(Number(det.costo_unitario)).toBe(17.333);
    expect(det.unidad_presentacion).toBe('KGM');
    expect(Number(det.factor_presentacion)).toBe(1000);
  });

  it('mezcla compras en presentación y en unidad base en el promedio ponderado', async () => {
    const res = await comprar({ cantidad: 1000, costo_unitario: 20 }); // 1000 g a $20/g, en unidad base
    expect(res.status).toBe(201);
    expect(Number(res.body.total)).toBe(20000);
    const p = await dbProducto(harina.id);
    expect(Number(p.stock_actual)).toBe(3500);
    expect(Number(p.costo_promedio)).toBe(18.095); // (2500×17,333 + 1000×20) / 3500
    const det = await models.CompraDetalle.findOne({ where: { compraId: res.body.id } });
    expect(det.unidad_presentacion).toBeNull();
  });

  it('rechaza comprar en presentación un producto que no la tiene, o un gasto', async () => {
    const sin = await conEmpresa(agent.post('/api/compras')).send({
      proveedorId: ctx.proveedor.id,
      detalles: [{ productoId: ctx.producto.id, cantidad: 1, costo_unitario: 100, en_presentacion: true }],
    });
    expect(sin.status).toBe(400);
    expect(sin.body.error).toMatch(/no tiene presentación de compra/);

    const gasto = await conEmpresa(agent.post('/api/compras')).send({
      proveedorId: ctx.proveedor.id,
      detalles: [{ descripcion_gasto: 'Flete', cantidad: 1, costo_unitario: 100, en_presentacion: true }],
    });
    expect(gasto.status).toBe(400); // las compras solo llevan productos
  });

  it('el pedido en presentación guarda cantidades base y la recepción puede hacerse en kg o en g', async () => {
    const ped = await conEmpresa(agent.post('/api/pedidos')).send({
      proveedorId: ctx.proveedor.id,
      detalles: [{ productoId: harina.id, cantidad_pedida: 3, costo_estimado: 18000, en_presentacion: true }],
    });
    expect(ped.status).toBe(201);
    expect(Number(ped.body.total_estimado)).toBe(54000);
    const linea = await models.PedidoDetalle.findOne({ where: { pedidoId: ped.body.id } });
    expect(Number(linea.cantidad_pedida)).toBe(3000);
    expect(Number(linea.costo_estimado)).toBe(18);
    expect(linea.unidad_presentacion).toBe('KGM');

    const stockAntes = Number((await dbProducto(harina.id)).stock_actual);
    // 1 kg recibido, capturado en kg
    const parcial = await conEmpresa(agent.post(`/api/pedidos/${ped.body.id}/checkin`)).send({
      detalles_recibidos: [{ productoId: harina.id, cantidad: 1, costo_unitario: 18000, en_presentacion: true }],
    });
    expect(parcial.status).toBe(200);
    expect(parcial.body.estado).toBe('PARCIAL');
    expect(Number((await dbProducto(harina.id)).stock_actual)).toBe(stockAntes + 1000);
    expect(Number((await models.Compra.findByPk(parcial.body.compraId)).total)).toBe(18000);

    // los 2 kg restantes, capturados en gramos
    const resto = await conEmpresa(agent.post(`/api/pedidos/${ped.body.id}/checkin`)).send({
      detalles_recibidos: [{ productoId: harina.id, cantidad: 2000, costo_unitario: 18 }],
    });
    expect(resto.status).toBe(200);
    expect(resto.body.estado).toBe('COMPLETADO');
    expect(Number((await dbProducto(harina.id)).stock_actual)).toBe(stockAntes + 3000);
    const recibida = await models.PedidoDetalle.findOne({ where: { pedidoId: ped.body.id } });
    expect(Number(recibida.cantidad_recibida)).toBe(3000);
  });

  it('quitar la presentación deja el factor en 1; cambiar de unidad exige un factor nuevo', async () => {
    const cambio = await conEmpresa(agent.put(`/api/productos/${harina.id}`)).send({ unidad_compra: 'LBR' });
    expect(cambio.status).toBe(400);

    const ok = await conEmpresa(agent.put(`/api/productos/${harina.id}`)).send({ unidad_compra: 'LBR', factor_compra: 453.592 });
    expect(ok.status).toBe(200);
    expect(Number((await dbProducto(harina.id)).factor_compra)).toBe(453.592);

    const quitar = await conEmpresa(agent.put(`/api/productos/${harina.id}`)).send({ unidad_compra: null });
    expect(quitar.status).toBe(200);
    const p = await dbProducto(harina.id);
    expect(p.unidad_compra).toBeNull();
    expect(Number(p.factor_compra)).toBe(1);
    // y un update que no menciona la presentación no la toca
    await conEmpresa(agent.put(`/api/productos/${harina.id}`)).send({ unidad_compra: 'KGM', factor_compra: 1000 });
    await conEmpresa(agent.put(`/api/productos/${harina.id}`)).send({ nombre_producto: 'Harina renombrada' });
    expect((await dbProducto(harina.id)).unidad_compra).toBe('KGM');
  });
});

// ---------------------------------------------------------------------------
// Capital base, gastos sin proveedor y egresos de caja
// ---------------------------------------------------------------------------
describe('Capital inicial de la empresa', () => {
  it('se fija al crear la empresa, se puede cambiar y su cambio queda auditado', async () => {
    const bo = request.agent(app);
    expect((await bo.post('/api/auth/login').send({ username: 'boadmin', contrasena: 'Clave1234' })).status).toBe(200);

    const sinCapital = await bo.post('/api/empresas').send({ nombre: 'Sin capital', nit: '902000001' });
    expect(Number(sinCapital.body.capital_inicial)).toBe(0);

    const creada = await bo.post('/api/empresas').send({ nombre: 'Con capital', nit: '902000002', capital_inicial: '5000000' });
    expect(creada.status).toBe(201);
    expect(Number(creada.body.capital_inicial)).toBe(5000000);

    const editada = await bo.put(`/api/empresas/${creada.body.id}`).send({ capital_inicial: 7500000.5 });
    expect(editada.status).toBe(200);
    expect(Number(editada.body.capital_inicial)).toBe(7500000.5);

    expect((await bo.post('/api/empresas').send({ nombre: 'Negativo', nit: '902000003', capital_inicial: -1 })).status).toBe(400);
  });
});

describe('Gastos (sin proveedor) y flujo de dinero de la caja', () => {
  let cajaId; let gastoCaja; let gastoPendiente;
  const gastoBody = (extra = {}) => ({ categoria: 'SERVICIOS', descripcion: 'Recibo de luz', monto: 150000, ...extra });
  const dbCaja = (id) => models.Caja.findByPk(id);
  const actual = async () => (await conEmpresa(agent.get('/api/caja/actual'))).body;
  const balance = async (q = '') => (await conEmpresa(agent.get(`/api/caja/balance${q}`))).body;
  const venderEfectivo = (monto) => conEmpresa(agent.post('/api/ventas')).send({
    clienteId: ctx.cliente.id,
    detalles: [{ servicioId: ctx.servicio.id, cantidad: 1, precio_unitario: monto, precio_base: monto }],
  });

  beforeAll(async () => {
    await models.Servicio.update({ precio: 100000, porcentaje_iva: 0 }, { where: { id: ctx.servicio.id } });
    await models.Empresa.update({ capital_inicial: 1000000 }, { where: { id: ctx.empresa.id } });
    await activarModulos(['Caja']);
  });
  afterAll(async () => { await activarModulos([]); });

  it('registra un gasto SIN proveedor (recibo de luz) y valida sus datos', async () => {
    const res = await conEmpresa(agent.post('/api/gastos')).send(gastoBody());
    expect(res.status).toBe(201);
    expect(res.body.proveedorId).toBeNull();
    expect(res.body.origen_pago).toBe('OTRO');
    expect(res.body.estado).toBe('ACTIVO');

    expect((await conEmpresa(agent.post('/api/gastos')).send(gastoBody({ categoria: 'DIVERSION' }))).status).toBe(400);
    expect((await conEmpresa(agent.post('/api/gastos')).send(gastoBody({ monto: 0 }))).status).toBe(400);
    expect((await conEmpresa(agent.post('/api/gastos')).send(gastoBody({ descripcion: '  ' }))).status).toBe(400);
    expect((await conEmpresa(agent.post('/api/gastos')).send(gastoBody({ proveedorId: 999999 }))).status).toBe(400);
  });

  it('un gasto puede llevar proveedor opcional y fecha anterior', async () => {
    const res = await conEmpresa(agent.post('/api/gastos')).send(gastoBody({
      proveedorId: ctx.proveedor.id, fecha: '2026-01-15', descripcion: 'Arriendo enero', categoria: 'ARRIENDO', monto: 2000000,
    }));
    expect(res.status).toBe(201);
    expect(res.body.Proveedor.nombre).toBe('Proveedor Test');
    expect(res.body.fecha).toMatch(/^2026-01-15/);
  });

  it('exige el módulo Gastos', async () => {
    const todos = await ctx.empresa.getModulos();
    await ctx.empresa.setModulos(todos.filter((m) => m.nombre_codigo !== 'Gastos'));
    invalidateAllProfiles();
    expect((await conEmpresa(agent.get('/api/gastos'))).status).toBe(403);
    await ctx.empresa.setModulos(todos);
    invalidateAllProfiles();
  });

  it('las compras siguen exigiendo proveedor y solo productos', async () => {
    const sinProv = await conEmpresa(agent.post('/api/compras')).send({
      detalles: [{ productoId: ctx.producto.id, cantidad: 1, costo_unitario: 100 }],
    });
    expect(sinProv.status).toBe(400);
    const gasto = await conEmpresa(agent.post('/api/compras')).send({
      proveedorId: ctx.proveedor.id, detalles: [{ descripcion_gasto: 'Flete', cantidad: 1, costo_unitario: 100 }],
    });
    expect(gasto.status).toBe(400);
  });

  it('pagar desde la caja exige una caja abierta', async () => {
    // Deja las cajas de pruebas anteriores cerradas.
    await models.Caja.update({ estado: 'CERRADA', fecha_cierre: new Date(), monto_contado: 0, total_egresos: 0 }, { where: { empresaId: ctx.empresa.id, estado: 'ABIERTA' } });
    const res = await conEmpresa(agent.post('/api/gastos')).send(gastoBody({ pagar_desde_caja: true }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/caja abierta/i);
    const retiro = await conEmpresa(agent.post('/api/caja/retiros')).send({ concepto: 'Sin caja', monto: 100 });
    expect(retiro.status).toBe(400);
  });

  it('la base sugerida es lo contado en el último cierre', async () => {
    const res = await conEmpresa(agent.get('/api/caja/base-sugerida'));
    expect(res.status).toBe(200);
    expect(res.body.origen).toBe('CIERRE_ANTERIOR');
    expect(res.body.monto).toBe(0); // la última caja se cerró en 0 (arriba)
  });

  it('sin cierres previos, la base sugerida es el capital inicial', async () => {
    const otra = await models.Empresa.create({ nombre: 'Nueva', tipo_empresa: 'SIMPLE', capital_inicial: 2500000 });
    const mods = await models.Modulo.findAll({ where: { nombre_codigo: ['Inventario', 'Clientes', 'Ventas', 'Caja'] } });
    await otra.setModulos(mods);
    await ctx.usuario.addEmpresa(otra);
    invalidateAllProfiles();
    const res = await agent.get('/api/caja/base-sugerida').set('X-Empresa-Id', String(otra.id));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ monto: 2500000, origen: 'CAPITAL_INICIAL' });
  });

  it('abrir caja con la base: es el efectivo con el que se mueve el turno', async () => {
    const res = await conEmpresa(agent.post('/api/caja/abrir')).send({ monto_inicial: 50000 });
    expect(res.status).toBe(201);
    cajaId = res.body.id;
    expect(res.body.resumen.efectivo_esperado).toBe(50000);
  });

  it('una venta suma, y retiros / gastos / compras en efectivo restan del efectivo esperado', async () => {
    const b0 = await balance();
    expect(b0.capital_inicial).toBe(1000000);

    expect((await venderEfectivo(100000)).status).toBe(201); // +100.000 -> 150.000
    expect((await actual()).resumen.efectivo_esperado).toBe(150000);

    const retiro = await conEmpresa(agent.post('/api/caja/retiros')).send({ concepto: 'Consignación al banco', monto: 20000 });
    expect(retiro.status).toBe(201);
    expect((await actual()).resumen.efectivo_esperado).toBe(130000);

    const g = await conEmpresa(agent.post('/api/gastos')).send(gastoBody({
      categoria: 'TRANSPORTE', descripcion: 'Domiciliario', monto: 30000, pagar_desde_caja: true,
    }));
    expect(g.status).toBe(201);
    expect(g.body.origen_pago).toBe('CAJA');
    gastoCaja = g.body;
    expect((await actual()).resumen.efectivo_esperado).toBe(100000);

    const compra = await conEmpresa(agent.post('/api/compras')).send({
      proveedorId: ctx.proveedor.id, pago_desde_caja: true,
      detalles: [{ productoId: ctx.producto.id, cantidad: 10, costo_unitario: 500 }],
    });
    expect(compra.status).toBe(201);
    expect((await actual()).resumen.efectivo_esperado).toBe(95000);

    gastoPendiente = (await conEmpresa(agent.post('/api/gastos')).send(gastoBody({ descripcion: 'Papelería', categoria: 'OTROS', monto: 10000, pagar_desde_caja: true }))).body;
    expect((await actual()).resumen.efectivo_esperado).toBe(85000);

    const movs = (await conEmpresa(agent.get(`/api/caja/${cajaId}`))).body.movimientos;
    expect(movs.map((m) => m.tipo)).toEqual(['RETIRO', 'GASTO', 'COMPRA', 'GASTO']);
    expect(movs.map((m) => Number(m.monto))).toEqual([20000, 30000, 5000, 10000]);

    // Dinero de la empresa: +100.000 de venta − 20.000 retiro − 30.000 gasto − 5.000 compra − 10.000 gasto
    const b1 = await balance();
    expect(b1.dinero_actual - b0.dinero_actual).toBe(35000);
    expect(b1.acumulado.retiros - b0.acumulado.retiros).toBe(20000);
    expect(b1.acumulado.gastos - b0.acumulado.gastos).toBe(40000);
    expect(b1.acumulado.compras - b0.acumulado.compras).toBe(5000);
  });

  it('no se puede sacar más efectivo del que hay, y no queda nada registrado a medias', async () => {
    const gastosAntes = await models.Gasto.count({ where: { empresaId: ctx.empresa.id } });
    const retiro = await conEmpresa(agent.post('/api/caja/retiros')).send({ concepto: 'Mucho', monto: 999999 });
    expect(retiro.status).toBe(400);
    expect(retiro.body.error).toMatch(/no alcanza/);

    const gasto = await conEmpresa(agent.post('/api/gastos')).send(gastoBody({ monto: 999999, pagar_desde_caja: true }));
    expect(gasto.status).toBe(400);
    expect(await models.Gasto.count({ where: { empresaId: ctx.empresa.id } })).toBe(gastosAntes);

    const compra = await conEmpresa(agent.post('/api/compras')).send({
      proveedorId: ctx.proveedor.id, pago_desde_caja: true,
      detalles: [{ productoId: ctx.producto.id, cantidad: 1000, costo_unitario: 1000 }],
    });
    expect(compra.status).toBe(400);
  });

  it('el balance compara el dinero actual con el capital inicial', async () => {
    const b = await balance();
    const a = b.acumulado;
    expect(b.dinero_actual).toBeCloseTo(b.capital_inicial + a.ventas - a.compras - a.gastos - a.retiros, 2);
    expect(b.variacion).toBeCloseTo(b.dinero_actual - b.capital_inicial, 2);
    expect(b.variacion_pct).toBeCloseTo((b.variacion / b.capital_inicial) * 100, 1);
    expect(b.efectivo_en_cajas).toBe(85000);
    expect(b.cajas_abiertas).toBe(1);
    expect(b.periodo).toBeNull();

    const hoy = fechaLocal();
    const conPeriodo = await balance(`?desde=${hoy}&hasta=${hoy}`);
    expect(conPeriodo.periodo.retiros).toBe(20000);
    expect(conPeriodo.periodo.neto).toBeCloseTo(conPeriodo.periodo.ventas - conPeriodo.periodo.compras - conPeriodo.periodo.gastos - conPeriodo.periodo.retiros, 2);
    expect((await conEmpresa(agent.get('/api/caja/balance?desde=hoy'))).status).toBe(400);
  });

  it('las ventas a crédito no cuentan como dinero cobrado', async () => {
    const antes = await balance();
    const res = await conEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id, forma_pago: '2',
      detalles: [{ servicioId: ctx.servicio.id, cantidad: 1, precio_unitario: 100000, precio_base: 100000 }],
    });
    expect(res.status).toBe(201);
    const despues = await balance();
    expect(despues.dinero_actual).toBe(antes.dinero_actual);
    expect(despues.acumulado.ventas_credito - antes.acumulado.ventas_credito).toBe(100000);
    expect((await actual()).resumen.efectivo_esperado).toBe(85000); // tampoco entra a la caja
  });

  it('un FRONT_USER no ve el balance ni anula gastos, pero sí registra gastos y retiros de su caja', async () => {
    const u = await models.Usuario.create({
      rolId: 3, nombre: 'Cajero 2', username: 'cajero2',
      contrasena_hash: await bcrypt.hash('Clave1234', 10), estado: true, must_change_password: false,
    });
    await u.setEmpresas([ctx.empresa.id]);
    const cajero = request.agent(app);
    expect((await cajero.post('/api/auth/login').send({ username: 'cajero2', contrasena: 'Clave1234' })).status).toBe(200);

    expect((await withEmpresa(cajero.get('/api/caja/balance'))).status).toBe(403);
    expect((await withEmpresa(cajero.post(`/api/gastos/${gastoCaja.id}/anular`))).status).toBe(403);
    expect((await withEmpresa(cajero.post('/api/gastos')).send(gastoBody({ monto: 5000 }))).status).toBe(201);
    // su caja está cerrada: no puede sacar efectivo de la caja de otro
    expect((await withEmpresa(cajero.post('/api/caja/retiros')).send({ concepto: 'x', monto: 1 })).status).toBe(400);
  });

  it('anular un gasto pagado de una caja abierta devuelve el efectivo y lo saca de los totales', async () => {
    const b0 = await balance();
    const res = await conEmpresa(agent.post(`/api/gastos/${gastoCaja.id}/anular`));
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('ANULADO');
    expect((await actual()).resumen.efectivo_esperado).toBe(115000); // +30.000
    const b1 = await balance();
    expect(b1.dinero_actual - b0.dinero_actual).toBe(30000);

    const otra = await conEmpresa(agent.post(`/api/gastos/${gastoCaja.id}/anular`));
    expect(otra.status).toBe(400);
    expect((await conEmpresa(agent.post('/api/gastos/999999/anular'))).status).toBe(404);
  });

  it('el listado filtra por categoría y estado, y el resumen suma por categoría sin anulados', async () => {
    const anulados = (await conEmpresa(agent.get('/api/gastos?estado=ANULADO'))).body;
    expect(anulados.every((g) => g.estado === 'ANULADO')).toBe(true);
    expect(anulados.some((g) => g.id === gastoCaja.id)).toBe(true);

    const otros = await conEmpresa(agent.get('/api/gastos?categoria=OTROS'));
    expect(otros.body.every((g) => g.categoria === 'OTROS')).toBe(true);
    expect(Number(otros.headers['x-total-count'])).toBeGreaterThanOrEqual(1);

    const resumen = (await conEmpresa(agent.get('/api/gastos/resumen'))).body;
    const transporte = resumen.por_categoria.find((c) => c.categoria === 'TRANSPORTE');
    expect(transporte).toBeUndefined(); // el gasto de transporte se anuló
    expect(resumen.por_categoria.find((c) => c.categoria === 'ARRIENDO').total).toBe(2000000);
    expect(resumen.total).toBeCloseTo(resumen.por_categoria.reduce((a, c) => a + c.total, 0), 2);
  });

  it('el dashboard informa los gastos del mes', async () => {
    const res = await conEmpresa(agent.get('/api/reportes/dashboard'));
    expect(res.status).toBe(200);
    expect(Number(res.body.gastosMes)).toBeGreaterThanOrEqual(150000);
  });

  it('al cerrar, la foto incluye los egresos y la diferencia usa el efectivo esperado neto', async () => {
    const res = await conEmpresa(agent.post(`/api/caja/${cajaId}/cerrar`)).send({ monto_contado: 114000 });
    expect(res.status).toBe(200);
    expect(Number(res.body.total_egresos)).toBe(35000); // 20.000 retiro + 5.000 compra + 10.000 gasto
    expect(Number(res.body.efectivo_esperado)).toBe(115000);
    expect(Number(res.body.diferencia)).toBe(-1000);
    expect(res.body.resumen.total_egresos).toBe(35000);

    const detalle = (await conEmpresa(agent.get(`/api/caja/${cajaId}`))).body;
    expect(detalle.movimientos).toHaveLength(3);
    expect(Number((await dbCaja(cajaId)).total_egresos)).toBe(35000);
  });

  it('tras el cierre no se puede anular un gasto pagado de esa caja ni sacar más efectivo', async () => {
    const res = await conEmpresa(agent.post(`/api/gastos/${gastoPendiente.id}/anular`));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ya fue cerrada/);
    expect((await conEmpresa(agent.post('/api/caja/retiros')).send({ concepto: 'x', monto: 1 })).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Caja opcional en cualquier tipo de empresa + sesión con módulos al día
// ---------------------------------------------------------------------------
describe('Caja: disponible para cualquier tipo de empresa, pero opcional', () => {
  const ventaServicio = () => conEmpresa(agent.post('/api/ventas')).send({
    clienteId: ctx.cliente.id,
    detalles: [{ servicioId: ctx.servicio.id, cantidad: 1, precio_unitario: 100000, precio_base: 100000 }],
  });

  beforeAll(async () => {
    await models.Servicio.update({ precio: 100000, porcentaje_iva: 0 }, { where: { id: ctx.servicio.id } });
  });
  afterAll(async () => { await activarModulos([]); });

  it('sin el módulo Caja, las ventas POS NO exigen abrir caja (aunque exista una caja cerrada)', async () => {
    await activarModulos([]);
    const res = await ventaServicio();
    expect(res.status).toBe(201);
    expect(res.body.cajaId).toBeNull();
  });

  it('al habilitar Caja las ventas la exigen; al quitarla, deja de exigirse', async () => {
    await models.Caja.update({ estado: 'CERRADA', fecha_cierre: new Date(), monto_contado: 0, total_egresos: 0 }, { where: { empresaId: ctx.empresa.id, estado: 'ABIERTA' } });
    await activarModulos(['Caja']);
    const sinCaja = await ventaServicio();
    expect(sinCaja.status).toBe(400);
    expect(sinCaja.body.error).toMatch(/abrir caja/i);

    await activarModulos([]);
    expect((await ventaServicio()).status).toBe(201);
  });

  it.each(['COMERCIO', 'RESTAURANTE', 'SERVICIOS'])('se puede contratar Caja en una empresa de tipo %s', async (tipo) => {
    const bo = request.agent(app);
    expect((await bo.post('/api/auth/login').send({ username: 'boadmin', contrasena: 'Clave1234' })).status).toBe(200);
    const ids = Object.fromEntries((await models.Modulo.findAll()).map((m) => [m.nombre_codigo, m.id]));
    const nit = { COMERCIO: '903000001', RESTAURANTE: '903000002', SERVICIOS: '903000003' }[tipo];
    const res = await bo.post('/api/empresas').send({
      nombre: `Con caja ${tipo}`, nit, tipo_negocio: tipo,
      modulosIds: [ids.Inventario, ids.Clientes, ids.Ventas, ids.Caja],
    });
    expect(res.status).toBe(201);
    expect(res.body.Modulos.map((m) => m.nombre_codigo)).toContain('Caja');
  });

  it('GET /api/auth/me devuelve los módulos ACTUALES sin volver a iniciar sesión', async () => {
    await activarModulos([]);
    const antes = await agent.get('/api/auth/me');
    expect(antes.status).toBe(200);
    const emp = antes.body.usuario.empresas.find((e) => e.id === ctx.empresa.id);
    expect(emp.modulos).not.toContain('Caja');
    expect(emp.tipo_negocio).toBeTruthy();

    await activarModulos(['Caja']);
    const despues = await agent.get('/api/auth/me');
    expect(despues.body.usuario.empresas.find((e) => e.id === ctx.empresa.id).modulos).toContain('Caja');
    expect(despues.body.usuario.rol).toBe('FRONT_ADMIN');
    await activarModulos([]);
  });

  it('GET /api/auth/me exige sesión', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Auditoría GERENCIAL (quién, cuándo, de qué empresa, qué hizo)
// ---------------------------------------------------------------------------
describe('Auditoría gerencial', () => {
  /** El logger persiste sin esperar (fire-and-forget): se reintenta hasta que aparezca. */
  async function esperarActividad(query, predicado) {
    for (let i = 0; i < 40; i += 1) {
      const res = await conEmpresa(agent.get(`/api/auditoria${query}`));
      expect(res.status).toBe(200);
      const hallado = res.body.find(predicado);
      if (hallado) return { hallado, todo: res.body, headers: res.headers };
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('El evento no apareció en la auditoría');
  }

  beforeAll(async () => {
    await models.Servicio.update({ precio: 100000, porcentaje_iva: 0 }, { where: { id: ctx.servicio.id } });
    await activarModulos([]);
  });

  it('una venta aparece como frase: usuario, hora, empresa y qué hizo', async () => {
    const venta = await conEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id,
      detalles: [{ servicioId: ctx.servicio.id, cantidad: 1, precio_unitario: 80000, precio_base: 100000 }],
    });
    expect(venta.status).toBe(201);

    const { hallado } = await esperarActividad('', (a) => a.descripcion?.includes(`Venta #${venta.body.id} `));
    expect(hallado.accion).toBe('Registró una venta');
    expect(hallado.modulo).toBe('Ventas');
    expect(hallado.usuario).toMatchObject({ nombre: 'Front Admin', username: 'fadmin' });
    expect(hallado.empresa).toMatchObject({ id: ctx.empresa.id, nombre: 'TestCo' });
    expect(hallado.descripcion).toContain('Cliente Test');
    expect(hallado.descripcion).toMatch(/80\.000/);
    expect(new Date(hallado.fecha).getTime()).toBeGreaterThan(Date.now() - 60_000);
    // Vista gerencial: sin campos técnicos.
    expect(hallado).not.toHaveProperty('nivel');
    expect(hallado).not.toHaveProperty('detalle');
    expect(hallado).not.toHaveProperty('ruta');
  });

  it('muestra el nombre de lo que se creó y no los eventos técnicos (errores de API, logins)', async () => {
    await conEmpresa(agent.post('/api/productos')).send({
      codigo: 'AUD-1', nombre_producto: 'Producto de auditoría', precio_unitario: 1000, stock_actual: 5,
    });
    await conEmpresa(agent.post('/api/ventas')).send({ clienteId: ctx.cliente.id, detalles: [] }); // 400 -> api_error técnico

    const { hallado, todo } = await esperarActividad('', (a) => a.descripcion?.includes('Producto de auditoría'));
    expect(hallado.accion).toBe('Creó un producto');
    expect(hallado.modulo).toBe('Inventario');
    const crudos = await models.LogEvento.findAll({ where: { empresaId: ctx.empresa.id, evento: 'api_error' } });
    expect(crudos.length).toBeGreaterThan(0); // el evento técnico sí existe en el log del súper admin…
    expect(todo.every((a) => a.accion && a.modulo)).toBe(true); // …pero no en la vista gerencial
  });

  it('filtra por módulo, por usuario y por fecha', async () => {
    const ventas = await conEmpresa(agent.get('/api/auditoria?modulo=Ventas'));
    expect(ventas.status).toBe(200);
    expect(ventas.body.length).toBeGreaterThan(0);
    expect(ventas.body.every((a) => a.modulo === 'Ventas')).toBe(true);

    const otroUsuario = await conEmpresa(agent.get(`/api/auditoria?usuarioId=${ctx.usuarioSesiones.id}`));
    expect(otroUsuario.body).toEqual([]);

    const hoy = fechaLocal();
    const hoyRes = await conEmpresa(agent.get(`/api/auditoria?desde=${hoy}&hasta=${hoy}`));
    expect(hoyRes.body.length).toBeGreaterThan(0);
    expect((await conEmpresa(agent.get('/api/auditoria?desde=2020-01-01&hasta=2020-01-02'))).body).toEqual([]);

    expect((await conEmpresa(agent.get('/api/auditoria?modulo=Magia'))).status).toBe(400);
  });

  it('pagina y entrega el total en la cabecera', async () => {
    const res = await conEmpresa(agent.get('/api/auditoria?limit=1'));
    expect(res.body).toHaveLength(1);
    expect(Number(res.headers['x-total-count'])).toBeGreaterThan(1);
    const sig = await conEmpresa(agent.get('/api/auditoria?limit=1&offset=1'));
    expect(sig.body[0].id).not.toBe(res.body[0].id);
  });

  it('/filtros lista los módulos y los usuarios con actividad', async () => {
    const res = await conEmpresa(agent.get('/api/auditoria/filtros'));
    expect(res.status).toBe(200);
    expect(res.body.modulos).toEqual(expect.arrayContaining(['Ventas', 'Inventario', 'Caja', 'Gastos']));
    expect(res.body.usuarios.map((u) => u.username)).toContain('fadmin');
  });

  it('solo ve la actividad de SU empresa', async () => {
    const otra = await models.Empresa.create({ nombre: 'Ajena', tipo_empresa: 'SIMPLE' });
    await models.LogEvento.create({
      evento: 'venta_creada', nivel: 'info', usuarioId: ctx.usuario.id, empresaId: otra.id,
      detalle: { ventaId: 999999, total: 1 }, creado_en: new Date(),
    });
    const res = await conEmpresa(agent.get('/api/auditoria?limit=200'));
    expect(res.body.some((a) => a.descripcion?.includes('#999999'))).toBe(false);
  });

  it('un FRONT_USER no puede ver la auditoría', async () => {
    const u = await models.Usuario.create({
      rolId: 3, nombre: 'Operario Aud', username: 'operario_aud',
      contrasena_hash: await bcrypt.hash('Clave1234', 10), estado: true, must_change_password: false,
    });
    await u.setEmpresas([ctx.empresa.id]);
    const operario = request.agent(app);
    expect((await operario.post('/api/auth/login').send({ username: 'operario_aud', contrasena: 'Clave1234' })).status).toBe(200);
    expect((await withEmpresa(operario.get('/api/auditoria'))).status).toBe(403);
    expect((await withEmpresa(operario.get('/api/auditoria/filtros'))).status).toBe(403);
  });

  it('el log técnico del súper admin sigue entero (nivel, ruta, detalle)', async () => {
    const bo = request.agent(app);
    expect((await bo.post('/api/auth/login').send({ username: 'boadmin', contrasena: 'Clave1234' })).status).toBe(200);
    const res = await bo.get('/api/logs?nivel=warn&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('nivel');
    expect(res.body[0]).toHaveProperty('evento');
    expect(res.body.some((l) => l.ruta)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Anulación de ventas: el administrador anula directo; los demás la solicitan
// ---------------------------------------------------------------------------
describe('Anulación de ventas', () => {
  let cajero; let producto; let harina; let plato; let leche;
  const stockDe = async (id) => Number((await models.Producto.findByPk(id)).stock_actual);
  const vender = (detalles, extra = {}) => conEmpresa(agent.post('/api/ventas')).send({ clienteId: ctx.cliente.id, detalles, ...extra });
  const lineaProducto = (id, cantidad, precio = 1000) => ({ productoId: id, cantidad, precio_unitario: precio, precio_base: precio });
  const servicio = (monto = 100000) => ({ servicioId: ctx.servicio.id, cantidad: 1, precio_unitario: monto, precio_base: monto });
  const anular = (id, motivo = 'Error al digitar') => conEmpresa(agent.post(`/api/ventas/${id}/anular`)).send({ motivo });
  const dbVenta = (id) => models.Venta.findByPk(id);
  const dashboard = async () => Number((await conEmpresa(agent.get('/api/reportes/dashboard'))).body.ventasMes);
  const cerrarCajasAbiertas = () => models.Caja.update(
    { estado: 'CERRADA', fecha_cierre: new Date(), monto_contado: 0, total_egresos: 0 },
    { where: { empresaId: ctx.empresa.id, estado: 'ABIERTA' } }
  );

  beforeAll(async () => {
    await activarModulos(['Recetas']);
    await models.Servicio.update({ precio: 100000, porcentaje_iva: 0 }, { where: { id: ctx.servicio.id } });
    const nuevo = (body) => conEmpresa(agent.post('/api/productos')).send({ precio_unitario: 1000, porcentaje_iva: 0, ...body });
    producto = (await nuevo({ codigo: 'ANU-P', nombre_producto: 'Producto anulable', stock_actual: 50 })).body;
    harina = (await nuevo({ codigo: 'ANU-H', nombre_producto: 'Harina anulable', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 1000 })).body;
    leche = (await nuevo({ codigo: 'ANU-L', nombre_producto: 'Leche anulable', tipo: 'INSUMO', unidad_medida: 'MLT', stock_actual: 1000 })).body;
    plato = (await nuevo({
      codigo: 'ANU-PL', nombre_producto: 'Plato anulable', tipo: 'RECETA', precio_unitario: 5000,
      receta: [{ insumoId: harina.id, cantidad: 100 }],
    })).body;

    const u = await models.Usuario.create({
      rolId: 3, nombre: 'Cajero Anula', username: 'cajero_anula',
      contrasena_hash: await bcrypt.hash('Clave1234', 10), estado: true, must_change_password: false,
    });
    await u.setEmpresas([ctx.empresa.id]);
    cajero = request.agent(app);
    expect((await cajero.post('/api/auth/login').send({ username: 'cajero_anula', contrasena: 'Clave1234' })).status).toBe(200);
  });
  afterAll(async () => { await activarModulos([]); });

  it('el administrador anula en el acto: vuelve el stock, queda ANULADA y deja de contar', async () => {
    const venta = await vender([lineaProducto(producto.id, 5)]);
    expect(venta.status).toBe(201);
    expect(await stockDe(producto.id)).toBe(45);
    const ventasMesAntes = await dashboard();

    const res = await anular(venta.body.id);
    expect(res.status).toBe(200);
    expect(res.body.resultado).toBe('ANULADA');
    expect(await stockDe(producto.id)).toBe(50);

    const v = await dbVenta(venta.body.id);
    expect(v.estado).toBe('ANULADA');
    expect(v.motivo_anulacion).toBe('Error al digitar');
    expect(v.anulada_por).toBe(ctx.usuario.id);
    expect(v.anulada_en).toBeTruthy();
    expect(await dashboard()).toBeCloseTo(ventasMesAntes - Number(venta.body.total), 2);

    const listado = (await conEmpresa(agent.get('/api/ventas?estado=ANULADA'))).body;
    expect(listado.find((x) => x.id === venta.body.id)).toMatchObject({ estado: 'ANULADA' });
    expect((await conEmpresa(agent.get(`/api/ventas/${venta.body.id}`))).body.estado).toBe('ANULADA');
  });

  it('exige motivo, no anula dos veces y responde 404 si no existe', async () => {
    const venta = await vender([lineaProducto(producto.id, 1)]);
    expect((await conEmpresa(agent.post(`/api/ventas/${venta.body.id}/anular`)).send({})).status).toBe(400);
    expect((await conEmpresa(agent.post(`/api/ventas/${venta.body.id}/anular`)).send({ motivo: 'x' })).status).toBe(400);
    expect((await anular(venta.body.id)).status).toBe(200);
    const otra = await anular(venta.body.id);
    expect(otra.status).toBe(400);
    expect(otra.body.error).toMatch(/ya está anulada/);
    expect((await anular(999999)).status).toBe(404);
    expect(await stockDe(producto.id)).toBe(50); // no se devolvió dos veces
  });

  it('un plato devuelve EXACTAMENTE lo que descontó, aunque la receta haya cambiado después', async () => {
    const venta = await vender([lineaProducto(plato.id, 3, 5000)]);
    expect(venta.status).toBe(201);
    expect(await stockDe(harina.id)).toBe(700); // 3 × 100 g

    // La receta cambia: ahora gasta 250 g y además leche.
    await conEmpresa(agent.put(`/api/productos/${plato.id}`)).send({
      receta: [{ insumoId: harina.id, cantidad: 250 }, { insumoId: leche.id, cantidad: 40 }],
    });

    expect((await anular(venta.body.id)).status).toBe(200);
    expect(await stockDe(harina.id)).toBe(1000); // vuelven los 300 g que se descontaron, no 750
    expect(await stockDe(leche.id)).toBe(1000); // la leche nunca se descontó: no se inventa
  });

  it('una venta anterior a la foto del consumo (consumo nulo) también devuelve su stock', async () => {
    const venta = await vender([lineaProducto(producto.id, 4)]);
    await models.VentaDetalle.update({ consumo: null }, { where: { ventaId: venta.body.id } });
    expect(await stockDe(producto.id)).toBe(46);
    expect((await anular(venta.body.id)).status).toBe(200);
    expect(await stockDe(producto.id)).toBe(50);
  });

  it('las ventas anuladas no cuentan en informes ni en la rentabilidad', async () => {
    const venta = await vender([lineaProducto(plato.id, 2, 5000)]);
    const antes = (await conEmpresa(agent.get('/api/recetas/rentabilidad'))).body.filas.find((f) => f.productoId === plato.id);
    expect((await anular(venta.body.id)).status).toBe(200);
    const despues = (await conEmpresa(agent.get('/api/recetas/rentabilidad'))).body.filas.find((f) => f.productoId === plato.id);
    expect(antes.unidades).toBe(2); // las ventas del plato anuladas antes no cuentan
    expect(despues).toBeUndefined(); // y al anular esta, el plato ya no tiene ventas

    const hoy = fechaLocal();
    const informe = (await conEmpresa(agent.get('/api/informes')).query({ tipo: 'ventas_resumen', start: hoy, end: hoy })).body;
    expect(informe.some((v) => v.id === venta.body.id)).toBe(false);
  });

  describe('con módulo Caja', () => {
    const abrirCaja = (base) => conEmpresa(agent.post('/api/caja/abrir')).send({ monto_inicial: base });
    const actual = async () => (await conEmpresa(agent.get('/api/caja/actual'))).body;
    const balance = async () => (await conEmpresa(agent.get('/api/caja/balance'))).body;

    beforeAll(async () => { await activarModulos(['Recetas', 'Caja']); await cerrarCajasAbiertas(); });
    afterAll(async () => { await cerrarCajasAbiertas(); await activarModulos(['Recetas']); });

    it('caja abierta: la venta sale del turno y el efectivo esperado se corrige solo', async () => {
      const caja = (await abrirCaja(50000)).body;
      const venta = await vender([servicio(100000)], { medio_pago: '10' });
      expect(venta.status).toBe(201);
      expect((await actual()).resumen.efectivo_esperado).toBe(150000);

      const res = await anular(venta.body.id);
      expect(res.status).toBe(200);
      expect(res.body.devolucion).toBeNull(); // el dinero nunca salió del turno
      const c = await actual();
      expect(c.id).toBe(caja.id);
      expect(c.resumen.efectivo_esperado).toBe(50000);
      expect(c.resumen.num_ventas).toBe(0);
      await cerrarCajasAbiertas();
    });

    it('caja ya cerrada: el turno no se reescribe; el dinero se devuelve como egreso de la caja abierta', async () => {
      const cajaA = (await abrirCaja(0)).body;
      const venta = await vender([servicio(100000)], { medio_pago: '10' });
      const cierre = await conEmpresa(agent.post(`/api/caja/${cajaA.id}/cerrar`)).send({ monto_contado: 100000 });
      expect(cierre.status).toBe(200);
      const balanceAntes = await balance();

      // Sin caja abierta no se puede devolver el efectivo.
      const sinCaja = await anular(venta.body.id);
      expect(sinCaja.status).toBe(400);
      expect(sinCaja.body.error).toMatch(/abre tu caja/i);
      expect((await dbVenta(venta.body.id)).estado).toBe('ACTIVA');

      const cajaB = (await abrirCaja(150000)).body;
      const res = await anular(venta.body.id);
      expect(res.status).toBe(200);
      expect(res.body.devolucion).toMatchObject({ tipo: 'DEVOLUCION', ventaId: venta.body.id });
      expect(Number(res.body.devolucion.monto)).toBe(100000);

      const b = await actual();
      expect(b.id).toBe(cajaB.id);
      expect(b.resumen.efectivo_esperado).toBe(50000); // 150.000 − devolución de 100.000
      expect(b.movimientos.map((m) => m.tipo)).toEqual(['DEVOLUCION']);

      // La caja A quedó exactamente como se cerró…
      const a = (await conEmpresa(agent.get(`/api/caja/${cajaA.id}`))).body;
      expect(a.resumen.total_ventas).toBe(100000);
      expect(a.ventas.find((v) => v.id === venta.body.id).estado).toBe('ANULADA'); // …pero marca la venta como anulada

      // Balance de la empresa: la venta deja de contar y la devolución NO se resta otra vez como retiro.
      const balanceDespues = await balance();
      expect(balanceDespues.dinero_actual - balanceAntes.dinero_actual).toBe(-100000);
      expect(balanceDespues.acumulado.retiros).toBe(balanceAntes.acumulado.retiros);
      await cerrarCajasAbiertas();
    });

    it('caja cerrada pero la venta NO fue en efectivo: no hay devolución desde la caja', async () => {
      const cajaA = (await abrirCaja(0)).body;
      const venta = await vender([servicio(100000)], { medio_pago: '48' }); // tarjeta
      await conEmpresa(agent.post(`/api/caja/${cajaA.id}/cerrar`)).send({ monto_contado: 0 });
      const res = await anular(venta.body.id); // ni siquiera hace falta una caja abierta
      expect(res.status).toBe(200);
      expect(res.body.devolucion).toBeNull();
    });
  });

  describe('solicitud del cajero y aprobación del administrador', () => {
    const solicitar = (id, motivo = 'El cliente se arrepintió') => withEmpresa(cajero.post(`/api/ventas/${id}/anular`)).send({ motivo });
    const pendientes = async () => (await conEmpresa(agent.get('/api/anulaciones'))).body;

    it('el cajero NO anula: deja una solicitud y la venta sigue activa', async () => {
      const venta = await vender([lineaProducto(producto.id, 2)]);
      const res = await solicitar(venta.body.id);
      expect(res.status).toBe(201);
      expect(res.body.resultado).toBe('SOLICITADA');
      expect((await dbVenta(venta.body.id)).estado).toBe('ACTIVA');
      expect(await stockDe(producto.id)).toBe(48);

      const repetida = await solicitar(venta.body.id);
      expect(repetida.status).toBe(400);
      expect(repetida.body.error).toMatch(/pendiente/);
      expect((await withEmpresa(cajero.post(`/api/ventas/${venta.body.id}/anular`)).send({})).status).toBe(400); // motivo obligatorio

      // El listado de ventas marca la solicitud en espera.
      const fila = (await conEmpresa(agent.get('/api/ventas'))).body.find((v) => v.id === venta.body.id);
      expect(fila.anulaciones).toHaveLength(1);
    });

    it('cada quien ve lo suyo: el administrador todas las pendientes; el cajero solo las suyas; resolver es del administrador', async () => {
      const lista = await pendientes();
      expect(lista.length).toBeGreaterThanOrEqual(1);
      const solicitud = lista[0];
      expect(solicitud.solicitante.nombre).toBe('Cajero Anula');
      expect(solicitud.venta.id).toBe(solicitud.ventaId);

      const suyas = (await withEmpresa(cajero.get('/api/anulaciones'))).body;
      expect(suyas.every((s) => s.solicitante.id === solicitud.solicitante.id)).toBe(true);
      expect((await withEmpresa(cajero.post(`/api/anulaciones/${solicitud.id}/aprobar`))).status).toBe(403);
      expect((await withEmpresa(cajero.post(`/api/anulaciones/${solicitud.id}/rechazar`)).send({})).status).toBe(403);
    });

    it('el administrador aprueba: se anula la venta, vuelve el stock y la solicitud queda APROBADA', async () => {
      const solicitud = (await pendientes())[0];
      const res = await conEmpresa(agent.post(`/api/anulaciones/${solicitud.id}/aprobar`));
      expect(res.status).toBe(200);
      expect(res.body.estado).toBe('APROBADA');
      expect(res.body.resolutor.nombre).toBe('Front Admin');

      const v = await dbVenta(solicitud.ventaId);
      expect(v.estado).toBe('ANULADA');
      expect(v.motivo_anulacion).toBe('El cliente se arrepintió');
      expect(v.anulada_por).toBe(ctx.usuario.id); // quien aprueba es quien anula
      expect(await stockDe(producto.id)).toBe(50);

      const otra = await conEmpresa(agent.post(`/api/anulaciones/${solicitud.id}/aprobar`));
      expect(otra.status).toBe(400);
      expect(otra.body.error).toMatch(/ya fue resuelta/);
    });

    it('el administrador rechaza: la venta sigue activa y el cajero puede volver a pedirla', async () => {
      const venta = await vender([lineaProducto(producto.id, 1)]);
      await solicitar(venta.body.id);
      const solicitud = (await pendientes()).find((s) => s.ventaId === venta.body.id);

      const res = await conEmpresa(agent.post(`/api/anulaciones/${solicitud.id}/rechazar`)).send({ comentario: 'La venta es correcta' });
      expect(res.status).toBe(200);
      expect(res.body.estado).toBe('RECHAZADA');
      expect(res.body.comentario).toBe('La venta es correcta');
      expect((await dbVenta(venta.body.id)).estado).toBe('ACTIVA');
      expect(await stockDe(producto.id)).toBe(49);

      expect((await solicitar(venta.body.id, 'Insisto')).status).toBe(201); // ya no hay una pendiente
      const historial = (await conEmpresa(agent.get('/api/anulaciones?estado=RECHAZADA'))).body;
      expect(historial.some((s) => s.id === solicitud.id)).toBe(true);
      expect((await conEmpresa(agent.post('/api/anulaciones/999999/aprobar'))).status).toBe(404);
    });

    it('no se puede pedir anular una venta ya anulada', async () => {
      const venta = await vender([lineaProducto(producto.id, 1)]);
      await anular(venta.body.id);
      const res = await solicitar(venta.body.id);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/ya está anulada/);
    });

    it('queda en la auditoría gerencial: quién pidió, quién anuló y por qué', async () => {
      const buscar = async (accion) => {
        for (let i = 0; i < 40; i += 1) {
          const res = await conEmpresa(agent.get('/api/auditoria?modulo=Ventas&limit=200'));
          const fila = res.body.find((a) => a.accion === accion);
          if (fila) return fila;
          await new Promise((r) => setTimeout(r, 50));
        }
        throw new Error(`No apareció "${accion}" en la auditoría`);
      };
      const pidio = await buscar('Pidió anular una venta');
      expect(pidio.usuario.nombre).toBe('Cajero Anula');
      expect(pidio.descripcion).toMatch(/motivo: /);

      const anulo = await buscar('Anuló una venta');
      expect(anulo.usuario.nombre).toBe('Front Admin');
      expect(anulo.descripcion).toMatch(/Venta #\d+ por/);
      expect(anulo.descripcion).toMatch(/motivo: /);

      const rechazo = await buscar('Rechazó la anulación de una venta');
      expect(rechazo.descripcion).toContain('La venta es correcta');
      const conSolicitante = (await conEmpresa(agent.get('/api/auditoria?modulo=Ventas&limit=200'))).body
        .find((a) => a.accion === 'Anuló una venta' && a.descripcion.includes('solicitada por Cajero Anula'));
      expect(conSolicitante).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Stock mínimo y reposición (todos los tipos de producto)
// ---------------------------------------------------------------------------
describe('Stock mínimo y reposición', () => {
  let harina; let gaseosa; let masa; let pan;
  const nuevo = (body) => conEmpresa(agent.post('/api/productos')).send({ precio_unitario: 1000, porcentaje_iva: 0, ...body });
  const listar = async () => (await conEmpresa(agent.get('/api/productos'))).body;
  const deLista = async (id) => (await listar()).find((p) => p.id === id);
  const reposicion = async () => (await conEmpresa(agent.get('/api/reposicion'))).body;

  beforeAll(async () => {
    await activarModulos(['Recetas']);
    harina = (await nuevo({
      codigo: 'MIN-H', nombre_producto: 'Harina mínimo', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 450,
      stock_minimo: 500, stock_objetivo: 2000, costo_promedio: 3, unidad_compra: 'KGM', factor_compra: 1000,
    })).body;
    gaseosa = (await nuevo({ codigo: 'MIN-G', nombre_producto: 'Gaseosa mínimo', stock_actual: 8, stock_minimo: 10 })).body;
    masa = (await nuevo({
      codigo: 'MIN-M', nombre_producto: 'Masa mínimo', tipo: 'PREPARACION', unidad_medida: 'GRM', rendimiento: 1000, stock_minimo: 600,
      receta: [{ insumoId: harina.id, cantidad: 500 }],
    })).body;
    pan = (await nuevo({
      codigo: 'MIN-P', nombre_producto: 'Pan mínimo', tipo: 'RECETA', precio_unitario: 5000, stock_minimo: 5,
      receta: [{ insumoId: masa.id, cantidad: 200 }],
    })).body;
  });
  afterAll(async () => { await activarModulos([]); });

  it('cada tipo de producto tiene su "disponible" y su estado de stock', async () => {
    expect(Number((await deLista(harina.id)).stock_minimo)).toBe(500);
    expect(await deLista(harina.id)).toMatchObject({ disponible: 450, estado_stock: 'BAJO', alerta_stock: true });
    expect(await deLista(gaseosa.id)).toMatchObject({ disponible: 8, estado_stock: 'BAJO', alerta_stock: true });
    // 450 g de harina producen 900 de masa (OK frente a 600) y 4 panes (bajo frente a 5)
    expect(await deLista(masa.id)).toMatchObject({ disponible: 900, estado_stock: 'OK', alerta_stock: false });
    expect(await deLista(pan.id)).toMatchObject({ disponible: 4, porciones_disponibles: 4, estado_stock: 'BAJO', alerta_stock: true });
  });

  it('el dashboard lista alertas de todos los tipos, no solo productos con stock', async () => {
    const { productosBajoStock } = (await conEmpresa(agent.get('/api/reportes/dashboard'))).body;
    const nombres = productosBajoStock.map((p) => p.nombre_producto);
    expect(nombres).toEqual(expect.arrayContaining(['Harina mínimo', 'Gaseosa mínimo', 'Pan mínimo']));
    expect(productosBajoStock.find((p) => p.nombre_producto === 'Pan mínimo')).toMatchObject({ tipo: 'RECETA', disponible: 4, stock_minimo: 5 });
    expect(nombres).not.toContain('Masa mínimo'); // su disponible (900) supera su mínimo
  });

  it('GET /api/reposicion: alertas de todos los tipos y qué pedir (los platos piden sus ingredientes)', async () => {
    const r = await reposicion();
    expect(r.resumen).toEqual({ agotados: 0, bajos: 3 });
    expect(r.alertas.map((a) => a.tipo).sort()).toEqual(['INSUMO', 'RECETA', 'VENTA']);

    // Harina: su objetivo (2.000) pesa más que lo que piden los platos; se sugiere en kg (presentación).
    const h = r.sugerencias.find((s) => s.productoId === harina.id);
    expect(h).toMatchObject({ motivo: 'MINIMO', sugerido_base: 1550, costo_estimado: 4650 });
    expect(h.pedido).toMatchObject({ cantidad: 1.55, unidad: 'KGM', cantidad_base: 1550 });
    expect(h.para).toContain('Pan mínimo'); // el pan también la necesita

    const g = r.sugerencias.find((s) => s.productoId === gaseosa.id);
    expect(g).toMatchObject({ motivo: 'MINIMO', sugerido_base: 12 }); // hasta el doble del mínimo (20)
    expect(r.sugerencias.map((s) => s.tipo)).not.toContain('RECETA'); // un plato no se compra
    expect(r.sugerencias.map((s) => s.tipo)).not.toContain('PREPARACION');
  });

  it('al comprar lo sugerido, las alertas desaparecen', async () => {
    const compra = await conEmpresa(agent.post('/api/compras')).send({
      proveedorId: ctx.proveedor.id,
      detalles: [
        { productoId: harina.id, cantidad: 1.55, costo_unitario: 3000, en_presentacion: true },
        { productoId: gaseosa.id, cantidad: 12, costo_unitario: 500 },
      ],
    });
    expect(compra.status).toBe(201);
    const r = await reposicion();
    expect(r.alertas.map((a) => a.productoId)).not.toContain(harina.id);
    expect(r.alertas.map((a) => a.productoId)).not.toContain(gaseosa.id);
    expect(r.alertas.map((a) => a.productoId)).not.toContain(pan.id);
    expect(r.sugerencias).toEqual([]);
  });

  it('vender hasta agotar un plato lo marca AGOTADO y vuelve a sugerir sus ingredientes', async () => {
    const disponibles = (await deLista(pan.id)).disponible;
    const venta = await conEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id,
      detalles: [{ productoId: pan.id, cantidad: disponibles, precio_unitario: 5000, precio_base: 5000 }],
    });
    expect(venta.status).toBe(201);
    expect(await deLista(pan.id)).toMatchObject({ disponible: 0, estado_stock: 'AGOTADO', alerta_stock: true });
    const r = await reposicion();
    expect(r.resumen.agotados).toBeGreaterThanOrEqual(1);
    expect(r.alertas[0].estado).toBe('AGOTADO'); // lo agotado primero
    expect(r.sugerencias.find((s) => s.productoId === harina.id)?.para).toContain('Pan mínimo');
  });

  it('sin mínimo configurado no hay alerta, aunque el producto esté agotado', async () => {
    const sinMinimo = (await nuevo({ codigo: 'MIN-S', nombre_producto: 'Sin mínimo', stock_actual: 0 })).body;
    expect(Number(sinMinimo.stock_minimo)).toBe(0);
    expect(await deLista(sinMinimo.id)).toMatchObject({ estado_stock: 'AGOTADO', alerta_stock: false });
    expect((await reposicion()).alertas.map((a) => a.productoId)).not.toContain(sinMinimo.id);
  });

  it('el mínimo se edita; "reponer hasta" no puede quedar bajo el mínimo y se puede vaciar', async () => {
    const malo = await conEmpresa(agent.put(`/api/productos/${gaseosa.id}`)).send({ stock_minimo: 30, stock_objetivo: 20 });
    expect(malo.status).toBe(400);
    expect(malo.body.error).toMatch(/Reponer hasta/);
    expect((await nuevo({ codigo: 'MIN-X', nombre_producto: 'Neg', stock_minimo: -1 })).status).toBe(400);

    const ok = await conEmpresa(agent.put(`/api/productos/${gaseosa.id}`)).send({ stock_minimo: 30, stock_objetivo: 100 });
    expect(ok.status).toBe(200);
    expect(await deLista(gaseosa.id)).toMatchObject({ estado_stock: 'BAJO', stock_objetivo_efectivo: 100 }); // 20 en stock ≤ 30
    const sinObjetivo = await conEmpresa(agent.put(`/api/productos/${gaseosa.id}`)).send({ stock_objetivo: '' });
    expect(sinObjetivo.status).toBe(200);
    expect((await deLista(gaseosa.id)).stock_objetivo_efectivo).toBe(60); // el doble del mínimo
    // un update que no menciona el mínimo no lo borra
    await conEmpresa(agent.put(`/api/productos/${gaseosa.id}`)).send({ nombre_producto: 'Gaseosa renombrada' });
    expect(Number((await deLista(gaseosa.id)).stock_minimo)).toBe(30);
  });

  it('el mínimo es por empresa y exige el módulo Inventario', async () => {
    const todos = await ctx.empresa.getModulos();
    await ctx.empresa.setModulos(todos.filter((m) => m.nombre_codigo !== 'Inventario' && !['Ventas', 'Compras', 'Pedidos', 'Recetas', 'Informes', 'Caja'].includes(m.nombre_codigo)));
    invalidateAllProfiles();
    expect((await conEmpresa(agent.get('/api/reposicion'))).status).toBe(403);
    await ctx.empresa.setModulos(todos);
    invalidateAllProfiles();
  });
});

// ---------------------------------------------------------------------------
// Cuentas por cobrar (ventas a crédito, abonos, cupo, cartera vencida)
// ---------------------------------------------------------------------------
describe('Cuentas por cobrar', () => {
  const { calcularVencimiento } = require('../../src/services/cartera');
  let cliente; let cajero;
  const dbVenta = (id) => models.Venta.findByPk(id);
  // El servicio vale $100.000: `cantidad` fracciona para obtener otros montos.
  const credito = (monto, extra = {}) => conEmpresa(agent.post('/api/ventas')).send({
    clienteId: cliente.id, forma_pago: '2', ...extra,
    detalles: [{ servicioId: ctx.servicio.id, cantidad: monto / 100000, precio_unitario: 100000, precio_base: 100000 }],
  });
  const abonar = (ventaId, monto, extra = {}) => conEmpresa(agent.post(`/api/cuentas-por-cobrar/${ventaId}/abonos`)).send({ monto, ...extra });
  const cuentas = async (q = '') => (await conEmpresa(agent.get(`/api/cuentas-por-cobrar${q}`))).body;
  const balance = async () => (await conEmpresa(agent.get('/api/caja/balance'))).body;
  const cerrarCajas = () => models.Caja.update(
    { estado: 'CERRADA', fecha_cierre: new Date(), monto_contado: 0, total_egresos: 0 },
    { where: { empresaId: ctx.empresa.id, estado: 'ABIERTA' } }
  );

  beforeAll(async () => {
    await models.Servicio.update({ precio: 100000, porcentaje_iva: 0 }, { where: { id: ctx.servicio.id } });
    await activarModulos([]);
    cliente = await models.Cliente.create({ empresaId: ctx.empresa.id, nombre: 'Cliente de crédito', documento: '777888999' });
    const u = await models.Usuario.create({
      rolId: 3, nombre: 'Cobrador', username: 'cobrador',
      contrasena_hash: await bcrypt.hash('Clave1234', 10), estado: true, must_change_password: false,
    });
    await u.setEmpresas([ctx.empresa.id]);
    cajero = request.agent(app);
    expect((await cajero.post('/api/auth/login').send({ username: 'cobrador', contrasena: 'Clave1234' })).status).toBe(200);
  });
  afterAll(async () => { await cerrarCajas(); await activarModulos([]); });

  it('vender a crédito exige el módulo y un cliente', async () => {
    const todos = await ctx.empresa.getModulos();
    await ctx.empresa.setModulos(todos.filter((m) => m.nombre_codigo !== 'Cuentas por cobrar'));
    invalidateAllProfiles();
    const sinModulo = await credito(100000);
    expect(sinModulo.status).toBe(400);
    expect(sinModulo.body.error).toMatch(/Cuentas por cobrar/);
    await ctx.empresa.setModulos(todos);
    invalidateAllProfiles();

    const sinCliente = await conEmpresa(agent.post('/api/ventas')).send({
      forma_pago: '2', detalles: [{ servicioId: ctx.servicio.id, cantidad: 1, precio_unitario: 100000, precio_base: 100000 }],
    });
    expect(sinCliente.status).toBe(400);
    expect(sinCliente.body.error).toMatch(/necesita un cliente/);
  });

  it('una venta a crédito queda por cobrar con su plazo; una de contado no', async () => {
    const v = await credito(300000, { dias_credito: 15 });
    expect(v.status).toBe(201);
    expect(Number(v.body.saldo_pendiente)).toBe(300000);
    expect(v.body.dias_credito).toBe(15);
    expect(v.body.fecha_vencimiento).toBe(calcularVencimiento(15));

    const porDefecto = await credito(100000);
    expect(porDefecto.body.dias_credito).toBe(30); // plazo por defecto

    const contado = await conEmpresa(agent.post('/api/ventas')).send({
      clienteId: cliente.id, detalles: [{ servicioId: ctx.servicio.id, cantidad: 1, precio_unitario: 100000, precio_base: 100000 }],
    });
    expect(Number(contado.body.saldo_pendiente)).toBe(0);
    expect((await cuentas()).map((c) => c.id)).not.toContain(contado.body.id);
    await abonar(porDefecto.body.id, 100000); // se deja pagada para el resto de pruebas
  });

  it('abonos: parcial, total, mayor al saldo y sobre una venta ya pagada', async () => {
    const v = (await credito(200000)).body;
    const parcial = await abonar(v.id, 50000, { nota: 'Primer abono' });
    expect(parcial.status).toBe(201);
    expect(parcial.body.saldo_pendiente).toBe(150000);
    expect(Number((await dbVenta(v.id)).saldo_pendiente)).toBe(150000);

    const demasiado = await abonar(v.id, 150001);
    expect(demasiado.status).toBe(400);
    expect(demasiado.body.error).toMatch(/supera el saldo/);
    expect((await abonar(v.id, 0)).status).toBe(400);
    expect((await abonar(v.id, 1000, { medio_pago: '99' })).status).toBe(400);

    expect((await abonar(v.id, 150000)).body.saldo_pendiente).toBe(0);
    const yaPagada = await abonar(v.id, 1);
    expect(yaPagada.status).toBe(400);
    expect(yaPagada.body.error).toMatch(/ya está pagada/);
    expect((await abonar(999999, 1)).status).toBe(404);

    expect((await cuentas()).map((c) => c.id)).not.toContain(v.id); // pagada: sale de pendientes
    const pagadas = await cuentas('?estado=PAGADAS');
    expect(pagadas.find((c) => c.id === v.id)).toMatchObject({ saldo_pendiente: 0, abonado: 200000 });
    const historial = (await conEmpresa(agent.get(`/api/cuentas-por-cobrar/${v.id}/abonos`))).body;
    expect(historial.map((a) => Number(a.monto))).toEqual([50000, 150000]);
    expect(historial[0].nota).toBe('Primer abono');
  });

  it('cartera vencida: filtros y envejecimiento por tramos', async () => {
    const ya = (await cuentas()).map((c) => c.id);
    const nuevas = [];
    for (const [monto, dias] of [[100000, 20], [200000, -10], [300000, -45], [400000, -100]]) {
      const v = (await credito(monto)).body;
      await models.Venta.update({ fecha_vencimiento: calcularVencimiento(dias) }, { where: { id: v.id } });
      nuevas.push(v.id);
    }
    const lista = await cuentas();
    const mias = lista.filter((c) => nuevas.includes(c.id));
    expect(mias).toHaveLength(4);
    expect(mias.find((c) => c.id === nuevas[0])).toMatchObject({ vencida: false, dias_mora: -20 });
    expect(mias.find((c) => c.id === nuevas[1])).toMatchObject({ vencida: true, dias_mora: 10 });
    expect(lista[0].dias_mora).toBeGreaterThanOrEqual(lista[lista.length - 1].dias_mora); // las más vencidas arriba

    const vencidas = (await cuentas('?estado=VENCIDAS')).map((c) => c.id);
    expect(vencidas).toEqual(expect.arrayContaining(nuevas.slice(1)));
    expect(vencidas).not.toContain(nuevas[0]);
    expect((await cuentas(`?clienteId=${cliente.id}`)).every((c) => c.cliente.id === cliente.id)).toBe(true);

    const r = (await conEmpresa(agent.get('/api/cuentas-por-cobrar/resumen'))).body;
    expect(r.D1_30).toBeGreaterThanOrEqual(200000);
    expect(r.D31_60).toBeGreaterThanOrEqual(300000);
    expect(r.MAS_90).toBeGreaterThanOrEqual(400000);
    expect(r.vencido).toBeCloseTo(r.D1_30 + r.D31_60 + r.D61_90 + r.MAS_90, 2);
    expect(r.total).toBeCloseTo(r.vencido + r.POR_VENCER, 2);
    expect(r.por_cliente[0]).toMatchObject({ clienteId: cliente.id });
    expect(ya.length).toBeGreaterThanOrEqual(0);

    // se saldan para no contaminar las demás pruebas
    for (const id of nuevas) await abonar(id, Number((await dbVenta(id)).saldo_pendiente));
  });

  it('cupo de crédito: no deja pasarse y se libera al abonar', async () => {
    // Cliente aparte: el de las otras pruebas ya tiene deudas pendientes.
    const c = await models.Cliente.create({ empresaId: ctx.empresa.id, nombre: 'Cliente con cupo', documento: '123123123', cupo_credito: 200000 });
    const primera = await credito(150000, { clienteId: c.id });
    expect(primera.status).toBe(201);
    const segunda = await credito(100000, { clienteId: c.id });
    expect(segunda.status).toBe(400);
    expect(segunda.body.error).toMatch(/Supera el cupo de crédito/);

    expect((await abonar(primera.body.id, 100000)).status).toBe(201); // debe 50.000 → caben 100.000 más
    expect((await credito(100000, { clienteId: c.id })).status).toBe(201);
    const estado = (await conEmpresa(agent.get(`/api/cuentas-por-cobrar/clientes/${c.id}/estado-cuenta`))).body;
    expect(estado.cupo_credito).toBe(200000);
    expect(estado.saldo).toBe(150000);
    expect(estado.cupo_disponible).toBe(50000);

    await models.Cliente.update({ cupo_credito: null }, { where: { id: c.id } }); // sin tope
    expect((await credito(5000000, { clienteId: c.id })).status).toBe(201);
  });

  it('estado de cuenta del cliente: cada venta con sus abonos y totales', async () => {
    const estado = (await conEmpresa(agent.get(`/api/cuentas-por-cobrar/clientes/${cliente.id}/estado-cuenta`))).body;
    expect(estado.cliente).toMatchObject({ id: cliente.id, nombre: 'Cliente de crédito' });
    expect(estado.ventas.length).toBeGreaterThan(3);
    expect(estado.saldo).toBeCloseTo(estado.total_credito - estado.total_abonado, 2);
    const conAbonos = estado.ventas.find((v) => v.abonos.length > 0);
    expect(conAbonos.abonos[0]).toMatchObject({ usuario: 'Front Admin' });
    expect((await conEmpresa(agent.get('/api/cuentas-por-cobrar/clientes/999999/estado-cuenta'))).status).toBe(404);
  });

  it('anular una venta a crédito: con abonos no se puede; sin abonos sale de la cartera', async () => {
    const conAbono = (await credito(100000)).body;
    await abonar(conAbono.id, 10000);
    const bloqueada = await conEmpresa(agent.post(`/api/ventas/${conAbono.id}/anular`)).send({ motivo: 'Error' });
    expect(bloqueada.status).toBe(400);
    expect(bloqueada.body.error).toMatch(/abonos registrados/);

    const abono = (await conEmpresa(agent.get(`/api/cuentas-por-cobrar/${conAbono.id}/abonos`))).body[0];
    expect((await conEmpresa(agent.post(`/api/cuentas-por-cobrar/abonos/${abono.id}/anular`))).status).toBe(200);
    expect(Number((await dbVenta(conAbono.id)).saldo_pendiente)).toBe(100000); // el saldo vuelve a subir
    const ok = await conEmpresa(agent.post(`/api/ventas/${conAbono.id}/anular`)).send({ motivo: 'Error' });
    expect(ok.status).toBe(200);
    expect(Number((await dbVenta(conAbono.id)).saldo_pendiente)).toBe(0);
    expect((await cuentas()).map((c) => c.id)).not.toContain(conAbono.id);
    expect((await abonar(conAbono.id, 1)).status).toBe(400); // venta anulada

    const dosVeces = await conEmpresa(agent.post(`/api/cuentas-por-cobrar/abonos/${abono.id}/anular`));
    expect(dosVeces.status).toBe(400);
    expect(dosVeces.body.error).toMatch(/ya está anulado/);
  });

  it('en el balance, el crédito sin cobrar no es dinero y cada abono sí lo es', async () => {
    // El balance de la empresa vive en el módulo Caja: se habilita y se abre una caja para vender.
    await activarModulos(['Caja']);
    await cerrarCajas();
    await conEmpresa(agent.post('/api/caja/abrir')).send({ monto_inicial: 0 });
    const antes = await balance();
    const v = (await credito(100000)).body;
    const trasVenta = await balance();
    expect(trasVenta.dinero_actual).toBe(antes.dinero_actual); // vender a crédito no mueve el dinero
    expect(trasVenta.cartera.por_cobrar - antes.cartera.por_cobrar).toBe(100000);

    await abonar(v.id, 40000, { medio_pago: '47' }); // transferencia
    const trasAbono = await balance();
    expect(trasAbono.dinero_actual - antes.dinero_actual).toBe(40000);
    expect(trasAbono.acumulado.abonos - antes.acumulado.abonos).toBe(40000);
    expect(trasAbono.cartera.por_cobrar - antes.cartera.por_cobrar).toBe(60000);
    await abonar(v.id, 60000);
    await cerrarCajas();
    await activarModulos([]);
  });

  describe('con módulo Caja', () => {
    beforeAll(async () => { await activarModulos(['Caja']); await cerrarCajas(); });
    afterAll(async () => { await cerrarCajas(); await activarModulos([]); });
    const actual = async () => (await conEmpresa(agent.get('/api/caja/actual'))).body;

    it('un abono en efectivo exige caja abierta y suma al efectivo esperado; por transferencia no', async () => {
      const abrir = await conEmpresa(agent.post('/api/caja/abrir')).send({ monto_inicial: 50000 });
      expect(abrir.status).toBe(201);
      const v = (await credito(300000)).body;
      expect((await actual()).resumen.efectivo_esperado).toBe(50000); // la venta a crédito no entra a la caja

      const efectivo = await abonar(v.id, 100000, { medio_pago: '10' });
      expect(efectivo.status).toBe(201);
      expect(efectivo.body.abono.cajaId).toBe(abrir.body.id);
      const c = await actual();
      expect(c.resumen.abonos_efectivo).toBe(100000);
      expect(c.resumen.efectivo_esperado).toBe(150000);

      const transf = await abonar(v.id, 50000, { medio_pago: '47' });
      expect(transf.body.abono.cajaId).toBeNull();
      expect((await actual()).resumen.efectivo_esperado).toBe(150000); // no es efectivo

      // Anular el abono en efectivo (caja abierta): el efectivo vuelve a bajar.
      const anular = await conEmpresa(agent.post(`/api/cuentas-por-cobrar/abonos/${efectivo.body.abono.id}/anular`));
      expect(anular.status).toBe(200);
      expect((await actual()).resumen.efectivo_esperado).toBe(50000);
      expect(Number((await dbVenta(v.id)).saldo_pendiente)).toBe(250000);
    });

    it('al cerrar la caja el abono en efectivo queda en la foto del turno y ya no se puede anular', async () => {
      const v = (await credito(100000)).body;
      const ab = await abonar(v.id, 30000);
      const caja = await actual();
      const cierre = await conEmpresa(agent.post(`/api/caja/${caja.id}/cerrar`)).send({ monto_contado: 80000 });
      expect(cierre.status).toBe(200);
      expect(Number(cierre.body.abonos_efectivo)).toBe(30000);
      expect(Number(cierre.body.efectivo_esperado)).toBe(80000); // 50.000 de base + 30.000 abonados
      expect(cierre.body.resumen.abonos_efectivo).toBe(30000);
      const detalle = (await conEmpresa(agent.get(`/api/caja/${caja.id}`))).body;
      expect(detalle.abonos.map((a) => Number(a.monto))).toEqual([30000]);

      const tarde = await conEmpresa(agent.post(`/api/cuentas-por-cobrar/abonos/${ab.body.abono.id}/anular`));
      expect(tarde.status).toBe(400);
      expect(tarde.body.error).toMatch(/caja que ya fue cerrada/);

      const sinCaja = await abonar(v.id, 10000, { medio_pago: '10' });
      expect(sinCaja.status).toBe(400);
      expect(sinCaja.body.error).toMatch(/caja abierta/);
      expect((await abonar(v.id, 10000, { medio_pago: '48' })).status).toBe(201); // tarjeta: no necesita caja
    });
  });

  it('el cajero puede cobrar y ver la cartera, pero no anular abonos', async () => {
    const v = (await credito(100000)).body;
    const res = await withEmpresa(cajero.post(`/api/cuentas-por-cobrar/${v.id}/abonos`)).send({ monto: 20000, medio_pago: '47' });
    expect(res.status).toBe(201);
    expect((await withEmpresa(cajero.get('/api/cuentas-por-cobrar'))).status).toBe(200);
    expect((await withEmpresa(cajero.post(`/api/cuentas-por-cobrar/abonos/${res.body.abono.id}/anular`))).status).toBe(403);
  });

  it('exige el módulo Cuentas por cobrar', async () => {
    const todos = await ctx.empresa.getModulos();
    await ctx.empresa.setModulos(todos.filter((m) => m.nombre_codigo !== 'Cuentas por cobrar'));
    invalidateAllProfiles();
    expect((await conEmpresa(agent.get('/api/cuentas-por-cobrar'))).status).toBe(403);
    await ctx.empresa.setModulos(todos);
    invalidateAllProfiles();
  });

  it('el dashboard informa lo que deben los clientes y la auditoría lo cuenta', async () => {
    const dash = (await conEmpresa(agent.get('/api/reportes/dashboard'))).body;
    expect(dash.cartera.por_cobrar).toBeGreaterThan(0);
    expect(dash.cartera.vencido_cobrar).toBeGreaterThanOrEqual(0);

    let fila;
    for (let i = 0; i < 40 && !fila; i += 1) {
      const a = (await conEmpresa(agent.get('/api/auditoria?modulo=Cuentas por cobrar&limit=200'))).body;
      fila = a.find((x) => x.accion === 'Recibió un abono de un cliente' && x.descripcion.includes('Cliente de crédito'));
      if (!fila) await new Promise((r) => setTimeout(r, 50));
    }
    expect(fila).toBeTruthy();
    expect(fila.descripcion).toMatch(/a la venta #\d+/);
  });
});

// ---------------------------------------------------------------------------
// Cuentas por pagar (compras a crédito, pagos a proveedores)
// ---------------------------------------------------------------------------
describe('Cuentas por pagar', () => {
  const { calcularVencimiento } = require('../../src/services/cartera');
  let prod2; let proveedor2; let operario;
  const stockDe = async (id) => Number((await models.Producto.findByPk(id)).stock_actual);
  const dbCompra = (id) => models.Compra.findByPk(id);
  const comprar = (monto, extra = {}) => conEmpresa(agent.post('/api/compras')).send({
    proveedorId: proveedor2.id, ...extra,
    detalles: [{ productoId: prod2.id, cantidad: 10, costo_unitario: monto / 10 }],
  });
  const pagar = (compraId, monto, extra = {}) => conEmpresa(agent.post(`/api/cuentas-por-pagar/${compraId}/pagos`)).send({ monto, ...extra });
  const deudas = async (q = '') => (await conEmpresa(agent.get(`/api/cuentas-por-pagar${q}`))).body;
  const balance = async () => (await conEmpresa(agent.get('/api/caja/balance'))).body;
  const cerrarCajas = () => models.Caja.update(
    { estado: 'CERRADA', fecha_cierre: new Date(), monto_contado: 0, total_egresos: 0 },
    { where: { empresaId: ctx.empresa.id, estado: 'ABIERTA' } }
  );

  beforeAll(async () => {
    await activarModulos(['Caja']); // el balance de la empresa vive en el módulo Caja
    prod2 = await models.Producto.create({ empresaId: ctx.empresa.id, codigo: 'CXP-1', nombre_producto: 'Producto a crédito', precio_unitario: 1000, stock_actual: 0 });
    proveedor2 = await models.Proveedor.create({ empresaId: ctx.empresa.id, nombre: 'Proveedor de crédito', nit: '811222333' });
    const u = await models.Usuario.create({
      rolId: 3, nombre: 'Operario CxP', username: 'operario_cxp',
      contrasena_hash: await bcrypt.hash('Clave1234', 10), estado: true, must_change_password: false,
    });
    await u.setEmpresas([ctx.empresa.id]);
    operario = request.agent(app);
    expect((await operario.post('/api/auth/login').send({ username: 'operario_cxp', contrasena: 'Clave1234' })).status).toBe(200);
  });
  afterAll(async () => { await cerrarCajas(); await activarModulos([]); });

  it('comprar a crédito exige el módulo y no se combina con pagar de la caja', async () => {
    const todos = await ctx.empresa.getModulos();
    await ctx.empresa.setModulos(todos.filter((m) => m.nombre_codigo !== 'Cuentas por pagar'));
    invalidateAllProfiles();
    const sinModulo = await comprar(100000, { forma_pago: 'CREDITO' });
    expect(sinModulo.status).toBe(400);
    expect(sinModulo.body.error).toMatch(/Cuentas por pagar/);
    await ctx.empresa.setModulos(todos);
    invalidateAllProfiles();

    const conCaja = await comprar(100000, { forma_pago: 'CREDITO', pago_desde_caja: true });
    expect(conCaja.status).toBe(400);
    expect(conCaja.body.error).toMatch(/no se paga de la caja/);
    expect(await stockDe(prod2.id)).toBe(0); // nada se registró
  });

  it('una compra a crédito suma stock pero NO saca dinero; una de contado sí', async () => {
    const antes = await balance();
    const c = await comprar(500000, { forma_pago: 'CREDITO', dias_credito: 20 });
    expect(c.status).toBe(201);
    expect(c.body.forma_pago).toBe('CREDITO');
    expect(Number(c.body.saldo_pendiente)).toBe(500000);
    expect(c.body.fecha_vencimiento).toBe(calcularVencimiento(20));
    expect(await stockDe(prod2.id)).toBe(10);

    const trasCredito = await balance();
    expect(trasCredito.dinero_actual).toBe(antes.dinero_actual); // la deuda no es dinero que salió
    expect(trasCredito.cartera.por_pagar - antes.cartera.por_pagar).toBe(500000);

    const contado = await comprar(50000);
    expect(contado.body.forma_pago).toBe('CONTADO');
    expect(Number(contado.body.saldo_pendiente)).toBe(0);
    expect((await balance()).dinero_actual).toBe(antes.dinero_actual - 50000);
    await pagar(c.body.id, 500000); // queda pagada
  });

  it('pagos: parcial, total, mayor a la deuda y sobre una compra ya pagada', async () => {
    const c = (await comprar(300000, { forma_pago: 'CREDITO' })).body;
    expect(c.dias_credito).toBe(30);
    const antes = await balance();
    const parcial = await pagar(c.id, 100000, { origen: 'OTRO', nota: 'Transferencia' });
    expect(parcial.status).toBe(201);
    expect(parcial.body.saldo_pendiente).toBe(200000);
    // pagar al proveedor sí saca dinero
    const despues = await balance();
    expect(antes.dinero_actual - despues.dinero_actual).toBe(100000);
    expect(despues.acumulado.pagos_proveedores - antes.acumulado.pagos_proveedores).toBe(100000);
    expect(despues.cartera.por_pagar - antes.cartera.por_pagar).toBe(-100000);

    const demasiado = await pagar(c.id, 200001);
    expect(demasiado.status).toBe(400);
    expect(demasiado.body.error).toMatch(/supera lo que se debe/);
    expect((await pagar(c.id, 0)).status).toBe(400);
    expect((await pagar(c.id, 200000)).body.saldo_pendiente).toBe(0);
    expect((await pagar(c.id, 1)).body.error).toMatch(/ya está pagada/);
    expect((await pagar(999999, 1)).status).toBe(404);

    const pagadas = await deudas('?estado=PAGADAS');
    expect(pagadas.find((d) => d.id === c.id)).toMatchObject({ saldo_pendiente: 0, pagado: 300000 });
    const historial = (await conEmpresa(agent.get(`/api/cuentas-por-pagar/${c.id}/pagos`))).body;
    expect(historial.map((p) => Number(p.monto))).toEqual([100000, 200000]);
  });

  it('deudas vencidas, envejecimiento y estado de cuenta del proveedor', async () => {
    const ids = [];
    for (const [monto, dias] of [[100000, 20], [200000, -15], [300000, -70]]) {
      const c = (await comprar(monto, { forma_pago: 'CREDITO' })).body;
      await models.Compra.update({ fecha_vencimiento: calcularVencimiento(dias) }, { where: { id: c.id } });
      ids.push(c.id);
    }
    const vencidas = (await deudas('?estado=VENCIDAS')).map((d) => d.id);
    expect(vencidas).toEqual(expect.arrayContaining(ids.slice(1)));
    expect(vencidas).not.toContain(ids[0]);
    expect((await deudas(`?proveedorId=${proveedor2.id}`)).every((d) => d.proveedor.id === proveedor2.id)).toBe(true);

    const r = (await conEmpresa(agent.get('/api/cuentas-por-pagar/resumen'))).body;
    expect(r.D1_30).toBeGreaterThanOrEqual(200000);
    expect(r.D61_90).toBeGreaterThanOrEqual(300000);
    expect(r.por_proveedor[0]).toMatchObject({ proveedorId: proveedor2.id });

    const estado = (await conEmpresa(agent.get(`/api/cuentas-por-pagar/proveedores/${proveedor2.id}/estado-cuenta`))).body;
    expect(estado.proveedor.nombre).toBe('Proveedor de crédito');
    expect(estado.saldo).toBeCloseTo(estado.total_credito - estado.total_pagado, 2);
    expect(estado.vencido).toBeGreaterThanOrEqual(500000);
    expect((await conEmpresa(agent.get('/api/cuentas-por-pagar/proveedores/999999/estado-cuenta'))).status).toBe(404);
    for (const id of ids) await pagar(id, Number((await dbCompra(id)).saldo_pendiente));
  });

  describe('pagando desde la caja', () => {
    beforeAll(async () => { await cerrarCajas(); });
    afterAll(async () => { await cerrarCajas(); });
    const actual = async () => (await conEmpresa(agent.get('/api/caja/actual'))).body;

    it('pagar de la caja exige caja abierta y efectivo suficiente, y resta del efectivo esperado', async () => {
      const c = (await comprar(300000, { forma_pago: 'CREDITO' })).body;
      const sinCaja = await pagar(c.id, 100000, { origen: 'CAJA' });
      expect(sinCaja.status).toBe(400);
      expect(sinCaja.body.error).toMatch(/caja abierta/);

      await conEmpresa(agent.post('/api/caja/abrir')).send({ monto_inicial: 150000 });
      const poco = await pagar(c.id, 200000, { origen: 'CAJA' });
      expect(poco.status).toBe(400);
      expect(poco.body.error).toMatch(/no alcanza/);
      expect(Number((await dbCompra(c.id)).saldo_pendiente)).toBe(300000); // sin registros a medias

      const ok = await pagar(c.id, 100000, { origen: 'CAJA' });
      expect(ok.status).toBe(201);
      const caja = await actual();
      expect(caja.resumen.efectivo_esperado).toBe(50000);
      expect(caja.movimientos.map((m) => m.tipo)).toEqual(['PAGO_PROV']);

      // Anular el pago (caja abierta): el efectivo vuelve y la deuda sube.
      const anular = await conEmpresa(agent.post(`/api/cuentas-por-pagar/pagos/${ok.body.pago.id}/anular`));
      expect(anular.status).toBe(200);
      expect((await actual()).resumen.efectivo_esperado).toBe(150000);
      expect(Number((await dbCompra(c.id)).saldo_pendiente)).toBe(300000);
      expect((await conEmpresa(agent.post(`/api/cuentas-por-pagar/pagos/${ok.body.pago.id}/anular`))).status).toBe(400); // ya anulado

      // Pago de la caja y cierre: el pago ya no se puede anular.
      const otro = await pagar(c.id, 50000, { origen: 'CAJA' });
      await conEmpresa(agent.post(`/api/caja/${(await actual()).id}/cerrar`)).send({ monto_contado: 100000 });
      const tarde = await conEmpresa(agent.post(`/api/cuentas-por-pagar/pagos/${otro.body.pago.id}/anular`));
      expect(tarde.status).toBe(400);
      expect(tarde.body.error).toMatch(/caja que ya fue cerrada/);
      await pagar(c.id, 250000); // se salda por otro medio
    });
  });

  it('pagar de la caja sin el módulo Caja se rechaza', async () => {
    const c = (await comprar(100000, { forma_pago: 'CREDITO' })).body;
    await activarModulos([]);
    const res = await pagar(c.id, 10000, { origen: 'CAJA' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/módulo "Caja"/);
    await activarModulos(['Caja']);
    await pagar(c.id, 100000);
  });

  it('la recepción de un pedido también puede quedar a crédito', async () => {
    const ped = await conEmpresa(agent.post('/api/pedidos')).send({
      proveedorId: proveedor2.id, detalles: [{ productoId: prod2.id, cantidad_pedida: 5, costo_estimado: 1000 }],
    });
    const mala = await conEmpresa(agent.post(`/api/pedidos/${ped.body.id}/checkin`)).send({
      forma_pago: 'CREDITO', pago_desde_caja: true, detalles_recibidos: [{ productoId: prod2.id, cantidad: 5, costo_unitario: 1000 }],
    });
    expect(mala.status).toBe(400);

    const rec = await conEmpresa(agent.post(`/api/pedidos/${ped.body.id}/checkin`)).send({
      forma_pago: 'CREDITO', dias_credito: 45, detalles_recibidos: [{ productoId: prod2.id, cantidad: 5, costo_unitario: 1000 }],
    });
    expect(rec.status).toBe(200);
    const compra = await dbCompra(rec.body.compraId);
    expect(compra.forma_pago).toBe('CREDITO');
    expect(Number(compra.saldo_pendiente)).toBe(5000);
    expect(compra.fecha_vencimiento).toBe(calcularVencimiento(45));
    await pagar(compra.id, 5000);
  });

  it('solo el administrador ve y paga las deudas con proveedores', async () => {
    const c = (await comprar(100000, { forma_pago: 'CREDITO' })).body;
    // cualquiera puede REGISTRAR una compra a crédito (si tiene Compras), pero no gestionar la deuda
    expect((await withEmpresa(operario.get('/api/cuentas-por-pagar'))).status).toBe(403);
    expect((await withEmpresa(operario.post(`/api/cuentas-por-pagar/${c.id}/pagos`)).send({ monto: 1000 })).status).toBe(403);
    const compraOperario = await withEmpresa(operario.post('/api/compras')).send({
      proveedorId: proveedor2.id, forma_pago: 'CREDITO', detalles: [{ productoId: prod2.id, cantidad: 1, costo_unitario: 1000 }],
    });
    expect(compraOperario.status).toBe(201);
    await pagar(c.id, 100000);
    await pagar(compraOperario.body.id, 1000);
  });

  it('el dashboard informa lo que se debe y la auditoría cuenta los pagos', async () => {
    const c = (await comprar(100000, { forma_pago: 'CREDITO' })).body;
    const dash = (await conEmpresa(agent.get('/api/reportes/dashboard'))).body;
    expect(dash.cartera.por_pagar).toBeGreaterThanOrEqual(100000);
    await pagar(c.id, 100000);

    let fila;
    for (let i = 0; i < 40 && !fila; i += 1) {
      const a = (await conEmpresa(agent.get('/api/auditoria?modulo=Cuentas por pagar&limit=200'))).body;
      fila = a.find((x) => x.accion === 'Pagó a un proveedor' && x.descripcion.includes('Proveedor de crédito'));
      if (!fila) await new Promise((r) => setTimeout(r, 50));
    }
    expect(fila).toBeTruthy();
    expect(fila.descripcion).toMatch(/por la compra #\d+/);
  });
});

// ---------------------------------------------------------------------------
// Devolución parcial de ventas
// ---------------------------------------------------------------------------
describe('Devolución parcial de ventas', () => {
  let producto; let harina; let plato; let cajero;
  const stockDe = async (id) => Number((await models.Producto.findByPk(id)).stock_actual);
  const dbVenta = (id) => models.Venta.findByPk(id);
  const detallesDe = (ventaId) => models.VentaDetalle.findAll({ where: { ventaId }, order: [['id', 'ASC']] });
  const vender = (detalles, extra = {}) => conEmpresa(agent.post('/api/ventas')).send({ clienteId: ctx.cliente.id, detalles, ...extra });
  const linea = (productoId, cantidad, precio = 1000) => ({ productoId, cantidad, precio_unitario: precio, precio_base: precio });
  const servicio = (cantidad, precio = 100000) => ({ servicioId: ctx.servicio.id, cantidad, precio_unitario: precio, precio_base: precio });
  const devolver = (ventaId, items, extra = {}) => conEmpresa(agent.post(`/api/ventas/${ventaId}/devoluciones`)).send({ motivo: 'Producto defectuoso', items, ...extra });
  const balance = async () => (await conEmpresa(agent.get('/api/caja/balance'))).body;
  const cerrarCajas = () => models.Caja.update(
    { estado: 'CERRADA', fecha_cierre: new Date(), monto_contado: 0, total_egresos: 0 },
    { where: { empresaId: ctx.empresa.id, estado: 'ABIERTA' } }
  );

  beforeAll(async () => {
    await activarModulos(['Recetas']);
    await models.Servicio.update({ precio: 100000, porcentaje_iva: 0 }, { where: { id: ctx.servicio.id } });
    const nuevo = (body) => conEmpresa(agent.post('/api/productos')).send({ precio_unitario: 1000, porcentaje_iva: 0, ...body });
    producto = (await nuevo({ codigo: 'DEV-P', nombre_producto: 'Producto devolvible', stock_actual: 100 })).body;
    harina = (await nuevo({ codigo: 'DEV-H', nombre_producto: 'Harina devolvible', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 10000, costo_promedio: 3 })).body;
    plato = (await nuevo({
      codigo: 'DEV-PL', nombre_producto: 'Plato devolvible', tipo: 'RECETA', precio_unitario: 5000, receta: [{ insumoId: harina.id, cantidad: 100 }],
    })).body;
    const u = await models.Usuario.create({
      rolId: 3, nombre: 'Cajero Devuelve', username: 'cajero_dev',
      contrasena_hash: await bcrypt.hash('Clave1234', 10), estado: true, must_change_password: false,
    });
    await u.setEmpresas([ctx.empresa.id]);
    cajero = request.agent(app);
    expect((await cajero.post('/api/auth/login').send({ username: 'cajero_dev', contrasena: 'Clave1234' })).status).toBe(200);
  });
  afterAll(async () => { await cerrarCajas(); await activarModulos([]); });

  it('devuelve parte de una línea: baja lo devuelto, vuelve el stock si se reingresa y la venta no cambia', async () => {
    const venta = await vender([linea(producto.id, 5)]);
    expect(await stockDe(producto.id)).toBe(95);
    const [det] = await detallesDe(venta.body.id);

    const res = await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 2, reingresar: true }]);
    expect(res.status).toBe(201);
    expect(Number(res.body.devolucion.total)).toBe(2000);
    expect(Number(res.body.devolucion.dinero_devuelto)).toBe(2000);
    expect(res.body.devolucion.reembolso).toBe('OTRO'); // sin módulo Caja el dinero no sale de una caja
    expect(res.body.venta).toMatchObject({ total: 5000, total_devuelto: 2000 });
    expect(await stockDe(producto.id)).toBe(97);

    const v = await dbVenta(venta.body.id);
    expect(Number(v.total)).toBe(5000); // la venta original queda intacta
    expect(v.estado).toBe('ACTIVA');
    const [d2] = await detallesDe(venta.body.id);
    expect(Number(d2.cantidad_devuelta)).toBe(2);
    expect(Number(d2.cantidad_reingresada)).toBe(2);

    const lista = (await conEmpresa(agent.get(`/api/ventas/${venta.body.id}/devoluciones`))).body;
    expect(lista).toHaveLength(1);
    expect(lista[0].detalles[0].linea.Producto.nombre_producto).toBe('Producto devolvible');
    expect(lista[0].usuario.nombre).toBe('Front Admin');
    const detalle = (await conEmpresa(agent.get(`/api/ventas/${venta.body.id}`))).body;
    expect(detalle.devoluciones).toHaveLength(1);
    expect(Number(detalle.total_devuelto)).toBe(2000);
  });

  it('sin reingresar, el inventario no se toca (producto dañado)', async () => {
    const venta = await vender([linea(producto.id, 3)]);
    const antes = await stockDe(producto.id);
    const [det] = await detallesDe(venta.body.id);
    const res = await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 1 }]);
    expect(res.status).toBe(201);
    expect(await stockDe(producto.id)).toBe(antes);
    expect(Number((await detallesDe(venta.body.id))[0].cantidad_reingresada)).toBe(0);
  });

  it('un plato reingresado devuelve sus ingredientes en proporción; sin reingresar no', async () => {
    const venta = await vender([linea(plato.id, 3, 5000)]);
    expect(await stockDe(harina.id)).toBe(9700); // 10.000 − 3×100
    const [det] = await detallesDe(venta.body.id);

    await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 1 }]); // se desecha: no vuelve
    expect(await stockDe(harina.id)).toBe(9700);
    await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 1, reingresar: true }]); // se reutiliza
    expect(await stockDe(harina.id)).toBe(9800);
    expect(Number((await detallesDe(venta.body.id))[0].cantidad_reingresada)).toBe(1);
  });

  it('valida cantidades, líneas, motivo y venta anulada', async () => {
    const venta = await vender([linea(producto.id, 2)]);
    const otra = await vender([linea(producto.id, 1)]);
    const [det] = await detallesDe(venta.body.id);
    const [detOtra] = await detallesDe(otra.body.id);

    const mucho = await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 3 }]);
    expect(mucho.status).toBe(400);
    expect(mucho.body.error).toMatch(/Solo se pueden devolver 2/);
    await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 1.5 }]);
    const yaDevuelto = await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 1 }]);
    expect(yaDevuelto.body.error).toMatch(/Solo se pueden devolver 0\.5/);

    expect((await devolver(venta.body.id, [{ ventaDetalleId: detOtra.id, cantidad: 1 }])).status).toBe(400); // línea de otra venta
    expect((await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 0.1 }, { ventaDetalleId: det.id, cantidad: 0.1 }])).body.error).toMatch(/repetidas/);
    expect((await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 0 }])).status).toBe(400);
    expect((await devolver(venta.body.id, [])).status).toBe(400);
    expect((await conEmpresa(agent.post(`/api/ventas/${venta.body.id}/devoluciones`)).send({ items: [{ ventaDetalleId: det.id, cantidad: 0.1 }] })).status).toBe(400); // sin motivo
    expect((await devolver(999999, [{ ventaDetalleId: det.id, cantidad: 0.1 }])).status).toBe(404);

    await conEmpresa(agent.post(`/api/ventas/${otra.body.id}/anular`)).send({ motivo: 'Error' });
    const anulada = await devolver(otra.body.id, [{ ventaDetalleId: detOtra.id, cantidad: 1 }]);
    expect(anulada.status).toBe(400);
    expect(anulada.body.error).toMatch(/anulada/);
  });

  it('el descuento global se prorratea y devolver todo por partes suma exactamente el total de la venta', async () => {
    const caro = await models.Producto.create({ empresaId: ctx.empresa.id, codigo: 'DEV-C', nombre_producto: 'Producto de $3.333', precio_unitario: 3333, porcentaje_iva: 0, stock_actual: 50 });
    const venta = await vender([linea(caro.id, 3, 3333)], { descuento_global: 10 });
    const total = Number(venta.body.total);
    expect(total).toBeCloseTo(8999.1, 2); // 3 × 3.333 − 10 %
    const [det] = await detallesDe(venta.body.id);

    const una = await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 1 }]);
    expect(Number(una.body.devolucion.total)).toBe(2999.7); // 3.333 − 10 %
    await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 1 }]);
    const ultima = await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 1 }]);
    expect(ultima.status).toBe(201);
    expect(Number((await dbVenta(venta.body.id)).total_devuelto)).toBe(total); // sin centavos de diferencia
    const sobrante = await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 0.001 }]);
    expect(sobrante.status).toBe(400);
  });

  it('una venta con devoluciones no se puede anular completa', async () => {
    const venta = await vender([linea(producto.id, 2)]);
    const [det] = await detallesDe(venta.body.id);
    await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 1, reingresar: true }]);
    const anular = await conEmpresa(agent.post(`/api/ventas/${venta.body.id}/anular`)).send({ motivo: 'Error' });
    expect(anular.status).toBe(400);
    expect(anular.body.error).toMatch(/tiene devoluciones/);
  });

  it('dashboard, informes y rentabilidad cuentan lo vendido NETO de devoluciones', async () => {
    const dash = async () => Number((await conEmpresa(agent.get('/api/reportes/dashboard'))).body.ventasMes);
    const rent = async () => (await conEmpresa(agent.get('/api/recetas/rentabilidad'))).body.filas.find((f) => f.productoId === plato.id) || { unidades: 0, ingresos: 0, costo: 0 };
    const antesDash = await dash();
    const antesRent = await rent();

    const venta = await vender([linea(plato.id, 3, 5000)]); // ingresos 15.000; costo 3 × 300
    const [det] = await detallesDe(venta.body.id);
    await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 1 }]); // 5.000 devueltos y el plato se desecha
    expect(await dash()).toBeCloseTo(antesDash + 15000 - 5000, 2);

    let r = await rent();
    expect(r.unidades - antesRent.unidades).toBe(2);
    expect(r.ingresos - antesRent.ingresos).toBe(10000);
    expect(r.costo - antesRent.costo).toBe(900); // el plato desechado sigue siendo costo

    await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 1, reingresar: true }]); // este vuelve a la cocina
    r = await rent();
    expect(r.unidades - antesRent.unidades).toBe(1);
    expect(r.costo - antesRent.costo).toBe(600); // 3 − 1 reingresado = 2 platos de costo

    const hoy = fechaLocal();
    const top = (await conEmpresa(agent.get('/api/informes')).query({ tipo: 'top_productos', start: hoy, end: hoy })).body;
    expect(Number(top.find((p) => p.productoId === plato.id).total_vendido)).toBeGreaterThanOrEqual(1);
    const clientes = (await conEmpresa(agent.get('/api/informes')).query({ tipo: 'top_clientes', start: hoy, end: hoy })).body;
    expect(Number(clientes[0].dinero_gastado)).toBeGreaterThan(0);
  });

  it('el cajero puede ver las devoluciones pero no registrarlas (por ahora: solo administrador)', async () => {
    const venta = await vender([linea(producto.id, 2)]);
    const [det] = await detallesDe(venta.body.id);
    const res = await withEmpresa(cajero.post(`/api/ventas/${venta.body.id}/devoluciones`)).send({ motivo: 'x1', items: [{ ventaDetalleId: det.id, cantidad: 1 }] });
    expect(res.status).toBe(403);
    expect((await withEmpresa(cajero.get(`/api/ventas/${venta.body.id}/devoluciones`))).status).toBe(200);
  });

  describe('venta a crédito', () => {
    const credito = (cantidad) => vender([servicio(cantidad)], { forma_pago: '2' });
    const abonar = (id, monto, medio = '47') => conEmpresa(agent.post(`/api/cuentas-por-cobrar/${id}/abonos`)).send({ monto, medio_pago: medio });

    it('primero baja lo que el cliente debe; lo que sobra (ya pagado) vuelve en dinero', async () => {
      const venta = (await credito(3)).body; // 300.000
      await abonar(venta.id, 100000); // debe 200.000
      const [det] = await detallesDe(venta.id);

      const una = await devolver(venta.id, [{ ventaDetalleId: det.id, cantidad: 1 }]); // 100.000
      expect(Number(una.body.devolucion.credito_reducido)).toBe(100000);
      expect(Number(una.body.devolucion.dinero_devuelto)).toBe(0);
      expect(una.body.devolucion.reembolso).toBeNull();
      expect(una.body.venta.saldo_pendiente).toBe(100000);

      const dos = await devolver(venta.id, [{ ventaDetalleId: det.id, cantidad: 2 }]); // 200.000: 100.000 de deuda + 100.000 ya pagados
      expect(Number(dos.body.devolucion.credito_reducido)).toBe(100000);
      expect(Number(dos.body.devolucion.dinero_devuelto)).toBe(100000);
      expect(dos.body.devolucion.reembolso).toBe('OTRO'); // el abono fue por transferencia
      expect(dos.body.venta).toMatchObject({ saldo_pendiente: 0, total_devuelto: 300000 });
      const cartera = (await conEmpresa(agent.get('/api/cuentas-por-cobrar?estado=PAGADAS'))).body;
      expect(cartera.find((c) => c.id === venta.id)).toBeTruthy(); // ya no se debe nada
    });
  });

  describe('con módulo Caja', () => {
    const actual = async () => (await conEmpresa(agent.get('/api/caja/actual'))).body;
    beforeAll(async () => { await activarModulos(['Recetas', 'Caja']); await cerrarCajas(); });
    afterAll(async () => { await cerrarCajas(); await activarModulos(['Recetas']); });

    it('devuelve efectivo de la caja abierta: egreso DEVOLUCION y baja el dinero de la empresa', async () => {
      await conEmpresa(agent.post('/api/caja/abrir')).send({ monto_inicial: 50000 });
      const venta = await vender([servicio(1)], { medio_pago: '10' }); // 100.000 en efectivo
      expect((await actual()).resumen.efectivo_esperado).toBe(150000);
      const [det] = await detallesDe(venta.body.id);
      const b0 = await balance();

      const res = await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 0.4 }]); // 40.000
      expect(res.status).toBe(201);
      expect(res.body.devolucion.reembolso).toBe('CAJA'); // por defecto: se cobró en efectivo
      const c = await actual();
      expect(c.resumen.efectivo_esperado).toBe(110000);
      expect(c.movimientos.map((m) => m.tipo)).toEqual(['DEVOLUCION']);
      const mov = await models.CajaMovimiento.findOne({ where: { cajaId: c.id } });
      expect(mov.devolucionId).toBe(res.body.devolucion.id);

      const b1 = await balance();
      expect(b1.dinero_actual - b0.dinero_actual).toBe(-40000);
      expect(b1.acumulado.devoluciones - b0.acumulado.devoluciones).toBe(40000);
      expect(b1.acumulado.retiros).toBe(b0.acumulado.retiros); // no se cuenta además como retiro

      // Por otro medio (tarjeta): el dinero baja, pero la caja no se toca.
      const otro = await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 0.1 }], { reembolso: 'OTRO' });
      expect(otro.body.devolucion.reembolso).toBe('OTRO');
      expect((await actual()).resumen.efectivo_esperado).toBe(110000);
      await cerrarCajas();
    });

    it('sin caja abierta no se puede devolver efectivo y no queda nada a medias', async () => {
      await conEmpresa(agent.post('/api/caja/abrir')).send({ monto_inicial: 0 });
      const venta = await vender([linea(producto.id, 2)], { medio_pago: '10' });
      await cerrarCajas(); // el turno de la venta ya cerró y nadie tiene caja abierta
      const [det] = await detallesDe(venta.body.id);
      const stock = await stockDe(producto.id);

      const res = await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 1, reingresar: true }]);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/caja abierta/);
      expect(await stockDe(producto.id)).toBe(stock); // se deshizo todo, también el inventario
      expect(Number((await detallesDe(venta.body.id))[0].cantidad_devuelta)).toBe(0);
      expect(Number((await dbVenta(venta.body.id)).total_devuelto)).toBe(0);

      // Pero sí se puede devolver por otro medio (la venta ya no está en una caja abierta).
      expect((await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 1 }], { reembolso: 'OTRO' })).status).toBe(201);
    });

    it('no puede sacar más efectivo del que hay en la caja', async () => {
      await conEmpresa(agent.post('/api/caja/abrir')).send({ monto_inicial: 0 });
      const venta = await vender([servicio(2)], { forma_pago: '1', medio_pago: '10' }); // 200.000
      await models.CajaMovimiento.create({ empresaId: ctx.empresa.id, cajaId: (await actual()).id, usuarioId: ctx.usuario.id, tipo: 'RETIRO', concepto: 'Saca casi todo', monto: 190000, fecha: new Date() });
      const [det] = await detallesDe(venta.body.id);
      const res = await devolver(venta.body.id, [{ ventaDetalleId: det.id, cantidad: 1 }]); // 100.000 > 10.000 en caja
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no alcanza/);
      await cerrarCajas();
    });
  });

  it('queda en la auditoría gerencial', async () => {
    let fila;
    for (let i = 0; i < 40 && !fila; i += 1) {
      const a = (await conEmpresa(agent.get('/api/auditoria?modulo=Ventas&limit=200'))).body;
      fila = a.find((x) => x.accion === 'Registró una devolución' && x.descripcion.includes('Producto defectuoso'));
      if (!fila) await new Promise((r) => setTimeout(r, 50));
    }
    expect(fila).toBeTruthy();
    expect(fila.descripcion).toMatch(/de la venta #\d+/);
    expect(fila.usuario.nombre).toBe('Front Admin');
  });
});
