'use strict';

const request = require('supertest');
const { resetDb, seedBase, activarModulos: activar, loginNuevoUsuario } = require('./helpers');
const { invalidateAllProfiles } = require('../../src/middlewares/auth');

let app; let models; let ctx; let agent; let mesero; let producto2;
const conEmpresa = (r) => r.set('X-Empresa-Id', String(ctx.empresa.id));
const activarModulos = (extra = []) => activar(models, ctx.empresa, invalidateAllProfiles, extra);

beforeAll(async () => {
  await resetDb();
  app = require('../../src/app');
  models = require('../../src/models');
  ctx = await seedBase(models);
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ username: 'fadmin', contrasena: 'Clave1234' })).status).toBe(200);
  mesero = (await loginNuevoUsuario(request, app, models, ctx.empresa, { username: 'mesero1', nombre: 'Mesero Uno' })).agent;
  await activarModulos(['Mesas', 'Cocina', 'Recetas']);
});

afterAll(async () => { await models.sequelize.close(); });

const get = (url, quien = agent) => conEmpresa(quien.get(url));
const post = (url, body = {}, quien = agent) => conEmpresa(quien.post(url)).send(body);
/** Envía a cocina; con una sola estación devuelve esa comanda como cuerpo (y `todas` con todas las creadas). */
const enviar = async (cuentaId, quien = agent) => {
  const r = await post(`/api/cuentas/${cuentaId}/enviar`, {}, quien);
  if (r.status !== 201) return r;
  return { status: r.status, body: { ...r.body.comandas[0], todas: r.body.comandas } };
};
const stockDe = async (id) => Number((await models.Producto.findByPk(id)).stock_actual);

describe('Mesas', () => {
  it('sin el módulo no se puede entrar', async () => {
    await activarModulos([]);
    expect((await get('/api/mesas')).status).toBe(403);
    expect((await get('/api/cuentas')).status).toBe(403);
    expect((await get('/api/comandas')).status).toBe(403);
    await activarModulos(['Mesas', 'Cocina', 'Recetas']);
  });

  it('Mesas exige Ventas y Cocina exige Mesas (módulos amarrados)', async () => {
    const res = await get('/api/modulos');
    expect(res.status).toBe(200);
    const mesas = res.body.find((m) => m.nombre_codigo === 'Mesas');
    const cocina = res.body.find((m) => m.nombre_codigo === 'Cocina');
    expect(mesas.requiere).toEqual(['Ventas']);
    expect(cocina.requiere).toEqual(['Mesas']);
  });

  it('el administrador crea mesas; un nombre repetido y un operativo se rechazan', async () => {
    const m1 = await post('/api/mesas', { nombre: 'Mesa 1', capacidad: 4 });
    expect(m1.status).toBe(201);
    expect((await post('/api/mesas', { nombre: 'Mesa 2' })).status).toBe(201);
    expect((await post('/api/mesas', { nombre: 'Mesa 1' })).status).toBe(400);
    expect((await post('/api/mesas', { nombre: 'Barra' })).status).toBe(201);
    expect((await post('/api/mesas', { nombre: 'Intrusa' }, mesero)).status).toBe(403);
    const lista = (await get('/api/mesas', mesero)).body;
    expect(lista.mesas.map((m) => m.nombre)).toEqual(['Barra', 'Mesa 1', 'Mesa 2']);
    expect(lista.mesas.every((m) => m.cuenta === null)).toBe(true);
    expect(lista.sin_mesa).toEqual([]);
  });

  it('desactivar una mesa la oculta del tablero', async () => {
    const barra = await models.Mesa.findOne({ where: { nombre: 'Barra' } });
    const res = await conEmpresa(agent.put(`/api/mesas/${barra.id}`)).send({ activa: false });
    expect(res.status).toBe(200);
    expect((await get('/api/mesas')).body.mesas.map((m) => m.nombre)).toEqual(['Mesa 1', 'Mesa 2']);
    expect((await get('/api/mesas?todas=1')).body.mesas).toHaveLength(3);
    expect((await post('/api/cuentas', { mesaId: barra.id })).status).toBe(400); // inactiva
    await conEmpresa(agent.put(`/api/mesas/${barra.id}`)).send({ activa: true });
  });
});

