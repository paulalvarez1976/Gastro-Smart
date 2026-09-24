import React, { useState } from 'react';
import { MenuItem, Restaurant } from '../types';
import { 
  AlertTriangle, 
  PackageX, 
  PackagePlus, 
  ArrowRight, 
  ChevronDown, 
  ChevronUp, 
  Zap, 
  UtensilsCrossed, 
  Check, 
  Loader2 
} from 'lucide-react';
import { sounds } from '../utils/sound';

interface LowStockNotificationBannerProps {
  menuItems: MenuItem[];
  restaurants: Restaurant[];
  onOpenRestockModal: () => void;
  onNavigateToMenu: () => void;
  onQuickRestock: (item: MenuItem, amount: number) => Promise<void>;
}

export const LowStockNotificationBanner: React.FC<LowStockNotificationBannerProps> = ({
  menuItems,
  restaurants,
  onOpenRestockModal,
  onNavigateToMenu,
  onQuickRestock
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [restockingId, setRestockingId] = useState<string | null>(null);

  // Filtrar productos con inventario activo y niveles críticos
  const controlledItems = menuItems.filter(m => m.controlaStock === true);
  const depletedItems = controlledItems.filter(m => (m.stockActual ?? 0) <= 0);
  const lowStockItems = controlledItems.filter(m => (m.stockActual ?? 0) > 0 && (m.stockActual ?? 0) <= (m.stockMinimo ?? 5));
  
  const criticalItems = [...depletedItems, ...lowStockItems];
  const totalAlerts = criticalItems.length;

  if (totalAlerts === 0) {
    return null;
  }

  const handleQuickAdd = async (e: React.MouseEvent, item: MenuItem, qty: number) => {
    e.stopPropagation();
    try {
      setRestockingId(item.id);
      sounds.playKeypadClick();
      await onQuickRestock(item, qty);
      sounds.playNotification();
    } catch (err) {
      console.error('Error in quick restock:', err);
    } finally {
      setRestockingId(null);
    }
  };

  return (
    <div 
      id="low-stock-notification-banner"
      className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border-2 border-amber-400/80 rounded-3xl p-4 sm:p-5 shadow-xs mb-5 transition-all duration-200"
    >
      {/* Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs relative">
            <AlertTriangle className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-600 border-2 border-white rounded-full animate-ping" />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-600 border-2 border-white rounded-full" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-neutral-900 flex items-center gap-1.5">
                Alerta de Inventario: {totalAlerts} {totalAlerts === 1 ? 'producto próximo a agotarse' : 'productos con stock crítico'}
              </h3>
              
              {depletedItems.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-600 text-white shadow-xs">
                  {depletedItems.length} Agotados
                </span>
              )}
              {lowStockItems.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500 text-white shadow-xs">
                  {lowStockItems.length} Stock Bajo
                </span>
              )}
            </div>

            <p className="text-xs text-neutral-600 mt-0.5">
              Reabastece las existencias para evitar demoras en comandas o marcar platos como no disponibles.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            id="btn-open-quick-restock"
            type="button"
            onClick={() => { sounds.playKeypadClick(); onOpenRestockModal(); }}
            className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Reabastecer Rápido</span>
          </button>

          <button
            type="button"
            onClick={() => { sounds.playKeypadClick(); onNavigateToMenu(); }}
            className="px-3 py-2 rounded-xl bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-300 font-bold text-xs transition flex items-center gap-1 shadow-xs cursor-pointer"
          >
            <span>Ver Carta</span>
            <ArrowRight className="w-3.5 h-3.5 text-neutral-500" />
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-xl bg-white/80 hover:bg-white text-neutral-600 border border-neutral-200 transition"
            title={isCollapsed ? "Mostrar detalles" : "Ocultar detalles"}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Item Carousel / List when not collapsed */}
      {!isCollapsed && (
        <div className="mt-4 pt-3.5 border-t border-amber-300/60">
          <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Productos que requieren atención inmediata:</span>
            <span className="text-[10px] text-neutral-400 font-normal">Acciones rápidas (+5 / +10 unidades en 1 clic)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {criticalItems.slice(0, 8).map(item => {
              const currentStock = item.stockActual ?? 0;
              const minStock = item.stockMinimo ?? 5;
              const isDepleted = currentStock <= 0;
              const photo = item.fotoUrl || item.imagenUrl;
              const unit = item.unidadMedida || 'unid.';
              const isBusy = restockingId === item.id;

              return (
                <div 
                  key={item.id}
                  className={`p-2.5 rounded-2xl border bg-white flex items-center justify-between gap-2 shadow-2xs transition hover:shadow-xs ${
                    isDepleted 
                      ? 'border-red-300 ring-1 ring-red-400/30' 
                      : 'border-amber-300 ring-1 ring-amber-400/30'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-xl overflow-hidden bg-neutral-100 shrink-0 border border-neutral-200 flex items-center justify-center">
                      {photo ? (
                        <img src={photo} alt={item.nombre} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <UtensilsCrossed className="w-4 h-4 text-neutral-400" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="font-bold text-xs text-neutral-900 truncate" title={item.nombre}>
                        {item.nombre}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-black uppercase ${
                          isDepleted 
                            ? 'bg-red-100 text-red-700' 
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {isDepleted ? '0 ' + unit : `${currentStock} ${unit}`}
                        </span>
                        <span className="text-[10px] text-neutral-400 font-medium">
                          (Mín: {minStock})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Botones de incremento rápido */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={(e) => handleQuickAdd(e, item, 5)}
                      className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-black text-[11px] transition active:scale-95 disabled:opacity-50"
                      title="Agregar +5 unidades"
                    >
                      {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : '+5'}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={(e) => handleQuickAdd(e, item, 10)}
                      className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] transition active:scale-95 disabled:opacity-50 shadow-2xs"
                      title="Agregar +10 unidades"
                    >
                      +10
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {criticalItems.length > 8 && (
            <div className="mt-2.5 text-center">
              <button
                type="button"
                onClick={() => { sounds.playKeypadClick(); onOpenRestockModal(); }}
                className="text-xs font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
              >
                Ver los {criticalItems.length - 8} productos restantes en el Centro de Reabastecimiento →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
