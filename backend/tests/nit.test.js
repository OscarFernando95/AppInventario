const { calcularDV } = require('../src/utils/nit');

describe('calcularDV (dígito de verificación del NIT)', () => {
  it('calcula DV conocidos', () => {
    expect(calcularDV('890903938')).toBe('8'); // Bancolombia
    expect(calcularDV('900123456')).toBe('8');
    expect(calcularDV('900')).toBe(calcularDV(900)); // number o string, igual
  });

  it('ignora puntos, guiones y espacios', () => {
    expect(calcularDV('890.903.938')).toBe('8');
    expect(calcularDV(' 890-903-938 ')).toBe('8');
  });

  it('devuelve null si no hay dígitos', () => {
    expect(calcularDV('')).toBeNull();
    expect(calcularDV('abc')).toBeNull();
    expect(calcularDV(null)).toBeNull();
  });
});
