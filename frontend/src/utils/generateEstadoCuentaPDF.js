import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCOP, formatNIT, formatDocumento } from './format';
import { MEDIOS_PAGO } from './mediosPago';

/**
 * Estado de cuenta de un cliente (lo que debe) o de un proveedor (lo que se le debe), en PDF.
 * @param {'COBRAR'|'PAGAR'} tipo
 * @param {Object} datos - respuesta de GET /cuentas-por-(cobrar|pagar)/(clientes|proveedores)/:id/estado-cuenta
 * @param {Object} empresa - { nombre, nit, contacto }
 * @param {Object} [options] - { autoOpen, save, returnBlob } (igual que generateInvoicePDF)
 */
export const generateEstadoCuentaPDF = (tipo, datos, empresa, options = {}) => {
  const { autoOpen = true, save = true, returnBlob = false } = options;
  if (!datos || typeof datos !== 'object') throw new Error('generateEstadoCuentaPDF: faltan los datos del estado de cuenta.');

  const cobrar = tipo === 'COBRAR';
  const tercero = cobrar ? datos.cliente : datos.proveedor;
  const docs = (cobrar ? datos.ventas : datos.compras) || [];
  const movimientos = (d) => d.abonos || d.pagos || [];
  const total = cobrar ? datos.total_credito : datos.total_credito;
  const pagado = cobrar ? datos.total_abonado : datos.total_pagado;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentW = pageW - margin * 2;

  const primary = [30, 58, 95];
  const accent = [59, 130, 246];
  const lightBg = [243, 246, 252];
  const textDark = [30, 41, 59];
  const textMuted = [100, 116, 139];
  const white = [255, 255, 255];
  const rojo = [220, 38, 38];

  const fit = (txt, maxW, size) => {
    doc.setFontSize(size);
    let s = String(txt ?? '');
    if (doc.getTextWidth(s) <= maxW) return s;
    while (s.length > 1 && doc.getTextWidth(`${s}…`) > maxW) s = s.slice(0, -1);
    return `${s}…`;
  };
  const fmtDia = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const numDoc = (id) => `${cobrar ? 'FACT' : 'COMP'}-${String(id).padStart(4, '0')}`;

  // ──── Encabezado ────
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 38, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...white);
  doc.text(fit((empresa?.nombre || 'Mi Empresa').toUpperCase(), contentW - 55, 20), margin, 17);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const det = [];
  if (empresa?.nit) det.push(`NIT: ${formatNIT(empresa.nit)}`);
  if (empresa?.contacto) det.push(empresa.contacto);
  doc.text(det.join('  •  '), margin, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('ESTADO DE CUENTA', pageW - margin, 17, { align: 'right' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(cobrar ? 'Cuentas por cobrar' : 'Cuentas por pagar', pageW - margin, 27, { align: 'right' });
  doc.setFillColor(...accent);
  doc.rect(0, 38, pageW, 2.5, 'F');

  // ──── Tercero + resumen ────
  let y = 50;
  doc.setFillColor(...lightBg);
  doc.roundedRect(margin, y, contentW, 30, 3, 3, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...accent);
  doc.text(cobrar ? 'CLIENTE' : 'PROVEEDOR', margin + 6, y + 8);
  doc.setFontSize(12);
  doc.setTextColor(...textDark);
  doc.text(fit(tercero?.nombre || '—', contentW / 2 - 8, 12), margin + 6, y + 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...textMuted);
  const docTercero = cobrar ? (tercero?.documento ? `Documento: ${formatDocumento(tercero.documento)}` : '') : (tercero?.nit ? `NIT: ${tercero.nit}` : '');
  doc.text([docTercero, tercero?.telefono ? `Tel: ${tercero.telefono}` : ''].filter(Boolean).join('   '), margin + 6, y + 22);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}`, margin + 6, y + 27);

  const kpi = (x, etiqueta, valor, color = textDark) => {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textMuted);
    doc.text(etiqueta, x, y + 8);
    doc.setFontSize(11);
    doc.setTextColor(...color);
    doc.text(valor, x, y + 15);
  };
  const colX = margin + contentW / 2 + 4;
  kpi(colX, cobrar ? 'TOTAL A CRÉDITO' : 'TOTAL COMPRADO A CRÉDITO', formatCOP(total));
  kpi(colX + 42, cobrar ? 'ABONADO' : 'PAGADO', formatCOP(pagado));
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...textMuted);
  doc.text(cobrar ? 'SALDO QUE DEBE' : 'SALDO QUE SE DEBE', colX, y + 22);
  doc.setFontSize(13);
  doc.setTextColor(...primary);
  doc.text(formatCOP(datos.saldo), colX, y + 28);
  if (Number(datos.vencido) > 0) {
    doc.setFontSize(7);
    doc.setTextColor(...textMuted);
    doc.text('VENCIDO', colX + 42, y + 22);
    doc.setFontSize(11);
    doc.setTextColor(...rojo);
    doc.text(formatCOP(datos.vencido), colX + 42, y + 28);
  }
  y += 38;

  if (cobrar && datos.cupo_credito != null) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textMuted);
    doc.text(`Cupo de crédito: ${formatCOP(datos.cupo_credito)}  •  Disponible: ${formatCOP(datos.cupo_disponible)}`, margin, y);
    y += 6;
  }

  // ──── Documentos ────
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primary);
  doc.text(cobrar ? 'VENTAS A CRÉDITO' : 'COMPRAS A CRÉDITO', margin, y + 2);
  autoTable(doc, {
    startY: y + 5,
    margin: { left: margin, right: margin },
    head: [[cobrar ? 'Factura' : 'Compra', 'Fecha', 'Vence', { content: 'Mora', styles: { halign: 'center' } }, { content: 'Total', styles: { halign: 'right' } },
      { content: cobrar ? 'Abonado' : 'Pagado', styles: { halign: 'right' } }, { content: 'Saldo', styles: { halign: 'right' } }]],
    body: docs.length
      ? docs.map((d) => [
        numDoc(d.id), fmtDia(d.fecha), fmtDia(d.fecha_vencimiento),
        d.saldo_pendiente > 0 && d.dias_mora > 0 ? `${d.dias_mora} d` : '—',
        formatCOP(d.total), formatCOP(cobrar ? d.abonado : d.pagado), formatCOP(d.saldo_pendiente),
      ])
      : [['Sin movimientos a crédito', '', '', '', '', '', '']],
    theme: 'striped',
    styles: { fontSize: 8.5, textColor: textDark, cellPadding: 2 },
    headStyles: { fillColor: primary, textColor: white },
    alternateRowStyles: { fillColor: lightBg },
    columnStyles: { 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3 && String(data.cell.raw).endsWith(' d')) data.cell.styles.textColor = rojo;
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  // ──── Abonos / pagos ────
  const filasMov = docs.flatMap((d) => movimientos(d).map((m) => ({ ...m, doc: d.id })))
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  if (filasMov.length > 0) {
    if (y > pageH - 50) { doc.addPage(); y = margin + 4; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primary);
    doc.text(cobrar ? 'ABONOS RECIBIDOS' : 'PAGOS REALIZADOS', margin, y + 2);
    autoTable(doc, {
      startY: y + 5,
      margin: { left: margin, right: margin },
      head: [['Fecha', cobrar ? 'Factura' : 'Compra', cobrar ? 'Medio' : 'Origen', 'Nota', { content: 'Monto', styles: { halign: 'right' } }]],
      body: filasMov.map((m) => [
        fmtDia(m.fecha), numDoc(m.doc),
        cobrar ? (MEDIOS_PAGO[m.medio_pago] || m.medio_pago) : (m.origen === 'CAJA' ? 'Efectivo de caja' : 'Banco / otro'),
        m.nota || '', formatCOP(m.monto),
      ]),
      theme: 'striped',
      styles: { fontSize: 8.5, textColor: textDark, cellPadding: 2 },
      headStyles: { fillColor: primary, textColor: white },
      alternateRowStyles: { fillColor: lightBg },
      columnStyles: { 4: { halign: 'right' } },
    });
  }

  // ──── Pie y numeración ────
  const paginas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= paginas; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textMuted);
    doc.text(fit(`Documento informativo generado por ${empresa?.nombre || 'Sistema'}`, contentW - 30, 7), margin, pageH - 10);
    if (paginas > 1) doc.text(`Página ${i} de ${paginas}`, pageW - margin, pageH - 10, { align: 'right' });
  }

  const nombreArchivo = String(tercero?.nombre || 'tercero').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40);
  const fileName = `EstadoCuenta_${cobrar ? 'Cliente' : 'Proveedor'}_${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.pdf`;

  if (returnBlob) return { fileName, blob: doc.output('blob') };
  if (autoOpen) {
    const url = URL.createObjectURL(doc.output('blob'));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  if (save) doc.save(fileName);
  return fileName;
};
