/**
 * Utility for Thermal Receipt Printing (58mm and 80mm rolls)
 * Supports browser print dialog with targeted thermal media styles and Web Bluetooth ESC/POS commands.
 */

export interface ReceiptData {
  restaurantName: string;
  restaurantAddress?: string;
  restaurantPhone?: string;
  orderNumber: number | string;
  mesaNumero?: number | string;
  tipoEntrega?: 'mesa' | 'mostrador' | 'delivery';
  mozoNombre?: string;
  cajeroNombre?: string;
  fecha: string;
  items: Array<{
    nombre: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
    notas?: string;
  }>;
  subtotal: number;
  descuento?: number;
  propina?: number;
  total: number;
  metodoPago?: string;
  montoRecibido?: number;
  vuelto?: number;
  comensalNombre?: string;
  clienteTelefono?: string;
  isKitchenTicket?: boolean;
}

// ESC/POS Byte Commands
const ESC = 0x1b;
const GS = 0x1d;

export const ESC_POS = {
  INIT: new Uint8Array([ESC, 0x40]), // Reset printer
  ALIGN_LEFT: new Uint8Array([ESC, 0x61, 0x00]),
  ALIGN_CENTER: new Uint8Array([ESC, 0x61, 0x01]),
  ALIGN_RIGHT: new Uint8Array([ESC, 0x61, 0x02]),
  BOLD_ON: new Uint8Array([ESC, 0x45, 0x01]),
  BOLD_OFF: new Uint8Array([ESC, 0x45, 0x00]),
  DOUBLE_SIZE_ON: new Uint8Array([GS, 0x21, 0x11]), // 2x width, 2x height
  DOUBLE_SIZE_OFF: new Uint8Array([GS, 0x21, 0x00]),
  FEED_3: new Uint8Array([ESC, 0x64, 0x03]),
  CUT_PAPER: new Uint8Array([GS, 0x56, 0x41, 0x10]), // Cut paper
};

/**
 * Encodes text string to ASCII / Latin1 bytes for thermal printer
 */
function encodeText(text: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(text);
}

/**
 * Builds ESC/POS binary stream for standard Bluetooth thermal printers
 */
