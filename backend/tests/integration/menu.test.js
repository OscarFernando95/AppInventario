'use strict';

const request = require('supertest');
const { resetDb, seedBase, activarModulos: activar, loginNuevoUsuario } = require('./helpers');
const { invalidateAllProfiles } = require('../../src/middlewares/auth');
const { olvidarOpciones } = require('../../src/middlewares/opciones');

let app; let models; let ctx; let agent; let mesero;
const conEmpresa = (r) => r.set('X-Empresa-Id', String(ctx.empresa.id));
const activarModulos = (extra = []) => activar(models, ctx.empresa, invalidateAllProfiles, extra);
const get = (url, quien = agent) => conEmpresa(quien.get(url));
const post = (url, body = {}, quien = agent) => conEmpresa(quien.post(url)).send(body);
const put = (url, body = {}, quien = agent) => conEmpresa(quien.put(url)).send(body);
const del = (url, quien = agent) => conEmpresa(quien.delete(url));
const crear = (body) => post('/api/productos', { precio_unitario: 1000, porcentaje_iva: 0, ...body });
const opciones = (valores) => put('/api/opciones', { valores });
const MODULOS = ['Mesas', 'Cocina', 'Recetas'];
// Una foto de 1×1 píxel (PNG) como data URL.
const FOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const enHoras = (h) => { const d = new Date(Date.now() + h * 3_600_000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

beforeAll(async () => {
  await resetDb();
  app = require('../../src/app');
  models = require('../../src/models');
  ctx = await seedBase(models);
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ username: 'fadmin', contrasena: 'Clave1234' })).status).toBe(200);
  mesero = (await loginNuevoUsuario(request, app, models, ctx.empresa, { username: 'mesero1', nombre: 'Mesero Uno' })).agent;
  await activarModulos(MODULOS);
});
afterAll(async () => { await models.sequelize.close(); });

describe('Menú con todo apagado: nada cambia', () => {
  it('las rutas del menú responden 403 y el listado de productos queda como siempre', async () => {
    for (const url of ['/api/menu/categorias', '/api/menu/imagenes', '/api/menu/precios-horario']) {
      const r = await get(url);
      expect(r.status, url).toBe(403);
      expect(r.body.error).toMatch(/Opciones/);
    }
    expect((await post(`/api/menu/agotado/${ctx.producto.id}`, { agotado: true })).status).toBe(403);
    const lista = (await get('/api/productos')).body;
    const p = lista.find((x) => x.id === ctx.producto.id);
    expect(p.agotado_hoy).toBeUndefined();
    expect(p.precio_vigente).toBeUndefined();
    expect(p.imagen).toBeUndefined();
  });

  it('los campos de menú se ignoran al guardar un producto', async () => {
    const r = await crear({ codigo: 'X1', nombre_producto: 'Sin menú', stock_actual: 5, categoriaId: 999, imagen: FOTO, orden_menu: 3 });
    expect(r.status).toBe(201);
    expect(r.body.categoriaId).toBeNull();
    expect(r.body.imagen).toBeUndefined();
  });
});

