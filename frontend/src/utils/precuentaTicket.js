import { esc, imprimirHtml } from './imprimir';
import { formatCOP } from './format';

const cant = (n) => Number(n).toLocaleString('es-CO', { maximumFractionDigits: 3 });
const fechaHora = (v) => new Date(v).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Pre-cuenta («la cuenta, por favor») para imprimir en tiquete de 80 mm: lo consumido, el total y la propina sugerida.
 * No es una factura ni un comprobante de pago. `datos` es la respuesta de POST /api/cuentas/:id/precuenta.
 */
export function htmlPrecuenta(datos) {
  const filas = datos.items.map((i) => `
    <tr>
      <td class="cant">${esc(cant(i.cantidad))}</td>
      <td>${esc(i.nombre)}${i.comensal ? ` <span class="p">P${esc(i.comensal)}</span>` : ''}
        ${(i.componentes || []).map((c) => `<div class="det">· ${esc(cant(c.cantidad))} ${esc(c.nombre)}</div>`).join('')}
        ${(i.modificadores || []).map((m) => `<div class="det">+ ${esc(m)}</div>`).join('')}
      </td>
      <td class="val">${esc(formatCOP(i.subtotal))}</td>
    </tr>`).join('');
  const personas = (datos.por_comensal || []).filter((g) => g.comensal != null);
  const propina = datos.propina_sugerida;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Pre-cuenta ${esc(datos.cuenta)}</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { font-family: "Courier New", ui-monospace, monospace; font-size: 12px; color: #000; width: 74mm; margin: 0; }
  h1 { font-size: 16px; text-align: center; margin: 0; }
  .centro { text-align: center; }
  .sub { font-size: 11px; text-align: center; margin: 1px 0; }
  .titulo { font-size: 15px; font-weight: 700; text-align: center; margin: 6px 0 2px; border-top: 2px dashed #000; padding-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  td { vertical-align: top; padding: 1px 0; }
  .cant { width: 8mm; } .val { text-align: right; white-space: nowrap; }
  .det { font-size: 10px; padding-left: 2mm; } .p { font-size: 10px; border: 1px solid #000; padding: 0 2px; }
  .total { display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; border-top: 2px dashed #000; margin-top: 6px; padding-top: 4px; }
  .linea { display: flex; justify-content: space-between; }
  .pie { text-align: center; font-size: 10px; margin-top: 8px; border-top: 1px dashed #000; padding-top: 4px; }
</style></head>
<body>
  <h1>${esc(datos.empresa?.nombre || '')}</h1>
  ${datos.empresa?.nit ? `<p class="sub">NIT ${esc(datos.empresa.nit)}</p>` : ''}
  <div class="titulo">PRE-CUENTA · ${esc(datos.cuenta)}</div>
  <p class="sub">${esc(fechaHora(datos.impresa_en))}${datos.mesero ? ` · Atiende: ${esc(datos.mesero)}` : ''}</p>
  ${datos.referencia ? `<p class="sub">${esc(datos.referencia)}</p>` : ''}${datos.cliente ? `<p class="sub">Cliente: ${esc(datos.cliente.nombre)}</p>` : ''}
  <table>${filas}</table>
  <div class="total"><span>TOTAL</span><span>${esc(formatCOP(datos.total))}</span></div>
  ${personas.length ? `<div style="margin-top:6px">${personas.map((g) => `<div class="linea"><span>Persona ${esc(g.comensal)}</span><span>${esc(formatCOP(g.pendiente))}</span></div>`).join('')}</div>` : ''}
  ${propina ? `<div style="margin-top:6px"><div class="linea"><span>Propina sugerida (${esc(cant(propina.pct))} %)</span><span>${esc(formatCOP(propina.valor))}</span></div><div class="linea"><strong>Total con propina</strong><strong>${esc(formatCOP(propina.total_con_propina))}</strong></div><p class="sub">La propina es voluntaria.</p></div>` : ''}
  <div class="pie">Este documento no es una factura ni un comprobante de pago.</div>
</body></html>`;
}

export function imprimirPrecuenta(datos) {
  imprimirHtml(htmlPrecuenta(datos));
}
