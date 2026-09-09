// Extrae el mensaje de error legible que envía el backend
// (`{ error: '...' }`, mapeado por src/middlewares/errorHandler.js).
// Antes las páginas hacían `alert('Error al guardar X')` y se perdía el motivo real.
export function apiError(err, fallback = 'No se pudo completar la operación') {
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    fallback
  );
}
