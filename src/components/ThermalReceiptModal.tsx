import React, { useState, useMemo } from 'react';
import { 
  Printer, 
  Bluetooth, 
  X, 
  CheckCircle, 
  AlertCircle, 
  FileDown, 
  MessageCircle, 
  Phone, 
  Send,
  Edit2,
  Share2
} from 'lucide-react';
import { ReceiptData, printViaBluetooth } from '../utils/thermalPrinter';
import { downloadReceiptPdf } from '../utils/pdfTicket';
import { openWhatsAppReceipt, sanitizeWhatsAppPhone } from '../utils/whatsappTicket';
import { Order, OrderItem } from '../types';
import { haptics } from '../utils/haptics';

export interface ThermalReceiptModalProps {
  data?: ReceiptData;
  order?: Order;
  restaurantName?: string;
  restaurantAddress?: string;
  restaurantPhone?: string;
  clientPhone?: string;
  clientName?: string;
  mode?: 'cuenta' | 'comanda';
  roundNumber?: number;
  itemsOverride?: OrderItem[];
  onClose: () => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  data: propData,
  order,
  restaurantName,
  restaurantAddress,
  restaurantPhone,
  clientPhone,
  clientName,
  mode = 'cuenta',
  roundNumber,
  itemsOverride,
  onClose,
}) => {
  const [rollWidth, setRollWidth] = useState<'58mm' | '80mm'>('58mm');
  const [isBluetoothPrinting, setIsBluetoothPrinting] = useState(false);
  const [btStatus, setBtStatus] = useState<{ success?: boolean; error?: string } | null>(null);
  const [isPdfDownloaded, setIsPdfDownloaded] = useState(false);
  const [showPhoneEditor, setShowPhoneEditor] = useState(false);

  // Phone number state initialized with customer's registered phone
  const initialPhone = order?.clienteTelefono || propData?.clienteTelefono || clientPhone || '';
  const [customPhone, setCustomPhone] = useState<string>(initialPhone);

  // Safely construct ReceiptData from either direct data or Order object
  const data: ReceiptData = useMemo(() => {
    const effectivePhone = customPhone || initialPhone || undefined;

    if (propData) {
      return {
        ...propData,
        clienteTelefono: effectivePhone,
        isKitchenTicket: Boolean(propData.isKitchenTicket),
      };
    }

    if (order) {
      const isKitchen = mode === 'comanda';
      const itemsList = itemsOverride || order.items || [];
      const mappedItems = itemsList.map((item) => ({
        nombre: item.nombre || 'Producto',
        cantidad: item.cantidad || 1,
        precioUnitario: typeof item.precio === 'number' ? item.precio : 0,
        subtotal: (typeof item.precio === 'number' ? item.precio : 0) * (item.cantidad || 1),
        notas: item.notas || undefined,
      }));

      const calculatedSubtotal = mappedItems.reduce((acc, it) => acc + it.subtotal, 0);
      const subtotalVal = order.subtotal ?? (calculatedSubtotal > 0 ? calculatedSubtotal : (order.total || 0));
      const discountVal = order.descuento || 0;
      const tipVal = order.propina || 0;
      const totalVal = order.total ?? Math.max(0, subtotalVal - discountVal + tipVal);

      // Clean order number for display
      let displayOrderNum: string | number = 1;
      if (order.id) {
        displayOrderNum = order.id.startsWith('ord_') ? order.id.replace('ord_', '') : order.id;
      }
      if (roundNumber) {
        displayOrderNum = `${displayOrderNum} (Ronda ${roundNumber})`;
      }

      return {
        restaurantName: restaurantName || 'Restaurante',
        restaurantAddress: restaurantAddress || undefined,
        restaurantPhone: restaurantPhone || undefined,
        orderNumber: displayOrderNum,
        mesaNumero: order.mesaNumero ?? undefined,
        tipoEntrega: (order.tipo === 'local' ? 'mesa' : order.tipo === 'para_llevar' ? 'mostrador' : 'delivery') as any,
        mozoNombre: order.meseroNombre,
        cajeroNombre: (order as any).cajeroNombre,
        fecha: order.creadoEn || new Date().toISOString(),
        items: mappedItems,
        subtotal: subtotalVal,
        descuento: discountVal > 0 ? discountVal : undefined,
        propina: tipVal > 0 ? tipVal : undefined,
        total: totalVal,
        metodoPago: order.metodoPago || undefined,
        montoRecibido: (order as any).montoRecibido,
        vuelto: order.vuelto,
        comensalNombre: order.clienteNombre || clientName || undefined,
        clienteTelefono: effectivePhone,
        isKitchenTicket: isKitchen,
      };
    }

    // Default safe fallback if neither data nor order is provided
    return {
      restaurantName: restaurantName || 'Restaurante',
      restaurantAddress,
      restaurantPhone,
      orderNumber: 1,
      fecha: new Date().toISOString(),
      items: [],
      subtotal: 0,
      total: 0,
      clienteTelefono: effectivePhone,
      isKitchenTicket: mode === 'comanda',
    };
  }, [
    propData, 
    order, 
    restaurantName, 
    restaurantAddress, 
    restaurantPhone, 
    clientName, 
    customPhone, 
    initialPhone, 
    mode, 
    roundNumber, 
    itemsOverride
  ]);

  // Standard browser print
  const handleBrowserPrint = () => {
    haptics.tap();
    window.print();
  };

  // Web Bluetooth ESC/POS print
  const handleBluetoothPrint = async () => {
    setIsBluetoothPrinting(true);
    setBtStatus(null);
    haptics.tap();

    const res = await printViaBluetooth(data, rollWidth);
    setIsBluetoothPrinting(false);
    setBtStatus(res);

    if (res.success) {
      haptics.success();
    } else {
      haptics.warning();
    }
  };

  // Download PDF
  const handleDownloadPdf = () => {
    haptics.success();
    downloadReceiptPdf(data, rollWidth);
    setIsPdfDownloaded(true);
    setTimeout(() => setIsPdfDownloaded(false), 3500);
  };

  // Send WhatsApp Ticket
  const handleSendWhatsApp = (targetPhone?: string) => {
    haptics.tap();
    const phoneToUse = targetPhone !== undefined ? targetPhone : customPhone;
    openWhatsAppReceipt(data, phoneToUse);
  };

  const hasRegisteredPhone = Boolean(initialPhone && initialPhone.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4 overflow-hidden print:p-0 print:bg-white print:static animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-neutral-200 overflow-hidden flex flex-col h-full max-h-[96dvh] sm:max-h-[90dvh] print:max-h-none print:shadow-none print:border-none print:w-full print:max-w-none">
        
        {/* Header - Compact & Sticky */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-neutral-100 bg-neutral-50 print:hidden shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-xs sm:text-sm text-neutral-900 leading-tight">
                {data.isKitchenTicket ? 'Comanda Térmica de Cocina' : 'Comprobante de Caja'}
              </h3>
              <p className="text-[10px] sm:text-[11px] text-neutral-500 leading-tight">
                Orden #{data.orderNumber} {data.mesaNumero ? `• Mesa ${data.mesaNumero}` : ''}
              </p>
            </div>
          </div>

          {/* Width selector 58mm vs 80mm & Close button */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-0.5 bg-white p-0.5 rounded-xl border border-neutral-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setRollWidth('58mm')}
                className={`px-2 py-1 rounded-lg transition text-[11px] ${
                  rollWidth === '58mm' ? 'bg-orange-600 text-white' : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                58mm
              </button>
              <button
                type="button"
                onClick={() => setRollWidth('80mm')}
                className={`px-2 py-1 rounded-lg transition text-[11px] ${
                  rollWidth === '80mm' ? 'bg-orange-600 text-white' : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                80mm
              </button>
            </div>

            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-700 p-1.5 rounded-xl hover:bg-neutral-100 transition"
              title="Cerrar ventana"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* WhatsApp Customer Info Banner */}
        <div className="bg-emerald-50/90 border-b border-emerald-100 px-3 sm:px-4 py-2 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Phone className="w-3.5 h-3.5" />
            </div>
            <div className="text-emerald-950 text-[11px] leading-tight">
              {hasRegisteredPhone ? (
                <span>
                  Cliente registrado: <strong className="font-extrabold">{data.comensalNombre || 'Cliente'}</strong>{' '}
                  <span className="bg-emerald-200/80 px-1.5 py-0.2 rounded font-mono font-bold text-emerald-900">
                    {initialPhone}
                  </span>
                </span>
              ) : (
                <span className="text-neutral-700">
                  Sin teléfono registrado. Puedes escribir uno para enviar el ticket por WhatsApp.
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setShowPhoneEditor(!showPhoneEditor)}
              className="text-[11px] text-emerald-800 hover:text-emerald-950 font-bold underline flex items-center gap-1 cursor-pointer"
            >
              <Edit2 className="w-3 h-3" />
              <span>{showPhoneEditor ? 'Ocultar' : hasRegisteredPhone ? 'Cambiar número' : 'Ingresar número'}</span>
            </button>
          </div>
        </div>

        {/* Editable Phone Input Bar (Collapsible) */}
        {showPhoneEditor && (
          <div className="bg-white px-3 sm:px-4 py-2 border-b border-neutral-200 flex items-center gap-2 shrink-0 animate-in slide-in-from-top-1 duration-150 print:hidden">
            <div className="relative flex-1">
              <Phone className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                value={customPhone}
                onChange={(e) => setCustomPhone(e.target.value)}
                placeholder="Ej: +54 9 11 2345-6789 o 987654321"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-300 rounded-xl font-mono text-neutral-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              type="button"
              onClick={() => handleSendWhatsApp(customPhone)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition shrink-0 cursor-pointer"
            >
              <Send className="w-3 h-3" />
              <span>Enviar a este número</span>
            </button>
          </div>
        )}

        {/* Scrollable Receipt Paper Sheet */}
        <div className="flex-1 min-h-0 p-3 sm:p-4 overflow-y-auto bg-neutral-100/70 flex justify-center print:bg-white print:p-0">
          <div
            className={`bg-white p-3 sm:p-4 shadow-md border border-neutral-200 font-mono text-[11px] text-neutral-900 leading-tight select-text print:shadow-none print:border-none print:p-0 transition-all ${
              rollWidth === '58mm' ? 'w-[260px]' : 'w-[325px]'
            }`}
          >
            {/* Header */}
            <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-neutral-400">
              <h2 className="font-black text-xs sm:text-sm tracking-tight text-black">{data.restaurantName}</h2>
              {data.restaurantAddress && <p className="text-[10px] text-neutral-600">{data.restaurantAddress}</p>}
              {data.restaurantPhone && <p className="text-[10px] text-neutral-600">Tel: {data.restaurantPhone}</p>}
              
              <div className="pt-1">
                <span className={`inline-block px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-black uppercase ${
                  data.isKitchenTicket ? 'bg-black text-white' : 'bg-neutral-200 text-neutral-800'
                }`}>
                  {data.isKitchenTicket ? '*** COMANDA COCINA ***' : 'COMPROBANTE DE PAGO'}
                </span>
              </div>
            </div>

            {/* Order Info */}
            <div className="py-2 border-b border-dashed border-neutral-400 space-y-0.5 text-[10px]">
              <div className="flex justify-between font-bold">
                <span>ORDEN: #{data.orderNumber}</span>
                <span>{data.mesaNumero ? `MESA: ${data.mesaNumero}` : (data.tipoEntrega === 'delivery' ? 'DELIVERY' : 'MOSTRADOR')}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Fecha: {new Date(data.fecha).toLocaleDateString()}</span>
                <span>{new Date(data.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {data.mozoNombre && <div>Mozo: {data.mozoNombre}</div>}
              {data.cajeroNombre && <div>Caja: {data.cajeroNombre}</div>}
              {data.comensalNombre && <div className="font-bold text-neutral-800">Cliente: {data.comensalNombre}</div>}
              {data.clienteTelefono && <div className="text-neutral-600">Tel: {data.clienteTelefono}</div>}
            </div>

            {/* Items Table */}
            <div className="py-2 border-b border-dashed border-neutral-400">
              <div className="flex justify-between font-bold text-[10px] pb-1 border-b border-neutral-300">
                <span>CANT / DESCRIPCIÓN</span>
                <span>TOTAL</span>
              </div>
              <div className="divide-y divide-dotted divide-neutral-200 pt-1">
                {data.items.map((item, idx) => (
                  <div key={idx} className="py-1">
                    <div className="flex justify-between items-start font-bold">
                      <span className="flex-1 pr-2">
                        {item.cantidad}x {item.nombre}
                      </span>
                      <span>${item.subtotal.toFixed(2)}</span>
                    </div>
                    {item.notas && (
                      <div className="text-[9px] text-neutral-600 pl-3 italic">
                        * {item.notas}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Totals Section */}
            {!data.isKitchenTicket ? (
              <div className="py-2 space-y-1 text-right text-[10px] border-b border-dashed border-neutral-400">
                <div className="flex justify-between text-neutral-600">
                  <span>Subtotal:</span>
                  <span>${data.subtotal.toFixed(2)}</span>
                </div>
                {data.descuento && data.descuento > 0 ? (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Descuento:</span>
                    <span>-${data.descuento.toFixed(2)}</span>
                  </div>
                ) : null}
                {data.propina && data.propina > 0 ? (
                  <div className="flex justify-between text-blue-700 font-medium">
                    <span>Propina:</span>
                    <span>+${data.propina.toFixed(2)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between font-black text-xs sm:text-sm text-black pt-1 border-t border-neutral-300">
                  <span>TOTAL:</span>
                  <span>${data.total.toFixed(2)}</span>
                </div>

                {data.metodoPago && (
                  <div className="flex justify-between text-neutral-600 text-[9px] pt-1">
                    <span>Método de Pago:</span>
                    <span className="uppercase font-bold">{data.metodoPago}</span>
                  </div>
                )}
                {data.montoRecibido && data.montoRecibido > 0 ? (
                  <>
                    <div className="flex justify-between text-neutral-600 text-[9px]">
                      <span>Recibido:</span>
                      <span>${data.montoRecibido.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-neutral-600 text-[9px]">
                      <span>Vuelto / Cambio:</span>
                      <span>${(data.vuelto || 0).toFixed(2)}</span>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {/* Footer */}
            <div className="pt-2 text-center text-[9px] text-neutral-600 space-y-1">
              {!data.isKitchenTicket ? (
                <>
                  <p className="font-bold text-neutral-900">¡GRACIAS POR SU PREFERENCIA!</p>
                  <p>Gastro Smart POS • Impresión Térmica</p>
                </>
              ) : (
                <p className="font-bold text-neutral-900">-- EN PREPARACIÓN COCINA --</p>
              )}
            </div>
          </div>
        </div>

        {/* Bluetooth status feedback if any */}
        {btStatus && (
          <div className={`px-3 py-1.5 text-xs flex items-center gap-2 print:hidden shrink-0 ${
            btStatus.success ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
          }`}>
            {btStatus.success ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Ticket enviado a la impresora Bluetooth con éxito.</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{btStatus.error}</span>
              </>
            )}
          </div>
        )}

        {/* PDF Download Feedback */}
        {isPdfDownloaded && (
          <div className="px-3 py-1.5 text-xs flex items-center gap-2 bg-indigo-50 text-indigo-800 print:hidden shrink-0">
            <CheckCircle className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>PDF descargado correctamente en su dispositivo.</span>
          </div>
        )}

        {/* Sticky Action Footer - Engineered to fit ALL buttons comfortably on one screen */}
        <div className="p-2 sm:p-3 bg-neutral-50 border-t border-neutral-200 print:hidden shrink-0 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-1.5 sm:gap-2">
            
            {/* Cerrar */}
            <button
              type="button"
              onClick={onClose}
              className="order-5 sm:order-1 px-3 py-2 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-200 active:scale-95 transition text-center col-span-2 sm:col-span-1"
            >
              Cerrar
            </button>

            {/* Descargar como PDF */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="order-3 sm:order-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
              title="Descargar comprobante en formato PDF"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Descargar PDF</span>
            </button>

            {/* WhatsApp Button */}
            <button
              type="button"
              onClick={() => handleSendWhatsApp()}
              className="order-4 sm:order-3 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
              title={hasRegisteredPhone ? `Enviar a WhatsApp (${initialPhone})` : 'Compartir ticket por WhatsApp'}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>
                {hasRegisteredPhone ? 'WhatsApp' : 'Enviar WhatsApp'}
              </span>
            </button>

            {/* Bluetooth ESC/POS Button */}
            <button
              type="button"
              onClick={handleBluetoothPrint}
              disabled={isBluetoothPrinting}
              className="order-2 sm:order-4 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
              title="Imprimir directamente por Bluetooth"
            >
              <Bluetooth className="w-3.5 h-3.5" />
              <span className="truncate">{isBluetoothPrinting ? 'Conectando...' : 'Bluetooth'}</span>
            </button>

            {/* Standard Browser / USB / Network Print */}
            <button
              type="button"
              onClick={handleBrowserPrint}
              className="order-1 sm:order-5 px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 active:scale-95 text-white text-xs font-black flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
              title="Imprimir ticket térmico con impresora del sistema"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>

          </div>
        </div>

      </div>
    </div>
  );
};
