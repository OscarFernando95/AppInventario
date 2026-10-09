'use strict';

const request = require('supertest');
const { resetDb, seedBase, activarModulos: activar, loginNuevoUsuario } = require('./helpers');
const { invalidateAllProfiles } = require('../../src/middlewares/auth');

let app; let models; let ctx; let agent; let mesero;
const conEmpresa = (r) => r.set('X-Empresa-Id', String(ctx.empresa.id));
const activarModulos = (extra = []) => activar(models, ctx.empresa, invalidateAllProfiles, extra);
const get = (url, quien = agent) => conEmpresa(quien.get(url));
const post = (url, body = {}, quien = agent) => conEmpresa(quien.post(url)).send(body);
const put = (url, body = {}, quien = agent) => conEmpresa(quien.put(url)).send(body);
const patch = (url, body = {}, quien = agent) => conEmpresa(quien.patch(url)).send(body);
const crear = (body) => post('/api/productos', { precio_unitario: 1000, porcentaje_iva: 0, ...body });
const opciones = (valores, quien = agent) => put('/api/opciones', { valores }, quien);
const MODULOS = ['Mesas', 'Cocina', 'Recetas'];

let pizza; let cerveza; let tomate; let nMesa = 0;
const nuevaCuenta = async () => (await post('/api/cuentas', { mesaId: (await post('/api/mesas', { nombre: `T${++nMesa}` })).body.id })).body;
const pedir = (cuenta, producto, extra = {}) => post(`/api/cuentas/${cuenta.id}/items`, { productoId: producto.id, ...extra });
const detalle = async (cuenta) => (await get(`/api/cuentas/${cuenta.id}`)).body;

beforeAll(async () => {
  await resetDb();
  app = require('../../src/app');
  models = require('../../src/models');
  ctx = await seedBase(models);
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ username: 'fadmin', contrasena: 'Clave1234' })).status).toBe(200);
  mesero = (await loginNuevoUsuario(request, app, models, ctx.empresa, { username: 'mesero1', nombre: 'Mesero Uno' })).agent;
  await activarModulos(MODULOS);
  tomate = (await crear({ codigo: 'TOM', nombre_producto: 'Tomate', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 50000, costo_promedio: 1 })).body;
  pizza = (await crear({ codigo: 'PIZ', nombre_producto: 'Pizza', tipo: 'RECETA', precio_unitario: 20000, receta: [{ insumoId: tomate.id, cantidad: 100 }] })).body;
  cerveza = (await crear({ codigo: 'CER', nombre_producto: 'Cerveza', precio_unitario: 5000, stock_actual: 500 })).body;
});

afterAll(async () => { await models.sequelize.close(); });

describe('Tiempos de servicio APAGADOS: todo igual que siempre', () => {
  it('se ignora el tiempo, enviar manda todo de una vez y /disparar no está disponible', async () => {
    const c = await nuevaCuenta();
    const res = await pedir(c, pizza, { tiempo: 3 });
    expect(res.status).toBe(201);
    expect(res.body.items[0].tiempo).toBe(1);
    expect(res.body.tiempo_actual).toBeUndefined();
    expect(res.body.tiempos).toBeUndefined();
    await pedir(c, cerveza, { tiempo: 2 });
    const id = res.body.items[0].id;
    expect((await patch(`/api/cuentas/${c.id}/items/${id}`, { tiempo: 2 })).body.items[0].tiempo).toBe(1); // se ignora

    const d = await post(`/api/cuentas/${c.id}/disparar`);
    expect(d.status).toBe(403);
    expect(d.body.error).toMatch(/Opciones/);

    const envio = await post(`/api/cuentas/${c.id}/enviar`);
    expect(envio.status).toBe(201);
    expect(envio.body.numItems).toBe(2);
    expect(envio.body.comandas).toHaveLength(1);
    expect(envio.body.comandas[0].tiempo).toBeNull();
    expect(envio.body.comandas[0].tiempo_nombre).toBeNull();
    expect((await detalle(c)).comandas[0].tiempo_nombre).toBeUndefined();
  });

  it('los tiempos fuera de rango se rechazan en el esquema aunque la opción esté apagada', async () => {
    const c = await nuevaCuenta();
    expect((await pedir(c, pizza, { tiempo: 5 })).status).toBe(400);
    expect((await pedir(c, pizza, { tiempo: 0 })).status).toBe(400);
  });

  it('el catálogo de opciones trae las nuevas, apagadas y con sus valores por omisión', async () => {
    const r = await get('/api/opciones');
    expect(r.body.valores).toMatchObject({
      tiempos_servicio: false, cocina_alertas: false, cocina_sonido: false, cocina_amarillo_min: 10, cocina_rojo_min: 20,
      tiempos_nombres: ['Entrada', 'Plato fuerte', 'Postre'],
    });
    const claves = r.body.catalogo.filter((o) => o.grupo === 'Cocina y servicio').map((o) => o.clave);
    expect(claves).toEqual(['tiempos_servicio', 'tiempos_nombres', 'cocina_alertas', 'cocina_amarillo_min', 'cocina_rojo_min', 'cocina_sonido']);
  });
});

