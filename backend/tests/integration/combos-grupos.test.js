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
const del = (url, quien = agent) => conEmpresa(quien.delete(url));
const crear = (body) => post('/api/productos', { precio_unitario: 1000, porcentaje_iva: 0, ...body });
const opciones = (valores) => put('/api/opciones', { valores });
const stockDe = async (id) => Number((await models.Producto.findByPk(id)).stock_actual);
const MODULOS = ['Mesas', 'Cocina', 'Recetas'];

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

describe('Combos', () => {
  let tomate; let pizza; let gaseosa; let combo;
  const vender = (productoId, cantidad, extra = {}) => post('/api/ventas', { clienteId: ctx.cliente.id, detalles: [{ productoId, cantidad, precio_unitario: 25000, precio_base: 25000, ...extra }] });

  beforeAll(async () => {
    tomate = (await crear({ codigo: 'TOM', nombre_producto: 'Tomate', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 1000, costo_promedio: 2 })).body;
    pizza = (await crear({ codigo: 'PIZ', nombre_producto: 'Pizza', tipo: 'RECETA', precio_unitario: 20000, receta: [{ insumoId: tomate.id, cantidad: 100 }] })).body;
    gaseosa = (await crear({ codigo: 'GAS', nombre_producto: 'Gaseosa', precio_unitario: 4000, stock_actual: 10, costo_promedio: 1500 })).body;
  });

  it('con la opción apagada no se pueden crear ni vender combos', async () => {
    const r = await crear({ codigo: 'CMB', nombre_producto: 'Combo', tipo: 'COMBO', precio_unitario: 25000, combo: [{ productoId: pizza.id, cantidad: 1 }, { productoId: gaseosa.id, cantidad: 1 }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/combos no están activados/);
  });

  it('se crea con sus componentes y las validaciones lo protegen', async () => {
    await opciones({ combos: true });
    const base = { codigo: 'CMB', nombre_producto: 'Almuerzo', tipo: 'COMBO', precio_unitario: 25000 };
    expect((await crear({ ...base, combo: [{ productoId: pizza.id, cantidad: 1 }] })).status).toBe(400); // al menos dos
    expect((await crear({ ...base, combo: [{ productoId: pizza.id, cantidad: 1 }, { productoId: pizza.id, cantidad: 2 }] })).status).toBe(400); // repetido
    expect((await crear({ ...base, combo: [{ productoId: pizza.id, cantidad: 1 }, { productoId: tomate.id, cantidad: 1 }] })).status).toBe(400); // un insumo
    expect((await crear({ ...base, combo: [{ productoId: pizza.id, cantidad: 1 }, { productoId: 99999, cantidad: 1 }] })).status).toBe(400);
    const ok = await crear({ ...base, combo: [{ productoId: pizza.id, cantidad: 1 }, { productoId: gaseosa.id, cantidad: 1 }] });
    expect(ok.status).toBe(201);
    combo = ok.body;
    expect(Number(combo.stock_actual)).toBe(0);
    // un combo no puede ser componente de otro
    expect((await crear({ codigo: 'CMB2', nombre_producto: 'Mega', tipo: 'COMBO', precio_unitario: 40000, combo: [{ productoId: combo.id, cantidad: 1 }, { productoId: gaseosa.id, cantidad: 1 }] })).status).toBe(400);
  });

  it('el listado trae su disponibilidad, su costo y sus componentes', async () => {
    const c = (await get('/api/productos')).body.find((p) => p.id === combo.id);
    expect(c.disponible).toBe(10); // pizzas: 10; gaseosas: 10
    expect(c.porciones_disponibles).toBe(10);
    expect(c.costo).toBe(200 + 1500); // pizza = 100 g × $2; gaseosa = $1.500
    expect(c.combo.map((x) => [x.nombre, x.cantidad])).toEqual([['Pizza', 1], ['Gaseosa', 1]]);
    expect(c.margen).toBeDefined();
    expect(c.estado_stock).toBe('OK');
  });

  it('venderlo descuenta lo de todos sus componentes y guarda la foto del consumo', async () => {
    const res = await vender(combo.id, 2);
    expect(res.status).toBe(201);
    expect(Number(res.body.total)).toBe(50000);
    expect(await stockDe(tomate.id)).toBe(800);
    expect(await stockDe(gaseosa.id)).toBe(8);
    const det = await models.VentaDetalle.findOne({ where: { ventaId: res.body.id } });
    expect(Number(det.costo_unitario)).toBe(1700);
    expect(det.consumo.map((c) => [c.productoId, Number(c.cantidad)]).sort((a, b) => a[0] - b[0])).toEqual([[tomate.id, 200], [gaseosa.id, 2]]);
    globalThis.ventaCombo = res.body;
  });

  it('anularla devuelve todo; una devolución parcial reingresada también', async () => {
    const anulada = await post(`/api/ventas/${globalThis.ventaCombo.id}/anular`, { motivo: 'Error del cajero' });
    expect(anulada.status).toBe(200);
    expect(await stockDe(tomate.id)).toBe(1000);
    expect(await stockDe(gaseosa.id)).toBe(10);

    const v = (await vender(combo.id, 2)).body;
    const det = await models.VentaDetalle.findOne({ where: { ventaId: v.id } });
    const dev = await post(`/api/ventas/${v.id}/devoluciones`, { motivo: 'No lo quiso', items: [{ ventaDetalleId: det.id, cantidad: 1, reingresar: true }] });
    expect(dev.status).toBe(201);
    expect(await stockDe(tomate.id)).toBe(900);
    expect(await stockDe(gaseosa.id)).toBe(9);
    await post(`/api/ventas/${v.id}/devoluciones`, { motivo: 'Y el otro', items: [{ ventaDetalleId: det.id, cantidad: 1, reingresar: true }] });
  });

  it('si falta un componente la venta falla completa y no descuenta nada', async () => {
    await models.Producto.update({ stock_actual: 1 }, { where: { id: gaseosa.id } });
    const res = await vender(combo.id, 2);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Stock insuficiente de "Gaseosa" para preparar "Almuerzo"/);
    expect(await stockDe(tomate.id)).toBe(1000);
    expect((await get('/api/productos')).body.find((p) => p.id === combo.id).disponible).toBe(1);
    await models.Producto.update({ stock_actual: 10 }, { where: { id: gaseosa.id } });
  });

  it('no admite modificadores; no se compra, ni se pide, ni se ajusta; no se reabastece', async () => {
    const mod = (await post('/api/modificadores', { nombre: 'Extra', precio_extra: 500 })).body;
    expect((await vender(combo.id, 1, { modificadores: [mod.id] })).status).toBe(400);
    const compra = await post('/api/compras', { proveedorId: ctx.proveedor.id, detalles: [{ productoId: combo.id, cantidad: 1, costo_unitario: 100 }] });
    expect(compra.status).toBe(400);
    expect(compra.body.error).toMatch(/combo/);
    expect((await post('/api/ajustes', { productoId: combo.id, tipo: 'MERMA', cantidad: 1 })).status).toBe(400);
    const repo = (await get('/api/reposicion')).body;
    expect(repo.sugerencias.map((s) => s.productoId)).not.toContain(combo.id);
    expect(repo.alertas.map((a) => a.productoId)).not.toContain(combo.id);
  });

  it('se edita su lista de componentes; su tipo no cambia y sus componentes no cambian de tipo', async () => {
    const res = await put(`/api/productos/${combo.id}`, { combo: [{ productoId: pizza.id, cantidad: 2 }, { productoId: gaseosa.id, cantidad: 1 }] });
    expect(res.status).toBe(200);
    expect((await get('/api/productos')).body.find((p) => p.id === combo.id).combo.map((c) => c.cantidad)).toEqual([2, 1]);
    expect((await put(`/api/productos/${combo.id}`, { tipo: 'VENTA' })).status).toBe(400);
    const parte = await put(`/api/productos/${gaseosa.id}`, { tipo: 'INSUMO' });
    expect(parte.status).toBe(400);
    expect(parte.body.error).toMatch(/parte de un combo/);
    await put(`/api/productos/${combo.id}`, { combo: [{ productoId: pizza.id, cantidad: 1 }, { productoId: gaseosa.id, cantidad: 1 }] });
  });

  it('en una cuenta de mesa muestra de qué se compone y sale en la comanda; se cobra completo', async () => {
    const mesa = (await post('/api/mesas', { nombre: 'C1' })).body;
    const cuenta = (await post('/api/cuentas', { mesaId: mesa.id })).body;
    const res = await post(`/api/cuentas/${cuenta.id}/items`, { productoId: combo.id });
    expect(res.status).toBe(201);
    expect(res.body.items[0]).toMatchObject({ nombre: 'Almuerzo', tipo: 'COMBO', subtotal: 25000 });
    expect(res.body.items[0].componentes).toEqual([{ nombre: 'Pizza', cantidad: 1 }, { nombre: 'Gaseosa', cantidad: 1 }]);
    const env = await post(`/api/cuentas/${cuenta.id}/enviar`);
    expect(env.body.comandas[0].items[0].componentes).toHaveLength(2);
    const cobro = await post(`/api/cuentas/${cuenta.id}/cobrar`, {});
    expect(cobro.status).toBe(201);
    expect(Number(cobro.body.venta.total)).toBe(25000);
    expect(await stockDe(gaseosa.id)).toBe(9);
  });

  it('un componente marcado «agotado hoy» bloquea el combo; con los combos apagados no se vende', async () => {
    await opciones({ agotados_manuales: true });
    await post(`/api/menu/agotado/${gaseosa.id}`, { agotado: true });
    const r = await vender(combo.id, 1);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/agotado por hoy/);
    await post(`/api/menu/agotado/${gaseosa.id}`, { agotado: false });
    await opciones({ combos: false });
    const apagado = await vender(combo.id, 1);
    expect(apagado.status).toBe(400);
    expect(apagado.body.error).toMatch(/combos no están activados/);
    await opciones({ combos: true });
  });
});

