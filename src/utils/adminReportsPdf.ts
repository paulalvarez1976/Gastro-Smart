import { jsPDF } from 'jspdf';
import { MenuItem, CashRegisterClose, Restaurant } from '../types';

export interface InventoryPdfOptions {
  businessName: string;
  selectedBranchName: string;
  generatedBy: string;
  items: MenuItem[];
  filterStockLabel: string;
  filterCategoryLabel: string;
}

export interface CashClosuresPdfOptions {
  businessName: string;
  selectedBranchName: string;
  generatedBy: string;
  periodLabel: string;
  closes: CashRegisterClose[];
  restaurants: Restaurant[];
}

/**
 * Format currency with 2 decimals
 */
function formatMoney(amount: number): string {
  return `$${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formats ISO date to readable string
 */
function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return dateStr;
  }
}

/**
 * Generates and triggers the direct download of the Inventory & Stock PDF report.
 */
export function downloadInventoryPdf(options: InventoryPdfOptions): void {
  const {
    businessName,
    selectedBranchName,
    generatedBy,
    items,
    filterStockLabel,
    filterCategoryLabel
  } = options;

  // A4 Landscape format (297mm x 210mm) for maximum tabular clarity
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 14;
  const contentWidth = pageWidth - (margin * 2);
  let y = margin;

  // Metrics calculation
  const totalItems = items.length;
  const controlledItems = items.filter(i => i.controlaStock === true);
  const criticalItems = controlledItems.filter(i => (i.stockActual ?? 0) > 0 && (i.stockActual ?? 0) <= (i.stockMinimo ?? 5));
  const depletedItems = controlledItems.filter(i => (i.stockActual ?? 0) <= 0);
  const healthyItems = controlledItems.filter(i => (i.stockActual ?? 0) > (i.stockMinimo ?? 5));
  
  const totalValuationCost = controlledItems.reduce((sum, i) => sum + ((i.stockActual ?? 0) * (i.costoElaboracion || 0)), 0);
  const totalValuationPrice = controlledItems.reduce((sum, i) => sum + ((i.stockActual ?? 0) * i.precio), 0);

  // Helper to draw header
  const drawPageHeader = (pageNum: number, totalPages: number = 1) => {
    // Top banner color band
    doc.setFillColor(124, 58, 237); // Purple 600
    doc.rect(0, 0, pageWidth, 5, 'F');

    y = 12;

    // Document Title & Business
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(24, 24, 27); // Neutral 900
    doc.text(businessName.toUpperCase() || 'GASTRO SMART', margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(113, 113, 122); // Neutral 500
    doc.text(`Sede: ${selectedBranchName}`, margin, y + 4.5);

    // Right-aligned report label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(124, 58, 237);
    doc.text('REPORTE OFICIAL DE INVENTARIO Y STOCK', pageWidth - margin, y, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(113, 113, 122);
    const now = new Date();
    const dateFormatted = `${now.toLocaleDateString()} · ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    doc.text(`Generado el: ${dateFormatted}`, pageWidth - margin, y + 4.5, { align: 'right' });
    doc.text(`Generado por: ${generatedBy || 'Administrador'}`, pageWidth - margin, y + 8.5, { align: 'right' });

    y += 13;

    // Separator line
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  };

  // Helper to draw footer
  const drawPageFooter = (pageNum: number) => {
    const footerY = pageHeight - 8;
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.2);
    doc.line(margin, footerY - 2, pageWidth - margin, footerY - 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(161, 161, 170);
    doc.text('GastroSmart POS · Sistema Integral de Gestión Gastronómica', margin, footerY);
    doc.text(`Página ${pageNum}`, pageWidth - margin, footerY, { align: 'right' });
  };

  // 1. First Page Header
  drawPageHeader(1);

  // 2. Filter indicators badge bar
  doc.setFillColor(244, 244, 245);
  doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(82, 82, 91);
  doc.text(`Filtros aplicados:  Estado: ${filterStockLabel}   |   Categoría: ${filterCategoryLabel}   |   Total Platos listados: ${items.length}`, margin + 3, y + 4.5);
  y += 10;

  // 3. Executive KPI Metric Cards (6 cards across landscape width)
  const cardGap = 3;
  const cardWidth = (contentWidth - (cardGap * 5)) / 6;
  const cardHeight = 16;

  const kpis = [
    { title: 'Platos en Carta', val: `${totalItems}`, sub: 'Catalogados', bg: [244, 244, 245], tc: [24, 24, 27] },
    { title: 'Con Control Stock', val: `${controlledItems.length}`, sub: 'Monitoreados', bg: [238, 242, 255], tc: [67, 56, 202] },
    { title: 'Stock Saludable', val: `${healthyItems.length}`, sub: 'Por encima mínimo', bg: [236, 253, 245], tc: [6, 95, 70] },
    { title: 'Stock Crítico', val: `${criticalItems.length}`, sub: 'Alerta de reposición', bg: [254, 243, 199], tc: [146, 64, 14] },
    { title: 'Agotados (Stock 0)', val: `${depletedItems.length}`, sub: 'Sin existencias', bg: [254, 226, 226], tc: [153, 27, 27] },
    { title: 'Valor Inventario', val: formatMoney(totalValuationCost), sub: `PVP: ${formatMoney(totalValuationPrice)}`, bg: [243, 232, 255], tc: [107, 33, 168] },
  ];

  kpis.forEach((kpi, idx) => {
    const cardX = margin + (idx * (cardWidth + cardGap));
    doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
    doc.roundedRect(cardX, y, cardWidth, cardHeight, 1.5, 1.5, 'F');
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(113, 113, 122);
    doc.text(kpi.title, cardX + 2.5, y + 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(kpi.tc[0], kpi.tc[1], kpi.tc[2]);
    doc.text(kpi.val, cardX + 2.5, y + 9.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(113, 113, 122);
    doc.text(kpi.sub, cardX + 2.5, y + 13.5);
  });

  y += cardHeight + 6;

  // 4. Table Header definition
  const columns = [
    { header: '#', width: 8, align: 'center' },
    { header: 'Plato / Producto', width: 68, align: 'left' },
    { header: 'Categoría', width: 32, align: 'left' },
    { header: 'Área', width: 18, align: 'center' },
    { header: 'Stock Actual', width: 26, align: 'right' },
    { header: 'Stock Mín.', width: 20, align: 'right' },
    { header: 'Estado', width: 25, align: 'center' },
    { header: 'Costo Elab.', width: 22, align: 'right' },
    { header: 'PVP Venta', width: 22, align: 'right' },
    { header: 'Valor Stock', width: 28, align: 'right' }
  ];

  const drawTableHeader = () => {
    doc.setFillColor(39, 39, 42); // Zinc 800
    doc.rect(margin, y, contentWidth, 7, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);

    let currentX = margin;
    columns.forEach(col => {
      let textX = currentX + 1.5;
      if (col.align === 'right') textX = currentX + col.width - 1.5;
      if (col.align === 'center') textX = currentX + (col.width / 2);
      doc.text(col.header, textX, y + 4.8, { align: col.align as any });
      currentX += col.width;
    });

    y += 7;
  };

  drawTableHeader();

  // 5. Table Rows
  let page = 1;
  const rowHeight = 6.2;
  const maxY = pageHeight - 16;

  items.forEach((item, index) => {
    // Check if new page needed
    if (y + rowHeight > maxY) {
      drawPageFooter(page);
      doc.addPage('a4', 'landscape');
      page += 1;
      drawPageHeader(page);
      drawTableHeader();
    }

    const isControlled = item.controlaStock === true;
    const stock = item.stockActual ?? 0;
    const minStock = item.stockMinimo ?? 5;
    const unit = item.unidadMedida || 'unid.';
    const cost = item.costoElaboracion || 0;
    const totalItemVal = isControlled ? stock * cost : 0;
    
    let statusLabel = 'Sin Control';
    let statusColor: [number, number, number] = [161, 161, 170]; // Gray
    if (isControlled) {
      if (stock <= 0) {
        statusLabel = 'AGOTADO';
        statusColor = [220, 38, 38]; // Red
      } else if (stock <= minStock) {
        statusLabel = 'CRÍTICO';
        statusColor = [217, 119, 6]; // Amber
      } else {
        statusLabel = 'SALUDABLE';
        statusColor = [16, 149, 193]; // Emerald
      }
    }

    // Alternating background
    if (index % 2 === 1) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, y, contentWidth, rowHeight, 'F');
    }

    // Row border line
    doc.setDrawColor(244, 244, 245);
    doc.setLineWidth(0.15);
    doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);

    let currentX = margin;

    // Col 0: Index
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(113, 113, 122);
    doc.text(`${index + 1}`, currentX + (columns[0].width / 2), y + 4.2, { align: 'center' });
    currentX += columns[0].width;

    // Col 1: Dish Name
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 24, 27);
    const dishName = item.nombre.length > 34 ? item.nombre.substring(0, 32) + '...' : item.nombre;
    doc.text(dishName, currentX + 1.5, y + 4.2);
    currentX += columns[1].width;

    // Col 2: Category
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(82, 82, 91);
    const catName = (item.categoria || 'General').length > 18 ? item.categoria.substring(0, 16) + '..' : (item.categoria || 'General');
    doc.text(catName, currentX + 1.5, y + 4.2);
    currentX += columns[2].width;

    // Col 3: Area (Cocina / Express)
    doc.text(item.requiereCocina ? 'Cocina' : 'Express', currentX + (columns[3].width / 2), y + 4.2, { align: 'center' });
    currentX += columns[3].width;

    // Col 4: Stock Actual
    if (isControlled) {
      doc.setFont('helvetica', 'bold');
      if (stock <= 0) doc.setTextColor(220, 38, 38);
      else if (stock <= minStock) doc.setTextColor(217, 119, 6);
      else doc.setTextColor(24, 24, 27);
      doc.text(`${stock} ${unit}`, currentX + columns[4].width - 1.5, y + 4.2, { align: 'right' });
    } else {
      doc.setTextColor(161, 161, 170);
      doc.text('-', currentX + columns[4].width - 1.5, y + 4.2, { align: 'right' });
    }
    currentX += columns[4].width;

    // Col 5: Stock Min
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(113, 113, 122);
    doc.text(isControlled ? `${minStock}` : '-', currentX + columns[5].width - 1.5, y + 4.2, { align: 'right' });
    currentX += columns[5].width;

    // Col 6: Estado Badge Text
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.text(statusLabel, currentX + (columns[6].width / 2), y + 4.2, { align: 'center' });
    currentX += columns[6].width;

    // Col 7: Costo Elab.
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(82, 82, 91);
    doc.text(cost > 0 ? formatMoney(cost) : '-', currentX + columns[7].width - 1.5, y + 4.2, { align: 'right' });
    currentX += columns[7].width;

    // Col 8: PVP Venta
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 24, 27);
    doc.text(formatMoney(item.precio), currentX + columns[8].width - 1.5, y + 4.2, { align: 'right' });
    currentX += columns[8].width;

    // Col 9: Total Val
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(isControlled && totalItemVal > 0 ? 107 : 161, isControlled && totalItemVal > 0 ? 33 : 161, isControlled && totalItemVal > 0 ? 168 : 170);
    doc.text(isControlled && totalItemVal > 0 ? formatMoney(totalItemVal) : '$0.00', currentX + columns[9].width - 1.5, y + 4.2, { align: 'right' });

    y += rowHeight;
  });

  // Table Totals Footer Row
  if (y + 10 > maxY) {
    drawPageFooter(page);
    doc.addPage('a4', 'landscape');
    page += 1;
    drawPageHeader(page);
  }

  doc.setFillColor(243, 232, 255);
  doc.rect(margin, y + 1, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(107, 33, 168);
  doc.text(`TOTALES GENERALES · ${controlledItems.length} PRODUCTOS MONITOREADOS`, margin + 3, y + 5.5);
  doc.text(`VALOR TOTAL AL COSTO: ${formatMoney(totalValuationCost)}   |   VALOR A PRECIO DE VENTA: ${formatMoney(totalValuationPrice)}`, margin + contentWidth - 3, y + 5.5, { align: 'right' });

  drawPageFooter(page);

  // Trigger Save
  const dateTag = new Date().toISOString().split('T')[0];
  doc.save(`Reporte_Inventario_${dateTag}.pdf`);
}