describe('Validación de las opciones nuevas', () => {
  it('solo el administrador las cambia; los minutos validan rango y que el rojo supere al amarillo', async () => {
    expect((await opciones({ tiempos_servicio: true }, mesero)).status).toBe(403);
    expect((await opciones({ cocina_rojo_min: 30 })).status).toBe(400); // sin las alertas encendidas
    expect((await opciones({ cocina_alertas: true })).status).toBe(200);
    expect((await opciones({ cocina_amarillo_min: 0 })).status).toBe(400);
    expect((await opciones({ cocina_rojo_min: 241 })).status).toBe(400);
    const cruzada = await opciones({ cocina_amarillo_min: 20 }); // rojo vale 20
    expect(cruzada.status).toBe(400);
    expect(cruzada.body.error).toMatch(/rojo \(20\).*amarillo \(20\)/);
    expect((await opciones({ cocina_amarillo_min: 5, cocina_rojo_min: 5 })).status).toBe(400);
    const ok = await opciones({ cocina_amarillo_min: 5, cocina_rojo_min: 8 });
    expect(ok.status).toBe(200);
    expect(ok.body.valores).toMatchObject({ cocina_amarillo_min: 5, cocina_rojo_min: 8 });
    expect((await opciones({ cocina_amarillo_min: 9 })).status).toBe(400); // 9 ≥ 8
    expect((await opciones({ cocina_alertas: false })).status).toBe(200);
    expect((await get('/api/opciones')).body.valores).toMatchObject({ cocina_alertas: false, cocina_amarillo_min: 10, cocina_rojo_min: 20 }); // apagada vale lo de siempre
  });

  it('los nombres de los tiempos exigen «Pedir por tiempos» y respetan sus límites', async () => {
    expect((await opciones({ tiempos_nombres: ['Sopa'] })).status).toBe(400);
    expect((await opciones({ tiempos_servicio: true })).status).toBe(200);
    expect((await opciones({ tiempos_nombres: [] })).status).toBe(400);
    expect((await opciones({ tiempos_nombres: ['a', 'b', 'c', 'd', 'e'] })).status).toBe(400);
    expect((await opciones({ tiempos_nombres: ['Sopa', 'sopa'] })).status).toBe(400);
    expect((await opciones({ tiempos_nombres: ['x'.repeat(21)] })).status).toBe(400);
    expect((await opciones({ tiempos_nombres: 'Sopa' })).status).toBe(400);
    const ok = await opciones({ tiempos_nombres: ['Sopa', 'Fuerte'] });
    expect(ok.status).toBe(200);
    expect(ok.body.valores.tiempos_nombres).toEqual(['Sopa', 'Fuerte']);
    await opciones({ tiempos_nombres: ['Entrada', 'Plato fuerte', 'Postre'] });
    await opciones({ tiempos_servicio: false });
  });

  it('sin el módulo Cocina las alertas y el sonido no aplican; sin Mesas, tampoco los tiempos', async () => {
    await activarModulos(['Mesas']);
    const r = await get('/api/opciones');
    expect(r.body.catalogo.map((o) => o.clave)).not.toContain('cocina_alertas');
    expect(r.body.catalogo.map((o) => o.clave)).toContain('tiempos_servicio');
    const intento = await opciones({ cocina_alertas: true });
    expect(intento.status).toBe(400);
    expect(intento.body.error).toMatch(/necesita el módulo Cocina/);
    expect((await opciones({ cocina_sonido: true })).status).toBe(400);
    await activarModulos(['Cocina']);
    expect((await opciones({ tiempos_servicio: true })).body.error).toMatch(/necesita el módulo Mesas/);
    await activarModulos(MODULOS);
  });
});

