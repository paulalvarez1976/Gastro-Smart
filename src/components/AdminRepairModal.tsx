import React, { useState, useMemo } from 'react';
import { Order, OrderStatus } from '../types';
import { cambiarEstadoPedido } from '../services/dataService';
import { sounds } from '../utils/sound';
import confetti from 'canvas-confetti';
import { 
  Wrench, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  X, 
  RefreshCw, 
  ChefHat, 
  Flame, 
  CheckCheck, 
  DollarSign, 
  XCircle,
  HelpCircle,
  Sparkles,
  Search,
  Filter
} from 'lucide-react';

interface AdminRepairModalProps {
  orders: Order[];
  isOpen: boolean;
  onClose: () => void;
  adminName: string;
}

export const AdminRepairModal: React.FC<AdminRepairModalProps> = ({
  orders,
  isOpen,
  onClose,
  adminName
}) => {
  const [filterMode, setFilterMode] = useState<'inconsistent' | 'all'>('inconsistent');
  const [searchTerm, setSearchTerm] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Identificar pedidos con estados anómalos o imposibles
  const analyzedOrders = useMemo(() => {
    return orders.map(order => {
      const timeline = order.timeline || [];
      const hasAcceptedEvent = timeline.some(t => t.estado === 'aceptado');
      const hasCookingEvent = timeline.some(t => t.estado === 'en_preparacion');
      const hasReadyEvent = timeline.some(t => t.estado === 'listo');
      const hasKitchenItems = (order.items || []).some(it => it.requiereCocina !== false);

      const issues: string[] = [];

      // Caso 1: Creado directo como "listo" sin pasar por aceptado/preparación en cocina
      if (order.estado === 'listo' && !hasAcceptedEvent && !hasCookingEvent && hasKitchenItems) {
        issues.push('Creado directamente como "Listo" sin pasar por "Aceptado" ni "En preparación".');
      }

      // Caso 2: En "entregado" o "cobrado" sin evento previo de "listo"
      if ((order.estado === 'entregado' || order.estado === 'cobrado') && !hasReadyEvent && hasKitchenItems) {
        issues.push('Entregado o cobrado sin registro de haber estado listo en cocina.');
      }

      // Caso 3: En preparación sin evento de aceptado
      if (order.estado === 'en_preparacion' && !hasAcceptedEvent) {
        issues.push('En preparación sin evento de aceptación.');
      }

      const isInconsistent = issues.length > 0;

      return {
        ...order,
        isInconsistent,
        issues
      };
    });
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return analyzedOrders.filter(order => {
      if (filterMode === 'inconsistent' && !order.isInconsistent) {
        return false;
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const mesaStr = order.mesaNumero ? `mesa ${order.mesaNumero}` : '';
        const clientStr = order.clienteNombre?.toLowerCase() || '';
        const meseroStr = order.meseroNombre?.toLowerCase() || '';
        const idStr = order.id.toLowerCase();
        if (!mesaStr.includes(query) && !clientStr.includes(query) && !meseroStr.includes(query) && !idStr.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [analyzedOrders, filterMode, searchTerm]);

  const inconsistentCount = analyzedOrders.filter(o => o.isInconsistent).length;

  // Reparar un pedido manualmente
  const handleRepairOrder = async (orderId: string, targetState: OrderStatus) => {
    setProcessingId(orderId);
    sounds.playKeypadClick();
    try {
      await cambiarEstadoPedido(orderId, targetState, adminName || 'Administrador', {
        esAdmin: true,
        forzarAdmin: true,
        motivo: `Reparación administrativa de estado: recolocado en ${targetState}`
      });
      setSuccessMsg(`Pedido actualizado a "${targetState}".`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (e: any) {
      console.error('Error al reparar pedido:', e);
    } finally {
      setProcessingId(null);
    }
  };

  // Reparar todos los inconsistentes a "pendiente_cocina"
  const handleBatchRepairToKitchen = async () => {
    const targets = analyzedOrders.filter(o => o.isInconsistent && o.estado !== 'cobrado');
    if (targets.length === 0) return;

    sounds.playCashRegister();
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });

    for (const ord of targets) {
      try {
        await cambiarEstadoPedido(ord.id, 'pendiente_cocina', adminName || 'Administrador', {
          esAdmin: true,
          forzarAdmin: true,
          motivo: 'Reparación masiva a "pendiente_cocina"'
        });
      } catch (e) {
        console.error('Error batch repair:', e);
      }
    }

    setSuccessMsg(`Se han reparado ${targets.length} pedidos y recolocado en "Pendiente Cocina".`);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 animate-in fade-in duration-150">
      <div className="bg-white border border-neutral-200 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-purple-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-800 border border-purple-700 flex items-center justify-center text-purple-200">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg flex items-center gap-2">
                Reparar Pedidos Atascados e Inconsistencias
                {inconsistentCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-black animate-pulse">
                    {inconsistentCount} detectado(s)
                  </span>
                )}
              </h3>
              <p className="text-xs text-purple-200">
                Herramienta exclusiva de Administrador para diagnosticar y corregir estados de comandas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-purple-800 hover:bg-purple-700 text-purple-200 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action & Filter Bar */}
        <div className="p-3 sm:p-4 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3">
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por mesa, cliente, id..."
                className="pl-9 pr-3 py-1.5 rounded-xl border border-neutral-200 bg-white text-xs font-medium focus:ring-2 focus:ring-purple-500 outline-none w-48 sm:w-60"
              />
            </div>

            <div className="flex bg-neutral-200/80 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setFilterMode('inconsistent')}
                className={`px-3 py-1 rounded-lg transition ${
                  filterMode === 'inconsistent' 
                    ? 'bg-white text-purple-900 shadow-xs' 
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Inconsistentes ({inconsistentCount})
              </button>
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1 rounded-lg transition ${
                  filterMode === 'all' 
                    ? 'bg-white text-purple-900 shadow-xs' 
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Todos los pedidos ({analyzedOrders.length})
              </button>
            </div>
          </div>

          {inconsistentCount > 0 && (
            <button
              onClick={handleBatchRepairToKitchen}
              className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition shadow-sm flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 text-yellow-300" />
              <span>Restablecer Inconsistentes a "Pendiente Cocina"</span>
            </button>
          )}

        </div>

        {/* Feedback Message */}
        {successMsg && (
          <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 px-4 py-2 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* List of Orders */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-neutral-100">
          {filteredOrders.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center text-neutral-500 bg-white rounded-2xl border border-neutral-200">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2" />
              <p className="font-bold text-sm text-neutral-800">No se detectaron pedidos con estados inconsistentes</p>
              <p className="text-xs text-neutral-500 mt-1">Todos los pedidos cumplen las transiciones legales de la máquina de estados.</p>
            </div>
          ) : (
            filteredOrders.map(order => {
              const isProcessing = processingId === order.id;

              return (
                <div
                  key={order.id}
                  className={`p-4 bg-white rounded-2xl border transition shadow-xs ${
                    order.isInconsistent ? 'border-red-300 ring-1 ring-red-400/30' : 'border-neutral-200'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-neutral-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-neutral-900">
                          {order.tipo === 'local' ? `Mesa #${order.mesaNumero}` : `Delivery (${order.empresaDelivery || 'General'})`}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          order.estado === 'pendiente_cocina'
                            ? 'bg-orange-100 text-orange-800'
                            : order.estado === 'aceptado'
                              ? 'bg-blue-100 text-blue-800'
                              : order.estado === 'en_preparacion'
                                ? 'bg-amber-100 text-amber-800'
                                : order.estado === 'listo'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : order.estado === 'entregado'
                                    ? 'bg-teal-100 text-teal-800'
                                    : order.estado === 'cobrado'
                                      ? 'bg-purple-100 text-purple-800'
                                      : 'bg-red-100 text-red-800'
                        }`}>
                          Estado actual: {order.estado}
                        </span>
                        <span className="text-xs text-neutral-400 font-mono">
                          #{order.id.slice(-6)}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        Mesero: <strong>{order.meseroNombre || 'N/A'}</strong> • Total: <strong>${(order.total || 0).toLocaleString()}</strong> • Creado: {new Date(order.creadoEn || Date.now()).toLocaleTimeString()}
                      </div>
                    </div>

                    {/* Inconsistency Warning */}
                    {order.isInconsistent && (
                      <div className="px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                        <div>
                          {order.issues.map((iss, i) => (
                            <div key={i}>{iss}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Items list & Timeline history */}
                  <div className="py-2.5 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-neutral-600">
                    <div>
                      <strong className="text-neutral-800 block mb-1">Platos en comanda:</strong>
                      <div className="space-y-0.5">
                        {(order.items || []).map((it, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span>{it.cantidad}x {it.nombre}</span>
                            <span className="text-neutral-400 font-mono">${(it.precio * it.cantidad).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <strong className="text-neutral-800 block mb-1">Historial de eventos (Timeline):</strong>
                      <div className="space-y-1 max-h-20 overflow-y-auto pr-1">
                        {(order.timeline || []).map((ev, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                            <span className="font-bold text-neutral-700">{ev.estado}</span>
                            <span>• {ev.usuario || 'Sistema'}</span>
                            <span className="text-neutral-400 font-mono">({new Date(ev.fecha).toLocaleTimeString()})</span>
                            {ev.motivo && <span className="text-red-500 italic">[{ev.motivo}]</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Admin State Re-assignment Actions */}
                  <div className="pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-neutral-700">
                      Recolocar forzosamente en estado:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { state: 'pendiente_cocina', label: 'Pendiente Cocina', icon: ChefHat, color: 'hover:bg-orange-600 hover:text-white' },
                        { state: 'aceptado', label: 'Aceptado', icon: CheckCircle2, color: 'hover:bg-blue-600 hover:text-white' },
                        { state: 'en_preparacion', label: 'En Prep.', icon: Flame, color: 'hover:bg-amber-600 hover:text-white' },
                        { state: 'listo', label: 'Listo', icon: CheckCheck, color: 'hover:bg-emerald-600 hover:text-white' },
                        { state: 'entregado', label: 'Entregado', icon: CheckCheck, color: 'hover:bg-teal-600 hover:text-white' },
                        { state: 'cobrado', label: 'Cobrado', icon: DollarSign, color: 'hover:bg-purple-600 hover:text-white' },
                        { state: 'rechazado', label: 'Rechazado', icon: XCircle, color: 'hover:bg-red-600 hover:text-white' }
                      ].map(action => {
                        const Icon = action.icon;
                        const isCurrent = order.estado === action.state;
                        return (
                          <button
                            key={action.state}
                            disabled={isProcessing || isCurrent}
                            onClick={() => handleRepairOrder(order.id, action.state as OrderStatus)}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition flex items-center gap-1 ${
                              isCurrent 
                                ? 'bg-neutral-200 text-neutral-400 border-neutral-200 cursor-default' 
                                : `bg-white text-neutral-700 border-neutral-200 ${action.color}`
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{action.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
          <div className="text-xs text-neutral-500">
            Los cambios administrativos actualizan el timeline y sincronizan la base de datos en tiempo real.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs transition"
          >
            Cerrar Ventana
          </button>
        </div>

      </div>
    </div>
  );
};