describe('Categorías del menú', () => {
  beforeAll(async () => { await opciones({ menu_categorias: true }); });

  it('se crean con orden propio; un nombre repetido y quien no administra el menú se rechazan', async () => {
    const a = await post('/api/menu/categorias', { nombre: 'Bebidas' });
    const b = await post('/api/menu/categorias', { nombre: 'Postres' });
    expect([a.status, b.status]).toEqual([201, 201]);
    expect([a.body.orden, b.body.orden]).toEqual([0, 1]);
    expect((await post('/api/menu/categorias', { nombre: 'Bebidas' })).status).toBe(400);
    expect((await post('/api/menu/categorias', { nombre: '  ' })).status).toBe(400);
    expect((await post('/api/menu/categorias', { nombre: 'Intrusa' }, mesero)).status).toBe(403);
    // cualquiera que atiende las lee
    expect((await get('/api/menu/categorias', mesero)).body.map((c) => c.nombre)).toEqual(['Bebidas', 'Postres']);
  });

  it('se reordenan y se desactivan', async () => {
    const cats = (await get('/api/menu/categorias')).body;
    const res = await put('/api/menu/categorias/orden', { ids: [cats[1].id, cats[0].id] });
    expect(res.body.map((c) => c.nombre)).toEqual(['Postres', 'Bebidas']);
    expect((await put('/api/menu/categorias/orden', { ids: [99999] })).status).toBe(400);
    await put(`/api/menu/categorias/${cats[1].id}`, { activa: false });
    expect((await get('/api/menu/categorias')).body.map((c) => c.nombre)).toEqual(['Bebidas']); // Postres quedó inactiva
    expect((await get('/api/menu/categorias?todas=1')).body).toHaveLength(2);
    await put(`/api/menu/categorias/${cats[1].id}`, { activa: true });
  });

  it('un producto toma su categoría y orden; la categoría debe ser de la empresa', async () => {
    const cats = (await get('/api/menu/categorias')).body;
    const cafe = (await crear({ codigo: 'CAF', nombre_producto: 'Café', stock_actual: 10, categoriaId: cats[1].id, orden_menu: 2 })).body;
    expect(cafe.categoriaId).toBe(cats[1].id);
    expect((await crear({ codigo: 'CAF2', nombre_producto: 'Otro', stock_actual: 1, categoriaId: 99999 })).status).toBe(400);
    const lista = (await get('/api/productos')).body;
    expect(lista.find((p) => p.id === cafe.id)).toMatchObject({ categoriaId: cats[1].id, orden_menu: 2 });
    expect((await put(`/api/productos/${cafe.id}`, { categoriaId: null })).body.categoriaId).toBeNull();
  });

  it('apagar la opción corta las rutas pero no borra lo guardado', async () => {
    await opciones({ menu_categorias: false });
    expect((await get('/api/menu/categorias')).status).toBe(403);
    await opciones({ menu_categorias: true });
    expect((await get('/api/menu/categorias')).body).toHaveLength(2);
  });
});

describe('Fotos', () => {
  let tarta;
  beforeAll(async () => { await opciones({ menu_fotos: true }); });

  it('la foto se guarda, no viaja en el listado y se pide aparte', async () => {
    const r = await crear({ codigo: 'TAR', nombre_producto: 'Tarta', stock_actual: 4, imagen: FOTO });
    expect(r.status).toBe(201);
    expect(r.body.imagen).toBeUndefined();
    tarta = r.body;
    const lista = (await get('/api/productos')).body;
    const p = lista.find((x) => x.id === tarta.id);
    expect(p.imagen).toBeUndefined();
    expect(p.tiene_imagen).toBe(true);
    expect(lista.find((x) => x.id === ctx.producto.id).tiene_imagen).toBe(false);
    const imagenes = (await get('/api/menu/imagenes', mesero)).body;
    expect(imagenes[tarta.id]).toBe(FOTO);
    expect(Object.keys(imagenes)).toEqual([String(tarta.id)]);
  });

  it('solo se aceptan imágenes pequeñas JPG, PNG o WebP; vaciarla la quita', async () => {
    expect((await crear({ codigo: 'F1', nombre_producto: 'Mala', stock_actual: 1, imagen: 'http://x.co/a.png' })).status).toBe(400);
    expect((await crear({ codigo: 'F2', nombre_producto: 'Mala2', stock_actual: 1, imagen: 'data:text/html;base64,PGI+' })).status).toBe(400);
    expect((await crear({ codigo: 'F3', nombre_producto: 'Grande', stock_actual: 1, imagen: `data:image/png;base64,${'A'.repeat(160_000)}` })).status).toBe(400);
    await put(`/api/productos/${tarta.id}`, { imagen: '' });
    expect(Object.keys((await get('/api/menu/imagenes')).body)).toEqual([]);
  });
});

