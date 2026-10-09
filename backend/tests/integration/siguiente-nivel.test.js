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
const stockDe = async (id) => Number((await models.Producto.findByPk(id)).stock_actual);
const enHoras = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
const MODULOS = ['Mesas', 'Cocina', 'Recetas']; // sin Caja: vender no exige abrirla

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

describe('Producción por lotes: vencimiento y sugerencias', () => {
  let tomate; let salsa; let pasta;

  beforeAll(async () => {
    tomate = (await crear({ codigo: 'TOM', nombre_producto: 'Tomate', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 100000, costo_promedio: 1 })).body;
    salsa = (await crear({
      codigo: 'SAL', nombre_producto: 'Salsa', tipo: 'PREPARACION', por_lotes: true, vida_util_dias: 3, unidad_medida: 'MLT', rendimiento: 1000,
      receta: [{ insumoId: tomate.id, cantidad: 800 }],
    })).body;
    pasta = (await crear({ codigo: 'PAS', nombre_producto: 'Pasta', tipo: 'RECETA', precio_unitario: 20000, receta: [{ insumoId: salsa.id, cantidad: 200 }] })).body;
  });

  it('la vida útil es solo de preparaciones por lotes', async () => {
    expect(salsa.vida_util_dias).toBe(3);
    const insumo = await crear({ codigo: 'X', nombre_producto: 'Sal', tipo: 'INSUMO', vida_util_dias: 5, unidad_medida: 'GRM' });
    expect(insumo.body.vida_util_dias).toBeNull();
    const sinLotes = await put(`/api/productos/${salsa.id}`, { por_lotes: false });
    expect(sinLotes.status).toBe(200); // sin existencias aún
    expect(sinLotes.body.vida_util_dias).toBeNull();
    expect((await put(`/api/productos/${salsa.id}`, { por_lotes: true, vida_util_dias: 3 })).body.vida_util_dias).toBe(3);
    expect((await put(`/api/productos/${salsa.id}`, { vida_util_dias: 0 })).status).toBe(400);
  });

  it('cada producción guarda cuándo vence el lote', async () => {
    const res = await post('/api/produccion', { productoId: salsa.id, cantidad: 3000 });
    expect(res.status).toBe(201);
    const hoy = new Date();
    const esperado = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 3);
    const iso = `${esperado.getFullYear()}-${String(esperado.getMonth() + 1).padStart(2, '0')}-${String(esperado.getDate()).padStart(2, '0')}`;
    expect(res.body.vence_en).toBe(iso);
  });

  it('lista los lotes con existencias y detecta lo vencido (el stock está en los lotes más nuevos)', async () => {
    // Un lote viejo ya vencido y el actual vigente; el stock (3.000 + 1.000) cubre el nuevo y 1.000 del viejo.
    const viejo = await models.Produccion.create({
      empresaId: ctx.empresa.id, productoId: salsa.id, usuarioId: 1, cantidad: 2000, consumo: [], fecha: new Date(Date.now() - 5 * 86_400_000), vence_en: '2000-01-01',
    });
    await models.Producto.update({ stock_actual: 4000 }, { where: { id: salsa.id } });
    const res = await get('/api/produccion/lotes');
    expect(res.status).toBe(200);
    const s = res.body.find((p) => p.productoId === salsa.id);
    expect(s).toMatchObject({ stock: 4000, vida_util_dias: 3, vencido: 1000 });
    expect(s.lotes.map((l) => [l.restante, l.estado])).toEqual([[1000, 'VENCIDO'], [3000, 'VIGENTE']]);

    // Lo vencido se descarta como merma «vencido».
    expect((await post('/api/ajustes', { productoId: salsa.id, tipo: 'VENCIDO', cantidad: s.vencido })).status).toBe(201);
    expect(await stockDe(salsa.id)).toBe(3000);
    await viejo.update({ estado: 'ANULADA' });
  });

  it('sugiere cuánto producir según las ventas de los últimos días', async () => {
    const venta = await post('/api/ventas', { clienteId: ctx.cliente.id, detalles: [{ productoId: pasta.id, cantidad: 14, precio_unitario: 20000, precio_base: 20000 }] });
    expect(venta.status).toBe(201); // 14 × 200 = 2.800 ml de salsa
    await models.Producto.update({ stock_actual: 100 }, { where: { id: salsa.id } });
    const res = await get('/api/produccion/sugerencias?dias=14&cobertura=2');
    expect(res.status).toBe(200);
    const s = res.body.sugerencias.find((x) => x.productoId === salsa.id);
    expect(s).toMatchObject({ consumo_periodo: 2800, promedio_diario: 200, objetivo: 400, stock: 100, sugerido: 300, rendimiento: 1000 });
    expect((await get('/api/produccion/sugerencias?dias=0')).status).toBe(400);
  });
});

