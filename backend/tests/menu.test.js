const { rigeAhora, aplicaAProducto, precioConRegla, promoVigente } = require('../src/services/precios');
const { categoria, precioHorario, precioHorarioUpdate } = require('../src/schemas/menuSchemas');

// Miércoles 8 de octubre de 2026 (getDay() = 3), a distintas horas locales.
const miercoles = (h, m = 0) => new Date(2026, 9, 7, h, m);
const jueves = (h, m = 0) => new Date(2026, 9, 8, h, m);

const happy = { id: 1, nombre: 'Happy hour', tipo: 'PORCENTAJE', valor: 30, dias: [3, 4, 5], hora_inicio: '17:00', hora_fin: '19:00', producto_ids: [], categoria_ids: [], activo: true };

describe('rigeAhora', () => {
  it('rige dentro de la franja y el día, incluidos los bordes', () => {
    expect(rigeAhora(happy, miercoles(17, 0))).toBe(true);
    expect(rigeAhora(happy, miercoles(18, 30))).toBe(true);
    expect(rigeAhora(happy, miercoles(19, 0))).toBe(true);
    expect(rigeAhora(happy, miercoles(16, 59))).toBe(false);
    expect(rigeAhora(happy, miercoles(19, 1))).toBe(false);
  });
  it('no rige en un día que no está en la regla', () => {
    expect(rigeAhora({ ...happy, dias: [1] }, miercoles(18))).toBe(false);
  });
  it('una franja que cruza la medianoche cuenta para el día en que empieza', () => {
    const noche = { ...happy, dias: [3], hora_inicio: '22:00', hora_fin: '02:00' }; // empieza el miércoles
    expect(rigeAhora(noche, miercoles(23, 0))).toBe(true); // miércoles 11 pm
    expect(rigeAhora(noche, jueves(1, 0))).toBe(true); // jueves 1 am (todavía la de ayer)
    expect(rigeAhora(noche, jueves(3, 0))).toBe(false);
    expect(rigeAhora(noche, miercoles(1, 0))).toBe(false); // miércoles 1 am pertenece a la noche del martes
  });
});

describe('alcance y precio', () => {
  it('sin listas aplica a todos; con listas, solo a esos productos o categorías', () => {
    expect(aplicaAProducto(happy, { id: 9, categoriaId: null })).toBe(true);
    expect(aplicaAProducto({ ...happy, producto_ids: [9] }, { id: 9 })).toBe(true);
    expect(aplicaAProducto({ ...happy, producto_ids: [9] }, { id: 8 })).toBe(false);
    expect(aplicaAProducto({ ...happy, categoria_ids: [3] }, { id: 8, categoriaId: 3 })).toBe(true);
    expect(aplicaAProducto({ ...happy, categoria_ids: [3] }, { id: 8, categoriaId: null })).toBe(false);
  });
  it('porcentaje y precio fijo; una oferta nunca sube el precio', () => {
    expect(precioConRegla(happy, 10000)).toBe(7000);
    expect(precioConRegla({ tipo: 'PRECIO_FIJO', valor: 5000 }, 12000)).toBe(5000);
    expect(precioConRegla({ tipo: 'PRECIO_FIJO', valor: 15000 }, 12000)).toBe(12000);
  });
  it('gana la oferta más barata de las que rigen; sin ofertas vigentes, nada', () => {
    const fija = { ...happy, id: 2, nombre: 'Cerveza a 4.000', tipo: 'PRECIO_FIJO', valor: 4000, producto_ids: [7] };
    const prod = { id: 7, categoriaId: null, precio_unitario: 8000 };
    expect(promoVigente(prod, [happy, fija], miercoles(18))).toEqual({ precio: 4000, promo: 'Cerveza a 4.000', reglaId: 2 });
    expect(promoVigente(prod, [happy, fija], miercoles(12))).toBeNull();
    expect(promoVigente(prod, [{ ...happy, activo: false }], miercoles(18))).toBeNull();
    expect(promoVigente({ ...prod, precio_unitario: 3000 }, [fija], miercoles(18))).toBeNull(); // no rebaja nada
  });
});

describe('esquemas del menú', () => {
  it('categoría: nombre obligatorio', () => {
    expect(categoria.safeParse({ nombre: 'Bebidas' }).success).toBe(true);
    expect(categoria.safeParse({ nombre: '  ' }).success).toBe(false);
  });
  it('oferta: horas HH:MM distintas, días válidos, % entre 0 y 100', () => {
    const base = { nombre: 'Happy', tipo: 'PORCENTAJE', valor: 30, dias: [5, 3, 3], hora_inicio: '17:00', hora_fin: '19:00' };
    expect(precioHorario.parse(base).dias).toEqual([3, 5]); // sin repetidos y ordenados
    expect(precioHorario.safeParse({ ...base, valor: 120 }).success).toBe(false);
    expect(precioHorario.safeParse({ ...base, hora_inicio: '25:00' }).success).toBe(false);
    expect(precioHorario.safeParse({ ...base, hora_fin: '17:00' }).success).toBe(false);
    expect(precioHorario.safeParse({ ...base, dias: [] }).success).toBe(false);
    expect(precioHorario.safeParse({ ...base, tipo: 'PRECIO_FIJO', valor: 4500 }).success).toBe(true);
    expect(precioHorarioUpdate.safeParse({ activo: false }).success).toBe(true);
  });
});
