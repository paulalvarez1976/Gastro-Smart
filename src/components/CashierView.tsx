import { UNIQUE_BUSINESS_ID } from '../config/business';
import React, { useState, useMemo, useEffect } from 'react';
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
  registerOrderFuga,
  subscribeToCashCloses
} from '../services/dataService';
import { sounds } from '../utils/sound';
import { haptics } from '../utils/haptics';
import { ThermalReceiptModal } from './ThermalReceiptModal';
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
  UserX,
  Lock
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
  const [splitMode, setSplitMode] = useState<'total' | 'cuenta_compartida' | 'comensal' | 'partes_iguales' | 'fuga'>('total');
  const [sharedStep, setSharedStep] = useState<'cliente1' | 'cliente2'>('cliente1');
  const [sharedClient1Amount, setSharedClient1Amount] = useState<string>('');
  const [sharedSplitFeedback, setSharedSplitFeedback] = useState<string | null>(null);
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
  const [isCashShiftClosed, setIsCashShiftClosed] = useState<boolean>(false);
  const [thermalPrintOrder, setThermalPrintOrder] = useState<Order | null>(null);
  const [cashCloses, setCashCloses] = useState<CashRegisterClose[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  useEffect(() => {
    if (!currentRestaurant) return;
    const unsub = subscribeToCashCloses(
      currentRestaurant.businessId || UNIQUE_BUSINESS_ID,
      currentRestaurant.id,
      (data) => setCashCloses(data)
    );
    return () => unsub();
  }, [currentRestaurant]);
  const [shiftStartTime, setShiftStartTime] = useState<number>(() => {
    const stored = localStorage.getItem(`cash_shift_start_${currentRestaurant?.id}`);
    return stored ? new Date(stored).getTime() : 0;
  });

  const handleStartNewCashShift = () => {
    setIsCashShiftClosed(false);
    setClosedSummary(null);
    setCountedCash('');
    setCountedCard('');
    setCountedTransfer('');
    setCierreNotas('');
    setInitialCash('100.00');
    const nowMs = Date.now();
    setShiftStartTime(nowMs);
    localStorage.setItem(`cash_shift_start_${currentRestaurant?.id}`, new Date(nowMs).toISOString());
  };

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

  // Pedidos ya cobrados en el turno operativo actual
  const todayPaidOrders = useMemo(() => {
    const todayOpStr = getOperationalDateString(new Date());
    return restaurantOrders.filter(o => {
      const paidTime = new Date(o.cobradoEn || o.creadoEn).getTime();
      const isToday = getOperationalDateString(o.cobradoEn || o.creadoEn) === todayOpStr;
      return (o.estado === 'cobrado' || o.estadoPago === 'cobrado') && isToday && paidTime >= shiftStartTime;
    });
  }, [restaurantOrders, shiftStartTime]);

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
    const items = selectedOrder.items || [];
    const hasConfiguredDiners = Boolean(selectedOrder.comensales && selectedOrder.comensales.length > 0);
    const dinersList: OrderDiner[] = hasConfiguredDiners
      ? [...selectedOrder.comensales!]
      : [];

    const unassignedItems = items.filter(it => !it.comensalId || it.comensalId === 'general');

    if (!hasConfiguredDiners) {
      if (unassignedItems.length > 0) {
        dinersList.push({
          id: 'general',
          numero: 1,
          nombre: 'Cuenta / Mesa General',
          total: selectedOrder.total || 0
        });
      } else {
        dinersList.push(
          { id: 'c1', numero: 1, nombre: 'Comensal 1', total: 0 },
          { id: 'c2', numero: 2, nombre: 'Comensal 2', total: 0 }
        );
      }
    } else if (unassignedItems.length > 0) {
      dinersList.push({
        id: 'general',
        numero: dinersList.length + 1,
        nombre: 'Consumo Común',
        total: 0
      });
    }

    return dinersList.map(diner => {
      const isGeneral = diner.id === 'general';
      const dinerItems = isGeneral
        ? items.filter(it => !it.comensalId || it.comensalId === 'general')
        : items.filter(it => it.comensalId === diner.id);

      const dinerSubtotal = dinerItems.reduce((acc, it) => acc + (it.precio * it.cantidad), 0);
      const dinerPayments = (selectedOrder.cobros || []).filter(c => 
        isGeneral ? (!c.comensalId || c.comensalId === 'general') : c.comensalId === diner.id
      );
      const dinerPaid = dinerPayments.reduce((acc, c) => acc + (c.monto || c.total || 0), 0);
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

  // Cuenta Compartida (Cliente 1 y Saldo para Cliente 2)
  const sharedClient1AmountNum = useMemo(() => {
    if (!currentPendingBalance) return 0;
    const parsed = parseFloat(sharedClient1Amount);
    if (isNaN(parsed) || parsed <= 0) {
      return Math.round((currentPendingBalance / 2) * 100) / 100;
    }
    return Math.min(currentPendingBalance, Math.round(parsed * 100) / 100);
  }, [sharedClient1Amount, currentPendingBalance]);

  const sharedClient2RemainingNum = useMemo(() => {
    return Math.max(0, Math.round((currentPendingBalance - sharedClient1AmountNum) * 100) / 100);
  }, [currentPendingBalance, sharedClient1AmountNum]);

  // Cálculos dinámicos en cobro
  const discountNum = Math.max(0, parseFloat(discount) || 0);
  const tipNum = Math.max(0, parseFloat(tip) || 0);

  const baseChargeAmount = useMemo(() => {
    if (splitMode === 'cuenta_compartida') {
      if (sharedStep === 'cliente1') {
        return sharedClient1AmountNum;
      }
      return currentPendingBalance; // Para el segundo cliente cobra el saldo restante
    }
    if (splitMode === 'comensal' && activeSelectedDiner) {
      return activeSelectedDiner.pending;
    }
    if (splitMode === 'partes_iguales') {
      return equalShareAmount;
    }
    return currentPendingBalance;
  }, [splitMode, sharedStep, sharedClient1AmountNum, activeSelectedDiner, equalShareAmount, currentPendingBalance]);

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
    setSharedStep('cliente1');
    setSharedClient1Amount((Math.round((balance / 2) * 100) / 100).toString());
    setSharedSplitFeedback(null);
    if (order.comensales && order.comensales.length > 0) {
      setSelectedDinerId(order.comensales[0].id);
    } else {
      setSelectedDinerId('c1');
    }
  };

  // Confirmar cobro TOTAL (Liquidación Completa de la Comanda)
  const handleConfirmTotalPayment = async () => {
    if (isCashShiftClosed) {
      alert('El turno de caja está cerrado. No se pueden procesar cobros hasta iniciar un nuevo turno.');
      return;
    }
    if (!selectedOrder || !currentEmployee) return;
    setIsProcessingPayment(true);

    try {
      sounds.playCashRegister();
      haptics.success();
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

      // Ofrecer comprobante térmico instantáneo
      const paidOrderSnapshot: Order = {
        ...selectedOrder,
        estado: 'cobrado',
        subtotal: selectedOrder.subtotal || selectedOrder.total,
        descuento: discountNum,
        propina: tipNum,
        total: finalChargeAmount,
        metodoPago: paymentMethod,
        cajeroNombre: currentEmployee.nombre,
        cobradoEn: new Date().toISOString()
      };
      setThermalPrintOrder(paidOrderSnapshot);

      setSelectedOrder(null);
    } catch (err: any) {
      alert('Error al procesar cobro total: ' + err.message);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Confirmar cobro CUENTA COMPARTIDA (Resta el pago del primer cliente y deja el saldo para el segundo cliente)
  const handleConfirmSharedPayment = async () => {
    if (isCashShiftClosed) {
      alert('El turno de caja está cerrado. No se pueden procesar cobros hasta iniciar un nuevo turno.');
      return;
    }
    if (!selectedOrder || !currentEmployee) return;
    setIsProcessingPayment(true);

    try {
      sounds.playCashRegister();
      haptics.success();

      const isFirst = sharedStep === 'cliente1';
      const chargeAmount = finalChargeAmount;
      const clientLabel = isFirst ? 'Cliente 1 (Cuenta Compartida)' : 'Cliente 2 (Saldo Restante)';

      const partialPaymentPayload: Omit<PartialPayment, 'id' | 'creadoEn'> = {
        tipo: 'cuenta_compartida',
        comensalNombre: clientLabel,
        monto: chargeAmount,
        subtotal: chargeAmount,
        metodoPago: paymentMethod,
        montoRecibido: paymentMethod === 'efectivo' ? cashGivenNum : chargeAmount,
        vuelto: paymentMethod === 'efectivo' ? changeDue : 0,
        cajeroNombre: currentEmployee.nombre,
        descuento: discountNum,
        propina: tipNum,
        total: chargeAmount,
        saldoPendiente: isFirst ? sharedClient2RemainingNum : 0,
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

        const paidOrderSnapshot: Order = {
          ...selectedOrder,
          estado: 'cobrado',
          metodoPago: paymentMethod,
          cajeroNombre: currentEmployee.nombre,
          cobradoEn: new Date().toISOString()
        };
        setThermalPrintOrder(paidOrderSnapshot);
        setSelectedOrder(null);
        setSharedStep('cliente1');
        setSharedSplitFeedback(null);
      } else {
        // First client payment registered: now the remainder is for Client 2
        const updatedCobros = [
          ...(selectedOrder.cobros || []),
          { ...partialPaymentPayload, id: `p_${Date.now()}`, creadoEn: new Date().toISOString() }
        ];

        setSelectedOrder(prev => {
          if (!prev) return null;
          return {
            ...prev,
            saldoPendiente: result.saldoRestante,
            montoCobradoAcumulado: (prev.montoCobradoAcumulado || 0) + chargeAmount,
            cobros: updatedCobros
          };
        });

        // Instant ticket offer for Client 1
        const partialSnapshot: Order = {
          ...selectedOrder,
          subtotal: chargeAmount,
          total: chargeAmount,
          saldoPendiente: result.saldoRestante,
          clienteNombre: 'Cliente 1 (Cuenta Compartida)',
          metodoPago: paymentMethod,
          cajeroNombre: currentEmployee.nombre,
          cobradoEn: new Date().toISOString()
        };
        setThermalPrintOrder(partialSnapshot);

        // Switch to Step 2: Cliente 2
        setSharedStep('cliente2');
        setCashGiven(result.saldoRestante.toString());
        setDiscount('0');
        setTip('0');
        setSharedSplitFeedback(`✅ Pago de Cliente 1 registrado ($${chargeAmount.toFixed(2)}). Restan $${result.saldoRestante.toFixed(2)} para cobrar a Cliente 2.`);
      }
    } catch (err: any) {
      alert('Error al registrar cobro de cuenta compartida: ' + err.message);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Confirmar cobro PARCIAL POR COMENSAL
  const handleConfirmDinerPayment = async () => {
    if (isCashShiftClosed) {
      alert('El turno de caja está cerrado. No se pueden procesar cobros hasta iniciar un nuevo turno.');
      return;
    }
    if (!selectedOrder || !currentEmployee || !activeSelectedDiner) return;
    setIsProcessingPayment(true);

    try {
      sounds.playCashRegister();
      haptics.success();

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

        const paidOrderSnapshot: Order = {
          ...selectedOrder,
          estado: 'cobrado',
          metodoPago: paymentMethod,
          cajeroNombre: currentEmployee.nombre,
          cobradoEn: new Date().toISOString()
        };
        setThermalPrintOrder(paidOrderSnapshot);
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
    if (isCashShiftClosed) {
      alert('El turno de caja está cerrado. No se pueden procesar cobros hasta iniciar un nuevo turno.');
      return;
    }
    if (!selectedOrder || !currentEmployee) return;
    setIsProcessingPayment(true);

    try {
      sounds.playCashRegister();
      haptics.success();

      const shareAmount = finalChargeAmount;
      const currentPartNumber = (selectedOrder.cobros?.filter(c => c.tipo === 'partes_iguales').length || 0) + 1;
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
        fecha: new Date().toISOString(),
        numeroParte: currentPartNumber,
        totalPartes: sharesCount
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

        const paidOrderSnapshot: Order = {
          ...selectedOrder,
          estado: 'cobrado',
          metodoPago: paymentMethod,
          cajeroNombre: currentEmployee.nombre,
          cobradoEn: new Date().toISOString()
        };
        setThermalPrintOrder(paidOrderSnapshot);
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
    if (isCashShiftClosed) {
      alert('El turno de caja está cerrado. No se pueden procesar operaciones hasta iniciar un nuevo turno.');
      return;
    }
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
      businessId: currentRestaurant.businessId || UNIQUE_BUSINESS_ID,
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
    setIsCashShiftClosed(true);

    alert('Cierre de caja y arqueo guardado correctamente. El turno ha quedado cerrado y bloqueado.');
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100dvh-65px)] min-h-0 bg-neutral-100 overflow-hidden">
      
      {/* Aviso de Turno Cerrado */}
      {isCashShiftClosed && (
        <div className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-between text-xs font-bold shadow-md z-20">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-white animate-pulse" />
            <span>TURNO DE CAJA CERRADO: Este turno está bloqueado. No se permiten cobros ni modificaciones.</span>
          </div>
          <button
            onClick={handleStartNewCashShift}
            className="px-3 py-1.5 rounded-lg bg-white text-red-700 font-black hover:bg-neutral-100 transition shadow-sm cursor-pointer"
          >
            🔄 Iniciar Nuevo Turno de Caja (Sin registros anteriores)
          </button>
        </div>
      )}

      {/* Top Navigation in 2 Horizontal Stripes for Cashier */}
      <div className="bg-white border-b border-neutral-200 shadow-2xs shrink-0 flex flex-col">
        {/* FRANJA 1: Identificador del Módulo y Pestañas de Operación y Venta en Vivo */}
        <div className="px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-neutral-900 text-sm sm:text-base leading-tight">Módulo de Caja y Facturación</h2>
              <p className="text-[11px] text-neutral-500 font-medium">{currentRestaurant?.nombre || 'Sucursal Principal'}</p>
            </div>
          </div>

          {/* Grupo de Pestañas de Venta y Cobro Directo */}
          <div className="flex items-center gap-1.5 p-1 bg-neutral-100/90 rounded-xl border border-neutral-200/80 overflow-x-auto">
            <button
              onClick={() => setActiveTab('pos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'pos' 
                  ? 'bg-white text-orange-700 shadow-xs border border-orange-200/60' 
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/50'
              }`}
            >
              <Utensils className="w-4 h-4 text-orange-600" />
              <span>Punto de Venta (TPV)</span>
            </button>

            <button
              onClick={() => setActiveTab('pedidos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'pedidos' 
                  ? 'bg-white text-amber-700 shadow-xs border border-amber-200/60' 
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/50'
              }`}
            >
              <Receipt className="w-4 h-4 text-amber-600" />
              <span>Por Cobrar</span>
              {pendingPaymentOrders.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-[10px] flex items-center justify-center font-black animate-pulse">
                  {pendingPaymentOrders.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('mostrador')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'mostrador' 
                  ? 'bg-white text-purple-700 shadow-xs border border-purple-200/60' 
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/50'
              }`}
            >
              <Store className="w-4 h-4 text-purple-600" />
              <span>Despacho Mostrador</span>
              {counterOrders.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center font-black">
                  {counterOrders.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* FRANJA 2: Control Contable, Arqueo de Turno, Historial y Resumen Financiero en Vivo */}
        <div className="bg-neutral-50/80 px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2.5 overflow-x-auto">
          {/* Botones de Control de Caja y Reportes */}
          <div className="flex items-center gap-1.5 p-1 bg-white rounded-xl border border-neutral-200/80 shadow-2xs">
            <button
              onClick={() => setActiveTab('cierre')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'cierre' 
                  ? 'bg-emerald-600 text-white shadow-xs' 
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Arqueo y Cierre de Caja</span>
            </button>

            <button
              onClick={() => setActiveTab('historial')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeTab === 'historial' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Cobrados Hoy</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeTab === 'historial' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
              }`}>
                {todayPaidOrders.length}
              </span>
            </button>
          </div>

          {/* Indicadores Financieros Rápidos del Turno */}
          <div className="flex items-center gap-2 sm:gap-3 text-xs shrink-0">
            <div className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-xl border border-neutral-200 shadow-2xs">
              <span className="text-[11px] font-bold text-neutral-500">Recaudado Hoy:</span>
              <span className="font-black text-emerald-700 text-xs sm:text-sm">
                ${todayPaidOrders.reduce((acc, o) => acc + (o.total || 0), 0).toFixed(2)}
              </span>
            </div>

            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-bold ${
              isCashShiftClosed 
                ? 'bg-red-50 text-red-700 border-red-200' 
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isCashShiftClosed ? 'bg-red-500' : 'bg-emerald-500 animate-ping'}`} />
              <span>{isCashShiftClosed ? 'Turno Cerrado' : 'Caja Activa'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className={`flex-1 min-h-0 ${activeTab === 'pos' ? 'overflow-hidden p-0 flex flex-col' : 'overflow-y-auto p-4 sm:p-6'}`}>
        
        {/* TAB 0: Punto de Venta / Flujo de Mesero */}
        {activeTab === 'pos' && (
          <div className="h-full w-full flex-1 min-h-0 flex flex-col overflow-hidden">
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
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowHistoryModal(true);
                      sounds.playKeypadClick();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-blue-200 shadow-2xs"
                  >
                    <History className="w-4 h-4" />
                    <span>Histórico de Cierres</span>
                  </button>
                  <div className="text-right">
                    <div className="text-xs font-semibold text-neutral-400">Fecha del turno</div>
                    <div className="text-sm font-black text-neutral-800">
                      {new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </div>
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
                      <th className="p-3 text-center">Ticket</th>
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
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => setThermalPrintOrder(o)}
                            title="Imprimir ticket térmico (58mm/80mm / Bluetooth)"
                            className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
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
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setThermalPrintOrder(selectedOrder)}
                  title="Imprimir Pre-cuenta / Ticket Térmico (58mm / 80mm / Bluetooth)"
                  className="px-2.5 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs flex items-center gap-1.5 border border-neutral-300 transition active:scale-95"
                >
                  <Printer className="w-3.5 h-3.5 text-neutral-600" />
                  <span className="hidden sm:inline">Pre-cuenta</span>
                </button>
                <button onClick={() => setSelectedOrder(null)} className="text-neutral-400 hover:text-neutral-700 p-1.5 rounded-xl hover:bg-neutral-100">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Split Mode Selector Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 p-1 bg-neutral-100 rounded-2xl border border-neutral-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setSplitMode('total');
                  setCashGiven(currentPendingBalance.toString());
                }}
                className={`py-2 px-1 rounded-xl transition flex flex-col items-center justify-center gap-1 ${
                  splitMode === 'total' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                <span>Cobrar Todo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSplitMode('cuenta_compartida');
                  setSharedStep('cliente1');
                  const half = Math.round((currentPendingBalance / 2) * 100) / 100;
                  setSharedClient1Amount(half.toString());
                  setCashGiven(half.toString());
                }}
                className={`py-2 px-1 rounded-xl transition flex flex-col items-center justify-center gap-1 ${
                  splitMode === 'cuenta_compartida' ? 'bg-white text-blue-900 shadow-xs ring-1 ring-blue-400/40' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-blue-600" />
                <span>Compartida</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSplitMode('comensal');
                  if (activeSelectedDiner) {
                    setCashGiven(activeSelectedDiner.pending.toString());
                  }
                }}
                className={`py-2 px-1 rounded-xl transition flex flex-col items-center justify-center gap-1 ${
                  splitMode === 'comensal' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Utensils className="w-3.5 h-3.5 text-indigo-600" />
                <span>Por Comensal</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSplitMode('partes_iguales');
                  setCashGiven(equalShareAmount.toString());
                }}
                className={`py-2 px-1 rounded-xl transition flex flex-col items-center justify-center gap-1 ${
                  splitMode === 'partes_iguales' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Divide className="w-3.5 h-3.5 text-purple-600" />
                <span>Partes Iguales</span>
              </button>

              <button
                type="button"
                onClick={() => setSplitMode('fuga')}
                className={`py-2 px-1 rounded-xl transition flex flex-col items-center justify-center gap-1 sm:col-span-1 col-span-2 ${
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

            {/* MODE: CUENTA COMPARTIDA (CLIENTE 1 / CLIENTE 2) */}
            {splitMode === 'cuenta_compartida' && (
              <div className="space-y-3 p-3.5 bg-blue-50/60 rounded-2xl border border-blue-200">
                <div className="flex items-center justify-between pb-2 border-b border-blue-200/60">
                  <div className="flex items-center gap-2 text-blue-950 font-bold text-xs">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>Cuenta Compartida: Cliente 1 & Saldo para Cliente 2</span>
                  </div>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                    sharedStep === 'cliente1' ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
                  }`}>
                    {sharedStep === 'cliente1' ? '1️⃣ Paso 1: Cobrar a Cliente 1' : '2️⃣ Paso 2: Cobrar Saldo a Cliente 2'}
                  </span>
                </div>

                {sharedSplitFeedback && (
                  <div className="p-2.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-semibold animate-in fade-in">
                    {sharedSplitFeedback}
                  </div>
                )}

                {sharedStep === 'cliente1' ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-neutral-800">
                        Monto a abonar por el Primer Cliente ($):
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0.01"
                        max={currentPendingBalance}
                        value={sharedClient1Amount}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSharedClient1Amount(val);
                          const p = parseFloat(val) || 0;
                          setCashGiven(p > 0 ? p.toString() : '');
                        }}
                        className="w-full h-10 px-3 rounded-xl border border-blue-300 bg-white font-black text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        placeholder="0.00"
                      />

                      {/* Presets rápidos */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const half = Math.round((currentPendingBalance / 2) * 100) / 100;
                            setSharedClient1Amount(half.toString());
                            setCashGiven(half.toString());
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-blue-900 text-[11px] font-bold hover:bg-blue-100 cursor-pointer"
                        >
                          50% ($${(currentPendingBalance / 2).toFixed(2)})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const part = Math.round((currentPendingBalance * 0.6) * 100) / 100;
                            setSharedClient1Amount(part.toString());
                            setCashGiven(part.toString());
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-blue-900 text-[11px] font-bold hover:bg-blue-100 cursor-pointer"
                        >
                          60% ($${(currentPendingBalance * 0.6).toFixed(2)})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const part = Math.round((currentPendingBalance * 0.7) * 100) / 100;
                            setSharedClient1Amount(part.toString());
                            setCashGiven(part.toString());
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-blue-900 text-[11px] font-bold hover:bg-blue-100 cursor-pointer"
                        >
                          70% ($${(currentPendingBalance * 0.7).toFixed(2)})
                        </button>
                      </div>
                    </div>

                    {/* Desglose en vivo de resta para segundo cliente */}
                    <div className="grid grid-cols-2 gap-2 p-2.5 bg-white rounded-xl border border-blue-200 text-xs font-mono">
                      <div className="p-2 rounded-lg bg-blue-50 border border-blue-100">
                        <span className="text-[10px] text-blue-700 font-bold block">1️⃣ Pago Cliente 1</span>
                        <strong className="text-sm text-blue-950 font-black">${sharedClient1AmountNum.toFixed(2)}</strong>
                      </div>
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
                        <span className="text-[10px] text-amber-800 font-bold block">2️⃣ Saldo para Cliente 2</span>
                        <strong className="text-sm text-amber-900 font-black">${sharedClient2RemainingNum.toFixed(2)}</strong>
                      </div>
                    </div>

                    <p className="text-[11px] text-neutral-600 leading-snug">
                      ✓ Al registrar el pago de Cliente 1, se resta automáticamente y el sistema dejará preparado el saldo restante ($${sharedClient2RemainingNum.toFixed(2)}) para cobrar al segundo cliente.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="p-3 bg-white rounded-xl border border-emerald-300 space-y-1 font-mono">
                      <span className="text-[10px] text-emerald-700 font-bold block uppercase tracking-wider">
                        Saldo Restante a Liquidar por Cliente 2:
                      </span>
                      <strong className="text-2xl font-black text-emerald-900">${currentPendingBalance.toFixed(2)}</strong>
                      <p className="text-[11px] text-neutral-600 font-sans pt-1">
                        El importe del primer cliente ya fue cobrado. Elige el método de pago y confirma para liquidar la comanda.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

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
                      } else if (splitMode === 'cuenta_compartida') {
                        handleConfirmSharedPayment();
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
                      : splitMode === 'cuenta_compartida'
                        ? (sharedStep === 'cliente1'
                            ? `Cobrar Cliente 1 ($${finalChargeAmount.toFixed(2)})`
                            : `Cobrar Saldo Cliente 2 ($${finalChargeAmount.toFixed(2)}) y Finalizar`)
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

      {/* Modal Impresión Térmica de Ticket / Cuenta */}
      {thermalPrintOrder && (() => {
        const matchingClient = clients.find(c => 
          (thermalPrintOrder.clienteId && c.id === thermalPrintOrder.clienteId) ||
          (thermalPrintOrder.clienteNombre && c.nombre.toLowerCase().trim() === thermalPrintOrder.clienteNombre.toLowerCase().trim())
        );
        const resolvedClientPhone = thermalPrintOrder.clienteTelefono || matchingClient?.telefono;
        const resolvedClientName = thermalPrintOrder.clienteNombre || matchingClient?.nombre;

        return (
          <ThermalReceiptModal
            order={thermalPrintOrder}
            restaurantName={currentRestaurant?.nombre || 'Restaurante'}
            restaurantLogo={currentRestaurant?.logoUrl || undefined}
            restaurantAddress={currentRestaurant?.direccion}
            restaurantPhone={currentRestaurant?.telefono}
            clientPhone={resolvedClientPhone || undefined}
            clientName={resolvedClientName || undefined}
            mode="cuenta"
            onClose={() => setThermalPrintOrder(null)}
          />
        );
      })()}

      {/* Modal Histórico de Cierres de Caja (Transparencia Contable) */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-neutral-100 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-neutral-950">Histórico de Cierres de Caja</h3>
                  <p className="text-xs text-neutral-500">
                    Auditoría y transparencia contable de turnos anteriores • {currentRestaurant?.nombre}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1.5 rounded-xl hover:bg-neutral-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content List / Table */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {cashCloses.length === 0 ? (
                <div className="text-center py-16 text-neutral-400">
                  <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-30 text-blue-600" />
                  <p className="font-bold text-sm">No hay cierres de caja registrados todavía en este establecimiento.</p>
                  <p className="text-xs text-neutral-400 mt-1">Los cierres guardados por los cajeros aparecerán listados aquí.</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-3.5">Fecha / Turno</th>
                        <th className="p-3.5">Cajero</th>
                        <th className="p-3.5 text-right">Fondo Inicial</th>
                        <th className="p-3.5 text-right">Esperado</th>
                        <th className="p-3.5 text-right">Real Contado</th>
                        <th className="p-3.5 text-right">Diferencia</th>
                        <th className="p-3.5 text-center">Pedidos</th>
                        <th className="p-3.5">Notas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-neutral-700">
                      {cashCloses.map((cClose, idx) => {
                        const diff = cClose.diferencia || 0;
                        const isSquare = Math.abs(diff) < 0.01;
                        const isSurplus = diff > 0.01;

                        return (
                          <tr key={`close-${cClose.id || idx}`} className="hover:bg-neutral-50/70 transition">
                            <td className="p-3.5 font-mono">
                              <div className="font-bold text-neutral-900">{new Date(cClose.fecha || cClose.creadoEn).toLocaleDateString()}</div>
                              <div className="text-[10px] text-neutral-400">
                                {new Date(cClose.fecha || cClose.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>
                            <td className="p-3.5 font-semibold text-neutral-800">
                              {cClose.cajeroNombre || 'Cajero'}
                            </td>
                            <td className="p-3.5 text-right font-mono text-neutral-600">
                              ${(cClose.montoInicial || 0).toFixed(2)}
                            </td>
                            <td className="p-3.5 text-right font-mono font-bold text-neutral-900">
                              ${(cClose.totalEsperado || 0).toFixed(2)}
                            </td>
                            <td className="p-3.5 text-right font-mono font-bold text-emerald-700">
                              ${(cClose.totalReal || 0).toFixed(2)}
                            </td>
                            <td className="p-3.5 text-right font-mono">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-black ${
                                isSquare
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : isSurplus
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                {isSquare ? 'Cuadrado ($0.00)' : isSurplus ? `+${diff.toFixed(2)}` : diff.toFixed(2)}
                              </span>
                            </td>
                            <td className="p-3.5 text-center font-bold text-neutral-600">
                              {cClose.totalPedidosCobrados || 0}
                            </td>
                            <td className="p-3.5 text-neutral-500 italic max-w-xs truncate">
                              {cClose.notas || 'Sin observaciones'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
              <span>Total de cierres históricos: <strong className="text-neutral-900">{cashCloses.length}</strong></span>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-bold rounded-xl transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
