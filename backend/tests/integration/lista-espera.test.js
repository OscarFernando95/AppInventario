'use strict';

const request = require('supertest');
const { resetDb, seedBase, activarModulos: activar, loginNuevoUsuario } = require('./helpers');
const { invalidateAllProfiles } = require('../../src/middlewares/auth');

let app; let models; let ctx; let agent; let mesero; let ajeno; let otraEmpresa;
const conEmpresa = (r, empresa = ctx.empresa) => r.set('X-Empresa-Id', String(empresa.id));
const activarModulos = (extra = []) => activar(models, ctx.empresa, invalidateAllProfiles, extra);
const get = (url, quien = agent) => conEmpresa(quien.get(url));
const post = (url, body = {}, quien = agent) => conEmpresa(quien.post(url)).send(body);
const put = (url, body = {}, quien = agent) => conEmpresa(quien.put(url)).send(body);
const patch = (url, body = {}, quien = agent) => conEmpresa(quien.patch(url)).send(body);
const del = (url, quien = agent) => conEmpresa(quien.delete(url));
const crear = (body) => post('/api/productos', { precio_unitario: 1000, porcentaje_iva: 0, ...body });
const opciones = (valores) => put('/api/opciones', { valores });
const enHoras = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
const dia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoy = () => dia(new Date());
const enDias = (n) => dia(new Date(Date.now() + n * 86_400_000));
const MODULOS = ['Mesas', 'Cocina', 'Recetas'];

beforeAll(async () => {
  await resetDb();
  app = require('../../src/app');
  models = require('../../src/models');
  ctx = await seedBase(models);
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ username: 'fadmin', contrasena: 'Clave1234' })).status).toBe(200);
  mesero = (await loginNuevoUsuario(request, app, models, ctx.empresa, { username: 'mesero1', nombre: 'Mesero Uno' })).agent;

  // Otra empresa, también con Mesas, con las mismas funciones encendidas: no debe ver nada de la primera.
  otraEmpresa = await models.Empresa.create({ nombre: 'OtroCafe', nit: '900777888', tipo_empresa: 'SIMPLE' });
  const todos = await models.Modulo.findAll();
  await otraEmpresa.setModulos(todos.filter((m) => ['Inventario', 'Ventas', 'Mesas'].includes(m.nombre_codigo)).map((m) => m.id));
  ajeno = (await loginNuevoUsuario(request, app, models, otraEmpresa, { username: 'admin_otro', rolId: 2 })).agent;

  await activarModulos(MODULOS);
});

afterAll(async () => { await models.sequelize.close(); });

const getOtro = (url) => conEmpresa(ajeno.get(url), otraEmpresa);
const putOtro = (url, body) => conEmpresa(ajeno.put(url), otraEmpresa).send(body);
const postOtro = (url, body) => conEmpresa(ajeno.post(url), otraEmpresa).send(body);

describe('Con las opciones apagadas (como nacen) nada de esto existe y lo de siempre no cambia', () => {
  let mesa;
  beforeAll(async () => { mesa = (await post('/api/mesas', { nombre: 'A1' })).body; });

  it('nacen apagadas', async () => {
    const res = await get('/api/opciones');
    expect(res.body.valores).toMatchObject({ lista_espera: false, bloqueo_mesas: false, tiempo_ocupacion: false, reservas_calendario: false });
    expect(res.body.catalogo.map((o) => o.clave)).toEqual(expect.arrayContaining(['lista_espera', 'bloqueo_mesas', 'tiempo_ocupacion', 'reservas_calendario']));
  });

  it('las rutas nuevas responden 403 con el mensaje que dice dónde prenderlas', async () => {
    for (const res of [
      await get('/api/lista-espera'),
      await post('/api/lista-espera', { nombre: 'X', personas: 2 }),
      await patch('/api/lista-espera/1', { estado: 'CANCELADO' }),
      await post('/api/lista-espera/1/sentar', { mesaId: mesa.id }),
      await get('/api/bloqueos'),
      await post('/api/bloqueos', { mesaId: mesa.id, desde: enHoras(0), hasta: enHoras(1) }),
      await del('/api/bloqueos/1'),
      await get('/api/mesas/ocupacion'),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Opciones/);
    }
  });

  it('el tablero no trae `bloqueo` y un bloqueo guardado a mano no impide abrir cuenta ni reservar', async () => {
    expect((await get('/api/mesas')).body.mesas.every((m) => !('bloqueo' in m))).toBe(true);
    await models.MesaBloqueo.create({ empresaId: ctx.empresa.id, mesaId: mesa.id, usuarioId: 1, desde: new Date(Date.now() - 3_600_000), hasta: new Date(Date.now() + 3_600_000), motivo: 'Dato viejo' });
    expect((await post('/api/reservas', { mesaId: mesa.id, nombre: 'Libre', personas: 2, fecha_hora: enHoras(0.5) })).status).toBe(201);
    const cuenta = await post('/api/cuentas', { mesaId: mesa.id });
    expect(cuenta.status).toBe(201);
    await post(`/api/cuentas/${cuenta.body.id}/cancelar`, { motivo: 'Prueba' });
    await models.MesaBloqueo.destroy({ where: { mesaId: mesa.id } });
    await models.Reserva.destroy({ where: { mesaId: mesa.id } });
  });

  it('`desde` y `hasta` en las reservas se ignoran: solo trae el día pedido (hoy)', async () => {
    const manana = await post('/api/reservas', { nombre: 'Mañana', personas: 2, fecha_hora: new Date(Date.now() + 30 * 3_600_000).toISOString() });
    expect(manana.status).toBe(201);
    const res = await get(`/api/reservas?desde=${hoy()}&hasta=${enDias(10)}`);
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.nombre)).not.toContain('Mañana');
    await models.Reserva.destroy({ where: { nombre: 'Mañana' } });
  });

  it('el calendario exige las reservas encendidas', async () => {
    await opciones({ reservas: false });
    const res = await opciones({ reservas_calendario: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Reservas/);
    await opciones({ reservas: true });
  });
});

