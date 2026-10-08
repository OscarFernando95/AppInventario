import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCOP, formatNIT, formatCantidad, formatDocumento } from './format';

/**
 * Nota de devolución (comprobante interno) de una devolución parcial o total de una venta.
 * @param {Object} devolucion - de POST/GET /api/ventas/:id/devoluciones (con detalles → linea → Producto/Servicio y usuario)
 * @param {Object} venta - la venta original ({ id, Cliente?, total, fecha })
 * @param {Object} empresa - { nombre, nit, contacto }
 * @param {Object} [options] - { autoOpen, save, returnBlob } (igual que generateInvoicePDF)
 */
export const generateDevolucionPDF = (devolucion, venta, empresa, options = {}) => {
  const { autoOpen = true, save = true, returnBlob = false } = options;
  if (!devolucion || typeof devolucion !== 'object') throw new Error('generateDevolucionPDF: falta la devolución.');

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

  const fit = (txt, maxW, size) => {
    doc.setFontSize(size);
    let s = String(txt ?? '');
    if (doc.getTextWidth(s) <= maxW) return s;
    while (s.length > 1 && doc.getTextWidth(`${s}…`) > maxW) s = s.slice(0, -1);
    return `${s}…`;
  };
  const numero = `DEV-${String(devolucion.id ?? 0).padStart(4, '0')}`;
  const factura = `FACT-${String(venta?.id ?? devolucion.ventaId ?? 0).padStart(4, '0')}`;
  const fecha = devolucion.fecha ? new Date(devolucion.fecha) : new Date();
  const fechaTxt = Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleString('es-CO', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 38, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...white);
  doc.text(fit((empresa?.nombre || 'Mi Empresa').toUpperCase(), contentW - 60, 20), margin, 17);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const det = [];
  if (empresa?.nit) det.push(`NIT: ${formatNIT(empresa.nit)}`);
  if (empresa?.contacto) det.push(empresa.contacto);
  doc.text(det.join('  •  '), margin, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('NOTA DE DEVOLUCIÓN', pageW - margin, 17, { align: 'right' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(numero, pageW - margin, 27, { align: 'right' });
  doc.setFillColor(...accent);
  doc.rect(0, 38, pageW, 2.5, 'F');

  let y = 50;
  const cardW = (contentW - 6) / 2;
  const tarjeta = (x, titulo, lineas) => {
    doc.setFillColor(...lightBg);
    doc.roundedRect(x, y, cardW, 32, 3, 3, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...accent);
    doc.text(titulo, x + 6, y + 8);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textDark);
    lineas.forEach((l, i) => doc.text(fit(l, cardW - 12, 9), x + 6, y + 15 + i * 6));
  };
  tarjeta(margin, 'DEVOLUCIÓN', [`N°: ${numero}`, `Fecha: ${fechaTxt}`, `Registró: ${devolucion.usuario?.nombre || 'N/A'}`]);
  tarjeta(margin + cardW + 6, 'VENTA ORIGINAL', [
    `Factura: ${factura}`,
    `Cliente: ${venta?.Cliente?.nombre || 'Cliente casual'}`,
    venta?.Cliente?.documento ? `Documento: ${formatDocumento(venta.Cliente.documento)}` : `Total venta: ${formatCOP(venta?.total ?? 0)}`,
  ]);
  y += 40;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primary);
  doc.text('PRODUCTOS DEVUELTOS', margin, y);
  const detalles = devolucion.detalles || [];
  autoTable(doc, {
    startY: y + 3,
    margin: { left: margin, right: margin },
    head: [['Concepto', { content: 'Cant.', styles: { halign: 'center' } }, { content: 'Reingresó', styles: { halign: 'center' } }, { content: 'Valor', styles: { halign: 'right' } }]],
    body: detalles.length
      ? detalles.map((d) => [
        d.linea?.Producto?.nombre_producto || d.linea?.Servicio?.nombre || 'Ítem',
        formatCantidad(d.cantidad),
        Number(d.reingresada) > 0 ? formatCantidad(d.reingresada) : 'No',
        formatCOP(d.valor),
      ])
      : [['Sin líneas', '', '', '']],
    foot: [['Total devuelto', '', '', formatCOP(devolucion.total)]],
    theme: 'striped',
    styles: { fontSize: 9, textColor: textDark, cellPadding: 2.5 },
    headStyles: { fillColor: primary, textColor: white },
    footStyles: { fillColor: lightBg, textColor: primary, fontStyle: 'bold', halign: 'right' },
    alternateRowStyles: { fillColor: lightBg },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 10;

  // Qué pasó con el dinero
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primary);
  doc.text('DINERO', margin, y);
  const filas = [];
  if (Number(devolucion.credito_reducido) > 0) filas.push(['Descontado de lo que el cliente debía', formatCOP(devolucion.credito_reducido)]);
  if (Number(devolucion.dinero_devuelto) > 0) {
    filas.push([`Devuelto al cliente ${devolucion.reembolso === 'CAJA' ? '(efectivo de la caja)' : '(por otro medio)'}`, formatCOP(devolucion.dinero_devuelto)]);
  }
  if (filas.length === 0) filas.push(['Sin movimiento de dinero', formatCOP(0)]);
  autoTable(doc, {
    startY: y + 3,
    margin: { left: margin, right: margin },
    body: filas,
    theme: 'plain',
    styles: { fontSize: 9.5, textColor: textDark, cellPadding: 2.5 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  });
  y = doc.lastAutoTable.finalY + 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...textDark);
  doc.text('Motivo:', margin, y);
  doc.setFont('helvetica', 'normal');
  const partes = doc.splitTextToSize(devolucion.motivo || '—', contentW - 18);
  doc.text(partes, margin + 16, y);

  const paginas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= paginas; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textMuted);
    doc.text(fit(`Comprobante interno generado por ${empresa?.nombre || 'Sistema'} — no reemplaza una nota crédito electrónica`, contentW - 30, 7), margin, pageH - 10);
    if (paginas > 1) doc.text(`Página ${i} de ${paginas}`, pageW - margin, pageH - 10, { align: 'right' });
  }

  const fileName = `NotaDevolucion_${numero}_${new Date().toISOString().slice(0, 10)}.pdf`;
  if (returnBlob) return { fileName, blob: doc.output('blob') };
  if (autoOpen) {
    const url = URL.createObjectURL(doc.output('blob'));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  if (save) doc.save(fileName);
  return fileName;
};
