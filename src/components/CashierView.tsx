import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Order, CashRegisterClose, MenuItem, Table, Client, OrderDiner, PartialPayment } from '../types';
import { 
  updateOrderStatus, 
  createCashRegisterClose, 
  updateTableStatus,
  releaseTableIfAllOrdersPaid,
  getOperationalDateString,
  markOrderDelivered,
  registerPartialPayment,
  registerOrderFuga
} from '../services/dataService';
import { sounds } from '../utils/sound';
import { WaiterPOS } from './WaiterPOS';
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
  History,
  Store,
  Clock,
  Sparkles,
  CheckCheck,
  Users,
  Divide,
  Layers,
  AlertOctagon,
  UserCheck,
  Tag,
  Flame,
  UserX
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface CashierViewProps {
  orders: Order[];
  menuItems: MenuItem[];
  tables: Table[];
  clients: Client[];
  initialTab?: 'pos' | 'pedidos' | 'mostrador' | 'cierre' | 'historial';
}

export const CashierView: React.FC<CashierViewProps> = ({ orders, menuItems, tables, clients, initialTab }) => {
  const { currentEmployee, currentRestaurant } = useAuth();

  // Active sub-tab: 'pos' | 'pedidos' | 'mostrador' | 'cierre' | 'historial'
  const defaultTab = initialTab || (currentEmployee?.puesto === 'mostrador' ? 'mostrador' : 'pos');
  const [activeTab, setActiveTab] = useState<'pos' | 'pedidos' | 'mostrador' | 'cierre' | 'historial'>(defaultTab);

  // Modal de Cobro & División de Cuenta
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [splitMode, setSplitMode] = useState<'total' | 'comensal' | 'partes_iguales' | 'fuga'>('total');
  const [selectedDinerId, setSelectedDinerId] = useState<string | null>(null);
  const [sharesCount, setSharesCount] = useState<number>(2);
  const [fugaReason, setFugaReason] = useState<string>('');
  const [fugaDinerId, setFugaDinerId] = useState<string>('all');

  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo');
  const [cashGiven, setCashGiven] = useState<string>('');
  const [discount, setDiscount] = useState<string>('0');
  const [tip, setTip] = useState<string>('0');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Feedback de liberación automática de mesa
  const [tableReleaseFeedback, setTableReleaseFeedback] = useState<{
    mesaNumero: number;
    released: boolean;
    pendingCount: number;
  } | null>(null);

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
      ['pendiente_cocina', 'listo', 'entregado', 'en_preparacion', 'aceptado'].includes(o.estado) && o.estadoPago !== 'cobrado'
    );
  }, [restaurantOrders]);

  // Pedidos con ítems de mostrador pendientes de despacho o cobro
  const counterOrders = useMemo(() => {
    return restaurantOrders.filter(o => 
      o.estadoPago !== 'cobrado' && 
      o.estado !== 'cobrado' && 
      o.estado !== 'rechazado' &&
      o.items.some(it => it.requiereCocina !== true)
    );
  }, [restaurantOrders]);

  // Pedidos ya cobrados en el día operativo actual (5:00 a.m. a 4:59 a.m.)
  const todayPaidOrders = useMemo(() => {
    const todayOpStr = getOperationalDateString(new Date());
    return restaurantOrders.filter(o => 
      (o.estado === 'cobrado' || o.estadoPago === 'cobrado') && 
      getOperationalDateString(o.cobradoEn || o.creadoEn) === todayOpStr
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

  // Selected Order dynamic derived values
  const currentPendingBalance = useMemo(() => {
    if (!selectedOrder) return 0;
    if (selectedOrder.saldoPendiente !== undefined) return Math.max(0, selectedOrder.saldoPendiente);
    const paidSum = (selectedOrder.cobros || []).reduce((acc, p) => acc + (p.monto || 0), 0);
    return Math.max(0, selectedOrder.total - paidSum);
  }, [selectedOrder]);

  // Diners breakdown for selected order
  const orderDinersBreakdown = useMemo(() => {
    if (!selectedOrder) return [];
    const dinersList: OrderDiner[] = selectedOrder.comensales && selectedOrder.comensales.length > 0
      ? [...selectedOrder.comensales]
      : [
          { id: 'c1', numero: 1, nombre: 'Comensal 1', total: 0 },
          { id: 'c2', numero: 2, nombre: 'Comensal 2', total: 0 }
        ];

    return dinersList.map(diner => {
      const dinerItems = (selectedOrder.items || []).filter(it => it.comensalId === diner.id);
      const dinerSubtotal = dinerItems.reduce((acc, it) => acc + (it.precio * it.cantidad), 0);
      const dinerPayments = (selectedOrder.cobros || []).filter(c => c.comensalId === diner.id);
      const dinerPaid = dinerPayments.reduce((acc, c) => acc + c.monto, 0);
      const isPaid = dinerPaid >= dinerSubtotal && dinerSubtotal > 0;

      return {
        ...diner,
        items: dinerItems,
        subtotal: dinerSubtotal,
        paid: dinerPaid,
        pending: Math.max(0, dinerSubtotal - dinerPaid),
        isPaid
      };
    });
  }, [selectedOrder]);

  // Selected Diner details
  const activeSelectedDiner = useMemo(() => {
    if (!selectedDinerId) return orderDinersBreakdown[0] || null;
    return orderDinersBreakdown.find(d => d.id === selectedDinerId) || orderDinersBreakdown[0] || null;
  }, [selectedDinerId, orderDinersBreakdown]);

  // Equal Shares breakdown
  const equalShareAmount = useMemo(() => {
    if (!selectedOrder || sharesCount <= 0) return 0;
    return Math.round((currentPendingBalance / sharesCount) * 100) / 100;
  }, [selectedOrder, currentPendingBalance, sharesCount]);

  // Cálculos dinámicos en cobro
  const discountNum = Math.max(0, parseFloat(discount) || 0);
  const tipNum = Math.max(0, parseFloat(tip) || 0);

  const baseChargeAmount = useMemo(() => {
    if (splitMode === 'comensal' && activeSelectedDiner) {
      return activeSelectedDiner.pending;
    }
    if (splitMode === 'partes_iguales') {
      return equalShareAmount;
    }
    return currentPendingBalance;
  }, [splitMode, activeSelectedDiner, equalShareAmount, currentPendingBalance]);

  const finalChargeAmount = Math.max(0, baseChargeAmount - discountNum + tipNum);
  const cashGivenNum = parseFloat(cashGiven) || 0;
  const changeDue = Math.max(0, cashGivenNum - finalChargeAmount);

  // Abrir modal de cobro
  const handleOpenPayment = (order: Order) => {
    sounds.playKeypadClick();
    setSelectedOrder(order);
    setSplitMode('total');
    setPaymentMethod(order.tipo === 'delivery' ? 'tarjeta' : 'efectivo');
    const balance = order.saldoPendiente !== undefined ? order.saldoPendiente : order.total;
    setCashGiven(balance.toString());
    setDiscount('0');
    setTip('0');
    if (order.comensales && order.comensales.length > 0) {
      setSelectedDinerId(order.comensales[0].id);
    } else {
      setSelectedDinerId('c1');
    }
  };

  // Confirmar cobro TOTAL (Liquidación Completa de la Comanda)
  const handleConfirmTotalPayment = async () => {
    if (!selectedOrder || !currentEmployee) return;
    setIsProcessingPayment(true);

    try {
      sounds.playCashRegister();
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.7 }
      });

      // Si el pedido está en estado "listo", transicionar a "entregado" antes de cobrar
      if (selectedOrder.estado === 'listo') {
        try {
          await updateOrderStatus(
            selectedOrder.id,
            'entregado',
            currentEmployee.nombre,
            { timeline: selectedOrder.timeline || [] }
          );
        } catch (e) {
          console.warn('Transition to entregado before cobrado:', e);
        }
      }

      await updateOrderStatus(
        selectedOrder.id,
        'cobrado',
        currentEmployee.nombre,
        {
          subtotal: selectedOrder.subtotal || selectedOrder.total,
          descuento: discountNum,
          propina: tipNum,
          total: finalChargeAmount,
          metodoPago: paymentMethod,
          montoPagado: paymentMethod === 'efectivo' ? cashGivenNum : finalChargeAmount,
          vuelto: paymentMethod === 'efectivo' ? changeDue : 0,
          cajeroNombre: currentEmployee.nombre,
          montoCobradoAcumulado: selectedOrder.total,
          saldoPendiente: 0,
          timeline: selectedOrder.timeline || []
        }
      );

      // Si era mesa local, verificar si todas las órdenes de la mesa están pagadas antes de liberarla
      if (selectedOrder.mesaId) {
        const releaseResult = await releaseTableIfAllOrdersPaid(selectedOrder.mesaId, selectedOrder.id);
        setTableReleaseFeedback({
          mesaNumero: selectedOrder.mesaNumero || 0,
          released: releaseResult.released,
          pendingCount: releaseResult.pendingOrdersCount
        });
        setTimeout(() => setTableReleaseFeedback(null), 6000);
      }

      setSelectedOrder(null);
    } catch (err: any) {
      alert('Error al procesar cobro total: ' + err.message);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Confirmar cobro PARCIAL POR COMENSAL
  const handleConfirmDinerPayment = async () => {
    if (!selectedOrder || !currentEmployee || !activeSelectedDiner) return;
    setIsProcessingPayment(true);

    try {
      sounds.playCashRegister();

      const partialPaymentPayload: Omit<PartialPayment, 'id' | 'creadoEn'> = {
        tipo: 'comensal',
        comensalId: activeSelectedDiner.id,
        comensalNombre: activeSelectedDiner.nombre,
        comensalNumero: activeSelectedDiner.numero,
        monto: finalChargeAmount,
        metodoPago: paymentMethod,
        montoRecibido: paymentMethod === 'efectivo' ? cashGivenNum : finalChargeAmount,
        vuelto: paymentMethod === 'efectivo' ? changeDue : 0,
        cajeroNombre: currentEmployee.nombre,
        items: activeSelectedDiner.items,
        descuento: discountNum,
        propina: tipNum,
        total: finalChargeAmount,
        fecha: new Date().toISOString()
      };

      const result = await registerPartialPayment(selectedOrder.id, partialPaymentPayload);

      if (result.orderCompleted) {
        confetti({
          particleCount: 70,
          spread: 80,
          origin: { y: 0.7 }
        });

        if (selectedOrder.mesaId) {
          const releaseResult = await releaseTableIfAllOrdersPaid(selectedOrder.mesaId, selectedOrder.id);
          setTableReleaseFeedback({
            mesaNumero: selectedOrder.mesaNumero || 0,
            released: releaseResult.released,
            pendingCount: releaseResult.pendingOrdersCount
          });
          setTimeout(() => setTableReleaseFeedback(null), 6000);
        }

        setSelectedOrder(null);
      } else {
        // Update local selectedOrder representation so modal stays open with updated balances
        setSelectedOrder(prev => {
          if (!prev) return null;
          const updatedCobros = [...(prev.cobros || []), { ...partialPaymentPayload, id: `p_${Date.now()}`, creadoEn: new Date().toISOString() }];
          return {
            ...prev,
            saldoPendiente: result.saldoRestante,
            montoCobradoAcumulado: (prev.montoCobradoAcumulado || 0) + finalChargeAmount,
            cobros: updatedCobros
          };
        });

        // Pick next unpaid diner if available
        const nextUnpaid = orderDinersBreakdown.find(d => d.id !== activeSelectedDiner.id && d.pending > 0);
        if (nextUnpaid) {
          setSelectedDinerId(nextUnpaid.id);
          setCashGiven(nextUnpaid.pending.toString());
        }
      }
    } catch (err: any) {
      alert('Error al registrar cobro por comensal: ' + err.message);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Confirmar cobro PARCIAL EN PARTES IGUALES
  const handleConfirmEqualSharePayment = async () => {
    if (!selectedOrder || !currentEmployee) return;
    setIsProcessingPayment(true);

    try {
      sounds.playCashRegister();

      const shareAmount = finalChargeAmount;
      const partialPaymentPayload: Omit<PartialPayment, 'id' | 'creadoEn'> = {
        tipo: 'partes_iguales',
        monto: shareAmount,
        metodoPago: paymentMethod,
        montoRecibido: paymentMethod === 'efectivo' ? cashGivenNum : shareAmount,
        vuelto: paymentMethod === 'efectivo' ? changeDue : 0,
        cajeroNombre: currentEmployee.nombre,
        descuento: discountNum,
        propina: tipNum,
        total: shareAmount,
        fecha: new Date().toISOString()
      };

      const result = await registerPartialPayment(selectedOrder.id, partialPaymentPayload);

      if (result.orderCompleted) {
        confetti({
          particleCount: 70,
          spread: 80,
          origin: { y: 0.7 }
        });

        if (selectedOrder.mesaId) {
          const releaseResult = await releaseTableIfAllOrdersPaid(selectedOrder.mesaId, selectedOrder.id);
          setTableReleaseFeedback({
            mesaNumero: selectedOrder.mesaNumero || 0,
            released: releaseResult.released,
            pendingCount: releaseResult.pendingOrdersCount
          });
          setTimeout(() => setTableReleaseFeedback(null), 6000);
        }

        setSelectedOrder(null);
      } else {
        setSelectedOrder(prev => {
          if (!prev) return null;
          const updatedCobros = [...(prev.cobros || []), { ...partialPaymentPayload, id: `p_${Date.now()}`, creadoEn: new Date().toISOString() }];
          return {
            ...prev,
            saldoPendiente: result.saldoRestante,
            montoCobradoAcumulado: (prev.montoCobradoAcumulado || 0) + shareAmount,
            cobros: updatedCobros
          };
        });
        setSharesCount(prev => Math.max(1, prev - 1));
      }
    } catch (err: any) {
      alert('Error al registrar pago en partes iguales: ' + err.message);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Registrar Fuga / Cierre Forzado de Mesa
  const handleConfirmFuga = async () => {
    if (!selectedOrder || !currentEmployee) return;
    if (!fugaReason.trim()) {
      alert('Por favor especifica un motivo para registrar el cierre por fuga o forzado.');
      return;
    }

    if (!confirm('¿Estás seguro de registrar este pedido como FUGA / CIERRE FORZADO? La mesa será liberada y se guardará constancia en auditoría.')) {
      return;
    }

    setIsProcessingPayment(true);
    try {
      await registerOrderFuga(
        selectedOrder.id,
        fugaReason.trim(),
        currentEmployee.nombre
      );

      if (selectedOrder.mesaId) {
        const releaseResult = await releaseTableIfAllOrdersPaid(selectedOrder.mesaId, selectedOrder.id);
        setTableReleaseFeedback({
          mesaNumero: selectedOrder.mesaNumero || 0,
          released: releaseResult.released,
          pendingCount: releaseResult.pendingOrdersCount
        });
        setTimeout(() => setTableReleaseFeedback(null), 6000);
      }

      alert('Cierre forzado registrado.');
      setSelectedOrder(null);
    } catch (err: any) {
      alert('Error al registrar fuga: ' + err.message);
    } finally {
      setIsProcessingPayment(false);
    }
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
      businessId: currentRestaurant.businessId || 'biz_default',
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
            onClick={() => setActiveTab('pos')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'pos' 
                ? 'bg-white text-neutral-900 shadow-xs' 
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Utensils className="w-4 h-4 text-orange-600" />
            <span>Punto de Venta</span>
          </button>

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
              <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-[10px] flex items-center justify-center font-bold">
                {pendingPaymentOrders.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('mostrador')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'mostrador' 
                ? 'bg-white text-neutral-900 shadow-xs' 
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Store className="w-4 h-4 text-purple-600" />
            <span>Despacho Mostrador</span>
            {counterOrders.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center font-bold">
                {counterOrders.length}
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
        
        {/* TAB 0: Punto de Venta / Flujo de Mesero */}
        {activeTab === 'pos' && (
          <div className="h-full -m-4 sm:-m-6 flex flex-col">
            <WaiterPOS 
              menuItems={menuItems} 
              tables={tables} 
              orders={orders} 
              clients={clients} 
            />
          </div>
        )}

        {/* Feedback de liberación de mesa */}
        {tableReleaseFeedback && (
          <div className={`p-4 rounded-2xl mb-4 text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in ${
            tableReleaseFeedback.released
              ? 'bg-emerald-50 border border-emerald-300 text-emerald-900'
              : 'bg-amber-50 border border-amber-300 text-amber-900'
          }`}>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className={`w-5 h-5 shrink-0 ${tableReleaseFeedback.released ? 'text-emerald-600' : 'text-amber-600'}`} />
              <span>
                {tableReleaseFeedback.released
                  ? `Mesa #${tableReleaseFeedback.mesaNumero} liberada automáticamente: Todas sus órdenes asociadas han sido cobradas y su estado pasó a Disponible.`
                  : `Mesa #${tableReleaseFeedback.mesaNumero} continúa ocupada: Aún restan ${tableReleaseFeedback.pendingCount} comanda(s) pendiente(s) de cobro.`}
              </span>
            </div>
            <button 
              type="button" 
              onClick={() => setTableReleaseFeedback(null)} 
              className="text-neutral-400 hover:text-neutral-700 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TAB 1: Pedidos por cobrar */}
        {activeTab === 'pedidos' && (
          <div className="max-w-6xl mx-auto space-y-4">
            
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-neutral-800 text-sm uppercase tracking-wider">
                  Comandas pendientes de cobro
                </h3>
                <p className="text-xs text-neutral-500">
                  Visualiza el estado de entrega a la mesa y haz clic para registrar el cobro y liberar la mesa automáticamente.
                </p>
              </div>
              <span className="text-xs text-neutral-500 font-medium bg-neutral-100 px-3 py-1 rounded-full">
                {pendingPaymentOrders.length} pendiente(s)
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
                {pendingPaymentOrders.map((order, idx) => {
                  const isReady = order.estado === 'listo';
                  const isDelivered = order.estado === 'entregado';
                  const isExpress = order.ruta === 'express';

                  return (
                    <div
                      key={`${order.id}-${idx}`}
                      className={`bg-white rounded-2xl border transition-all p-4 flex flex-col justify-between shadow-xs hover:shadow-md ${
                        isDelivered 
                          ? 'border-emerald-500 ring-2 ring-emerald-500/25' 
                          : isReady 
                            ? 'border-emerald-300 ring-2 ring-emerald-500/15' 
                            : isExpress
                              ? 'border-purple-300 ring-1 ring-purple-400/25'
                              : 'border-neutral-200'
                      }`}
                    >
                      <div>
                        {/* Status Alert Banner if Delivered to Table */}
                        {isDelivered && (
                          <div className="mb-3 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-[11px] font-black text-emerald-800">
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                              Listo para cobro (Retirado por Mesero)
                            </span>
                          </div>
                        )}

                        {isExpress && !isDelivered && (
                          <div className="mb-3 px-2.5 py-1 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between text-[11px] font-black text-purple-800">
                            <span className="flex items-center gap-1.5">
                              <Store className="w-3.5 h-3.5 text-purple-600" />
                              Cobro Directo / Mostrador (Sin cocina)
                            </span>
                          </div>
                        )}

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
                              <div className="font-bold text-neutral-900 text-sm flex items-center gap-1.5">
                                <span>{order.tipo === 'local' ? `Mesa #${order.mesaNumero}` : `Delivery: ${order.empresaDelivery || 'General'}`}</span>
                                {order.rondas && order.rondas.length > 1 && (
                                  <span className="text-[10px] font-black px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded-md">
                                    {order.rondas.length} Rondas
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-neutral-400">
                                Mesero: {order.meseroNombre}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              isDelivered
                                ? 'bg-emerald-600 text-white'
                                : isReady 
                                  ? 'bg-emerald-100 text-emerald-800' 
                                  : order.estado === 'en_preparacion' 
                                    ? 'bg-blue-100 text-blue-800' 
                                    : 'bg-orange-100 text-orange-800'
                            }`}>
                              {isDelivered ? 'Retirado' : order.estado.replace('_', ' ')}
                            </span>
                            {order.comensales && order.comensales.length > 1 && (
                              <span className="text-[9px] font-black text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {order.comensales.length} comensales
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Partial Payment Progress Bar if any payment made */}
                        {order.saldoPendiente !== undefined && order.saldoPendiente < order.total && (
                          <div className="my-2 p-2 bg-amber-50 rounded-xl border border-amber-200 text-xs">
                            <div className="flex justify-between font-bold text-amber-900 text-[11px] mb-1">
                              <span>Cobrado: ${(order.montoCobradoAcumulado || (order.total - order.saldoPendiente)).toFixed(2)}</span>
                              <span>Resta: ${order.saldoPendiente.toFixed(2)}</span>
                            </div>
                            <div className="w-full bg-amber-200 h-2 rounded-full overflow-hidden">
                              <div 
                                className="bg-emerald-600 h-full transition-all"
                                style={{ width: `${Math.min(100, (((order.total - order.saldoPendiente) / order.total) * 100))}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Items list with preparation classification tag */}
                        <div className="py-3 space-y-1 text-xs">
                          {order.items.map((it, idx) => (
                            <div key={`ord-${order.id}-item-${idx}`} className="flex justify-between items-center text-neutral-600">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span><strong>{it.cantidad}x</strong> {it.nombre}</span>
                                {it.ronda && (
                                  <span className="text-[9px] font-bold px-1 py-0.2 bg-neutral-100 text-neutral-600 rounded">
                                    R{it.ronda}
                                  </span>
                                )}
                                {it.comensalId && (
                                  <span className="text-[9px] font-bold px-1 py-0.2 bg-blue-50 text-blue-700 rounded">
                                    {it.comensalId.toUpperCase()}
                                  </span>
                                )}
                                {it.requiereCocina === false ? (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 bg-purple-50 text-purple-700 rounded border border-purple-200">
                                    Mostrador
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 bg-orange-50 text-orange-700 rounded border border-orange-200">
                                    Cocina
                                  </span>
                                )}
                              </div>
                              <span className="font-medium">${(it.precio * it.cantidad).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Total and Collect Button (56px) */}
                      <div className="pt-3 border-t border-neutral-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-neutral-500">
                            {order.saldoPendiente !== undefined && order.saldoPendiente < order.total ? 'Saldo restante:' : 'Total comanda:'}
                          </span>
                          <span className="text-xl font-black text-neutral-900">
                            ${(order.saldoPendiente !== undefined ? order.saldoPendiente : order.total).toFixed(2)}
                          </span>
                        </div>

                        {isReady && !isDelivered && (
                          <button
                            type="button"
                            onClick={async () => {
                              sounds.playNotification();
                              sounds.stopRepeatingAlarm('ord-ready-' + order.id);
                              await markOrderDelivered(order.id, currentEmployee?.nombre || 'Caja / Mostrador');
                            }}
                            className="w-full min-h-[44px] rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-black text-xs transition flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <CheckCheck className="w-4 h-4 text-emerald-600" />
                            <span>Confirmar Entrega (Mostrador / Mesa)</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenPayment(order)}
                          className={`w-full min-h-[56px] rounded-xl font-extrabold text-sm transition flex items-center justify-center gap-2 shadow-md active:scale-98 cursor-pointer ${
                            isDelivered
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25'
                              : 'bg-neutral-900 hover:bg-neutral-800 text-white shadow-neutral-900/15'
                          }`}
                        >
                          <DollarSign className="w-5 h-5" />
                          Cobrar Comanda / Dividir Cuenta
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}

        {/* TAB MOSTRADOR: Despacho y Coordinación de Mostrador */}
        {activeTab === 'mostrador' && (
          <div className="max-w-6xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-neutral-800 text-sm uppercase tracking-wider flex items-center gap-2">
                  <Store className="w-4 h-4 text-purple-600" />
                  Despacho y Coordinación de Mostrador
                </h3>
                <p className="text-xs text-neutral-500">
                  Productos de cobro directo o sin preparación en cocina (bebidas frías, postres listos, snacks). Sincronizados con el avance de cocina.
                </p>
              </div>
              <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1 rounded-full">
                {counterOrders.length} orden(es) con mostrador
              </span>
            </div>

            {counterOrders.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 border border-neutral-200 text-center text-neutral-400">
                <Store className="w-12 h-12 mx-auto mb-2 text-neutral-300 stroke-1" />
                <p className="font-bold text-neutral-600">No hay productos de mostrador pendientes</p>
                <p className="text-xs text-neutral-400 mt-1">Los pedidos con bebidas o productos express aparecerán aquí para entrega y cobro.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {counterOrders.map((order, idx) => {
                  const counterItems = order.items.filter(it => it.requiereCocina !== true);
                  const kitchenItems = order.items.filter(it => it.requiereCocina === true);
                  const is100Express = order.ruta === 'express' || kitchenItems.length === 0;

                  return (
                    <div
                      key={`counter-${order.id}-${idx}`}
                      className="bg-white rounded-2xl border border-purple-200 p-4 flex flex-col justify-between shadow-xs hover:shadow-md"
                    >
                      <div className="space-y-3">
                        {/* Card Header */}
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
                            is100Express
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {is100Express ? '⚡ Express' : '🔄 Mixto'}
                          </span>
                        </div>

                        {/* Kitchen Sync status banner */}
                        {!is100Express ? (
                          order.estado === 'listo' ? (
                            <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>✅ ¡Cocina lista! Despachar mostrador para entrega coordinada</span>
                            </div>
                          ) : order.estado === 'entregado' ? (
                            <div className="p-2.5 bg-blue-50 border border-blue-300 rounded-xl text-xs font-bold text-blue-800 flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                              <span>🚀 Cocina retirada por mesero</span>
                            </div>
                          ) : (
                            <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-xs font-bold text-amber-800 flex items-center gap-2">
                              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                              <span>⏳ Cocina preparando platos calientes ({kitchenItems.length} platos)</span>
                            </div>
                          )
                        ) : (
                          <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-xs font-bold text-purple-800 flex items-center gap-2">
                            <Store className="w-4 h-4 text-purple-600 shrink-0" />
                            <span>⚡ Pedido 100% mostrador (Listo para cobro directo)</span>
                          </div>
                        )}

                        {/* Counter items list */}
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block">
                            Productos a despachar en Mostrador:
                          </span>
                          {counterItems.map((it, idx) => (
                            <div key={`cnt-it-${order.id}-${idx}`} className="p-2 bg-purple-50/50 rounded-lg border border-purple-100 text-xs">
                              <div className="flex justify-between items-center font-bold text-neutral-800">
                                <span><span className="text-purple-700 font-black">{it.cantidad}x</span> {it.nombre}</span>
                                <span>${(it.precio * it.cantidad).toFixed(2)}</span>
                              </div>
                              {it.notas && (
                                <p className="text-[11px] text-amber-700 font-medium italic mt-0.5">
                                  Nota: {it.notas}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Collapsed kitchen items preview if mixed */}
                        {kitchenItems.length > 0 && (
                          <div className="pt-2 border-t border-neutral-100">
                            <span className="text-[11px] text-neutral-400 block font-medium">
                              En cocina ({kitchenItems.length}): {kitchenItems.map(k => `${k.cantidad}x ${k.nombre}`).join(', ')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Card Footer: Action */}
                      <div className="pt-3 border-t border-neutral-100 mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-neutral-500">Total comanda:</span>
                          <span className="text-base font-black text-neutral-900">
                            ${order.total.toFixed(2)}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              sounds.playNotification();
                              sounds.stopRepeatingAlarm('ord-mostrador-' + order.id);
                              sounds.stopRepeatingAlarm('ord-ready-' + order.id);
                              await markOrderDelivered(order.id, currentEmployee?.nombre || 'Personal de Mostrador');
                            }}
                            className={`min-h-[44px] rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 border cursor-pointer ${
                              order.estadoEntrega === 'entregado'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-white hover:bg-neutral-50 text-neutral-800 border-neutral-200'
                            }`}
                          >
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                            {order.estadoEntrega === 'entregado' ? 'Despachado' : 'Despachar'}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              sounds.stopRepeatingAlarm('ord-mostrador-' + order.id);
                              sounds.stopRepeatingAlarm('ord-ready-' + order.id);
                              handleOpenPayment(order);
                            }}
                            className="min-h-[44px] rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            Cobrar
                          </button>
                        </div>
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
                    {todayPaidOrders.map((o, idx) => (
                      <tr key={`paid-${o.id}-${idx}`} className="hover:bg-neutral-50/60">
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

      {/* MODAL: Cobro y Liquidación de Pedido con División de Cuenta (Comensal / Partes Iguales / Total / Fuga) */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-neutral-100 space-y-4 max-h-[92vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-neutral-900 text-base flex items-center gap-2">
                    <span>Cobrar Comanda</span>
                    {selectedOrder.rondas && selectedOrder.rondas.length > 1 && (
                      <span className="text-[10px] font-black px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full">
                        {selectedOrder.rondas.length} Rondas
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {selectedOrder.tipo === 'local' ? `Mesa #${selectedOrder.mesaNumero} · ${selectedOrder.meseroNombre}` : `Delivery (${selectedOrder.empresaDelivery || 'General'})`}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-neutral-400 hover:text-neutral-700 p-1.5 rounded-xl hover:bg-neutral-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Split Mode Selector Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-neutral-100 rounded-2xl border border-neutral-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setSplitMode('total');
                  setCashGiven(currentPendingBalance.toString());
                }}
                className={`py-2 px-1 rounded-xl transition flex flex-col sm:flex-row items-center justify-center gap-1 ${
                  splitMode === 'total' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                <span>Cobrar Todo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSplitMode('comensal');
                  if (activeSelectedDiner) {
                    setCashGiven(activeSelectedDiner.pending.toString());
                  }
                }}
                className={`py-2 px-1 rounded-xl transition flex flex-col sm:flex-row items-center justify-center gap-1 ${
                  splitMode === 'comensal' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-blue-600" />
                <span>Por Comensal</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSplitMode('partes_iguales');
                  setCashGiven(equalShareAmount.toString());
                }}
                className={`py-2 px-1 rounded-xl transition flex flex-col sm:flex-row items-center justify-center gap-1 ${
                  splitMode === 'partes_iguales' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Divide className="w-3.5 h-3.5 text-purple-600" />
                <span>Partes Iguales</span>
              </button>

              <button
                type="button"
                onClick={() => setSplitMode('fuga')}
                className={`py-2 px-1 rounded-xl transition flex flex-col sm:flex-row items-center justify-center gap-1 ${
                  splitMode === 'fuga' ? 'bg-red-50 text-red-900 shadow-xs border border-red-200' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <AlertOctagon className="w-3.5 h-3.5 text-red-600" />
                <span>Fuga / Cierre</span>
              </button>
            </div>

            {/* Total Balance overview */}
            <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-neutral-500 font-medium">Total Comanda:</span>
                <span className="font-extrabold text-neutral-900 ml-1.5">${selectedOrder.total.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-neutral-500 font-medium">Ya Cobrado:</span>
                <span className="font-extrabold text-emerald-700 ml-1.5">
                  ${((selectedOrder.total - currentPendingBalance)).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 font-medium">Saldo Restante:</span>
                <span className="font-black text-amber-700 text-sm ml-1.5">${currentPendingBalance.toFixed(2)}</span>
              </div>
            </div>

            {/* MODE 1: POR COMENSAL */}
            {splitMode === 'comensal' && (
              <div className="space-y-3">
                <div className="text-xs font-bold text-neutral-700">Selecciona el comensal a cobrar:</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {orderDinersBreakdown.map((diner) => {
                    const isSelected = activeSelectedDiner?.id === diner.id;
                    return (
                      <button
                        key={`diner-btn-${diner.id}`}
                        type="button"
                        onClick={() => {
                          setSelectedDinerId(diner.id);
                          setCashGiven(diner.pending.toString());
                        }}
                        className={`p-2.5 rounded-2xl border text-left transition flex flex-col justify-between ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                            : diner.isPaid
                              ? 'bg-emerald-50/40 border-emerald-200 opacity-70'
                              : 'bg-white border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-xs text-neutral-900">{diner.nombre}</span>
                          {diner.isPaid ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-full">
                              Pagado
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded-full">
                              Pendiente
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-xs">
                          <span className="font-black text-sm text-neutral-900">${diner.subtotal.toFixed(2)}</span>
                          {diner.paid > 0 && !diner.isPaid && (
                            <span className="text-[10px] text-emerald-600 block">(Abonado: ${diner.paid.toFixed(2)})</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Diner items detail */}
                {activeSelectedDiner && (
                  <div className="p-3 bg-blue-50/40 rounded-2xl border border-blue-100 space-y-1.5 text-xs">
                    <span className="font-bold text-blue-900 block">Ítems de {activeSelectedDiner.nombre}:</span>
                    {activeSelectedDiner.items.length === 0 ? (
                      <p className="text-neutral-400 italic">No hay ítems asignados directamente a este comensal.</p>
                    ) : (
                      activeSelectedDiner.items.map((it, idx) => (
                        <div key={`diner-it-${idx}`} className="flex justify-between items-center text-neutral-700">
                          <span><strong>{it.cantidad}x</strong> {it.nombre} {it.ronda ? `(R${it.ronda})` : ''}</span>
                          <span className="font-semibold">${(it.precio * it.cantidad).toFixed(2)}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* MODE 2: PARTES IGUALES */}
            {splitMode === 'partes_iguales' && (
              <div className="space-y-3 p-3 bg-purple-50/50 rounded-2xl border border-purple-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-950">Dividir cuenta entre:</span>
                  <div className="flex gap-1.5">
                    {[2, 3, 4, 5, 6].map((num) => (
                      <button
                        key={`share-${num}`}
                        type="button"
                        onClick={() => {
                          setSharesCount(num);
                          setCashGiven((Math.round((currentPendingBalance / num) * 100) / 100).toString());
                        }}
                        className={`w-9 h-8 rounded-xl font-black text-xs transition border ${
                          sharesCount === num
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-white text-purple-900 border-purple-200 hover:bg-purple-50'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-purple-200/60 text-xs">
                  <span className="font-bold text-neutral-700">Monto por persona:</span>
                  <span className="text-lg font-black text-purple-950">${equalShareAmount.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* MODE 3: CIERRE FORZADO / FUGA */}
            {splitMode === 'fuga' && (
              <div className="space-y-3 p-3 bg-red-50/70 rounded-2xl border border-red-200">
                <div className="flex items-center gap-2 text-red-900 font-extrabold text-xs">
                  <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Registrar Fuga / Cierre de Mesa Sin Pago Completo</span>
                </div>
                <p className="text-[11px] text-red-700">
                  Usa esta opción si uno o todos los comensales se retiraron sin pagar. La mesa quedará liberada y se registrará la pérdida en auditoría.
                </p>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">Afecta a:</label>
                  <select
                    value={fugaDinerId}
                    onChange={(e) => setFugaDinerId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl border border-neutral-300 text-xs bg-white outline-none"
                  >
                    <option value="all">Toda la comanda (Saldo total restante: ${currentPendingBalance.toFixed(2)})</option>
                    {orderDinersBreakdown.filter(d => !d.isPaid).map(d => (
                      <option key={`fuga-opt-${d.id}`} value={d.id}>
                        {d.nombre} (Pendiente: ${d.pending.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">Motivo / Justificación:</label>
                  <input
                    type="text"
                    value={fugaReason}
                    onChange={(e) => setFugaReason(e.target.value)}
                    placeholder="Ej. Comensal se retiró sin abonar su consumo..."
                    className="w-full h-9 px-2.5 rounded-xl border border-neutral-300 text-xs bg-white outline-none"
                  />
                </div>

                <button
                  type="button"
                  disabled={isProcessingPayment}
                  onClick={handleConfirmFuga}
                  className="w-full h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm"
                >
                  <UserX className="w-4 h-4" />
                  Confirmar Fuga y Liberar Mesa
                </button>
              </div>
            )}

            {/* Standard payment fields (for Total, Comensal, and Partes Iguales) */}
            {splitMode !== 'fuga' && (
              <>
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

                {/* Total Final del Cobro Actual */}
                <div className="flex items-center justify-between p-3 bg-neutral-100 rounded-xl">
                  <span className="font-bold text-xs text-neutral-700">
                    {splitMode === 'comensal' ? `Monto a cobrar a ${activeSelectedDiner?.nombre || 'Comensal'}:` : splitMode === 'partes_iguales' ? 'Monto de cuota actual:' : 'Monto total a cobrar:'}
                  </span>
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
                      {[10, 20, 50, 100].map((val, idx) => (
                        <button
                          key={`cash-${val}-${idx}`}
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

                {/* History of registered payments on this order */}
                {selectedOrder.cobros && selectedOrder.cobros.length > 0 && (
                  <div className="space-y-1.5 p-2.5 bg-neutral-50 rounded-2xl border border-neutral-200 text-xs">
                    <span className="font-bold text-neutral-700 block text-[11px] uppercase tracking-wider">
                      Pagos Parciales ya Registrados ({selectedOrder.cobros.length}):
                    </span>
                    {selectedOrder.cobros.map((cobro, cIdx) => (
                      <div key={`cobro-${cobro.id || cIdx}`} className="flex justify-between items-center text-neutral-600 bg-white p-1.5 rounded-lg border border-neutral-100">
                        <span>
                          {cobro.comensalNombre ? `${cobro.comensalNombre}: ` : 'Pago: '}
                          <strong>${cobro.monto.toFixed(2)}</strong> ({cobro.metodoPago})
                        </span>
                        <span className="text-[10px] text-neutral-400">
                          {new Date(cobro.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action buttons (56px) */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="h-14 rounded-2xl bg-neutral-100 hover:bg-neutral-200 font-bold text-xs text-neutral-700"
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    disabled={isProcessingPayment || (splitMode === 'comensal' && activeSelectedDiner?.isPaid)}
                    onClick={() => {
                      if (splitMode === 'total') {
                        handleConfirmTotalPayment();
                      } else if (splitMode === 'comensal') {
                        handleConfirmDinerPayment();
                      } else if (splitMode === 'partes_iguales') {
                        handleConfirmEqualSharePayment();
                      }
                    }}
                    className={`h-14 rounded-2xl font-black text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                      isProcessingPayment || (splitMode === 'comensal' && activeSelectedDiner?.isPaid)
                        ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed shadow-none'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30'
                    }`}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    {isProcessingPayment 
                      ? 'Procesando...' 
                      : splitMode === 'comensal' 
                        ? `Cobrar ${activeSelectedDiner?.nombre || 'Comensal'}` 
                        : splitMode === 'partes_iguales' 
                          ? 'Cobrar Cuota' 
                          : 'Registrar Cobro Total'}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
};
