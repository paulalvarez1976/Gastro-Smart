import { UNIQUE_BUSINESS_ID } from '../config/business';
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
import { FullScreenPOSMenu } from './FullScreenPOSMenu';

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

  // Add Item to Cart with optional route override (Cocina vs Xpress)
  const handleAddToCart = (item: MenuItem, routeOverride?: 'cocina' | 'express') => {
    if (!item.disponible) return;
    sounds.playKeypadClick();
    haptics.tap();

    const activeDiner = diners.find(d => d.id === activeDinerId) || diners[0];
    const isTableOrder = setupData?.orderTargetType === 'mesa';
    const isKitchen = routeOverride !== undefined
      ? routeOverride === 'cocina'
      : (item.requiereCocina !== false);

    setCart(prev => {
      // If table order, match by menuItemId, active comensalId AND requiresKitchen setting
      const existingIdx = prev.findIndex(i => 
        i.menuItemId === item.id && 
        (!isTableOrder || i.comensalId === activeDiner?.id) &&
        (i.requiereCocina !== false) === isKitchen
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
        requiereCocina: isKitchen,
        fotoUrl: item.fotoUrl || item.imagenUrl || null,
        imagenUrl: item.imagenUrl || item.fotoUrl || null,
        ronda: currentRoundNumber,
        comensalId: isTableOrder ? (activeDiner?.id || 'c1') : null,
        comensalNombre: isTableOrder ? (activeDiner?.nombre || 'Comensal 1') : null,
        comensalNumero: isTableOrder ? (activeDiner?.numero || 1) : null,
        estadoItem: isKitchen ? 'pendiente' : 'listo',
        estado: isKitchen ? 'pendiente_cocina' : 'listo'
      };

      return [...prev, newItem];
    });
  };

  // Alternar entre Preparación en Cocina y Preparación Xpress para un ítem en el carrito
  const handleToggleItemRoute = (index: number) => {
    sounds.playKeypadClick();
    haptics.tap();
    setCart(prev => {
      if (!prev[index]) return prev;
      const updated = [...prev];
      const newKitchenState = !(updated[index].requiereCocina !== false);
      updated[index] = {
        ...updated[index],
        requiereCocina: newKitchenState,
        estadoItem: newKitchenState ? 'pendiente' : 'listo',
        estado: newKitchenState ? 'pendiente_cocina' : 'listo'
      };
      return updated;
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
          businessId: currentRestaurant.businessId || UNIQUE_BUSINESS_ID,
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
              restaurant={currentRestaurant}
              initialData={setupData}
              onContinue={handleOrderSetupContinue}
            />
          </div>
        ) : (
          /* PASO 2: MENÚ EN PANTALLA COMPLETA Y TOMA DE PEDIDO */
          <FullScreenPOSMenu
            menuItems={menuItems}
            setupData={setupData}
            diners={diners}
            activeDinerId={activeDinerId}
            setActiveDinerId={setActiveDinerId}
            onAddDiner={handleAddDiner}
            onSaveDinerName={handleSaveDinerName}
            cart={cart}
            onAddToCart={handleAddToCart}
            onSubtractItem={handleSubtractItem}
            onUpdateQty={handleUpdateQty}
            onRemoveItem={handleRemoveItem}
            onToggleItemRoute={handleToggleItemRoute}
            onAssignItemDiner={handleAssignItemDiner}
            onOpenNoteModal={(index, currentNote) => setItemNoteModal({ index, note: currentNote })}
            totalAmount={totalAmount}
            currentRoundNumber={currentRoundNumber}
            currentEmployeeName={currentEmployee?.nombre}
            onChangeTarget={handleChangeTarget}
            onRequestSendToKitchen={() => setShowConfirmModal(true)}
          />
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
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold">{it.cantidad}x {it.nombre}</span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-black uppercase ${
                          it.requiereCocina !== false ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {it.requiereCocina !== false ? 'Cocina' : 'Xpress'}
                        </span>
                      </div>
                      {it.comensalNombre && (
                        <span className="text-[10px] text-orange-600 block">({it.comensalNombre})</span>
                      )}
                    </div>
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
            restaurantLogo={currentRestaurant?.logoUrl || undefined}
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