/**
 * Generates and triggers the direct download of the Cash Register Closures (Cierres de Caja) PDF report.
 */
export function downloadCashClosuresPdf(options: CashClosuresPdfOptions): void {
  const {
    businessName,
    selectedBranchName,
    generatedBy,
    periodLabel,
    closes,
    restaurants
  } = options;

  // A4 Landscape format (297mm x 210mm)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 14;
  const contentWidth = pageWidth - (margin * 2);
  let y = margin;

  // Calculate Metrics
  const totalCloses = closes.length;
  const totalOrders = closes.reduce((sum, c) => sum + (c.totalPedidosCobrados || 0), 0);
  const totalExpected = closes.reduce((sum, c) => sum + (c.totalEsperado || 0), 0);
  const totalReal = closes.reduce((sum, c) => sum + (c.totalReal || 0), 0);
  const netDifference = closes.reduce((sum, c) => sum + (c.diferencia || 0), 0);
  const totalCashReal = closes.reduce((sum, c) => sum + (c.conteoRealEfectivo || 0), 0);
  const totalCardReal = closes.reduce((sum, c) => sum + (c.conteoRealTarjeta || 0), 0);
  const totalTransferReal = closes.reduce((sum, c) => sum + (c.conteoRealTransferencia || 0), 0);

  // Helper to draw header
  const drawPageHeader = (pageNum: number) => {
    doc.setFillColor(16, 185, 129); // Emerald 500
    doc.rect(0, 0, pageWidth, 5, 'F');

    y = 12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(24, 24, 27);
    doc.text(businessName.toUpperCase() || 'GASTRO SMART', margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(113, 113, 122);
    doc.text(`Sede: ${selectedBranchName}`, margin, y + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(5, 150, 105);
    doc.text('REPORTE OFICIAL DE CIERRES DE CAJA Y ARQUEOS', pageWidth - margin, y, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(113, 113, 122);
    const now = new Date();
    const dateFormatted = `${now.toLocaleDateString()} · ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    doc.text(`Generado el: ${dateFormatted}`, pageWidth - margin, y + 4.5, { align: 'right' });
    doc.text(`Generado por: ${generatedBy || 'Administrador'}`, pageWidth - margin, y + 8.5, { align: 'right' });

    y += 13;

    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  };

  const drawPageFooter = (pageNum: number) => {
    const footerY = pageHeight - 8;
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.2);
    doc.line(margin, footerY - 2, pageWidth - margin, footerY - 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(161, 161, 170);
    doc.text('GastroSmart POS · Módulo de Control de Caja, Arqueos & Auditoría', margin, footerY);
    doc.text(`Página ${pageNum}`, pageWidth - margin, footerY, { align: 'right' });
  };

  drawPageHeader(1);

  // Period banner
  doc.setFillColor(244, 244, 245);
  doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(82, 82, 91);
  doc.text(`Periodo analizado:  ${periodLabel}   |   Total cierres registrados: ${totalCloses}   |   Comandas cobradas: ${totalOrders}`, margin + 3, y + 4.5);
  y += 10;

  // KPI Metric Cards
  const cardGap = 3;
  const cardWidth = (contentWidth - (cardGap * 5)) / 6;
  const cardHeight = 16;

  const kpis = [
    { title: 'Total Cierres', val: `${totalCloses}`, sub: `${totalOrders} pedidos cobrados`, bg: [244, 244, 245], tc: [24, 24, 27] },
    { title: 'Total Esperado', val: formatMoney(totalExpected), sub: 'Sistema / Comandas', bg: [238, 242, 255], tc: [67, 56, 202] },
    { title: 'Total Real Contado', val: formatMoney(totalReal), sub: 'Arqueo físico reportado', bg: [236, 253, 245], tc: [6, 95, 70] },
    { 
      title: 'Descuadre Neto', 
      val: formatMoney(netDifference), 
      sub: netDifference === 0 ? 'Cajas Cuadradas' : (netDifference > 0 ? 'Sobrante en caja' : 'Faltante en caja'),
      bg: netDifference === 0 ? [240, 253, 244] : (netDifference > 0 ? [254, 243, 199] : [254, 226, 226]),
      tc: netDifference === 0 ? [22, 101, 52] : (netDifference > 0 ? [146, 64, 14] : [185, 28, 28])
    },
    { title: 'Efectivo Contado', val: formatMoney(totalCashReal), sub: 'Caja chica / Efectivo', bg: [244, 244, 245], tc: [24, 24, 27] },
    { title: 'Tarjetas & Transf.', val: formatMoney(totalCardReal + totalTransferReal), sub: `Tarj: ${formatMoney(totalCardReal)} | Trans: ${formatMoney(totalTransferReal)}`, bg: [243, 232, 255], tc: [107, 33, 168] },
  ];

  kpis.forEach((kpi, idx) => {
    const cardX = margin + (idx * (cardWidth + cardGap));
    doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
    doc.roundedRect(cardX, y, cardWidth, cardHeight, 1.5, 1.5, 'F');
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(113, 113, 122);
    doc.text(kpi.title, cardX + 2.5, y + 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(kpi.tc[0], kpi.tc[1], kpi.tc[2]);
    doc.text(kpi.val, cardX + 2.5, y + 9.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(113, 113, 122);
    doc.text(kpi.sub, cardX + 2.5, y + 13.5);
  });

  y += cardHeight + 6;

  // Columns definition
  const columns = [
    { header: '#', width: 8, align: 'center' },
    { header: 'Fecha y Hora', width: 34, align: 'left' },
    { header: 'Cajero / Responsable', width: 36, align: 'left' },
    { header: 'Sede', width: 28, align: 'left' },
    { header: 'Fondo Inicial', width: 20, align: 'right' },
    { header: 'Esperado', width: 23, align: 'right' },
    { header: 'Real Efectivo', width: 23, align: 'right' },
    { header: 'Real Digital', width: 23, align: 'right' },
    { header: 'Total Real', width: 24, align: 'right' },
    { header: 'Diferencia', width: 23, align: 'right' },
    { header: 'Estado Arqueo', width: 27, align: 'center' }
  ];

  const drawTableHeader = () => {
    doc.setFillColor(39, 39, 42);
    doc.rect(margin, y, contentWidth, 7, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);

    let currentX = margin;
    columns.forEach(col => {
      let textX = currentX + 1.5;
      if (col.align === 'right') textX = currentX + col.width - 1.5;
      if (col.align === 'center') textX = currentX + (col.width / 2);
      doc.text(col.header, textX, y + 4.8, { align: col.align as any });
      currentX += col.width;
    });

    y += 7;
  };

  drawTableHeader();

  let page = 1;
  const rowHeight = 6.4;
  const maxY = pageHeight - 16;

  closes.forEach((close, index) => {
    if (y + rowHeight > maxY) {
      drawPageFooter(page);
      doc.addPage('a4', 'landscape');
      page += 1;
      drawPageHeader(page);
      drawTableHeader();
    }

    const rest = restaurants.find(r => r.id === close.restaurantId);
    const restName = rest?.nombre || 'Sede Principal';
    const digitalReal = (close.conteoRealTarjeta || 0) + (close.conteoRealTransferencia || 0);
    const diff = close.diferencia || 0;

    let diffState = 'Cuadrada';
    let diffColor: [number, number, number] = [22, 101, 52];
    if (diff < -0.01) {
      diffState = `Faltante (${formatMoney(Math.abs(diff))})`;
      diffColor = [185, 28, 28];
    } else if (diff > 0.01) {
      diffState = `Sobrante (+${formatMoney(diff)})`;
      diffColor = [180, 83, 9];
    }

    if (index % 2 === 1) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, y, contentWidth, rowHeight, 'F');
    }

    doc.setDrawColor(244, 244, 245);
    doc.setLineWidth(0.15);
    doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);

    let currentX = margin;

    // Index
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(113, 113, 122);
    doc.text(`${index + 1}`, currentX + (columns[0].width / 2), y + 4.3, { align: 'center' });
    currentX += columns[0].width;

    // Fecha
    doc.setTextColor(24, 24, 27);
    doc.text(formatDate(close.fecha || close.creadoEn), currentX + 1.5, y + 4.3);
    currentX += columns[1].width;

    // Cajero
    doc.setFont('helvetica', 'bold');
    const cajeroStr = (close.cajeroNombre || 'Cajero').length > 18 ? close.cajeroNombre.substring(0, 16) + '..' : (close.cajeroNombre || 'Cajero');
    doc.text(cajeroStr, currentX + 1.5, y + 4.3);
    currentX += columns[2].width;

    // Sede
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(82, 82, 91);
    const sedeStr = restName.length > 14 ? restName.substring(0, 12) + '..' : restName;
    doc.text(sedeStr, currentX + 1.5, y + 4.3);
    currentX += columns[3].width;

    // Fondo Inicial
    doc.text(formatMoney(close.montoInicial || 0), currentX + columns[4].width - 1.5, y + 4.3, { align: 'right' });
    currentX += columns[4].width;

    // Esperado
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 24, 27);
    doc.text(formatMoney(close.totalEsperado), currentX + columns[5].width - 1.5, y + 4.3, { align: 'right' });
    currentX += columns[5].width;

    // Real Efectivo
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(82, 82, 91);
    doc.text(formatMoney(close.conteoRealEfectivo || 0), currentX + columns[6].width - 1.5, y + 4.3, { align: 'right' });
    currentX += columns[6].width;

    // Real Digital
    doc.text(formatMoney(digitalReal), currentX + columns[7].width - 1.5, y + 4.3, { align: 'right' });
    currentX += columns[7].width;

    // Total Real
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text(formatMoney(close.totalReal), currentX + columns[8].width - 1.5, y + 4.3, { align: 'right' });
    currentX += columns[8].width;

    // Diferencia
    doc.setTextColor(diffColor[0], diffColor[1], diffColor[2]);
    doc.text(formatMoney(diff), currentX + columns[9].width - 1.5, y + 4.3, { align: 'right' });
    currentX += columns[9].width;

    // Estado Arqueo
    doc.setFontSize(6.5);
    doc.text(diffState, currentX + (columns[10].width / 2), y + 4.3, { align: 'center' });

    y += rowHeight;
  });

  // Footer Totals Row
  if (y + 10 > maxY) {
    drawPageFooter(page);
    doc.addPage('a4', 'landscape');
    page += 1;
    drawPageHeader(page);
  }

  doc.setFillColor(236, 253, 245);
  doc.rect(margin, y + 1, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(6, 95, 70);
  doc.text(`TOTALES GENERALES · ${totalCloses} CIERRES DE CAJA PROCESADOS`, margin + 3, y + 5.5);
  doc.text(`TOTAL ESPERADO: ${formatMoney(totalExpected)}   |   TOTAL REAL CONTADO: ${formatMoney(totalReal)}   |   DESCUADRE NETO: ${formatMoney(netDifference)}`, margin + contentWidth - 3, y + 5.5, { align: 'right' });

  drawPageFooter(page);

  const dateTag = new Date().toISOString().split('T')[0];
  doc.save(`Reporte_Cierres_Caja_${dateTag}.pdf`);
}