describe('Agotado por hoy', () => {
  let tostada; let mesa;
  beforeAll(async () => {
    await opciones({ agotados_manuales: true });
    tostada = (await crear({ codigo: 'TOS', nombre_producto: 'Tostada', stock_actual: 50, precio_unitario: 6000 })).body;
    mesa = (await post('/api/mesas', { nombre: 'M1' })).body;
  });
  const vender = (productoId) => post('/api/ventas', { clienteId: ctx.cliente.id, detalles: [{ productoId, cantidad: 1, precio_unitario: 6000, precio_base: 6000 }] });

  it('cualquiera que atiende lo marca; no se puede pedir ni vender hasta que se habilite', async () => {
    expect((await post(`/api/menu/agotado/${tostada.id}`, { agotado: true }, mesero)).body).toEqual({ id: tostada.id, agotado_hoy: true });
    expect((await get('/api/productos')).body.find((p) => p.id === tostada.id).agotado_hoy).toBe(true);

    const venta = await vender(tostada.id);
    expect(venta.status).toBe(400);
    expect(venta.body.error).toMatch(/agotado por hoy/);
    const cuenta = (await post('/api/cuentas', { mesaId: mesa.id })).body;
    const pedido = await post(`/api/cuentas/${cuenta.id}/items`, { productoId: tostada.id });
    expect(pedido.status).toBe(400);
    expect(pedido.body.error).toMatch(/agotado por hoy/);

    await post(`/api/menu/agotado/${tostada.id}`, { agotado: false });
    expect((await vender(tostada.id)).status).toBe(201);
    expect((await post(`/api/cuentas/${cuenta.id}/items`, { productoId: tostada.id })).status).toBe(201);
    await post(`/api/cuentas/${cuenta.id}/cancelar`, { motivo: 'Prueba' });
  });

  it('el «agotado» vale solo ese día; un insumo no se marca', async () => {
    await post(`/api/menu/agotado/${tostada.id}`, { agotado: true });
    await models.Producto.update({ agotado_dia: '2020-01-01' }, { where: { id: tostada.id } });
    expect((await get('/api/productos')).body.find((p) => p.id === tostada.id).agotado_hoy).toBe(false);
    expect((await vender(tostada.id)).status).toBe(201);
    const insumo = (await crear({ codigo: 'INS', nombre_producto: 'Harina', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 100 })).body;
    expect((await post(`/api/menu/agotado/${insumo.id}`, { agotado: true })).status).toBe(404);
  });

  it('con la opción apagada se vende aunque haya quedado marcado', async () => {
    await post(`/api/menu/agotado/${tostada.id}`, { agotado: true });
    await opciones({ agotados_manuales: false });
    expect((await vender(tostada.id)).status).toBe(201);
    expect((await get('/api/productos')).body.find((p) => p.id === tostada.id).agotado_hoy).toBeUndefined();
    await opciones({ agotados_manuales: true });
    await post(`/api/menu/agotado/${tostada.id}`, { agotado: false });
  });
});

