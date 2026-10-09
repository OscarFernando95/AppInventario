'use strict';

const request = require('supertest');
const { resetDb, seedBase, activarModulos: activar, loginNuevoUsuario } = require('./helpers');
const { invalidateAllProfiles } = require('../../src/middlewares/auth');

let app; let models; let ctx; let agent; let mesero; let meseroUsuario;
const conEmpresa = (r) => r.set('X-Empresa-Id', String(ctx.empresa.id));
const activarModulos = (extra = []) => activar(models, ctx.empresa, invalidateAllProfiles, extra);
const get = (url, quien = agent) => conEmpresa(quien.get(url));
const post = (url, body = {}, quien = agent) => conEmpresa(quien.post(url)).send(body);
const put = (url, body = {}, quien = agent) => conEmpresa(quien.put(url)).send(body);
const patch = (url, body = {}, quien = agent) => conEmpresa(quien.patch(url)).send(body);
const crear = (body) => post('/api/productos', { precio_unitario: 1000, porcentaje_iva: 0, ...body });
const MODULOS = ['Mesas', 'Cocina', 'Recetas'];

beforeAll(async () => {
  await resetDb();
  app = require('../../src/app');
  models = require('../../src/models');
  ctx = await seedBase(models);
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ username: 'fadmin', contrasena: 'Clave1234' })).status).toBe(200);
  const m = await loginNuevoUsuario(request, app, models, ctx.empresa, { username: 'mesero1', nombre: 'Mesero Uno' });
  mesero = m.agent;
  meseroUsuario = m.usuario;
  await activarModulos(MODULOS);
});

afterAll(async () => { await models.sequelize.close(); });

