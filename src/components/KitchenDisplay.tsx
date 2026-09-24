import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Order, OrderRound, OrderItem, ItemStatus } from '../types';
import { cambiarEstadoPedido, updateOrderRoundStatus, updateOrderItemStatus } from '../services/dataService';
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
  Columns3,
  BellRing,
  PackageCheck,
  ChevronDown,
  ChevronUp,
  Layers,
  Check,
  Printer,
  Sliders
} from 'lucide-react';
import { ThermalReceiptModal } from './ThermalReceiptModal';
import { KitchenNotificationModal, KitchenNotificationConfig, DEFAULT_KITCHEN_NOTIFICATIONS } from './KitchenNotificationModal';
import { haptics } from '../utils/haptics';

const KITCHEN_NOTIF_STORAGE_KEY = 'gastro_kitchen_notifications_config';

const getInitialKitchenConfig = (): KitchenNotificationConfig => {
  try {
    const saved = localStorage.getItem(KITCHEN_NOTIF_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_KITCHEN_NOTIFICATIONS, ...JSON.parse(saved) };
    }
  } catch (err) {
    console.warn('Error loading kitchen notification settings:', err);
  }
  return DEFAULT_KITCHEN_NOTIFICATIONS;
};

interface KitchenDisplayProps {
  orders: Order[];
}

interface KitchenRoundCardData {
  order: Order;
  roundNumber: number;
  roundRecord?: OrderRound;
  roundStatus: 'pendiente_cocina' | 'aceptado' | 'en_preparacion' | 'listo' | 'entregado';
  roundItems: OrderItem[];
  allTableItems: OrderItem[];
  previousRounds: { roundNumber: number; items: OrderItem[]; status: string }[];
  enviadoEn: string;
  listoEn?: string;
  aceptadoEn?: string;
  enPreparacionEn?: string;
}