describe('Lista de espera', () => {
  let m1; let m2; let m3;
  beforeAll(async () => {
    expect((await opciones({ lista_espera: true })).status).toBe(200);
    m1 = (await post('/api/mesas', { nombre: 'L1' })).body;
    m2 = (await post('/api/mesas', { nombre: 'L2' })).body;
    m3 = (await post('/api/mesas', { nombre: 'L3' })).body;
  });

  it('valida lo que se manda', async () => {
    expect((await post('/api/lista-espera', { nombre: '', personas: 2 })).status).toBe(400);
    expect((await post('/api/lista-espera', { nombre: 'Ana', personas: 0 })).status).toBe(400);
    expect((await post('/api/lista-espera', { nombre: 'Ana' })).status).toBe(400);
    expect((await post('/api/lista-espera', { nombre: 'Ana', personas: 'muchas' })).status).toBe(400);
    expect((await get('/api/lista-espera?estado=ASADO')).status).toBe(400);
    expect((await patch('/api/lista-espera/1', { estado: 'SENTADO' })).status).toBe(400); // sentar tiene su propia ruta
  });

  it('anota a quien espera; cualquiera del equipo puede; la lista va del que lleva más al que lleva menos con sus minutos', async () => {
    const a = await post('/api/lista-espera', { nombre: 'Ana Gómez', telefono: '3001112233', personas: 4, nota: 'Prefiere ventana' }, mesero);
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ nombre: 'Ana Gómez', personas: 4, estado: 'ESPERANDO', minutos_espera: 0 });
    const b = (await post('/api/lista-espera', { nombre: 'Beto', personas: 2 })).body;
    const c = (await post('/api/lista-espera', { nombre: 'Carla', personas: 6 })).body;
    // Ana llegó hace 25 min y Beto hace 10; Carla acaba de llegar.
    await models.ListaEspera.update({ creada_en: new Date(Date.now() - 25 * 60_000) }, { where: { id: a.body.id } });
    await models.ListaEspera.update({ creada_en: new Date(Date.now() - 10 * 60_000) }, { where: { id: b.id } });

    const lista = await get('/api/lista-espera', mesero);
    expect(lista.status).toBe(200);
    expect(lista.body.map((e) => e.nombre)).toEqual(['Ana Gómez', 'Beto', 'Carla']);
    expect(lista.body.map((e) => e.minutos_espera)).toEqual([25, 10, 0]);
    expect(c.minutos_espera).toBe(0);
  });

  it('se cancela o «no llegó» solo si sigue esperando', async () => {
    const x = (await post('/api/lista-espera', { nombre: 'Se fue', personas: 2 })).body;
    const cancelado = await patch(`/api/lista-espera/${x.id}`, { estado: 'CANCELADO' });
    expect(cancelado.status).toBe(200);
    expect(cancelado.body).toMatchObject({ estado: 'CANCELADO' });
    expect((await patch(`/api/lista-espera/${x.id}`, { estado: 'NO_LLEGO' })).status).toBe(400); // ya no espera
    expect((await post(`/api/lista-espera/${x.id}/sentar`, { mesaId: m1.id })).status).toBe(400);
    expect((await patch('/api/lista-espera/99999', { estado: 'CANCELADO' })).status).toBe(404);

    const y = (await post('/api/lista-espera', { nombre: 'Nunca vino', personas: 3 })).body;
    expect((await patch(`/api/lista-espera/${y.id}`, { estado: 'NO_LLEGO' })).body.estado).toBe('NO_LLEGO');

    expect((await get('/api/lista-espera')).body.map((e) => e.nombre)).not.toEqual(expect.arrayContaining(['Se fue', 'Nunca vino']));
    expect((await get('/api/lista-espera?estado=CANCELADO')).body.map((e) => e.nombre)).toEqual(['Se fue']);
    expect((await get('/api/lista-espera?estado=NO_LLEGO')).body.map((e) => e.nombre)).toEqual(['Nunca vino']);
  });

  it('sentar abre la cuenta con sus comensales y la nota; no con una mesa ocupada, inactiva o inexistente', async () => {
    const ana = await models.ListaEspera.findOne({ where: { nombre: 'Ana Gómez' } });
    expect((await post(`/api/lista-espera/${ana.id}/sentar`, {})).status).toBe(400); // falta la mesa
    expect((await post(`/api/lista-espera/${ana.id}/sentar`, { mesaId: 99999 })).status).toBe(400);
    await put(`/api/mesas/${m3.id}`, { activa: false });
    expect((await post(`/api/lista-espera/${ana.id}/sentar`, { mesaId: m3.id })).status).toBe(400);
    await put(`/api/mesas/${m3.id}`, { activa: true });
    const ocupada = (await post('/api/cuentas', { mesaId: m2.id })).body;
    const choque = await post(`/api/lista-espera/${ana.id}/sentar`, { mesaId: m2.id });
    expect(choque.status).toBe(400);
    expect(choque.body.error).toMatch(/ya tiene una cuenta abierta/);
    await post(`/api/cuentas/${ocupada.id}/cancelar`, { motivo: 'Prueba' });

    const res = await post(`/api/lista-espera/${ana.id}/sentar`, { mesaId: m1.id }, mesero);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ nombre: 'L1', comensales: 4, estado: 'ABIERTA', nota: 'Lista de espera: Ana Gómez' });
    await ana.reload();
    expect(ana).toMatchObject({ estado: 'SENTADO', cuentaId: res.body.id });
    expect(ana.atendida_en).not.toBeNull();
    expect((await post(`/api/lista-espera/${ana.id}/sentar`, { mesaId: m3.id })).status).toBe(400); // ya sentada
    expect((await post('/api/lista-espera/99999/sentar', { mesaId: m3.id })).status).toBe(404);
    expect((await get('/api/lista-espera?estado=SENTADO')).body[0]).toMatchObject({ nombre: 'Ana Gómez', cuentaId: res.body.id });
    expect((await get('/api/lista-espera')).body.map((e) => e.nombre)).toEqual(['Beto', 'Carla']);
    await post(`/api/cuentas/${res.body.id}/cancelar`, { motivo: 'Prueba' });
  });

  it('queda en la auditoría con frases legibles', async () => {
    const frases = (await get('/api/auditoria?modulo=Mesas')).body.map((f) => f.accion);
    expect(frases).toEqual(expect.arrayContaining([
      'Anotó a alguien en la lista de espera', 'Sacó a alguien de la lista de espera', 'Marcó «no llegó» en la lista de espera', 'Sentó a alguien de la lista de espera',
    ]));
  });

  it('otra empresa no ve nada ni puede tocar a la gente de esta', async () => {
    await putOtro('/api/opciones', { valores: { lista_espera: true } });
    const lista = await getOtro('/api/lista-espera');
    expect(lista.status).toBe(200);
    expect(lista.body).toEqual([]);
    const beto = await models.ListaEspera.findOne({ where: { nombre: 'Beto' } });
    const patchOtro = await conEmpresa(ajeno.patch(`/api/lista-espera/${beto.id}`), otraEmpresa).send({ estado: 'CANCELADO' });
    expect(patchOtro.status).toBe(404);
    const mesaOtra = (await conEmpresa(ajeno.post('/api/mesas'), otraEmpresa).send({ nombre: 'Z1' })).body;
    expect((await postOtro(`/api/lista-espera/${beto.id}/sentar`, { mesaId: mesaOtra.id })).status).toBe(404);
    await beto.reload();
    expect(beto.estado).toBe('ESPERANDO');
    // Y lo que anota la otra empresa no aparece aquí.
    await postOtro('/api/lista-espera', { nombre: 'Del otro café', personas: 2 });
    expect((await get('/api/lista-espera')).body.map((e) => e.nombre)).not.toContain('Del otro café');
    await opciones({ lista_espera: false });
    expect((await get('/api/lista-espera')).status).toBe(403); // apagada otra vez: se corta, los datos quedan
    expect(await models.ListaEspera.count({ where: { empresaId: ctx.empresa.id, estado: 'ESPERANDO' } })).toBe(2);
  });
});

