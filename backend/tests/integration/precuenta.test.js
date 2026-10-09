'use strict';

const request = require('supertest');
const { resetDb, seedBase, activarModulos: activar, loginNuevoUsuario } = require('./helpers');
const { invalidateAllProfiles } = require('../../src/middlewares/auth');

let app; let models; let ctx; let agent; let mesero; let jugo; let mesa;
const conEmpresa = (r) => r.set('X-Empresa-Id', String(ctx.empresa.id));
const activarModulos = (extra = []) => activar(models, ctx.empresa, invalidateAllProfiles, extra);
const get = (url, quien = agent) => conEmpresa(quien.get(url));
const post = (url, body = {}, quien = agent) => conEmpresa(quien.post(url)).send(body);
const put = (url, body = {}, quien = agent) => conEmpresa(quien.put(url)).send(body);
const patch = (url, body = {}, quien = agent) => conEmpresa(quien.patch(url)).send(body);
const opciones = (valores) => put('/api/opciones', { valores });

beforeAll(async () => {
  await resetDb();
  app = require('../../src/app');
  models = require('../../src/models');
  ctx = await seedBase(models);
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ username: 'fadmin', contrasena: 'Clave1234' })).status).toBe(200);
  mesero = (await loginNuevoUsuario(request, app, models, ctx.empresa, { username: 'mesero1', nombre: 'Mesero Uno' })).agent;
  await activarModulos(['Mesas', 'Cocina', 'Recetas']);
  jugo = (await post('/api/productos', { codigo: 'JUG', nombre_producto: 'Jugo', precio_unitario: 4000, porcentaje_iva: 0, stock_actual: 100 })).body;
  mesa = (await post('/api/mesas', { nombre: 'P1' })).body;
});
afterAll(async () => { await models.sequelize.close(); });

describe('Con las opciones apagadas todo es como antes', () => {
  it('no hay pre-cuenta, el cliente y la referencia se ignoran y no se numera', async () => {
    const c = (await post('/api/cuentas', { mesaId: mesa.id, clienteId: ctx.cliente.id, referencia: 'Hab. 204' })).body;
    expect(c.cliente).toBeNull();
    expect(c.referencia).toBeNull();
    await post(`/api/cuentas/${c.id}/items`, { productoId: jugo.id });
    const pre = await post(`/api/cuentas/${c.id}/precuenta`);
    expect(pre.status).toBe(403);
    expect(pre.body.error).toMatch(/Opciones/);
    const sinNombre = await post('/api/cuentas', { numerar: true });
    expect(sinNombre.status).toBe(400);
    await post(`/api/cuentas/${c.id}/cancelar`, { motivo: 'Prueba' });
  });
});

describe('Cuenta a nombre de un cliente o referencia', () => {
  beforeAll(async () => { await opciones({ cuenta_cliente: true }); });

  it('se abre con cliente y referencia, se edita y no admite clientes de otra empresa', async () => {
    const c = await post('/api/cuentas', { mesaId: mesa.id, clienteId: ctx.cliente.id, referencia: 'Habitación 204' });
    expect(c.status).toBe(201);
    expect(c.body.cliente).toEqual({ id: ctx.cliente.id, nombre: 'Cliente Test' });
    expect(c.body.referencia).toBe('Habitación 204');
    expect((await patch(`/api/cuentas/${c.body.id}`, { clienteId: 99999 })).status).toBe(400);
    const nueva = await patch(`/api/cuentas/${c.body.id}`, { referencia: 'Habitación 305', clienteId: null });
    expect(nueva.body).toMatchObject({ referencia: 'Habitación 305', cliente: null });
    await patch(`/api/cuentas/${c.body.id}`, { clienteId: ctx.cliente.id });
    globalThis.cuentaCliente = c.body;
  });

  it('al cobrar, la venta sale a nombre del cliente de la cuenta (a menos que se indique otro)', async () => {
    const c = globalThis.cuentaCliente;
    await post(`/api/cuentas/${c.id}/items`, { productoId: jugo.id, cantidad: 2 });
    const cobro = await post(`/api/cuentas/${c.id}/cobrar`, {});
    expect(cobro.status).toBe(201);
    expect(cobro.body.venta.clienteId).toBe(ctx.cliente.id);
  });

  it('el cliente también sale en el tablero y la cuenta cobrada conserva su referencia', async () => {
    const c2 = (await post('/api/cuentas', { mesaId: mesa.id, referencia: 'Familia Pérez' })).body;
    expect((await get(`/api/cuentas/${c2.id}`)).body.referencia).toBe('Familia Pérez');
    await post(`/api/cuentas/${c2.id}/cancelar`, { motivo: 'Prueba' });
  });
});

