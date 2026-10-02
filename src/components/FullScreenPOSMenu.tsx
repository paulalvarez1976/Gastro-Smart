import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MenuItem, Table, OrderItem, Order, Client, OrderDiner } from '../types';
import { OrderSetupData } from './WaiterOrderSetup';
import { sounds } from '../utils/sound';
import { haptics } from '../utils/haptics';
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
  Clock, 
  X, 
  ArrowLeft, 
  Search, 
  Users, 
  ChevronDown, 
  ChevronUp, 
  Tag, 
  Flame, 
  Layers, 
  Maximize2, 
  Minimize2, 
  LayoutGrid, 
  Grid, 
  List, 
  ChefHat, 
  Zap, 
  FileText,
  SlidersHorizontal,
  Eye,
  Info
} from 'lucide-react';

interface FullScreenPOSMenuProps {
  menuItems: MenuItem[];
  setupData: OrderSetupData;
  diners: OrderDiner[];
  activeDinerId: string;
  setActiveDinerId: (id: string) => void;
  onAddDiner: () => void;
  onSaveDinerName: (dinerId: string, name: string) => void;
  cart: OrderItem[];
  onAddToCart: (item: MenuItem, routeOverride?: 'cocina' | 'express') => void;
  onSubtractItem: (item: MenuItem) => void;
  onUpdateQty: (index: number, delta: number) => void;
  onRemoveItem: (index: number) => void;
  onToggleItemRoute?: (index: number) => void;
  onAssignItemDiner: (index: number, dinerId: string) => void;
  onOpenNoteModal: (index: number, currentNote: string) => void;
  totalAmount: number;
  currentRoundNumber: number;
  currentEmployeeName?: string;
  onChangeTarget: () => void;
  onRequestSendToKitchen: () => void;
}

