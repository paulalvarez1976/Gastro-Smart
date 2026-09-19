import { jsPDF } from 'jspdf';
import { ReceiptData } from './thermalPrinter';

/**
 * Generates and downloads a formatted PDF ticket matching thermal receipt styling.
 * Supports standard thermal 58mm and 80mm roll dimensions.
 */
export function downloadReceiptPdf(data: ReceiptData, rollWidth: '58mm' | '80mm' = '58mm'): void {
  const widthMm = rollWidth === '58mm' ? 58 : 80;
  
  // Calculate dynamic receipt height based on content
  const headerHeight = 45;
  const itemsHeight = data.items.reduce((sum, item) => sum + (item.notas ? 11 : 7), 0);
  const totalsHeight = data.isKitchenTicket ? 20 : 45;
  const footerHeight = 25;
  const totalHeightMm = Math.max(100, headerHeight + itemsHeight + totalsHeight + footerHeight);

  // Initialize jsPDF with custom receipt roll dimensions
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [widthMm, totalHeightMm],
    compress: true
  });

  const margin = 4;
  const contentWidth = widthMm - (margin * 2);
  const centerX = widthMm / 2;
  let y = 6;

  // Set thermal style monospace font
  doc.setFont('courier', 'bold');

  // Restaurant Header
  doc.setFontSize(rollWidth === '58mm' ? 11 : 13);
  doc.text(data.restaurantName || 'RESTAURANTE', centerX, y, { align: 'center', maxWidth: contentWidth });
  y += 5;

  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  if (data.restaurantAddress) {
    doc.text(data.restaurantAddress, centerX, y, { align: 'center', maxWidth: contentWidth });
    y += 4;
  }
  if (data.restaurantPhone) {
    doc.text(`Tel: ${data.restaurantPhone}`, centerX, y, { align: 'center', maxWidth: contentWidth });
    y += 4;
  }

  // Header Banner: COMANDA vs COMPROBANTE
  y += 1;
  doc.setFont('courier', 'bold');
  doc.setFontSize(9);
  const bannerText = data.isKitchenTicket ? '*** COMANDA COCINA ***' : 'COMPROBANTE DE PAGO';
  doc.text(bannerText, centerX, y, { align: 'center' });
  y += 4;

  // Dashed separator
  const separator = '-'.repeat(rollWidth === '58mm' ? 32 : 44);
  doc.setFontSize(8);
  doc.setFont('courier', 'normal');
  doc.text(separator, centerX, y, { align: 'center' });
  y += 4;

  // Order Details
  doc.setFontSize(8);
  const orderNumStr = `ORDEN: #${data.orderNumber}`;
  const tableStr = data.mesaNumero ? `MESA: ${data.mesaNumero}` : (data.tipoEntrega === 'delivery' ? 'DELIVERY' : 'MOSTRADOR');
  doc.text(orderNumStr, margin, y);
  doc.text(tableStr, widthMm - margin, y, { align: 'right' });
  y += 4;

  const dateObj = new Date(data.fecha);
  const dateStr = `Fecha: ${dateObj.toLocaleDateString()}`;
  const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  doc.text(dateStr, margin, y);
  doc.text(timeStr, widthMm - margin, y, { align: 'right' });
  y += 4;

  if (data.mozoNombre) {
    doc.text(`Mozo: ${data.mozoNombre}`, margin, y);
    y += 3.5;
  }
  if (data.cajeroNombre) {
    doc.text(`Caja: ${data.cajeroNombre}`, margin, y);
    y += 3.5;
  }
  if (data.comensalNombre) {
    doc.text(`Comensal: ${data.comensalNombre}`, margin, y);
    y += 3.5;
  }
  if (data.clienteTelefono) {
    doc.text(`Tel: ${data.clienteTelefono}`, margin, y);
    y += 3.5;
  }

  // Dashed separator
  doc.text(separator, centerX, y, { align: 'center' });
  y += 3.5;

  // Table header
  doc.setFont('courier', 'bold');
  doc.text('CANT / DESCRIPCION', margin, y);
  doc.text('TOTAL', widthMm - margin, y, { align: 'right' });
  y += 3.5;
  doc.setFont('courier', 'normal');
  doc.text(separator, centerX, y, { align: 'center' });
  y += 3.5;

  // Items List
  data.items.forEach(item => {
    const desc = `${item.cantidad}x ${item.nombre}`;
    const price = `$${item.subtotal.toFixed(2)}`;
    
    // Max characters before price column
    const maxChars = rollWidth === '58mm' ? 20 : 30;
    const truncatedDesc = desc.length > maxChars ? desc.substring(0, maxChars - 2) + '..' : desc;
    
    doc.setFont('courier', 'bold');
    doc.text(truncatedDesc, margin, y);
    doc.text(price, widthMm - margin, y, { align: 'right' });
    y += 3.5;

    if (item.notas) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      doc.text(`* ${item.notas}`, margin + 3, y, { maxWidth: contentWidth - 4 });
      y += 3.5;
      doc.setFontSize(8);
    }
  });

  // Dashed separator
  doc.setFont('courier', 'normal');
  doc.text(separator, centerX, y, { align: 'center' });
  y += 4;

  // Totals Section
  if (!data.isKitchenTicket) {
    doc.text('Subtotal:', margin, y);
    doc.text(`$${data.subtotal.toFixed(2)}`, widthMm - margin, y, { align: 'right' });
    y += 3.5;

    if (data.descuento && data.descuento > 0) {
      doc.text('Descuento:', margin, y);
      doc.text(`-$${data.descuento.toFixed(2)}`, widthMm - margin, y, { align: 'right' });
      y += 3.5;
    }

    if (data.propina && data.propina > 0) {
      doc.text('Propina:', margin, y);
      doc.text(`+$${data.propina.toFixed(2)}`, widthMm - margin, y, { align: 'right' });
      y += 3.5;
    }

    // Bold Grand Total
    y += 0.5;
    doc.setFont('courier', 'bold');
    doc.setFontSize(10);
    doc.text('TOTAL:', margin, y);
    doc.text(`$${data.total.toFixed(2)}`, widthMm - margin, y, { align: 'right' });
    y += 4.5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(8);

    if (data.metodoPago) {
      doc.text('Metodo de Pago:', margin, y);
      doc.text(data.metodoPago.toUpperCase(), widthMm - margin, y, { align: 'right' });
      y += 3.5;
    }

    if (data.montoRecibido && data.montoRecibido > 0) {
      doc.text('Recibido:', margin, y);
      doc.text(`$${data.montoRecibido.toFixed(2)}`, widthMm - margin, y, { align: 'right' });
      y += 3.5;

      doc.text('Vuelto / Cambio:', margin, y);
      doc.text(`$${(data.vuelto || 0).toFixed(2)}`, widthMm - margin, y, { align: 'right' });
      y += 3.5;
    }

    doc.text(separator, centerX, y, { align: 'center' });
    y += 4;
  }

  // Footer
  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  if (!data.isKitchenTicket) {
    doc.text('GRACIAS POR SU PREFERENCIA!', centerX, y, { align: 'center' });
    y += 3.5;
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.text('Gastro Smart POS', centerX, y, { align: 'center' });
  } else {
    doc.text('-- EN PREPARACION COCINA --', centerX, y, { align: 'center' });
  }

  // Trigger browser file download
  const cleanOrderNum = String(data.orderNumber).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `ticket-orden-${cleanOrderNum}.pdf`;
  doc.save(fileName);
}