describe('Pedir por tiempos', () => {
  beforeAll(async () => {
    await put('/api/mesas/config', { estaciones: ['Cocina', 'Barra'] });
    await put(`/api/productos/${cerveza.id}`, { estacion: 'Barra' });
    expect((await opciones({ tiempos_servicio: true })).status).toBe(200);
  });

  it('cada ítem lleva su tiempo, el mismo producto de otro tiempo es otra línea y la cuenta cuenta lo que espera', async () => {
    const c = await nuevaCuenta();
    await pedir(c, pizza, { tiempo: 1 });
    await pedir(c, pizza, { tiempo: 1 }); // se suma
    await pedir(c, pizza, { tiempo: 2 }); // otra línea
    const res = await pedir(c, cerveza); // sin tiempo = 1
    expect(res.body.items.map((i) => [i.nombre, i.cantidad, i.tiempo])).toEqual([['Pizza', 2, 1], ['Pizza', 1, 2], ['Cerveza', 1, 1]]);
    expect(res.body.tiempo_actual).toBe(1);
    expect(res.body.tiempos).toEqual([
      { numero: 1, nombre: 'Entrada', pendientes: 2 }, { numero: 2, nombre: 'Plato fuerte', pendientes: 1 }, { numero: 3, nombre: 'Postre', pendientes: 0 },
    ]);
  });

  it('no existe un tiempo mayor que los nombres configurados', async () => {
    const c = await nuevaCuenta();
    const r = await pedir(c, pizza, { tiempo: 4 });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/No existe el tiempo 4/);
    expect((await pedir(c, pizza, { tiempo: 3 })).status).toBe(201);
  });

  it('enviar manda solo el tiempo disparado; sin nada enviable da un error claro; disparar manda el siguiente', async () => {
    const c = await nuevaCuenta();
    await pedir(c, pizza, { tiempo: 2 });
    // Solo hay pedidos del tiempo 2 y el tiempo actual es 1: nada que enviar todavía
    const vacio = await post(`/api/cuentas/${c.id}/enviar`);
    expect(vacio.status).toBe(400);
    expect(vacio.body.error).toBe('No hay pedidos listos para enviar: dispara el siguiente tiempo.');

    await pedir(c, pizza, { tiempo: 1, nota: 'Sin albahaca' });
    await pedir(c, pizza, { tiempo: 3 });
    const envio = await post(`/api/cuentas/${c.id}/enviar`, {}, mesero);
    expect(envio.status).toBe(201);
    expect(envio.body.numItems).toBe(1);
    expect(envio.body.comandas).toHaveLength(1);
    expect(envio.body.comandas[0]).toMatchObject({ tiempo: 1, tiempo_nombre: 'Entrada', estacion: 'Cocina' });
    expect(envio.body.comandas[0].items.map((i) => i.nota)).toEqual(['Sin albahaca']);
    const d1 = await detalle(c);
    expect(d1.items.filter((i) => i.enviado)).toHaveLength(1);
    expect(d1.tiempos.map((t) => t.pendientes)).toEqual([0, 1, 1]);
    expect(d1.comandas[0]).toMatchObject({ tiempo: 1, tiempo_nombre: 'Entrada' });

    // Enviar otra vez sin disparar: nada listo
    expect((await post(`/api/cuentas/${c.id}/enviar`)).body.error).toMatch(/dispara el siguiente tiempo/);

    // Disparar: sube al siguiente tiempo con pedidos (el 2) y manda lo suyo
    const d = await post(`/api/cuentas/${c.id}/disparar`, {}, mesero);
    expect(d.status).toBe(201);
    expect(d.body.numItems).toBe(1);
    expect(d.body.comandas).toHaveLength(1);
    expect(d.body.comandas[0]).toMatchObject({ tiempo: 2, tiempo_nombre: 'Plato fuerte' });
    const d2 = await detalle(c);
    expect(d2.tiempo_actual).toBe(2);
    expect(d2.tiempos.map((t) => t.pendientes)).toEqual([0, 0, 1]);

    // Otra vez: el tiempo 3
    const d3 = await post(`/api/cuentas/${c.id}/disparar`);
    expect(d3.body.comandas[0]).toMatchObject({ tiempo: 3, tiempo_nombre: 'Postre' });
    expect((await detalle(c)).tiempo_actual).toBe(3);

    // Ya no queda nada
    const fin = await post(`/api/cuentas/${c.id}/disparar`);
    expect(fin.status).toBe(400);
    expect(fin.body.error).toMatch(/no queda ningún tiempo por disparar/);
    expect((await post(`/api/cuentas/${c.id}/enviar`)).body.error).toMatch(/No hay ítems nuevos/);
  });

  it('disparar se salta los tiempos sin pedidos', async () => {
    const c = await nuevaCuenta();
    await pedir(c, pizza, { tiempo: 1 });
    await pedir(c, cerveza, { tiempo: 3 });
    await post(`/api/cuentas/${c.id}/enviar`);
    const d = await post(`/api/cuentas/${c.id}/disparar`);
    expect(d.status).toBe(201);
    expect(d.body.comandas.map((x) => [x.tiempo, x.estacion])).toEqual([[3, 'Barra']]);
    expect((await detalle(c)).tiempo_actual).toBe(3);
  });

  it('pedidos nuevos de un tiempo ya disparado salen con el próximo «Enviar», sin disparar nada', async () => {
    const c = await nuevaCuenta();
    await pedir(c, pizza, { tiempo: 1 });
    await pedir(c, pizza, { tiempo: 2 });
    await post(`/api/cuentas/${c.id}/enviar`);
    await post(`/api/cuentas/${c.id}/disparar`); // tiempo actual = 2
    await pedir(c, cerveza, { tiempo: 1 }); // se pide una bebida tarde
    const envio = await post(`/api/cuentas/${c.id}/enviar`);
    expect(envio.status).toBe(201);
    expect(envio.body.comandas.map((x) => [x.tiempo, x.estacion])).toEqual([[1, 'Barra']]);
    expect((await detalle(c)).tiempo_actual).toBe(2);
  });

  it('varias estaciones y varios tiempos: una comanda por (tiempo, estación)', async () => {
    const c = await nuevaCuenta();
    await pedir(c, pizza, { tiempo: 1 });
    await pedir(c, cerveza, { tiempo: 1 });
    await pedir(c, pizza, { tiempo: 2 });
    await pedir(c, cerveza, { tiempo: 2 });
    const a = await post(`/api/cuentas/${c.id}/enviar`);
    expect(a.body.comandas.map((x) => [x.tiempo, x.estacion, x.items.map((i) => i.nombre)])).toEqual([[1, 'Cocina', ['Pizza']], [1, 'Barra', ['Cerveza']]]);
    const b = await post(`/api/cuentas/${c.id}/disparar`);
    expect(b.body.numItems).toBe(2);
    expect(b.body.comandas.map((x) => [x.tiempo, x.estacion, x.items.map((i) => i.nombre)])).toEqual([[2, 'Cocina', ['Pizza']], [2, 'Barra', ['Cerveza']]]);
    // Cocina ve cada comanda con el nombre de su tiempo
    const barra = (await get('/api/comandas?estacion=Barra')).body.filter((x) => x.cuentaId === c.id);
    expect(barra.map((x) => x.tiempo_nombre)).toEqual(['Entrada', 'Plato fuerte']);
  });

  it('el tiempo de un ítem se cambia mientras no se envíe; después no', async () => {
    const c = await nuevaCuenta();
    const item = (await pedir(c, pizza, { tiempo: 1 })).body.items[0];
    const cambio = await patch(`/api/cuentas/${c.id}/items/${item.id}`, { tiempo: 2 });
    expect(cambio.status).toBe(200);
    expect(cambio.body.items[0].tiempo).toBe(2);
    expect((await patch(`/api/cuentas/${c.id}/items/${item.id}`, { tiempo: 4 })).status).toBe(400);
    expect((await patch(`/api/cuentas/${c.id}/items/${item.id}`, { tiempo: 7 })).status).toBe(400);
    await patch(`/api/cuentas/${c.id}/items/${item.id}`, { tiempo: 1 });
    await post(`/api/cuentas/${c.id}/enviar`);
    const tarde = await patch(`/api/cuentas/${c.id}/items/${item.id}`, { tiempo: 2 });
    expect(tarde.status).toBe(400);
    expect(tarde.body.error).toMatch(/ya se envió a cocina/);
    // a quién pertenece sigue editable (no tocó tiempo)
    expect((await patch(`/api/cuentas/${c.id}/items/${item.id}`, { comensal: null })).status).toBe(200);
  });

  it('cobrar una parte de un ítem conserva su tiempo en lo que queda; unir cuentas conserva el tiempo disparado', async () => {
    const c = await nuevaCuenta();
    await pedir(c, cerveza, { tiempo: 2, cantidad: 2 });
    const item = (await detalle(c)).items[0];
    const cobro = await post(`/api/cuentas/${c.id}/cobrar`, { items: [{ itemId: item.id, cantidad: 1 }] });
    expect(cobro.status).toBe(201);
    const resto = cobro.body.cuenta.items.find((i) => !i.ventaId);
    expect(resto).toMatchObject({ cantidad: 1, tiempo: 2 });

    const a = await nuevaCuenta();
    const b = await nuevaCuenta();
    await pedir(b, pizza, { tiempo: 1 });
    await pedir(b, pizza, { tiempo: 2 });
    await post(`/api/cuentas/${b.id}/enviar`);
    await post(`/api/cuentas/${b.id}/disparar`); // b: tiempo actual 2
    const unida = await post(`/api/cuentas/${a.id}/unir`, { cuentaId: b.id });
    expect(unida.status).toBe(200);
    expect(unida.body.tiempo_actual).toBe(2);
  });

  it('con nombres propios: los usa en cuenta y comandas, y limita los tiempos disponibles', async () => {
    await opciones({ tiempos_nombres: ['Sopa', 'Fuerte'] });
    const c = await nuevaCuenta();
    const r = await pedir(c, pizza, { tiempo: 2 });
    expect(r.body.tiempos.map((t) => t.nombre)).toEqual(['Sopa', 'Fuerte']);
    expect((await pedir(c, pizza, { tiempo: 3 })).status).toBe(400);
    await pedir(c, cerveza, { tiempo: 1 });
    await post(`/api/cuentas/${c.id}/enviar`);
    const d = await post(`/api/cuentas/${c.id}/disparar`);
    expect(d.body.comandas[0].tiempo_nombre).toBe('Fuerte');
    // la lista se acortó después de pedir: «Tiempo n»
    await opciones({ tiempos_nombres: ['Solo uno'] });
    expect((await get('/api/comandas')).body.find((x) => x.cuentaId === c.id && x.tiempo === 2).tiempo_nombre).toBe('Tiempo 2');
    await opciones({ tiempos_nombres: ['Entrada', 'Plato fuerte', 'Postre'] });
  });

  it('queda en la auditoría: el tiempo disparado y la comanda con su tiempo', async () => {
    const frases = (await get('/api/auditoria?modulo=Mesas')).body;
    expect(frases.some((f) => f.accion === 'Disparó un tiempo de servicio' && /«Plato fuerte» · 1 ítem a cocina/.test(f.descripcion))).toBe(true);
    expect(frases.some((f) => /comanda #\d+ \(Cocina\) · 1 ítem · tiempo «Entrada»/.test(f.descripcion))).toBe(true);
  });

  it('al apagar la opción con pedidos en espera, «Enviar» manda todo de una vez como siempre', async () => {
    const c = await nuevaCuenta();
    await pedir(c, pizza, { tiempo: 1 });
    await pedir(c, pizza, { tiempo: 3 });
    await pedir(c, cerveza, { tiempo: 2 });
    expect((await opciones({ tiempos_servicio: false })).status).toBe(200);
    const d = await detalle(c);
    expect(d.tiempos).toBeUndefined();
    expect((await post(`/api/cuentas/${c.id}/disparar`)).status).toBe(403);
    const envio = await post(`/api/cuentas/${c.id}/enviar`);
    expect(envio.status).toBe(201);
    expect(envio.body.numItems).toBe(3);
    expect(envio.body.comandas.map((x) => [x.estacion, x.tiempo])).toEqual([['Cocina', null], ['Barra', null]]);
  });
});

describe('Alertas de demora: tiempo objetivo por plato', () => {
  let plato;
  beforeAll(async () => {
    plato = (await crear({ codigo: 'OBJ', nombre_producto: 'Lasaña', tipo: 'RECETA', precio_unitario: 25000, receta: [{ insumoId: tomate.id, cantidad: 50 }] })).body;
  });

  it('con las alertas apagadas el objetivo se ignora', async () => {
    const r = await put(`/api/productos/${plato.id}`, { tiempo_objetivo_min: 15 });
    expect(r.status).toBe(200);
    expect(r.body.tiempo_objetivo_min).toBeNull();
    const nuevo = await crear({ codigo: 'OBJ2', nombre_producto: 'Sopa', tipo: 'RECETA', receta: [{ insumoId: tomate.id, cantidad: 10 }], tiempo_objetivo_min: 9 });
    expect(nuevo.status).toBe(201);
    expect(nuevo.body.tiempo_objetivo_min).toBeNull();
  });

  it('con las alertas encendidas se guarda (solo platos y productos de venta), se valida y viaja en las comandas', async () => {
    expect((await opciones({ cocina_alertas: true })).status).toBe(200);
    expect((await put(`/api/productos/${plato.id}`, { tiempo_objetivo_min: 0 })).status).toBe(400);
    expect((await put(`/api/productos/${plato.id}`, { tiempo_objetivo_min: 601 })).status).toBe(400);
    const ok = await put(`/api/productos/${plato.id}`, { tiempo_objetivo_min: 15 });
    expect(ok.status).toBe(200);
    expect(ok.body.tiempo_objetivo_min).toBe(15);
    expect((await put(`/api/productos/${tomate.id}`, { tiempo_objetivo_min: 5 })).body.tiempo_objetivo_min).toBeNull(); // un insumo no se sirve

    const c = await nuevaCuenta();
    await pedir(c, plato);
    await pedir(c, cerveza);
    const envio = await post(`/api/cuentas/${c.id}/enviar`);
    const items = envio.body.comandas.flatMap((x) => x.items);
    expect(items.find((i) => i.nombre === 'Lasaña').tiempo_objetivo_min).toBe(15);
    expect(items.find((i) => i.nombre === 'Cerveza').tiempo_objetivo_min).toBeNull();
    expect((await get('/api/comandas')).body.flatMap((x) => x.items).find((i) => i.nombre === 'Lasaña').tiempo_objetivo_min).toBe(15);

    // vaciar el objetivo
    expect((await put(`/api/productos/${plato.id}`, { tiempo_objetivo_min: '' })).body.tiempo_objetivo_min).toBeNull();
    await opciones({ cocina_alertas: false });
  });
});
