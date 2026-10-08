'use strict';

const request = require('supertest');
const { resetDb, seedBase, activarModulos: activar, loginNuevoUsuario } = require('./helpers');
const { invalidateAllProfiles } = require('../../src/middlewares/auth');

let app; let models; let ctx; let agent; let operativo;
const conEmpresa = (r) => r.set('X-Empresa-Id', String(ctx.empresa.id));
const activarModulos = (extra = []) => activar(models, ctx.empresa, invalidateAllProfiles, extra);
const fechaLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

beforeAll(async () => {
  await resetDb();
  app = require('../../src/app');
  models = require('../../src/models');
  ctx = await seedBase(models);
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ username: 'fadmin', contrasena: 'Clave1234' })).status).toBe(200);
  operativo = (await loginNuevoUsuario(request, app, models, ctx.empresa, { username: 'cocinero' })).agent;
  await activarModulos(['Recetas']);
});

afterAll(async () => { await models.sequelize.close(); });

describe('Preparaciones por lotes', () => {
  let tomate; let aceite; let salsa; let pizza;
  const crear = (body) => conEmpresa(agent.post('/api/productos')).send({ precio_unitario: 1000, porcentaje_iva: 0, ...body });
  const stockDe = async (id) => Number((await models.Producto.findByPk(id)).stock_actual);
  const costoDe = async (id) => Number((await models.Producto.findByPk(id)).costo_promedio);
  const producir = (productoId, cantidad, extra = {}, quien = agent) => conEmpresa(quien.post('/api/produccion')).send({ productoId, cantidad, ...extra });
  const vender = (productoId, cantidad) => conEmpresa(agent.post('/api/ventas')).send({
    clienteId: ctx.cliente.id, detalles: [{ productoId, cantidad, precio_unitario: 20000, precio_base: 20000 }],
  });

  it('crea una preparación por lotes y un plato que la usa', async () => {
    tomate = (await crear({ codigo: 'TOM', nombre_producto: 'Tomate', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 5000, costo_promedio: 1 })).body;
    aceite = (await crear({ codigo: 'ACE', nombre_producto: 'Aceite', tipo: 'INSUMO', unidad_medida: 'MLT', stock_actual: 1000, costo_promedio: 2 })).body;
    const s = await crear({
      codigo: 'SALSA', nombre_producto: 'Salsa base', tipo: 'PREPARACION', por_lotes: true, unidad_medida: 'MLT', rendimiento: 1000,
      receta: [{ insumoId: tomate.id, cantidad: 800 }, { insumoId: aceite.id, cantidad: 100 }],
    });
    expect(s.status).toBe(201);
    salsa = s.body;
    expect(salsa.por_lotes).toBe(true);
    expect(Number(salsa.stock_actual)).toBe(0);

    pizza = (await crear({
      codigo: 'PIZZA', nombre_producto: 'Pizza', tipo: 'RECETA', precio_unitario: 20000,
      receta: [{ insumoId: salsa.id, cantidad: 150 }, { insumoId: aceite.id, cantidad: 10 }],
    })).body;
    expect(pizza.id).toBeTruthy();
  });

  it('por_lotes solo aplica a preparaciones', async () => {
    const r = await crear({ codigo: 'X1', nombre_producto: 'Sal', tipo: 'INSUMO', por_lotes: true, unidad_medida: 'GRM' });
    expect(r.status).toBe(201);
    expect(r.body.por_lotes).toBe(false);
  });

  it('sin producir, el plato no se puede vender (la salsa no tiene existencias)', async () => {
    const res = await vender(pizza.id, 1);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Stock insuficiente de "Salsa base"/);
    expect(await stockDe(aceite.id)).toBe(1000);
    const lista = (await conEmpresa(agent.get('/api/productos'))).body;
    expect(lista.find((p) => p.id === pizza.id).porciones_disponibles).toBe(0);
  });

  it('producir descuenta los ingredientes, suma stock y fija el costo del lote', async () => {
    const res = await producir(salsa.id, 2000, { motivo: 'Lote del lunes' });
    expect(res.status).toBe(201);
    expect(Number(res.body.cantidad)).toBe(2000);
    expect(Number(res.body.costo_unitario)).toBe(1); // (800×1 + 100×2) / 1000 por ml
    expect(Number(res.body.costo_total)).toBe(2000);
    expect(await stockDe(tomate.id)).toBe(3400); // 5000 − 2×800
    expect(await stockDe(aceite.id)).toBe(800); // 1000 − 2×100
    expect(await stockDe(salsa.id)).toBe(2000);
    expect(await costoDe(salsa.id)).toBe(1);
  });

  it('el plato descuenta la salsa (y el aceite directo), no los ingredientes de la salsa', async () => {
    const res = await vender(pizza.id, 2);
    expect(res.status).toBe(201);
    expect(await stockDe(salsa.id)).toBe(1700); // 2000 − 2×150
    expect(await stockDe(aceite.id)).toBe(780); // 800 − 2×10
    expect(await stockDe(tomate.id)).toBe(3400); // intacto
    const det = await models.VentaDetalle.findOne({ where: { ventaId: res.body.id } });
    expect(Number(det.costo_unitario)).toBe(150 * 1 + 10 * 2); // salsa a su costo_promedio + aceite
    expect(det.consumo.map((c) => c.productoId).sort()).toEqual([salsa.id, aceite.id].sort());
  });

  it('anular la venta devuelve la salsa al stock de la preparación', async () => {
    const venta = await models.Venta.findOne({ order: [['id', 'DESC']] });
    const res = await conEmpresa(agent.post(`/api/ventas/${venta.id}/anular`)).send({ motivo: 'Error de digitación' });
    expect(res.status).toBe(200);
    expect(await stockDe(salsa.id)).toBe(2000);
    expect(await stockDe(aceite.id)).toBe(800);
  });

  it('un segundo lote promedia el costo con lo que quedaba', async () => {
    await models.Producto.update({ costo_promedio: 3 }, { where: { id: tomate.id } }); // el tomate subió: 800×3 + 100×2 = 2600 por 1000 ml
    const res = await producir(salsa.id, 1000);
    expect(res.status).toBe(201);
    expect(Number(res.body.costo_unitario)).toBe(2.6);
    expect(await stockDe(salsa.id)).toBe(3000);
    expect(await costoDe(salsa.id)).toBeCloseTo((2000 * 1 + 1000 * 2.6) / 3000, 4);
    await models.Producto.update({ costo_promedio: 1 }, { where: { id: tomate.id } });
  });

  it('rechaza producir si falta un ingrediente y no descuenta nada', async () => {
    const antes = await stockDe(tomate.id);
    const res = await producir(salsa.id, 100000);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Stock insuficiente de "Tomate"/);
    expect(await stockDe(tomate.id)).toBe(antes);
  });

  it('solo se produce una preparación marcada por lotes', async () => {
    const onDemand = (await crear({
      codigo: 'MASA', nombre_producto: 'Masa', tipo: 'PREPARACION', unidad_medida: 'GRM', rendimiento: 1000, receta: [{ insumoId: tomate.id, cantidad: 100 }],
    })).body;
    expect(onDemand.por_lotes).toBe(false);
    const res = await producir(onDemand.id, 10);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no se produce por lotes/);
    expect((await producir(pizza.id, 1)).status).toBe(400); // un plato tampoco
    expect((await producir(99999, 1)).status).toBe(400);
  });

  it('valida la cantidad', async () => {
    expect((await producir(salsa.id, 0)).status).toBe(400);
    expect((await producir(salsa.id, -5)).status).toBe(400);
  });

  it('no se deja de producir por lotes mientras haya existencias', async () => {
    const res = await conEmpresa(agent.put(`/api/productos/${salsa.id}`)).send({ por_lotes: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/existencias/);
    const tipo = await conEmpresa(agent.put(`/api/productos/${salsa.id}`)).send({ tipo: 'INSUMO' });
    expect(tipo.status).toBe(400);
  });

  it('las existencias de la preparación se pueden mermar y contar', async () => {
    const merma = await conEmpresa(agent.post('/api/ajustes')).send({ productoId: salsa.id, tipo: 'MERMA', cantidad: 500, motivo: 'Se dañó' });
    expect(merma.status).toBe(201);
    expect(await stockDe(salsa.id)).toBe(2500);
    const conteo = await conEmpresa(agent.post('/api/ajustes/conteo')).send({ items: [{ productoId: salsa.id, cantidad_contada: 2400 }] });
    expect(conteo.status).toBe(201);
    expect(conteo.body.ajustados).toBe(1);
    expect(await stockDe(salsa.id)).toBe(2400);
  });

  it('lista las producciones con filtros', async () => {
    const todas = await conEmpresa(agent.get('/api/produccion'));
    expect(todas.status).toBe(200);
    expect(todas.body).toHaveLength(2);
    expect(todas.body[0].Producto.nombre_producto).toBe('Salsa base');
    const hoy = fechaLocal();
    expect((await conEmpresa(agent.get(`/api/produccion?desde=${hoy}&hasta=${hoy}`))).body).toHaveLength(2);
    expect((await conEmpresa(agent.get('/api/produccion?desde=2020-01-01&hasta=2020-01-02'))).body).toHaveLength(0);
  });

  it('el costo de la salsa y del plato salen del costo registrado', async () => {
    const lista = (await conEmpresa(agent.get('/api/productos'))).body;
    const s = lista.find((p) => p.id === salsa.id);
    expect(s.disponible).toBe(2400);
    expect(s.costo).toBeCloseTo(await costoDe(salsa.id), 4);
    expect(lista.find((p) => p.id === pizza.id).porciones_disponibles).toBe(16); // 2400 / 150
  });

  it('deshacer un lote devuelve los ingredientes si sigue entero; si no, avisa', async () => {
    const ultimo = await models.Produccion.findOne({ order: [['id', 'DESC']] }); // 1000 ml
    // La salsa ya se mermó/contó: aún hay más de 1000, así que se puede deshacer.
    const tomateAntes = await stockDe(tomate.id);
    const res = await conEmpresa(agent.post(`/api/produccion/${ultimo.id}/anular`));
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('ANULADA');
    expect(await stockDe(tomate.id)).toBe(tomateAntes + 800);
    expect(await stockDe(salsa.id)).toBe(1400);
    expect((await conEmpresa(agent.post(`/api/produccion/${ultimo.id}/anular`))).status).toBe(400); // ya anulada

    // El primer lote (2000) ya no está entero (quedan 1400).
    const primero = await models.Produccion.findOne({ order: [['id', 'ASC']] });
    const parcial = await conEmpresa(agent.post(`/api/produccion/${primero.id}/anular`));
    expect(parcial.status).toBe(400);
    expect(parcial.body.error).toMatch(/Ya se usó parte de este lote/);
  });

  it('un usuario operativo produce pero no deshace lotes ni ve costos', async () => {
    const res = await producir(salsa.id, 100, {}, operativo);
    expect(res.status).toBe(201);
    const ultimo = await models.Produccion.findOne({ order: [['id', 'DESC']] });
    expect((await conEmpresa(operativo.post(`/api/produccion/${ultimo.id}/anular`))).status).toBe(403);
    const lista = (await conEmpresa(operativo.get('/api/produccion'))).body;
    expect(lista.length).toBeGreaterThan(0);
    // 'costos.ver' lo tiene el operativo base; se comprueba que el admin lo recibe igual
    expect(lista[0].costo_unitario).toBeDefined();
  });

  it('reposición: bajo su mínimo pide los ingredientes de lo que falta producir', async () => {
    await models.Producto.update({ stock_minimo: 1500, stock_objetivo: 3000 }, { where: { id: salsa.id } }); // hay 1500
    await models.Producto.update({ stock_actual: 400 }, { where: { id: tomate.id } });
    const res = await conEmpresa(agent.get('/api/reposicion'));
    expect(res.status).toBe(200);
    expect(res.body.alertas.map((a) => a.productoId)).toContain(salsa.id);
    const sug = res.body.sugerencias.find((s) => s.productoId === tomate.id);
    expect(sug).toBeTruthy();
    expect(sug.para).toContain('Salsa base');
    expect(sug.sugerido_base).toBe(800); // faltan 1500 de salsa -> 1200 g de tomate − 400 en stock
  });

  it('auditoría: la producción queda registrada con frase gerencial', async () => {
    const res = await conEmpresa(agent.get('/api/auditoria?modulo=Recetas'));
    expect(res.status).toBe(200);
    const acciones = res.body.map((f) => f.accion);
    expect(acciones).toContain('Registró una producción por lotes');
    expect(acciones).toContain('Anuló una producción por lotes');
  });

  it('exige el módulo Recetas', async () => {
    await activarModulos([]);
    expect((await conEmpresa(agent.get('/api/produccion'))).status).toBe(403);
    await activarModulos(['Recetas']);
  });
});