describe('Cuentas abiertas, pedidos y comandas', () => {
  let mesa1; let mesa2; let cuenta; let gaseosa; let pizza; let tomate; let sinCebolla;
  const crear = (body) => conEmpresa(agent.post('/api/productos')).send({ precio_unitario: 1000, porcentaje_iva: 0, ...body });
  const agregar = (cuentaId, body, quien = agent) => post(`/api/cuentas/${cuentaId}/items`, body, quien);
  const itemDe = (c, pId) => c.items.find((i) => i.productoId === pId && i.estado === 'ACTIVO');

  beforeAll(async () => {
    mesa1 = await models.Mesa.findOne({ where: { nombre: 'Mesa 1' } });
    mesa2 = await models.Mesa.findOne({ where: { nombre: 'Mesa 2' } });
    gaseosa = (await crear({ codigo: 'GAS', nombre_producto: 'Gaseosa', precio_unitario: 3000, stock_actual: 10 })).body;
    tomate = (await crear({ codigo: 'TOM', nombre_producto: 'Tomate', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 1000, costo_promedio: 1 })).body;
    pizza = (await crear({
      codigo: 'PIZ', nombre_producto: 'Pizza', tipo: 'RECETA', precio_unitario: 20000, receta: [{ insumoId: tomate.id, cantidad: 100 }],
    })).body;
    sinCebolla = (await conEmpresa(agent.post('/api/modificadores')).send({ nombre: 'Extra queso', precio_extra: 2000, items: [{ insumoId: tomate.id, cantidad: 10 }] })).body;
    producto2 = gaseosa;
  });

  it('abre una cuenta en una mesa; la misma mesa no admite otra abierta', async () => {
    const res = await post('/api/cuentas', { mesaId: mesa1.id, comensales: 3 });
    expect(res.status).toBe(201);
    cuenta = res.body;
    expect(cuenta).toMatchObject({ estado: 'ABIERTA', nombre: 'Mesa 1', comensales: 3 });
    expect(cuenta.items).toEqual([]);
    const otra = await post('/api/cuentas', { mesaId: mesa1.id });
    expect(otra.status).toBe(400);
    expect(otra.body.error).toMatch(/ya tiene una cuenta abierta/);
  });

  it('una cuenta sin mesa (para llevar) pide una etiqueta', async () => {
    expect((await post('/api/cuentas', {})).status).toBe(400);
    const res = await post('/api/cuentas', { etiqueta: 'Para llevar · Juan' });
    expect(res.status).toBe(201);
    expect(res.body.nombre).toBe('Para llevar · Juan');
    const tablero = (await get('/api/mesas')).body;
    expect(tablero.sin_mesa).toHaveLength(1);
    await post(`/api/cuentas/${res.body.id}/cancelar`, { motivo: 'Prueba' });
  });

  it('agrega pedidos: suma los iguales, valora con el precio del catálogo y exige platos para los extras', async () => {
    await agregar(cuenta.id, { productoId: gaseosa.id, cantidad: 2 }, mesero);
    const mas = await agregar(cuenta.id, { productoId: gaseosa.id }, mesero); // +1 sobre la misma línea
    expect(mas.status).toBe(201);
    expect(itemDe(mas.body, gaseosa.id)).toMatchObject({ cantidad: 3, precio_unitario: 3000, subtotal: 9000 });
    expect(mas.body.items).toHaveLength(1);

    const plato = await agregar(cuenta.id, { productoId: pizza.id, cantidad: 1, modificadores: [sinCebolla.id], nota: 'Sin cebolla' });
    expect(plato.status).toBe(201);
    const p = itemDe(plato.body, pizza.id);
    expect(p).toMatchObject({ precio_unitario: 22000, subtotal: 22000, nota: 'Sin cebolla', tipo: 'RECETA' });
    expect(p.modificadores).toEqual([{ id: sinCebolla.id, nombre: 'Extra queso', precio_extra: 2000 }]);
    expect(plato.body.totales).toEqual({ total: 31000, cobrado: 0, pendiente: 31000 });

    // el mismo plato con otros extras o nota es otra línea
    const otra = await agregar(cuenta.id, { productoId: pizza.id, cantidad: 1 });
    expect(otra.body.items.filter((i) => i.productoId === pizza.id)).toHaveLength(2);
    // limpiar: quitar la pizza sin extras
    const sobrante = otra.body.items.find((i) => i.productoId === pizza.id && !i.nota);
    expect((await conEmpresa(agent.delete(`/api/cuentas/${cuenta.id}/items/${sobrante.id}`))).status).toBe(200);

    expect((await agregar(cuenta.id, { productoId: tomate.id })).status).toBe(400); // un insumo no se vende
    expect((await agregar(cuenta.id, { productoId: gaseosa.id, modificadores: [sinCebolla.id] })).status).toBe(400);
    expect((await agregar(cuenta.id, { productoId: gaseosa.id, servicioId: ctx.servicio.id })).status).toBe(400);
    expect((await agregar(cuenta.id, { productoId: 99999 })).status).toBe(400);
    expect((await agregar(cuenta.id, {})).status).toBe(400);
  });

  it('un servicio también se puede pedir', async () => {
    const res = await agregar(cuenta.id, { servicioId: ctx.servicio.id });
    expect(res.status).toBe(201);
    const serv = res.body.items.find((i) => i.servicioId === ctx.servicio.id);
    expect(serv).toMatchObject({ nombre: 'Instalación', tipo: 'SERVICIO' });
    await conEmpresa(agent.delete(`/api/cuentas/${cuenta.id}/items/${serv.id}`));
  });

  it('edita cantidad y nota de lo que aún no se envió; no toca el inventario', async () => {
    const c = (await get(`/api/cuentas/${cuenta.id}`)).body;
    const item = itemDe(c, gaseosa.id);
    const res = await conEmpresa(agent.patch(`/api/cuentas/${cuenta.id}/items/${item.id}`)).send({ cantidad: 4, nota: 'Bien fría' });
    expect(res.status).toBe(200);
    expect(itemDe(res.body, gaseosa.id)).toMatchObject({ cantidad: 4, nota: 'Bien fría' });
    expect(await stockDe(gaseosa.id)).toBe(10); // el inventario se descuenta al COBRAR
    await conEmpresa(agent.patch(`/api/cuentas/${cuenta.id}/items/${item.id}`)).send({ cantidad: 3, nota: null });
  });

  it('enviar a cocina crea la comanda con lo pendiente; sin nada nuevo se rechaza', async () => {
    const res = await enviar(cuenta.id, mesero);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ estado: 'PENDIENTE', cuenta: 'Mesa 1', mesero: 'Mesero Uno' });
    expect(res.body.items.map((i) => [i.nombre, i.cantidad])).toEqual([['Gaseosa', 3], ['Pizza', 1]]);
    expect(res.body.items[1]).toMatchObject({ modificadores: ['Extra queso'], nota: 'Sin cebolla' });

    const vacio = await enviar(cuenta.id);
    expect(vacio.status).toBe(400);
    expect(vacio.body.error).toMatch(/No hay ítems nuevos/);

    // lo nuevo va en otra comanda, sin repetir lo ya enviado
    await agregar(cuenta.id, { productoId: gaseosa.id, cantidad: 1 });
    const segunda = await enviar(cuenta.id);
    expect(segunda.status).toBe(201);
    expect(segunda.body.items.map((i) => [i.nombre, i.cantidad])).toEqual([['Gaseosa', 1]]);
    const c = (await get(`/api/cuentas/${cuenta.id}`)).body;
    expect(c.comandas).toHaveLength(2);
    expect(c.items.every((i) => i.enviado)).toBe(true);
  });

  it('lo enviado ya no se edita ni se borra; anularlo exige permiso y motivo', async () => {
    const c = (await get(`/api/cuentas/${cuenta.id}`)).body;
    const pz = itemDe(c, pizza.id);
    expect((await conEmpresa(agent.patch(`/api/cuentas/${cuenta.id}/items/${pz.id}`)).send({ cantidad: 2 })).status).toBe(400);
    expect((await conEmpresa(agent.delete(`/api/cuentas/${cuenta.id}/items/${pz.id}`))).status).toBe(400);
    expect((await post(`/api/cuentas/${cuenta.id}/items/${pz.id}/anular`, { motivo: 'Se demoró' }, mesero)).status).toBe(403);
    expect((await post(`/api/cuentas/${cuenta.id}/items/${pz.id}/anular`, { motivo: '' })).status).toBe(400);
  });

  it('el administrador anula un ítem enviado: queda tachado en la comanda y no cuenta en el total', async () => {
    // se agrega una segunda pizza, se envía y se anula
    await agregar(cuenta.id, { productoId: pizza.id, cantidad: 1 });
    const envio = await enviar(cuenta.id);
    const nuevo = envio.body.items[0];
    const res = await post(`/api/cuentas/${cuenta.id}/items/${nuevo.id}/anular`, { motivo: 'El cliente se arrepintió' });
    expect(res.status).toBe(200);
    expect(res.body.items.find((i) => i.id === nuevo.id)).toMatchObject({ estado: 'ANULADO', motivo_anulacion: 'El cliente se arrepintió' });
    expect(res.body.totales.total).toBe(31000 + 3000); // 4 gaseosas + 1 pizza con extra
    const comanda = (await get(`/api/comandas/${envio.body.id}`)).body;
    expect(comanda.items[0].anulado).toBe(true);
  });

  it('cocina ve las comandas pendientes y las marca listas; el mesero las entrega', async () => {
    const lista = (await get('/api/comandas')).body;
    expect(lista.length).toBe(3);
    expect(lista[0].enviada_en <= lista[1].enviada_en).toBe(true); // las más antiguas primero
    const id = lista[0].id;
    const lista1 = await post(`/api/comandas/${id}/estado`, { estado: 'LISTA' });
    expect(lista1.body.estado).toBe('LISTA');
    expect(lista1.body.lista_en).toBeTruthy();
    const entregada = await post(`/api/comandas/${id}/estado`, { estado: 'ENTREGADA' }, mesero);
    expect(entregada.body.estado).toBe('ENTREGADA');
    expect((await get('/api/comandas')).body.map((c) => c.id)).not.toContain(id);
    expect((await get('/api/comandas?estado=ENTREGADA')).body.map((c) => c.id)).toContain(id);
    expect((await post(`/api/comandas/${id}/estado`, { estado: 'COCINANDO' })).status).toBe(400);
    expect((await post('/api/comandas/99999/estado', { estado: 'LISTA' })).status).toBe(404);
  });

  it('las comandas de cada empresa son privadas y el tablero muestra el estado de la cocina', async () => {
    const tablero = (await get('/api/mesas')).body;
    const m1 = tablero.mesas.find((m) => m.nombre === 'Mesa 1');
    expect(m1.cuenta).toMatchObject({ id: cuenta.id, nombre: 'Mesa 1', total: 34000 });
    expect(m1.cuenta.comandas_pendientes).toBe(2);
    expect(m1.cuenta.por_enviar).toBe(0);
    expect(tablero.mesas.find((m) => m.nombre === 'Mesa 2').cuenta).toBeNull();
  });

  it('cambia la cuenta de mesa solo a una mesa libre', async () => {
    const otra = (await post('/api/cuentas', { mesaId: mesa2.id })).body;
    expect((await post(`/api/cuentas/${cuenta.id}/mover`, { mesaId: mesa2.id })).status).toBe(400); // ocupada
    expect((await post(`/api/cuentas/${cuenta.id}/mover`, { mesaId: mesa1.id })).status).toBe(400); // la misma
    const mesa3 = (await post('/api/mesas', { nombre: 'Mesa 3' })).body;
    const res = await post(`/api/cuentas/${cuenta.id}/mover`, { mesaId: mesa3.id });
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Mesa 3');
    await post(`/api/cuentas/${cuenta.id}/mover`, { mesaId: mesa1.id });
    await post(`/api/cuentas/${otra.id}/cancelar`, { motivo: 'Prueba' });
  });
});