describe('Precios por horario', () => {
  let cerveza; let mesa; let cuenta;
  const regla = (extra = {}) => ({ nombre: 'Happy hour', tipo: 'PORCENTAJE', valor: 50, dias: [0, 1, 2, 3, 4, 5, 6], hora_inicio: '00:00', hora_fin: '23:59', ...extra });

  beforeAll(async () => {
    await opciones({ precios_horario: true });
    cerveza = (await crear({ codigo: 'CER', nombre_producto: 'Cerveza', stock_actual: 100, precio_unitario: 10000 })).body;
    mesa = (await post('/api/mesas', { nombre: 'M2' })).body;
  });

  it('crea, valida y solo la administra quien gestiona el menú', async () => {
    expect((await post('/api/menu/precios-horario', regla({ valor: 150 }))).status).toBe(400);
    expect((await post('/api/menu/precios-horario', regla({ hora_fin: '00:00' }))).status).toBe(400);
    expect((await post('/api/menu/precios-horario', regla({ producto_ids: [99999] }))).status).toBe(400);
    expect((await post('/api/menu/precios-horario', regla(), mesero)).status).toBe(403);
    const r = await post('/api/menu/precios-horario', regla({ producto_ids: [cerveza.id] }));
    expect(r.status).toBe(201);
    expect((await get('/api/menu/precios-horario', mesero)).body).toHaveLength(1);
    globalThis.reglaHappy = r.body;
  });

  it('el listado trae el precio vigente solo del producto de la oferta y mientras rige', async () => {
    let lista = (await get('/api/productos')).body;
    expect(lista.find((p) => p.id === cerveza.id)).toMatchObject({ precio_vigente: 5000, promo_nombre: 'Happy hour', precio_unitario: '10000.00' });
    expect(lista.find((p) => p.id === ctx.producto.id).precio_vigente).toBeUndefined();

    // fuera de la franja (empieza dentro de 2 h)
    await put(`/api/menu/precios-horario/${globalThis.reglaHappy.id}`, { hora_inicio: enHoras(2), hora_fin: enHoras(3) });
    lista = (await get('/api/productos')).body;
    expect(lista.find((p) => p.id === cerveza.id).precio_vigente).toBeUndefined();
    // apagada
    await put(`/api/menu/precios-horario/${globalThis.reglaHappy.id}`, { hora_inicio: '00:00', hora_fin: '23:59', activo: false });
    expect((await get('/api/productos')).body.find((p) => p.id === cerveza.id).precio_vigente).toBeUndefined();
    await put(`/api/menu/precios-horario/${globalThis.reglaHappy.id}`, { activo: true });
  });

  it('una cuenta conserva el precio con que se pidió y el cobro lo respeta (con la oferta ya vencida)', async () => {
    cuenta = (await post('/api/cuentas', { mesaId: mesa.id })).body;
    const res = await post(`/api/cuentas/${cuenta.id}/items`, { productoId: cerveza.id, cantidad: 2 });
    expect(res.status).toBe(201);
    expect(res.body.items[0]).toMatchObject({ precio_unitario: 5000, precio_lista: 10000, promo: 'Happy hour', subtotal: 10000 });
    expect(res.body.totales.total).toBe(10000);

    // La oferta termina antes de cobrar: el ítem sigue valiendo lo que se pidió.
    await put(`/api/menu/precios-horario/${globalThis.reglaHappy.id}`, { activo: false });
    const otra = await post(`/api/cuentas/${cuenta.id}/items`, { productoId: cerveza.id }); // ya sin oferta: precio de lista, otra línea
    expect(otra.body.items).toHaveLength(2);
    expect(otra.body.totales.total).toBe(20000);

    const cobro = await post(`/api/cuentas/${cuenta.id}/cobrar`, {});
    expect(cobro.status).toBe(201);
    expect(Number(cobro.body.venta.total)).toBe(20000);
    const detalles = await models.VentaDetalle.findAll({ where: { ventaId: cobro.body.venta.id }, order: [['id', 'ASC']] });
    expect(detalles.map((d) => [Number(d.precio_unitario), Number(d.precio_base)])).toEqual([[5000, 10000], [10000, 10000]]);
  });

  it('con la opción apagada el listado no trae ofertas y se cobra a precio de lista', async () => {
    await put(`/api/menu/precios-horario/${globalThis.reglaHappy.id}`, { activo: true });
    await opciones({ precios_horario: false });
    expect((await get('/api/menu/precios-horario')).status).toBe(403);
    expect((await get('/api/productos')).body.find((p) => p.id === cerveza.id).precio_vigente).toBeUndefined();
    const c = (await post('/api/cuentas', { mesaId: mesa.id })).body;
    const r = await post(`/api/cuentas/${c.id}/items`, { productoId: cerveza.id });
    expect(r.body.items[0]).toMatchObject({ precio_unitario: 10000, promo: null });
    await post(`/api/cuentas/${c.id}/cancelar`, { motivo: 'Prueba' });
  });

  it('se elimina; todo queda en la auditoría del módulo Menú', async () => {
    await opciones({ precios_horario: true });
    expect((await del(`/api/menu/precios-horario/${globalThis.reglaHappy.id}`)).status).toBe(200);
    expect((await get('/api/menu/precios-horario')).body).toEqual([]);
    expect((await del('/api/menu/precios-horario/99999')).status).toBe(404);
    const acciones = (await get('/api/auditoria?modulo=Men%C3%BA')).body.map((f) => f.accion);
    expect(acciones).toEqual(expect.arrayContaining([
      'Creó una categoría del menú', 'Reordenó las categorías del menú', 'Marcó un plato como agotado hoy', 'Creó una oferta por horario', 'Eliminó una oferta por horario',
    ]));
    olvidarOpciones(ctx.empresa.id);
  });
});
