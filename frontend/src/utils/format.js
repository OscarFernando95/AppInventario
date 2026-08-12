export const formatCOP = (value) => {
  if (value === undefined || value === null) return '$0';
  return new Intl.NumberFormat('es-CO', { 
    style: 'currency', 
    currency: 'COP', 
    maximumFractionDigits: 0 
  }).format(value);
};

/**
 * Format a document number with dot thousand separators.
 * e.g. "1234567890" → "1.234.567.890"
 */
export const formatDocumento = (doc) => {
  if (!doc) return 'Sin documento';
  const cleaned = String(doc).replace(/[^0-9]/g, '');
  if (!cleaned) return String(doc);
  return cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

/**
 * Format a NIT with dot thousand separators and verification digit after hyphen.
 * e.g. "9001234567" → "900.123.456-7"
 */
export const formatNIT = (nit) => {
  if (!nit) return 'Sin NIT';
  const cleaned = String(nit).replace(/[^0-9]/g, '');
  if (cleaned.length < 2) return String(nit);
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted}-${dv}`;
};
