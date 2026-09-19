import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { MenuItem, Table, OrderItem, OrderType, DeliveryCompany, Order, Client, OrderDiner } from '../types';
import { createOrder, appendItemsToExistingOrder, cambiarEstadoPedido } from '../services/dataService';
import { sounds } from '../utils/sound';
import { haptics } from '../utils/haptics';
import { WaiterOrderSetup, OrderSetupData } from './WaiterOrderSetup';
import { 
  ShoppingBag, 
  Plus, 
  Minus, 
  Trash2, 
  Send, 
  Utensils, 
  Bike, 
  User, 
  Phone, 
  MapPin, 
  Check, 
  AlertCircle,
  Clock,
  CheckCircle2,
  X,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Search,
  CheckCheck,
  PackageCheck,
  AlertTriangle,
  ClipboardList,
  Users,
  ChevronDown,
  ChevronUp,
  Tag,
  Flame,
  Layers,
  Printer
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ThermalReceiptModal } from './ThermalReceiptModal';

interface WaiterPOSProps {
  menuItems: MenuItem[];
  tables: Table[];
  orders: Order[];
  clients?: Client[];
}

export const WaiterPOS: React.FC<WaiterPOSProps> = ({ 
  menuItems, 
  tables, 
  orders, 
  clients = [] 
}) => {
  const { currentEmployee, currentRestaurant } = useAuth();

  // Active top-level mode: 'pos' (Tomar Pedido) | 'mis_pedidos' (Lista de Mis Pedidos)
  const [activeMainTab, setActiveMainTab] = useState<'pos' | 'mis_pedidos'>('pos');
  const [orderFilterStatus, setOrderFilterStatus] = useState<'all' | 'listos' | 'cocina' | 'entregados'>('all');

  // Current Step inside POS:
  // 1 = NUEVO PEDIDO (PASO 1: ELEGIR TIPO - MESA o CLIENTE)
  // 2 = TOMAR EL PEDIDO (PASO 2: MENÚ POS + ENCABEZADO FIJO + CARRITO + COMENSALES)
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // Setup data from Step 1
  const [setupData, setSetupData] = useState<OrderSetupData | null>(null);

  // Comensales (Diners) State for tables
  const [diners, setDiners] = useState<OrderDiner[]>([
    { id: 'c1', numero: 1, nombre: 'Comensal 1', total: 0 },
    { id: 'c2', numero: 2, nombre: 'Comensal 2', total: 0 }
  ]);
  const [activeDinerId, setActiveDinerId] = useState<string>('c1');
  const [editingDinerNameId, setEditingDinerNameId] = useState<string | null>(null);
  const [editingDinerNameVal, setEditingDinerNameVal] = useState<string>('');
  const [showPrevRoundsAccordion, setShowPrevRoundsAccordion] = useState(false);

  // POS Menu State
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [menuSearch, setMenuSearch] = useState<string>('');
  const [isMenuExpanded, setIsMenuExpanded] = useState<boolean>(true);

  // Cart
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [itemNoteModal, setItemNoteModal] = useState<{ index: number; note: string } | null>(null);

  // Send Confirmation Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success feedback message
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Ticket modal state for pre-cuenta or sending by WhatsApp
  const [ticketOrderToPrint, setTicketOrderToPrint] = useState<Order | null>(null);

  // Sync Diners when entering Step 2 or changing target order
  useEffect(() => {
    if (setupData?.targetExistingOrder?.comensales && setupData.targetExistingOrder.comensales.length > 0) {
      setDiners(setupData.targetExistingOrder.comensales);
      setActiveDinerId(setupData.targetExistingOrder.comensales[0].id);
    } else if (setupData?.orderTargetType === 'mesa') {
      const defaultDiners: OrderDiner[] = [
        { id: 'c1', numero: 1, nombre: 'Comensal 1', total: 0 },
        { id: 'c2', numero: 2, nombre: 'Comensal 2', total: 0 }
      ];
      setDiners(defaultDiners);
      setActiveDinerId('c1');
    }
  }, [setupData]);

  // Categories list
  const categories = useMemo(() => {
    const cats = Array.from(new Set(menuItems.map(m => m.categoria).filter(Boolean)));
    return ['Todos', ...cats];
  }, [menuItems]);

  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      const matchCat = selectedCategory === 'Todos' || item.categoria === selectedCategory;
      const matchRest = !item.restaurantId || item.restaurantId === 'all' || !currentRestaurant?.id || item.restaurantId === currentRestaurant?.id || (currentRestaurant?.businessId && item.businessId === currentRestaurant.businessId);
      const matchSearch = !menuSearch.trim() || 
        item.nombre.toLowerCase().includes(menuSearch.toLowerCase()) ||
        (item.descripcion || '').toLowerCase().includes(menuSearch.toLowerCase());
      return matchCat && matchRest && matchSearch;
    });
  }, [menuItems, selectedCategory, currentRestaurant, menuSearch]);

  // Cart calculations
  const totalAmount = useMemo(() => {
    return cart.reduce((sum, i) => sum + (i.precio * i.cantidad), 0);
  }, [cart]);

  // Current Round Number
  const currentRoundNumber = useMemo(() => {
    if (setupData?.targetExistingOrder) {
      return (setupData.targetExistingOrder.rondaActual || 1) + 1;
    }
    return 1;
  }, [setupData]);

  // Handle continuing from Step 1 to Step 2
  const handleOrderSetupContinue = (data: OrderSetupData) => {
    setSetupData(data);
    setCurrentStep(2);
    setIsMenuExpanded(true);
  };

  // Diners Management
  const handleAddDiner = () => {
    sounds.playKeypadClick();
    const nextNum = diners.length + 1;
    const newDinerId = `c${nextNum}_${Date.now().toString(36).substring(3, 6)}`;
    const newDiner: OrderDiner = {
      id: newDinerId,
      numero: nextNum,
      nombre: `Comensal ${nextNum}`,
      total: 0
    };
    setDiners(prev => [...prev, newDiner]);
    setActiveDinerId(newDinerId);
  };

  const handleSaveDinerName = (dinerId: string) => {
    if (!editingDinerNameVal.trim()) {
      setEditingDinerNameId(null);
      return;
    }
    setDiners(prev => prev.map(d => d.id === dinerId ? { ...d, nombre: editingDinerNameVal.trim() } : d));
    // Update items in cart already tagged with this diner
    setCart(prev => prev.map(item => item.comensalId === dinerId ? { ...item, comensalNombre: editingDinerNameVal.trim() } : item));
    setEditingDinerNameId(null);
    setEditingDinerNameVal('');
  };

  // Add Item to Cart
  const handleAddToCart = (item: MenuItem) => {
    if (!item.disponible) return;
    sounds.playKeypadClick();
    haptics.tap();

    const activeDiner = diners.find(d => d.id === activeDinerId) || diners[0];
    const isTableOrder = setupData?.orderTargetType === 'mesa';

    setCart(prev => {
      // If table order, match by both menuItemId and active comensalId
      const existingIdx = prev.findIndex(i => 
        i.menuItemId === item.id && (!isTableOrder || i.comensalId === activeDiner?.id)
      );

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          cantidad: updated[existingIdx].cantidad + 1
        };
        return updated;
      }

      const newItem: OrderItem = {
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        menuItemId: item.id,
        nombre: item.nombre,
        precio: item.precio,
        cantidad: 1,
        notas: null,
        requiereCocina: item.requiereCocina !== false,
        fotoUrl: item.fotoUrl || item.imagenUrl || null,
        imagenUrl: item.imagenUrl || item.fotoUrl || null,
        ronda: currentRoundNumber,
        comensalId: isTableOrder ? (activeDiner?.id || 'c1') : null,
        comensalNombre: isTableOrder ? (activeDiner?.nombre || 'Comensal 1') : null,
        comensalNumero: isTableOrder ? (activeDiner?.numero || 1) : null,
        estadoItem: item.requiereCocina !== false ? 'pendiente' : 'listo',
        estado: item.requiereCocina !== false ? 'pendiente_cocina' : 'listo'
      };

      return [...prev, newItem];
    });
  };

  const handleSubtractItem = (item: MenuItem) => {
    sounds.playKeypadClick();
    haptics.tap();

    const isTableOrder = setupData?.orderTargetType === 'mesa';
    const activeDiner = diners.find(d => d.id === activeDinerId);

    setCart(prev => {
      const existingIndex = prev.findIndex(i => 
        i.menuItemId === item.id && 
        (!isTableOrder || i.comensalId === (activeDiner?.id || 'c1'))
      );

      if (existingIndex < 0) return prev;

      const updated = [...prev];
      if (updated[existingIndex].cantidad > 1) {
        updated[existingIndex] = {
          ...updated[existingIndex],
          cantidad: updated[existingIndex].cantidad - 1
        };
        return updated;
      } else {
        return updated.filter((_, idx) => idx !== existingIndex);
      }
    });
  };

  const handleUpdateQty = (index: number, delta: number) => {
    sounds.playKeypadClick();
    haptics.tap();
    setCart(prev => {
      const updated = [...prev];
      const newQty = updated[index].cantidad + delta;
      if (newQty <= 0) {
        return updated.filter((_, idx) => idx !== index);
      }
      updated[index].cantidad = newQty;
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    sounds.playKeypadClick();
    setCart(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleAssignItemDiner = (index: number, dinerId: string) => {
    const targetDiner = diners.find(d => d.id === dinerId);
    if (!targetDiner) return;
    sounds.playKeypadClick();
    setCart(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        comensalId: targetDiner.id,
        comensalNombre: targetDiner.nombre,
        comensalNumero: targetDiner.numero
      };
      return updated;
    });
  };

  const handleSaveItemNote = (note: string) => {
    if (itemNoteModal === null) return;
    setCart(prev => {
      const updated = [...prev];
      updated[itemNoteModal.index].notas = note.trim() || null;
      return updated;
    });
    setItemNoteModal(null);
  };

  // Switch Target back to Step 1
  const handleChangeTarget = () => {
    sounds.playKeypadClick();
    setCurrentStep(1);
  };

  // SEND TO KITCHEN / SAVE ORDER
  const handleSendToKitchen = async () => {
    if (!setupData || cart.length === 0 || !currentRestaurant) return;
    setIsSubmitting(true);

    try {
      const isTableOrder = setupData.orderTargetType === 'mesa';
      const roundNum = currentRoundNumber;
      const nowIso = new Date().toISOString();

      // Ensure all items in cart have the proper round number and metadata
      const sanitizedCartItems: OrderItem[] = cart.map(it => ({
        ...it,
        ronda: roundNum,
        rondaEnviadaEn: nowIso,
        requiereCocina: it.requiereCocina !== false,
        estadoItem: it.requiereCocina !== false ? 'pendiente' : 'listo',
        estado: it.requiereCocina !== false ? 'pendiente_cocina' : 'listo',
        comensalId: isTableOrder ? (it.comensalId || diners[0]?.id || 'c1') : null,
        comensalNombre: isTableOrder ? (it.comensalNombre || diners[0]?.nombre || 'Comensal 1') : null,
        comensalNumero: isTableOrder ? (it.comensalNumero || diners[0]?.numero || 1) : null
      }));

      if (setupData.targetExistingOrder) {
        // Append items to existing order (Next round)
        await appendItemsToExistingOrder(
          setupData.targetExistingOrder.id,
          sanitizedCartItems,
          {
            userName: currentEmployee?.nombre || 'Mesero',
            comensales: isTableOrder ? diners : undefined,
            timelineEvent: {
              estado: 'pendiente_cocina',
              fecha: nowIso,
              usuario: currentEmployee?.nombre || 'Mesero',
              motivo: `Mesa #${setupData.selectedTable?.numero} · Ronda ${roundNum} enviada a cocina (${sanitizedCartItems.length} plato(s))`
            }
          } as any
        );

        sounds.playNotification();
        haptics.success();
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.8 }
        });

        setSuccessToast(`¡Ronda ${roundNum} enviada a Cocina para Mesa #${setupData.selectedTable?.numero}!`);
      } else {
        // Create brand new order (Round 1)
        const newOrderPayload: Omit<Order, 'id' | 'creadoEn'> = {
          restaurantId: currentRestaurant.id,
          businessId: currentRestaurant.businessId || 'biz_default',
          tipo: setupData.orderType,
          mesaId: setupData.selectedTable ? setupData.selectedTable.id : null,
          mesaNumero: setupData.selectedTable ? setupData.selectedTable.numero : null,
          meseroId: currentEmployee?.id || 'mesero_default',
          meseroNombre: currentEmployee?.nombre || 'Mesero',
          clienteId: setupData.selectedClient ? setupData.selectedClient.id : null,
          clienteNombre: setupData.selectedClient ? setupData.selectedClient.nombre : (setupData.selectedTable ? `Mesa #${setupData.selectedTable.numero}` : 'Cliente Mostrador'),
          clienteTelefono: setupData.selectedClient ? setupData.selectedClient.telefono : null,
          clienteDireccion: setupData.orderType === 'delivery' ? setupData.deliveryAddress : null,
          empresaDelivery: setupData.orderType === 'delivery' ? setupData.deliveryCompany : null,
          items: sanitizedCartItems,
          subtotal: totalAmount,
          total: totalAmount,
          descuento: 0,
          propina: 0,
          estado: 'pendiente_cocina', // Initial state strictly enforced
          estadoPago: 'pendiente',
          estadoEntrega: 'pendiente',
          ruta: sanitizedCartItems.some(it => it.requiereCocina !== false) ? 'cocina' : 'express',
          rondaActual: 1,
          comensales: isTableOrder ? diners : [],
          cobros: [],
          montoCobradoAcumulado: 0,
          saldoPendiente: totalAmount,
          timeline: []
        };

        await createOrder(newOrderPayload);

        sounds.playNotification();
        haptics.success();
        confetti({
          particleCount: 70,
          spread: 70,
          origin: { y: 0.8 }
        });

        setSuccessToast(
          setupData.orderTargetType === 'mesa'
            ? `¡Comanda enviada a Cocina para Mesa #${setupData.selectedTable?.numero} (Ronda 1)!`
            : `¡Pedido enviado a Cocina para ${setupData.selectedClient?.nombre}!`
        );
      }

      // Reset cart and step
      setCart([]);
      setSetupData(null);
      setShowConfirmModal(false);
      setCurrentStep(1); // Return smoothly to Step 1

      // Auto-clear success toast after 5s
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      alert('Error al enviar el pedido a cocina: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Mesero confirma entrega (listo -> entregado)
  const handleConfirmDelivery = async (order: Order) => {
    sounds.playNotification();
    sounds.stopRepeatingAlarm('ord-ready-' + order.id);
    haptics.success();
    try {
      await cambiarEstadoPedido(
        order.id, 
        'entregado', 
        currentEmployee?.nombre || 'Mesero',
        { timeline: order.timeline || [] }
      );
      sounds.playKeypadClick();
      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.7 }
      });
      setSuccessToast(`¡Entrega confirmada para ${order.tipo === 'local' ? `Mesa #${order.mesaNumero}` : order.clienteNombre}!`);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      console.error('Error al confirmar entrega:', err);
      alert('No se pudo confirmar la entrega: ' + err.message);
    }
  };

  // Mis Pedidos: Filtrar comandas del mesero en el restaurante actual
  const myOrders = useMemo(() => {
    return orders
      .filter(o => o.restaurantId === currentRestaurant?.id && 
                   (o.meseroId === currentEmployee?.id || 
                    o.meseroNombre === currentEmployee?.nombre ||
                    currentEmployee?.rol === 'admin' ||
                    !o.meseroId))
      .sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());
  }, [orders, currentRestaurant, currentEmployee]);

  const readyOrdersCount = useMemo(() => {
    return myOrders.filter(o => o.estado === 'listo').length;
  }, [myOrders]);

  const filteredMyOrders = useMemo(() => {
    if (orderFilterStatus === 'listos') {
      return myOrders.filter(o => o.estado === 'listo');
    }
    if (orderFilterStatus === 'cocina') {
      return myOrders.filter(o => ['pendiente_cocina', 'aceptado', 'en_preparacion'].includes(o.estado));
    }
    if (orderFilterStatus === 'entregados') {
      return myOrders.filter(o => ['entregado', 'cobrado'].includes(o.estado));
    }
    return myOrders;
  }, [myOrders, orderFilterStatus]);

  // Helper para estilos y badges de estados de "Mis Pedidos" según especificación:
  // - Naranja: en cocina (pendiente_cocina)
  // - Azul: preparando (aceptado, en_preparacion)
  // - Verde: listo - ve a recoger (listo)
  // - Gris: entregado (entregado, cobrado)
  const getStatusBadge = (order: Order) => {
    switch (order.estado) {
      case 'pendiente_cocina':
        return {
          label: 'En cocina (Pendiente)',
          color: 'bg-orange-500 text-white border-orange-600',
          cardBorder: 'border-orange-300 ring-2 ring-orange-500/10',
          textColor: 'text-orange-600'
        };
      case 'aceptado':
        return {
          label: 'Aceptado por Cocina',
          color: 'bg-blue-500 text-white border-blue-600',
          cardBorder: 'border-blue-300 ring-2 ring-blue-500/10',
          textColor: 'text-blue-600'
        };
      case 'en_preparacion':
        return {
          label: 'Preparando (A Fuego)',
          color: 'bg-blue-600 text-white border-blue-700',
          cardBorder: 'border-blue-400 ring-2 ring-blue-500/15',
          textColor: 'text-blue-600'
        };
      case 'listo':
        return {
          label: '¡Listo! Ve a recoger',
          color: 'bg-emerald-600 text-white border-emerald-700 animate-pulse',
          cardBorder: 'border-emerald-500 ring-4 ring-emerald-500/20 shadow-lg shadow-emerald-500/10',
          textColor: 'text-emerald-700'
        };
      case 'entregado':
        return {
          label: 'Entregado a la mesa',
          color: 'bg-neutral-600 text-white border-neutral-700',
          cardBorder: 'border-neutral-200',
          textColor: 'text-neutral-600'
        };
      case 'cobrado':
        return {
          label: 'Cobrado y finalizado',
          color: 'bg-neutral-500 text-white border-neutral-600',
          cardBorder: 'border-neutral-200 opacity-80',
          textColor: 'text-neutral-500'
        };
      case 'rechazado':
        return {
          label: `Rechazado: ${order.motivoRechazo || 'Por cocina'}`,
          color: 'bg-red-600 text-white border-red-700',
          cardBorder: 'border-red-400 ring-2 ring-red-500/20',
          textColor: 'text-red-600'
        };
      default:
        return {
          label: order.estado,
          color: 'bg-neutral-600 text-white border-neutral-700',
          cardBorder: 'border-neutral-200',
          textColor: 'text-neutral-600'
        };
    }
  };

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden bg-neutral-100">
      
      {/* Barra de navegación superior del Mesero (Oculta en Paso 2 para dar 100% de espacio a la toma de pedidos) */}
      {(currentStep === 1 || activeMainTab === 'mis_pedidos') && (
        <div className="bg-white border-b border-neutral-200 px-3 sm:px-6 py-1.5 sm:py-2 flex items-center justify-between shadow-xs z-30 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                sounds.playKeypadClick();
                setActiveMainTab('pos');
              }}
              className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-2xl text-xs sm:text-sm font-black transition flex items-center gap-2 ${
                activeMainTab === 'pos'
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Tomar Nuevo Pedido</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playKeypadClick();
                setActiveMainTab('mis_pedidos');
              }}
              className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-2xl text-xs sm:text-sm font-black transition flex items-center gap-2 relative ${
                activeMainTab === 'mis_pedidos'
                  ? 'bg-neutral-900 text-white shadow-md'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>Mis Pedidos</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                activeMainTab === 'mis_pedidos' ? 'bg-neutral-700 text-white' : 'bg-neutral-200 text-neutral-800'
              }`}>
                {myOrders.length}
              </span>
              {readyOrdersCount > 0 && (
                <span className="w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white absolute -top-1 -right-1 animate-ping"></span>
              )}
            </button>
          </div>

          {readyOrdersCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-800 text-[11px] sm:text-xs font-black animate-pulse">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{readyOrdersCount} listas</span>
            </div>
          )}
        </div>
      )}

      {/* Toast de Éxito */}
      {successToast && (
        <div className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between text-xs sm:text-sm font-bold shadow-md z-40 animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2 max-w-4xl mx-auto w-full">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button 
            onClick={() => setSuccessToast(null)}
            className="text-white/80 hover:text-white p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* VISTA 1: MIS PEDIDOS (COLORES EXACTOS Y BOTÓN RECOGER)   */}
      {/* ======================================================== */}
      {activeMainTab === 'mis_pedidos' ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="max-w-6xl mx-auto space-y-4">
            
            {/* Header & Filtros */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-neutral-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-neutral-900 flex items-center gap-2">
                  <span>Mis Pedidos en Salón y Delivery</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800">
                    Mesero: {currentEmployee?.nombre}
                  </span>
                </h3>
                <p className="text-xs text-neutral-500">
                  Estados: Naranja (En cocina) • Azul (Preparando) • Verde (Listo - ve a recoger) • Gris (Entregado)
                </p>
              </div>

              {/* Filtros rápidos */}
              <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-2xl border border-neutral-200 overflow-x-auto">
                {[
                  { id: 'all', label: 'Todos', count: myOrders.length },
                  { id: 'listos', label: '🟢 Listos para Recoger', count: readyOrdersCount },
                  { id: 'cocina', label: '🟠 En Cocina', count: myOrders.filter(o => ['pendiente_cocina', 'aceptado', 'en_preparacion'].includes(o.estado)).length },
                  { id: 'entregados', label: '⚪ Entregados', count: myOrders.filter(o => ['entregado', 'cobrado'].includes(o.estado)).length },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setOrderFilterStatus(tab.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                      orderFilterStatus === tab.id
                        ? 'bg-white text-neutral-900 shadow-xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="text-[10px] font-mono opacity-70">({tab.count})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Listado de Pedidos */}
            {filteredMyOrders.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center text-neutral-400 border border-neutral-200">
                <Utensils className="w-12 h-12 mx-auto mb-2 text-neutral-300 stroke-1" />
                <p className="font-bold text-neutral-600 text-sm">No tienes pedidos en esta categoría</p>
                <p className="text-xs text-neutral-400 mt-1">Crea una nueva comanda presionando "Tomar Nuevo Pedido".</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMyOrders.map((order, idx) => {
                  const statusInfo = getStatusBadge(order);
                  const isReady = order.estado === 'listo';
                  const isRejected = order.estado === 'rechazado';
                  const isDelivered = ['entregado', 'cobrado'].includes(order.estado);

                  return (
                    <div
                      key={`${order.id}-${idx}`}
                      className={`bg-white rounded-3xl border p-4 flex flex-col justify-between shadow-xs transition-all ${statusInfo.cardBorder}`}
                    >
                      <div className="space-y-3">
                        
                        {/* Header de la tarjeta */}
                        <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                          <div className="flex items-center gap-2">
                            {order.tipo === 'local' ? (
                              <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white font-black text-sm flex items-center justify-center shadow-xs">
                                M{order.mesaNumero}
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-xs">
                                <Bike className="w-5 h-5" />
                              </div>
                            )}
                            <div>
                              <div className="font-black text-neutral-900 text-sm">
                                {order.tipo === 'local' ? `Mesa #${order.mesaNumero}` : `Delivery: ${order.empresaDelivery || 'General'}`}
                              </div>
                              <div className="text-[11px] text-neutral-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>{new Date(order.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                <span>• Total: ${order.total.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>

                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border shadow-xs ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </div>

                        {/* Alerta si está Listo para Recoger */}
                        {isReady && (
                          <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center justify-between text-xs font-black text-emerald-800 animate-pulse">
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                              ¡Plato terminado! Ve a cocina a retirarlo
                            </span>
                          </div>
                        )}

                        {/* Alerta de Rechazo */}
                        {isRejected && (
                          <div className="p-3 bg-red-50 border border-red-300 rounded-2xl text-xs font-bold text-red-800 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                              <span>Comanda rechazada por cocina</span>
                            </div>
                            <p className="text-[11px] text-red-700 font-medium italic">
                              Motivo: {order.motivoRechazo || 'Insumo no disponible'}
                            </p>
                          </div>
                        )}

                        {/* Lista de Platos */}
                        <div className="space-y-1 max-h-36 overflow-y-auto text-xs divide-y divide-neutral-100">
                          {(order.items || []).map((it, idx) => (
                            <div key={idx} className="pt-1.5 first:pt-0 flex items-center justify-between text-neutral-700">
                              <span className="font-semibold">
                                <span className="text-orange-600 font-black">{it.cantidad}x</span> {it.nombre}
                              </span>
                              {it.notas && (
                                <span className="text-[10px] text-amber-700 italic">"{it.notas}"</span>
                              )}
                            </div>
                          ))}
                        </div>

                      </div>

                      {/* Footer & Botón Confirmar Entrega */}
                      <div className="pt-3 border-t border-neutral-100 mt-3 space-y-2">
                        {isReady ? (
                          <button
                            type="button"
                            onClick={() => handleConfirmDelivery(order)}
                            className="w-full min-h-[44px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm tracking-wide transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 active:scale-98"
                          >
                            <PackageCheck className="w-5 h-5" />
                            <span>CONFIRMAR ENTREGA (A LA MESA)</span>
                          </button>
                        ) : isDelivered ? (
                          <div className="min-h-[38px] rounded-xl bg-neutral-100 text-neutral-600 font-bold text-xs flex items-center justify-center gap-1.5">
                            <CheckCheck className="w-4 h-4 text-emerald-600" />
                            <span>Entregado a la mesa</span>
                          </div>
                        ) : (
                          <div className="min-h-[38px] rounded-xl bg-neutral-50 text-neutral-400 font-medium text-xs flex items-center justify-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>En proceso de cocina...</span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            haptics.tap();
                            setTicketOrderToPrint(order);
                          }}
                          className="w-full min-h-[36px] rounded-xl bg-neutral-100 hover:bg-orange-50 hover:text-orange-700 text-neutral-700 font-bold text-xs flex items-center justify-center gap-1.5 border border-neutral-200 transition active:scale-98"
                        >
                          <Printer className="w-3.5 h-3.5 text-orange-600" />
                          <span>Pre-cuenta / Ticket / WhatsApp</span>
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </div>
      ) : (
        /* ======================================================== */
        /* VISTA 2: TOMAR NUEVO PEDIDO (PASO 1 o PASO 2)            */
        /* ======================================================== */
        currentStep === 1 || !setupData ? (
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <WaiterOrderSetup
              tables={tables}
              orders={orders}
              clients={clients}
              restaurantId={currentRestaurant?.id || ''}
              initialData={setupData}
              onContinue={handleOrderSetupContinue}
            />
          </div>
        ) : (
          /* PASO 2: MENÚ POS Y CARRITO */
          <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden bg-neutral-100">
            {/* ENCABEZADO FIJO */}
            <header className="bg-neutral-900 text-white px-3 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between shadow-md shrink-0 border-b border-neutral-800 z-30">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <button
                  type="button"
                  onClick={handleChangeTarget}
                  className="p-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition flex items-center gap-1.5 text-xs font-bold shrink-0 border border-neutral-700 cursor-pointer"
                  title="Cambiar mesa o cliente"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Cambiar</span>
                </button>

                <div className="flex items-center gap-2 sm:gap-2.5 truncate">
                  {setupData.orderTargetType === 'mesa' ? (
                    <>
                      <div className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center font-black text-xs sm:text-sm shrink-0">
                        M{setupData.selectedTable?.numero}
                      </div>
                      <div className="truncate">
                        <div className="text-xs sm:text-base font-black tracking-tight leading-tight flex items-center gap-1.5 sm:gap-2">
                          <span>Mesa {setupData.selectedTable?.numero}</span>
                          <span className="text-[9px] sm:text-[10px] uppercase font-black px-1.5 sm:px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-300 border border-orange-500/30">
                            Ronda {currentRoundNumber}
                          </span>
                          {setupData.targetExistingOrder && (
                            <span className="hidden xs:inline text-[9px] sm:text-[10px] uppercase font-black px-1.5 sm:px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              + Acum: ${setupData.targetExistingOrder.total.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] sm:text-[11px] text-neutral-400 truncate">
                          Salón • Mesero: {currentEmployee?.nombre} • {diners.length} comensal(es)
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center font-black text-sm shrink-0">
                        {setupData.orderType === 'delivery' ? <Bike className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                      </div>
                      <div className="truncate">
                        <div className="text-xs sm:text-base font-black tracking-tight leading-tight flex items-center gap-2">
                          <span>{setupData.selectedClient?.nombre || 'Cliente Mostrador'}</span>
                        </div>
                        <div className="text-[10px] sm:text-[11px] text-neutral-400 truncate">
                          {setupData.orderType === 'delivery' ? `📍 ${setupData.deliveryAddress || 'Delivery'}` : 'Para Llevar / Mostrador'}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Botón de alternancia de estado y Enviar directo */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* Botón directo de Enviar en la Cabecera si hay platos en carrito */}
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playKeypadClick();
                      haptics.tap();
                      setShowConfirmModal(true);
                    }}
                    className="px-2.5 sm:px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-black text-[11px] sm:text-xs flex items-center gap-1.5 transition shadow-md shadow-orange-600/30 cursor-pointer active:scale-95"
                    title="Enviar pedido directamente"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>🚀 Enviar (${totalAmount.toFixed(2)})</span>
                  </button>
                )}

                {isMenuExpanded ? (
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playKeypadClick();
                      haptics.tap();
                      setIsMenuExpanded(false);
                    }}
                    className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-white font-extrabold text-[11px] sm:text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-orange-400" />
                    <span className="hidden xs:inline">Comanda</span>
                    <span>({cart.reduce((s, i) => s + i.cantidad, 0)})</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playKeypadClick();
                      haptics.tap();
                      setIsMenuExpanded(true);
                    }}
                    className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-[11px] sm:text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                  >
                    <Utensils className="w-3.5 h-3.5" />
                    <span>+ Menú</span>
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </header>

            {/* BARRA DE COMENSALES (Solo si es mesa de salón) */}
            {setupData.orderTargetType === 'mesa' && (
              <div className="bg-white border-b border-neutral-200 px-3 sm:px-6 py-1.5 sm:py-2 flex items-center justify-between gap-2 overflow-x-auto shrink-0 z-20 shadow-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 shrink-0 mr-1">
                    <Users className="w-4 h-4 text-orange-600" />
                    <span className="hidden sm:inline">Comensales:</span>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {diners.map((diner) => {
                      const isActive = activeDinerId === diner.id;
                      const dinerCartCount = cart.filter(i => i.comensalId === diner.id).reduce((sum, i) => sum + i.cantidad, 0);

                      return (
                        <div
                          key={diner.id}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition border shrink-0 ${
                            isActive
                              ? 'bg-orange-50 text-orange-800 border-orange-400 ring-2 ring-orange-500/20 shadow-xs'
                              : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              sounds.playKeypadClick();
                              setActiveDinerId(diner.id);
                            }}
                            className="flex items-center gap-1.5 text-left cursor-pointer"
                          >
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                              isActive ? 'bg-orange-600 text-white' : 'bg-neutral-200 text-neutral-700'
                            }`}>
                              C{diner.numero}
                            </span>
                            <span className="whitespace-nowrap">{diner.nombre}</span>
                            {dinerCartCount > 0 && (
                              <span className="px-1.5 py-0.2 bg-orange-600 text-white rounded-full text-[10px] font-mono">
                                {dinerCartCount}
                              </span>
                            )}
                          </button>

                          {editingDinerNameId === diner.id ? (
                            <div className="flex items-center gap-1 ml-1">
                              <input
                                type="text"
                                value={editingDinerNameVal}
                                onChange={(e) => setEditingDinerNameVal(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveDinerName(diner.id);
                                  if (e.key === 'Escape') setEditingDinerNameId(null);
                                }}
                                className="w-20 px-1 py-0.5 text-xs bg-white border border-orange-400 rounded outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveDinerName(diner.id)}
                                className="text-emerald-600 hover:text-emerald-700 text-xs font-bold cursor-pointer"
                              >
                                ✓
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingDinerNameId(diner.id);
                                setEditingDinerNameVal(diner.nombre);
                              }}
                              className="text-neutral-400 hover:text-neutral-600 ml-1 text-[10px] cursor-pointer"
                              title="Editar nombre"
                            >
                              ✎
                            </button>
                          )}
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={handleAddDiner}
                      className="px-2.5 py-1 rounded-xl text-xs font-bold bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-neutral-300 flex items-center gap-1 shrink-0 transition cursor-pointer"
                      title="Agregar otro comensal a la mesa"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Comensal</span>
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-neutral-500 font-medium shrink-0 hidden md:block">
                  Platos nuevos se asignan a: <strong className="text-orange-700">{diners.find(d => d.id === activeDinerId)?.nombre || 'Comensal 1'}</strong>
                </div>
              </div>
            )}

            {/* VISTA 1: CUANDO EL MENÚ ESTÁ DESPLEGADO */}
            {isMenuExpanded ? (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-2 sm:p-4 space-y-2 sm:space-y-3">
                {/* Categorías y Búsqueda: 1 sola línea compacta horizontal */}
                <div className="flex items-center gap-1.5 shrink-0 bg-white p-1 sm:p-1.5 rounded-2xl border border-neutral-200 shadow-2xs">
                  <div className="relative w-28 sm:w-60 shrink-0">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="text"
                      placeholder="Buscar plato..."
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      className="w-full h-8 pl-8 pr-2 rounded-xl bg-neutral-50 border border-neutral-200 text-xs font-medium outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  {/* Tabs Categorías con scroll táctil suave horizontal */}
                  <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0 py-0.5">
                    {categories.map((cat, idx) => (
                      <button
                        key={`${cat}-${idx}`}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                          selectedCategory === cat
                            ? 'bg-orange-600 text-white shadow-xs'
                            : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grid Platos con PORTE ESTRICTAMENTE CONSTANTE, Responsive y Scroll Fluido Táctil */}
                <div 
                  className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3 pr-0.5 pb-28 sm:pb-24"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  {filteredItems.length === 0 ? (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-neutral-400 text-center space-y-2">
                      <Utensils className="w-10 h-10 text-neutral-300 stroke-1" />
                      <p className="text-xs font-bold">No se encontraron platos en esta categoría</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory('Todos');
                          setMenuSearch('');
                        }}
                        className="text-xs font-bold text-orange-600 hover:underline cursor-pointer"
                      >
                        Mostrar todo el menú
                      </button>
                    </div>
                  ) : (
                    filteredItems.map((item, idx) => {
                      const countInCart = cart
                        .filter(i => i.menuItemId === item.id && (setupData?.orderTargetType !== 'mesa' || i.comensalId === activeDinerId))
                        .reduce((sum, i) => sum + i.cantidad, 0);

                      return (
                        <div
                          key={`${item.id}-${idx}`}
                          onClick={() => {
                            if (item.disponible && countInCart === 0) {
                              handleAddToCart(item);
                            }
                          }}
                          className={`group relative h-[155px] sm:h-[220px] w-full p-2 sm:p-3 bg-white rounded-2xl border transition-all flex flex-col justify-between text-left select-none shadow-2xs overflow-hidden ${
                            !item.disponible 
                              ? 'opacity-40 cursor-not-allowed border-neutral-200' 
                              : countInCart > 0
                                ? 'border-orange-500 shadow-md ring-1 ring-orange-500/30'
                                : 'border-neutral-200 hover:border-orange-400 hover:shadow-sm cursor-pointer'
                          }`}
                        >
                          {/* Insignia absoluta de cantidad */}
                          {countInCart > 0 && (
                            <span className="absolute top-1.5 right-1.5 bg-orange-600 text-white font-black text-[11px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full shadow-md z-10 flex items-center gap-1 animate-in zoom-in-50">
                              <Check className="w-3 h-3 stroke-[3]" />
                              <span>{countInCart}</span>
                            </span>
                          )}

                          {/* Imagen / Ícono: compacta en móvil, amplia en desktop */}
                          <div 
                            className="w-full h-16 sm:h-24 rounded-xl overflow-hidden shrink-0 relative mb-1 bg-neutral-100 cursor-pointer"
                            onClick={() => {
                              if (item.disponible) handleAddToCart(item);
                            }}
                          >
                            {(item.fotoUrl || item.imagenUrl) ? (
                              <img
                                src={item.fotoUrl || item.imagenUrl || ''}
                                alt={item.nombre}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover rounded-xl"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full bg-orange-50/70 rounded-xl flex items-center justify-center text-orange-400 border border-orange-100/60">
                                <Utensils className="w-5 h-5 sm:w-7 sm:h-7 opacity-70" />
                              </div>
                            )}
                          </div>

                          {/* Bloque de Texto */}
                          <div 
                            className="flex flex-col justify-start shrink-0 overflow-hidden cursor-pointer"
                            onClick={() => {
                              if (item.disponible) handleAddToCart(item);
                            }}
                          >
                            <h4 className="font-extrabold text-[11px] sm:text-sm text-neutral-900 line-clamp-1 sm:line-clamp-2 leading-tight overflow-hidden" title={item.nombre}>
                              {item.nombre}
                            </h4>
                            <p className="hidden sm:block text-[10px] text-neutral-400 font-semibold truncate mt-0.5">
                              {item.categoria}
                            </p>
                          </div>

                          {/* Pie de Tarjeta con precio y controles de +/- para corrección rápida */}
                          <div className="flex items-center justify-between border-t border-neutral-100 pt-1 shrink-0 mt-0.5 sm:mt-1">
                            <span className="font-mono font-black text-xs sm:text-sm text-neutral-900">
                              ${item.precio.toFixed(2)}
                            </span>
                            
                            {countInCart > 0 ? (
                              <div className="flex items-center gap-1 bg-orange-50 border border-orange-200 rounded-lg p-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSubtractItem(item);
                                  }}
                                  className="w-6 h-6 rounded-md bg-white text-orange-700 hover:bg-orange-200 active:bg-orange-300 flex items-center justify-center font-black text-xs shadow-2xs transition active:scale-90 cursor-pointer"
                                  title="Restar una unidad"
                                >
                                  <Minus className="w-3.5 h-3.5 stroke-[3]" />
                                </button>
                                <span className="font-mono font-black text-[11px] sm:text-xs px-1 text-orange-950 min-w-[14px] text-center">
                                  {countInCart}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddToCart(item);
                                  }}
                                  className="w-6 h-6 rounded-md bg-orange-600 text-white hover:bg-orange-500 active:bg-orange-700 flex items-center justify-center font-black text-xs shadow-2xs transition active:scale-90 cursor-pointer"
                                  title="Sumar una unidad"
                                >
                                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddToCart(item);
                                }}
                                disabled={!item.disponible}
                                className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl bg-orange-50 text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition flex items-center justify-center font-black text-xs shadow-2xs cursor-pointer active:scale-90"
                                title="Agregar al pedido"
                              >
                                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* BARRA INFERIOR FIJA: ENVIAR PEDIDO DIRECTO Y VER COMANDA */}
                <div className="shrink-0 pt-1 border-t border-neutral-200">
                  <div className="p-2 sm:p-3 rounded-2xl bg-neutral-900 text-white flex items-center justify-between gap-2 shadow-xl border border-neutral-800">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-orange-600 text-white font-black text-xs sm:text-sm flex items-center justify-center shadow-xs">
                        {cart.reduce((sum, i) => sum + i.cantidad, 0)}
                      </span>
                      <div className="leading-tight">
                        <div className="text-[11px] sm:text-sm font-black truncate max-w-[90px] sm:max-w-none">
                          {cart.length === 0 ? 'Sin platos' : `${cart.reduce((sum, i) => sum + i.cantidad, 0)} plato(s)`}
                        </div>
                        <div className="font-mono font-black text-xs sm:text-base text-orange-400">
                          ${totalAmount.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {/* Botón secundario: Ver comanda / Notas */}
                      <button
                        type="button"
                        onClick={() => {
                          sounds.playKeypadClick();
                          haptics.tap();
                          setIsMenuExpanded(false);
                        }}
                        className="h-10 sm:h-12 px-2.5 sm:px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-200 font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer shrink-0"
                        title="Ver detalle de comanda o agregar notas"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span className="hidden xs:inline">Detalle</span>
                      </button>

                      {/* Botón Principal: ENVIAR PEDIDO DIRECTO */}
                      <button
                        type="button"
                        disabled={cart.length === 0}
                        onClick={() => {
                          sounds.playKeypadClick();
                          haptics.tap();
                          setShowConfirmModal(true);
                        }}
                        className="h-10 sm:h-12 px-3 sm:px-6 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-orange-600/40 transition active:scale-98 cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Send className="w-4 h-4 stroke-[2.5]" />
                        <span>🚀 ENVIAR PEDIDO (${totalAmount.toFixed(2)})</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* VISTA 2: CUANDO EL MENÚ ESTÁ MINIMIZADO (Muestra la comanda lista para enviar a cocina y opción de volver a desplegar) */
              <div className="flex-1 min-h-0 flex flex-col p-2.5 sm:p-4 space-y-3 overflow-hidden">
                {/* BANNER DE MENÚ MINIMIZADO CON BOTÓN PARA VOLVER A DESPLEGAR */}
                <div className="p-3 bg-white rounded-2xl border border-neutral-200 shadow-xs flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center font-black">
                      <Utensils className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-black text-neutral-900">
                        Menú de Platos (Minimizado)
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {filteredItems.length} platos disponibles en catálogo
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      sounds.playKeypadClick();
                      haptics.tap();
                      setIsMenuExpanded(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-black text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer active:scale-98"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>🍽️ Desplegar Menú (+ Agregar más platos)</span>
                  </button>
                </div>

                {/* CONTENEDOR DE LA COMANDA Y REVISIÓN */}
                <div className="flex-1 min-h-0 bg-white rounded-2xl border border-neutral-200 p-3 sm:p-5 flex flex-col justify-between shadow-xs overflow-hidden">
                  <div className="space-y-3 overflow-hidden flex flex-col flex-1 min-h-0">
                    
                    {/* Encabezado de Comanda */}
                    <div className="flex items-center justify-between pb-2 border-b border-neutral-100 shrink-0">
                      <div>
                        <h3 className="font-black text-sm sm:text-base text-neutral-900 flex items-center gap-2">
                          <ShoppingBag className="w-4 h-4 text-orange-600" />
                          <span>Comanda Ronda {currentRoundNumber}</span>
                        </h3>
                        <p className="text-xs text-neutral-400">
                          {setupData.orderTargetType === 'mesa' ? `Mesa #${setupData.selectedTable?.numero}` : (setupData.selectedClient?.nombre || 'Cliente Mostrador')}
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold bg-orange-50 text-orange-700 px-2.5 py-1 rounded-xl border border-orange-200">
                        {cart.length} ítem(s) en pedido
                      </span>
                    </div>

                    {/* Consumo Acumulado de Rondas Anteriores (Acordeón) */}
                    {setupData.targetExistingOrder && (
                      <div className="bg-neutral-50 rounded-2xl border border-neutral-200 overflow-hidden text-xs shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowPrevRoundsAccordion(!showPrevRoundsAccordion)}
                          className="w-full px-3 py-2 flex items-center justify-between text-neutral-700 font-bold hover:bg-neutral-100 transition cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 text-left">
                            <Layers className="w-3.5 h-3.5 text-neutral-500" />
                            <span>Consumo anterior ({setupData.targetExistingOrder.items?.length || 0} platos)</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-neutral-900 font-bold">${setupData.targetExistingOrder.total.toFixed(2)}</span>
                            {showPrevRoundsAccordion ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </div>
                        </button>

                        {showPrevRoundsAccordion && (
                          <div className="p-3 bg-white border-t border-neutral-200 space-y-1.5 max-h-40 overflow-y-auto">
                            {setupData.targetExistingOrder.items?.map((it, idx) => (
                              <div key={`prev-it-${idx}`} className="flex items-center justify-between text-[11px] py-1 border-b border-neutral-100 last:border-0">
                                <div>
                                  <span className="font-semibold text-neutral-800">{it.cantidad}x {it.nombre}</span>
                                  <div className="text-[10px] text-neutral-400">
                                    Ronda {it.ronda || 1} • {it.comensalNombre || 'General'}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="font-mono font-bold text-neutral-700">${(it.precio * it.cantidad).toFixed(2)}</span>
                                  <div className={`text-[9px] font-black uppercase px-1 rounded ${
                                    it.estadoItem === 'entregado' ? 'text-neutral-500' : 'text-emerald-600'
                                  }`}>
                                    {it.estadoItem || 'enviado'}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Lista de Ítems en Carrito con scroll independiente */}
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                      {cart.length === 0 ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center text-neutral-400 text-xs space-y-3">
                          <ShoppingBag className="w-12 h-12 stroke-1 text-neutral-300" />
                          <div>
                            <p className="font-bold text-neutral-700 text-sm">No has agregado platos a la comanda</p>
                            <p className="text-neutral-400 text-xs">Despliega el menú para seleccionar platos y bebidas</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              sounds.playKeypadClick();
                              setIsMenuExpanded(true);
                            }}
                            className="text-xs font-black text-white bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-xl shadow-md cursor-pointer"
                          >
                            🍽️ Desplegar Menú de Platos →
                          </button>
                        </div>
                      ) : (
                        cart.map((it, idx) => (
                          <div key={`cart-${it.menuItemId}-${it.comensalId}-${idx}`} className="p-3 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-2 shadow-2xs">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-black text-xs sm:text-sm text-neutral-900 leading-tight">
                                  {it.nombre}
                                </div>
                                
                                {/* Selector de Comensal para este ítem */}
                                {setupData.orderTargetType === 'mesa' && (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <Tag className="w-3 h-3 text-orange-500" />
                                    <select
                                      value={it.comensalId || diners[0]?.id}
                                      onChange={(e) => handleAssignItemDiner(idx, e.target.value)}
                                      className="text-[10px] font-bold bg-white border border-neutral-300 rounded-lg px-2 py-0.5 text-neutral-700 outline-none cursor-pointer"
                                    >
                                      {diners.map(d => (
                                        <option key={d.id} value={d.id}>
                                          {d.nombre}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>

                              <span className="font-mono font-black text-xs sm:text-sm text-neutral-800 shrink-0">
                                ${(it.precio * it.cantidad).toFixed(2)}
                              </span>
                            </div>

                            {it.notas && (
                              <p className="text-[11px] text-orange-700 font-semibold italic bg-orange-50 px-2.5 py-1 rounded-xl border border-orange-200">
                                Nota: {it.notas}
                              </p>
                            )}

                            <div className="flex items-center justify-between pt-1 border-t border-neutral-200/60">
                              <button
                                type="button"
                                onClick={() => setItemNoteModal({ index: idx, note: it.notas || '' })}
                                className="text-[11px] font-bold text-neutral-500 hover:text-orange-600 transition cursor-pointer"
                              >
                                {it.notas ? 'Editar nota' : '+ Agregar nota de cocina'}
                              </button>

                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQty(idx, -1)}
                                  className="w-7 h-7 rounded-xl bg-white border border-neutral-300 flex items-center justify-center text-neutral-600 font-bold active:scale-95 cursor-pointer hover:bg-neutral-100"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="font-mono font-black text-xs sm:text-sm px-2">
                                  {it.cantidad}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQty(idx, 1)}
                                  className="w-7 h-7 rounded-xl bg-white border border-neutral-300 flex items-center justify-center text-neutral-600 font-bold active:scale-95 cursor-pointer hover:bg-neutral-100"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(idx)}
                                  className="w-7 h-7 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center ml-1 cursor-pointer transition"
                                  title="Eliminar plato"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Footer Comanda & Enviar a Cocina */}
                  <div className="pt-3 border-t border-neutral-100 space-y-3 mt-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-neutral-500 block">Total Ronda {currentRoundNumber}:</span>
                        {setupData.targetExistingOrder && (
                          <span className="text-[11px] text-neutral-400 font-medium">
                            Total acumulado final: ${(setupData.targetExistingOrder.total + totalAmount).toFixed(2)}
                          </span>
                        )}
                      </div>
                      <span className="font-mono font-black text-xl text-neutral-900">
                        ${totalAmount.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          sounds.playKeypadClick();
                          setIsMenuExpanded(true);
                        }}
                        className="w-full sm:w-1/3 h-12 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <Utensils className="w-4 h-4 text-orange-600" />
                        <span>+ Agregar más platos</span>
                      </button>

                      <button
                        type="button"
                        disabled={cart.length === 0}
                        onClick={() => setShowConfirmModal(true)}
                        className="w-full sm:w-2/3 h-12 sm:h-14 rounded-2xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-black text-xs sm:text-sm tracking-wide transition flex items-center justify-center gap-2 shadow-lg shadow-orange-600/30 disabled:opacity-40 cursor-pointer active:scale-98"
                      >
                        <Send className="w-4 h-4" />
                        <span>🚀 {setupData.orderTargetType === 'mesa' ? `ENVIAR A COCINA (RONDA ${currentRoundNumber})` : 'ENVIAR PEDIDO MOSTRADOR'} (${totalAmount.toFixed(2)})</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Modal: Notas de Ítem */}
      {itemNoteModal !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <h4 className="font-black text-sm text-neutral-900">
              Nota para el plato: {cart[itemNoteModal.index]?.nombre}
            </h4>
            <div className="grid grid-cols-2 gap-1.5">
              {['Sin cebolla', 'Término medio', 'Bien cocido', 'Poco picante', 'Sin sal'].map((sug, idx) => (
                <button
                  key={`${sug}-${idx}`}
                  type="button"
                  onClick={() => setItemNoteModal({ ...itemNoteModal, note: sug })}
                  className="p-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-[11px] font-semibold text-neutral-700 transition text-left"
                >
                  {sug}
                </button>
              ))}
            </div>
            <textarea
              value={itemNoteModal.note}
              onChange={(e) => setItemNoteModal({ ...itemNoteModal, note: e.target.value })}
              placeholder="Ej: Sin mayonesa, salsa aparte..."
              rows={3}
              className="w-full text-xs p-3 rounded-2xl bg-neutral-50 border border-neutral-300 outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setItemNoteModal(null)}
                className="h-10 rounded-xl bg-neutral-100 hover:bg-neutral-200 font-bold text-xs text-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSaveItemNote(itemNoteModal.note)}
                className="h-10 rounded-xl bg-orange-600 hover:bg-orange-700 font-bold text-xs text-white"
              >
                Guardar Nota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmación de Envío a Cocina */}
      {showConfirmModal && setupData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 pb-2 border-b border-neutral-100">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-base text-neutral-900">
                  Confirmar Envío · Ronda {currentRoundNumber}
                </h4>
                <p className="text-xs text-neutral-500">
                  {setupData.orderTargetType === 'mesa' ? `Mesa #${setupData.selectedTable?.numero}` : `Cliente: ${setupData.selectedClient?.nombre}`}
                </p>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1.5 divide-y divide-neutral-100 text-xs">
              {cart.map((it, idx) => (
                <div key={`modal-cart-${it.menuItemId}-${idx}`} className="pt-1.5 first:pt-0 flex items-center justify-between">
                  <div>
                    <span className="font-semibold">{it.cantidad}x {it.nombre}</span>
                    {it.comensalNombre && (
                      <span className="text-[10px] text-orange-600 block">({it.comensalNombre})</span>
                    )}
                  </div>
                  <span className="font-mono font-bold">${(it.precio * it.cantidad).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-neutral-100 flex items-center justify-between font-black text-base">
              <span>Total Ronda {currentRoundNumber}:</span>
              <span className="text-orange-600 font-mono">${totalAmount.toFixed(2)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="h-12 rounded-2xl bg-neutral-100 hover:bg-neutral-200 font-bold text-xs text-neutral-700"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSendToKitchen}
                className="h-12 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-orange-600/30 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'Enviando...' : `Confirmar y Enviar Ronda ${currentRoundNumber}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ticket Pre-cuenta / WhatsApp / PDF para el Mozo */}
      {ticketOrderToPrint && (() => {
        const matchingClient = clients?.find(c => 
          (ticketOrderToPrint.clienteId && c.id === ticketOrderToPrint.clienteId) ||
          (ticketOrderToPrint.clienteNombre && c.nombre.toLowerCase().trim() === ticketOrderToPrint.clienteNombre.toLowerCase().trim())
        );
        const resolvedPhone = ticketOrderToPrint.clienteTelefono || matchingClient?.telefono;

        return (
          <ThermalReceiptModal
            order={ticketOrderToPrint}
            restaurantName={currentRestaurant?.nombre || 'Restaurante'}
            restaurantAddress={currentRestaurant?.direccion}
            restaurantPhone={currentRestaurant?.telefono}
            clientPhone={resolvedPhone}
            mode="cuenta"
            onClose={() => setTicketOrderToPrint(null)}
          />
        );
      })()}

    </div>
  );
};