describe('Grupos de modificadores obligatorios', () => {
  let carne; let pasta; let termino; let medio; let leche; let grupo;
  const agregar = (cuentaId, body) => post(`/api/cuentas/${cuentaId}/items`, body);

  beforeAll(async () => {
    const res = (await crear({ codigo: 'RES', nombre_producto: 'Res', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 5000, costo_promedio: 3 })).body;
    carne = (await crear({ codigo: 'CAR', nombre_producto: 'Carne', tipo: 'RECETA', precio_unitario: 30000, receta: [{ insumoId: res.id, cantidad: 200 }] })).body;
    pasta = (await crear({ codigo: 'PAS', nombre_producto: 'Pasta', tipo: 'RECETA', precio_unitario: 20000, receta: [{ insumoId: res.id, cantidad: 100 }] })).body;
    termino = (await post('/api/modificadores', { nombre: 'Término medio' })).body;
    medio = (await post('/api/modificadores', { nombre: 'Bien cocida' })).body;
    leche = (await post('/api/modificadores', { nombre: 'Extra salsa', precio_extra: 1000 })).body;
  });

  it('con la opción apagada no hay grupos y el grupo del modificador se ignora', async () => {
    expect((await get('/api/menu/grupos')).status).toBe(403);
    const m = await put(`/api/modificadores/${termino.id}`, { grupoId: 999 });
    expect(m.status).toBe(200);
    expect(m.body.grupoId).toBeNull();
  });

  it('crea el grupo obligatorio para la carne; valida platos, nombre y permisos', async () => {
    await opciones({ modificadores_grupos: true });
    expect((await post('/api/menu/grupos', { nombre: 'Punto', productoIds: [99999] })).status).toBe(400);
    expect((await post('/api/menu/grupos', { nombre: 'Punto', productoIds: [ctx.producto.id] })).status).toBe(400); // no es un plato
    expect((await post('/api/menu/grupos', { nombre: 'Intruso' }, mesero)).status).toBe(403);
    const g = await post('/api/menu/grupos', { nombre: 'Punto de cocción', obligatorio: true, max_selecciones: 1, productoIds: [carne.id] });
    expect(g.status).toBe(201);
    expect(g.body.productoIds).toEqual([carne.id]);
    grupo = g.body;
    expect((await post('/api/menu/grupos', { nombre: 'Punto de cocción' })).status).toBe(400); // repetido
    await put(`/api/modificadores/${termino.id}`, { grupoId: grupo.id });
    await put(`/api/modificadores/${medio.id}`, { grupoId: grupo.id });
    expect((await put(`/api/modificadores/${leche.id}`, { grupoId: 99999 })).status).toBe(400);
    expect((await get('/api/menu/grupos', mesero)).body).toHaveLength(1);
    expect((await get('/api/modificadores')).body.find((m) => m.id === termino.id).grupoId).toBe(grupo.id);
  });

  it('en una cuenta, el plato exige elegir y respeta el máximo; los demás platos no se afectan', async () => {
    const mesa = (await post('/api/mesas', { nombre: 'G1' })).body;
    const cuenta = (await post('/api/cuentas', { mesaId: mesa.id })).body;
    const sin = await agregar(cuenta.id, { productoId: carne.id });
    expect(sin.status).toBe(400);
    expect(sin.body.error).toMatch(/necesita que elijas punto de cocción/);
    expect((await agregar(cuenta.id, { productoId: carne.id, modificadores: [leche.id] })).status).toBe(400); // un extra suelto no cumple el grupo
    expect((await agregar(cuenta.id, { productoId: carne.id, modificadores: [termino.id, medio.id] })).body.error).toMatch(/máximo 1/);
    expect((await agregar(cuenta.id, { productoId: carne.id, modificadores: [termino.id, leche.id] })).status).toBe(201);
    expect((await agregar(cuenta.id, { productoId: pasta.id })).status).toBe(201); // la pasta no usa el grupo
    await post(`/api/cuentas/${cuenta.id}/cancelar`, { motivo: 'Prueba' });
  });

  it('el mostrador (POS) también lo exige; apagada la opción, no', async () => {
    const venta = (mods) => post('/api/ventas', { clienteId: ctx.cliente.id, detalles: [{ productoId: carne.id, cantidad: 1, precio_unitario: 30000, precio_base: 30000, modificadores: mods }] });
    const r = await venta([]);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/punto de cocción/);
    expect((await venta([termino.id])).status).toBe(201);
    await opciones({ modificadores_grupos: false });
    expect((await venta([])).status).toBe(201);
    await opciones({ modificadores_grupos: true });
  });

  it('cobrar una cuenta con lo que se pidió ANTES de activar la opción no se bloquea', async () => {
    await opciones({ modificadores_grupos: false });
    const mesa = (await post('/api/mesas', { nombre: 'G2' })).body;
    const cuenta = (await post('/api/cuentas', { mesaId: mesa.id })).body;
    expect((await agregar(cuenta.id, { productoId: carne.id })).status).toBe(201);
    await opciones({ modificadores_grupos: true });
    expect((await post(`/api/cuentas/${cuenta.id}/cobrar`, {})).status).toBe(201);
  });

  it('un grupo «para todos» aplica a cualquier plato; desactivarlo o eliminarlo libera los modificadores', async () => {
    const todos = (await post('/api/menu/grupos', { nombre: 'Tamaño', obligatorio: true, todos: true })).body;
    const grande = (await post('/api/modificadores', { nombre: 'Grande', grupoId: todos.id })).body;
    const mesa = (await post('/api/mesas', { nombre: 'G3' })).body;
    const cuenta = (await post('/api/cuentas', { mesaId: mesa.id })).body;
    expect((await agregar(cuenta.id, { productoId: pasta.id })).body.error).toMatch(/tamaño/);
    expect((await agregar(cuenta.id, { productoId: pasta.id, modificadores: [grande.id] })).status).toBe(201);
    expect((await put(`/api/menu/grupos/${todos.id}`, { activo: false })).status).toBe(200);
    expect((await agregar(cuenta.id, { productoId: pasta.id, cantidad: 2 })).status).toBe(201); // ya no exige
    expect((await del(`/api/menu/grupos/${todos.id}`)).status).toBe(200);
    expect((await get('/api/modificadores?todos=1')).body.find((m) => m.id === grande.id).grupoId).toBeNull();
    expect((await del('/api/menu/grupos/99999')).status).toBe(404);
    await post(`/api/cuentas/${cuenta.id}/cancelar`, { motivo: 'Prueba' });
    const acciones = (await get('/api/auditoria?modulo=Men%C3%BA')).body.map((f) => f.accion);
    expect(acciones).toEqual(expect.arrayContaining(['Creó un grupo de modificadores', 'Eliminó un grupo de modificadores']));
  });
});
