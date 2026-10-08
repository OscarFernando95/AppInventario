const fs = require('fs');
const path = require('path');
const { describirEvento, EVENTOS_GERENCIALES, eventosDeModulo, MODULOS } = require('../src/utils/auditoriaTexto');

describe('describirEvento (auditoría gerencial)', () => {
  it('una venta se lee como frase: qué, cuánto y a quién', () => {
    const r = describirEvento('venta_creada', { ventaId: 12, total: 45000, clienteNombre: 'Ana Gómez', numItems: 3 });
    expect(r.modulo).toBe('Ventas');
    expect(r.accion).toBe('Registró una venta');
    expect(r.descripcion).toMatch(/^Venta #12 por \$\s?45\.000 a Ana Gómez \(3 ítems\)$/);
  });

  it('sin nombres (eventos viejos) cae al número sin romper', () => {
    expect(describirEvento('venta_creada', { ventaId: 7, total: 1000 }).descripcion).toMatch(/^Venta #7 por/);
    expect(describirEvento('producto_creado', { productoId: 9 }).descripcion).toBe('#9');
    expect(describirEvento('compra_creada', undefined).accion).toBe('Registró una compra');
  });

  it('la acción cambia según el tipo (plato, insumo, merma, pedido parcial)', () => {
    expect(describirEvento('producto_creado', { nombre_producto: 'Capuchino', tipo: 'RECETA' }).accion).toBe('Creó un plato');
    expect(describirEvento('producto_actualizado', { tipo: 'INSUMO' }).accion).toBe('Modificó un insumo');
    expect(describirEvento('ajuste_inventario', { tipo: 'VENCIDO' }).accion).toBe('Registró producto vencido');
    expect(describirEvento('pedido_recibido', { completo: false }).accion).toBe('Recibió un pedido parcialmente');
    expect(describirEvento('pedido_recibido', { completo: true }).accion).toBe('Recibió un pedido completo');
  });

  it('caja: abrir, cerrar con diferencia y retirar', () => {
    expect(describirEvento('caja_abierta', { cajaId: 3, monto_inicial: 50000 }).descripcion).toMatch(/Caja #3 con base de \$\s?50\.000/);
    const faltante = describirEvento('caja_cerrada', { cajaId: 3, total_ventas: 300000, total_egresos: 35000, diferencia: -2000 }).descripcion;
    expect(faltante).toMatch(/vendió \$\s?300\.000/);
    expect(faltante).toMatch(/faltaron \$\s?2\.000/);
    expect(describirEvento('caja_cerrada', { cajaId: 3, total_ventas: 1000, diferencia: 0 }).descripcion).toMatch(/cuadró exacto/);
    expect(describirEvento('caja_retiro', { monto: 20000, concepto: 'Consignación' }).descripcion).toMatch(/Consignación$/);
  });

  it('gastos: categoría y origen del pago', () => {
    const d = describirEvento('gasto_creado', { descripcion: 'Recibo de luz', monto: 150000, categoria: 'SERVICIOS', origen_pago: 'CAJA' }).descripcion;
    expect(d).toMatch(/Recibo de luz por \$\s?150\.000 \(servicios\) · pagado de la caja/);
    expect(describirEvento('gasto_anulado', { descripcion: 'Papelería', monto: 10000 }).accion).toBe('Anuló un gasto');
  });

  it('usuarios: nombre y usuario', () => {
    expect(describirEvento('usuario_creado', { nombre: 'Luis Pérez', username: 'luis' }).descripcion).toBe('Luis Pérez (@luis)');
    expect(describirEvento('usuario_actualizado', { username: 'luis' }).descripcion).toBe('(@luis)');
  });

  it('anulaciones: quién pidió, el motivo y si el dinero salió de la caja', () => {
    const anulada = describirEvento('venta_anulada', {
      ventaId: 12, total: 45000, clienteNombre: 'Ana Gómez', motivo: 'Cliente se arrepintió', solicitadaPor: 'Carlos Cajero', devolucionDeCaja: true,
    });
    expect(anulada.accion).toBe('Anuló una venta');
    expect(anulada.modulo).toBe('Ventas');
    expect(anulada.descripcion).toMatch(/^Venta #12 por \$\s?45\.000 de Ana Gómez · motivo: Cliente se arrepintió · solicitada por Carlos Cajero · dinero devuelto de la caja$/);
    expect(describirEvento('venta_anulacion_solicitada', { ventaId: 3, total: 1000, motivo: 'Error' }).accion).toBe('Pidió anular una venta');
    expect(describirEvento('venta_anulacion_rechazada', { ventaId: 3, comentario: 'Está bien' }).descripcion).toBe('Venta #3 · Está bien');
    expect(describirEvento('venta_anulada', { ventaId: 4, total: 1 }).descripcion).toMatch(/^Venta #4 por/); // sin datos opcionales
  });

  it('los eventos técnicos no son gerenciales', () => {
    for (const tecnico of ['api_error', 'unhandled_error', 'login_fail', 'login_ok', 'password_changed', 'logout_all']) {
      expect(describirEvento(tecnico, {})).toBeNull();
      expect(EVENTOS_GERENCIALES).not.toContain(tecnico);
    }
  });
});

describe('catálogo de eventos', () => {
  it('cada evento pertenece a un módulo filtrable y eventosDeModulo lo encuentra', () => {
    for (const evento of EVENTOS_GERENCIALES) {
      const { modulo } = describirEvento(evento, {});
      expect(MODULOS).toContain(modulo);
      expect(eventosDeModulo(modulo)).toContain(evento);
    }
    expect(eventosDeModulo('Caja').sort()).toEqual(['caja_abierta', 'caja_cerrada', 'caja_retiro']);
  });

  it('todo evento que un controlador audita tiene texto gerencial (o está marcado como solo-backoffice)', () => {
    // Si alguien agrega auditar(req, 'nuevo_evento', …) sin darle texto, esta prueba lo avisa.
    const SOLO_BACKOFFICE = ['empresa_creada', 'empresa_actualizada', 'capital_inicial_cambiado'];
    const dir = path.join(__dirname, '../src/controllers');
    const emitidos = new Set();
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of src.matchAll(/auditar\(req,\s*'([a-z_]+)'/g)) emitidos.add(m[1]);
    }
    expect(emitidos.size).toBeGreaterThan(20);
    const sinTexto = [...emitidos].filter((e) => !EVENTOS_GERENCIALES.includes(e) && !SOLO_BACKOFFICE.includes(e));
    expect(sinTexto).toEqual([]);
  });
});