describe('Desviaciones: alerta automática y comparación con el conteo anterior', () => {
  let queso; let sandwich;
  const contar = (productoId, cantidad_contada, quien = agent) => post('/api/ajustes/conteo', { items: [{ productoId, cantidad_contada }] }, quien);

  beforeAll(async () => {
    queso = (await crear({ codigo: 'QSO', nombre_producto: 'Queso', tipo: 'INSUMO', unidad_medida: 'GRM', stock_actual: 1000, costo_promedio: 10 })).body;
    sandwich = (await crear({ codigo: 'SAN', nombre_producto: 'Sándwich', tipo: 'RECETA', precio_unitario: 12000, receta: [{ insumoId: queso.id, cantidad: 50 }] })).body;
  });

  it('el límite por omisión es 5 % y solo lo cambia quien cuenta inventario', async () => {
    expect((await get('/api/ajustes/desviaciones')).body.umbral_pct).toBe(5);
    expect((await put('/api/ajustes/desviaciones/umbral', { desviacion_alerta_pct: 8 }, mesero)).status).toBe(403);
    expect((await put('/api/ajustes/desviaciones/umbral', { desviacion_alerta_pct: 101 })).status).toBe(400);
    expect((await put('/api/ajustes/desviaciones/umbral', { desviacion_alerta_pct: 8 })).body.umbral_pct).toBe(8);
    expect((await get('/api/ajustes/desviaciones')).body.umbral_pct).toBe(8);
    await put('/api/ajustes/desviaciones/umbral', { desviacion_alerta_pct: 5 });
  });

  it('el primer conteo no tiene con qué compararse: sin alerta', async () => {
    const res = await contar(queso.id, 990); // -10 g
    expect(res.status).toBe(201);
    expect(res.body.alertas).toEqual([]);
    expect(res.body.umbral_pct).toBe(5);
    const ev = (await get('/api/ajustes/desviaciones?modo=conteos')).body.eventos;
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ productoId: queso.id, sin_base: true, faltante: 10, desviacion_pct: null, alerta: false });
  });

  it('un faltante grande frente a lo que se gastó desde el conteo anterior dispara la alerta', async () => {
    await new Promise((r) => setTimeout(r, 30)); // el conteo siguiente es posterior a las ventas de abajo
    expect((await post('/api/ventas', { clienteId: ctx.cliente.id, detalles: [{ productoId: sandwich.id, cantidad: 4, precio_unitario: 12000, precio_base: 12000 }] })).status).toBe(201);
    // Sistema: 990 − 200 = 790. En el estante hay 750: faltan 40 g de 200 teóricos = 20 %.
    const res = await contar(queso.id, 750);
    expect(res.status).toBe(201);
    expect(res.body.alertas).toHaveLength(1);
    expect(res.body.alertas[0]).toMatchObject({ nombre_producto: 'Queso', faltante: 40, consumo_teorico: 200, desviacion_pct: 20, valor: -400 });

    const ev = (await get('/api/ajustes/desviaciones?modo=conteos')).body;
    expect(ev.alertas).toBe(1);
    expect(ev.eventos[0]).toMatchObject({ faltante: 40, consumo_teorico: 200, desviacion_pct: 20, alerta: true, sin_base: false });
    expect(ev.eventos[1].sin_base).toBe(true); // el conteo viejo
    const auditoria = (await get('/api/auditoria?modulo=Inventario')).body.map((f) => f.accion);
    expect(auditoria).toContain('Alerta: faltante de inventario sobre el límite');
  });

  it('con un límite más alto el mismo faltante ya no alerta; el modo rango también marca la alerta', async () => {
    const rango = (await get('/api/ajustes/desviaciones')).body;
    expect(rango.filas.find((f) => f.productoId === queso.id).alerta).toBe(true);
    await put('/api/ajustes/desviaciones/umbral', { desviacion_alerta_pct: 25 });
    expect((await get('/api/ajustes/desviaciones?modo=conteos')).body.alertas).toBe(0);
    await put('/api/ajustes/desviaciones/umbral', { desviacion_alerta_pct: 5 });
  });

  it('las mermas entre conteos se reportan aparte', async () => {
    await post('/api/ajustes', { productoId: queso.id, tipo: 'MERMA', cantidad: 5 });
    await contar(queso.id, 740);
    const ev = (await get('/api/ajustes/desviaciones?modo=conteos')).body.eventos[0];
    expect(ev.mermas).toBe(5);
    expect(ev.faltante).toBe(5); // sistema 745, contado 740
  });

  it('solo quien puede contar ve el informe por conteos', async () => {
    expect((await get('/api/ajustes/desviaciones?modo=conteos', mesero)).status).toBe(403);
  });
});