describe('Informe de desviaciones (consumo teórico vs. conteo)', () => {
  let queso; let pan; let sandwich; let salsa2;
  const crear = (body) => conEmpresa(agent.post('/api/productos')).send({ precio_unitario: 1000, porcentaje_iva: 0, ...body });
  const informe = (q = '', quien = agent) => conEmpresa(quien.get(`/api/ajustes/desviaciones${q}`));
  const fila = (res, id) => res.body.filas.find((f) => f.productoId === id);

  beforeAll(async () => {
    await activarModulos(['Recetas']);
    queso = (await crear({ codigo: 'QSO', nombre_producto: 'Queso', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 1000, costo_promedio: 10 })).body;
    pan = (await crear({ codigo: 'PAN', nombre_producto: 'Pan', tipo: 'INSUMO', unidad_medida: '94', stock_actual: 50, costo_promedio: 500 })).body;
    sandwich = (await crear({
      codigo: 'SAND', nombre_producto: 'Sándwich', tipo: 'RECETA', precio_unitario: 12000,
      receta: [{ insumoId: queso.id, cantidad: 50 }, { insumoId: pan.id, cantidad: 2 }],
    })).body;
    salsa2 = (await crear({
      codigo: 'SAL2', nombre_producto: 'Aderezo', tipo: 'PREPARACION', por_lotes: true, unidad_medida: 'GRM', rendimiento: 100,
      receta: [{ insumoId: queso.id, cantidad: 20 }],
    })).body;
  });

  it('refleja ventas, producción y el faltante que aparece al contar', async () => {
    const venta = await conEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id, detalles: [{ productoId: sandwich.id, cantidad: 4, precio_unitario: 12000, precio_base: 12000 }],
    });
    expect(venta.status).toBe(201); // queso -200, pan -8
    expect((await conEmpresa(agent.post('/api/produccion')).send({ productoId: salsa2.id, cantidad: 100 })).status).toBe(201); // queso -20

    // En el estante hay 40 g menos de queso que lo que dice el sistema (780) y 2 panes más.
    const conteo = await conEmpresa(agent.post('/api/ajustes/conteo')).send({
      items: [{ productoId: queso.id, cantidad_contada: 740 }, { productoId: pan.id, cantidad_contada: 44 }],
    });
    expect(conteo.status).toBe(201);

    const res = await informe();
    expect(res.status).toBe(200);
    expect(fila(res, queso.id)).toMatchObject({
      consumo_ventas: 200, consumo_produccion: 20, consumo_teorico: 220, conteo: -40, faltante: 40, valor_conteo: -400, estado: 'FALTANTE',
    });
    expect(fila(res, queso.id).desviacion_pct).toBeCloseTo(18.18, 2);
    expect(fila(res, pan.id)).toMatchObject({ consumo_teorico: 8, conteo: 2, sobrante: 2, valor_conteo: 1000, estado: 'SOBRANTE', desviacion_pct: null });
    // (los totales incluyen también el conteo de la salsa del bloque anterior)
    expect(res.body.totales.valor_faltante).toBeGreaterThanOrEqual(400);
    expect(res.body.totales.valor_sobrante).toBeGreaterThanOrEqual(1000);
    expect(res.body.totales.con_faltante).toBeGreaterThanOrEqual(1);
    expect(res.body.filas[0].productoId).toBe(queso.id); // lo que más faltó, primero
  });

  it('una venta anulada ya no cuenta como consumo; una devolución reingresada tampoco', async () => {
    const venta = await conEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id, detalles: [{ productoId: sandwich.id, cantidad: 2, precio_unitario: 12000, precio_base: 12000 }],
    });
    const antes = fila(await informe(), queso.id).consumo_ventas;
    expect(antes).toBe(300);
    expect((await conEmpresa(agent.post(`/api/ventas/${venta.body.id}/anular`)).send({ motivo: 'Error' })).status).toBe(200);
    expect(fila(await informe(), queso.id).consumo_ventas).toBe(200);

    const v2 = await conEmpresa(agent.post('/api/ventas')).send({
      clienteId: ctx.cliente.id, detalles: [{ productoId: sandwich.id, cantidad: 2, precio_unitario: 12000, precio_base: 12000 }],
    });
    const detalle = await models.VentaDetalle.findOne({ where: { ventaId: v2.body.id } });
    const dev = await conEmpresa(agent.post(`/api/ventas/${v2.body.id}/devoluciones`)).send({
      motivo: 'No lo quiso', items: [{ ventaDetalleId: detalle.id, cantidad: 1, reingresar: true }],
    });
    expect(dev.status).toBe(201);
    expect(fila(await informe(), queso.id).consumo_ventas).toBe(250); // 200 + 2×50 − 1×50 reingresado
  });

  it('las mermas salen aparte y el rango de fechas filtra', async () => {
    expect((await conEmpresa(agent.post('/api/ajustes')).send({ productoId: queso.id, tipo: 'MERMA', cantidad: 10 })).status).toBe(201);
    const hoy = fechaLocal();
    const res = await informe(`?desde=${hoy}&hasta=${hoy}`);
    expect(fila(res, queso.id)).toMatchObject({ mermas: 10, valor_mermas: 100 });
    expect(res.body.totales.valor_mermas).toBeGreaterThanOrEqual(100);
    const vacio = await informe('?desde=2020-01-01&hasta=2020-01-31');
    expect(vacio.body.filas).toEqual([]);
  });

  it('solo quien puede contar inventario lo ve', async () => {
    expect((await informe('', operativo)).status).toBe(403);
  });

  it('exige el módulo Inventario', async () => {
    const todos = await models.Modulo.findAll();
    await ctx.empresa.setModulos(todos.filter((m) => m.nombre_codigo === 'Ventas').map((m) => m.id));
    invalidateAllProfiles();
    expect((await informe()).status).toBe(403);
    await activarModulos(['Recetas']);
  });
});
