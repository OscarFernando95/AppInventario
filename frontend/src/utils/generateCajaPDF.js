import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCOP, formatNIT } from './format';
import { etiquetaPago } from './mediosPago';

/**
 * Reporte de cierre (arqueo) de caja en PDF.
 * @param {Object} caja - Respuesta de GET /api/caja/:id (incluye resumen, ventas,
 *   usuario, usuarioCierre y Empresa).
 * @param {Object} [options] - { autoOpen, save, returnBlob } (igual que generateInvoicePDF)
 * @returns {string|{fileName:string, blob:Blob}}
 */
export const generateCajaPDF = (caja, options = {}) => {
  const { autoOpen = true, save = true, returnBlob = false } = options;

  if (!caja || typeof caja !== 'object') {
    throw new Error('generateCajaPDF: falta el objeto de la caja.');
  }

  const empresa = caja.Empresa || {};
  const resumen = caja.resumen || { num_ventas: 0, total_ventas: 0, ventas_efectivo: 0, efectivo_esperado: 0, medios: [] };
  const ventas = caja.ventas || [];
  const movimientos = caja.movimientos || [];
  const abonos = caja.abonos || [];
  const totalAbonos = Number(resumen.abonos_efectivo || 0);
  const totalPropinas = Number(resumen.propinas_efectivo || 0);
  const totalEgresos = Number(resumen.total_egresos || 0);
  const cerrada = caja.estado === 'CERRADA';

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
  const divider = [226, 232, 240];
  const rojo = [220, 38, 38];
  const verde = [5, 150, 105];

  const fit = (txt, maxW, size) => {
    doc.setFontSize(size);
    let s = String(txt ?? '');
    if (doc.getTextWidth(s) <= maxW) return s;
    while (s.length > 1 && doc.getTextWidth(`${s}…`) > maxW) s = s.slice(0, -1);
    return `${s}…`;
  };
  const fmtFecha = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const fmtHora = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  };

  const numero = caja.id != null ? `CAJA-${String(caja.id).padStart(4, '0')}` : 'CAJA-BORRADOR';

  // ──── Encabezado ────
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 38, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...white);
  doc.text(fit((empresa.nombre || 'Mi Empresa').toUpperCase(), contentW - 55, 20), margin, 17);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const detalles = [];
  if (empresa.nit) detalles.push(`NIT: ${formatNIT(empresa.nit)}`);
  if (empresa.contacto) detalles.push(empresa.contacto);
  doc.text(detalles.join('  •  '), margin, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(cerrada ? 'CIERRE DE CAJA' : 'ARQUEO PARCIAL', pageW - margin, 17, { align: 'right' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(numero, pageW - margin, 27, { align: 'right' });
  doc.setFillColor(...accent);
  doc.rect(0, 38, pageW, 2.5, 'F');

  let y = 50;

  // ──── Tarjetas: apertura / cierre ────
  const gap = 6;
  const cardW = (contentW - gap) / 2;
  const cardH = 32;
  const tarjeta = (x, titulo, lineas) => {
    doc.setFillColor(...lightBg);
    doc.roundedRect(x, y, cardW, cardH, 3, 3, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...accent);
    doc.text(titulo, x + 6, y + 8);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textDark);
    lineas.forEach((l, i) => doc.text(fit(l, cardW - 12, 9), x + 6, y + 15 + i * 6));
  };
  tarjeta(margin, 'APERTURA', [
    `Fecha: ${fmtFecha(caja.fecha_apertura)}`,
    `Abrió: ${caja.usuario?.nombre || 'N/A'}`,
    `Base inicial: ${formatCOP(caja.monto_inicial)}`,
  ]);
  tarjeta(margin + cardW + gap, 'CIERRE', cerrada
    ? [`Fecha: ${fmtFecha(caja.fecha_cierre)}`, `Cerró: ${caja.usuarioCierre?.nombre || 'N/A'}`, `Ventas: ${resumen.num_ventas}`]
    : ['Caja aún abierta', `Ventas a la fecha: ${resumen.num_ventas}`, `Generado: ${fmtFecha(new Date())}`]);
  y += cardH + 10;

  // ──── Ventas por medio de pago ────
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primary);
  doc.text('VENTAS POR MEDIO DE PAGO', margin, y);
  y += 3;
  const filasMedios = (resumen.medios || []).map((m) => [etiquetaPago(m.forma_pago, m.medio_pago), String(m.num), formatCOP(m.total)]);
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [[
      'Medio de pago',
      { content: 'N° ventas', styles: { halign: 'center' } },
      { content: 'Total', styles: { halign: 'right' } },
    ]],
    body: filasMedios.length ? filasMedios : [['Sin ventas en este turno', '', '']],
    foot: [[
      'Total vendido',
      { content: String(resumen.num_ventas), styles: { halign: 'center' } },
      { content: formatCOP(resumen.total_ventas), styles: { halign: 'right' } },
    ]],
    theme: 'plain',
    styles: { fontSize: 9, textColor: textDark, cellPadding: 2.5 },
    headStyles: { fillColor: primary, textColor: white, fontStyle: 'bold' },
    footStyles: { fillColor: lightBg, textColor: primary, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' } },
    didDrawCell: (data) => {
      if (data.section === 'body') {
        doc.setDrawColor(...divider);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ──── Cuadre de efectivo ────
  if (y > pageH - 105) { doc.addPage(); y = margin + 4; }
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primary);
  doc.text('CUADRE DE EFECTIVO', margin, y);
  y += 3;
  const diferencia = cerrada ? Number(caja.diferencia || 0) : null;
  const cuadre = [
    ['Base inicial', formatCOP(caja.monto_inicial)],
    ['(+) Ventas en efectivo', formatCOP(resumen.ventas_efectivo)],
    ...(totalPropinas > 0 ? [['(+) Propinas en efectivo (no son ventas)', formatCOP(totalPropinas)]] : []),
    ...(totalAbonos > 0 ? [['(+) Abonos de clientes en efectivo', formatCOP(totalAbonos)]] : []),
    ['(−) Egresos de caja (retiros y pagos)', totalEgresos > 0 ? `-${formatCOP(totalEgresos)}` : formatCOP(0)],
    ['(=) Efectivo esperado', formatCOP(resumen.efectivo_esperado)],
  ];
  if (cerrada) {
    cuadre.push(['Efectivo contado', formatCOP(caja.monto_contado)]);
    cuadre.push([
      diferencia === 0 ? 'Diferencia (cuadra)' : diferencia > 0 ? 'Diferencia (sobrante)' : 'Diferencia (faltante)',
      formatCOP(diferencia),
    ]);
  }
  const idxEsperado = cuadre.findIndex((f) => f[0].startsWith('(=)'));
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: cuadre,
    theme: 'plain',
    styles: { fontSize: 10, textColor: textDark, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    didParseCell: (data) => {
      if (data.row.index === idxEsperado) data.cell.styles.fillColor = lightBg;
      if (cerrada && data.row.index === cuadre.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = diferencia === 0 ? verde : rojo;
      }
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  const obs = [caja.observaciones_apertura && `Apertura: ${caja.observaciones_apertura}`, caja.observaciones_cierre && `Cierre: ${caja.observaciones_cierre}`]
    .filter(Boolean);
  if (obs.length) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...textMuted);
    obs.forEach((o) => {
      const partes = doc.splitTextToSize(`Observaciones — ${o}`, contentW);
      doc.text(partes, margin, y);
      y += partes.length * 4 + 1;
    });
    y += 4;
  }

  // ──── Egresos de caja ────
  if (movimientos.length > 0) {
    if (y > pageH - 60) { doc.addPage(); y = margin + 4; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primary);
    doc.text('EGRESOS DE CAJA', margin, y);
    const tipos = { RETIRO: 'Retiro', GASTO: 'Gasto', COMPRA: 'Compra', DEVOLUCION: 'Devolución', PAGO_PROV: 'Pago proveedor', PROPINA: 'Propinas' };
    autoTable(doc, {
      startY: y + 3,
      margin: { left: margin, right: margin },
      head: [['Hora', 'Tipo', 'Concepto', { content: 'Monto', styles: { halign: 'right' } }]],
      body: movimientos.map((m) => [fmtHora(m.fecha), tipos[m.tipo] || m.tipo, m.concepto, `-${formatCOP(m.monto)}`]),
      theme: 'striped',
      styles: { fontSize: 8.5, textColor: textDark, cellPadding: 2 },
      headStyles: { fillColor: primary, textColor: white },
      alternateRowStyles: { fillColor: lightBg },
      columnStyles: { 3: { halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ──── Abonos de clientes ────
  if (abonos.length > 0) {
    if (y > pageH - 60) { doc.addPage(); y = margin + 4; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primary);
    doc.text('ABONOS DE CLIENTES EN EFECTIVO', margin, y);
    autoTable(doc, {
      startY: y + 3,
      margin: { left: margin, right: margin },
      head: [['Hora', 'Venta', { content: 'Monto', styles: { halign: 'right' } }]],
      body: abonos.map((a) => [fmtHora(a.fecha), `FACT-${String(a.ventaId).padStart(4, '0')}`, formatCOP(a.monto)]),
      theme: 'striped',
      styles: { fontSize: 8.5, textColor: textDark, cellPadding: 2 },
      headStyles: { fillColor: primary, textColor: white },
      alternateRowStyles: { fillColor: lightBg },
      columnStyles: { 2: { halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ──── Detalle de ventas ────
  if (ventas.length > 0) {
    if (y > pageH - 50) { doc.addPage(); y = margin + 4; }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primary);
    doc.text('DETALLE DE VENTAS DEL TURNO', margin, y);
    autoTable(doc, {
      startY: y + 3,
      margin: { left: margin, right: margin },
      head: [['Factura', 'Hora', 'Medio de pago', { content: 'Total', styles: { halign: 'right' } }]],
      body: ventas.map((v) => [`FACT-${String(v.id).padStart(4, '0')}`, fmtHora(v.fecha), etiquetaPago(v.forma_pago, v.medio_pago) + (v.estado === 'ANULADA' ? ' · ANULADA' : ''), formatCOP(v.total)]),
      theme: 'striped',
      styles: { fontSize: 8.5, textColor: textDark, cellPadding: 2 },
      headStyles: { fillColor: primary, textColor: white },
      alternateRowStyles: { fillColor: lightBg },
      columnStyles: { 3: { halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ──── Firmas (solo en el cierre) ────
  if (cerrada) {
    if (y > pageH - 45) { doc.addPage(); y = margin + 4; }
    y = Math.max(y + 14, pageH - 45);
    const firmaW = (contentW - 20) / 2;
    doc.setDrawColor(...textMuted);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + firmaW, y);
    doc.line(pageW - margin - firmaW, y, pageW - margin, y);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textMuted);
    doc.text(fit(`Cajero: ${caja.usuarioCierre?.nombre || caja.usuario?.nombre || ''}`, firmaW, 8), margin + firmaW / 2, y + 5, { align: 'center' });
    doc.text('Revisó / Administrador', pageW - margin - firmaW / 2, y + 5, { align: 'center' });
  }

  // ──── Pie y numeración ────
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textMuted);
    doc.text(
      fit(`Documento generado por ${empresa.nombre || 'Sistema'} — ${new Date().toLocaleDateString('es-CO')}`, contentW - 30, 7),
      margin, pageH - 10
    );
    if (totalPages > 1) doc.text(`Página ${i} de ${totalPages}`, pageW - margin, pageH - 10, { align: 'right' });
  }

  const fileName = `${cerrada ? 'Cierre' : 'Arqueo'}_${numero}_${new Date().toISOString().slice(0, 10)}.pdf`;

  if (returnBlob) return { fileName, blob: doc.output('blob') };
  if (autoOpen) {
    const url = URL.createObjectURL(doc.output('blob'));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  if (save) doc.save(fileName);
  return fileName;
};
