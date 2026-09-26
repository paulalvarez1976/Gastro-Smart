import React, { useState } from 'react';
import { MenuItem, Restaurant, InventoryItem } from '../types';
import { 
  AlertTriangle, 
  ArrowRight, 
  ChevronDown, 
  ChevronUp, 
  Zap, 
  UtensilsCrossed, 
  Boxes,
  Loader2 
} from 'lucide-react';
import { sounds } from '../utils/sound';

interface LowStockNotificationBannerProps {
  menuItems: MenuItem[];
  inventoryItems?: InventoryItem[];
  restaurants: Restaurant[];
  onOpenRestockModal: () => void;
  onNavigateToMenu: () => void;
  onNavigateToInventory?: () => void;
  onQuickRestock: (item: MenuItem, amount: number) => Promise<void>;
  onQuickRestockInventory?: (item: InventoryItem, amount: number) => Promise<void>;
}

interface UnifiedCriticalEntry {
  id: string;
  nombre: string;
  stockActual: number;
  stockMinimo: number;
  unidadMedida: string;
  fotoUrl?: string | null;
  kind: 'insumo' | 'plato';
  rawItem: InventoryItem | MenuItem;
}

export const LowStockNotificationBanner: React.FC<LowStockNotificationBannerProps> = ({
  menuItems,
  inventoryItems = [],
  onOpenRestockModal,
  onNavigateToMenu,
  onNavigateToInventory,
  onQuickRestock,
  onQuickRestockInventory
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [restockingId, setRestockingId] = useState<string | null>(null);

  // 1. Insumos / materias primas con niveles críticos o agotados
  const criticalSupplies: UnifiedCriticalEntry[] = inventoryItems
    .filter(inv => (Number(inv.stockActual) || 0) <= (Number(inv.stockMinimo) || 5))
    .map(inv => ({
      id: `inv_${inv.id}`,
      nombre: inv.nombre,
      stockActual: Number(inv.stockActual) || 0,
      stockMinimo: Number(inv.stockMinimo) || 5,
      unidadMedida: inv.unidadMedida || 'unid.',
      kind: 'insumo' as const,
      rawItem: inv
    }));

  // 2. Platos con inventario directo activo y niveles críticos
  const controlledDishes: UnifiedCriticalEntry[] = menuItems
    .filter(m => m.controlaStock === true && (m.stockActual ?? 0) <= (m.stockMinimo ?? 5))
    .map(m => ({
      id: `dish_${m.id}`,
      nombre: m.nombre,
      stockActual: m.stockActual ?? 0,
      stockMinimo: m.stockMinimo ?? 5,
      unidadMedida: m.unidadMedida || 'unid.',
      fotoUrl: m.fotoUrl || m.imagenUrl,
      kind: 'plato' as const,
      rawItem: m
    }));

  const allCritical = [...criticalSupplies, ...controlledDishes].sort((a, b) => {
    if (a.stockActual <= 0 && b.stockActual > 0) return -1;
    if (a.stockActual > 0 && b.stockActual <= 0) return 1;
    return a.stockActual - b.stockActual;
  });

  const depletedCount = allCritical.filter(i => i.stockActual <= 0).length;
  const lowStockCount = allCritical.filter(i => i.stockActual > 0).length;
  const totalAlerts = allCritical.length;

  if (totalAlerts === 0) {
    return null;
  }

  const handleQuickAdd = async (e: React.MouseEvent, entry: UnifiedCriticalEntry, qty: number) => {
    e.stopPropagation();
    try {
      setRestockingId(entry.id);
      sounds.playKeypadClick();
      if (entry.kind === 'insumo' && onQuickRestockInventory) {
        await onQuickRestockInventory(entry.rawItem as InventoryItem, qty);
      } else if (entry.kind === 'plato') {
        await onQuickRestock(entry.rawItem as MenuItem, qty);
      }
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
      className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-red-500/15 border-2 border-amber-500/80 rounded-3xl p-4 sm:p-5 shadow-xs mb-5 transition-all duration-200"
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
                Alerta de Umbral Crítico: {totalAlerts} {totalAlerts === 1 ? 'insumo/producto bajo stock mínimo' : 'insumos y productos en stock crítico'}
              </h3>
              
              {depletedCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-600 text-white shadow-xs">
                  {depletedCount} Agotados
                </span>
              )}
              {lowStockCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500 text-white shadow-xs">
                  {lowStockCount} Bajo Umbral Crítico
                </span>
              )}
              {criticalSupplies.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-orange-100 text-orange-800 border border-orange-300">
                  {criticalSupplies.length} Insumo(s)
                </span>
              )}
            </div>

            <p className="text-xs text-neutral-600 mt-0.5">
              El descuento automático al marcar pedidos como <strong>&apos;entregado&apos;</strong> detectó existencias por debajo del umbral crítico configurado.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onNavigateToInventory && (
            <button
              type="button"
              onClick={() => { sounds.playKeypadClick(); onNavigateToInventory(); }}
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Gestionar Insumos</span>
            </button>
          )}

          <button
            id="btn-open-quick-restock"
            type="button"
            onClick={() => { sounds.playKeypadClick(); onOpenRestockModal(); }}
            className="px-3 py-2 rounded-xl bg-white hover:bg-neutral-50 text-amber-900 border border-amber-300 font-black text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
          >
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            <span>Reabastecer Platos</span>
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
            <span>Insumos y productos que requieren reposición inmediata:</span>
            <span className="text-[10px] text-neutral-400 font-normal">Reposición rápida (+5 / +10 en 1 clic)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {allCritical.slice(0, 8).map(entry => {
              const isDepleted = entry.stockActual <= 0;
              const isBusy = restockingId === entry.id;

              return (
                <div 
                  key={entry.id}
                  className={`p-2.5 rounded-2xl border bg-white flex items-center justify-between gap-2 shadow-2xs transition hover:shadow-xs ${
                    isDepleted 
                      ? 'border-red-300 ring-1 ring-red-400/30' 
                      : 'border-amber-300 ring-1 ring-amber-400/30'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-9 h-9 rounded-xl overflow-hidden shrink-0 border flex items-center justify-center ${
                      entry.kind === 'insumo'
                        ? 'bg-orange-50 border-orange-200 text-orange-600'
                        : 'bg-neutral-100 border-neutral-200 text-neutral-400'
                    }`}>
                      {entry.fotoUrl ? (
                        <img src={entry.fotoUrl} alt={entry.nombre} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : entry.kind === 'insumo' ? (
                        <Boxes className="w-4 h-4" />
                      ) : (
                        <UtensilsCrossed className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                          entry.kind === 'insumo' ? 'bg-orange-100 text-orange-800' : 'bg-purple-100 text-purple-800'
                        }`}>
                          {entry.kind === 'insumo' ? 'Insumo' : 'Plato'}
                        </span>
                        <div className="font-bold text-xs text-neutral-900 truncate" title={entry.nombre}>
                          {entry.nombre}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-black uppercase ${
                          isDepleted 
                            ? 'bg-red-100 text-red-700' 
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {isDepleted ? '0 ' + entry.unidadMedida : `${entry.stockActual} ${entry.unidadMedida}`}
                        </span>
                        <span className="text-[10px] text-neutral-400 font-medium">
                          (Crítico: ≤{entry.stockMinimo})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Botones de incremento rápido */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={(e) => handleQuickAdd(e, entry, 5)}
                      className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-black text-[11px] transition active:scale-95 disabled:opacity-50 cursor-pointer"
                      title="Agregar +5"
                    >
                      {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : '+5'}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={(e) => handleQuickAdd(e, entry, 10)}
                      className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] transition active:scale-95 disabled:opacity-50 shadow-2xs cursor-pointer"
                      title="Agregar +10"
                    >
                      +10
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {allCritical.length > 8 && (
            <div className="mt-2.5 text-center">
              <button
                type="button"
                onClick={() => {
                  sounds.playKeypadClick();
                  if (onNavigateToInventory) onNavigateToInventory();
                  else onOpenRestockModal();
                }}
                className="text-xs font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
              >
                Ver los {allCritical.length - 8} ítems restantes en el módulo de Inventario e Insumos →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
