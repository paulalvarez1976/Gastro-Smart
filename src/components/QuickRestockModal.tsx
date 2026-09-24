import React, { useState, useMemo } from 'react';
import { MenuItem, Restaurant } from '../types';
import { 
  X, 
  Search, 
  Boxes, 
  AlertTriangle, 
  PackageX, 
  PackageCheck, 
  Plus, 
  Minus, 
  Check, 
  Zap, 
  UtensilsCrossed, 
  RotateCcw,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { sounds } from '../utils/sound';

interface QuickRestockModalProps {
  isOpen: boolean;
  onClose: () => void;
  menuItems: MenuItem[];
  restaurants: Restaurant[];
  onUpdateStock: (itemId: string, newStock: number) => Promise<void>;
  onQuickAdjust: (itemId: string, delta: number) => Promise<void>;
  onEnableStockControl?: (item: MenuItem, initialStock: number) => Promise<void>;
}

export const QuickRestockModal: React.FC<QuickRestockModalProps> = ({
  isOpen,
  onClose,
  menuItems,
  restaurants,
  onUpdateStock,
  onQuickAdjust,
  onEnableStockControl
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'critical' | 'all_controlled' | 'all'>('critical');
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [tempStockInputs, setTempStockInputs] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Filtrado de productos
  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      // Búsqueda por nombre o categoría
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchName = item.nombre.toLowerCase().includes(query);
        const matchCat = item.categoria.toLowerCase().includes(query);
        if (!matchName && !matchCat) return false;
      }

      const isControlled = item.controlaStock === true;
      const stock = item.stockActual ?? 0;
      const minStock = item.stockMinimo ?? 5;
      const isCritical = isControlled && stock <= minStock;

      if (activeFilter === 'critical') return isCritical;
      if (activeFilter === 'all_controlled') return isControlled;
      return true; // 'all'
    }).sort((a, b) => {
      // Priorizar los agotados (stock <= 0), luego bajo stock, luego alfabético
      const aControlled = a.controlaStock === true;
      const bControlled = b.controlaStock === true;
      const aStock = a.stockActual ?? 0;
      const bStock = b.stockActual ?? 0;
      const aMin = a.stockMinimo ?? 5;
      const bMin = b.stockMinimo ?? 5;
      
      const aCrit = aControlled && aStock <= aMin;
      const bCrit = bControlled && bStock <= bMin;

      if (aCrit && !bCrit) return -1;
      if (!aCrit && bCrit) return 1;
      if (aStock <= 0 && bStock > 0) return -1;
      if (aStock > 0 && bStock <= 0) return 1;
      return a.nombre.localeCompare(b.nombre);
    });
  }, [menuItems, searchTerm, activeFilter]);

  const criticalCount = useMemo(() => {
    return menuItems.filter(m => m.controlaStock && (m.stockActual ?? 0) <= (m.stockMinimo ?? 5)).length;
  }, [menuItems]);

  const controlledCount = useMemo(() => {
    return menuItems.filter(m => m.controlaStock === true).length;
  }, [menuItems]);

  if (!isOpen) return null;

  const handleAdjust = async (item: MenuItem, delta: number) => {
    try {
      setLoadingItemId(item.id);
      sounds.playKeypadClick();
      await onQuickAdjust(item.id, delta);
      sounds.playNotification();
      showToast(`Stock de "${item.nombre}" actualizado (${delta > 0 ? '+' : ''}${delta})`);
    } catch (err) {
      console.error('Error adjusting stock:', err);
    } finally {
      setLoadingItemId(null);
    }
  };

  const handleManualStockSave = async (item: MenuItem) => {
    const rawVal = tempStockInputs[item.id];
    if (rawVal === undefined || rawVal === '') return;
    const num = parseFloat(rawVal);
    if (isNaN(num) || num < 0) return;

    try {
      setLoadingItemId(item.id);
      sounds.playKeypadClick();
      await onUpdateStock(item.id, num);
      sounds.playNotification();
      showToast(`Nuevo stock establecido para "${item.nombre}": ${num}`);
      setTempStockInputs(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    } catch (err) {
      console.error('Error saving manual stock:', err);
    } finally {
      setLoadingItemId(null);
    }
  };

  const handleEnableControl = async (item: MenuItem) => {
    if (!onEnableStockControl) return;
    try {
      setLoadingItemId(item.id);
      sounds.playKeypadClick();
      await onEnableStockControl(item, 20);
      sounds.playNotification();
      showToast(`Control de stock activado para "${item.nombre}" (20 iniciales)`);
    } catch (err) {
      console.error('Error activating stock control:', err);
    } finally {
      setLoadingItemId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150">
      <div 
        id="quick-restock-modal-card"
        className="bg-neutral-50 rounded-3xl border border-neutral-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 bg-white border-b border-neutral-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-neutral-900 tracking-tight">
                  Centro de Reabastecimiento de Inventario
                </h2>
                {criticalCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-100 text-red-700 border border-red-200">
                    {criticalCount} Críticos
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500">
                Ajusta existencias en tiempo real con 1 solo clic o ingresa cantidades directas.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { sounds.playKeypadClick(); onClose(); }}
            className="w-9 h-9 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center transition active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="p-4 bg-white border-b border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar producto o categoría..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-neutral-100 hover:bg-neutral-100/80 focus:bg-white text-xs font-medium text-neutral-900 rounded-xl border border-transparent focus:border-amber-500 outline-none transition"
            />
            {searchTerm && (
              <button 
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-xl border border-neutral-200 text-xs w-full sm:w-auto overflow-x-auto">
            <button
              type="button"
              onClick={() => { sounds.playKeypadClick(); setActiveFilter('critical'); }}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shrink-0 ${
                activeFilter === 'critical'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Stock Crítico ({criticalCount})</span>
            </button>

            <button
              type="button"
              onClick={() => { sounds.playKeypadClick(); setActiveFilter('all_controlled'); }}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shrink-0 ${
                activeFilter === 'all_controlled'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <PackageCheck className="w-3.5 h-3.5" />
              <span>Controlados ({controlledCount})</span>
            </button>

            <button
              type="button"
              onClick={() => { sounds.playKeypadClick(); setActiveFilter('all'); }}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 shrink-0 ${
                activeFilter === 'all'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <span>Todos ({menuItems.length})</span>
            </button>
          </div>
        </div>

        {/* Toast Feedback */}
        {toastMessage && (
          <div className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 flex items-center justify-between animate-in slide-in-from-top-2">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              {toastMessage}
            </span>
            <button onClick={() => setToastMessage(null)} className="text-emerald-100 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Items List */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 divide-y divide-neutral-200">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-neutral-400">
              <PackageCheck className="w-12 h-12 mx-auto text-emerald-500 mb-2 opacity-80" />
              <div className="text-sm font-black text-neutral-800">¡Todo el inventario está en orden!</div>
              <div className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                {activeFilter === 'critical' 
                  ? 'No hay productos agotados ni con stock por debajo del umbral mínimo.' 
                  : 'No se encontraron productos con los filtros seleccionados.'}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map(item => {
                const photo = item.fotoUrl || item.imagenUrl;
                const isControlled = item.controlaStock === true;
                const stock = item.stockActual ?? 0;
                const minStock = item.stockMinimo ?? 5;
                const unit = item.unidadMedida || 'unidades';
                const isDepleted = isControlled && stock <= 0;
                const isLow = isControlled && stock > 0 && stock <= minStock;
                const isBusy = loadingItemId === item.id;
                const customInputVal = tempStockInputs[item.id] !== undefined ? tempStockInputs[item.id] : '';

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 sm:p-4 rounded-2xl border transition bg-white flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                      isDepleted 
                        ? 'border-red-300 ring-1 ring-red-400/20 bg-red-50/20' 
                        : isLow 
                        ? 'border-amber-300 ring-1 ring-amber-400/20 bg-amber-50/20' 
                        : isControlled 
                        ? 'border-neutral-200 hover:border-neutral-300' 
                        : 'border-dashed border-neutral-300 bg-neutral-50/50'
                    }`}
                  >
                    {/* Item Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200 shrink-0 flex items-center justify-center">
                        {photo ? (
                          <img src={photo} alt={item.nombre} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        ) : (
                          <UtensilsCrossed className="w-5 h-5 text-neutral-400" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-neutral-900 truncate">
                            {item.nombre}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-neutral-100 text-neutral-600">
                            {item.categoria}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {isControlled ? (
                            <>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black uppercase ${
                                isDepleted 
                                  ? 'bg-red-600 text-white' 
                                  : isLow 
                                  ? 'bg-amber-500 text-white' 
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {isDepleted ? '0 ' + unit + ' (AGOTADO)' : `${stock} ${unit}`}
                              </span>

                              <span className="text-xs text-neutral-500">
                                Mínimo alerta: <strong className="text-neutral-700">{minStock} {unit}</strong>
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-neutral-400 italic">
                              Sin control de existencias configurado
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stock Adjustment Controls */}
                    {isControlled ? (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {/* Botones de incremento rápido */}
                        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl border border-neutral-200">
                          <button
                            type="button"
                            disabled={isBusy || stock <= 0}
                            onClick={() => handleAdjust(item, -1)}
                            className="w-7 h-7 rounded-lg bg-white hover:bg-neutral-50 text-neutral-700 font-black text-xs flex items-center justify-center border border-neutral-200 transition active:scale-95 disabled:opacity-40"
                            title="Restar 1"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleAdjust(item, 1)}
                            className="px-2 h-7 rounded-lg bg-white hover:bg-neutral-50 text-neutral-700 font-black text-xs flex items-center justify-center border border-neutral-200 transition active:scale-95 disabled:opacity-40"
                            title="Sumar 1"
                          >
                            +1
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleAdjust(item, 5)}
                            className="px-2 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center border border-emerald-300 transition active:scale-95 disabled:opacity-40"
                            title="Sumar 5"
                          >
                            +5
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleAdjust(item, 10)}
                            className="px-2 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center transition active:scale-95 disabled:opacity-40 shadow-2xs"
                            title="Sumar 10"
                          >
                            +10
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleAdjust(item, 20)}
                            className="px-2 h-7 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center justify-center transition active:scale-95 disabled:opacity-40 shadow-2xs"
                            title="Sumar 20"
                          >
                            +20
                          </button>
                        </div>

                        {/* Input numérico directo */}
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            placeholder={String(stock)}
                            value={customInputVal}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTempStockInputs(prev => ({ ...prev, [item.id]: val }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleManualStockSave(item);
                            }}
                            className="w-16 px-2 py-1.5 text-xs font-bold text-center bg-white border border-neutral-300 rounded-xl focus:border-amber-500 outline-none"
                          />
                          {customInputVal !== '' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleManualStockSave(item)}
                              className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 transition shadow-xs"
                              title="Guardar valor exacto"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Fijar</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleEnableControl(item)}
                          className="px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-black text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Activar Control de Stock (20 u.)</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-neutral-200 flex items-center justify-between">
          <div className="text-xs text-neutral-500">
            Los cambios se guardan de forma instantánea en la base de datos de GastroSmart.
          </div>
          <button
            type="button"
            onClick={() => { sounds.playKeypadClick(); onClose(); }}
            className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-black text-white font-black text-xs transition active:scale-95 shadow-xs"
          >
            Listo / Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
