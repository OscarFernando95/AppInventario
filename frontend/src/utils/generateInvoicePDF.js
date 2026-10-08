import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCOP, formatDocumento, formatNIT, formatCantidad } from './format';

/**
 * Generates a professional PDF invoice for a sale.
 * @param {Object} venta - The sale data with Cliente, VentaDetalles, Empresa, Usuario
 * @param {Object} empresa - Company info { nombre, nit, contacto }
 * @param {Object} [options] - { autoOpen, save, returnBlob }
 * @returns {string|{fileName:string, blob:Blob}} nombre del archivo, o
 *   `{ fileName, blob }` cuando `returnBlob` — usado por la descarga en lote
 *   (varias facturas en un .zip) sin abrir pestañas ni descargar cada una.
 */
export const generateInvoicePDF = (venta, empresa, options = {}) => {
  // `autoOpen`: abre el PDF en una pestaña nueva. `save`: dispara la descarga.
  // Los tests pasan ambos en `false` para ejercitar la construcción del PDF sin
  // tocar el navegador ni el disco.
  const { autoOpen = true, save = true, returnBlob = false } = options;

  if (!venta || typeof venta !== 'object') {
    throw new Error('generateInvoicePDF: falta el objeto de la venta.');
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentW = pageW - margin * 2;

  // Recorta un texto a un ancho máximo en mm (para no desbordar el encabezado).
  const fit = (txt, maxW, size) => {
    doc.setFontSize(size);
    let s = String(txt ?? '');
    if (doc.getTextWidth(s) <= maxW) return s;
    while (s.length > 1 && doc.getTextWidth(`${s}…`) > maxW) s = s.slice(0, -1);
    return `${s}…`;
  };

  // ──── COLOR PALETTE ────
  const primary = [30, 58, 95];       // Dark navy
  const accent = [59, 130, 246];      // Bright blue
  const lightBg = [243, 246, 252];    // Very light blue-gray
  const textDark = [30, 41, 59];
  const textMuted = [100, 116, 139];
  const white = [255, 255, 255];
  const divider = [226, 232, 240];
  const discountColor = [220, 38, 38]; // Red for discounts

  const invoiceNo = venta.id != null
    ? `FACT-${venta.id.toString().padStart(4, '0')}`
    : 'FACT-BORRADOR';
  const fechaBase = venta.fecha ? new Date(venta.fecha) : new Date();
  const fechaValida = Number.isNaN(fechaBase.getTime()) ? new Date() : fechaBase;
  const fecha = fechaValida.toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // ═══════════════════════════════════════════════
  // HEADER BAR
  // ═══════════════════════════════════════════════
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 38, 'F');

  // Company name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...white);
  doc.text(fit((empresa?.nombre || 'Mi Empresa').toUpperCase(), contentW - 45, 20), margin, 17);

  // Company details
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const companyDetails = [];
  if (empresa?.nit) companyDetails.push(`NIT: ${formatNIT(empresa.nit)}`);
  if (empresa?.contacto) companyDetails.push(empresa.contacto);
  doc.text(companyDetails.join('  •  '), margin, 27);

  // Invoice label on right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('FACTURA DE VENTA', pageW - margin, 17, { align: 'right' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(invoiceNo, pageW - margin, 27, { align: 'right' });

  // ═══════════════════════════════════════════════
  // ACCENT STRIPE
  // ═══════════════════════════════════════════════
  doc.setFillColor(...accent);
  doc.rect(0, 38, pageW, 2.5, 'F');

  let cursorY = 50;

  // ═══════════════════════════════════════════════
  // INFO CARDS (Date/Invoice + Client)
  // ═══════════════════════════════════════════════
  const cardH = 32;
  const cardGap = 6;
  const cardW = (contentW - cardGap) / 2;

  // Left card — Invoice info
  doc.setFillColor(...lightBg);
  doc.roundedRect(margin, cursorY, cardW, cardH, 3, 3, 'F');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...accent);
  doc.text('DATOS DE FACTURA', margin + 6, cursorY + 8);

  doc.setFontSize(9);
  doc.setTextColor(...textDark);
  doc.setFont('helvetica', 'normal');
  doc.text(`N°: ${invoiceNo}`, margin + 6, cursorY + 15);
  doc.text(`Fecha: ${fecha}`, margin + 6, cursorY + 21);

  const cajero = venta.Usuario?.nombre || 'N/A';
  doc.text(`Cajero: ${cajero}`, margin + 6, cursorY + 27);

  // Right card — Client info
  doc.setFillColor(...lightBg);
  doc.roundedRect(margin + cardW + cardGap, cursorY, cardW, cardH, 3, 3, 'F');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...accent);
  doc.text('DATOS DEL CLIENTE', margin + cardW + cardGap + 6, cursorY + 8);

  doc.setFontSize(9);
  doc.setTextColor(...textDark);
  doc.setFont('helvetica', 'normal');
  const clienteName = venta.Cliente?.nombre || 'Cliente Casual';
  const clienteDoc = formatDocumento(venta.Cliente?.documento);
  const clienteTel = venta.Cliente?.telefono || '';
  doc.text(`Nombre: ${clienteName}`, margin + cardW + cardGap + 6, cursorY + 15);
  doc.text(`Doc: ${clienteDoc}`, margin + cardW + cardGap + 6, cursorY + 21);
  if (clienteTel) {
    doc.text(`Tel: ${clienteTel}`, margin + cardW + cardGap + 6, cursorY + 27);
  }
  
  // Payment info
  const paymentMethodNames = {
    '10': 'Efectivo', '42': 'Consignación', '48': 'Tarj. Crédito', '49': 'Tarj. Débito', '47': 'Transf.'
  };
  const formaPagoName = venta.forma_pago === '2' ? 'Crédito' : 'Contado';
  const medioPagoName = paymentMethodNames[venta.medio_pago] || 'Efectivo';
  
  doc.setFont('helvetica', 'bold');
  doc.text('Pago:', margin + cardW + cardGap + 6, cursorY + 33);
  doc.setFont('helvetica', 'normal');
  doc.text(`${formaPagoName} — ${medioPagoName}`, margin + cardW + cardGap + 20, cursorY + 33);

  cursorY += cardH + 15;

  // ═══════════════════════════════════════════════
  // ITEMS TABLE
  // ═══════════════════════════════════════════════
  const detalles = venta.VentaDetalles || [];
  
  // Check if any item has a discount (precio_base differs from precio_unitario)
  const hasItemDiscounts = detalles.some(d => {
    const base = Number(d.precio_base || d.precio_unitario);
    const unit = Number(d.precio_unitario);
    return base !== unit;
  });

  const tableHead = hasItemDiscounts
    ? [['#', 'Descripción', 'Tipo', 'Cant.', 'P. Original', 'P. Venta', 'Dcto.', 'Subtotal']]
    : [['#', 'Descripción', 'Tipo', 'Cant.', 'P. Unitario', 'Subtotal']];

  const tableBody = detalles.map((d, i) => {
    const nombreBase = d.Producto?.nombre_producto || d.Servicio?.nombre || d.nombre || 'Ítem';
    // Platos con extras / "sin ...": se listan debajo del nombre.
    const mods = Array.isArray(d.modificadores) ? d.modificadores.map((m) => m.nombre).filter(Boolean) : [];
    const nombre = mods.length ? `${nombreBase}\n  + ${mods.join(', ')}` : nombreBase;
    const tipo = d.Producto ? 'Producto' : 'Servicio';
    const qty = Number(d.cantidad);
    const unitPrice = Number(d.precio_unitario);
    const basePrice = Number(d.precio_base || d.precio_unitario);
    const lineTotal = qty * unitPrice;

    if (hasItemDiscounts) {
      const discountPct = basePrice > 0 && basePrice !== unitPrice
        ? `-${Math.round((1 - unitPrice / basePrice) * 100)}%`
        : '—';
      return [
        (i + 1).toString(),
        nombre,
        tipo,
        formatCantidad(qty),
        formatCOP(basePrice),
        formatCOP(unitPrice),
        discountPct,
        formatCOP(lineTotal)
      ];
    } else {
      return [
        (i + 1).toString(),
        nombre,
        tipo,
        formatCantidad(qty),
        formatCOP(unitPrice),
        formatCOP(lineTotal)
      ];
    }
  });

  const columnStylesWithDiscount = {
    0: { halign: 'center', cellWidth: 8 },
    2: { cellWidth: 20, fontStyle: 'italic', textColor: textMuted },
    3: { halign: 'center', cellWidth: 13 },
    4: { halign: 'right', cellWidth: 24 },
    5: { halign: 'right', cellWidth: 24 },
    6: { halign: 'center', cellWidth: 14, textColor: discountColor, fontStyle: 'bold' },
    7: { halign: 'right', cellWidth: 24, fontStyle: 'bold' },
  };

  const columnStylesNoDiscount = {
    0: { halign: 'center', cellWidth: 10 },
    2: { cellWidth: 22, fontStyle: 'italic', textColor: textMuted },
    3: { halign: 'center', cellWidth: 16 },
    4: { halign: 'right', cellWidth: 28 },
    5: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
  };

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin },
    head: tableHead,
    body: tableBody,
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
      textColor: textDark,
      lineColor: divider,
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: primary,
      textColor: white,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    columnStyles: hasItemDiscounts ? columnStylesWithDiscount : columnStylesNoDiscount,
    alternateRowStyles: {
      fillColor: [249, 250, 252],
    },
    didDrawPage: () => {},
  });

  cursorY = doc.lastAutoTable.finalY + 10;

  // ═══════════════════════════════════════════════
  // TOTALS SECTION
  // ═══════════════════════════════════════════════
  const subtotalAtBase = detalles.reduce((acc, d) => acc + Number(d.cantidad) * Number(d.precio_base || d.precio_unitario), 0);
  const subtotalAtSale = detalles.reduce((acc, d) => acc + Number(d.cantidad) * Number(d.precio_unitario), 0);
  
  const subtotalBruto = Number(venta.subtotal_bruto) || subtotalAtSale;
  const totalImpuestos = Number(venta.total_impuestos) || 0;
  
  const itemDiscountTotal = subtotalAtBase - subtotalAtSale;
  const globalDiscountPct = Number(venta.descuento_global || 0) || 0;
  const globalDiscountAmount = subtotalAtSale * (globalDiscountPct / 100);
  const total = Number.isFinite(Number(venta.total))
    ? Number(venta.total)
    : Math.max(0, subtotalAtSale - subtotalAtSale * (globalDiscountPct / 100));

  const hasGlobalDiscount = globalDiscountPct > 0;
  const totalsX = pageW - margin - 90;
  const totalsW = 90;

  // Calculate box height dynamically
  let boxH = 12; // base padding
  if (totalImpuestos > 0) {
    boxH += 8; // subtotal bruto line
    boxH += 8; // IVA line
  } else {
    boxH += 8; // standard subtotal line
  }
  
  if (itemDiscountTotal > 0) boxH += 8;
  if (hasGlobalDiscount) boxH += 8;
  boxH += 4; // divider space
  boxH += 10; // total line

  // Si la tabla terminó cerca del pie (facturas con muchas líneas), el bloque de
  // totales se pasaría de página / pisaría el footer: lo llevamos a una hoja nueva.
  if (cursorY + boxH > pageH - 32) {
    doc.addPage();
    cursorY = margin + 8;
  }

  doc.setFillColor(...lightBg);
  doc.roundedRect(totalsX - 4, cursorY - 2, totalsW + 8, boxH, 3, 3, 'F');

  let lineY = cursorY + 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textMuted);

  if (totalImpuestos > 0) {
    doc.text('Subtotal Bruto:', totalsX, lineY);
    doc.setTextColor(...textDark);
    doc.text(formatCOP(subtotalBruto), totalsX + totalsW, lineY, { align: 'right' });
    lineY += 8;
    
    doc.setTextColor(...textMuted);
    doc.text('Total IVA:', totalsX, lineY);
    doc.setTextColor(...textDark);
    doc.text(formatCOP(totalImpuestos), totalsX + totalsW, lineY, { align: 'right' });
    lineY += 8;
  } else {
    doc.text('Subtotal:', totalsX, lineY);
    doc.setTextColor(...textDark);
    doc.text(formatCOP(subtotalAtBase), totalsX + totalsW, lineY, { align: 'right' });
    lineY += 8;
  }

  // Item-level discounts
  if (itemDiscountTotal > 0) {
    doc.setTextColor(...discountColor);
    doc.text('Dcto. por Ítems:', totalsX, lineY);
    doc.text(`-${formatCOP(itemDiscountTotal)}`, totalsX + totalsW, lineY, { align: 'right' });
    lineY += 8;
  }

  // Global discount
  if (hasGlobalDiscount) {
    doc.setTextColor(...discountColor);
    doc.text(`Dcto. Global (${globalDiscountPct}%):`, totalsX, lineY);
    doc.text(`-${formatCOP(globalDiscountAmount)}`, totalsX + totalsW, lineY, { align: 'right' });
    lineY += 8;
  }

  // Divider line
  lineY += 2;
  doc.setDrawColor(...divider);
  doc.setLineWidth(0.5);
  doc.line(totalsX, lineY, totalsX + totalsW, lineY);

  // Total
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...primary);
  doc.text('TOTAL:', totalsX, lineY + 9);
  doc.setTextColor(...accent);
  doc.text(formatCOP(total), totalsX + totalsW, lineY + 9, { align: 'right' });

  // ═══════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════
  const footerY = doc.internal.pageSize.getHeight() - 25;

  // Divider
  doc.setDrawColor(...divider);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY, pageW - margin, footerY);

  // Thank you message
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primary);
  doc.text('¡Gracias por su compra!', pageW / 2, footerY + 8, { align: 'center' });

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textMuted);
  doc.text(
    fit(`Documento generado electrónicamente por ${empresa?.nombre || 'Sistema'} — ${new Date().toLocaleDateString('es-CO')}`, contentW, 7),
    pageW / 2, footerY + 14, { align: 'center' }
  );

  // Numeración de páginas (solo si la factura ocupó más de una hoja).
  const totalPages = doc.internal.getNumberOfPages();
  if (totalPages > 1) {
    for (let i = 1; i <= totalPages; i += 1) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...textMuted);
      doc.text(`Página ${i} de ${totalPages}`, pageW - margin, pageH - 10, { align: 'right' });
    }
  }

  // ═══════════════════════════════════════════════
  // OUTPUT
  // ═══════════════════════════════════════════════
  const fileName = `Factura_${invoiceNo}_${new Date().toISOString().slice(0,10)}.pdf`;

  if (returnBlob) {
    return { fileName, blob: doc.output('blob') };
  }

  if (autoOpen) {
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  if (save) doc.save(fileName);
  return fileName;
};
