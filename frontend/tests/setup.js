// jsdom no implementa las APIs de descarga/preview del navegador que usa jsPDF.
// Las stubbeamos para poder ejercitar la generación del PDF sin abrir pestañas
// ni escribir archivos.
import { vi } from 'vitest';

if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock');
}
if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = vi.fn();
}
globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock');
globalThis.URL.revokeObjectURL = vi.fn();
window.open = vi.fn();

// jsPDF `doc.save()` termina creando un <a download> y "clickeándolo".
// En jsdom el click no navega; lo neutralizamos por si alguna versión lanza.
HTMLAnchorElement.prototype.click = vi.fn();