describe('Pedidos numerados', () => {
  beforeAll(async () => { await opciones({ pedido_numerado: true }); });

  it('la cuenta para llevar sin nombre toma el siguiente número del día; con nombre lo respeta', async () => {
    const a = await post('/api/cuentas', { numerar: true });
    const b = await post('/api/cuentas', { numerar: true });
    expect(a.status).toBe(201);
    expect(a.body.nombre).toMatch(/^Pedido \d+$/);
    expect(Number(b.body.nombre.split(' ')[1])).toBe(Number(a.body.nombre.split(' ')[1]) + 1);
    const con = await post('/api/cuentas', { etiqueta: 'Para llevar · Ana', numerar: true });
    expect(con.body.nombre).toBe('Para llevar · Ana');
    expect((await post('/api/cuentas', {})).status).toBe(400); // sin numerar ni nombre sigue pidiendo uno
    for (const c of [a, b, con]) await post(`/api/cuentas/${c.body.id}/cancelar`, { motivo: 'Prueba' });
  });
});

describe('Pre-cuenta', () => {
  let cuenta;
  beforeAll(async () => { await opciones({ precuenta: true }); });

  it('lista lo pendiente con el total y la propina sugerida, sin cobrar nada', async () => {
    cuenta = (await post('/api/cuentas', { mesaId: mesa.id, comensales: 2 })).body;
    expect((await post(`/api/cuentas/${cuenta.id}/precuenta`)).status).toBe(400); // vacía
    await post(`/api/cuentas/${cuenta.id}/items`, { productoId: jugo.id, cantidad: 3, comensal: 1 });
    const res = await post(`/api/cuentas/${cuenta.id}/precuenta`, {}, mesero);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cuenta: 'P1', total: 12000, comensales: 2 });
    expect(res.body.items).toEqual([expect.objectContaining({ nombre: 'Jugo', cantidad: 3, subtotal: 12000, comensal: 1 })]);
    expect(res.body.propina_sugerida).toEqual({ pct: 10, valor: 1200, total_con_propina: 13200 });
    expect(res.body.empresa.nombre).toBe('TestCo');
    // no cobró ni cambió nada
    const despues = (await get(`/api/cuentas/${cuenta.id}`)).body;
    expect(despues.estado).toBe('ABIERTA');
    expect(despues.totales.cobrado).toBe(0);
    expect(await models.Venta.count({ where: { cuentaId: cuenta.id } })).toBe(0);
  });

  it('sin propina sugerida (o apagada) no la trae; una cuenta cerrada no se imprime; queda en la auditoría', async () => {
    await put('/api/mesas/config', { propina_sugerida_pct: 0 });
    expect((await post(`/api/cuentas/${cuenta.id}/precuenta`)).body.propina_sugerida).toBeNull();
    await put('/api/mesas/config', { propina_sugerida_pct: 10 });
    await opciones({ propina: false });
    expect((await post(`/api/cuentas/${cuenta.id}/precuenta`)).body.propina_sugerida).toBeNull();
    await opciones({ propina: true });

    await post(`/api/cuentas/${cuenta.id}/cobrar`, {});
    expect((await post(`/api/cuentas/${cuenta.id}/precuenta`)).status).toBe(400);
    expect((await post('/api/cuentas/99999/precuenta')).status).toBe(404);
    const frases = (await get('/api/auditoria?modulo=Mesas')).body.map((f) => f.accion);
    expect(frases).toContain('Imprimió la pre-cuenta');
  });
});
