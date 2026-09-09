const { flattenCiiu } = require('../src/utils/ciiu');
const ciiuTree = require('../src/seeders/data/ciiu-rev4ac.json');
const divipola = require('../src/seeders/data/divipola.json');
const { empresaCreate } = require('../src/schemas/empresaSchemas');

describe('flattenCiiu', () => {
  const lista = flattenCiiu(ciiuTree);

  it('produce cientos de actividades con código de 4 dígitos', () => {
    expect(lista.length).toBeGreaterThan(400);
    for (const a of lista) {
      expect(a.codigo).toMatch(/^\d{4}$/);
      expect(typeof a.descripcion).toBe('string');
      expect(a.descripcion.length).toBeGreaterThan(0);
    }
  });

  it('no repite códigos', () => {
    const codigos = lista.map((a) => a.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('tolera un árbol vacío', () => {
    expect(flattenCiiu({})).toEqual([]);
    expect(flattenCiiu(null)).toEqual([]);
  });
});

describe('datos DIVIPOLA', () => {
  it('trae 33 departamentos y >1000 municipios', () => {
    const deptos = new Set(divipola.map((r) => r.departamentoDANE));
    expect(deptos.size).toBe(33);
    expect(divipola.length).toBeGreaterThan(1000);
  });

  it('cada municipio referencia un departamento existente', () => {
    const deptos = new Set(divipola.map((r) => r.departamentoDANE));
    for (const r of divipola) {
      expect(r.municipioDANE).toMatch(/^\d{5}$/);
      expect(deptos.has(r.departamentoDANE)).toBe(true);
    }
  });
});

describe('empresaCreate — tipo_empresa', () => {
  it('acepta SIMPLE sin datos DIAN', () => {
    expect(empresaCreate.safeParse({ nombre: 'X', tipo_empresa: 'SIMPLE' }).success).toBe(true);
  });

  it('exige los datos de la resolución DIAN para FACTURACION_ELECTRONICA (N14)', () => {
    expect(empresaCreate.safeParse({ nombre: 'X', tipo_empresa: 'FACTURACION_ELECTRONICA' }).success).toBe(false);
    const completa = empresaCreate.safeParse({
      nombre: 'X', tipo_empresa: 'FACTURACION_ELECTRONICA',
      resolucion_numero: '18760000001', prefijo_facturacion: 'SETP',
      rango_desde: 1, rango_hasta: 5000, clave_tecnica: 'fc8eac42',
    });
    expect(completa.success).toBe(true);
  });

  it('rechaza un tipo desconocido', () => {
    expect(empresaCreate.safeParse({ nombre: 'X', tipo_empresa: 'OTRO' }).success).toBe(false);
  });

  it('descarta campos desconocidos y deja modulosIds numéricos', () => {
    const r = empresaCreate.safeParse({ nombre: 'X', id: 9, modulosIds: ['1', '2'] });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('id');
    expect(r.data.modulosIds).toEqual([1, 2]);
  });
});