export function generateEscPosBytes(data: ReceiptData, rollWidth: '58mm' | '80mm' = '58mm'): Uint8Array {
  const chunks: Uint8Array[] = [];
  const maxChars = rollWidth === '58mm' ? 32 : 48;

  const push = (...arrays: Uint8Array[]) => {
    chunks.push(...arrays);
  };

  const pushText = (text: string) => {
    push(encodeText(text + '\n'));
  };

  const line = (char = '-') => char.repeat(maxChars);

  // Initialize
  push(ESC_POS.INIT);

  // Header
  push(ESC_POS.ALIGN_CENTER, ESC_POS.BOLD_ON, ESC_POS.DOUBLE_SIZE_ON);
  pushText(data.restaurantName);
  push(ESC_POS.DOUBLE_SIZE_OFF, ESC_POS.BOLD_OFF);

  if (data.restaurantAddress) {
    pushText(data.restaurantAddress);
  }
  if (data.restaurantPhone) {
    pushText(`Tel: ${data.restaurantPhone}`);
  }

  pushText(line('='));

  if (data.isKitchenTicket) {
    push(ESC_POS.BOLD_ON, ESC_POS.DOUBLE_SIZE_ON);
    pushText(`*** COMANDA COCINA ***`);
    push(ESC_POS.DOUBLE_SIZE_OFF, ESC_POS.BOLD_OFF);
  } else {
    push(ESC_POS.BOLD_ON);
    pushText(`COMPROBANTE DE PAGO`);
    push(ESC_POS.BOLD_OFF);
  }

  // Info details
  push(ESC_POS.ALIGN_LEFT);
  pushText(`Orden: #${data.orderNumber}`);
  if (data.mesaNumero) {
    push(ESC_POS.BOLD_ON);
    pushText(`MESA: ${data.mesaNumero}`);
    push(ESC_POS.BOLD_OFF);
  } else if (data.tipoEntrega === 'mostrador') {
    pushText(`Para Llevar / Mostrador`);
  }
  if (data.mozoNombre) pushText(`Mozo/Mesero: ${data.mozoNombre}`);
  if (data.cajeroNombre) pushText(`Caja: ${data.cajeroNombre}`);
  if (data.comensalNombre) pushText(`Comensal: ${data.comensalNombre}`);
  pushText(`Fecha: ${new Date(data.fecha).toLocaleString()}`);
  pushText(line('-'));

  // Items
  push(ESC_POS.BOLD_ON);
  if (rollWidth === '58mm') {
    pushText('CANT DESCRIPCION           TOTAL');
  } else {
    pushText('CANT  DESCRIPCION                 P.UNIT   TOTAL');
  }
  push(ESC_POS.BOLD_OFF);
  pushText(line('-'));

  for (const item of data.items) {
    const qty = `${item.cantidad}x `;
    const total = `$${item.subtotal.toFixed(2)}`;
    const nameMax = maxChars - qty.length - total.length - 1;
    const cleanName = item.nombre.substring(0, Math.max(8, nameMax)).padEnd(nameMax);

    push(ESC_POS.BOLD_ON);
    pushText(`${qty}${cleanName} ${total}`);
    push(ESC_POS.BOLD_OFF);

    if (item.notas) {
      pushText(`  * Nota: ${item.notas}`);
    }
  }

  pushText(line('-'));

  // Totals
  if (!data.isKitchenTicket) {
    push(ESC_POS.ALIGN_RIGHT);
    pushText(`Subtotal: $${data.subtotal.toFixed(2)}`);
    if (data.descuento && data.descuento > 0) {
      pushText(`Descuento: -$${data.descuento.toFixed(2)}`);
    }
    if (data.propina && data.propina > 0) {
      pushText(`Propina: +$${data.propina.toFixed(2)}`);
    }
    push(ESC_POS.BOLD_ON, ESC_POS.DOUBLE_SIZE_ON);
    pushText(`TOTAL: $${data.total.toFixed(2)}`);
    push(ESC_POS.DOUBLE_SIZE_OFF, ESC_POS.BOLD_OFF);

    if (data.metodoPago) {
      pushText(`Método: ${data.metodoPago.toUpperCase()}`);
    }
    if (data.montoRecibido && data.montoRecibido > 0) {
      pushText(`Recibido: $${data.montoRecibido.toFixed(2)}`);
      pushText(`Vuelto: $${(data.vuelto || 0).toFixed(2)}`);
    }
    pushText(line('='));
    push(ESC_POS.ALIGN_CENTER);
    pushText('¡Gracias por su visita!');
    pushText('Gastro Smart POS');
  } else {
    pushText(line('='));
    push(ESC_POS.ALIGN_CENTER);
    pushText('-- FIN DE COMANDA --');
  }

  // Feed & Cut
  push(ESC_POS.FEED_3);
  push(ESC_POS.CUT_PAPER);

  // Combine into single Uint8Array
  const totalLength = chunks.reduce((acc, curr) => acc + curr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }

  return result;
}

/**
 * Web Bluetooth Printer connector (for Bluetooth ESC/POS 58mm/80mm receipt printers)
 */
export async function printViaBluetooth(data: ReceiptData, rollWidth: '58mm' | '80mm' = '58mm'): Promise<{ success: boolean; error?: string }> {
  if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
    return {
      success: false,
      error: 'Web Bluetooth no está soportado en este navegador. Utiliza la impresión estándar del sistema.'
    };
  }

  try {
    const nav = navigator as unknown as {
      bluetooth: {
        requestDevice: (options: any) => Promise<any>;
      };
    };

    const device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS thermal printer UUID
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455'
      ]
    });

    if (!device.gatt) {
      throw new Error('El dispositivo Bluetooth seleccionado no soporta GATT.');
    }

    const server = await device.gatt.connect();
    const bytes = generateEscPosBytes(data, rollWidth);

    // Try finding writable characteristic
    const services = await server.getPrimaryServices();
    let writeChar: any = null;

    for (const service of services) {
      const chars = await service.getCharacteristics();
      for (const ch of chars) {
        if (ch.properties.write || ch.properties.writeWithoutResponse) {
          writeChar = ch;
          break;
        }
      }
      if (writeChar) break;
    }

    if (!writeChar) {
      throw new Error('No se encontró canal de escritura en la impresora Bluetooth.');
    }

    // Send in chunks of 512 bytes
    const chunkSize = 512;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.slice(i, i + chunkSize);
      if (writeChar.writeValueWithResponse) {
        await writeChar.writeValueWithResponse(slice);
      } else {
        await writeChar.writeValue(slice);
      }
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Error al conectar con la impresora Bluetooth.'
    };
  }
}
