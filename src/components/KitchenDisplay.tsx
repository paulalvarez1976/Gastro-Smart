import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Order, OrderStatus } from '../types';
import { updateOrderStatus } from '../services/dataService';
import { sounds } from '../utils/sound';
import { 
  Flame, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Volume2, 
  VolumeX, 
  ChefHat, 
  Utensils, 
  Bike,
  Sparkles,
  Info
} from 'lucide-react';

interface KitchenDisplayProps {
  orders: Order[];
}

export const KitchenDisplay: React.FC<KitchenDisplayProps> = ({ orders }) => {
  const { currentEmployee, currentRestaurant } = useAuth();
  
  // Kitchen state
  const [rejectModalOrder, setRejectModalOrder] = useState<Order | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Rastreo de pedidos previos para disparar sonido de nuevo pedido
  const prevPendingIdsRef = useRef<Set<string>>(new Set());

  // Mantener reloj de cocina actualizado cada segundo para cronómetros de preparación
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Filtrar pedidos relevantes para la cocina del restaurante actual
  // Estados de cocina: pendiente_cocina, en_preparacion, y listo reciente (para visualización)
  const kitchenOrders = orders.filter(
    o => o.restaurantId === currentRestaurant?.id && 
         ['pendiente_cocina', 'en_preparacion', 'listo'].includes(o.estado)
  );

  // Detección y alarma sonora continua para pedidos entrantes pendientes de recibir
  useEffect(() => {
    const pendingOrders = kitchenOrders.filter(o => o.estado === 'pendiente_cocina');
    
    if (pendingOrders.length > 0 && audioEnabled) {
      // Iniciar alarma sonora continua en bucle que suena hasta que el cocinero acepte/reciba la comanda
      sounds.startRepeatingAlarm('kitchen-pending-orders', 'kitchen', 3600);
    } else {
      sounds.stopRepeatingAlarm('kitchen-pending-orders');
    }

    return () => {
      sounds.stopRepeatingAlarm('kitchen-pending-orders');
    };
  }, [kitchenOrders, audioEnabled]);

  // Aceptar / Recibir comanda individual -> pasa a "en_preparacion"
  const handleAcceptOrder = async (order: Order) => {
    sounds.playKeypadClick();
    await updateOrderStatus(
      order.id, 
      'en_preparacion', 
      currentEmployee?.nombre || 'Chef de Cocina',
      { timeline: order.timeline || [] }
    );
  };

  // Recibir todas las comandas pendientes a la vez
  const handleAcceptAllPending = async () => {
    sounds.playCashRegister();
    const pending = kitchenOrders.filter(o => o.estado === 'pendiente_cocina');
    for (const ord of pending) {
      await updateOrderStatus(
        ord.id,
        'en_preparacion',
        currentEmployee?.nombre || 'Chef de Cocina',
        { timeline: ord.timeline || [] }
      );
    }
  };

  // Marcar pedido como "listo" -> pasa a listo y genera sonido de alerta para mesero
  const handleReadyOrder = async (order: Order) => {
    sounds.playOrderReady();
    await updateOrderStatus(
      order.id, 
      'listo', 
      currentEmployee?.nombre || 'Chef de Cocina',
      { timeline: order.timeline || [] }
    );
  };

  // Rechazar pedido con motivo
  const handleConfirmReject = async () => {
    if (!rejectModalOrder || !rejectReason.trim()) return;

    sounds.playAlertWarning();
    await updateOrderStatus(
      rejectModalOrder.id,
      'rechazado',
      currentEmployee?.nombre || 'Chef de Cocina',
      { 
        timeline: rejectModalOrder.timeline || [],
        motivoRechazo: rejectReason.trim()
      }
    );

    setRejectModalOrder(null);
    setRejectReason('');
  };

  // Calcular tiempo transcurrido en minutos
  const getElapsedMinutes = (dateString?: string) => {
    if (!dateString) return 0;
    const start = new Date(dateString).getTime();
    return Math.floor((currentTime - start) / 60000);
  };

  const formatElapsedTime = (dateString?: string) => {
    if (!dateString) return '00:00';
    const start = new Date(dateString).getTime();
    const diffSec = Math.max(0, Math.floor((currentTime - start) / 1000));
    const m = Math.floor(diffSec / 60);
    const s = diffSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-65px)] bg-neutral-950 text-neutral-100 overflow-hidden select-none">
      
      {/* Kitchen Bar Header (Kiosk mode Dark) */}
      <div className="bg-neutral-900 border-b border-neutral-800 px-4 sm:px-6 py-3 flex items-center justify-between shadow-md">
        
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-600/20 text-orange-500 border border-orange-500/30 flex items-center justify-center">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-black text-base sm:text-lg text-white tracking-tight flex items-center gap-2">
              KDS Cocina Kiosko 
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                Siempre Activa
              </span>
            </h2>
            <p className="text-xs text-neutral-400">
              {currentRestaurant?.nombre} • Visualización táctil en vivo
            </p>
          </div>
        </div>

        {/* Status Counters & Audio Toggle */}
        <div className="flex items-center gap-2 sm:gap-4">
          
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
              Pendientes: {kitchenOrders.filter(o => o.estado === 'pendiente_cocina').length}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
              En Prep: {kitchenOrders.filter(o => o.estado === 'en_preparacion').length}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
              Listos: {kitchenOrders.filter(o => o.estado === 'listo').length}
            </span>
          </div>

          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`p-2.5 rounded-xl border transition flex items-center gap-1.5 text-xs font-bold ${
              audioEnabled 
                ? 'bg-neutral-800 text-neutral-200 border-neutral-700 hover:bg-neutral-700' 
                : 'bg-red-950 text-red-400 border-red-800'
            }`}
            title="Activar/Desactivar sonido"
          >
            {audioEnabled ? <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" /> : <VolumeX className="w-4 h-4 text-red-400" />}
            <span className="hidden sm:inline">{audioEnabled ? 'Sonido ON' : 'Silencio'}</span>
          </button>
        </div>

      </div>

      {/* Top Banner de Alerta Continua para Comandas Pendientes de Recibir */}
      {kitchenOrders.some(o => o.estado === 'pendiente_cocina') && (
        <div className="bg-orange-600/95 border-b border-orange-500 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-lg animate-pulse">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-black/20 text-yellow-300 text-base">🚨</span>
            <div>
              <span className="font-extrabold text-sm tracking-tight">
                ¡{kitchenOrders.filter(o => o.estado === 'pendiente_cocina').length} comanda(s) nueva(s) sin recibir!
              </span>
              <span className="text-xs text-orange-100 ml-2 hidden sm:inline">
                (Emitiendo sonido continuo hasta confirmar "Recibido")
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAcceptAllPending}
            className="px-4 py-1.5 bg-white text-orange-900 hover:bg-orange-50 rounded-xl font-black text-xs transition shadow-md flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4 text-orange-600" />
            <span>RECIBIR TODAS LAS COMANDAS</span>
          </button>
        </div>
      )}

      {/* Main KDS Orders Stream */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-4">
        {kitchenOrders.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center text-neutral-600">
            <ChefHat className="w-16 h-16 stroke-1 text-neutral-700 mb-3 animate-pulse" />
            <p className="text-base font-bold text-neutral-400">Cocina al día. No hay comandas pendientes.</p>
            <p className="text-xs text-neutral-600 mt-1">Los pedidos ingresados por los meseros aparecerán aquí al instante con sonido.</p>
          </div>
        ) : (
          kitchenOrders.map(order => {
            const isPending = order.estado === 'pendiente_cocina';
            const isCooking = order.estado === 'en_preparacion';
            const isReady = order.estado === 'listo';

            // Cronómetro y alerta >15 min
            const elapsedMins = getElapsedMinutes(order.aceptadoEn || order.creadoEn);
            const isDelayed = elapsedMins >= 15 && !isReady;

            return (
              <div
                key={order.id}
                className={`w-80 sm:w-96 rounded-2xl flex flex-col shrink-0 overflow-hidden shadow-2xl transition-all border ${
                  isPending 
                    ? 'bg-neutral-900 border-orange-500 shadow-orange-500/10' 
                    : isCooking 
                      ? isDelayed 
                        ? 'bg-neutral-900 border-red-500 shadow-red-500/20 animate-pulse' 
                        : 'bg-neutral-900 border-blue-500 shadow-blue-500/10'
                      : 'bg-neutral-900/80 border-emerald-500/50 opacity-80'
                }`}
              >
                {/* Header Comanda */}
                <div className={`p-3.5 flex items-center justify-between ${
                  isPending 
                    ? 'bg-orange-600 text-white' 
                    : isCooking 
                      ? isDelayed 
                        ? 'bg-red-600 text-white' 
                        : 'bg-blue-600 text-white'
                      : 'bg-emerald-700 text-white'
                }`}>
                  <div className="flex items-center gap-2">
                    {order.tipo === 'local' ? (
                      <div className="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center font-black text-sm">
                        M{order.mesaNumero}
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center">
                        <Bike className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <div className="font-black text-sm tracking-tight leading-tight">
                        {order.tipo === 'local' ? `Mesa #${order.mesaNumero}` : `Delivery (${order.empresaDelivery || 'General'})`}
                      </div>
                      <div className="text-[11px] opacity-90">
                        Mesero: {order.meseroNombre || 'Sin asignar'}
                      </div>
                    </div>
                  </div>

                  {/* Stopwatch Badge */}
                  <div className="text-right">
                    <div className="text-xs font-mono font-black flex items-center justify-end gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatElapsedTime(order.aceptadoEn || order.creadoEn)}</span>
                    </div>
                    {isDelayed && (
                      <div className="text-[10px] uppercase font-black tracking-wider text-yellow-300 flex items-center gap-0.5 justify-end">
                        <AlertTriangle className="w-3 h-3" /> +15 MIN DEMORA
                      </div>
                    )}
                  </div>
                </div>

                {/* Body: Items list with big text */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-neutral-900/90 divide-y divide-neutral-800/80">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="pt-2.5 first:pt-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-lg bg-neutral-800 text-amber-400 font-black text-sm flex items-center justify-center border border-neutral-700 shrink-0">
                            {item.cantidad}
                          </span>
                          {(item.fotoUrl || item.imagenUrl) ? (
                            <img
                              src={item.fotoUrl || item.imagenUrl || ''}
                              alt={item.nombre}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-lg object-cover border border-neutral-700 shrink-0 shadow-xs"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-neutral-850 border border-neutral-800 flex items-center justify-center text-neutral-600 shrink-0">
                              <Utensils className="w-4 h-4" />
                            </div>
                          )}
                          <span className="font-bold text-sm sm:text-base text-neutral-100 leading-snug">
                            {item.nombre}
                          </span>
                        </div>
                      </div>

                      {/* Custom cook note */}
                      {item.notas && (
                        <div className="mt-1.5 ml-9 text-xs font-semibold text-orange-400 bg-orange-950/40 px-2.5 py-1 rounded-lg border border-orange-900/50">
                          ⚠️ Nota: {item.notas}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Footer Controls (Mínimo 56px de alto táctil) */}
                <div className="p-3 bg-neutral-950 border-t border-neutral-800">
                  {isPending && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRejectModalOrder(order)}
                        className="min-h-[56px] rounded-xl bg-neutral-800 hover:bg-red-950 text-neutral-300 hover:text-red-400 font-bold text-xs transition border border-neutral-700 flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-5 h-5 text-red-500" />
                        Rechazar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAcceptOrder(order)}
                        className="min-h-[56px] rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs transition flex flex-col items-center justify-center gap-0.5 shadow-md shadow-orange-600/30 active:scale-98 animate-pulse"
                      >
                        <div className="flex items-center gap-1.5">
                          <Flame className="w-4 h-4" />
                          <span>RECIBIR COMANDA</span>
                        </div>
                        <span className="text-[10px] text-orange-200 font-normal">
                          (Confirmar recibido)
                        </span>
                      </button>
                    </div>
                  )}

                  {isCooking && (
                    <button
                      type="button"
                      onClick={() => handleReadyOrder(order)}
                      className="w-full min-h-[56px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm tracking-wide transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 active:scale-98"
                    >
                      <CheckCircle2 className="w-6 h-6" />
                      MARCAR LISTO (NOTIFICAR MESERO)
                    </button>
                  )}

                  {isReady && (
                    <div className="min-h-[56px] rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-400 font-bold text-xs flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      Listo en mesa / Esperando retiro
                    </div>
                  )}
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Modal: Rechazar comanda con motivo obligatorio */}
      {rejectModalOrder && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-white">
            
            <div className="flex items-center gap-3 pb-2 border-b border-neutral-800">
              <div className="w-10 h-10 rounded-xl bg-red-950 text-red-400 flex items-center justify-center border border-red-800">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base">Rechazar Pedido</h3>
                <p className="text-xs text-neutral-400">
                  Se notificará inmediatamente al mesero ({rejectModalOrder.meseroNombre})
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-2">
                Motivo del rechazo:
              </label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {['Insumo agotado', 'Cocina saturada', 'Error de comanda', 'Plato no disponible'].map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setRejectReason(sug)}
                    className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-left border border-neutral-700 transition"
                  >
                    {sug}
                  </button>
                ))}
              </div>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Escribe el motivo detallado..."
                rows={3}
                className="w-full text-xs p-3 rounded-xl bg-neutral-950 border border-neutral-700 text-white focus:ring-2 focus:ring-red-500 outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalOrder(null)}
                className="h-12 rounded-xl bg-neutral-800 hover:bg-neutral-700 font-bold text-xs text-neutral-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim()}
                onClick={handleConfirmReject}
                className="h-12 rounded-xl bg-red-600 hover:bg-red-700 font-bold text-xs text-white disabled:opacity-40"
              >
                Confirmar Rechazo
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