describe('Estaciones de preparación (una comanda por estación)', () => {
  let mesa; let pizza; let cerveza; let tomate;

  beforeAll(async () => {
    tomate = (await crear({ codigo: 'TOM', nombre_producto: 'Tomate', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 5000, costo_promedio: 1 })).body;
    pizza = (await crear({ codigo: 'PIZ', nombre_producto: 'Pizza', tipo: 'RECETA', precio_unitario: 20000, receta: [{ insumoId: tomate.id, cantidad: 100 }] })).body;
    cerveza = (await crear({ codigo: 'CER', nombre_producto: 'Cerveza', precio_unitario: 5000, stock_actual: 50 })).body;
    mesa = (await post('/api/mesas', { nombre: 'E1' })).body;
  });

  it('por omisión hay una estación («Cocina»); solo el administrador las cambia y deben ser válidas', async () => {
    expect((await get('/api/mesas')).body.config.estaciones).toEqual(['Cocina']);
    expect((await put('/api/mesas/config', { estaciones: ['Cocina', 'Barra'] }, mesero)).status).toBe(403);
    expect((await put('/api/mesas/config', { estaciones: [] })).status).toBe(400);
    expect((await put('/api/mesas/config', { estaciones: ['Barra', 'barra'] })).status).toBe(400);
    expect((await put('/api/mesas/config', {})).status).toBe(400);
    const ok = await put('/api/mesas/config', { estaciones: ['Cocina', 'Barra'] });
    expect(ok.status).toBe(200);
    expect(ok.body.estaciones).toEqual(['Cocina', 'Barra']);
    expect(ok.body.propina_sugerida_pct).toBe(10); // no tocó lo demás
  });

  it('cada plato tiene su estación, que debe existir', async () => {
    expect((await put(`/api/productos/${cerveza.id}`, { estacion: 'Postres' })).status).toBe(400);
    const ok = await put(`/api/productos/${cerveza.id}`, { estacion: 'Barra' });
    expect(ok.status).toBe(200);
    expect(ok.body.estacion).toBe('Barra');
    // un insumo no pasa por estación
    expect((await put(`/api/productos/${tomate.id}`, { estacion: 'Cocina' })).body.estacion).toBeNull();
  });

  it('enviar crea una comanda por estación y cada pantalla ve la suya', async () => {
    const c = (await post('/api/cuentas', { mesaId: mesa.id })).body;
    await post(`/api/cuentas/${c.id}/items`, { productoId: pizza.id });
    await post(`/api/cuentas/${c.id}/items`, { productoId: cerveza.id, cantidad: 2 });
    const res = await post(`/api/cuentas/${c.id}/enviar`, {}, mesero);
    expect(res.status).toBe(201);
    expect(res.body.numItems).toBe(2);
    expect(res.body.comandas.map((x) => [x.estacion, x.items.map((i) => i.nombre)])).toEqual([['Cocina', ['Pizza']], ['Barra', ['Cerveza']]]);

    expect((await get('/api/comandas?estacion=Barra')).body.map((x) => x.items[0].nombre)).toEqual(['Cerveza']);
    expect((await get('/api/comandas?estacion=Cocina')).body.map((x) => x.items[0].nombre)).toEqual(['Pizza']);
    expect((await get('/api/comandas')).body).toHaveLength(2);
    const detalle = (await get(`/api/cuentas/${c.id}`)).body;
    expect(detalle.comandas).toHaveLength(2);
    expect(detalle.items.find((i) => i.nombre === 'Cerveza').estacion).toBe('Barra');
    const frases = (await get('/api/auditoria?modulo=Mesas')).body.map((f) => f.descripcion);
    expect(frases.some((d) => /comanda #\d+ \(Barra\)/.test(d))).toBe(true);
    globalThis.cuentaE = c;
  });

  it('un plato sin estación (o con una que se quitó) va a la primera', async () => {
    await put('/api/mesas/config', { estaciones: ['Cocina'] }); // se quita «Barra»
    expect((await models.Producto.findByPk(cerveza.id)).estacion).toBeNull();
    const c = (await post('/api/cuentas', { mesaId: (await post('/api/mesas', { nombre: 'E2' })).body.id })).body;
    await post(`/api/cuentas/${c.id}/items`, { productoId: cerveza.id });
    const res = await post(`/api/cuentas/${c.id}/enviar`);
    expect(res.body.comandas).toHaveLength(1);
    expect(res.body.comandas[0].estacion).toBe('Cocina');
    await put('/api/mesas/config', { estaciones: ['Cocina', 'Barra'] });
    await post(`/api/cuentas/${c.id}/cancelar`, { motivo: 'Prueba' });
  });

  it('al cobrar toda la cuenta, sus comandas pendientes salen solas de la pantalla de cocina', async () => {
    const c = globalThis.cuentaE;
    expect((await get('/api/comandas')).body.filter((x) => x.cuentaId === c.id)).toHaveLength(2);
    // cobrar solo una parte NO las quita
    const it = (await get(`/api/cuentas/${c.id}`)).body.items.find((i) => i.nombre === 'Cerveza');
    await post(`/api/cuentas/${c.id}/cobrar`, { items: [{ itemId: it.id, cantidad: 1 }] });
    expect((await get('/api/comandas')).body.filter((x) => x.cuentaId === c.id)).toHaveLength(2);
    const res = await post(`/api/cuentas/${c.id}/cobrar`, {});
    expect(res.body.cuenta_cerrada).toBe(true);
    expect((await get('/api/comandas')).body.filter((x) => x.cuentaId === c.id)).toHaveLength(0);
    const entregadas = (await get('/api/comandas?estado=ENTREGADA')).body.filter((x) => x.cuentaId === c.id);
    expect(entregadas).toHaveLength(2);
  });
});

describe('Cuenta por comensal', () => {
  let mesa; let cuenta; let jugo; let plato;

  beforeAll(async () => {
    jugo = (await crear({ codigo: 'JUG', nombre_producto: 'Jugo', precio_unitario: 4000, stock_actual: 100 })).body;
    plato = (await crear({ codigo: 'PLA', nombre_producto: 'Para compartir', precio_unitario: 30000, stock_actual: 100 })).body;
    mesa = (await post('/api/mesas', { nombre: 'C1' })).body;
    cuenta = (await post('/api/cuentas', { mesaId: mesa.id, comensales: 3 })).body;
  });
  const agregar = (body, quien = agent) => post(`/api/cuentas/${cuenta.id}/items`, body, quien);

  it('cada ítem puede ser de una persona; el mismo producto de otra persona es otra línea', async () => {
    await agregar({ productoId: jugo.id, comensal: 1 });
    await agregar({ productoId: jugo.id, comensal: 1 }); // se suma a la línea de la persona 1
    await agregar({ productoId: jugo.id, comensal: 2 });
    const res = await agregar({ productoId: plato.id });
    expect(res.status).toBe(201);
    const items = res.body.items;
    expect(items.map((i) => [i.nombre, i.cantidad, i.comensal])).toEqual([['Jugo', 2, 1], ['Jugo', 1, 2], ['Para compartir', 1, null]]);
    expect(res.body.por_comensal).toEqual([
      { comensal: 1, total: 8000, pendiente: 8000, items: 1 },
      { comensal: 2, total: 4000, pendiente: 4000, items: 1 },
      { comensal: null, total: 30000, pendiente: 30000, items: 1 },
    ]);
  });

  it('no existe una persona mayor que los comensales de la cuenta', async () => {
    const res = await agregar({ productoId: jugo.id, comensal: 4 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/3 comensal/);
    expect((await agregar({ productoId: jugo.id, comensal: 0 })).status).toBe(400);
  });

  it('a quién pertenece un ítem se puede cambiar aunque ya se haya enviado; su cantidad no', async () => {
    await post(`/api/cuentas/${cuenta.id}/enviar`);
    const compartido = (await get(`/api/cuentas/${cuenta.id}`)).body.items.find((i) => i.nombre === 'Para compartir');
    const ok = await patch(`/api/cuentas/${cuenta.id}/items/${compartido.id}`, { comensal: 3 });
    expect(ok.status).toBe(200);
    expect(ok.body.items.find((i) => i.id === compartido.id).comensal).toBe(3);
    expect((await patch(`/api/cuentas/${cuenta.id}/items/${compartido.id}`, { cantidad: 2 })).status).toBe(400);
    expect((await patch(`/api/cuentas/${cuenta.id}/items/${compartido.id}`, { comensal: 9 })).status).toBe(400);
    await patch(`/api/cuentas/${cuenta.id}/items/${compartido.id}`, { comensal: null });
  });

  it('cobrar lo de una persona deja el resto de la cuenta pendiente y conserva a quién era cada ítem', async () => {
    const c = (await get(`/api/cuentas/${cuenta.id}`)).body;
    const dePersona1 = c.items.filter((i) => i.comensal === 1);
    const res = await post(`/api/cuentas/${cuenta.id}/cobrar`, { items: dePersona1.map((i) => ({ itemId: i.id, cantidad: 1 })) }); // 1 de las 2 unidades
    expect(res.status).toBe(201);
    const pg = res.body.cuenta.por_comensal;
    expect(pg.find((g) => g.comensal === 1)).toMatchObject({ total: 8000, pendiente: 4000 }); // quedó 1 jugo por cobrar, aún de la persona 1
    expect(res.body.cuenta.items.filter((i) => !i.ventaId && i.comensal === 1)).toHaveLength(1);
    expect(Number(res.body.venta.total)).toBe(4000);
  });
});

describe('Peso de cada persona al repartir propinas', () => {
  it('con Caja: pesos editables por el administrador; personas ajenas se rechazan', async () => {
    await activarModulos([...MODULOS, 'Caja']);
    const mesa = (await post('/api/mesas', { nombre: 'P1' })).body;
    await post('/api/cuentas', { mesaId: mesa.id }, mesero); // el mesero abre una cuenta hoy
    await loginNuevoUsuario(request, app, models, ctx.empresa, { username: 'sin_turno', nombre: 'Sin Turno' }); // entra pero no hace nada
    const personal = (await get('/api/caja/personal', mesero)).body;
    const admin = personal.find((p) => p.nombre === 'Front Admin');
    const yo = personal.find((p) => p.nombre === 'Mesero Uno');
    expect(personal.every((p) => p.peso === 1)).toBe(true);
    expect(yo.trabajo_hoy).toBe(true);
    expect(personal.find((p) => p.nombre === 'Sin Turno').trabajo_hoy).toBe(false);

    expect((await put('/api/mesas/propinas/pesos', { pesos: [{ usuarioId: yo.id, peso: 1.5 }] }, mesero)).status).toBe(403);
    expect((await put('/api/mesas/propinas/pesos', { pesos: [{ usuarioId: 99999, peso: 1 }] })).status).toBe(400);
    expect((await put('/api/mesas/propinas/pesos', { pesos: [{ usuarioId: yo.id, peso: -2 }] })).status).toBe(400);
    expect((await put('/api/mesas/propinas/pesos', { pesos: [{ usuarioId: yo.id, peso: 1.5 }, { usuarioId: admin.id, peso: 0 }] })).status).toBe(200);
    const despues = (await get('/api/caja/personal')).body;
    expect(despues.find((p) => p.id === yo.id).peso).toBe(1.5);
    expect(despues.find((p) => p.id === admin.id).peso).toBe(0);
    const frases = (await get('/api/auditoria?modulo=Mesas')).body.map((f) => f.accion);
    expect(frases).toContain('Cambió el reparto de propinas');
    await activarModulos(MODULOS);
    expect(meseroUsuario.id).toBe(yo.id);
  });
});

describe('Ranking de pérdidas del mes y a quién avisar de las alertas', () => {
  let a; let b;
  beforeAll(async () => {
    a = (await crear({ codigo: 'A', nombre_producto: 'Queso', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 1000, costo_promedio: 10 })).body;
    b = (await crear({ codigo: 'B', nombre_producto: 'Pan', tipo: 'INSUMO', unidad_medida: '94', stock_actual: 50, costo_promedio: 500 })).body;
  });

  it('suma faltantes al contar y mermas por producto, de lo que más costó a lo que menos', async () => {
    await post('/api/ajustes/conteo', { items: [{ productoId: a.id, cantidad_contada: 950 }] }); // −50 g × 10 = 500
    await post('/api/ajustes', { productoId: b.id, tipo: 'VENCIDO', cantidad: 3 }); // 3 × 500 = 1.500
    await post('/api/ajustes', { productoId: a.id, tipo: 'MERMA', cantidad: 10 }); // 100
    const res = await get('/api/ajustes/desviaciones/ranking');
    expect(res.status).toBe(200);
    expect(res.body.filas.map((f) => [f.nombre_producto, f.faltante_valor, f.mermas_valor, f.perdida_total])).toEqual([['Pan', 0, 1500, 1500], ['Queso', 500, 100, 600]]);
    expect(res.body.totales).toEqual({ faltantes: 500, mermas: 1600, perdida: 2100 });
    expect(res.body.mes).toMatch(/^\d{4}-\d{2}$/);
    expect((await get('/api/ajustes/desviaciones/ranking?mes=2020-01')).body.filas).toEqual([]);
    expect((await get('/api/ajustes/desviaciones/ranking?mes=enero')).status).toBe(400);
    expect((await get('/api/ajustes/desviaciones/ranking', mesero)).status).toBe(403);
  });

  it('guarda a quién avisar (WhatsApp y correo) junto con el límite; se puede borrar', async () => {
    expect((await get('/api/ajustes/desviaciones')).body.contacto).toEqual({ whatsapp: null, correo: null });
    expect((await put('/api/ajustes/desviaciones/umbral', { alerta_correo: 'no-es-correo' })).status).toBe(400);
    expect((await put('/api/ajustes/desviaciones/umbral', { alerta_whatsapp: 'abc' })).status).toBe(400);
    expect((await put('/api/ajustes/desviaciones/umbral', {})).status).toBe(400);
    const ok = await put('/api/ajustes/desviaciones/umbral', { alerta_whatsapp: '300 111 2233', alerta_correo: 'dueno@cafe.co' });
    expect(ok.status).toBe(200);
    expect(ok.body.contacto).toEqual({ whatsapp: '300 111 2233', correo: 'dueno@cafe.co' });
    expect(ok.body.umbral_pct).toBe(5); // el límite no cambió
    expect((await get('/api/ajustes/desviaciones?modo=conteos')).body.contacto.correo).toBe('dueno@cafe.co');
    const borrado = await put('/api/ajustes/desviaciones/umbral', { alerta_whatsapp: '' });
    expect(borrado.body.contacto).toEqual({ whatsapp: null, correo: 'dueno@cafe.co' });
  });
});

describe('Plano del local', () => {
  it('guarda la posición de las mesas; solo quien configura las mesas; valida rangos y propiedad', async () => {
    const m1 = (await post('/api/mesas', { nombre: 'Pl1' })).body;
    const m2 = (await post('/api/mesas', { nombre: 'Pl2' })).body;
    expect((await put('/api/mesas/plano', { posiciones: [{ id: m1.id, x: 10, y: 20 }] }, mesero)).status).toBe(403);
    expect((await put('/api/mesas/plano', { posiciones: [{ id: m1.id, x: 150, y: 20 }] })).status).toBe(400);
    expect((await put('/api/mesas/plano', { posiciones: [{ id: 99999, x: 10, y: 20 }] })).status).toBe(400);
    expect((await put('/api/mesas/plano', { posiciones: [{ id: m1.id, x: 10, y: 20 }, { id: m2.id, x: 80, y: 55 }] })).status).toBe(200);
    const mesas = (await get('/api/mesas')).body.mesas;
    expect(mesas.find((m) => m.id === m1.id)).toMatchObject({ pos_x: 10, pos_y: 20 });
    expect(mesas.find((m) => m.id === m2.id)).toMatchObject({ pos_x: 80, pos_y: 55 });
    // sacar una mesa del plano
    await put('/api/mesas/plano', { posiciones: [{ id: m2.id, x: null, y: null }] });
    expect((await get('/api/mesas')).body.mesas.find((m) => m.id === m2.id).pos_x).toBeNull();
  });
});