describe('Propinas: sugerida configurable y reparto entre el personal', () => {
  let mesa; let jugo;
  const cerrarCajas = () => models.Caja.update({ estado: 'CERRADA', fecha_cierre: new Date(), monto_contado: 0, efectivo_esperado: 0, diferencia: 0, num_ventas: 0, total_ventas: 0 }, { where: { estado: 'ABIERTA' } });

  beforeAll(async () => {
    await cerrarCajas();
    await activarModulos([...MODULOS, 'Caja']);
    jugo = (await crear({ codigo: 'JUG', nombre_producto: 'Jugo', precio_unitario: 5000, stock_actual: 100 })).body;
    mesa = (await post('/api/mesas', { nombre: 'Mesa P' })).body;
  });
  afterAll(async () => { await cerrarCajas(); await activarModulos(MODULOS); });

  it('la propina sugerida es 10 % por omisión; el administrador la cambia, otros no', async () => {
    expect((await get('/api/mesas')).body.config.propina_sugerida_pct).toBe(10);
    expect((await put('/api/mesas/config', { propina_sugerida_pct: 8 }, mesero)).status).toBe(403);
    expect((await put('/api/mesas/config', { propina_sugerida_pct: 50 })).status).toBe(400);
    expect((await put('/api/mesas/config', { propina_sugerida_pct: 12.5 })).status).toBe(200);
    expect((await get('/api/mesas', mesero)).body.config.propina_sugerida_pct).toBe(12.5);
    expect((await put('/api/mesas/config', { propina_sugerida_pct: 0 })).status).toBe(200); // sin sugerencia
    const auditoria = (await get('/api/auditoria?modulo=Mesas')).body.map((f) => f.accion);
    expect(auditoria).toContain('Cambió la propina sugerida');
  });

  it('lista al personal de la empresa para el reparto', async () => {
    const res = await get('/api/caja/personal', mesero);
    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.nombre)).toEqual(expect.arrayContaining(['Front Admin', 'Mesero Uno']));
  });

  it('entrega las propinas repartidas: debe sumar lo entregado y ser gente de la empresa', async () => {
    await post('/api/caja/abrir', { monto_inicial: 0 });
    const c = (await post('/api/cuentas', { mesaId: mesa.id })).body;
    await post(`/api/cuentas/${c.id}/items`, { productoId: jugo.id, cantidad: 2 });
    expect((await post(`/api/cuentas/${c.id}/cobrar`, { propina: 1000 })).status).toBe(201);

    const admin = (await get('/api/caja/personal')).body.find((p) => p.nombre === 'Front Admin');
    const reparto = [{ usuarioId: admin.id, monto: 600 }, { usuarioId: meseroUsuario.id, monto: 400 }];
    expect((await post('/api/caja/retiros', { tipo: 'PROPINA', concepto: 'Propinas', monto: 1000, reparto: [{ usuarioId: admin.id, monto: 500 }] })).status).toBe(400); // no suma
    expect((await post('/api/caja/retiros', { tipo: 'PROPINA', concepto: 'Propinas', monto: 1000, reparto: [{ usuarioId: 99999, monto: 1000 }] })).status).toBe(400); // ajeno
    expect((await post('/api/caja/retiros', { tipo: 'PROPINA', concepto: 'Propinas', monto: 1000, reparto: [{ usuarioId: admin.id, monto: 500 }, { usuarioId: admin.id, monto: 500 }] })).status).toBe(400); // repetido
    expect((await post('/api/caja/retiros', { tipo: 'RETIRO', concepto: 'Retiro', monto: 100, reparto: [{ usuarioId: admin.id, monto: 100 }] })).status).toBe(400); // solo propinas
    expect(await models.PropinaReparto.count()).toBe(0); // nada quedó a medias

    const ok = await post('/api/caja/retiros', { tipo: 'PROPINA', concepto: 'Propinas del turno', monto: 1000, reparto });
    expect(ok.status).toBe(201);
    expect(await models.PropinaReparto.count({ where: { movimientoId: ok.body.id } })).toBe(2);
    const frases = (await get('/api/auditoria?modulo=Caja')).body.map((f) => f.descripcion);
    expect(frases.some((d) => /repartidas entre 2 personas/.test(d))).toBe(true);
  });

  it('el informe de propinas dice cuánto recibió cada persona; solo lo ve quien ve el dinero de la empresa', async () => {
    const res = await get('/api/caja/propinas');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ recibidas: 1000, entregadas: 1000, repartido: 1000, sin_repartir: 0 });
    expect(res.body.por_persona.map((p) => [p.nombre, p.total])).toEqual([['Front Admin', 600], ['Mesero Uno', 400]]);
    expect((await get('/api/caja/propinas', mesero)).status).toBe(403);
    expect((await get('/api/caja/propinas?desde=2020-01-01&hasta=2020-01-02')).body.por_persona).toEqual([]);
  });

  it('una entrega sin reparto sigue siendo válida (queda «sin repartir»)', async () => {
    const c = (await post('/api/cuentas', { mesaId: mesa.id })).body;
    await post(`/api/cuentas/${c.id}/items`, { productoId: jugo.id });
    await post(`/api/cuentas/${c.id}/cobrar`, { propina: 500 });
    expect((await post('/api/caja/retiros', { tipo: 'PROPINA', concepto: 'Propinas', monto: 500 })).status).toBe(201);
    expect((await get('/api/caja/propinas')).body.sin_repartir).toBe(500);
  });
});

