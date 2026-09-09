const { parseListQuery } = require('../src/utils/pagination');

describe('parseListQuery', () => {
  it('aplica el límite por defecto cuando no se envía', () => {
    expect(parseListQuery({})).toEqual({ limit: 200, offset: 0 });
  });

  it('respeta limit y offset válidos', () => {
    expect(parseListQuery({ limit: '25', offset: '50' })).toEqual({ limit: 25, offset: 50 });
  });

  it('acota al máximo permitido', () => {
    expect(parseListQuery({ limit: '99999' }).limit).toBe(1000);
  });

  it('ignora valores no numéricos o negativos', () => {
    expect(parseListQuery({ limit: 'abc', offset: '-5' })).toEqual({ limit: 200, offset: 0 });
  });

  it('permite subir el límite por defecto vía opciones', () => {
    expect(parseListQuery({}, { defaultLimit: 50 }).limit).toBe(50);
  });
});
