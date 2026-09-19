import { ReceiptData } from './thermalPrinter';

/**
 * Formats a clean, readable text receipt for WhatsApp sharing.
 */
export function formatWhatsAppTicketMessage(data: ReceiptData): string {
  const isKitchen = data.isKitchenTicket;
  const lines: string[] = [];

  // Header
  lines.push(`🧾 *${isKitchen ? '*** COMANDA COCINA ***' : 'COMPROBANTE DE COMPRA'}*`);
  lines.push(`🏠 *${data.restaurantName.toUpperCase()}*`);
  if (data.restaurantAddress) lines.push(`📍 ${data.restaurantAddress}`);
  if (data.restaurantPhone) lines.push(`📞 Tel: ${data.restaurantPhone}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━');

  // Metadata
  lines.push(`*Orden:* #${data.orderNumber}`);
  if (data.mesaNumero) {
    lines.push(`*Mesa:* #${data.mesaNumero}`);
  } else if (data.tipoEntrega === 'delivery') {
    lines.push(`*Modalidad:* Delivery / Reparto`);
  } else {
    lines.push(`*Modalidad:* Mostrador / Para Llevar`);
  }

  const dateObj = new Date(data.fecha);
  lines.push(`*Fecha:* ${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);

  if (data.comensalNombre) lines.push(`*Cliente:* ${data.comensalNombre}`);
  if (data.mozoNombre) lines.push(`*Atendido por:* ${data.mozoNombre}`);
  if (data.cajeroNombre) lines.push(`*Caja:* ${data.cajeroNombre}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━');

  // Items
  lines.push('*DETALLE DEL PEDIDO:*');
  data.items.forEach(item => {
    lines.push(`• *${item.cantidad}x* ${item.nombre} - $${item.subtotal.toFixed(2)}`);
    if (item.notas) {
      lines.push(`   _Nota: ${item.notas}_`);
    }
  });
  lines.push('━━━━━━━━━━━━━━━━━━━━');

  // Totals
  if (!isKitchen) {
    lines.push(`*Subtotal:* $${data.subtotal.toFixed(2)}`);
    if (data.descuento && data.descuento > 0) {
      lines.push(`*Descuento:* -$${data.descuento.toFixed(2)}`);
    }
    if (data.propina && data.propina > 0) {
      lines.push(`*Propina:* +$${data.propina.toFixed(2)}`);
    }
    lines.push(`*TOTAL PAGADO: $${data.total.toFixed(2)}*`);

    if (data.metodoPago) {
      lines.push(`*Método de Pago:* ${data.metodoPago.toUpperCase()}`);
    }
    if (data.montoRecibido && data.montoRecibido > 0) {
      lines.push(`*Monto Recibido:* $${data.montoRecibido.toFixed(2)}`);
      lines.push(`*Vuelto / Cambio:* $${(data.vuelto || 0).toFixed(2)}`);
    }
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('¡Muchas gracias por su preferencia! ✨');
    lines.push('_Gastro Smart POS_');
  } else {
    lines.push('*-- EN PREPARACIÓN EN COCINA --*');
  }

  return lines.join('\n');
}

/**
 * Cleans and sanitizes phone numbers for WhatsApp URL scheme
 */
export function sanitizeWhatsAppPhone(phone: string): string {
  // Remove non-digit characters
  let cleaned = phone.replace(/[^0-9]/g, '');
  
  // If user included leading zeros, strip them
  cleaned = cleaned.replace(/^0+/, '');
  
  return cleaned;
}

/**
 * Opens WhatsApp Web or WhatsApp App with the formatted ticket message.
 * If a phone is provided, directs straight to that chat.
 * If not, opens the contact picker.
 */
export function openWhatsAppReceipt(data: ReceiptData, targetPhone?: string): void {
  const text = formatWhatsAppTicketMessage(data);
  const encodedText = encodeURIComponent(text);

  let url = '';
  if (targetPhone && targetPhone.trim().length > 0) {
    const cleanPhone = sanitizeWhatsAppPhone(targetPhone);
    url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  } else {
    url = `https://api.whatsapp.com/send?text=${encodedText}`;
  }

  // Open in new window/tab or WhatsApp App
  window.open(url, '_blank', 'noopener,noreferrer');
}