export const KitchenDisplay: React.FC<KitchenDisplayProps> = ({ orders }) => {
  const { currentEmployee, currentRestaurant } = useAuth();
  
  // Kitchen state & Notification settings
  const [rejectModalOrder, setRejectModalOrder] = useState<Order | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [notifConfig, setNotifConfig] = useState<KitchenNotificationConfig>(getInitialKitchenConfig);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [activeQueueTab, setActiveQueueTab] = useState<'all' | 'nuevos' | 'preparacion' | 'recojo'>('all');
  const [visualNotice, setVisualNotice] = useState<{ id: string; title: string; text: string } | null>(null);
  const [expandedTableOrders, setExpandedTableOrders] = useState<Record<string, boolean>>({});
  const [comandaToPrint, setComandaToPrint] = useState<{ order: Order; roundNumber: number; items: OrderItem[] } | null>(null);

  const audioEnabled = notifConfig.soundEnabled;

  const handleToggleAudio = () => {
    const updated = { ...notifConfig, soundEnabled: !notifConfig.soundEnabled };
    setNotifConfig(updated);
    try {
      localStorage.setItem(KITCHEN_NOTIF_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {}
  };

  const handleSaveNotifConfig = (updated: KitchenNotificationConfig) => {
    setNotifConfig(updated);
    try {
      localStorage.setItem(KITCHEN_NOTIF_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {}
    setVisualNotice({
      id: 'settings-saved',
      title: 'Configuración guardada',
      text: 'Las preferencias de alertas sonoras y visuales se aplicaron correctamente.'
    });
    setTimeout(() => setVisualNotice(null), 3000);
  };

  const handleTestSound = (tone: 'campana' | 'buzzer' | 'chime' | 'sirena', volume: number) => {
    sounds.playKitchenCustom(tone, volume);
  };

  // Mantener reloj de cocina actualizado cada segundo para cronómetros
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleExpandTable = (cardKey: string) => {
    sounds.playKeypadClick();
    setExpandedTableOrders(prev => ({
      ...prev,
      [cardKey]: !prev[cardKey]
    }));
  };

  // Descomponer comandas en RONDAS activas para la cocina del restaurante actual
  const kitchenRoundCards = useMemo<KitchenRoundCardData[]>(() => {
    // Si el restaurante está configurado sin cocina, no genera tarjetas para el KDS
    if (currentRestaurant?.usaCocina === false) {
      return [];
    }

    const cards: KitchenRoundCardData[] = [];

    const activeOrders = orders.filter(
      o => o.restaurantId === currentRestaurant?.id && 
           o.estado !== 'cobrado' &&
           o.estado !== 'rechazado' &&
           o.ruta !== 'express' &&
           (o.items || []).some(it => it.requiereCocina !== false)
    );

    activeOrders.forEach(order => {
      const allKitchenItems = (order.items || []).filter(it => it.requiereCocina !== false);
      if (allKitchenItems.length === 0) return;

      // Si el pedido tiene rondas registradas
      if (order.rondas && order.rondas.length > 0) {
        order.rondas.forEach(round => {
          const roundItems = (order.items || []).filter(
            it => (it.ronda || 1) === round.numero && it.requiereCocina !== false
          );

          if (roundItems.length === 0) return;

          // Determinar estado de la ronda:
          // Si todos los items de la ronda fueron entregados/cobrados, la ronda ya no está en cocina
          const hasPending = roundItems.some(i => i.estado === 'pendiente_cocina' || (!i.estado && round.estado === 'pendiente_cocina'));
          const hasPrep = roundItems.some(i => i.estado === 'aceptado' || i.estado === 'en_preparacion' || (!i.estado && (round.estado === 'aceptado' || round.estado === 'en_preparacion')));
          const hasReady = roundItems.some(i => i.estado === 'listo' || (!i.estado && round.estado === 'listo'));

          let computedStatus: 'pendiente_cocina' | 'aceptado' | 'en_preparacion' | 'listo' | 'entregado' = round.estado;
          if (hasPending) computedStatus = 'pendiente_cocina';
          else if (hasPrep) computedStatus = roundItems.some(i => i.estado === 'en_preparacion') ? 'en_preparacion' : 'aceptado';
          else if (hasReady) computedStatus = 'listo';
          else computedStatus = 'entregado';

          // Mostrar en KDS si no está entregado
          if (computedStatus !== 'entregado') {
            // Recopilar rondas anteriores para el desplegable "Ver mesa completa"
            const previousRounds = (order.rondas || [])
              .filter(r => r.numero < round.numero)
              .map(r => ({
                roundNumber: r.numero,
                items: (order.items || []).filter(it => (it.ronda || 1) === r.numero),
                status: r.estado
              }));

            cards.push({
              order,
              roundNumber: round.numero,
              roundRecord: round,
              roundStatus: computedStatus,
              roundItems,
              allTableItems: order.items || [],
              previousRounds,
              enviadoEn: round.enviadoEn || order.creadoEn,
              aceptadoEn: round.aceptadoEn || order.aceptadoEn,
              enPreparacionEn: round.enPreparacionEn || order.enPreparacionEn,
              listoEn: round.listoEn || order.listoEn
            });
          }
        });
      } else {
        // Pedido legacy sin array de rondas -> Tratar como Ronda 1
        if (['pendiente_cocina', 'aceptado', 'en_preparacion', 'listo'].includes(order.estado)) {
          cards.push({
            order,
            roundNumber: 1,
            roundStatus: order.estado as any,
            roundItems: allKitchenItems,
            allTableItems: order.items || [],
            previousRounds: [],
            enviadoEn: order.creadoEn,
            aceptadoEn: order.aceptadoEn,
            enPreparacionEn: order.enPreparacionEn,
            listoEn: order.listoEn
          });
        }
      }
    });

    return cards;
  }, [orders, currentRestaurant?.id]);

  // Clasificación estricta de las 3 columnas de cocina
  const nuevosCards = useMemo(() => kitchenRoundCards.filter(c => c.roundStatus === 'pendiente_cocina'), [kitchenRoundCards]);
  const prepCards = useMemo(() => kitchenRoundCards.filter(c => c.roundStatus === 'aceptado' || c.roundStatus === 'en_preparacion'), [kitchenRoundCards]);
  const recojoCards = useMemo(() => kitchenRoundCards.filter(c => c.roundStatus === 'listo'), [kitchenRoundCards]);

  // Alarma sonora y háptica para pedidos/rondas entrantes pendientes de recibir (pendiente_cocina)
  useEffect(() => {
    if (nuevosCards.length > 0 && notifConfig.soundEnabled) {
      // Vibración háptica en dispositivos táctiles si está activada
      if (notifConfig.vibration && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([160, 90, 160]);
        } catch (e) {}
      }

      if (notifConfig.alarmMode === 'continuous') {
        const intervalMs = Math.max(2000, (notifConfig.repeatIntervalSeconds || 4) * 1000);
        sounds.startRepeatingAlarm(
          'kitchen-pending-orders',
          'kitchen',
          intervalMs,
          () => sounds.playKitchenCustom(notifConfig.tone, notifConfig.volume)
        );
      } else {
        // Modo 'once': suena una sola vez al entrar nuevos pedidos
        sounds.playKitchenCustom(notifConfig.tone, notifConfig.volume);
      }
    } else {
      sounds.stopRepeatingAlarm('kitchen-pending-orders');
    }

    return () => {
      sounds.stopRepeatingAlarm('kitchen-pending-orders');
    };
  }, [
    nuevosCards.length, 
    notifConfig.soundEnabled, 
    notifConfig.alarmMode, 
    notifConfig.tone, 
    notifConfig.volume, 
    notifConfig.repeatIntervalSeconds,
    notifConfig.vibration
  ]);

  // 1. ACEPTAR RONDA: pendiente_cocina → aceptado
  const handleAcceptRound = async (card: KitchenRoundCardData) => {
    sounds.playKeypadClick();
    haptics.impactMedium();
    try {
      if (card.order.rondas && card.order.rondas.length > 0) {
        await updateOrderRoundStatus(
          card.order.id,
          card.roundNumber,
          'aceptado',
          currentEmployee?.nombre || 'Chef de Cocina'
        );
      } else {
        await cambiarEstadoPedido(
          card.order.id, 
          'aceptado', 
          currentEmployee?.nombre || 'Chef de Cocina',
          { timeline: card.order.timeline || [] }
        );
      }
      setVisualNotice({
        id: `${card.order.id}-${card.roundNumber}`,
        title: '¡Ronda Aceptada!',
        text: `${card.order.tipo === 'local' ? `Mesa #${card.order.mesaNumero}` : 'Delivery'} · Ronda ${card.roundNumber} pasada a preparación.`
      });
      setTimeout(() => setVisualNotice(null), 3500);
    } catch (err: any) {
      console.error('Error al aceptar ronda:', err);
    }
  };

  // Aceptar todas las nuevas rondas
  const handleAcceptAllPending = async () => {
    sounds.playKeypadClick();
    haptics.impactHeavy();
    for (const card of nuevosCards) {
      try {
        if (card.order.rondas && card.order.rondas.length > 0) {
          await updateOrderRoundStatus(
            card.order.id,
            card.roundNumber,
            'aceptado',
            currentEmployee?.nombre || 'Chef de Cocina'
          );
        } else {
          await cambiarEstadoPedido(
            card.order.id, 
            'aceptado', 
            currentEmployee?.nombre || 'Chef de Cocina',
            { timeline: card.order.timeline || [] }
          );
        }
      } catch (err: any) {
        console.error('Error batch accept:', err);
      }
    }
    setVisualNotice({
      id: 'batch',
      title: '¡Rondas Recibidas!',
      text: `Se han aceptado ${nuevosCards.length} rondas entrantes.`
    });
    setTimeout(() => setVisualNotice(null), 3500);
  };

  // 2. COMENZAR PREPARACIÓN: aceptado → en_preparacion
  const handleStartRoundPreparation = async (card: KitchenRoundCardData) => {
    sounds.playKeypadClick();
    haptics.impactMedium();
    try {
      if (card.order.rondas && card.order.rondas.length > 0) {
        await updateOrderRoundStatus(
          card.order.id,
          card.roundNumber,
          'en_preparacion',
          currentEmployee?.nombre || 'Chef de Cocina'
        );
      } else {
        await cambiarEstadoPedido(
          card.order.id, 
          'en_preparacion', 
          currentEmployee?.nombre || 'Chef de Cocina',
          { timeline: card.order.timeline || [] }
        );
      }
    } catch (err: any) {
      console.error('Error al iniciar preparación:', err);
    }
  };

  // 3. MARCAR RONDA LISTA: en_preparacion → listo (Alerta sonora simultánea a Mesero y Caja)
  const handleReadyRound = async (card: KitchenRoundCardData) => {
    if (notifConfig.soundEnabled && notifConfig.soundOnReady) {
      sounds.playOrderReady();
    }
    haptics.orderReady();
    try {
      if (card.order.rondas && card.order.rondas.length > 0) {
        await updateOrderRoundStatus(
          card.order.id,
          card.roundNumber,
          'listo',
          currentEmployee?.nombre || 'Chef de Cocina'
        );
      } else {
        await cambiarEstadoPedido(
          card.order.id, 
          'listo', 
          currentEmployee?.nombre || 'Chef de Cocina',
          { timeline: card.order.timeline || [] }
        );
      }
      setVisualNotice({
        id: `${card.order.id}-${card.roundNumber}`,
        title: '¡Ronda Lista para Entrega!',
        text: `Notificación sonora enviada a ${card.order.meseroNombre ? `Mesero (${card.order.meseroNombre})` : 'Caja/Mostrador'} para Mesa #${card.order.mesaNumero} · Ronda ${card.roundNumber}.`
      });
      setTimeout(() => setVisualNotice(null), 3500);
    } catch (err: any) {
      console.error('Error al marcar listo:', err);
    }
  };

  // 4. Toggle item individual
  const handleToggleItemStatus = async (card: KitchenRoundCardData, item: OrderItem, itemIdx: number) => {
    sounds.playKeypadClick();
    haptics.selection();
    const newStatus: ItemStatus = item.estado === 'listo' ? 'en_preparacion' : 'listo';
    try {
      await updateOrderItemStatus(
        card.order.id,
        item.id || itemIdx,
        newStatus,
        currentEmployee?.nombre || 'Chef'
      );
    } catch (e) {
      console.error('Error toggling item:', e);
    }
  };

  // 5. RECHAZAR: pendiente_cocina → rechazado (con motivo obligatorio)
  const handleConfirmReject = async () => {
    if (!rejectModalOrder || !rejectReason.trim()) return;

    sounds.playAlertWarning();
    try {
      await cambiarEstadoPedido(
        rejectModalOrder.id,
        'rechazado',
        currentEmployee?.nombre || 'Chef de Cocina',
        { 
          timeline: rejectModalOrder.timeline || [],
          motivoRechazo: rejectReason.trim()
        }
      );
    } catch (err: any) {
      console.error('Error al rechazar pedido:', err);
    }

    setRejectModalOrder(null);
    setRejectReason('');
  };

  // Cronómetros
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

  // Renderizador de tarjeta de RONDA según su columna en KDS
  const renderRoundCard = (card: KitchenRoundCardData, queue: 'nuevos' | 'preparacion' | 'recojo') => {
    const { order, roundNumber, roundStatus, roundItems, previousRounds, enviadoEn, listoEn, aceptadoEn } = card;
    const cardKey = `${queue}-${order.id}-r${roundNumber}`;
    const isExpanded = !!expandedTableOrders[cardKey];

    const isPending = roundStatus === 'pendiente_cocina';
    const isAccepted = roundStatus === 'aceptado';
    const isCooking = roundStatus === 'en_preparacion';
    const isReady = roundStatus === 'listo';

    // Cronómetros específicos de esta ronda:
    const prepElapsedMins = getElapsedMinutes(aceptadoEn || enviadoEn);
    const overdueThreshold = notifConfig.overdueMinutes || 15;
    const isPrepDelayed = prepElapsedMins >= overdueThreshold && (isAccepted || isCooking);

    // Esperando recojo: tiempo desde que esta ronda se marcó lista
    const readyElapsedMins = getElapsedMinutes(listoEn || enviadoEn);
    const isUncollectedAlert = isReady && readyElapsedMins >= 10;

    const isFlashing = isPending && notifConfig.visualFlashing;
    const pendingBorderClass = isFlashing
      ? (notifConfig.flashSpeed === 'fast' 
          ? 'bg-neutral-900 border-2 border-orange-500 shadow-orange-500/30 ring-2 ring-orange-500/60 animate-pulse'
          : 'bg-neutral-900 border-2 border-orange-500 shadow-orange-500/20 ring-1 ring-orange-500/40 animate-pulse')
      : 'bg-neutral-900 border-orange-500 shadow-orange-500/10 ring-1 ring-orange-500/30';

    const highContrastClass = notifConfig.highContrast ? 'border-2 border-neutral-600' : 'border';

    return (
      <div
        key={cardKey}
        className={`w-full rounded-2xl flex flex-col overflow-hidden shadow-xl transition-all shrink-0 ${highContrastClass} ${
          isPending 
            ? pendingBorderClass
            : isAccepted || isCooking
              ? isPrepDelayed 
                ? 'bg-neutral-900 border-red-500 shadow-red-500/20 animate-pulse' 
                : isCooking
                  ? 'bg-neutral-900 border-blue-500 shadow-blue-500/10'
                  : 'bg-neutral-900 border-sky-500/60 shadow-sky-500/10'
              : isUncollectedAlert
                ? 'bg-neutral-900 border-red-600 ring-2 ring-red-500 shadow-red-600/30 animate-pulse'
                : 'bg-neutral-900/90 border-emerald-500/50'
        }`}
      >
        {/* Header de la Ronda */}
        <div className={`p-3.5 flex items-center justify-between ${
          isPending 
            ? 'bg-orange-600 text-white' 
            : isCooking 
              ? isPrepDelayed 
                ? 'bg-red-600 text-white' 
                : 'bg-blue-600 text-white'
              : isAccepted
                ? 'bg-sky-600 text-white'
                : isUncollectedAlert
                  ? 'bg-red-700 text-white'
                  : 'bg-emerald-700 text-white'
        }`}>
          <div className="flex items-center gap-2">
            {order.tipo === 'local' ? (
              <div className="w-9 h-9 rounded-xl bg-black/25 flex items-center justify-center font-black text-sm border border-white/20">
                M#{order.mesaNumero}
              </div>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-black/25 flex items-center justify-center border border-white/20">
                <Bike className="w-5 h-5" />
              </div>
            )}
            <div>
              <div className="font-black text-sm tracking-tight leading-tight flex items-center gap-2">
                <span>{order.tipo === 'local' ? `Mesa #${order.mesaNumero}` : `Delivery (${order.empresaDelivery || 'General'})`}</span>
                <span className="px-2 py-0.5 rounded-full bg-white/25 text-white font-black text-[11px] uppercase tracking-wider border border-white/30">
                  Ronda {roundNumber}
                </span>
              </div>
              <div className="text-[11px] opacity-90 flex items-center gap-2 mt-0.5">
                <span>{order.meseroNombre ? `Mesero: ${order.meseroNombre}` : 'Mostrador'}</span>
                <span>•</span>
                <span>{roundItems.length} plato(s)</span>
              </div>
            </div>
          </div>

          {/* Stopwatch & Badges */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setComandaToPrint({ order, roundNumber, items: roundItems })}
              title="Imprimir comanda térmica (58mm/80mm / Bluetooth)"
              className="px-2 py-1 rounded-lg bg-black/25 hover:bg-black/40 text-white border border-white/20 transition flex items-center gap-1 text-[10px] font-bold"
            >
              <Printer className="w-3 h-3" />
              <span className="hidden sm:inline">Comanda</span>
            </button>

            <div className="text-right">
              {queue === 'recojo' ? (
                <>
                  <div className="text-xs font-mono font-black flex items-center justify-end gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatElapsedTime(listoEn || enviadoEn)}</span>
                  </div>
                  {isUncollectedAlert ? (
                    <div className="text-[10px] uppercase font-black tracking-wider text-yellow-300 flex items-center gap-0.5 justify-end">
                      <AlertTriangle className="w-3 h-3" /> SIN RECOGER (+10 MIN)
                    </div>
                  ) : (
                    <div className="text-[10px] uppercase font-bold text-emerald-200">
                      Listo en espera
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-xs font-mono font-black flex items-center justify-end gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatElapsedTime(aceptadoEn || enviadoEn)}</span>
                  </div>
                  {isPrepDelayed && (
                    <div className="text-[10px] uppercase font-black tracking-wider text-yellow-300 flex items-center gap-0.5 justify-end">
                      <AlertTriangle className="w-3 h-3" /> +{overdueThreshold} MIN DEMORA
                    </div>
                  )}
                  {isAccepted && (
                    <div className="text-[10px] uppercase font-bold text-sky-100">
                      Aceptado
                    </div>
                  )}
                  {isCooking && (
                    <div className="text-[10px] uppercase font-bold text-blue-100 flex items-center gap-1">
                      <Flame className="w-3 h-3 text-yellow-300 animate-bounce" /> Preparando
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Lista de Platos de ESTA RONDA (Doble Columna para Maximizar Espacio) */}
        <div className="p-3 bg-neutral-900/95 max-h-80 overflow-y-auto">
          <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex items-center justify-between pb-1.5 mb-2 border-b border-neutral-800/80">
            <span>Platos a preparar (Ronda {roundNumber})</span>
            <span className="text-neutral-500 font-mono text-[10px]">Envío: {new Date(enviadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          <div className={roundItems.length >= 2 ? "grid grid-cols-1 sm:grid-cols-2 gap-2" : "space-y-2"}>
            {roundItems.map((item, idx) => {
              const isItemReady = item.estado === 'listo';
              return (
                <div key={item.id || idx} className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800/90 flex flex-col justify-between">
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(card, item, idx)}
                      title="Marcar plato individual como listo/pendiente"
                      className={`w-7 h-7 rounded-lg font-black text-xs sm:text-sm flex items-center justify-center border transition shrink-0 ${
                        isItemReady 
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm' 
                          : 'bg-neutral-800 text-amber-400 border-neutral-700 hover:border-amber-400'
                      }`}
                    >
                      {isItemReady ? <Check className="w-4 h-4 stroke-[3]" /> : `${item.cantidad}x`}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`font-extrabold text-xs sm:text-sm leading-tight ${isItemReady ? 'line-through text-neutral-500' : 'text-neutral-100'}`}>
                        {item.nombre}
                      </div>
                      {item.comensalNombre && (
                        <span className="inline-block text-[10px] font-bold text-purple-300 bg-purple-950/60 px-1.5 py-0.2 rounded border border-purple-800/40 mt-1">
                          Para: {item.comensalNombre} {item.comensalNumero ? `(C${item.comensalNumero})` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {item.notas && (
                    <div className="mt-1.5 text-[11px] font-semibold text-orange-400 bg-orange-950/40 px-2 py-1 rounded-lg border border-orange-900/50">
                      ⚠️ {item.notas}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Desplegable: Ver mesa completa (Rondas anteriores) */}
        {previousRounds.length > 0 && (
          <div className="bg-neutral-950 border-t border-neutral-800/90">
            <button
              type="button"
              onClick={() => toggleExpandTable(cardKey)}
              className="w-full px-3.5 py-2 text-xs font-bold text-neutral-400 hover:text-neutral-200 flex items-center justify-between hover:bg-neutral-900/50 transition"
            >
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-orange-400" />
                <span>Ver mesa completa ({previousRounds.length} ronda(s) anterior(es))</span>
              </div>
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {isExpanded && (
              <div className="p-3 bg-neutral-900/60 border-t border-neutral-800 space-y-2 text-xs">
                {previousRounds.map(pr => (
                  <div key={pr.roundNumber} className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800/80">
                    <div className="flex items-center justify-between font-black text-neutral-300 mb-1.5">
                      <span className="text-orange-400">Ronda #{pr.roundNumber}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                        {pr.status === 'entregado' ? '✅ Ya entregada' : pr.status}
                      </span>
                    </div>
                    <div className="space-y-1 text-neutral-400 text-[11px]">
                      {pr.items.map((pi, pidx) => (
                        <div key={pidx} className="flex items-center justify-between">
                          <span>{pi.cantidad}x {pi.nombre} {pi.comensalNombre ? `(${pi.comensalNombre})` : ''}</span>
                          <span className="text-[10px] text-neutral-500 font-mono">${(pi.precio * pi.cantidad).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer / Controles de la Ronda */}
        <div className="p-3 bg-neutral-950 border-t border-neutral-800">
          {queue === 'nuevos' && isPending && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRejectModalOrder(order)}
                className="min-h-[52px] rounded-xl bg-neutral-800 hover:bg-red-950 text-neutral-300 hover:text-red-400 font-bold text-xs transition border border-neutral-700 flex items-center justify-center gap-1.5 active:scale-98"
              >
                <XCircle className="w-4 h-4 text-red-500" />
                Rechazar
              </button>
              <button
                type="button"
                onClick={() => handleAcceptRound(card)}
                className="min-h-[52px] rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs transition flex flex-col items-center justify-center gap-0.5 shadow-md shadow-orange-600/30 active:scale-98 animate-pulse"
              >
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>ACEPTAR RONDA {roundNumber}</span>
                </div>
                <span className="text-[10px] text-orange-200 font-normal">
                  (Tomar comanda)
                </span>
              </button>
            </div>
          )}

          {queue === 'preparacion' && (
            <div className="space-y-2">
              {isAccepted && (
                <button
                  type="button"
                  onClick={() => handleStartRoundPreparation(card)}
                  className="w-full min-h-[52px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs sm:text-sm tracking-wide transition flex items-center justify-center gap-2 shadow-md shadow-blue-600/30 active:scale-98"
                >
                  <Flame className="w-4 h-4 text-yellow-300 animate-bounce" />
                  <span>COMENZAR RONDA {roundNumber} (A FUEGO)</span>
                </button>
              )}

              {isCooking && (
                <button
                  type="button"
                  onClick={() => handleReadyRound(card)}
                  className="w-full min-h-[52px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm tracking-wide transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 active:scale-98"
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-100" />
                  <span>MARCAR RONDA {roundNumber} LISTA</span>
                </button>
              )}
            </div>
          )}

          {queue === 'recojo' && isReady && (
            <div className="space-y-1.5">
              {isUncollectedAlert ? (
                <div className="min-h-[52px] rounded-xl bg-red-950/80 border border-red-600 text-red-300 font-black text-xs flex items-center justify-center gap-2 px-3 text-center animate-pulse">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                  <span>ALERTA: Ronda {roundNumber} sin recoger (+10 min)</span>
                </div>
              ) : (
                <div className="min-h-[52px] rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-400 font-bold text-xs flex items-center justify-center gap-2 px-3 text-center">
                  <PackageCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>Ronda {roundNumber} Lista • Esperando recojo de {order.meseroNombre ? `Mesero (${order.meseroNombre})` : 'Mostrador'}</span>
                </div>
              )}
              <p className="text-[10px] text-neutral-500 text-center">
                Desaparece al confirmar entrega el mesero o caja
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100dvh-65px)] min-h-0 bg-neutral-950 text-neutral-100 overflow-hidden select-none">
      
      {/* Kitchen Bar Header */}
      <div className="bg-neutral-900 border-b border-neutral-800 px-4 sm:px-6 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-600/20 text-orange-500 border border-orange-500/30 flex items-center justify-center">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-black text-base sm:text-lg text-white tracking-tight flex items-center gap-2">
              KDS Cocina Gastro Smart
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                Rondas Activas
              </span>
            </h2>
            <p className="text-xs text-neutral-400">
              {currentRestaurant?.nombre} • Cola independiente por ronda de mesa
            </p>
          </div>
        </div>

        {/* Status Counters & Controls */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden md:flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-orange-500/20 text-orange-300 font-bold border border-orange-500/30 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-400"></span>
              Nuevos: {nuevosCards.length}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              En Prep: {prepCards.length}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Recojo: {recojoCards.length}
            </span>
          </div>

          {/* Control rápido de Mute/Unmute */}
          <button
            id="toggle-kitchen-audio-quick-btn"
            type="button"
            onClick={handleToggleAudio}
            className={`p-2 rounded-xl border transition flex items-center gap-1.5 text-xs font-bold ${
              audioEnabled 
                ? 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white' 
                : 'bg-red-950/60 border-red-800 text-red-400'
            }`}
          >
            {audioEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-red-400" />}
            <span className="hidden sm:inline">{audioEnabled ? 'Alarma ON' : 'Silencio'}</span>
          </button>

          {/* Botón para Configuración Completa de Alertas Sonoras y Visuales */}
          <button
            id="open-kitchen-alerts-settings-btn"
            type="button"
            onClick={() => setShowNotifModal(true)}
            className="p-2 sm:px-3 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white transition flex items-center gap-1.5 text-xs font-bold shadow-xs active:scale-95"
            title="Ajustar alertas sonoras y visuales"
          >
            <Sliders className="w-4 h-4 text-orange-400" />
            <span className="hidden md:inline">Alertas Cocina</span>
          </button>
        </div>
      </div>

      {/* Visual Notice Banner */}
      {visualNotice && (
        <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-black flex items-center justify-between animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span><strong>{visualNotice.title}:</strong> {visualNotice.text}</span>
          </div>
          <button type="button" onClick={() => setVisualNotice(null)}>
            <XCircle className="w-4 h-4 opacity-80 hover:opacity-100" />
          </button>
        </div>
      )}

      {/* Alerta de Nuevos Pedidos / Aceptar Todos (Si está habilitado en configuración) */}
      {nuevosCards.length > 0 && notifConfig.showTopBanner && (
        <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-700 text-white px-4 py-2.5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center animate-bounce">
              <BellRing className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-black text-xs sm:text-sm">
                ¡{nuevosCards.length} ronda(s) nueva(s) por aceptar!
              </span>
              <span className="text-xs text-orange-100 ml-2 hidden sm:inline">
                ({notifConfig.alarmMode === 'continuous' ? 'Alarma continua activa' : 'Notificación única'})
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAcceptAllPending}
            className="px-4 py-1.5 bg-white text-orange-900 hover:bg-orange-50 rounded-xl font-black text-xs transition shadow-md flex items-center gap-1.5 active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4 text-orange-600" />
            <span>ACEPTAR TODAS LAS RONDAS</span>
          </button>
        </div>
      )}

      {/* Selector de vistas para móviles y pantallas compactas */}
      <div className="xl:hidden bg-neutral-900 border-b border-neutral-800 p-2 flex items-center justify-between gap-2 overflow-x-auto">
        {[
          { id: 'all', label: 'Todas las Colas', count: kitchenRoundCards.length, icon: Columns3 },
          { id: 'nuevos', label: '1. Nuevos', count: nuevosCards.length, color: 'text-orange-400' },
          { id: 'preparacion', label: '2. En Preparación', count: prepCards.length, color: 'text-blue-400' },
          { id: 'recojo', label: '3. Esperando recojo', count: recojoCards.length, color: 'text-emerald-400' },
        ].map(tab => {
          const isActive = activeQueueTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveQueueTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                isActive 
                  ? 'bg-neutral-800 text-white border border-neutral-700 shadow-xs' 
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                isActive ? 'bg-white/20 text-white' : 'bg-neutral-800 text-neutral-400'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main KDS 3-Queue Columns */}
      <div className="flex-1 overflow-hidden p-4">
        {currentRestaurant?.usaCocina === false ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 max-w-lg mx-auto">
            <div className="w-20 h-20 rounded-3xl bg-purple-950/80 border border-purple-800 text-purple-400 flex items-center justify-center mb-4 shadow-xl">
              <Utensils className="w-10 h-10" />
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-900/60 text-purple-300 border border-purple-700/60 mb-2">
              Modo Sin Cocina Activo
            </span>
            <h3 className="text-xl font-extrabold text-neutral-200">
              {currentRestaurant?.nombre || 'Este local'} opera directo a mostrador
            </h3>
            <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
              Las comandas no requieren preparación en cocina ni emiten alarmas de KDS. Los pedidos pasan automáticamente a estado <strong>Listo</strong> para despacho y cobro en el Mostrador / POS.
            </p>
            <div className="mt-5 p-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 text-neutral-400 text-xs">
              💡 Puedes cambiar esta preferencia en cualquier momento desde <strong>Admin &gt; Restaurantes &gt; Editar Local</strong>.
            </div>
          </div>
        ) : kitchenRoundCards.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center text-neutral-600">
            <ChefHat className="w-16 h-16 stroke-1 text-neutral-700 mb-3 animate-pulse" />
            <p className="text-base font-bold text-neutral-400">Cocina al día. No hay rondas activas.</p>
            <p className="text-xs text-neutral-600 mt-1">Los pedidos ingresados por los meseros entrarán como "pendiente_cocina" con alerta sonora.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 h-full">
            
            {/* COLUMNA 1: NUEVOS (SOLO pendiente_cocina) */}
            {(activeQueueTab === 'all' || activeQueueTab === 'nuevos') && (
              <div className="flex flex-col h-full bg-neutral-900/60 border border-orange-500/30 rounded-2xl overflow-hidden">
                <div className="p-3 bg-orange-950/40 border-b border-orange-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-ping"></span>
                    <h3 className="font-black text-sm text-orange-400 uppercase tracking-wider">
                      1. Nuevos
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-mono font-bold text-xs border border-orange-500/30">
                    {nuevosCards.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {nuevosCards.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-xs text-neutral-600 font-medium">
                      Sin rondas nuevas por aceptar
                    </div>
                  ) : (
                    nuevosCards.map(card => renderRoundCard(card, 'nuevos'))
                  )}
                </div>
              </div>
            )}

            {/* COLUMNA 2: EN PREPARACIÓN (SOLO aceptado y en_preparacion) */}
            {(activeQueueTab === 'all' || activeQueueTab === 'preparacion') && (
              <div className="flex flex-col h-full bg-neutral-900/60 border border-blue-500/30 rounded-2xl overflow-hidden">
                <div className="p-3 bg-blue-950/40 border-b border-blue-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-blue-400" />
                    <h3 className="font-black text-sm text-blue-400 uppercase tracking-wider">
                      2. En Preparación
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono font-bold text-xs border border-blue-500/30">
                    {prepCards.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {prepCards.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-xs text-neutral-600 font-medium">
                      No hay rondas en preparación
                    </div>
                  ) : (
                    prepCards.map(card => renderRoundCard(card, 'preparacion'))
                  )}
                </div>
              </div>
            )}

            {/* COLUMNA 3: ESPERANDO RECOJO (SOLO listo, visible hasta que el mesero o caja marque entregado) */}
            {(activeQueueTab === 'all' || activeQueueTab === 'recojo') && (
              <div className="flex flex-col h-full bg-neutral-900/60 border border-emerald-500/30 rounded-2xl overflow-hidden">
                <div className="p-3 bg-emerald-950/40 border-b border-emerald-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PackageCheck className="w-4 h-4 text-emerald-400" />
                    <h3 className="font-black text-sm text-emerald-400 uppercase tracking-wider">
                      3. Esperando recojo
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold text-xs border border-emerald-500/30">
                    {recojoCards.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {recojoCards.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-xs text-neutral-600 font-medium">
                      No hay rondas en espera de recojo
                    </div>
                  ) : (
                    recojoCards.map(card => renderRoundCard(card, 'recojo'))
                  )}
                </div>
              </div>
            )}

          </div>
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
                  Se notificará inmediatamente al mesero ({rejectModalOrder.meseroNombre}) con el motivo
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

      {/* Modal Impresión Térmica Comanda de Cocina (58mm / 80mm / Bluetooth) */}
      {comandaToPrint && (
        <ThermalReceiptModal
          order={comandaToPrint.order}
          restaurantName={currentRestaurant?.nombre || 'Cocina'}
          restaurantLogo={currentRestaurant?.logoUrl || undefined}
          restaurantAddress={currentRestaurant?.direccion}
          restaurantPhone={currentRestaurant?.telefono}
          mode="comanda"
          roundNumber={comandaToPrint.roundNumber}
          itemsOverride={comandaToPrint.items}
          onClose={() => setComandaToPrint(null)}
        />
      )}

      {/* Modal de Configuración de Notificaciones y Alertas Sonoras/Visuales */}
      <KitchenNotificationModal
        isOpen={showNotifModal}
        onClose={() => setShowNotifModal(false)}
        config={notifConfig}
        onSaveConfig={handleSaveNotifConfig}
        onTestSound={handleTestSound}
      />

    </div>
  );
};
