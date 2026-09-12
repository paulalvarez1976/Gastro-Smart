import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { MenuItem, Table, OrderItem, OrderType, DeliveryCompany, Order, Client } from '../types';
import { createOrder, appendItemsToExistingOrder } from '../services/dataService';
import { sounds } from '../utils/sound';
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
  Sparkles,
  Search
} from 'lucide-react';
import confetti from 'canvas-confetti';

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

  // Current Step:
  // 1 = NUEVO PEDIDO (PASO 1: ELEGIR TIPO - MESA o CLIENTE)
  // 2 = TOMAR EL PEDIDO (PASO 2: MENÚ POS + ENCABEZADO FIJO + CARRITO)
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // Setup data from Step 1
  const [setupData, setSetupData] = useState<OrderSetupData | null>(null);

  // POS Menu State
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [menuSearch, setMenuSearch] = useState<string>('');

  // Cart
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [itemNoteModal, setItemNoteModal] = useState<{ index: number; note: string } | null>(null);

  // Send Confirmation Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success feedback message
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Categories list
  const categories = useMemo(() => {
    const cats = Array.from(new Set(menuItems.map(m => m.categoria)));
    return ['Todos', ...cats];
  }, [menuItems]);

  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      const matchCat = selectedCategory === 'Todos' || item.categoria === selectedCategory;
      const matchRest = item.restaurantId === currentRestaurant?.id || item.restaurantId === 'all';
      const matchSearch = !menuSearch.trim() || 
        item.nombre.toLowerCase().includes(menuSearch.toLowerCase()) ||
        item.descripcion.toLowerCase().includes(menuSearch.toLowerCase());
      return matchCat && matchRest && matchSearch;
    });
  }, [menuItems, selectedCategory, currentRestaurant, menuSearch]);

  // Cart calculations
  const totalAmount = useMemo(() => {
    return cart.reduce((sum, i) => sum + (i.precio * i.cantidad), 0);
  }, [cart]);

  // Handle continuing from Step 1 to Step 2
  const handleOrderSetupContinue = (data: OrderSetupData) => {
    setSetupData(data);
    setCurrentStep(2);
  };

  // Add Item to Cart
  const handleAddToCart = (item: MenuItem) => {
    if (!item.disponible) return;
    sounds.playKeypadClick();

    setCart(prev => {
      const existing = prev.find(i => i.menuItemId === item.id);
      if (existing) {
        return prev.map(i => i.menuItemId === item.id ? { ...i, cantidad: i.cantidad + 1 } : i);
      }
      return [...prev, {
        menuItemId: item.id,
        nombre: item.nombre,
        precio: item.precio,
        cantidad: 1,
        notas: null,
        fotoUrl: item.fotoUrl || item.imagenUrl || null,
        imagenUrl: item.imagenUrl || item.fotoUrl || null,
      }];
    });
  };

  const handleUpdateQty = (index: number, delta: number) => {
    sounds.playKeypadClick();
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

  const handleSaveItemNote = () => {
    if (itemNoteModal !== null) {
      setCart(prev => {
        const updated = [...prev];
        updated[itemNoteModal.index].notas = itemNoteModal.note;
        return updated;
      });
      setItemNoteModal(null);
    }
  };

  // Add "lo de siempre" shortcut
  const handleAddLoDeSiempre = () => {
    if (!setupData?.recommendedItemName) return;
    const match = menuItems.find(m => m.nombre.toLowerCase() === setupData.recommendedItemName?.toLowerCase());
    if (match) {
      handleAddToCart(match);
    }
  };

  // Return to Step 1 (Change Table / Client)
  const handleChangeTarget = () => {
    sounds.playKeypadClick();
    if (cart.length > 0) {
      const confirmChange = window.confirm(
        '¿Deseas cambiar la mesa o cliente? Los platos agregados al carrito se mantendrán.'
      );
      if (!confirmChange) return;
    }
    setCurrentStep(1);
  };

  // Submit order to Kitchen
  const handleSendToKitchen = async () => {
    if (cart.length === 0 || !currentRestaurant || !currentEmployee || !setupData) return;

    setIsSubmitting(true);
    try {
      if (setupData.targetExistingOrder) {
        // Adding dishes to existing open order!
        await appendItemsToExistingOrder(
          setupData.targetExistingOrder.id,
          cart,
          currentEmployee.nombre,
          setupData.targetExistingOrder.timeline || []
        );
        setSuccessToast(`¡Nuevos platos agregados exitosamente a Mesa #${setupData.selectedTable?.numero}!`);
      } else {
        // Creating new order
        const isLocal = setupData.orderTargetType === 'mesa';
        const client = setupData.selectedClient;

        await createOrder({
          restaurantId: currentRestaurant.id,
          meseroId: currentEmployee.id,
          meseroNombre: currentEmployee.nombre,
          
          // Mesa ID si aplica: null cuando no aplique
          mesaId: isLocal ? (setupData.selectedTable?.id || null) : null,
          mesaNumero: isLocal ? (setupData.selectedTable?.numero || null) : null,
          
          // Cliente ID si aplica: null cuando no aplique
          clienteId: client?.id || null,
          clienteNombre: client?.nombre || (isLocal ? `Mesa #${setupData.selectedTable?.numero}` : 'Cliente Mostrador'),
          clienteTelefono: client?.telefono || null,
          clienteDireccion: (setupData.orderType === 'delivery' ? setupData.deliveryAddress : client?.direccion) || null,
          
          tipo: setupData.orderType,
          empresaDelivery: setupData.orderType === 'delivery' ? (setupData.deliveryCompany || 'Propio') : null,
          items: cart,
          total: totalAmount,
          subtotal: totalAmount,
          descuento: null,
          propina: null,
          motivoRechazo: null,
          metodoPago: null,
          estado: 'pendiente_cocina',
          creadoEn: new Date().toISOString(),
        });

        const targetDesc = isLocal 
          ? `Mesa #${setupData.selectedTable?.numero}` 
          : `Cliente ${client?.nombre || ''} (${setupData.orderType === 'delivery' ? 'Delivery' : 'Para Llevar'})`;
        
        setSuccessToast(`¡Comanda enviada a cocina con éxito para ${targetDesc}!`);
      }

      // Success effects
      sounds.playCashRegister();
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.8 }
      });

      // Reset state for next order
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

  // ==========================================================
  // PASO 1: IDENTIFICACIÓN DEL PEDIDO (MESA vs CLIENTE)
  // ==========================================================
  if (currentStep === 1 || !setupData) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {successToast && (
          <div className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between text-xs sm:text-sm font-bold shadow-md z-20 animate-in slide-in-from-top duration-200">
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

        <WaiterOrderSetup
          tables={tables}
          orders={orders}
          clients={clients}
          restaurantId={currentRestaurant?.id || ''}
          initialData={setupData}
          onContinue={handleOrderSetupContinue}
        />
      </div>
    );
  }

  // ==========================================================
  // == PASO 2: TOMAR EL PEDIDO ==
  // Una vez elegida mesa o cliente, pasa al menú estilo POS con
  // ENCABEZADO FIJO que indica a quién va el pedido.
  // ==========================================================
  const isLocal = setupData.orderTargetType === 'mesa';
  const tableNum = setupData.selectedTable?.numero;
  const clientName = setupData.selectedClient?.nombre;

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-65px)] overflow-hidden bg-neutral-100">
      
      {/* ======================================================== */}
      {/* ENCABEZADO FIJO: INDICA A QUIÉN VA EL PEDIDO             */}
      {/* ======================================================== */}
      <header className="bg-neutral-900 text-white px-4 sm:px-6 py-2.5 flex items-center justify-between shadow-md shrink-0 border-b border-neutral-800 z-30">
        
        {/* Identificación del pedido */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleChangeTarget}
            className="p-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition flex items-center gap-1.5 text-xs font-bold shrink-0 border border-neutral-700"
            title="Cambiar mesa o cliente"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Cambiar</span>
          </button>

          <div className="flex items-center gap-2.5 truncate">
            {isLocal ? (
              <>
                <div className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center font-black text-sm shrink-0">
                  M{tableNum}
                </div>
                <div className="truncate">
                  <div className="text-sm sm:text-base font-black tracking-tight leading-tight flex items-center gap-2">
                    <span>Mesa {tableNum}</span>
                    {setupData.targetExistingOrder && (
                      <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        + Sumando a comanda abierta (${setupData.targetExistingOrder.total.toFixed(2)})
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate">
                    {clientName ? `Cliente: ${clientName}` : 'Salón / Mesa asignada'} • Mesero: {currentEmployee?.nombre}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center font-black text-sm shrink-0">
                  {setupData.orderType === 'delivery' ? <Bike className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                </div>
                <div className="truncate">
                  <div className="text-sm sm:text-base font-black tracking-tight leading-tight flex items-center gap-2">
                    <span>Cliente: {clientName} ({setupData.orderType === 'delivery' ? 'delivery' : 'para llevar'})</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate flex items-center gap-2">
                    {setupData.orderType === 'delivery' && setupData.deliveryAddress && (
                      <span className="truncate">📍 {setupData.deliveryAddress}</span>
                    )}
                    {setupData.orderType === 'delivery' && (
                      <span>• Reparto: {setupData.deliveryCompany}</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Status de carrito en móvil y botón cambio */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <span className="text-[11px] text-neutral-400 uppercase tracking-wider block">Total Actual</span>
            <span className="font-mono font-black text-sm sm:text-base text-orange-400">
              ${totalAmount.toFixed(2)}
            </span>
          </div>
        </div>

      </header>

      {/* SUGERENCIA "LO DE SIEMPRE" SI CLIENTE REGISTRADO */}
      {setupData.recommendedItemName && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs text-amber-900 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Recomendación para {clientName || 'el cliente'}:</strong> "Lo de siempre" es <strong>{setupData.recommendedItemName}</strong>.
            </span>
          </div>
          <button
            type="button"
            onClick={handleAddLoDeSiempre}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] transition shadow-xs shrink-0"
          >
            + Agregar al carrito
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* CUERPO DEL POS: CATEGORÍAS + PLATOS + CARRITO            */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* LEFT COLUMN: Categories bar (Tactile vertical POS style) */}
        <div className="w-full lg:w-48 bg-white border-r border-neutral-200 flex lg:flex-col overflow-x-auto lg:overflow-y-auto shrink-0 p-2 gap-1.5 shadow-xs">
          <div className="hidden lg:block px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
            Categorías
          </div>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => { sounds.playKeypadClick(); setSelectedCategory(cat); }}
              className={`min-h-[50px] lg:min-h-[54px] px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm text-left transition whitespace-nowrap lg:whitespace-normal flex items-center justify-between border ${
                selectedCategory === cat
                  ? 'bg-orange-500 text-white border-orange-500 shadow-sm shadow-orange-300'
                  : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border-neutral-200/80'
              }`}
            >
              <span>{cat}</span>
              {selectedCategory === cat && <span className="hidden lg:inline text-xs font-black">●</span>}
            </button>
          ))}
        </div>

        {/* CENTER COLUMN: Menu Items Grid */}
        <div className="flex-1 flex flex-col overflow-hidden bg-neutral-100">
          
          {/* Subheader: Category filter info & quick search */}
          <div className="bg-white/80 backdrop-blur-xs px-4 py-2.5 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Platos en {selectedCategory} ({filteredItems.length})
            </span>
            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filtrar platos..."
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                className="w-full h-8 pl-8 pr-3 rounded-lg border border-neutral-200 bg-white text-xs outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {/* Dish Grid: Grandes tarjetas táctiles con foto y precio */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 auto-rows-max">
            {filteredItems.map(item => (
              <div
                key={item.id}
                onClick={() => handleAddToCart(item)}
                className={`min-h-[160px] bg-white rounded-2xl border transition-all duration-150 p-3 flex flex-col justify-between cursor-pointer select-none relative overflow-hidden shadow-xs hover:shadow-md hover:border-orange-400 active:scale-98 ${
                  item.disponible 
                    ? 'border-neutral-200' 
                    : 'opacity-50 pointer-events-none border-dashed border-neutral-300'
                }`}
              >
                {/* Image container */}
                <div className="w-full h-24 rounded-xl overflow-hidden bg-neutral-100 mb-2 relative">
                  {(item.fotoUrl || item.imagenUrl) ? (
                    <img
                      src={item.fotoUrl || item.imagenUrl || ''}
                      alt={item.nombre}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-300">
                      <Utensils className="w-8 h-8" />
                    </div>
                  )}
                  {!item.disponible && (
                    <div className="absolute inset-0 bg-neutral-900/60 flex items-center justify-center text-white text-xs font-black uppercase tracking-wider">
                      Agotado
                    </div>
                  )}
                </div>

                {/* Title & Description */}
                <div>
                  <h4 className="font-bold text-neutral-900 text-xs sm:text-sm line-clamp-1 leading-snug">
                    {item.nombre}
                  </h4>
                  <p className="text-[11px] text-neutral-500 line-clamp-2 mt-0.5 leading-tight">
                    {item.descripcion}
                  </p>
                </div>

                {/* Price and Add button */}
                <div className="mt-2 pt-2 border-t border-neutral-100 flex items-center justify-between">
                  <span className="text-sm sm:text-base font-black text-orange-600">
                    ${item.precio.toFixed(2)}
                  </span>
                  <span className="w-8 h-8 rounded-lg bg-orange-50 hover:bg-orange-500 hover:text-white text-orange-600 font-black flex items-center justify-center text-sm border border-orange-200 transition">
                    +
                  </span>
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* RIGHT COLUMN: Permanent Visible Cart */}
        <div className="w-full lg:w-96 bg-white border-t lg:border-t-0 lg:border-l border-neutral-200 flex flex-col h-auto lg:h-full shrink-0 shadow-lg z-20">
          
          {/* Cart Header */}
          <div className="p-3.5 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-orange-500" />
              <span className="font-extrabold text-xs text-neutral-900 uppercase tracking-wider">
                Comanda de la Cuenta
              </span>
            </div>
            <span className="text-xs font-bold text-neutral-500">
              {cart.reduce((a, b) => a + b.cantidad, 0)} ítems
            </span>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[160px] max-h-[35vh] lg:max-h-none">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-400">
                <ShoppingBag className="w-10 h-10 mb-2 stroke-1 text-neutral-300" />
                <p className="text-xs font-semibold">El carrito está vacío</p>
                <p className="text-[11px] text-neutral-400 mt-0.5">Toca platos en el menú para agregarlos</p>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl border border-neutral-200 bg-white hover:border-orange-200 transition text-xs space-y-1 shadow-2xs"
                >
                  <div className="flex items-center justify-between font-bold text-neutral-800">
                    <span className="truncate pr-2">{item.nombre}</span>
                    <span className="shrink-0 font-extrabold text-neutral-900 font-mono">
                      ${(item.precio * item.cantidad).toFixed(2)}
                    </span>
                  </div>

                  {/* Optional note display */}
                  {item.notas && (
                    <div className="text-[10px] text-orange-700 bg-orange-50 px-2 py-0.5 rounded italic">
                      "{item.notas}"
                    </div>
                  )}

                  {/* Quantity and Controls */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => setItemNoteModal({ index: idx, note: item.notas || '' })}
                      className="text-[10px] text-neutral-500 hover:text-orange-600 underline font-medium"
                    >
                      {item.notas ? 'Editar nota' : '+ Agregar nota (sin cebolla, etc.)'}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleUpdateQty(idx, -1)}
                        className="w-7 h-7 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 flex items-center justify-center transition"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center font-bold text-xs">{item.cantidad}</span>
                      <button
                        onClick={() => handleUpdateQty(idx, 1)}
                        className="w-7 h-7 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-700 flex items-center justify-center transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemoveItem(idx)}
                        className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center ml-1 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Total & Send Button (Mínimo 56px de alto táctil) */}
          <div className="p-3.5 border-t border-neutral-200 bg-neutral-50 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-neutral-600">Total a Enviar:</span>
              <span className="text-xl font-black text-neutral-900 font-mono">
                ${totalAmount.toFixed(2)}
              </span>
            </div>

            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => { sounds.playKeypadClick(); setShowConfirmModal(true); }}
              className="w-full min-h-[56px] rounded-2xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-extrabold text-base shadow-lg shadow-orange-600/30 transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none active:scale-98"
            >
              <Send className="w-5 h-5" />
              <span>
                {setupData.targetExistingOrder ? 'Agregar a Comanda de Cocina' : 'Enviar a Cocina'}
              </span>
            </button>
          </div>

        </div>

      </div>

      {/* MODAL: Nota especial en plato */}
      {itemNoteModal !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <h3 className="font-extrabold text-sm text-neutral-900">
                Nota para cocina: {cart[itemNoteModal.index]?.nombre}
              </h3>
              <button 
                onClick={() => setItemNoteModal(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                ✕
              </button>
            </div>

            <textarea
              rows={3}
              placeholder="Ej: Sin cebolla, término medio, aderezo aparte..."
              value={itemNoteModal.note}
              onChange={(e) => setItemNoteModal({ ...itemNoteModal, note: e.target.value })}
              className="w-full p-3 rounded-xl border border-neutral-300 text-xs font-medium outline-none focus:ring-2 focus:ring-orange-500"
              autoFocus
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setItemNoteModal(null)}
                className="flex-1 h-10 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveItemNote}
                className="flex-1 h-10 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs"
              >
                Guardar Nota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN PREVIA AL ENVÍO */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-black">
                  ✓
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900">
                    Confirmar Envío a Cocina
                  </h3>
                  <span className="text-xs text-neutral-500">
                    Revisa el pedido antes de notificar al chef
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                ✕
              </button>
            </div>

            {/* Resumen Destino */}
            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs space-y-1">
              <div className="font-bold text-neutral-900">
                Destino: {isLocal ? `Mesa #${tableNum}` : `Cliente: ${clientName}`}
              </div>
              <div className="text-neutral-600">
                Tipo: <strong className="uppercase">{setupData.orderType}</strong>
                {setupData.orderType === 'delivery' && ` (${setupData.deliveryCompany})`}
              </div>
              {setupData.deliveryAddress && (
                <div className="text-neutral-600">
                  Dirección: {setupData.deliveryAddress}
                </div>
              )}
              {setupData.targetExistingOrder && (
                <div className="text-amber-700 font-bold">
                  * Se sumará a la cuenta existente (${setupData.targetExistingOrder.total.toFixed(2)})
                </div>
              )}
            </div>

            {/* Platos */}
            <div className="max-h-48 overflow-y-auto divide-y divide-neutral-100 text-xs">
              {cart.map((it, idx) => (
                <div key={idx} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-bold">{it.cantidad}x {it.nombre}</span>
                    {it.notas && <p className="text-[10px] text-orange-600 italic">"{it.notas}"</p>}
                  </div>
                  <span className="font-mono font-bold">${(it.precio * it.cantidad).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-base font-black">
              <span>Total Comanda:</span>
              <span className="text-orange-600 font-mono">${totalAmount.toFixed(2)}</span>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 h-12 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs"
              >
                Volver a Revisar
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSendToKitchen}
                className="flex-2 h-12 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-orange-600/20 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'Enviando comanda...' : 'Confirmar y Enviar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