describe('Unir cuentas y reservas', () => {
  let m1; let m2; let m3; let jugo;
  beforeAll(async () => {
    await models.Caja.update({ estado: 'CERRADA', fecha_cierre: new Date(), monto_contado: 0, efectivo_esperado: 0, diferencia: 0, num_ventas: 0, total_ventas: 0 }, { where: { estado: 'ABIERTA' } });
    jugo = (await crear({ codigo: 'JU2', nombre_producto: 'Jugo 2', precio_unitario: 4000, stock_actual: 100 })).body;
    m1 = (await post('/api/mesas', { nombre: 'U1' })).body;
    m2 = (await post('/api/mesas', { nombre: 'U2' })).body;
    m3 = (await post('/api/mesas', { nombre: 'U3' })).body;
  });

  it('une dos cuentas: lo pedido y las comandas pasan a una y la otra mesa queda libre', async () => {
    const a = (await post('/api/cuentas', { mesaId: m1.id, comensales: 2 })).body;
    const b = (await post('/api/cuentas', { mesaId: m2.id, comensales: 3 })).body;
    await post(`/api/cuentas/${a.id}/items`, { productoId: jugo.id, cantidad: 1 });
    await post(`/api/cuentas/${b.id}/items`, { productoId: jugo.id, cantidad: 2 });
    const comanda = (await post(`/api/cuentas/${b.id}/enviar`)).body.comandas[0];

    expect((await post(`/api/cuentas/${a.id}/unir`, { cuentaId: a.id })).status).toBe(400);
    expect((await post(`/api/cuentas/${a.id}/unir`, { cuentaId: 99999 })).status).toBe(404);
    const res = await post(`/api/cuentas/${a.id}/unir`, { cuentaId: b.id }, mesero);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: a.id, comensales: 5 });
    expect(res.body.items).toHaveLength(2);
    expect(res.body.totales.total).toBe(12000);
    expect(res.body.comandas.map((c) => c.id)).toEqual([comanda.id]);

    const cancelada = (await get(`/api/cuentas/${b.id}`)).body;
    expect(cancelada).toMatchObject({ estado: 'CANCELADA' });
    expect(cancelada.motivo_cancelacion).toMatch(/Unida a la cuenta de U1/);
    const tablero = (await get('/api/mesas')).body.mesas;
    expect(tablero.find((m) => m.nombre === 'U2').cuenta).toBeNull();
    expect((await get('/api/comandas')).body.find((c) => c.id === comanda.id).cuenta).toBe('U1'); // cocina ve la mesa nueva
    expect((await post(`/api/cuentas/${a.id}/unir`, { cuentaId: b.id })).status).toBe(400); // ya cancelada
    const frases = (await get('/api/auditoria?modulo=Mesas')).body.map((f) => f.accion);
    expect(frases).toContain('Unió dos cuentas');
    await post(`/api/cuentas/${a.id}/cancelar`, { motivo: 'Prueba' });
  });

  it('no se une una cuenta de la que ya se cobró una parte', async () => {
    const a = (await post('/api/cuentas', { mesaId: m1.id })).body;
    const b = (await post('/api/cuentas', { mesaId: m2.id })).body;
    await post(`/api/cuentas/${b.id}/items`, { productoId: jugo.id, cantidad: 2 });
    const it = (await get(`/api/cuentas/${b.id}`)).body.items[0];
    await post(`/api/cuentas/${b.id}/cobrar`, { items: [{ itemId: it.id, cantidad: 1 }] });
    const res = await post(`/api/cuentas/${a.id}/unir`, { cuentaId: b.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ya tiene una parte cobrada/);
    await post(`/api/cuentas/${a.id}/cancelar`, { motivo: 'Prueba' });
    await post(`/api/cuentas/${b.id}/cobrar`, {});
  });

  it('crea reservas; la misma mesa no admite dos a menos de 90 minutos', async () => {
    const ok = await post('/api/reservas', { mesaId: m3.id, nombre: 'Ana Gómez', telefono: '3001112233', personas: 4, fecha_hora: enHoras(2) });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ nombre: 'Ana Gómez', estado: 'PENDIENTE', personas: 4 });
    expect(ok.body.mesa.nombre).toBe('U3');
    const choque = await post('/api/reservas', { mesaId: m3.id, nombre: 'Luis', personas: 2, fecha_hora: enHoras(2.5) });
    expect(choque.status).toBe(400);
    expect(choque.body.error).toMatch(/ya está reservada para Ana Gómez/);
    expect((await post('/api/reservas', { mesaId: m3.id, nombre: 'Luis', personas: 2, fecha_hora: enHoras(4) })).status).toBe(201); // 2 h después, sí
    expect((await post('/api/reservas', { nombre: 'Sin mesa', personas: 6, fecha_hora: enHoras(5) })).status).toBe(201); // mesa por definir
    expect((await post('/api/reservas', { nombre: 'Pasada', personas: 2, fecha_hora: '2020-01-01T10:00:00Z' })).status).toBe(400);
    expect((await post('/api/reservas', { mesaId: 99999, nombre: 'X', personas: 2, fecha_hora: enHoras(6) })).status).toBe(400);
  });

  it('el tablero avisa la reserva próxima de la mesa y la lista del día las trae ordenadas', async () => {
    const tablero = (await get('/api/mesas')).body.mesas.find((m) => m.nombre === 'U3');
    expect(tablero.reserva).toMatchObject({ nombre: 'Ana Gómez', personas: 4 });
    const hoy = new Date();
    const dia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const lista = (await get(`/api/reservas?fecha=${dia}`)).body;
    const horas = lista.map((r) => new Date(r.fecha_hora).getTime());
    expect(horas).toEqual([...horas].sort((a, b) => a - b));
    expect((await get('/api/reservas?fecha=2020-01-01')).body).toEqual([]);
    expect((await get('/api/reservas?fecha=hoy')).status).toBe(400);
  });

  it('sentar la reserva abre la cuenta con sus comensales; no se puede dos veces', async () => {
    const r = (await models.Reserva.findOne({ where: { nombre: 'Ana Gómez' } }));
    const res = await post(`/api/reservas/${r.id}/sentar`, {}, mesero);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ nombre: 'U3', comensales: 4, estado: 'ABIERTA', nota: 'Reserva de Ana Gómez' });
    await r.reload();
    expect(r).toMatchObject({ estado: 'SENTADA', cuentaId: res.body.id });
    expect((await post(`/api/reservas/${r.id}/sentar`)).status).toBe(400);
    expect((await patch(`/api/reservas/${r.id}`, { nombre: 'Otra' })).status).toBe(400); // ya sentada
    // La reserva sin mesa pide elegirla; con una ocupada se rechaza.
    const sinMesa = await models.Reserva.findOne({ where: { nombre: 'Sin mesa' } });
    expect((await post(`/api/reservas/${sinMesa.id}/sentar`)).status).toBe(400);
    expect((await post(`/api/reservas/${sinMesa.id}/sentar`, { mesaId: m3.id })).status).toBe(400); // U3 ya tiene cuenta
    const ult = await post(`/api/reservas/${sinMesa.id}/sentar`, { mesaId: m1.id });
    expect(ult.body.error).toBeUndefined();
    expect(ult.status).toBe(201);
  });

  it('se cancela o se marca «no llegó» y la mesa queda libre para otra reserva', async () => {
    const luis = await models.Reserva.findOne({ where: { nombre: 'Luis' } });
    expect((await patch(`/api/reservas/${luis.id}`, { estado: 'NO_LLEGO' })).body.estado).toBe('NO_LLEGO');
    expect((await post('/api/reservas', { mesaId: m3.id, nombre: 'Nuevo', personas: 2, fecha_hora: enHoras(4) })).status).toBe(201);
    expect((await patch(`/api/reservas/${luis.id}`, { estado: 'SENTADA' })).status).toBe(400);
    expect((await patch('/api/reservas/99999', { estado: 'CANCELADA' })).status).toBe(404);
    const frases = (await get('/api/auditoria?modulo=Mesas')).body.map((f) => f.accion);
    expect(frases).toEqual(expect.arrayContaining(['Registró una reserva', 'Sentó una reserva', 'Marcó una reserva como «no llegó»']));
  });

  it('las reservas exigen el módulo Mesas', async () => {
    await activarModulos([]);
    expect((await get('/api/reservas')).status).toBe(403);
    await activarModulos(MODULOS);
  });
});
