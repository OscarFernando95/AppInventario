import { esc, imprimirHtml } from './imprimir';

/**
 * Comanda de cocina para imprimir (tiquete angosto de 80 mm).
 *
 * `htmlComanda` arma el documento (pura, se prueba sin navegador); `imprimirComanda` lo imprime desde un
 * iframe oculto, así no depende de ventanas emergentes ni deja archivos en el equipo.
 */

const cant = (n) => Number(n).toLocaleString('es-CO', { maximumFractionDigits: 3 });
const hora = (v) => new Date(v).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
const dia = (v) => new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

/**
 * @param {Object} comanda  { id, cuenta, mesero, enviada_en, items: [{ nombre, cantidad, modificadores, nota, anulado }] }
 * @param {Object} [opciones] { empresa, reimpresion }
 */
export function htmlComanda(comanda, { empresa, reimpresion = false } = {}) {
  const items = (comanda.items || []).map((i) => `
    <li class="item${i.anulado ? ' anulado' : ''}">
      <div class="linea"><span class="cant">${esc(cant(i.cantidad))}×</span> <span class="nombre">${esc(i.nombre)}</span>${i.comensal ? ` <span class="tag">P${esc(i.comensal)}</span>` : ''}${i.anulado ? ' <span class="tag">ANULADO</span>' : ''}</div>
      ${(i.modificadores || []).map((m) => `<div class="detalle">+ ${esc(m)}</div>`).join('')}
      ${i.nota ? `<div class="nota">» ${esc(i.nota)}</div>` : ''}
    </li>`).join('');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Comanda #${esc(comanda.id)}</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { font-family: "Courier New", ui-monospace, monospace; font-size: 13px; color: #000; width: 74mm; margin: 0; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 2px; letter-spacing: 1px; }
  .centro { text-align: center; }
  .sub { font-size: 11px; text-align: center; margin: 0 0 4px; }
  .tiempo { font-size: 18px; font-weight: 700; text-align: center; margin: 4px 0; border: 2px solid #000; padding: 2px 0; letter-spacing: 1px; }
  .mesa { font-size: 24px; font-weight: 700; text-align: center; margin: 6px 0; border-top: 2px dashed #000; border-bottom: 2px dashed #000; padding: 4px 0; }
  .meta { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px; }
  ul { list-style: none; padding: 0; margin: 0; }
  .item { margin: 0 0 7px; }
  .linea { font-size: 15px; font-weight: 700; }
  .cant { display: inline-block; min-width: 2.2em; }
  .detalle, .nota { font-size: 12px; padding-left: 2.4em; }
  .nota { font-weight: 700; }
  .anulado .linea { text-decoration: line-through; }
  .tag { font-size: 10px; border: 1px solid #000; padding: 0 3px; }
  .pie { border-top: 2px dashed #000; margin-top: 8px; padding-top: 4px; text-align: center; font-size: 11px; }
</style></head>
<body>
  <h1>COMANDA #${esc(comanda.id)}${reimpresion ? ' (copia)' : ''}</h1>
  ${comanda.estacion ? `<p class="sub"><strong>${esc(String(comanda.estacion).toUpperCase())}</strong></p>` : ''}
  ${comanda.tiempo_nombre ? `<p class="tiempo">${esc(String(comanda.tiempo_nombre).toUpperCase())}</p>` : ''}
  ${empresa ? `<p class="sub">${esc(empresa)}</p>` : ''}
  <div class="mesa">${esc(comanda.cuenta || 'Sin mesa')}</div>
  <div class="meta"><span>${esc(dia(comanda.enviada_en))} ${esc(hora(comanda.enviada_en))}</span><span>${comanda.mesero ? `Atiende: ${esc(comanda.mesero)}` : ''}</span></div>
  <ul>${items}</ul>
  <div class="pie">${(comanda.items || []).filter((i) => !i.anulado).length} ítem(s)</div>
</body></html>`;
}

/** Imprime la comanda con el diálogo del navegador (elige la impresora de cocina/tiquetera). */
export function imprimirComanda(comanda, opciones) {
  imprimirHtml(htmlComanda(comanda, opciones));
}
