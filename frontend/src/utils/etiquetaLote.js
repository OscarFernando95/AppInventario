import { esc, imprimirHtml } from './imprimir';

const fmtDia = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const cant = (n) => Number(n).toLocaleString('es-CO', { maximumFractionDigits: 3 });

/**
 * Etiqueta de un lote de preparación (para pegar en el recipiente): qué es, cuándo se hizo, cuándo vence y
 * quién lo preparó. Tamaño 60 × 40 mm.
 * @param {Object} lote { id, cantidad, fecha, vence_en, nombre, unidad, usuario }
 */
export function htmlEtiquetaLote(lote, { empresa } = {}) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Lote #${esc(lote.id)}</title>
<style>
  @page { size: 60mm 40mm; margin: 2mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; width: 56mm; margin: 0; }
  .empresa { font-size: 8px; letter-spacing: .5px; text-transform: uppercase; }
  h1 { font-size: 16px; margin: 1px 0 3px; line-height: 1.1; }
  .fila { display: flex; justify-content: space-between; font-size: 10px; margin: 1px 0; }
  .vence { font-size: 15px; font-weight: 700; border: 2px solid #000; text-align: center; margin: 4px 0 2px; padding: 2px 0; }
  .pie { font-size: 8px; text-align: center; }
</style></head>
<body>
  ${empresa ? `<div class="empresa">${esc(empresa)}</div>` : ''}
  <h1>${esc(lote.nombre)}</h1>
  <div class="fila"><span>Cantidad</span><strong>${esc(cant(lote.cantidad))} ${esc(lote.unidad || '')}</strong></div>
  <div class="fila"><span>Elaborado</span><strong>${esc(fmtDia(lote.fecha))}</strong></div>
  ${lote.vence_en ? `<div class="vence">VENCE ${esc(fmtDia(lote.vence_en))}</div>` : '<div class="pie">Sin fecha de vencimiento</div>'}
  <div class="pie">Lote #${esc(lote.id)}${lote.usuario ? ` · ${esc(lote.usuario)}` : ''}</div>
</body></html>`;
}

export function imprimirEtiquetaLote(lote, opciones) {
  imprimirHtml(htmlEtiquetaLote(lote, opciones));
}