describe('Cobro, división de cuenta y propina', () => {
  let cuenta; let mesa; let cerveza; let hamburguesa; let carne;
  const crear = (body) => conEmpresa(agent.post('/api/productos')).send({ precio_unitario: 1000, porcentaje_iva: 0, ...body });
  const agregar = (id, body) => post(`/api/cuentas/${id}/items`, body);
  const cobrar = (id, body = {}) => post(`/api/cuentas/${id}/cobrar`, body);

  beforeAll(async () => {
    cerveza = (await crear({ codigo: 'CER', nombre_producto: 'Cerveza', precio_unitario: 5000, stock_actual: 20 })).body;
    carne = (await crear({ codigo: 'CAR', nombre_producto: 'Carne', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 1000, costo_promedio: 10 })).body;
    hamburguesa = (await crear({
      codigo: 'HAM', nombre_producto: 'Hamburguesa', tipo: 'RECETA', precio_unitario: 18000, receta: [{ insumoId: carne.id, cantidad: 200 }],
    })).body;
    mesa = (await post('/api/mesas', { nombre: 'Mesa 9' })).body;
    cuenta = (await post('/api/cuentas', { mesaId: mesa.id, comensales: 2 })).body;
    await agregar(cuenta.id, { productoId: cerveza.id, cantidad: 2 });
    await agregar(cuenta.id, { productoId: hamburguesa.id, cantidad: 2 });
  });

  it('cobrar solo una parte: ítems elegidos, una unidad de una línea de varias, con propina', async () => {
    const c = (await get(`/api/cuentas/${cuenta.id}`)).body;
    const ham = c.items.find((i) => i.productoId === hamburguesa.id);
    const cer = c.items.find((i) => i.productoId === cerveza.id);
    const res = await cobrar(cuenta.id, {
      items: [{ itemId: ham.id, cantidad: 1 }, { itemId: cer.id, cantidad: 1 }], clienteId: ctx.cliente.id, propina: 2300, medio_pago: '10',
    });
    expect(res.status).toBe(201);
    expect(res.body.cuenta_cerrada).toBe(false);
    expect(Number(res.body.venta.total)).toBe(23000); // 18.000 + 5.000, sin la propina
    expect(Number(res.body.venta.propina)).toBe(2300);
    expect(res.body.venta.cuentaId).toBe(cuenta.id);
    expect(res.body.cuenta.estado).toBe('ABIERTA');
    expect(res.body.cuenta.totales).toEqual({ total: 46000, cobrado: 23000, pendiente: 23000 });
    // lo que quedó pendiente: 1 hamburguesa + 1 cerveza (en ítems nuevos, la parte cobrada quedó ligada a la venta)
    const pend = res.body.cuenta.items.filter((i) => !i.ventaId);
    expect(pend.map((i) => [i.nombre, i.cantidad]).sort()).toEqual([['Cerveza', 1], ['Hamburguesa', 1]]);
    // el inventario salió al cobrar, solo de lo cobrado
    expect(await stockDe(cerveza.id)).toBe(19);
    expect(await stockDe(carne.id)).toBe(800);
    expect(res.body.cuenta.ventas).toHaveLength(1);
  });

  it('la propina no es ingreso: no entra al total de la venta ni a los informes', async () => {
    const venta = await models.Venta.findOne({ where: { cuentaId: cuenta.id } });
    expect(Number(venta.total)).toBe(23000);
    const detalle = await conEmpresa(agent.get(`/api/ventas/${venta.id}`));
    expect(Number(detalle.body.propina)).toBe(2300);
  });

  it('cobra el resto, cierra la cuenta y rechaza cobrar de nuevo', async () => {
    const res = await cobrar(cuenta.id, { descuento_global: 10 });
    expect(res.status).toBe(201);
    expect(Number(res.body.venta.total)).toBe(20700); // (18.000 + 5.000) − 10 %
    expect(res.body.cuenta_cerrada).toBe(true);
    expect(res.body.cuenta.estado).toBe('COBRADA');
    expect(res.body.cuenta.ventas).toHaveLength(2);
    expect(await stockDe(cerveza.id)).toBe(18);
    expect(await stockDe(carne.id)).toBe(600);
    expect((await cobrar(cuenta.id)).status).toBe(400);
    expect((await agregar(cuenta.id, { productoId: cerveza.id })).status).toBe(400); // ya cobrada
    expect((await get('/api/mesas')).body.mesas.find((m) => m.id === mesa.id).cuenta).toBeNull(); // la mesa quedó libre
  });

  it('valida lo que se cobra: ítems ajenos, cantidades de más y repetidos', async () => {
    const c2 = (await post('/api/cuentas', { mesaId: mesa.id })).body;
    await agregar(c2.id, { productoId: cerveza.id, cantidad: 2 });
    const item = (await get(`/api/cuentas/${c2.id}`)).body.items[0];
    expect((await cobrar(c2.id, { items: [{ itemId: item.id, cantidad: 3 }] })).status).toBe(400);
    expect((await cobrar(c2.id, { items: [{ itemId: 99999, cantidad: 1 }] })).status).toBe(400);
    expect((await cobrar(c2.id, { items: [{ itemId: item.id, cantidad: 1 }, { itemId: item.id, cantidad: 1 }] })).status).toBe(400);
    expect((await cobrar(c2.id, { propina: -5 })).status).toBe(400);
    expect(await stockDe(cerveza.id)).toBe(18); // nada se descontó

    // sin stock suficiente, el cobro falla completo y la cuenta sigue intacta
    await models.Producto.update({ stock_actual: 1 }, { where: { id: cerveza.id } });
    const falla = await cobrar(c2.id);
    expect(falla.status).toBe(400);
    expect(falla.body.error).toMatch(/Stock insuficiente: Cerveza/);
    const intacta = (await get(`/api/cuentas/${c2.id}`)).body;
    expect(intacta.estado).toBe('ABIERTA');
    expect(intacta.items.every((i) => !i.ventaId)).toBe(true);
    expect(await models.Venta.count({ where: { cuentaId: c2.id } })).toBe(0);
    await models.Producto.update({ stock_actual: 18 }, { where: { id: cerveza.id } });
    await post(`/api/cuentas/${c2.id}/cancelar`, { motivo: 'Prueba' });
  });

  it('a crédito necesita cliente y el módulo de cartera', async () => {
    const c3 = (await post('/api/cuentas', { mesaId: mesa.id })).body;
    await agregar(c3.id, { productoId: cerveza.id });
    expect((await cobrar(c3.id, { forma_pago: '2' })).status).toBe(400); // sin cliente
    const ok = await cobrar(c3.id, { forma_pago: '2', clienteId: ctx.cliente.id, dias_credito: 15 });
    expect(ok.status).toBe(201);
    expect(Number(ok.body.venta.saldo_pendiente)).toBe(5000);
    expect(ok.body.cuenta_cerrada).toBe(true);
  });

  it('cancelar: una cuenta con pedidos enviados solo la cancela quien puede anularlos; una cobrada en parte, nadie', async () => {
    const c4 = (await post('/api/cuentas', { mesaId: mesa.id })).body;
    await agregar(c4.id, { productoId: cerveza.id });
    await enviar(c4.id);
    expect((await post(`/api/cuentas/${c4.id}/cancelar`, { motivo: 'Se fueron' }, mesero)).status).toBe(403);
    const res = await post(`/api/cuentas/${c4.id}/cancelar`, { motivo: 'Se fueron sin pedir' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'CANCELADA', motivo_cancelacion: 'Se fueron sin pedir' });
    expect(res.body.items.every((i) => i.estado === 'ANULADO')).toBe(true);
    const comandas = (await get('/api/comandas')).body.filter((c) => c.cuentaId === c4.id);
    expect(comandas[0].cuenta_estado).toBe('CANCELADA'); // cocina se entera

    const c5 = (await post('/api/cuentas', { mesaId: mesa.id })).body;
    await agregar(c5.id, { productoId: cerveza.id, cantidad: 2 });
    const it = (await get(`/api/cuentas/${c5.id}`)).body.items[0];
    await cobrar(c5.id, { items: [{ itemId: it.id, cantidad: 1 }] });
    expect((await post(`/api/cuentas/${c5.id}/cancelar`, { motivo: 'Cambio de opinión' })).status).toBe(400);
    await cobrar(c5.id);
  });

  it('un cajero distinto del mesero puede cobrar la cuenta', async () => {
    const c6 = (await post('/api/cuentas', { mesaId: mesa.id }, mesero)).body;
    await agregar(c6.id, { productoId: cerveza.id });
    const res = await cobrar(c6.id, {}); // lo cobra el administrador
    expect(res.status).toBe(201);
    expect(res.body.venta.usuarioId).not.toBe(c6.mesero.id);
  });

  it('la auditoría cuenta lo ocurrido con frases de mesa', async () => {
    const res = await get('/api/auditoria?modulo=Mesas');
    expect(res.status).toBe(200);
    const acciones = res.body.map((f) => f.accion);
    expect(acciones).toEqual(expect.arrayContaining(['Envió una comanda a cocina', 'Anuló un pedido ya enviado a cocina', 'Canceló una cuenta', 'Creó una mesa']));
    const ventas = (await get('/api/auditoria?modulo=Ventas')).body.map((f) => f.descripcion);
    expect(ventas.some((d) => /Mesa 9 · propina/.test(d))).toBe(true);
  });
});

