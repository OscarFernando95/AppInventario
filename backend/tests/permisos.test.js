'use strict';

const fs = require('fs');
const path = require('path');
const {
  CATALOGO, TODOS, PERMISOS_BASE, permisosDe, modulosDeAcceso, esSubconjunto, conDependencias,
} = require('../src/services/permisos');

describe('catálogo de permisos', () => {
  it('no repite códigos y cada uno tiene grupo y etiqueta', () => {
    expect(new Set(TODOS).size).toBe(TODOS.length);
    for (const p of CATALOGO) {
      expect(p.grupo).toBeTruthy();
      expect(p.etiqueta).toBeTruthy();
    }
  });

  it('todo permiso que el código exige existe en el catálogo (rutas y controladores)', () => {
    const raiz = path.join(__dirname, '../src');
    const usados = new Set();
    for (const carpeta of ['routes', 'controllers']) {
      for (const archivo of fs.readdirSync(path.join(raiz, carpeta))) {
        const texto = fs.readFileSync(path.join(raiz, carpeta, archivo), 'utf8');
        for (const m of texto.matchAll(/(?:requirePermiso|tiene)\((?:req, )?((?:'[a-z_.]+'(?:, )?)+)\)/g)) {
          for (const codigo of m[1].match(/'([a-z_.]+)'/g)) usados.add(codigo.slice(1, -1));
        }
      }
    }
    expect(usados.size).toBeGreaterThan(8);
    for (const codigo of usados) expect(TODOS, `permiso inexistente: ${codigo}`).toContain(codigo);
  });
});

describe('roles base (reproducen lo de antes)', () => {
  it('el administrador lo tiene todo', () => {
    expect(permisosDe('FRONT_ADMIN', null).sort()).toEqual([...TODOS].sort());
  });

  it('el operativo no tiene nada de administración, pero sigue viendo costos', () => {
    expect(permisosDe('FRONT_USER', null)).toEqual(['costos.ver']);
    for (const p of ['ventas.anular', 'ventas.devolver', 'caja.balance', 'caja.todas', 'auditoria.ver', 'usuarios.gestionar', 'cartera.pagar']) {
      expect(permisosDe('FRONT_USER', null)).not.toContain(p);
    }
  });

  it('un rol de tipo desconocido no tiene permisos', () => {
    expect(permisosDe('OTRO', null)).toEqual([]);
    expect(PERMISOS_BASE.FRONT_USER).toEqual(['costos.ver']);
  });
});

describe('rol propio', () => {
  it('sus permisos reemplazan a los del rol base y se ignoran los que ya no existen', () => {
    const rol = { permisos: ['ventas.devolver', 'permiso.borrado'], modulos: null };
    expect(permisosDe('FRONT_ADMIN', rol)).toEqual(['ventas.devolver']);
  });

  it('sin lista de módulos entra a todos los de la empresa; con lista, solo a esos (más administración)', () => {
    const empresa = ['Ventas', 'Caja', 'Compras', 'Roles y permisos'];
    expect(modulosDeAcceso(empresa, null)).toEqual(empresa);
    expect(modulosDeAcceso(empresa, { modulos: null })).toEqual(empresa);
    expect(modulosDeAcceso(empresa, { modulos: ['Ventas'] })).toEqual(['Ventas', 'Roles y permisos']);
  });

  it('nunca da acceso a un módulo que la empresa no contrató', () => {
    expect(modulosDeAcceso(['Ventas'], { modulos: ['Ventas', 'Caja'] })).toEqual(['Ventas']);
  });
});

describe('esSubconjunto y dependencias', () => {
  it('detecta cuándo un rol entrega más de lo que se tiene', () => {
    expect(esSubconjunto(['a'], ['a', 'b'])).toBe(true);
    expect(esSubconjunto([], [])).toBe(true);
    expect(esSubconjunto(['a', 'c'], ['a', 'b'])).toBe(false);
  });

  it('elegir un módulo agrega los que necesita, también los indirectos', () => {
    expect(conDependencias(['Ventas']).sort()).toEqual(['Clientes', 'Inventario', 'Ventas']);
    expect(conDependencias(['Caja']).sort()).toEqual(['Caja', 'Clientes', 'Inventario', 'Ventas']);
    expect(conDependencias(['Gastos'])).toEqual(['Gastos']);
  });
});