describe('Bloqueo de mesas', () => {
  let b1; let b2; let b3; let b4; let bloqueo;
  beforeAll(async () => {
    expect((await opciones({ bloqueo_mesas: true, lista_espera: true })).status).toBe(200);
    [b1, b2, b3, b4] = await Promise.all(['B1', 'B2', 'B3', 'B4'].map(async (nombre) => (await post('/api/mesas', { nombre })).body));
  });

  it('solo quien puede configurar las mesas bloquea y desbloquea; cualquiera ve la lista', async () => {
    expect((await post('/api/bloqueos', { mesaId: b1.id, desde: enHoras(-0.1), hasta: enHoras(2) }, mesero)).status).toBe(403);
    expect((await del('/api/bloqueos/1', mesero)).status).toBe(403);
    expect((await get('/api/bloqueos', mesero)).status).toBe(200);
  });

  it('valida el rango, la mesa y el momento', async () => {
    expect((await post('/api/bloqueos', { mesaId: b1.id, desde: enHoras(2), hasta: enHoras(1) })).status).toBe(400);
    expect((await post('/api/bloqueos', { mesaId: b1.id, desde: enHoras(1), hasta: enHoras(1) })).status).toBe(400);
    expect((await post('/api/bloqueos', { mesaId: b1.id, desde: 'mañana', hasta: enHoras(1) })).status).toBe(400);
    expect((await post('/api/bloqueos', { desde: enHoras(1), hasta: enHoras(2) })).status).toBe(400);
    expect((await post('/api/bloqueos', { mesaId: 99999, desde: enHoras(1), hasta: enHoras(2) })).body.error).toMatch(/Mesa inválida/);
    const pasado = await post('/api/bloqueos', { mesaId: b1.id, desde: enHoras(-3), hasta: enHoras(-2) });
    expect(pasado.status).toBe(400);
    expect(pasado.body.error).toMatch(/futuro/);
    await put(`/api/mesas/${b4.id}`, { activa: false });
    expect((await post('/api/bloqueos', { mesaId: b4.id, desde: enHoras(1), hasta: enHoras(2) })).status).toBe(400); // inactiva
    await put(`/api/mesas/${b4.id}`, { activa: true });
  });

  it('una mesa con cuenta abierta no se puede bloquear desde ya, pero sí a futuro', async () => {
    const cuenta = (await post('/api/cuentas', { mesaId: b2.id })).body;
    const ya = await post('/api/bloqueos', { mesaId: b2.id, desde: enHoras(-0.05), hasta: enHoras(2), motivo: 'Evento' });
    expect(ya.status).toBe(400);
    expect(ya.body.error).toMatch(/tiene una cuenta abierta/);
    const futuro = await post('/api/bloqueos', { mesaId: b2.id, desde: enHoras(5), hasta: enHoras(7), motivo: 'Evento' });
    expect(futuro.status).toBe(201);
    expect(futuro.body).toMatchObject({ vigente: false, motivo: 'Evento' });
    await del(`/api/bloqueos/${futuro.body.id}`);
    await post(`/api/cuentas/${cuenta.id}/cancelar`, { motivo: 'Prueba' });
  });

  it('bloquea una mesa libre desde ya; sale en la lista y en el tablero', async () => {
    const res = await post('/api/bloqueos', { mesaId: b1.id, desde: enHoras(-0.05), hasta: enHoras(2), motivo: 'Mantenimiento' });
    expect(res.status).toBe(201);
    bloqueo = res.body;
    expect(bloqueo).toMatchObject({ mesaId: b1.id, motivo: 'Mantenimiento', activo: true, vigente: true });
    expect(bloqueo.mesa.nombre).toBe('B1');

    const lista = (await get('/api/bloqueos', mesero)).body;
    expect(lista.map((b) => b.id)).toEqual([bloqueo.id]);
    const tablero = (await get('/api/mesas')).body.mesas;
    expect(tablero.find((m) => m.nombre === 'B1').bloqueo).toMatchObject({ id: bloqueo.id, motivo: 'Mantenimiento', vigente: true });
    expect(tablero.find((m) => m.nombre === 'B3').bloqueo).toBeNull();
  });

  it('el tablero también avisa un bloqueo que empieza en menos de 3 horas, pero no uno más lejano', async () => {
    const cerca = (await post('/api/bloqueos', { mesaId: b3.id, desde: enHoras(1), hasta: enHoras(2), motivo: 'Cena privada' })).body;
    const lejos = (await post('/api/bloqueos', { mesaId: b4.id, desde: enHoras(10), hasta: enHoras(11) })).body;
    const tablero = (await get('/api/mesas')).body.mesas;
    expect(tablero.find((m) => m.nombre === 'B3').bloqueo).toMatchObject({ id: cerca.id, vigente: false });
    expect(tablero.find((m) => m.nombre === 'B4').bloqueo).toBeNull();
    await del(`/api/bloqueos/${cerca.id}`);
    await del(`/api/bloqueos/${lejos.id}`);
  });

  it('un bloqueo que se cruza con otro de la misma mesa se rechaza', async () => {
    const res = await post('/api/bloqueos', { mesaId: b1.id, desde: enHoras(1), hasta: enHoras(3) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ya está bloqueada/);
  });

  it('con la mesa bloqueada no se abre cuenta, ni se sienta una reserva o a alguien de la lista, ni se le mueve una cuenta', async () => {
    const abrir = await post('/api/cuentas', { mesaId: b1.id }, mesero);
    expect(abrir.status).toBe(400);
    expect(abrir.body.error).toMatch(/^La mesa B1 está bloqueada hasta \d{2}:\d{2} \(Mantenimiento\)\.$/);

    const espera = (await post('/api/lista-espera', { nombre: 'Esperón', personas: 2 })).body;
    const sentarEspera = await post(`/api/lista-espera/${espera.id}/sentar`, { mesaId: b1.id });
    expect(sentarEspera.status).toBe(400);
    expect(sentarEspera.body.error).toMatch(/está bloqueada/);
    expect((await models.ListaEspera.findByPk(espera.id)).estado).toBe('ESPERANDO'); // nada cambió

    const reservaSinMesa = (await post('/api/reservas', { nombre: 'Llegó', personas: 2, fecha_hora: enHoras(0.5) })).body;
    const sentarReserva = await post(`/api/reservas/${reservaSinMesa.id}/sentar`, { mesaId: b1.id });
    expect(sentarReserva.status).toBe(400);
    expect(sentarReserva.body.error).toMatch(/está bloqueada/);

    const cuenta = (await post('/api/cuentas', { mesaId: b3.id })).body;
    const mover = await post(`/api/cuentas/${cuenta.id}/mover`, { mesaId: b1.id });
    expect(mover.status).toBe(400);
    expect(mover.body.error).toMatch(/está bloqueada/);
    await post(`/api/cuentas/${cuenta.id}/cancelar`, { motivo: 'Prueba' });

    expect(await models.Cuenta.count({ where: { mesaId: b1.id } })).toBe(0);
    await patch(`/api/lista-espera/${espera.id}`, { estado: 'CANCELADO' });
    await patch(`/api/reservas/${reservaSinMesa.id}`, { estado: 'CANCELADA' });
  });

  it('una reserva que cae dentro del bloqueo se rechaza (crear y mover); fuera del bloqueo, no', async () => {
    const dentro = await post('/api/reservas', { mesaId: b1.id, nombre: 'Dentro', personas: 2, fecha_hora: enHoras(1) });
    expect(dentro.status).toBe(400);
    expect(dentro.body.error).toMatch(/La mesa B1 está bloqueada de \d{2}:\d{2} a /);
    // A las 3 h el bloqueo (que termina a las 2 h) ya acabó.
    const despues = await post('/api/reservas', { mesaId: b1.id, nombre: 'Después', personas: 2, fecha_hora: enHoras(3) });
    expect(despues.status).toBe(201);
    // Mover esa reserva a la hora del bloqueo, o a otra mesa bloqueada, se rechaza; a una mesa libre, no.
    expect((await patch(`/api/reservas/${despues.body.id}`, { fecha_hora: enHoras(1) })).status).toBe(400);
    expect((await patch(`/api/reservas/${despues.body.id}`, { mesaId: b3.id })).status).toBe(200);
    // La misma hora en otra mesa (sin bloqueo) se reserva sin problema.
    expect((await post('/api/reservas', { mesaId: b2.id, nombre: 'Otra mesa', personas: 2, fecha_hora: enHoras(1) })).status).toBe(201);
  });

  it('quitar el bloqueo devuelve la mesa a servicio y deja constancia', async () => {
    expect((await del(`/api/bloqueos/${bloqueo.id}`)).status).toBe(200);
    expect((await get('/api/bloqueos')).body).toEqual([]);
    expect((await get('/api/mesas')).body.mesas.find((m) => m.nombre === 'B1').bloqueo).toBeNull();
    expect((await del(`/api/bloqueos/${bloqueo.id}`)).status).toBe(404); // ya quitado
    expect((await del('/api/bloqueos/99999')).status).toBe(404);
    const cuenta = await post('/api/cuentas', { mesaId: b1.id });
    expect(cuenta.status).toBe(201);
    await post(`/api/cuentas/${cuenta.body.id}/cancelar`, { motivo: 'Prueba' });
    const frases = (await get('/api/auditoria?modulo=Mesas')).body.map((f) => f.accion);
    expect(frases).toEqual(expect.arrayContaining(['Bloqueó una mesa', 'Desbloqueó una mesa']));
  });

  it('un bloqueo vencido ya no impide nada ni se lista', async () => {
    await models.MesaBloqueo.create({ empresaId: ctx.empresa.id, mesaId: b1.id, usuarioId: 1, desde: new Date(Date.now() - 7_200_000), hasta: new Date(Date.now() - 3_600_000) });
    expect((await get('/api/bloqueos')).body).toEqual([]);
    const cuenta = await post('/api/cuentas', { mesaId: b1.id });
    expect(cuenta.status).toBe(201);
    await post(`/api/cuentas/${cuenta.body.id}/cancelar`, { motivo: 'Prueba' });
  });

  it('otra empresa no ve los bloqueos ni puede bloquear (ni borrar) mesas de esta', async () => {
    const guardado = (await post('/api/bloqueos', { mesaId: b1.id, desde: enHoras(5), hasta: enHoras(6) })).body;
    await putOtro('/api/opciones', { valores: { bloqueo_mesas: true } });
    expect((await getOtro('/api/bloqueos')).body).toEqual([]);
    expect((await postOtro('/api/bloqueos', { mesaId: b1.id, desde: enHoras(1), hasta: enHoras(2) })).status).toBe(400); // la mesa no es suya
    expect((await conEmpresa(ajeno.delete(`/api/bloqueos/${guardado.id}`), otraEmpresa)).status).toBe(404);
    expect((await models.MesaBloqueo.findByPk(guardado.id)).activo).toBe(true);
    await del(`/api/bloqueos/${guardado.id}`);
  });

  it('apagar «Bloqueo de mesas» corta las rutas y los chequeos, sin borrar nada', async () => {
    const vigente = (await post('/api/bloqueos', { mesaId: b3.id, desde: enHoras(-0.05), hasta: enHoras(2), motivo: 'Evento' })).body;
    expect((await post('/api/cuentas', { mesaId: b3.id })).status).toBe(400);
    await opciones({ bloqueo_mesas: false });
    expect((await get('/api/bloqueos')).status).toBe(403);
    expect((await get('/api/mesas')).body.mesas.every((m) => !('bloqueo' in m))).toBe(true);
    const cuenta = await post('/api/cuentas', { mesaId: b3.id });
    expect(cuenta.status).toBe(201); // el chequeo no corre
    await post(`/api/cuentas/${cuenta.body.id}/cancelar`, { motivo: 'Prueba' });
    expect((await models.MesaBloqueo.findByPk(vigente.id)).activo).toBe(true); // el dato sigue ahí
    await models.MesaBloqueo.update({ activo: false }, { where: { id: vigente.id } });
  });
});

describe('Calendario de reservas', () => {
  let c1;
  beforeAll(async () => {
    expect((await opciones({ reservas_calendario: true })).status).toBe(200);
    c1 = (await post('/api/mesas', { nombre: 'C1' })).body;
    await models.Reserva.destroy({ where: { empresaId: ctx.empresa.id } });
    const alas = (dias, h) => { const d = new Date(); d.setDate(d.getDate() + dias); d.setHours(h, 0, 0, 0); return d.toISOString(); };
    await models.Reserva.bulkCreate([
      { empresaId: ctx.empresa.id, usuarioId: 1, nombre: 'Hoy tarde', personas: 2, fecha_hora: alas(0, 23) },
      { empresaId: ctx.empresa.id, usuarioId: 1, nombre: 'Mañana', personas: 3, fecha_hora: alas(1, 13), mesaId: c1.id },
      { empresaId: ctx.empresa.id, usuarioId: 1, nombre: 'En 3 días', personas: 4, fecha_hora: alas(3, 20) },
      { empresaId: ctx.empresa.id, usuarioId: 1, nombre: 'En 10 días', personas: 5, fecha_hora: alas(10, 12) },
      { empresaId: ctx.empresa.id, usuarioId: 1, nombre: 'En 20 días', personas: 6, fecha_hora: alas(20, 12) },
    ]);
  });

  it('una semana trae las reservas de esos días, ordenadas', async () => {
    const res = await get(`/api/reservas?desde=${hoy()}&hasta=${enDias(6)}`, mesero);
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.nombre)).toEqual(['Hoy tarde', 'Mañana', 'En 3 días']);
    expect(res.body[1].mesa.nombre).toBe('C1');
  });

  it('con solo una de las dos fechas trae ese día; `estado` filtra', async () => {
    expect((await get(`/api/reservas?desde=${enDias(1)}`)).body.map((r) => r.nombre)).toEqual(['Mañana']);
    expect((await get(`/api/reservas?hasta=${enDias(3)}`)).body.map((r) => r.nombre)).toEqual(['En 3 días']);
    expect((await get(`/api/reservas?desde=${hoy()}&hasta=${enDias(6)}&estado=CANCELADA`)).body).toEqual([]);
  });

  it('el modo de siempre (`fecha`) sigue igual', async () => {
    expect((await get(`/api/reservas?fecha=${enDias(3)}`)).body.map((r) => r.nombre)).toEqual(['En 3 días']);
    expect((await get('/api/reservas')).body.map((r) => r.nombre)).toEqual(['Hoy tarde']);
  });

  it('hasta 14 días; más, al revés o con fechas mal escritas, no', async () => {
    const catorce = await get(`/api/reservas?desde=${hoy()}&hasta=${enDias(13)}`);
    expect(catorce.status).toBe(200);
    expect(catorce.body.map((r) => r.nombre)).toContain('En 10 días');
    expect(catorce.body.map((r) => r.nombre)).not.toContain('En 20 días');
    const quince = await get(`/api/reservas?desde=${hoy()}&hasta=${enDias(14)}`);
    expect(quince.status).toBe(400);
    expect(quince.body.error).toMatch(/14 días/);
    expect((await get(`/api/reservas?desde=${enDias(3)}&hasta=${hoy()}`)).status).toBe(400);
    expect((await get('/api/reservas?desde=pronto')).status).toBe(400);
  });

  it('las reservas de otros días se pueden sentar, marcar «no llegó» o cancelar como las de hoy', async () => {
    const manana = await models.Reserva.findOne({ where: { nombre: 'Mañana' } });
    const sentada = await post(`/api/reservas/${manana.id}/sentar`, {}, mesero);
    expect(sentada.status).toBe(201);
    expect(sentada.body).toMatchObject({ nombre: 'C1', comensales: 3, nota: 'Reserva de Mañana' });
    await post(`/api/cuentas/${sentada.body.id}/cancelar`, { motivo: 'Prueba' });
    const tres = await models.Reserva.findOne({ where: { nombre: 'En 3 días' } });
    expect((await patch(`/api/reservas/${tres.id}`, { estado: 'NO_LLEGO' })).body.estado).toBe('NO_LLEGO');
    const diez = await models.Reserva.findOne({ where: { nombre: 'En 10 días' } });
    expect((await patch(`/api/reservas/${diez.id}`, { estado: 'CANCELADA' })).body.estado).toBe('CANCELADA');
    const semana = (await get(`/api/reservas?desde=${hoy()}&hasta=${enDias(13)}`)).body;
    expect(semana.map((r) => [r.nombre, r.estado])).toEqual([['Hoy tarde', 'PENDIENTE'], ['Mañana', 'SENTADA'], ['En 3 días', 'NO_LLEGO'], ['En 10 días', 'CANCELADA']]);
  });

  it('apagado, vuelve a ser solo el día pedido', async () => {
    await opciones({ reservas_calendario: false });
    expect((await get(`/api/reservas?desde=${hoy()}&hasta=${enDias(13)}`)).body.map((r) => r.nombre)).toEqual(['Hoy tarde']);
    expect((await get(`/api/reservas?desde=${hoy()}&hasta=${enDias(40)}`)).status).toBe(200); // ni siquiera valida el rango
  });
});