export const FullScreenPOSMenu: React.FC<FullScreenPOSMenuProps> = ({
  menuItems,
  setupData,
  diners,
  activeDinerId,
  setActiveDinerId,
  onAddDiner,
  onSaveDinerName,
  cart,
  onAddToCart,
  onSubtractItem,
  onUpdateQty,
  onRemoveItem,
  onToggleItemRoute,
  onAssignItemDiner,
  onOpenNoteModal,
  totalAmount,
  currentRoundNumber,
  currentEmployeeName = 'Mesero',
  onChangeTarget,
  onRequestSendToKitchen
}) => {
  // Visual Display Mode: 'large' (Fotos Grandes) | 'compact' (Cuadrícula Rápida) | 'list' (Lista TPV)
  const [viewMode, setViewMode] = useState<'large' | 'compact' | 'list'>('large');

  // Search & Filtering
  const [menuSearch, setMenuSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [routeFilter, setRouteFilter] = useState<'all' | 'cocina' | 'express'>('all');

  // Slide-over Comanda Drawer
  const [showCartDrawer, setShowCartDrawer] = useState<boolean>(false);
  const [showPrevRoundsAccordion, setShowPrevRoundsAccordion] = useState<boolean>(false);

  // Diner name editing
  const [editingDinerId, setEditingDinerId] = useState<string | null>(null);
  const [editingDinerName, setEditingDinerName] = useState<string>('');

  // Fullscreen Modal State (Expands to 100vw / 100vh on open with z-index, restored upon Aceptar)
  const [isFullScreenModal, setIsFullScreenModal] = useState<boolean>(true);

  // Vertical Scroll Reference & Position
  const menuScrollRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState<number>(0);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight > target.clientHeight) {
      const progress = (target.scrollTop / (target.scrollHeight - target.clientHeight)) * 100;
      setScrollProgress(progress);
    }
  };

  const scrollToTop = () => {
    sounds.playKeypadClick();
    menuScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    sounds.playKeypadClick();
    if (menuScrollRef.current) {
      menuScrollRef.current.scrollTo({ top: menuScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  // Toggle true hardware fullscreen + viewport overlay
  const handleToggleFullscreen = async () => {
    sounds.playKeypadClick();
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
        setIsFullScreenModal(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setIsFullScreenModal(!isFullScreenModal);
      }
    } catch {
      setIsFullScreenModal(prev => !prev);
    }
  };

  // Keyboard shortcut support for scrolling (PgUp, PgDn, Home, End)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['input', 'textarea', 'select'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) {
        return;
      }
      if (e.key === 'Home') {
        scrollToTop();
      } else if (e.key === 'End') {
        scrollToBottom();
      } else if (e.key === 'PageUp') {
        menuScrollRef.current?.scrollBy({ top: -400, behavior: 'smooth' });
      } else if (e.key === 'PageDown') {
        menuScrollRef.current?.scrollBy({ top: 400, behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Categories list & counts
  const categories = useMemo(() => {
    const cats = Array.from(new Set(menuItems.map(m => m.categoria).filter(Boolean)));
    return ['Todos', ...cats];
  }, [menuItems]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { Todos: menuItems.length };
    menuItems.forEach(item => {
      if (item.categoria) {
        counts[item.categoria] = (counts[item.categoria] || 0) + 1;
      }
    });
    return counts;
  }, [menuItems]);

  // Filtered Menu Items
  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      const matchCat = selectedCategory === 'Todos' || item.categoria === selectedCategory;
      const matchRoute = 
        routeFilter === 'all' || 
        (routeFilter === 'cocina' && item.requiereCocina !== false) ||
        (routeFilter === 'express' && item.requiereCocina === false);
      const matchSearch = !menuSearch.trim() || 
        item.nombre.toLowerCase().includes(menuSearch.toLowerCase()) ||
        (item.descripcion || '').toLowerCase().includes(menuSearch.toLowerCase()) ||
        (item.categoria || '').toLowerCase().includes(menuSearch.toLowerCase());
      return matchCat && matchRoute && matchSearch;
    });
  }, [menuItems, selectedCategory, routeFilter, menuSearch]);

  const totalCartItemsCount = useMemo(() => {
    return cart.reduce((sum, i) => sum + i.cantidad, 0);
  }, [cart]);

  const activeDiner = diners.find(d => d.id === activeDinerId) || diners[0];

  const handleSaveEditingDiner = (dinerId: string) => {
    if (editingDinerName.trim()) {
      onSaveDinerName(dinerId, editingDinerName.trim());
    }
    setEditingDinerId(null);
    setEditingDinerName('');
  };

  return (
    <div 
      id="pos-menu-fullscreen-modal"
      className={
        isFullScreenModal
          ? "fixed inset-0 z-[60] w-screen h-screen max-w-[100vw] max-h-[100vh] flex flex-col bg-neutral-900 text-neutral-100 select-none overflow-hidden animate-in fade-in duration-150"
          : "flex-1 min-h-0 w-full h-full flex flex-col bg-neutral-900 text-neutral-100 select-none overflow-hidden"
      }
    >
      
      {/* ========================================================================= */}
      {/* 1. BARRA SUPERIOR PRINCIPAL (ENCABEZADO FIJO DE MESA/CLIENTE + CONTROLES) */}
      {/* ========================================================================= */}
      <header className="bg-neutral-950 px-3 sm:px-5 py-2.5 flex items-center justify-between border-b border-neutral-800 shadow-md shrink-0 z-30">
        
        {/* Lado Izquierdo: Botón Volver/Cambiar + Datos del Pedido */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <button
            type="button"
            onClick={onChangeTarget}
            className="p-2 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 hover:text-white transition flex items-center gap-1.5 text-xs font-black border border-neutral-700 shadow-xs cursor-pointer active:scale-95"
            title="Volver / Cambiar mesa o cliente destino"
          >
            <ArrowLeft className="w-4 h-4 text-orange-400" />
            <span className="hidden sm:inline">Volver</span>
          </button>

          <div className="flex items-center gap-2.5 truncate">
            {setupData.orderTargetType === 'mesa' ? (
              <>
                <div className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center font-black text-sm shadow-md shrink-0 border border-orange-400/30">
                  M{setupData.selectedTable?.numero}
                </div>
                <div className="truncate">
                  <div className="text-sm sm:text-base font-black tracking-tight leading-tight flex items-center gap-2">
                    <span className="text-white">Mesa {setupData.selectedTable?.numero}</span>
                    <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-400 border border-orange-500/30">
                      Ronda {currentRoundNumber}
                    </span>
                    {setupData.targetExistingOrder && (
                      <span className="hidden md:inline-flex text-[10px] uppercase font-black px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        Acumulado: ${setupData.targetExistingOrder.total.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate flex items-center gap-1.5">
                    <span>Atiende: <strong className="text-neutral-200">{currentEmployeeName}</strong></span>
                    <span>•</span>
                    <span>{diners.length} comensales</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-md shrink-0">
                  {setupData.orderType === 'delivery' ? <Bike className="w-5 h-5" /> : <ShoppingBag className="w-5 h-5" />}
                </div>
                <div className="truncate">
                  <div className="text-sm sm:text-base font-black tracking-tight leading-tight text-white flex items-center gap-2">
                    <span>{setupData.selectedClient?.nombre || 'Cliente Mostrador'}</span>
                    <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      {setupData.orderType === 'delivery' ? 'Delivery' : 'Para Llevar'}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate">
                    {setupData.orderType === 'delivery' ? `📍 ${setupData.deliveryAddress || 'Dirección registrada'}` : 'Venta en barra / mostrador'}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Lado Derecho: Selector de Modo de Visualización, Pantalla Completa, Comanda & Botón Aceptar */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Selector de Modos de Vista del Menú */}
          <div className="hidden sm:flex items-center bg-neutral-900 border border-neutral-800 rounded-xl p-0.5">
            <button
              type="button"
              onClick={() => {
                sounds.playKeypadClick();
                setViewMode('large');
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'large'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Fotos Grandes y Detalle Amplio"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Fotos</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playKeypadClick();
                setViewMode('compact');
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'compact'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Cuadrícula Compacta"
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Compacto</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playKeypadClick();
                setViewMode('list');
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Lista Rápida TPV"
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
          </div>

          {/* Botón de Alternar Modo Pantalla Completa (100vw / 100vh vs Normal) */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className={`p-2 rounded-xl transition cursor-pointer flex items-center gap-1 text-xs font-bold border ${
              isFullScreenModal 
                ? 'bg-neutral-800 text-orange-400 border-orange-500/40 hover:bg-neutral-700' 
                : 'bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 border-neutral-700'
            }`}
            title={isFullScreenModal ? 'Restaurar a tamaño normal' : 'Expandir menú a Pantalla Completa'}
          >
            {isFullScreenModal ? <Minimize2 className="w-4 h-4 text-orange-400" /> : <Maximize2 className="w-4 h-4 text-orange-400" />}
            <span className="hidden lg:inline">{isFullScreenModal ? 'Restaurar' : 'Pantalla Completa'}</span>
          </button>

          {/* Botón Comanda Rápida Drawer */}
          <button
            type="button"
            onClick={() => {
              sounds.playKeypadClick();
              haptics.tap();
              setShowCartDrawer(true);
            }}
            className={`px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer border ${
              cart.length > 0 
                ? 'bg-neutral-800 text-orange-400 border-orange-500/40 hover:bg-neutral-700' 
                : 'bg-neutral-800/60 text-neutral-400 border-neutral-700'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-orange-400" />
            <span className="hidden xs:inline">Comanda</span>
            <span className="px-1.5 py-0.5 rounded-full bg-orange-600 text-white font-mono text-[10px]">
              {totalCartItemsCount}
            </span>
          </button>

          {/* Botón Aceptar Selección / Confirmar Platos */}
          <button
            type="button"
            onClick={() => {
              sounds.playKeypadClick();
              haptics.success();
              if (cart.length > 0) {
                onRequestSendToKitchen();
              } else {
                onChangeTarget();
              }
            }}
            className="px-3 sm:px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 cursor-pointer active:scale-95 transition"
            title="Aceptar platos y confirmar pedido"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Aceptar{totalCartItemsCount > 0 ? ` (${totalCartItemsCount})` : ''}</span>
          </button>

        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. BARRA DE COMENSALES (SOLO EN SERVICIO DE MESA)                          */}
      {/* ========================================================================= */}
      {setupData.orderTargetType === 'mesa' && (
        <div className="bg-neutral-900/95 border-b border-neutral-800/80 px-3 sm:px-5 py-2 flex items-center justify-between gap-3 overflow-x-auto shrink-0 z-20">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-black text-neutral-400 shrink-0 mr-1 uppercase tracking-wider">
              <Users className="w-4 h-4 text-orange-500" />
              <span className="hidden sm:inline">Comensales:</span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
              {diners.map((diner) => {
                const isActive = activeDinerId === diner.id;
                const dinerCartCount = cart.filter(i => i.comensalId === diner.id).reduce((sum, i) => sum + i.cantidad, 0);

                return (
                  <div
                    key={diner.id}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition border shrink-0 ${
                      isActive
                        ? 'bg-orange-950/60 text-orange-200 border-orange-500 ring-2 ring-orange-500/30 shadow-xs'
                        : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:bg-neutral-700/80 hover:text-neutral-200'
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
                        isActive ? 'bg-orange-600 text-white' : 'bg-neutral-700 text-neutral-300'
                      }`}>
                        C{diner.numero}
                      </span>
                      <span className="whitespace-nowrap">{diner.nombre}</span>
                      {dinerCartCount > 0 && (
                        <span className="px-1.5 py-0.2 bg-orange-600 text-white rounded-full text-[10px] font-mono font-black">
                          {dinerCartCount}
                        </span>
                      )}
                    </button>

                    {editingDinerId === diner.id ? (
                      <div className="flex items-center gap-1 ml-1">
                        <input
                          type="text"
                          value={editingDinerName}
                          onChange={(e) => setEditingDinerName(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEditingDiner(diner.id);
                            if (e.key === 'Escape') setEditingDinerId(null);
                          }}
                          className="w-20 px-1 py-0.5 text-xs bg-neutral-900 text-white border border-orange-500 rounded outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEditingDiner(diner.id)}
                          className="text-emerald-400 hover:text-emerald-300 text-xs font-bold cursor-pointer"
                        >
                          ✓
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDinerId(diner.id);
                          setEditingDinerName(diner.nombre);
                        }}
                        className="text-neutral-500 hover:text-neutral-300 ml-1 text-[10px] cursor-pointer"
                        title="Cambiar nombre de comensal"
                      >
                        ✎
                      </button>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  sounds.playKeypadClick();
                  onAddDiner();
                }}
                className="px-2.5 py-1 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 flex items-center gap-1 shrink-0 transition cursor-pointer"
                title="Agregar nuevo comensal a la mesa"
              >
                <Plus className="w-3.5 h-3.5 text-orange-400" />
                <span>+ Comensal</span>
              </button>
            </div>
          </div>

          <div className="text-[11px] text-neutral-400 font-medium shrink-0 hidden md:flex items-center gap-1.5">
            <span>Asignando platos a:</span>
            <span className="px-2 py-0.5 rounded-md bg-orange-600/20 text-orange-400 border border-orange-500/30 font-bold">
              {activeDiner?.nombre}
            </span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. BARRA DE BÚSQUEDA Y CATEGORÍAS (FLUIDA Y DE FÁCIL ACCESO TÁCTIL)        */}
      {/* ========================================================================= */}
      <div className="bg-neutral-900 border-b border-neutral-800 px-3 sm:px-5 py-2.5 space-y-2 shrink-0 z-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          
          {/* Buscador de Platos */}
          <div className="relative flex-1 sm:max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, ingrediente o código..."
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-8 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 text-xs font-medium outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition"
            />
            {menuSearch && (
              <button
                type="button"
                onClick={() => setMenuSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtros Rápidos de Ruta de Preparación */}
          <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                sounds.playKeypadClick();
                setRouteFilter('all');
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                routeFilter === 'all'
                  ? 'bg-neutral-800 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Utensils className="w-3 h-3 text-orange-400" />
              <span>Todos ({menuItems.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playKeypadClick();
                setRouteFilter('cocina');
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                routeFilter === 'cocina'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <ChefHat className="w-3 h-3" />
              <span>Cocina</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playKeypadClick();
                setRouteFilter('express');
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                routeFilter === 'express'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Express / Bebidas</span>
            </button>
          </div>

        </div>

        {/* Carrusel / Pastillas de Categorías */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-thin scrollbar-thumb-neutral-700">
          {categories.map((cat, idx) => {
            const isCatActive = selectedCategory === cat;
            const count = categoryCounts[cat] || 0;

            return (
              <button
                key={`${cat}-${idx}`}
                type="button"
                onClick={() => {
                  sounds.playKeypadClick();
                  setSelectedCategory(cat);
                  menuScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  isCatActive
                    ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-neutral-700/60'
                }`}
              >
                <span>{cat}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isCatActive ? 'bg-orange-800 text-orange-100' : 'bg-neutral-700 text-neutral-400'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Indicador visual de progreso de scroll arriba-abajo */}
      <div className="w-full h-1 bg-neutral-800/80 shrink-0 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-orange-500 via-amber-400 to-orange-600 transition-all duration-75"
          style={{ width: `${Math.min(100, Math.max(0, scrollProgress))}%` }}
        />
      </div>

      {/* ========================================================================= */}
      {/* 4. ÁREA PRINCIPAL DE VISUALIZACIÓN DEL MENÚ (PANTALLA COMPLETA & SCROLL)  */}
      {/* ========================================================================= */}
      <main 
        ref={menuScrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 overscroll-y-contain touch-pan-y scroll-smooth scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent pb-36 sm:pb-44"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {filteredItems.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center text-neutral-400 space-y-3">
            <Utensils className="w-12 h-12 text-neutral-600 stroke-1" />
            <div>
              <p className="text-sm font-bold text-neutral-300">No se encontraron platos disponibles</p>
              <p className="text-xs text-neutral-500 mt-0.5">Prueba con otra categoría o limpia el buscador</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('Todos');
                setRouteFilter('all');
                setMenuSearch('');
              }}
              className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-orange-400 font-bold text-xs transition border border-neutral-700 cursor-pointer"
            >
              Mostrar todo el menú
            </button>
          </div>
        ) : viewMode === 'large' ? (
          /* VISTA 1: CUADRÍCULA CON FOTO COMPACTA (MÁXIMA DENSIDAD Y PRESENTACIÓN DE PLATOS) */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 3xl:grid-cols-8 gap-2 sm:gap-2.5 pb-24">
            {filteredItems.map((item, idx) => {
              const countInActiveDiner = cart
                .filter(i => i.menuItemId === item.id && (setupData.orderTargetType !== 'mesa' || i.comensalId === activeDinerId))
                .reduce((sum, i) => sum + i.cantidad, 0);

              const totalCountAllDiners = cart
                .filter(i => i.menuItemId === item.id)
                .reduce((sum, i) => sum + i.cantidad, 0);

              return (
                <div
                  key={`item-lg-${item.id}-${idx}`}
                  className={`group relative bg-neutral-800 rounded-2xl border transition-all flex flex-col justify-between overflow-hidden select-none shadow-xs ${
                    !item.disponible
                      ? 'opacity-40 border-neutral-800 cursor-not-allowed'
                      : countInActiveDiner > 0
                        ? 'border-orange-500 bg-neutral-800/90 ring-2 ring-orange-500/30 shadow-md shadow-orange-500/10'
                        : 'border-neutral-700/80 hover:border-neutral-500 hover:bg-neutral-750 cursor-pointer'
                  }`}
                  onClick={() => {
                    if (item.disponible && countInActiveDiner === 0) {
                      onAddToCart(item);
                    }
                  }}
                >
                  {/* Badge de cantidad asignada al comensal activo */}
                  {countInActiveDiner > 0 && (
                    <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-orange-600 text-white font-black text-[11px] px-2 py-0.5 rounded-full shadow-md border border-orange-400/40 animate-in zoom-in-50">
                      <Check className="w-3 h-3 stroke-[3]" />
                      <span>{countInActiveDiner}x</span>
                    </div>
                  )}

                  {/* Contenedor de Foto del Plato (Más compacto y estilizado) */}
                  <div 
                    className="relative w-full h-24 sm:h-28 md:h-30 bg-neutral-900 overflow-hidden cursor-pointer shrink-0"
                    onClick={() => {
                      if (item.disponible) onAddToCart(item);
                    }}
                  >
                    {(item.fotoUrl || item.imagenUrl) ? (
                      <img
                        src={item.fotoUrl || item.imagenUrl || ''}
                        alt={item.nombre}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-neutral-600 bg-neutral-900/80">
                        <Utensils className="w-7 h-7 mb-0.5 opacity-40" />
                        <span className="text-[9px] uppercase font-bold tracking-widest text-neutral-500">Carta</span>
                      </div>
                    )}

                    {/* Gradient Overlay for badges */}
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-black/20" />

                    {/* Badge de Categoría & Ruta */}
                    <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 z-10">
                      <span className="px-1.5 py-0.5 rounded-md bg-neutral-900/85 backdrop-blur-xs text-neutral-300 text-[9px] font-bold border border-neutral-700/50 truncate max-w-[100px]">
                        {item.categoria}
                      </span>
                      {item.requiereCocina === false ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddToCart(item, 'cocina');
                          }}
                          className="px-1.5 py-0.5 rounded-md bg-blue-600/90 hover:bg-blue-500 text-white text-[9px] font-black flex items-center gap-0.5 transition cursor-pointer shadow-xs"
                          title="Clic para pedir con preparación en Cocina"
                        >
                          <Zap className="w-2.5 h-2.5" /> Express
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddToCart(item, 'express');
                          }}
                          className="px-1.5 py-0.5 rounded-md bg-orange-600/90 hover:bg-orange-500 text-white text-[9px] font-black flex items-center gap-0.5 transition cursor-pointer shadow-xs"
                          title="Clic para pedir con despacho Xpress"
                        >
                          <ChefHat className="w-2.5 h-2.5" /> Cocina
                        </button>
                      )}
                    </div>

                    {!item.disponible && (
                      <div className="absolute inset-0 bg-black/80 flex items-center justify-center text-red-400 font-black text-xs uppercase tracking-wider z-20">
                        Agotado
                      </div>
                    )}
                  </div>

                  {/* Detalle del Plato */}
                  <div 
                    className="p-2 sm:p-2.5 flex-1 flex flex-col justify-between space-y-1.5 cursor-pointer"
                    onClick={() => {
                      if (item.disponible) onAddToCart(item);
                    }}
                  >
                    <div>
                      <h4 className="font-black text-xs sm:text-sm text-white line-clamp-1 leading-snug group-hover:text-orange-400 transition" title={item.nombre}>
                        {item.nombre}
                      </h4>
                      {item.descripcion && (
                        <p className="text-[10px] text-neutral-400 line-clamp-1 mt-0.5 leading-tight">
                          {item.descripcion}
                        </p>
                      )}
                    </div>

                    {/* Indicador si otros comensales ya pidieron este plato */}
                    {setupData.orderTargetType === 'mesa' && totalCountAllDiners > countInActiveDiner && (
                      <div className="text-[9px] text-neutral-400 font-semibold bg-neutral-900/60 px-1.5 py-0.5 rounded border border-neutral-700/50">
                        Total mesa: {totalCountAllDiners}x
                      </div>
                    )}

                    {/* Fila de Precio y Controles Táctiles */}
                    <div className="pt-1.5 border-t border-neutral-700/60 flex items-center justify-between gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <span className="font-mono font-black text-xs sm:text-sm text-emerald-400">
                        ${item.precio.toFixed(2)}
                      </span>

                      {countInActiveDiner > 0 ? (
                        <div className="flex items-center gap-0.5 bg-neutral-950 p-0.5 rounded-lg border border-orange-500/40">
                          <button
                            type="button"
                            onClick={() => onSubtractItem(item)}
                            className="w-6 h-6 rounded-md bg-neutral-800 text-neutral-200 hover:bg-neutral-700 active:bg-orange-600 flex items-center justify-center transition cursor-pointer active:scale-90"
                            title="Restar una unidad"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono font-black text-[11px] text-orange-400 px-1 min-w-[16px] text-center">
                            {countInActiveDiner}
                          </span>
                          <button
                            type="button"
                            onClick={() => onAddToCart(item)}
                            className="w-6 h-6 rounded-md bg-orange-600 text-white hover:bg-orange-500 active:bg-orange-700 flex items-center justify-center transition cursor-pointer active:scale-90 shadow-xs"
                            title="Sumar otra unidad"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onAddToCart(item)}
                            disabled={!item.disponible}
                            className="h-7 px-2 sm:px-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-black text-[11px] flex items-center gap-1 shadow-xs transition cursor-pointer active:scale-95 disabled:opacity-40"
                            title="Agregar al pedido con su preparación por defecto"
                          >
                            <Plus className="w-3 h-3 stroke-[3]" />
                            <span>Agregar</span>
                          </button>

                          <button
                            type="button"
                            disabled={!item.disponible}
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddToCart(item, item.requiereCocina !== false ? 'express' : 'cocina');
                            }}
                            className={`h-7 px-1.5 rounded-lg text-[9px] font-black flex items-center gap-0.5 border transition cursor-pointer disabled:opacity-40 ${
                              item.requiereCocina !== false
                                ? 'bg-neutral-800 hover:bg-emerald-950/80 hover:text-emerald-400 text-neutral-300 border-neutral-700 hover:border-emerald-700/60'
                                : 'bg-neutral-800 hover:bg-orange-950/80 hover:text-orange-400 text-neutral-300 border-neutral-700 hover:border-orange-700/60'
                            }`}
                            title={`Agregar como ${item.requiereCocina !== false ? 'Xpress (Mostrador)' : 'Cocina (KDS)'}`}
                          >
                            {item.requiereCocina !== false ? (
                              <>
                                <Zap className="w-2.5 h-2.5 text-emerald-400" />
                                <span className="hidden sm:inline">Xpress</span>
                              </>
                            ) : (
                              <>
                                <ChefHat className="w-2.5 h-2.5 text-orange-400" />
                                <span className="hidden sm:inline">Cocina</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === 'compact' ? (
          /* VISTA 2: CUADRÍCULA COMPACTA CON MINI-FOTO (MÁXIMA CANTIDAD DE PLATOS POR PANTALLA) */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2 pb-28">
            {filteredItems.map((item, idx) => {
              const countInActiveDiner = cart
                .filter(i => i.menuItemId === item.id && (setupData.orderTargetType !== 'mesa' || i.comensalId === activeDinerId))
                .reduce((sum, i) => sum + i.cantidad, 0);

              const photoSrc = item.fotoUrl || item.imagenUrl;

              return (
                <div
                  key={`item-compact-${item.id}-${idx}`}
                  className={`relative p-2 bg-neutral-800 rounded-xl border flex flex-col justify-between transition cursor-pointer select-none shadow-2xs ${
                    !item.disponible
                      ? 'opacity-40 border-neutral-800 cursor-not-allowed'
                      : countInActiveDiner > 0
                        ? 'border-orange-500 bg-neutral-800 ring-2 ring-orange-500/20'
                        : 'border-neutral-700/70 hover:border-neutral-500 hover:bg-neutral-750'
                  }`}
                  onClick={() => {
                    if (item.disponible) onAddToCart(item);
                  }}
                >
                  {countInActiveDiner > 0 && (
                    <span className="absolute top-1.5 right-1.5 bg-orange-600 text-white font-black text-[10px] px-1.5 py-0.5 rounded-full z-20 shadow-xs">
                      {countInActiveDiner}x
                    </span>
                  )}

                  {/* Mini foto compacta */}
                  <div className="w-full h-14 sm:h-16 rounded-lg bg-neutral-900 overflow-hidden mb-1.5 relative shrink-0">
                    {photoSrc ? (
                      <img
                        src={photoSrc}
                        alt={item.nombre}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-600 bg-neutral-900/80">
                        <Utensils className="w-5 h-5 opacity-40" />
                      </div>
                    )}
                    <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-neutral-950/80 text-neutral-300 text-[8px] font-bold truncate max-w-[80px]">
                      {item.categoria}
                    </span>
                  </div>

                  <div className="space-y-0.5 min-w-0">
                    <h5 className="font-bold text-xs text-white line-clamp-1 leading-tight" title={item.nombre}>
                      {item.nombre}
                    </h5>
                  </div>

                  <div className="mt-1.5 pt-1 border-t border-neutral-700/60 flex items-center justify-between">
                    <span className="font-mono font-black text-xs text-emerald-400">
                      ${item.precio.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.disponible) onAddToCart(item);
                      }}
                      className="w-6 h-6 rounded-md bg-orange-600/30 hover:bg-orange-600 text-orange-400 hover:text-white flex items-center justify-center font-black text-xs transition"
                      title="Agregar al pedido"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* VISTA 3: LISTA RÁPIDA TPV (FILAS DE ALTA DENSIDAD) */
          <div className="space-y-2 max-w-5xl mx-auto pb-28">
            {filteredItems.map((item, idx) => {
              const countInActiveDiner = cart
                .filter(i => i.menuItemId === item.id && (setupData.orderTargetType !== 'mesa' || i.comensalId === activeDinerId))
                .reduce((sum, i) => sum + i.cantidad, 0);

              return (
                <div
                  key={`item-list-${item.id}-${idx}`}
                  className={`p-3 bg-neutral-800 rounded-2xl border flex items-center justify-between gap-3 transition ${
                    !item.disponible
                      ? 'opacity-40 border-neutral-800'
                      : countInActiveDiner > 0
                        ? 'border-orange-500 bg-neutral-800 ring-1 ring-orange-500/30'
                        : 'border-neutral-700/70 hover:border-neutral-500'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-neutral-900 overflow-hidden shrink-0">
                      {(item.fotoUrl || item.imagenUrl) ? (
                        <img
                          src={item.fotoUrl || item.imagenUrl || ''}
                          alt={item.nombre}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-600">
                          <Utensils className="w-5 h-5" />
                        </div>
                      )}
                    </div>

                    <div className="truncate">
                      <div className="font-bold text-sm text-white flex items-center gap-2">
                        <span>{item.nombre}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-900 text-neutral-400">
                          {item.categoria}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-black flex items-center gap-1 border ${
                          item.requiereCocina !== false
                            ? 'bg-orange-950/80 text-orange-400 border-orange-700/60'
                            : 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60'
                        }`}>
                          {item.requiereCocina !== false ? (
                            <>
                              <ChefHat className="w-3 h-3 text-orange-400" />
                              <span>Cocina</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-3 h-3 text-emerald-400" />
                              <span>Xpress</span>
                            </>
                          )}
                        </span>
                      </div>
                      {item.descripcion && (
                        <p className="text-xs text-neutral-400 truncate">
                          {item.descripcion}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono font-black text-sm sm:text-base text-emerald-400">
                      ${item.precio.toFixed(2)}
                    </span>

                    {countInActiveDiner > 0 ? (
                      <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-orange-500/40">
                        <button
                          type="button"
                          onClick={() => onSubtractItem(item)}
                          className="w-7 h-7 rounded-lg bg-neutral-800 text-white flex items-center justify-center"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-mono font-black text-xs text-orange-400 px-2">
                          {countInActiveDiner}
                        </span>
                        <button
                          type="button"
                          onClick={() => onAddToCart(item)}
                          className="w-7 h-7 rounded-lg bg-orange-600 text-white flex items-center justify-center"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onAddToCart(item)}
                          disabled={!item.disponible}
                          className="h-8 px-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40"
                          title="Agregar al pedido"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Agregar</span>
                        </button>
                        <button
                          type="button"
                          disabled={!item.disponible}
                          onClick={() => onAddToCart(item, item.requiereCocina !== false ? 'express' : 'cocina')}
                          className={`h-8 px-2 rounded-xl text-[10px] font-black flex items-center gap-1 border transition cursor-pointer disabled:opacity-40 ${
                            item.requiereCocina !== false
                              ? 'bg-neutral-900 hover:bg-emerald-950/80 hover:text-emerald-400 text-neutral-300 border-neutral-700 hover:border-emerald-700/60'
                              : 'bg-neutral-900 hover:bg-orange-950/80 hover:text-orange-400 text-neutral-300 border-neutral-700 hover:border-orange-700/60'
                          }`}
                          title={`Agregar como ${item.requiereCocina !== false ? 'Xpress' : 'Cocina'}`}
                        >
                          {item.requiereCocina !== false ? (
                            <>
                              <Zap className="w-3 h-3 text-emerald-400" />
                              <span>Xpress</span>
                            </>
                          ) : (
                            <>
                              <ChefHat className="w-3 h-3 text-orange-400" />
                              <span>Cocina</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Quick Scroll Controls (Desplazamiento Arriba / Abajo) */}
      <div className="fixed right-3 sm:right-5 bottom-24 sm:bottom-28 z-40 flex flex-col gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={scrollToTop}
          className="w-10 h-10 rounded-2xl bg-neutral-900/90 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 shadow-xl flex items-center justify-center transition active:scale-90 cursor-pointer backdrop-blur-md"
          title="Desplazarse al inicio del menú"
        >
          <ChevronUp className="w-5 h-5 text-orange-400 stroke-[2.5]" />
        </button>
        <button
          type="button"
          onClick={scrollToBottom}
          className="w-10 h-10 rounded-2xl bg-neutral-900/90 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 shadow-xl flex items-center justify-center transition active:scale-90 cursor-pointer backdrop-blur-md"
          title="Desplazarse al final del menú"
        >
          <ChevronDown className="w-5 h-5 text-orange-400 stroke-[2.5]" />
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 5. BARRA FIJA INFERIOR DE ACCIÓN RÁPIDA (FLOATING DOCKED BAR)             */}
      {/* ========================================================================= */}
      <footer className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          
          {/* Resumen del Carrito */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white font-black text-base flex items-center justify-center shadow-md">
              {totalCartItemsCount}
            </div>
            <div>
              <div className="text-xs font-bold text-neutral-400">
                {setupData.orderTargetType === 'mesa' ? `Mesa #${setupData.selectedTable?.numero}` : 'Mostrador / Llevar'} · Ronda {currentRoundNumber}
              </div>
              <div className="font-mono font-black text-base sm:text-xl text-emerald-400">
                ${totalAmount.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center gap-2">
            
            {/* Botón Volver / Restaurar */}
            <button
              type="button"
              onClick={onChangeTarget}
              className="h-11 sm:h-12 px-3 sm:px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition border border-neutral-700 cursor-pointer"
              title="Volver a la selección de mesa / normal"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>

            {/* Botón Ver Comanda Completa / Notas */}
            <button
              type="button"
              onClick={() => {
                sounds.playKeypadClick();
                haptics.tap();
                setShowCartDrawer(true);
              }}
              className="h-11 sm:h-12 px-3 sm:px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs sm:text-sm flex items-center gap-2 transition border border-neutral-700 cursor-pointer"
            >
              <Eye className="w-4 h-4 text-orange-400" />
              <span className="hidden xs:inline">Ver Comanda</span>
              <span>({totalCartItemsCount})</span>
            </button>

            {/* Botón Aceptar / Enviar Pedido a Cocina */}
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => {
                sounds.playKeypadClick();
                haptics.success();
                onRequestSendToKitchen();
              }}
              className="h-11 sm:h-12 px-4 sm:px-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-600/40 transition active:scale-98 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>ACEPTAR Y ENVIAR (${totalAmount.toFixed(2)})</span>
            </button>

          </div>

        </div>
      </footer>

      {/* ========================================================================= */}
      {/* 6. SLIDE-OVER DRAWER: DETALLE DE COMANDA, NOTAS Y COMENSALES              */}
      {/* ========================================================================= */}
      {showCartDrawer && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex justify-end z-50 animate-in fade-in duration-200">
          <div className="bg-neutral-900 border-l border-neutral-800 w-full max-w-lg h-full flex flex-col justify-between p-4 sm:p-6 shadow-2xl animate-in slide-in-from-right duration-300">
            
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center font-black">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-white">
                    Comanda · Ronda {currentRoundNumber}
                  </h3>
                  <p className="text-xs text-neutral-400">
                    {setupData.orderTargetType === 'mesa' ? `Mesa #${setupData.selectedTable?.numero}` : (setupData.selectedClient?.nombre || 'Cliente Mostrador')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowCartDrawer(false)}
                className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Consumo Acumulado de Rondas Anteriores */}
            {setupData.targetExistingOrder && (
              <div className="mt-3 bg-neutral-950 rounded-2xl border border-neutral-800 overflow-hidden text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPrevRoundsAccordion(!showPrevRoundsAccordion)}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-neutral-300 font-bold hover:bg-neutral-800/60 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-left">
                    <Layers className="w-4 h-4 text-orange-400" />
                    <span>Consumo previo ({setupData.targetExistingOrder.items?.length || 0} platos)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-emerald-400 font-black">${setupData.targetExistingOrder.total.toFixed(2)}</span>
                    {showPrevRoundsAccordion ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {showPrevRoundsAccordion && (
                  <div className="p-3 bg-neutral-900 border-t border-neutral-800 space-y-2 max-h-48 overflow-y-auto">
                    {setupData.targetExistingOrder.items?.map((it, idx) => (
                      <div key={`prev-it-${idx}`} className="flex items-center justify-between text-xs py-1 border-b border-neutral-800/60 last:border-0">
                        <div>
                          <span className="font-bold text-white">{it.cantidad}x {it.nombre}</span>
                          <div className="text-[10px] text-neutral-400">
                            Ronda {it.ronda || 1} • {it.comensalNombre || 'General'}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-neutral-300">${(it.precio * it.cantidad).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Lista de Ítems en Carrito */}
            <div className="flex-1 min-h-0 overflow-y-auto my-3 space-y-2.5 pr-1">
              {cart.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center text-neutral-500 text-xs space-y-2">
                  <ShoppingBag className="w-12 h-12 stroke-1 text-neutral-700" />
                  <p className="font-bold text-neutral-400 text-sm">No has agregado platos a la comanda</p>
                  <p className="text-neutral-600">Toca los platos en el catálogo para agregarlos</p>
                </div>
              ) : (
                cart.map((it, idx) => (
                  <div key={`cart-drawer-item-${it.menuItemId}-${it.comensalId}-${idx}`} className="p-3 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2 shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-black text-sm text-white leading-tight">
                          {it.nombre}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {/* Selector de Comensal para este ítem */}
                          {setupData.orderTargetType === 'mesa' && (
                            <div className="flex items-center gap-1.5">
                              <Tag className="w-3 h-3 text-orange-400" />
                              <select
                                value={it.comensalId || diners[0]?.id}
                                onChange={(e) => onAssignItemDiner(idx, e.target.value)}
                                className="text-[10px] font-bold bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-0.5 text-neutral-200 outline-none cursor-pointer"
                              >
                                {diners.map(d => (
                                  <option key={d.id} value={d.id}>
                                    {d.nombre}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Selector Interactivo de Preparación: Cocina vs Preparación Xpress */}
                          <button
                            type="button"
                            onClick={() => onToggleItemRoute && onToggleItemRoute(idx)}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-1 transition cursor-pointer border ${
                              it.requiereCocina !== false
                                ? 'bg-orange-950/80 text-orange-400 border-orange-700/60 hover:bg-orange-900'
                                : 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60 hover:bg-emerald-900'
                            }`}
                            title="Clic para cambiar entre Cocina y Preparación Xpress"
                          >
                            {it.requiereCocina !== false ? (
                              <>
                                <ChefHat className="w-3 h-3 text-orange-400" />
                                <span>Cocina</span>
                              </>
                            ) : (
                              <>
                                <Zap className="w-3 h-3 text-emerald-400" />
                                <span>Xpress</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <span className="font-mono font-black text-sm text-emerald-400 shrink-0">
                        ${(it.precio * it.cantidad).toFixed(2)}
                      </span>
                    </div>

                    {it.notas && (
                      <p className="text-xs text-orange-300 italic bg-orange-950/40 px-2.5 py-1 rounded-xl border border-orange-500/30">
                        Nota: {it.notas}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
                      <button
                        type="button"
                        onClick={() => onOpenNoteModal(idx, it.notas || '')}
                        className="text-xs font-bold text-neutral-400 hover:text-orange-400 transition cursor-pointer flex items-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{it.notas ? 'Editar nota' : '+ Nota cocina'}</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onUpdateQty(idx, -1)}
                          className="w-7 h-7 rounded-xl bg-neutral-800 text-neutral-300 hover:bg-neutral-700 flex items-center justify-center font-bold cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-mono font-black text-sm px-2 text-white">
                          {it.cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQty(idx, 1)}
                          className="w-7 h-7 rounded-xl bg-neutral-800 text-neutral-300 hover:bg-neutral-700 flex items-center justify-center font-bold cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(idx)}
                          className="w-7 h-7 rounded-xl bg-red-950/60 text-red-400 hover:bg-red-900/80 flex items-center justify-center ml-1 cursor-pointer transition border border-red-800/40"
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

            {/* Drawer Footer */}
            <div className="pt-3 border-t border-neutral-800 space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-neutral-400 block">Total Ronda {currentRoundNumber}:</span>
                  {setupData.targetExistingOrder && (
                    <span className="text-[11px] text-neutral-500 font-medium">
                      Total acumulado: ${(setupData.targetExistingOrder.total + totalAmount).toFixed(2)}
                    </span>
                  )}
                </div>
                <span className="font-mono font-black text-2xl text-emerald-400">
                  ${totalAmount.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowCartDrawer(false)}
                  className="h-12 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs transition cursor-pointer"
                >
                  + Seguir eligiendo
                </button>
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => {
                    setShowCartDrawer(false);
                    onRequestSendToKitchen();
                  }}
                  className="h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30 disabled:opacity-40 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Aceptar y Enviar (${totalAmount.toFixed(2)})</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
