'use strict';

const request = require('supertest');
const { resetDb, seedBase, activarModulos: activar, loginNuevoUsuario } = require('./helpers');
const { invalidateAllProfiles } = require('../../src/middlewares/auth');
const { olvidarOpciones } = require('../../src/middlewares/opciones');

let app; let models; let ctx; let agent; let operativo;
const conEmpresa = (r) => r.set('X-Empresa-Id', String(ctx.empresa.id));
const activarModulos = (extra = []) => activar(models, ctx.empresa, invalidateAllProfiles, extra);
const get = (url, quien = agent) => conEmpresa(quien.get(url));
const post = (url, body = {}, quien = agent) => conEmpresa(quien.post(url)).send(body);
const put = (url, body = {}, quien = agent) => conEmpresa(quien.put(url)).send(body);
const crear = (body) => post('/api/productos', { precio_unitario: 1000, porcentaje_iva: 0, ...body });
const opciones = (valores) => put('/api/opciones', { valores });

beforeAll(async () => {
  await resetDb();
  app = require('../../src/app');
  models = require('../../src/models');
  ctx = await seedBase(models);
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ username: 'fadmin', contrasena: 'Clave1234' })).status).toBe(200);
  operativo = (await loginNuevoUsuario(request, app, models, ctx.empresa, { username: 'operativo1' })).agent;
});
afterAll(async () => { await models.sequelize.close(); });

describe('Opciones: una empresa de comercio no cambia', () => {
  it('sin módulos de restaurante no ve ninguna opción ni puede cambiarla; todo vale «apagado»', async () => {
    const res = await get('/api/opciones');
    expect(res.status).toBe(200);
    expect(res.body.catalogo).toEqual([]);
    expect(Object.values(res.body.valores).filter((v) => v === true)).toEqual([]);
    const intento = await opciones({ reservas: false });
    expect(intento.status).toBe(400);
    expect(intento.body.error).toMatch(/necesita el módulo Mesas/);
  });
});

describe('Opciones: restaurante con Mesas', () => {
  beforeAll(async () => { await activarModulos(['Mesas', 'Cocina', 'Recetas']); });
  afterAll(async () => { await activarModulos([]); });

  it('lee el catálogo con sus valores y los perfiles; cualquier usuario puede leer, solo un administrador cambia', async () => {
    const res = await get('/api/opciones', operativo);
    expect(res.status).toBe(200);
    expect(res.body.valores).toMatchObject({ reservas: true, plano: true, unir_cuentas: true, cuenta_por_persona: true, propina: true });
    expect(res.body.catalogo.map((o) => o.clave)).toEqual(expect.arrayContaining(['reservas', 'plano', 'propina']));
    expect(res.body.perfiles.map((p) => p.clave)).toEqual(['minimo', 'cafeteria', 'restaurante']);
    expect((await put('/api/opciones', { valores: { reservas: false } }, operativo)).status).toBe(403);
  });

  it('valida lo que se manda', async () => {
    expect((await opciones({ inventada: true })).status).toBe(400);
    expect((await opciones({ reservas: 'sí' })).status).toBe(400);
    expect((await put('/api/opciones', {})).status).toBe(400);
    expect((await put('/api/opciones', { valores: { reservas: true }, perfil: 'cafeteria' })).status).toBe(400);
    expect((await put('/api/opciones', { perfil: 'marciano' })).status).toBe(400);
  });

  it('apagar una función la corta en el servidor sin tocar las demás', async () => {
    const mesa = (await post('/api/mesas', { nombre: 'O1' })).body;
    const mesa2 = (await post('/api/mesas', { nombre: 'O2' })).body;
    const a = (await post('/api/cuentas', { mesaId: mesa.id, comensales: 2 })).body;
    const b = (await post('/api/cuentas', { mesaId: mesa2.id })).body;
    const jugo = (await crear({ codigo: 'JUG', nombre_producto: 'Jugo', precio_unitario: 4000, stock_actual: 100 })).body;

    const res = await opciones({ reservas: false, unir_cuentas: false, plano: false });
    expect(res.status).toBe(200);
    expect(res.body.valores).toMatchObject({ reservas: false, unir_cuentas: false, plano: false, propina: true, cuenta_por_persona: true });

    // Reservas, unir y plano: 403 con un mensaje que dice dónde prenderlas.
    const reservas = await get('/api/reservas');
    expect(reservas.status).toBe(403);
    expect(reservas.body.error).toMatch(/Opciones/);
    expect((await post('/api/reservas', { nombre: 'X', personas: 2, fecha_hora: new Date(Date.now() + 3_600_000).toISOString() })).status).toBe(403);
    expect((await post(`/api/cuentas/${a.id}/unir`, { cuentaId: b.id })).status).toBe(403);
    expect((await put('/api/mesas/plano', { posiciones: [{ id: mesa.id, x: 10, y: 10 }] })).status).toBe(403);

    // Lo demás sigue funcionando igual.
    expect((await get('/api/mesas')).status).toBe(200);
    expect((await post(`/api/cuentas/${a.id}/items`, { productoId: jugo.id, comensal: 2 })).status).toBe(201);

    // Con «pedir por persona» apagado, el ítem no se asigna a nadie.
    await opciones({ cuenta_por_persona: false });
    const item = (await post(`/api/cuentas/${a.id}/items`, { productoId: jugo.id, comensal: 1 })).body.items.find((i) => i.comensal === 1);
    expect(item).toBeUndefined();

    // Con la propina apagada no se cobra aunque se mande.
    await opciones({ propina: false });
    const cobro = await post(`/api/cuentas/${a.id}/cobrar`, { propina: 5000 });
    expect(cobro.status).toBe(201);
    expect(Number(cobro.body.venta.propina)).toBe(0);

    // Se vuelve a encender y vuelve todo.
    await opciones({ reservas: true });
    expect((await get('/api/reservas')).status).toBe(200);
    await put('/api/opciones', { perfil: 'restaurante' });
    await post(`/api/cuentas/${b.id}/cancelar`, { motivo: 'Prueba' });
  });

  it('un perfil reemplaza lo anterior y queda en la auditoría', async () => {
    const res = await put('/api/opciones', { perfil: 'cafeteria' });
    expect(res.status).toBe(200);
    expect(res.body.valores).toMatchObject({ reservas: false, plano: false, unir_cuentas: false, cuenta_por_persona: false, propina: true });
    expect((await get('/api/reservas')).status).toBe(403);
    const frases = (await get('/api/auditoria?modulo=Mesas')).body;
    expect(frases.map((f) => f.accion)).toEqual(expect.arrayContaining(['Aplicó un perfil de opciones', 'Cambió las opciones del restaurante']));
    expect(frases.find((f) => f.accion === 'Aplicó un perfil de opciones').descripcion).toMatch(/cafeteria/);
    await put('/api/opciones', { perfil: 'restaurante' });
    olvidarOpciones(ctx.empresa.id);
    expect((await get('/api/reservas')).status).toBe(200);
  });

  it('si quitan el módulo Mesas, sus opciones dejan de aplicar aunque estén guardadas', async () => {
    await opciones({ reservas: false });
    await activarModulos([]);
    const res = await get('/api/opciones');
    expect(res.body.catalogo).toEqual([]);
    expect(res.body.valores.reservas).toBe(false);
    await activarModulos(['Mesas', 'Cocina', 'Recetas']);
    await put('/api/opciones', { perfil: 'restaurante' });
  });
});
