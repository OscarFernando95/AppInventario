'use strict';

/**
 * Dígito de verificación (DV) del NIT colombiano — algoritmo oficial DIAN.
 *
 * Pesos aplicados de derecha a izquierda, suma, módulo 11:
 *   - resto 0 o 1  -> DV = resto
 *   - resto >= 2   -> DV = 11 - resto
 *
 * Devuelve el DV como string ('0'..'9') o null si el NIT no es numérico.
 */
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

function calcularDV(nit) {
  const digitos = String(nit == null ? '' : nit).replace(/\D/g, '');
  if (!digitos) return null;

  let suma = 0;
  const invertido = digitos.split('').reverse();
  for (let i = 0; i < invertido.length && i < PESOS.length; i++) {
    suma += Number(invertido[i]) * PESOS[i];
  }
  const resto = suma % 11;
  return String(resto < 2 ? resto : 11 - resto);
}

module.exports = { calcularDV };
