// Dígito de verificación (DV) del NIT colombiano — algoritmo oficial DIAN.
// Mismo cálculo que backend/src/utils/nit.js.
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function calcularDV(nit) {
  const digitos = String(nit ?? '').replace(/\D/g, '');
  if (!digitos) return '';

  let suma = 0;
  const invertido = digitos.split('').reverse();
  for (let i = 0; i < invertido.length && i < PESOS.length; i++) {
    suma += Number(invertido[i]) * PESOS[i];
  }
  const resto = suma % 11;
  return String(resto < 2 ? resto : 11 - resto);
}

// Los nombres DANE llegan en MAYÚSCULAS ("SAN ANDRÉS DE TUMACO"). Los dejamos
// legibles sin romper preposiciones ni siglas cortas.
const MINUS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'el', 'en']);

export function titleCase(texto) {
  if (!texto) return '';
  return String(texto)
    .toLowerCase()
    .split(/\s+/)
    .map((palabra, i) => {
      if (i > 0 && MINUS.has(palabra)) return palabra;
      if (palabra.length <= 3 && palabra === palabra.toUpperCase()) return palabra;
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(' ')
    .replace(/\bD\.?c\.?\b/i, 'D.C.');
}