describe('Tiempo de ocupación', () => {
  let o1; let o2; let jugo;
  const cobrarMesa = async (mesa, minutos, { quien = agent, desdeAtras = 0 } = {}) => {
    const cuenta = (await post('/api/cuentas', { mesaId: mesa.id }, quien)).body;
    await post(`/api/cuentas/${cuenta.id}/items`, { productoId: jugo.id, cantidad: 1 }, quien);
    const cobro = await post(`/api/cuentas/${cuenta.id}/cobrar`, {}, quien);
    expect(cobro.status).toBe(201);
    // Se ajustan las horas a mano: abrió hace `minutos` (más lo que se pida) y cerró al cobrar.
    const cerrada = new Date(Date.now() - desdeAtras * 60_000);
    await models.Cuenta.update({ abierta_en: new Date(cerrada.getTime() - minutos * 60_000), cerrada_en: cerrada }, { where: { id: cuenta.id } });
    return cuenta.id;
  };

  beforeAll(async () => {
    expect((await opciones({ tiempo_ocupacion: true })).status).toBe(200);
    await models.Caja.update({ estado: 'CERRADA', fecha_cierre: new Date(), monto_contado: 0, efectivo_esperado: 0, diferencia: 0, num_ventas: 0, total_ventas: 0 }, { where: { estado: 'ABIERTA' } });
    jugo = (await crear({ codigo: 'JUO', nombre_producto: 'Jugo ocupación', precio_unitario: 4000, stock_actual: 100 })).body;
    o1 = (await post('/api/mesas', { nombre: 'O1' })).body;
    o2 = (await post('/api/mesas', { nombre: 'O2' })).body;
  });

  it('sin cuentas cobradas todo en cero', async () => {
    // Esta base ya cobró nada: las cuentas de las pruebas anteriores se cancelaron.
    const res = await get('/api/mesas/ocupacion');
    expect(res.status).toBe(200);
    expect(res.body.general).toEqual({ cuentas: 0, minutos_promedio: 0, minutos_mediana: 0, rotacion_por_mesa_por_dia: 0 });
    expect(res.body.por_hora).toEqual([]);
    expect(res.body.dias).toBe(30);
    expect(res.body.hasta).toBe(hoy());
  });

  it('calcula con las cuentas cobradas: promedio, por mesa y por hora; las canceladas y las de llevar no cuentan', async () => {
    await cobrarMesa(o1, 60);
    await cobrarMesa(o1, 30);
    await cobrarMesa(o2, 90);
    // Una cancelada y una para llevar cobrada: no son ocupación de mesa.
    const cancelada = (await post('/api/cuentas', { mesaId: o2.id })).body;
    await post(`/api/cuentas/${cancelada.id}/cancelar`, { motivo: 'Prueba' });
    const llevar = (await post('/api/cuentas', { etiqueta: 'Para llevar · Juan' })).body;
    await post(`/api/cuentas/${llevar.id}/items`, { productoId: jugo.id, cantidad: 1 });
    expect((await post(`/api/cuentas/${llevar.id}/cobrar`, {})).status).toBe(201);

    const res = await get('/api/mesas/ocupacion', mesero);
    expect(res.status).toBe(200);
    expect(res.body.general).toMatchObject({ cuentas: 3, minutos_promedio: 60, minutos_mediana: 60 });
    const totalMesas = (await models.Mesa.count({ where: { empresaId: ctx.empresa.id, activa: true } }));
    expect(res.body.general.rotacion_por_mesa_por_dia).toBeCloseTo(3 / (totalMesas * 30), 2);
    const m1 = res.body.por_mesa.find((m) => m.nombre === 'O1');
    const m2 = res.body.por_mesa.find((m) => m.nombre === 'O2');
    expect(m1).toMatchObject({ mesaId: o1.id, cuentas: 2, minutos_promedio: 45, minutos_total: 90 });
    expect(m2).toMatchObject({ cuentas: 1, minutos_promedio: 90, minutos_total: 90 });
    expect(res.body.por_mesa.find((m) => m.nombre === 'L1').cuentas).toBe(0); // mesas sin uso también salen
    expect(res.body.por_mesa[0].nombre).toBe('O1'); // la más rotada primero
    expect(res.body.por_hora.reduce((s, h) => s + h.cuentas, 0)).toBe(3);
    expect(res.body.por_hora.every((h) => Number.isInteger(h.hora) && h.hora >= 0 && h.hora <= 23)).toBe(true);
  });

  it('el rango se respeta (hora local): una cuenta de hace 10 días sale solo si el rango la incluye', async () => {
    await cobrarMesa(o2, 120, { desdeAtras: 10 * 24 * 60 });
    const ultimaSemana = await get(`/api/mesas/ocupacion?desde=${enDias(-6)}&hasta=${hoy()}`);
    expect(ultimaSemana.body.dias).toBe(7);
    expect(ultimaSemana.body.general.cuentas).toBe(3);
    const mes = await get('/api/mesas/ocupacion');
    expect(mes.body.general.cuentas).toBe(4);
    const solo10 = await get(`/api/mesas/ocupacion?desde=${enDias(-10)}&hasta=${enDias(-10)}`);
    expect(solo10.body.general).toMatchObject({ cuentas: 1, minutos_promedio: 120 });
    const futuro = await get(`/api/mesas/ocupacion?desde=${enDias(1)}`);
    expect(futuro.body.general.cuentas).toBe(0);
  });

  it('valida el rango', async () => {
    expect((await get('/api/mesas/ocupacion?desde=ayer')).status).toBe(400);
    expect((await get(`/api/mesas/ocupacion?desde=${hoy()}&hasta=${enDias(-3)}`)).status).toBe(400);
    expect((await get('/api/mesas/ocupacion?desde=2020-01-01&hasta=2026-12-31')).body.error).toMatch(/366 días/);
  });

  it('otra empresa ve el informe vacío', async () => {
    await putOtro('/api/opciones', { valores: { tiempo_ocupacion: true } });
    const res = await getOtro('/api/mesas/ocupacion');
    expect(res.status).toBe(200);
    expect(res.body.general.cuentas).toBe(0);
    expect(res.body.por_mesa.map((m) => m.nombre)).toEqual(['Z1']); // solo su mesa, sin cuentas
  });

  it('apagada, la ruta se corta y el resto de /api/mesas sigue igual', async () => {
    await opciones({ tiempo_ocupacion: false });
    expect((await get('/api/mesas/ocupacion')).status).toBe(403);
    const tablero = await get('/api/mesas');
    expect(tablero.status).toBe(200);
    expect(tablero.body.mesas.length).toBeGreaterThan(0);
  });
});
