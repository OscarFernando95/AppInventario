/**
 * Imprime un documento HTML desde un iframe oculto: no depende de ventanas emergentes ni deja archivos en el
 * equipo. El diálogo del navegador deja elegir la impresora (tiquetera de cocina, de etiquetas, etc.).
 */
export function imprimirHtml(html) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);

  const limpiar = () => setTimeout(() => iframe.remove(), 1000);
  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      limpiar();
    }
  };
  iframe.srcdoc = html;
}

/** Escapa texto para meterlo en HTML. */
export const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