describe('Propina y caja', () => {
  let mesa; let bebida;
  const crear = (body) => conEmpresa(agent.post('/api/productos')).send({ precio_unitario: 1000, porcentaje_iva: 0, ...body });
  const cerrarCajas = async () => {
    await models.Caja.update({ estado: 'CERRADA', fecha_cierre: new Date(), monto_contado: 0, efectivo_esperado: 0, diferencia: 0, num_ventas: 0, total_ventas: 0 }, { where: { estado: 'ABIERTA' } });
  };

  beforeAll(async () => {
    await cerrarCajas();
    await activarModulos(['Mesas', 'Cocina', 'Recetas', 'Caja']);
    bebida = (await crear({ codigo: 'BEB', nombre_producto: 'Jugo', precio_unitario: 4000, stock_actual: 50 })).body;
    mesa = (await post('/api/mesas', { nombre: 'Mesa Caja' })).body;
  });
  afterAll(async () => { await cerrarCajas(); await activarModulos(['Mesas', 'Cocina', 'Recetas']); });

  const cuentaConJugo = async (cantidad = 2) => {
    const c = (await post('/api/cuentas', { mesaId: mesa.id })).body;
    await post(`/api/cuentas/${c.id}/items`, { productoId: bebida.id, cantidad });
    return c;
  };

  it('con el módulo Caja, cobrar exige caja abierta', async () => {
    const c = await cuentaConJugo();
    const res = await post(`/api/cuentas/${c.id}/cobrar`, {});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/abrir caja/);
    expect((await get(`/api/cuentas/${c.id}`)).body.estado).toBe('ABIERTA');
  });

  it('la propina en efectivo suma al efectivo esperado pero no a las ventas; se entrega sin tocar el balance', async () => {
    const caja = (await post('/api/caja/abrir', { monto_inicial: 10000 })).body;
    const c = (await get('/api/cuentas')).body.find((x) => x.mesaId === mesa.id);
    const res = await post(`/api/cuentas/${c.id}/cobrar`, { propina: 1000 });
    expect(res.status).toBe(201);
    expect(res.body.venta.cajaId).toBe(caja.id);

    const actual = (await get('/api/caja/actual')).body;
    expect(actual.resumen.total_ventas).toBe(8000);
    expect(actual.resumen.propinas_efectivo).toBe(1000);
    expect(actual.resumen.efectivo_esperado).toBe(10000 + 8000 + 1000);

    const balanceAntes = (await get('/api/caja/balance')).body;
    const entrega = await post('/api/caja/retiros', { tipo: 'PROPINA', concepto: 'Propinas del turno', monto: 1000 });
    expect(entrega.status).toBe(201);
    expect(entrega.body.tipo).toBe('PROPINA');
    const balanceDespues = (await get('/api/caja/balance')).body;
    expect(balanceDespues.acumulado.retiros).toBe(balanceAntes.acumulado.retiros); // no es un retiro de la empresa
    expect(balanceDespues.dinero_actual).toBe(balanceAntes.dinero_actual);
    expect((await get('/api/caja/actual')).body.resumen.efectivo_esperado).toBe(18000);

    // sin tipo sigue siendo un retiro de la empresa
    const retiro = await post('/api/caja/retiros', { concepto: 'Consignación', monto: 500 });
    expect(retiro.body.tipo).toBe('RETIRO');
  });

  it('el cierre guarda la propina en efectivo del turno', async () => {
    const actual = (await get('/api/caja/actual')).body;
    const cierre = await post(`/api/caja/${actual.id}/cerrar`, { monto_contado: 17500 });
    expect(cierre.status).toBe(200);
    expect(cierre.body.resumen.propinas_efectivo).toBe(1000);
    expect(cierre.body.resumen.efectivo_esperado).toBe(17500);
    expect(cierre.body.diferencia).toBeDefined();
  });

  it('anular una venta con propina de una caja ya cerrada devuelve venta + propina', async () => {
    const venta = await models.Venta.findOne({ where: { propina: 1000 } });
    await post('/api/caja/abrir', { monto_inicial: 50000 });
    const res = await post(`/api/ventas/${venta.id}/anular`, { motivo: 'Error en la mesa' });
    expect(res.status).toBe(200);
    const mov = await models.CajaMovimiento.findOne({ where: { ventaId: venta.id, tipo: 'DEVOLUCION' } });
    expect(Number(mov.monto)).toBe(9000); // 8.000 + 1.000 de propina
  });
});
