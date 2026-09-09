const { assertPasswordPolicy, hashPassword, BCRYPT_ROUNDS } = require('../src/utils/password');
const { ValidationError } = require('../src/utils/errors');
const bcrypt = require('bcrypt');

describe('assertPasswordPolicy', () => {
  it('acepta una contraseña con letra + número y 8+ caracteres', () => {
    expect(() => assertPasswordPolicy('Clave1234')).not.toThrow();
  });

  it('rechaza menos de 8 caracteres', () => {
    expect(() => assertPasswordPolicy('Ab1')).toThrow(ValidationError);
  });

  it('rechaza sólo letras', () => {
    expect(() => assertPasswordPolicy('solamenteletras')).toThrow(ValidationError);
  });

  it('rechaza sólo números', () => {
    expect(() => assertPasswordPolicy('12345678')).toThrow(ValidationError);
  });

  it('rechaza tipos no string', () => {
    expect(() => assertPasswordPolicy(undefined)).toThrow(ValidationError);
    expect(() => assertPasswordPolicy(12345678)).toThrow(ValidationError);
  });
});

describe('hashPassword', () => {
  it('usa 12 rondas de bcrypt y valida la política', async () => {
    expect(BCRYPT_ROUNDS).toBe(12);
    const hash = await hashPassword('Clave1234');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await bcrypt.compare('Clave1234', hash)).toBe(true);
  });

  it('propaga el error de política sin generar hash', async () => {
    await expect(hashPassword('corta')).rejects.toBeInstanceOf(ValidationError);
  });
});
