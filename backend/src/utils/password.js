'use strict';

const bcrypt = require('bcrypt');
const { ValidationError } = require('./errors');

// Coste de bcrypt. 12 es el valor recomendado actual para APIs.
const BCRYPT_ROUNDS = 12;

const MIN_LEN = 8;

/**
 * Valida la política de contraseñas. Lanza ValidationError si no cumple.
 * Regla: mínimo 8 caracteres, con al menos una letra y al menos un número.
 */
function assertPasswordPolicy(plain) {
  if (typeof plain !== 'string' || plain.length < MIN_LEN) {
    throw new ValidationError(`La contraseña debe tener al menos ${MIN_LEN} caracteres.`);
  }
  if (!/[A-Za-zÀ-ÿ]/.test(plain) || !/[0-9]/.test(plain)) {
    throw new ValidationError('La contraseña debe incluir al menos una letra y un número.');
  }
}

/** Valida la política y devuelve el hash bcrypt. */
async function hashPassword(plain) {
  assertPasswordPolicy(plain);
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

module.exports = { BCRYPT_ROUNDS, assertPasswordPolicy, hashPassword };
