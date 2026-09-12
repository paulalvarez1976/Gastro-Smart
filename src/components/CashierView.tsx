import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Order, CashRegisterClose } from '../types';
import { updateOrderStatus, createCashRegisterClose, updateTableStatus } from '../services/dataService';
import { sounds } from '../utils/sound';
import { 
  DollarSign, 
  CreditCard, 
  ArrowRightLeft, 
  Receipt, 
  Bike, 
  Utensils, 
  CheckCircle2, 
  Printer, 
  Calendar, 
  AlertCircle,
  FileSpreadsheet,
  X,
  History
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface CashierViewProps {
  orders: Order[];
}

export const CashierView: React.FC<CashierViewProps> = ({ orders }) => {
  const { currentEmployee, currentRestaurant } = useAuth();

  // Active sub-tab: 'pedidos' | 'cierre' | 'historial'
  const [activeTab, setActiveTab] = useState<'pedidos' | 'cierre' | 'historial'>('pedidos');

  // Modal de Cobro
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo');
  const [cashGiven, setCashGiven] = useState<string>('');
  const [discount, setDiscount] = useState<string>('0');
  const [tip, setTip] = useState<string>('0');

  // Arqueo y Cierre de Caja
  const [initialCash, setInitialCash] = useState<string>('100.00');
  const [countedCash, setCountedCash] = useState<string>('');
  const [countedCard, setCountedCard] = useState<string>('');
  const [countedTransfer, setCountedTransfer] = useState<string>('');
  const [cierreNotas, setCierreNotas] = useState<string>('');
  const [closedSummary, setClosedSummary] = useState<CashRegisterClose | null>(null);

  // Pedidos del restaurante actual
  const restaurantOrders = useMemo(() => {
    return orders.filter(o => o.restaurantId === currentRestaurant?.id);
  }, [orders, currentRestaurant]);

  // Pedidos listos para cobrar o ya entregados/en proceso
  const pendingPaymentOrders = useMemo(() => {
    return restaurantOrders.filter(o => 
      ['listo', 'entregado', 'en_preparacion', 'aceptado'].includes(o.estado)
    );
  }, [restaurantOrders]);

  // Pedidos ya cobrados hoy para cálculos de caja
  const todayPaidOrders = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return restaurantOrders.filter(o => 
      o.estado === 'cobrado' && o.cobradoEn?.startsWith(todayStr)
    );
  }, [restaurantOrders]);

  // Totales esperados en caja
  const expectedCash = useMemo(() => {
    return todayPaidOrders
      .filter(o => o.metodoPago === 'efectivo')
      .reduce((sum, o) => sum + (o.total || 0), 0) + (parseFloat(initialCash) || 0);
  }, [todayPaidOrders, initialCash]);

  const expectedCard = useMemo(() => {
    return todayPaidOrders
      .filter(o => o.metodoPago === 'tarjeta')
      .reduce((sum, o) => sum + (o.total || 0), 0);
  }, [todayPaidOrders]);

  const expectedTransfer = useMemo(() => {
    return todayPaidOrders
      .filter(o => o.metodoPago === 'transferencia')
      .reduce((sum, o) => sum + (o.total || 0), 0);
  }, [todayPaidOrders]);

  const grandTotalExpected = expectedCash + expectedCard + expectedTransfer;

  // Cálculos dinámicos en cobro
  const discountNum = Math.max(0, parseFloat(discount) || 0);
  const tipNum = Math.max(0, parseFloat(tip) || 0);
  const orderSubtotal = selectedOrder?.total || 0;
  const finalChargeAmount = Math.max(0, orderSubtotal - discountNum + tipNum);
  const cashGivenNum = parseFloat(cashGiven) || 0;
  const changeDue = Math.max(0, cashGivenNum - finalChargeAmount);

  // Abrir modal de cobro
  const handleOpenPayment = (order: Order) => {
    sounds.playKeypadClick();
    setSelectedOrder(order);
    setPaymentMethod(order.tipo === 'delivery' ? 'tarjeta' : 'efectivo');
    setCashGiven(order.total.toString());
    setDiscount('0');
    setTip('0');
  };

  // Confirmar cobro
  const handleConfirmPayment = async () => {
    if (!selectedOrder || !currentEmployee) return;

    sounds.playCashRegister();
    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.7 }
    });

    await updateOrderStatus(
      selectedOrder.id,
      'cobrado',
      currentEmployee.nombre,
      {
        subtotal: orderSubtotal,
        descuento: discountNum,
        propina: tipNum,
        total: finalChargeAmount,
        metodoPago: paymentMethod,
        montoPagado: paymentMethod === 'efectivo' ? cashGivenNum : finalChargeAmount,
        vuelto: paymentMethod === 'efectivo' ? changeDue : 0,
        cajeroNombre: currentEmployee.nombre,
        timeline: selectedOrder.timeline || []
      }
    );

    // Si era mesa local, liberar la mesa
    if (selectedOrder.mesaId) {
      await updateTableStatus(selectedOrder.mesaId, 'libre');
    }

    setSelectedOrder(null);
  };

  // Realizar Cierre de Caja con Arqueo
  const handlePerformCashClose = async () => {
    if (!currentRestaurant || !currentEmployee) return;

    const realCash = parseFloat(countedCash) || 0;
    const realCard = parseFloat(countedCard) || 0;
    const realTransfer = parseFloat(countedTransfer) || 0;
    const totalReal = realCash + realCard + realTransfer;
    const difference = totalReal - grandTotalExpected;

    sounds.playCashRegister();

    const closePayload: Omit<CashRegisterClose, 'id' | 'creadoEn'> = {
      restaurantId: currentRestaurant.id,
      cajeroId: currentEmployee.id,
      cajeroNombre: currentEmployee.nombre,
      fecha: new Date().toISOString().split('T')[0],
      montoInicial: parseFloat(initialCash) || 0,
      esperadoEfectivo: expectedCash,
      esperadoTarjeta: expectedCard,
      esperadoTransferencia: expectedTransfer,
      totalEsperado: grandTotalExpected,
      conteoRealEfectivo: realCash,
      conteoRealTarjeta: realCard,
      conteoRealTransferencia: realTransfer,
      totalReal: totalReal,
      diferencia: difference,
      totalPedidosCobrados: todayPaidOrders.length,
      notas: cierreNotas,
    };

    await createCashRegisterClose(closePayload);
    setClosedSummary({
      id: 'preview',
      ...closePayload,
      creadoEn: new Date().toISOString()
    });

    alert('Cierre de caja y arqueo guardado correctamente. Puedes imprimir el comprobante.');
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-65px)] bg-neutral-100 overflow-hidden">
      
      {/* Top Bar Navigation for Cashier */}
      <div className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-neutral-900 text-base">Módulo de Caja y Facturación</h2>
            <p className="text-xs text-neutral-500">{currentRestaurant?.nombre}</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-xl border border-neutral-200">
          <button
            onClick={() => setActiveTab('pedidos')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'pedidos' 
                ? 'bg-white text-neutral-900 shadow-xs' 
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <span>Por Cobrar</span>
            {pendingPaymentOrders.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-[10px] flex items-center justify-center">
                {pendingPaymentOrders.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('cierre')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'cierre' 
                ? 'bg-white text-neutral-900 shadow-xs' 
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Arqueo y Cierre</span>
          </button>

          <button
            onClick={() => setActiveTab('historial')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'historial' 
                ? 'bg-white text-neutral-900 shadow-xs' 
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <History className="w-4 h-4 text-blue-600" />
            <span>Cobrados Hoy ({todayPaidOrders.length})</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        
        {/* TAB 1: Pedidos por cobrar */}
        {activeTab === 'pedidos' && (
          <div className="max-w-6xl mx-auto space-y-4">
            
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-neutral-800 text-sm uppercase tracking-wider">
                Comandas pendientes de cobro
              </h3>
              <span className="text-xs text-neutral-500 font-medium">
                Haz clic en una comanda para liquidar
              </span>
            </div>

            {pendingPaymentOrders.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 border border-neutral-200 text-center text-neutral-400">
                <Receipt className="w-12 h-12 mx-auto mb-2 text-neutral-300 stroke-1" />
                <p className="font-bold text-neutral-600">No hay pedidos pendientes de cobro</p>
                <p className="text-xs text-neutral-400 mt-1">Los pedidos enviados por meseros aparecerán listados aquí.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingPaymentOrders.map(order => {
                  const isReady = order.estado === 'listo';
                  const isDelivered = order.estado === 'entregado';

                  return (
                    <div
                      key={order.id}
                      className={`bg-white rounded-2xl border transition-all p-4 flex flex-col justify-between shadow-xs hover:shadow-md ${
                        isReady ? 'border-emerald-300 ring-2 ring-emerald-500/20' : 'border-neutral-200'
                      }`}
                    >
                      <div>
                        {/* Header */}
                        <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                          <div className="flex items-center gap-2">
                            {order.tipo === 'local' ? (
                              <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 font-black text-xs flex items-center justify-center">
                                M{order.mesaNumero}
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                                <Bike className="w-4 h-4" />
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-neutral-900 text-sm">
                                {order.tipo === 'local' ? `Mesa #${order.mesaNumero}` : `Delivery: ${order.empresaDelivery || 'General'}`}
                              </div>
                              <div className="text-[11px] text-neutral-400">
                                Mesero: {order.meseroNombre}
                              </div>
                            </div>
                          </div>

                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            order.estado === 'listo' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : order.estado === 'en_preparacion' 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-orange-100 text-orange-800'
                          }`}>
                            {order.estado.replace('_', ' ')}
                          </span>
                        </div>

                        {/* Items list */}
                        <div className="py-3 space-y-1 text-xs">
                          {order.items.map((it, idx) => (
                            <div key={idx} className="flex justify-between text-neutral-600">
                              <span><strong>{it.cantidad}x</strong> {it.nombre}</span>
                              <span className="font-medium">${(it.precio * it.cantidad).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Total and Collect Button (56px) */}
                      <div className="pt-3 border-t border-neutral-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-neutral-500">Total a liquidar:</span>
                          <span className="text-xl font-black text-neutral-900">
                            ${order.total.toFixed(2)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenPayment(order)}
                          className="w-full min-h-[56px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm transition flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-98"
                        >
                          <DollarSign className="w-5 h-5" />
                          Cobrar Pedido
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}

        {/* TAB 2: Arqueo y Cierre de Caja */}
        {activeTab === 'cierre' && (
          <div className="max-w-3xl mx-auto space-y-6">
            
            {/* Header */}
            <div className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div>
                  <h3 className="text-lg font-black text-neutral-900">Arqueo y Cierre de Caja</h3>
                  <p className="text-xs text-neutral-500">
                    Cajero: <strong>{currentEmployee?.nombre}</strong> • {currentRestaurant?.nombre}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold text-neutral-400">Fecha del turno</div>
                  <div className="text-sm font-black text-neutral-800">
                    {new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </div>
                </div>
              </div>

              {/* Monto inicial en caja */}
              <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200 flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Monto Inicial en Gaveta (Fondo de Caja)
                  </label>
                  <p className="text-[11px] text-neutral-400">Efectivo para dar cambio al inicio del turno</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-neutral-500">$</span>
                  <input
                    type="number"
                    step="0.5"
                    value={initialCash}
                    onChange={(e) => setInitialCash(e.target.value)}
                    className="w-28 h-10 px-3 rounded-xl border border-neutral-300 font-black text-right outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Resumen del Sistema (Esperado) */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Esperado por el Sistema (Registrado en pedidos cobrados hoy):
                </span>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                    <div className="text-[11px] font-bold text-neutral-500">Efectivo (+ Fondo)</div>
                    <div className="text-base font-black text-neutral-900 mt-0.5">
                      ${expectedCash.toFixed(2)}
                    </div>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                    <div className="text-[11px] font-bold text-neutral-500">Tarjetas (POS)</div>
                    <div className="text-base font-black text-neutral-900 mt-0.5">
                      ${expectedCard.toFixed(2)}
                    </div>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                    <div className="text-[11px] font-bold text-neutral-500">Transferencias</div>
                    <div className="text-base font-black text-neutral-900 mt-0.5">
                      ${expectedTransfer.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-blue-950 font-bold text-sm">
                  <span>Total Esperado del Turno:</span>
                  <span className="text-lg font-black text-blue-700">${grandTotalExpected.toFixed(2)}</span>
                </div>
              </div>

              {/* Conteo Real de la Cajera */}
              <div className="space-y-3 pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-800 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-orange-500" /> Conteo Real Físico (Arqueo):
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                      Efectivo Contado ($):
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={countedCash}
                      onChange={(e) => setCountedCash(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-neutral-300 font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                      Vouchers Tarjeta ($):
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={countedCard}
                      onChange={(e) => setCountedCard(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-neutral-300 font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                      Transferencias ($):
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={countedTransfer}
                      onChange={(e) => setCountedTransfer(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-neutral-300 font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>

                {/* Cálculo en vivo de Diferencia */}
                {countedCash !== '' && (
                  (() => {
                    const realTotal = (parseFloat(countedCash) || 0) + (parseFloat(countedCard) || 0) + (parseFloat(countedTransfer) || 0);
                    const diff = realTotal - grandTotalExpected;
                    return (
                      <div className={`p-4 rounded-2xl border flex items-center justify-between text-sm font-black ${
                        Math.abs(diff) < 0.01 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                          : diff > 0 
                            ? 'bg-blue-50 border-blue-200 text-blue-800' 
                            : 'bg-red-50 border-red-200 text-red-800'
                      }`}>
                        <div>
                          <span>Diferencia registrada: </span>
                          <span className="text-xs font-normal">
                            ({Math.abs(diff) < 0.01 ? 'Caja cuadrada perfecta' : diff > 0 ? 'Sobrante' : 'Faltante'})
                          </span>
                        </div>
                        <div className="text-lg font-black">
                          {diff >= 0 ? `+$${diff.toFixed(2)}` : `-$${Math.abs(diff).toFixed(2)}`}
                        </div>
                      </div>
                    );
                  })()
                )}

                <div>
                  <label className="block text-xs font-bold text-neutral-600 mb-1">
                    Observaciones / Notas de Arqueo:
                  </label>
                  <textarea
                    rows={2}
                    value={cierreNotas}
                    onChange={(e) => setCierreNotas(e.target.value)}
                    placeholder="Ejemplo: Arqueo conforme, billetes de alta denominación guardados en caja fuerte..."
                    className="w-full p-2.5 rounded-xl border border-neutral-300 text-xs outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handlePerformCashClose}
                    className="w-full min-h-[56px] rounded-2xl bg-neutral-900 hover:bg-black text-white font-extrabold text-sm transition flex items-center justify-center gap-2 shadow-lg active:scale-98"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    Registrar Cierre Oficial y Generar Arqueo
                  </button>
                </div>

              </div>

            </div>

            {/* Comprobante imprimible si se acaba de cerrar */}
            {closedSummary && (
              <div id="printable-arqueo" className="bg-white rounded-3xl p-6 border border-neutral-200 shadow-sm space-y-3 font-mono text-xs">
                <div className="text-center border-b pb-2 space-y-0.5">
                  <h4 className="font-bold text-sm">GASTRO SMART - CIERRE DE TURNO</h4>
                  <p>{currentRestaurant?.nombre}</p>
                  <p>{closedSummary.fecha} - Cajero: {closedSummary.cajeroNombre}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span>Fondo Inicial:</span>
                    <span>${closedSummary.montoInicial.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ventas Efectivo:</span>
                    <span>${(closedSummary.esperadoEfectivo - closedSummary.montoInicial).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ventas Tarjeta:</span>
                    <span>${closedSummary.esperadoTarjeta.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ventas Transferencia:</span>
                    <span>${closedSummary.esperadoTransferencia.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t pt-1">
                    <span>TOTAL ESPERADO:</span>
                    <span>${closedSummary.totalEsperado.toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-t pt-1 space-y-1">
                  <div className="flex justify-between font-bold">
                    <span>TOTAL CONTADO:</span>
                    <span>${closedSummary.totalReal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-red-600">
                    <span>DIFERENCIA:</span>
                    <span>${closedSummary.diferencia.toFixed(2)}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => window.print()}
                    className="w-full h-11 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold flex items-center justify-center gap-2 transition"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimir Comprobante de Turno
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB 3: Historial de cobrados hoy */}
        {activeTab === 'historial' && (
          <div className="max-w-5xl mx-auto space-y-4">
            <h3 className="font-bold text-neutral-800 text-sm uppercase tracking-wider">
              Pedidos Cobrados Durante el Día ({todayPaidOrders.length})
            </h3>

            {todayPaidOrders.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-neutral-400 border border-neutral-200">
                Aún no se han registrado cobros hoy.
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Hora</th>
                      <th className="p-3">Destino / Tipo</th>
                      <th className="p-3">Mesero</th>
                      <th className="p-3">Método</th>
                      <th className="p-3 text-right">Subtotal</th>
                      <th className="p-3 text-right">Desc / Propina</th>
                      <th className="p-3 text-right">Total Cobrado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-neutral-700">
                    {todayPaidOrders.map(o => (
                      <tr key={o.id} className="hover:bg-neutral-50/60">
                        <td className="p-3 font-mono">
                          {o.cobradoEn ? new Date(o.cobradoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td className="p-3 font-semibold">
                          {o.tipo === 'local' ? `Mesa #${o.mesaNumero}` : `Delivery (${o.empresaDelivery || 'General'})`}
                        </td>
                        <td className="p-3">{o.meseroNombre}</td>
                        <td className="p-3 capitalize">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            o.metodoPago === 'efectivo' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : o.metodoPago === 'tarjeta' 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-purple-100 text-purple-800'
                          }`}>
                            {o.metodoPago}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono">${(o.subtotal || o.total).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-neutral-500">
                          -${(o.descuento || 0).toFixed(2)} / +${(o.propina || 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-bold text-neutral-900 font-mono">
                          ${o.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* MODAL: Cobro y Liquidación de Pedido con cálculo de vuelto, propina y descuento */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-neutral-900 text-base">Cobrar Pedido</h3>
                  <p className="text-xs text-neutral-500">
                    {selectedOrder.tipo === 'local' ? `Mesa #${selectedOrder.mesaNumero}` : `Delivery (${selectedOrder.empresaDelivery || 'General'})`}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-neutral-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items summary */}
            <div className="max-h-36 overflow-y-auto space-y-1 bg-neutral-50 p-2.5 rounded-xl border border-neutral-200 text-xs">
              {selectedOrder.items.map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <span><strong>{it.cantidad}x</strong> {it.nombre}</span>
                  <span className="font-semibold">${(it.precio * it.cantidad).toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Descuentos y Propinas */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                  Descuento ($):
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-xl border border-neutral-300 text-xs font-bold outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                  Propina ($):
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={tip}
                  onChange={(e) => setTip(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-xl border border-neutral-300 text-xs font-bold outline-none focus:border-orange-500"
                />
              </div>
            </div>

            {/* Total Final */}
            <div className="flex items-center justify-between p-3 bg-neutral-100 rounded-xl">
              <span className="font-bold text-xs text-neutral-700">Total a Liquidar:</span>
              <span className="text-2xl font-black text-neutral-900">
                ${finalChargeAmount.toFixed(2)}
              </span>
            </div>

            {/* Método de Pago */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                Método de Pago:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('efectivo')}
                  className={`h-12 rounded-xl font-bold text-xs flex flex-col items-center justify-center transition border ${
                    paymentMethod === 'efectivo'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-500 shadow-xs'
                      : 'bg-neutral-50 text-neutral-600 border-neutral-200'
                  }`}
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Efectivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('tarjeta')}
                  className={`h-12 rounded-xl font-bold text-xs flex flex-col items-center justify-center transition border ${
                    paymentMethod === 'tarjeta'
                      ? 'bg-blue-50 text-blue-800 border-blue-500 shadow-xs'
                      : 'bg-neutral-50 text-neutral-600 border-neutral-200'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Tarjeta</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('transferencia')}
                  className={`h-12 rounded-xl font-bold text-xs flex flex-col items-center justify-center transition border ${
                    paymentMethod === 'transferencia'
                      ? 'bg-purple-50 text-purple-800 border-purple-500 shadow-xs'
                      : 'bg-neutral-50 text-neutral-600 border-neutral-200'
                  }`}
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>Transferencia</span>
                </button>
              </div>
            </div>

            {/* Si es efectivo: Cálculo de Vuelto táctil */}
            {paymentMethod === 'efectivo' && (
              <div className="space-y-2 p-3 bg-orange-50/60 rounded-2xl border border-orange-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-orange-950">Monto Entregado por Cliente:</label>
                  <input
                    type="number"
                    step="1"
                    value={cashGiven}
                    onChange={(e) => setCashGiven(e.target.value)}
                    className="w-24 h-10 px-2 rounded-xl border border-orange-300 font-black text-right outline-none bg-white text-sm"
                  />
                </div>

                {/* Botones de billetes rápidos */}
                <div className="flex gap-1.5">
                  {[10, 20, 50, 100].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setCashGiven(val.toString())}
                      className="flex-1 py-1 rounded-lg bg-white border border-orange-200 text-orange-800 text-[11px] font-bold hover:bg-orange-100"
                    >
                      ${val}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-orange-200/60">
                  <span className="text-xs font-bold text-neutral-700">Cambio / Vuelto a Entregar:</span>
                  <span className="text-lg font-black text-emerald-700">
                    ${changeDue.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Action buttons (56px) */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="h-14 rounded-2xl bg-neutral-100 hover:bg-neutral-200 font-bold text-xs text-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmPayment}
                className="h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                Registrar Cobro
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
