import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Order, SecurityAlert } from '../types';
import { 
  LogOut, 
  Store, 
  Clock, 
  User, 
  Bell, 
  CheckCircle2, 
  X, 
  Sparkles,
  ChevronDown,
  DollarSign,
  TrendingUp,
  FileText,
  Building2,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Plus,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  Flame,
  ArrowRight,
  Pause,
  Play,
  BellRing,
  Trash2,
  CheckCheck,
  Check,
  BellOff
} from 'lucide-react';
import { sounds } from '../utils/sound';
import { getShiftSessionSummary, pauseShift, resumeShift } from '../services/dataService';
import { PWAInstallButton } from './PWAInstallButton';
import { KioskControls } from './KioskControls';
import { DeviceBadge } from './DeviceBadge';
import { AdminMessageCenterModal } from './AdminMessageCenterModal';
import { PushNotificationModal } from './PushNotificationModal';
import { AdminProfileModal } from './AdminProfileModal';
import { QuickStartGuideModal } from './QuickStartGuideModal';
import { pushNotificationService } from '../services/pushNotificationService';

interface TopNavProps {
  orders?: Order[];
  onOrderClick?: (order: Order) => void;
  onOpenNewRestaurantModal?: () => void;
  saasView?: 'restaurant' | 'superadmin';
  onToggleSaasView?: (view: 'restaurant' | 'superadmin') => void;
}

interface NotificationToast {
  id: string;
  title: string;
  desc: string;
  type: 'ready' | 'rejected' | 'security' | 'kitchen' | 'cash' | 'general';
  order?: Order;
}

export const TopNav: React.FC<TopNavProps> = ({ 
  orders = [], 
  onOrderClick,
  onOpenNewRestaurantModal,
  saasView = 'restaurant',
  onToggleSaasView
}) => {
  const { 
    currentUserAccount,
    currentBusiness,
    currentEmployee, 
    currentShift, 
    currentRestaurant, 
    allRestaurants, 
    securityAlerts,
    selectRestaurant, 
    endShiftAndLogout, 
    logoutEmployee,
    logoutAdmin,
    markAlertRead,
    deleteAlert,
    dismissAndClearAlert,
    clearReadAlerts,
    clearAllAlerts
  } = useAuth();

  const [shiftDuration, setShiftDuration] = useState<string>('00:00:00');
  const [showEndShiftModal, setShowEndShiftModal] = useState(false);
  const [showMessageCenterModal, setShowMessageCenterModal] = useState(false);
  const [showAdminProfileModal, setShowAdminProfileModal] = useState(false);
  const [showQuickGuideModal, setShowQuickGuideModal] = useState(false);
  const [reporteLabores, setReporteLabores] = useState('');
  const [efectivoContado, setEfectivoContado] = useState<number>(0);
  const [fondoInicial, setFondoInicial] = useState<number>(100);
  const [liveSessionMetrics, setLiveSessionMetrics] = useState<{
    pedidosTomados: number;
    ventasGeneradas: number;
    pedidosCobrados: number;
    montoCobrado: number;
    horasTrabajadas: number;
  } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [showPushModal, setShowPushModal] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    pushNotificationService.getPermissionStatus()
  );
  const [pushEnabled, setPushEnabled] = useState<boolean>(() =>
    pushNotificationService.getPreferences().enabled
  );
  const [pushBannerDismissed, setPushBannerDismissed] = useState<boolean>(false);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(() => sounds.isMuted());
  const [activeToast, setActiveToast] = useState<NotificationToast | null>(null);

  // Rastreo de notificaciones de pedidos leídas y eliminadas/borradas
  const storageKeyPrefix = currentRestaurant?.id || 'all';

  const [readNotifOrderIds, setReadNotifOrderIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(`gastro_read_notifs_${currentRestaurant?.id || 'all'}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [deletedNotifOrderIds, setDeletedNotifOrderIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(`gastro_deleted_notifs_${currentRestaurant?.id || 'all'}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Sincronizar estado si cambia el restaurante seleccionado
  useEffect(() => {
    try {
      const storedRead = localStorage.getItem(`gastro_read_notifs_${storageKeyPrefix}`);
      setReadNotifOrderIds(storedRead ? JSON.parse(storedRead) : []);
      const storedDeleted = localStorage.getItem(`gastro_deleted_notifs_${storageKeyPrefix}`);
      setDeletedNotifOrderIds(storedDeleted ? JSON.parse(storedDeleted) : []);
    } catch {
      setReadNotifOrderIds([]);
      setDeletedNotifOrderIds([]);
    }
  }, [storageKeyPrefix]);

  const markOrderNotifAsRead = (orderId: string) => {
    sounds.stopRepeatingAlarm('ord-ready-' + orderId);
    sounds.stopRepeatingAlarm('ord-mostrador-' + orderId);
    sounds.stopRepeatingAlarm('ord-rej-' + orderId);

    if (activeToast?.order?.id === orderId) {
      sounds.stopRepeatingAlarm(activeToast.id);
      setActiveToast(null);
    }

    setReadNotifOrderIds(prev => {
      if (prev.includes(orderId)) return prev;
      const next = [...prev, orderId];
      try {
        localStorage.setItem(`gastro_read_notifs_${storageKeyPrefix}`, JSON.stringify(next));
      } catch (e) {
        console.warn(e);
      }
      return next;
    });
  };

  const deleteOrderNotif = (orderId: string) => {
    sounds.playKeypadClick();
    sounds.stopRepeatingAlarm('ord-ready-' + orderId);
    sounds.stopRepeatingAlarm('ord-mostrador-' + orderId);
    sounds.stopRepeatingAlarm('ord-rej-' + orderId);

    if (activeToast?.order?.id === orderId) {
      sounds.stopRepeatingAlarm(activeToast.id);
      setActiveToast(null);
    }

    setReadNotifOrderIds(prev => {
      const next = prev.includes(orderId) ? prev : [...prev, orderId];
      try {
        localStorage.setItem(`gastro_read_notifs_${storageKeyPrefix}`, JSON.stringify(next));
      } catch {}
      return next;
    });

    setDeletedNotifOrderIds(prev => {
      if (prev.includes(orderId)) return prev;
      const next = [...prev, orderId];
      try {
        localStorage.setItem(`gastro_deleted_notifs_${storageKeyPrefix}`, JSON.stringify(next));
      } catch (e) {
        console.warn(e);
      }
      return next;
    });
  };

  const markAllOrderNotifsAsRead = () => {
    sounds.playKeypadClick();
    sounds.stopAllAlarms();
    if (activeToast) {
      setActiveToast(null);
    }
    const allIds = readyOrdersForServer.map(o => o.id);
    setReadNotifOrderIds(prev => {
      const merged = Array.from(new Set([...prev, ...allIds]));
      try {
        localStorage.setItem(`gastro_read_notifs_${storageKeyPrefix}`, JSON.stringify(merged));
      } catch {}
      return merged;
    });
  };

  const deleteAllOrderNotifs = () => {
    sounds.playKeypadClick();
    sounds.stopAllAlarms();
    if (activeToast) {
      setActiveToast(null);
    }
    const allIds = readyOrdersForServer.map(o => o.id);
    setDeletedNotifOrderIds(prev => {
      const merged = Array.from(new Set([...prev, ...allIds]));
      try {
        localStorage.setItem(`gastro_deleted_notifs_${storageKeyPrefix}`, JSON.stringify(merged));
      } catch {}
      return merged;
    });
  };

  // Refs para rastrear cambios en tiempo real y evitar sonidos en la carga inicial
  const isInitialMount = useRef(true);
  const prevReadyOrdersMapRef = useRef<Map<string, string>>(new Map());
  const prevOrderRoundsCountRef = useRef<Map<string, number>>(new Map());
  const prevSecurityAlertsCountRef = useRef<number>(0);

  // Toggle de Sonido
  const handleToggleSound = () => {
    const newMuted = sounds.toggleMute();
    setIsAudioMuted(newMuted);
    if (!newMuted) {
      sounds.playNotification();
      setActiveToast({
        id: 'sound-on-' + Date.now(),
        title: '🔔 Notificaciones sonoras activadas',
        desc: 'Escucharás un aviso sonoro para cada pedido listo, nueva orden o alerta.',
        type: 'general'
      });
    }
  };

  // Contador de tiempo de turno para personal operativo
  useEffect(() => {
    if (!currentShift) return;

    const updateTimer = () => {
      const start = new Date(currentShift.horaInicio).getTime();
      const now = Date.now();
      let diffMs = Math.max(0, now - start);

      if (currentShift.pausas && currentShift.pausas.length > 0) {
        currentShift.pausas.forEach(p => {
          if (p.fin) {
            diffMs -= (new Date(p.fin).getTime() - new Date(p.inicio).getTime());
          } else {
            diffMs -= (now - new Date(p.inicio).getTime());
          }
        });
      }

      diffMs = Math.max(0, diffMs);

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

      setShiftDuration(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [currentShift]);

  const userPuesto = currentEmployee?.puesto;
  const userRol = currentUserAccount?.rol;

  const isCocina = userPuesto === 'cocina' || userPuesto === 'ayudante_cocina';
  const isMesero = userPuesto === 'mesero';
  const isMostrador = userPuesto === 'mostrador' || userPuesto === 'caja';
  const isAdminOrOwner = !currentEmployee || userPuesto === 'admin' || userRol === 'admin' || userRol === 'owner';

  // Alertas y avisos relevantes para el personal según su rol:
  // Regla 1: Pedidos con cocina -> Alerta conjunta para Mesero y Mostrador al estar listo.
  // Regla 2: Pedidos 100% mostrador -> Alerta exclusiva para Mostrador (Cocina y Mesero no son alertados).
  const readyOrdersForServer = useMemo(() => {
    if (isCocina) {
      return [];
    }

    return orders.filter(o => {
      if (o.restaurantId !== currentRestaurant?.id) return false;

      const restUsesKitchen = currentRestaurant?.usaCocina !== false;
      const hasKitchen = restUsesKitchen && o.ruta !== 'express' && (o.items || []).some(it => it.requiereCocina !== false);
      const is100Mostrador = !hasKitchen || o.ruta === 'express';

      if (isMesero) {
        if (is100Mostrador) return false;
        return (o.estado === 'listo' || o.estado === 'rechazado') &&
               (!currentEmployee || o.meseroId === currentEmployee.id);
      }

      if (isMostrador) {
        if (o.estado === 'listo') return true;
        if (is100Mostrador && o.estadoPago !== 'cobrado' && o.estadoEntrega !== 'entregado') return true;
        return false;
      }

      if (isAdminOrOwner) {
        if (o.estado === 'listo' || o.estado === 'rechazado') return true;
        if (is100Mostrador && o.estadoPago !== 'cobrado' && o.estadoEntrega !== 'entregado') return true;
        return false;
      }

      return false;
    });
  }, [orders, currentRestaurant?.id, isCocina, isMesero, isMostrador, isAdminOrOwner, currentEmployee]);

  const unreadAlerts = securityAlerts.filter(a => !a.leido);

  // Pedidos activos en notificaciones (excluyendo los borrados por el usuario)
  const activeReadyOrders = useMemo(() => {
    return readyOrdersForServer.filter(o => !deletedNotifOrderIds.includes(o.id));
  }, [readyOrdersForServer, deletedNotifOrderIds]);

  const unreadReadyOrdersCount = useMemo(() => {
    return activeReadyOrders.filter(o => !readNotifOrderIds.includes(o.id)).length;
  }, [activeReadyOrders, readNotifOrderIds]);

  // ================= NOTIFICACIONES SONORAS Y PUSH NATIVAS (FCM) EN TIEMPO REAL =================
  // Registrar Service Worker FCM y sincronizar token automáticamente si el permiso ya fue otorgado
  useEffect(() => {
    const activeBizId = currentUserAccount?.businessId || currentEmployee?.businessId || currentBusiness?.id;
    const activeUserId = currentUserAccount?.uid || currentEmployee?.id;
    const activeUserName = currentUserAccount?.nombre || currentEmployee?.nombre;
    const activeRole = currentUserAccount?.rol || currentEmployee?.puesto;

    pushNotificationService.registerServiceWorker();

    if (pushNotificationService.getPermissionStatus() === 'granted' && activeBizId) {
      pushNotificationService.requestPermissionAndRegister({
        businessId: activeBizId,
        restaurantId: currentRestaurant?.id || null,
        userId: activeUserId,
        userName: activeUserName,
        userRole: activeRole
      }).then((res) => {
        setPushPermission(res.permission);
      });
    }
  }, [
    currentUserAccount?.uid,
    currentUserAccount?.businessId,
    currentEmployee?.id,
    currentEmployee?.businessId,
    currentBusiness?.id,
    currentRestaurant?.id
  ]);

  // Escuchar clics sobre notificaciones nativas del sistema operativo (Service Worker -> App)
  useEffect(() => {
    const handlePushClick = (e: Event) => {
      const customEvt = e as CustomEvent<{ orderId?: string; notifType?: string }>;
      const orderId = customEvt.detail?.orderId;
      if (orderId) {
        sounds.stopRepeatingAlarm('ord-ready-' + orderId);
        sounds.stopRepeatingAlarm('ord-mostrador-' + orderId);
        sounds.stopRepeatingAlarm('ord-rej-' + orderId);
        const found = orders.find((o) => o.id === orderId);
        if (found && onOrderClick) {
          onOrderClick(found);
        }
      }
    };

    const handlePushDismiss = (e: Event) => {
      const customEvt = e as CustomEvent<{ orderId?: string }>;
      const orderId = customEvt.detail?.orderId;
      if (orderId) {
        sounds.stopRepeatingAlarm('ord-ready-' + orderId);
        sounds.stopRepeatingAlarm('ord-mostrador-' + orderId);
        sounds.stopRepeatingAlarm('ord-rej-' + orderId);
      }
    };

    window.addEventListener('gastro-push-order-click', handlePushClick);
    window.addEventListener('gastro-push-order-dismiss', handlePushDismiss);
    return () => {
      window.removeEventListener('gastro-push-order-click', handlePushClick);
      window.removeEventListener('gastro-push-order-dismiss', handlePushDismiss);
    };
  }, [orders, onOrderClick]);

  // Sincronización de alarmas sonoras y Notificaciones Push Nativas (FCM) en 2do plano
  useEffect(() => {
    const currentMap = new Map<string, string>();
    const currentRoundsMap = new Map<string, number>();
    const activeAlarmKeys = new Set<string>();

    orders.forEach(o => {
      if (o.restaurantId !== currentRestaurant?.id) return;
      currentMap.set(o.id, o.estado);
      currentRoundsMap.set(o.id, o.rondas?.length || 1);

      // Cocina gestiona sus alarmas sonoras continuas en KitchenDisplay
      if (isCocina) return;

      const restUsesKitchen = currentRestaurant?.usaCocina !== false;
      const hasKitchen = restUsesKitchen && o.ruta !== 'express' && (o.items || []).some(it => it.requiereCocina !== false);
      const is100Mostrador = !hasKitchen || o.ruta === 'express';

      const readyAlarmId = 'ord-ready-' + o.id;
      const mostradorAlarmId = 'ord-mostrador-' + o.id;
      const rejectAlarmId = 'ord-rej-' + o.id;

      // Si la notificación de este pedido ya fue marcada como leída o borrada, NO emitir alertas sonoras
      const isReadOrDeleted = readNotifOrderIds.includes(o.id) || deletedNotifOrderIds.includes(o.id);
      if (isReadOrDeleted) {
        sounds.stopRepeatingAlarm(readyAlarmId);
        sounds.stopRepeatingAlarm(mostradorAlarmId);
        sounds.stopRepeatingAlarm(rejectAlarmId);
        return;
      }

      // ================= REGLA 1 =================
      // Pedido con productos de cocina que pasó a "listo":
      // Suena SIMULTÁNEAMENTE para Mesero y Mostrador
      if (o.estado === 'listo' && !is100Mostrador) {
        const shouldAlertMesero = (isMesero && (!currentEmployee || o.meseroId === currentEmployee.id)) || isAdminOrOwner;
        const shouldAlertMostrador = isMostrador || isAdminOrOwner;

        if (shouldAlertMesero || shouldAlertMostrador) {
          activeAlarmKeys.add(readyAlarmId);
          if (!sounds.hasActiveAlarm(readyAlarmId)) {
            sounds.startRepeatingAlarm(readyAlarmId, 'ready', 3800);
          }
        }
      }

      // ================= REGLA 2 =================
      // Pedido 100% cobro directo / mostrador (sin cocina):
      // SOLO Mostrador recibe la alerta sonora
      if (is100Mostrador && o.estadoPago !== 'cobrado' && o.estadoEntrega !== 'entregado' && o.estado !== 'rechazado') {
        const shouldAlertMostrador = isMostrador || isAdminOrOwner;
        if (shouldAlertMostrador) {
          activeAlarmKeys.add(mostradorAlarmId);
          if (!sounds.hasActiveAlarm(mostradorAlarmId)) {
            sounds.startRepeatingAlarm(mostradorAlarmId, 'counter', 3800);
          }
        }
      }

      // Alerta de rechazo por cocina:
      if (o.estado === 'rechazado' && !is100Mostrador) {
        if (isMesero || isAdminOrOwner) {
          activeAlarmKeys.add(rejectAlarmId);
          if (!sounds.hasActiveAlarm(rejectAlarmId)) {
            sounds.startRepeatingAlarm(rejectAlarmId, 'warning', 3800);
          }
        }
      }
    });

    if (!isCocina) {
      // Detener cualquier alarma de pedidos que ya no estén activos
      sounds.getActiveAlarmKeys().forEach(key => {
        if ((key.startsWith('ord-ready-') || key.startsWith('ord-mostrador-') || key.startsWith('ord-rej-')) && !activeAlarmKeys.has(key)) {
          sounds.stopRepeatingAlarm(key);
        }
      });
    }

    if (isInitialMount.current) {
      prevReadyOrdersMapRef.current = currentMap;
      prevOrderRoundsCountRef.current = currentRoundsMap;
      prevSecurityAlertsCountRef.current = unreadAlerts.length;
      isInitialMount.current = false;
      return;
    }

    // Verificar transiciones de estado para disparar Toasts y Notificaciones Push Nativas (FCM)
    orders.forEach(ord => {
      if (ord.restaurantId !== currentRestaurant?.id) return;
      const prevStatus = prevReadyOrdersMapRef.current.get(ord.id);
      const prevRounds = prevOrderRoundsCountRef.current.get(ord.id) || 0;
      const currentRounds = ord.rondas?.length || 1;
      const restUsesKitchen = currentRestaurant?.usaCocina !== false;
      const hasKitchen = restUsesKitchen && ord.ruta !== 'express' && (ord.items || []).some(it => it.requiereCocina !== false);
      const is100Mostrador = !hasKitchen || ord.ruta === 'express';
      const targetDesc = ord.tipo === 'local' ? `Mesa #${ord.mesaNumero}` : `Delivery (${ord.empresaDelivery || 'Reparto'})`;
      const itemsSummary = (ord.items || []).map(i => `${i.cantidad}x ${i.nombre}`).join(', ');

      // Evento A: NUEVO PEDIDO o NUEVA RONDA con platos de Cocina -> Push Nativa para Cocina y Admin
      const isNewKitchenOrder = hasKitchen && prevStatus === undefined && ord.estado === 'pendiente_cocina';
      const isNewKitchenRound = hasKitchen && prevStatus !== undefined && currentRounds > prevRounds;

      if (isNewKitchenOrder || isNewKitchenRound) {
        if (isCocina || isAdminOrOwner) {
          const roundLabel = isNewKitchenRound ? ` (Ronda #${currentRounds})` : '';
          pushNotificationService.notifyOrderEvent({
            eventKey: `push-new-kitchen-${ord.id}-r${currentRounds}`,
            eventType: 'new_order',
            order: ord,
            title: `🔥 ¡Nuevo Pedido en Cocina! • ${targetDesc}${roundLabel}`,
            body: `${itemsSummary} (${ord.meseroNombre || 'Mesero'})`,
            targetRoles: ['cocina', 'ayudante_cocina', 'admin', 'owner']
          });
        }
      }

      // Evento B: Regla 1 - Transición a "listo" (Cocina completó pedido) -> Alerta a Mesero y Mostrador
      if (ord.estado === 'listo' && prevStatus !== 'listo' && !is100Mostrador) {
        const toastId = 'ord-ready-' + ord.id;
        if (!isCocina) {
          if (isMostrador) {
            setActiveToast({
              id: toastId,
              title: `✅ ¡Cocina lista para ${targetDesc}!`,
              desc: `La cocina completó el pedido. Despachar productos de mostrador para entrega conjunta con el mesero.`,
              type: 'ready',
              order: ord
            });
          } else if (isMesero || isAdminOrOwner) {
            setActiveToast({
              id: toastId,
              title: `🍽️ ¡Pedido Listo para ${targetDesc}!`,
              desc: `La cocina completó el pedido con ${ord.items.length} plato(s). Listo para retirar y entregar.`,
              type: 'ready',
              order: ord
            });
          }
        }

        if (isMesero || isMostrador || isAdminOrOwner) {
          pushNotificationService.notifyOrderEvent({
            eventKey: `push-ready-${ord.id}`,
            eventType: 'order_ready',
            order: ord,
            title: `🍽️ ¡Pedido Listo para ${targetDesc}!`,
            body: `Cocina terminó de preparar: ${itemsSummary}. Listo para entregar.`,
            targetRoles: ['mesero', 'mostrador', 'caja', 'admin', 'owner']
          });
        }
      }

      // Evento C: Regla 2 - Nuevo pedido 100% Mostrador entrante -> Notificación a Mostrador y Admin
      if (is100Mostrador && prevStatus === undefined && ord.estadoPago !== 'cobrado' && ord.estadoEntrega !== 'entregado') {
        if (isMostrador || isAdminOrOwner) {
          const toastId = 'ord-mostrador-' + ord.id;
          if (!isCocina) {
            setActiveToast({
              id: toastId,
              title: `⚡ ¡Nuevo Pedido en Mostrador para ${targetDesc}!`,
              desc: `Despachar productos de mostrador: ${itemsSummary}`,
              type: 'general',
              order: ord
            });
          }

          pushNotificationService.notifyOrderEvent({
            eventKey: `push-mostrador-${ord.id}`,
            eventType: 'new_order',
            order: ord,
            title: `⚡ ¡Nuevo Pedido en Mostrador! • ${targetDesc}`,
            body: `Despachar: ${itemsSummary}`,
            targetRoles: ['mostrador', 'caja', 'admin', 'owner']
          });
        }
      }

      // Evento D: Rechazado por Cocina -> Alerta a Mesero y Admin
      if (ord.estado === 'rechazado' && prevStatus !== 'rechazado' && !is100Mostrador) {
        if (isMesero || isAdminOrOwner) {
          const toastId = 'ord-rej-' + ord.id;
          if (!isCocina) {
            setActiveToast({
              id: toastId,
              title: `⚠️ Pedido rechazado para ${targetDesc}`,
              desc: ord.motivoRechazo ? `Motivo: ${ord.motivoRechazo}` : 'La cocina no pudo preparar este pedido.',
              type: 'rejected',
              order: ord
            });
          }

          pushNotificationService.notifyOrderEvent({
            eventKey: `push-rejected-${ord.id}`,
            eventType: 'order_rejected',
            order: ord,
            title: `⚠️ Pedido Rechazado • ${targetDesc}`,
            body: ord.motivoRechazo ? `Motivo: ${ord.motivoRechazo}` : 'La cocina rechazó el pedido.',
            targetRoles: ['mesero', 'admin', 'owner']
          });
        }
      }
    });

    prevReadyOrdersMapRef.current = currentMap;
    prevOrderRoundsCountRef.current = currentRoundsMap;

    return () => {
      if (!isCocina) {
        sounds.stopAllAlarms();
      }
    };
  }, [orders, currentRestaurant?.id, isCocina, isMesero, isMostrador, isAdminOrOwner, currentEmployee, readNotifOrderIds, deletedNotifOrderIds]);

  // 2. Detección de Alertas de Seguridad en tiempo real (PIN brute-force, etc.)
  useEffect(() => {
    // Silenciar alarmas para cualquier aviso o alerta marcado como leído
    securityAlerts.forEach(a => {
      if (a.leido) {
        sounds.stopRepeatingAlarm('sec-alert-' + a.id);
      }
    });
    if (unreadAlerts.length === 0) {
      sounds.stopRepeatingAlarm('security-alert');
    }

    if (isInitialMount.current) return;

    if (unreadAlerts.length > prevSecurityAlertsCountRef.current) {
      const latestAlert = unreadAlerts[0];
      if (latestAlert && !latestAlert.leido) {
        const toastId = 'sec-alert-' + (latestAlert?.id || Date.now());
        const isStockAlert = latestAlert?.tipo === 'stock_bajo' || latestAlert?.tipo === 'stock_agotado';
        sounds.startRepeatingAlarm(toastId, isStockAlert ? 'warning' : 'security', 4200);
        setActiveToast({
          id: toastId,
          title: latestAlert?.tipo === 'stock_agotado'
            ? '🚨 ¡Insumo Agotado tras Entrega de Pedido!'
            : latestAlert?.tipo === 'stock_bajo'
            ? '📦 ¡Alerta de Stock Crítico en Inventario!'
            : '🛡️ ¡Alerta de Seguridad Registrada!',
          desc: latestAlert?.mensaje || 'Se detectó un incidente de seguridad en el sistema.',
          type: isStockAlert ? 'rejected' : 'security'
        });
      }
    }

    prevSecurityAlertsCountRef.current = unreadAlerts.length;
  }, [unreadAlerts, securityAlerts]);

  // 3. Listener global para disparar notificaciones sonoras continuas desde cualquier vista
  useEffect(() => {
    const handleGlobalNotify = (e: Event) => {
      const customEvent = e as CustomEvent<{
        title: string;
        desc: string;
        type?: 'ready' | 'rejected' | 'security' | 'kitchen' | 'cash' | 'general';
        sound?: 'notification' | 'cash' | 'warning' | 'security' | 'ready' | 'kitchen';
      }>;

      const detail = customEvent.detail;
      if (!detail) return;

      const toastId = 'global-toast-' + Date.now();
      const soundType = detail.sound || (detail.type === 'ready' ? 'ready' : detail.type === 'rejected' ? 'warning' : detail.type === 'security' ? 'security' : 'notification');
      
      // Iniciar alarma repetitiva continua hasta marcar leído
      sounds.startRepeatingAlarm(toastId, soundType, 4000);

      setActiveToast({
        id: toastId,
        title: detail.title,
        desc: detail.desc,
        type: detail.type || 'general'
      });
    };

    window.addEventListener('gastro-notify', handleGlobalNotify);
    return () => window.removeEventListener('gastro-notify', handleGlobalNotify);
  }, []);

  // Función para marcar como leída la notificación activa y detener el sonido inmediatamente
  const handleDismissActiveToast = () => {
    if (activeToast) {
      sounds.stopRepeatingAlarm(activeToast.id);
      if (activeToast.order?.id) {
        markOrderNotifAsRead(activeToast.order.id);
      }
      setActiveToast(null);
    }
  };

  useEffect(() => {
    if (showEndShiftModal && currentEmployee && currentShift) {
      getShiftSessionSummary(currentEmployee, currentShift).then(summary => {
        setLiveSessionMetrics(summary);
      });
    }
  }, [showEndShiftModal, currentEmployee, currentShift]);

  const calculateShiftHours = () => {
    if (liveSessionMetrics) return liveSessionMetrics.horasTrabajadas;
    if (!currentShift) return 0;
    const start = new Date(currentShift.horaInicio).getTime();
    const now = Date.now();
    const hours = (now - start) / (1000 * 60 * 60);
    return Math.round(hours * 100) / 100;
  };

  const handleConfirmEndShift = async () => {
    sounds.playCashRegister();
    const metrics = {
      ...(liveSessionMetrics || { pedidosTomados: 0, ventasGeneradas: 0, pedidosCobrados: 0, montoCobrado: 0, horasTrabajadas: 0 }),
      efectivoContado: Number(efectivoContado) || 0,
      fondoInicial: Number(fondoInicial) || 100,
    };
    await endShiftAndLogout(reporteLabores, metrics);
    setShowEndShiftModal(false);
  };

  const roleColors: Record<string, string> = {
    owner: 'bg-orange-100 text-orange-900 border-orange-300 font-extrabold',
    admin: 'bg-purple-100 text-purple-800 border-purple-200',
    caja: 'bg-blue-100 text-blue-800 border-blue-200',
    mesero: 'bg-amber-100 text-amber-800 border-amber-200',
    cocina: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    ayudante_cocina: 'bg-amber-100 text-amber-900 border-amber-300',
    limpieza: 'bg-teal-100 text-teal-800 border-teal-200',
  };

  const userDisplayName = currentUserAccount?.nombre || currentEmployee?.nombre || 'Usuario';
  const userRole = currentUserAccount?.rol || currentEmployee?.puesto || 'operativo';

  // Desplegar guía de inicio rápido automáticamente en la primera sesión
  useEffect(() => {
    const activeKey = currentUserAccount?.id || currentEmployee?.id || 'guest';
    const seenRoleKey = `gastro_guide_seen_${userRole}`;
    const seenGlobalKey = 'gastro_guide_seen_global';

    try {
      const seenRole = localStorage.getItem(seenRoleKey);
      const seenGlobal = localStorage.getItem(seenGlobalKey);
      if (!seenRole && !seenGlobal) {
        const timer = setTimeout(() => {
          setShowQuickGuideModal(true);
        }, 800);
        return () => clearTimeout(timer);
      }
    } catch (e) {}
  }, [userRole, currentUserAccount?.id, currentEmployee?.id]);

  return (
    <>
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-40 shadow-xs shrink-0 flex flex-col">
        
        {/* FRANJA 1: Identidad del Negocio, Selector Multisede y Perfil/Sesión de Usuario */}
        <div className="px-3 sm:px-6 py-2 flex items-center justify-between border-b border-neutral-100 gap-3">
          
          {/* Izquierda: Logo, Nombre de Negocio y Selector Multisede */}
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              {(currentRestaurant?.logoUrl || currentBusiness?.logoUrl) ? (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-neutral-50 border border-neutral-200/90 p-0.5 flex items-center justify-center overflow-hidden shadow-2xs shrink-0">
                  <img
                    src={(currentRestaurant?.logoUrl || currentBusiness?.logoUrl)!}
                    alt={currentRestaurant?.nombre || currentBusiness?.nombre || 'Logo'}
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center font-black shadow-xs shrink-0">
                  <UtensilsCrossed className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              )}
              <div className="hidden md:block">
                <div className="font-black text-neutral-900 tracking-tight text-xs sm:text-sm flex items-center gap-1.5 leading-tight">
                  <span className="truncate">{currentBusiness?.nombre || currentRestaurant?.nombre || 'Gastro Smart'}</span>
                  {currentUserAccount && (
                    <span className="text-[10px] font-extrabold bg-orange-100 text-orange-700 px-1.5 py-0.2 rounded">
                      {currentUserAccount.rol === 'owner' ? 'DUEÑO' : 'ADMIN'}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-neutral-400 font-medium truncate">
                  {currentRestaurant?.nombre ? `Sucursal: ${currentRestaurant.nombre}` : (currentBusiness?.rif_o_ruc ? `ID: ${currentBusiness.rif_o_ruc}` : 'Plataforma Gastronómica')}
                </div>
              </div>
            </div>

            {/* Restaurant Selector (Multisede) */}
            {allRestaurants.length > 0 && (
              <div className="flex items-center gap-1.5 bg-neutral-50 hover:bg-neutral-100/80 px-2.5 py-1 rounded-xl border border-neutral-200 transition">
                <Store className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                <select
                  value={currentRestaurant?.id || ''}
                  onChange={(e) => {
                    if (e.target.value === '__NEW__') {
                      if (onOpenNewRestaurantModal) {
                        onOpenNewRestaurantModal();
                      } else {
                        window.dispatchEvent(new CustomEvent('open-new-restaurant-modal'));
                      }
                    } else {
                      selectRestaurant(e.target.value);
                    }
                  }}
                  className="bg-transparent text-xs sm:text-sm font-bold text-neutral-800 outline-none cursor-pointer pr-1 truncate max-w-[150px] sm:max-w-[220px]"
                  disabled={!currentUserAccount && currentEmployee?.puesto !== 'admin' && allRestaurants.length <= 1}
                >
                  {allRestaurants.map((rest, idx) => (
                    <option key={`${rest.id}-${idx}`} value={rest.id}>
                      {rest.nombre}
                    </option>
                  ))}
                  {(currentUserAccount || currentEmployee?.puesto === 'admin') && (
                    <option value="__NEW__" className="text-orange-600 font-bold">
                      + Crear otra sucursal...
                    </option>
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Derecha: Usuario y Botones de Salida / Turno */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle de Panel Creador vs Restaurante (EXCLUSIVO CREADOR / SUPERADMIN) */}
            {currentUserAccount?.rol === 'superadmin' && onToggleSaasView && (
              <button
                onClick={() => {
                  sounds.playKeypadClick();
                  onToggleSaasView(saasView === 'superadmin' ? 'restaurant' : 'superadmin');
                }}
                className={`px-3 py-1.5 rounded-xl font-black text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer border ${
                  saasView === 'superadmin'
                    ? 'bg-purple-600 text-white border-purple-700 hover:bg-purple-700'
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border-neutral-300'
                }`}
                title="Cambiar entre Panel Creador (SuperAdmin) y Panel Restaurante"
              >
                <ShieldCheck className={`w-3.5 h-3.5 ${saasView === 'superadmin' ? 'text-white' : 'text-purple-600'}`} />
                <span className="hidden md:inline">
                  {saasView === 'superadmin' ? 'Ver Panel Creador' : 'Ver Panel Restaurante'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                sounds.playKeypadClick();
                setShowAdminProfileModal(true);
              }}
              className="text-right hidden sm:flex flex-col items-end p-1 rounded-xl hover:bg-neutral-100 transition cursor-pointer"
              title="Ver Perfil del Administrador y Descargar Respaldo Completo (.ZIP)"
            >
              <div className="text-xs font-black text-neutral-900 leading-tight">
                {userDisplayName}
              </div>
              <span className={`text-[10px] uppercase font-extrabold px-1.5 py-0.2 rounded border ${roleColors[userRole] || 'bg-neutral-100'}`}>
                {userRole === 'superadmin' ? 'SUPERADMIN' : userRole === 'owner' ? 'DUEÑO' : userRole}
              </span>
            </button>

            {/* Botón acceso rápido a Push Nativas en móviles */}
            <button
              type="button"
              onClick={() => setShowPushModal(true)}
              className={`sm:hidden relative p-2 rounded-xl border transition flex items-center justify-center cursor-pointer ${
                pushPermission === 'granted' && pushEnabled
                  ? 'bg-orange-50 text-orange-600 border-orange-200'
                  : 'bg-neutral-100 text-neutral-600 border-neutral-200'
              }`}
              title="Notificaciones Push en 2do Plano (FCM)"
            >
              <BellRing className="w-4 h-4" />
              <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                pushPermission === 'granted' && pushEnabled ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
              }`} />
            </button>

            {currentUserAccount ? (
              <button
                onClick={logoutAdmin}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-red-50 text-neutral-700 hover:text-red-700 border border-neutral-200 text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                title="Cerrar sesión de Administrador"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cerrar Sesión</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                {currentShift && (
                  <button
                    onClick={async () => {
                      if (currentShift.estado === 'en_pausa') {
                        await resumeShift(currentShift.id);
                      } else {
                        await pauseShift(currentShift.id);
                      }
                    }}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer ${
                      currentShift.estado === 'en_pausa' 
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200' 
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                    }`}
                    title={currentShift.estado === 'en_pausa' ? "Reanudar Turno" : "Pausar Turno (descanso)"}
                  >
                    {currentShift.estado === 'en_pausa' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{currentShift.estado === 'en_pausa' ? 'Reanudar' : 'Pausar'}</span>
                  </button>
                )}
                <button
                  onClick={() => setShowEndShiftModal(true)}
                  className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  title="Cerrar turno y ver balance"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cerrar Turno</span>
                </button>
              </div>
            )}
          </div>

        </div>

        {/* FRANJA 2: Herramientas del Sistema, Reconocimiento de Pantalla, Sonido, Alertas y Notificaciones (Oculta en móviles para dar máximo espacio al TPV) */}
        <div className="hidden sm:flex bg-neutral-50/90 px-3 sm:px-6 py-1.5 items-center justify-between gap-2 overflow-x-auto border-t border-neutral-100">
          
          {/* Izquierda: Dispositivo, Instalador PWA, Modo Kiosko y Sonido */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Reconocimiento Activo del Dispositivo */}
            <DeviceBadge />

            {/* In-App PWA Install Button */}
            <PWAInstallButton variant="nav" />

            {/* Kiosk Mode & WakeLock (Pantalla Siempre Encendida) */}
            <KioskControls variant="nav" />

            {/* Sound Mute / Unmute / Test Button */}
            <button
              type="button"
              onClick={handleToggleSound}
              className={`px-2 py-1 rounded-lg transition border flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
                isAudioMuted 
                  ? 'bg-white text-neutral-400 border-neutral-200 hover:text-neutral-700 hover:bg-neutral-100' 
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              }`}
              title={isAudioMuted ? 'Sonidos silenciados (Clic para activar notificaciones sonoras)' : 'Sonidos activos (Clic para silenciar)'}
            >
              {isAudioMuted ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
              )}
              <span className="hidden md:inline">{isAudioMuted ? 'Silencio' : 'Sonido'}</span>
            </button>

            {/* Botón de Notificaciones Push Nativas (FCM - 2do Plano) */}
            <button
              type="button"
              onClick={() => setShowPushModal(true)}
              className={`px-2.5 py-1 rounded-lg transition border flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
                pushPermission === 'granted' && pushEnabled
                  ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
              title="Configurar Notificaciones Push Nativas (Firebase Cloud Messaging) para recibir alertas en segundo plano"
            >
              <BellRing className={`w-3.5 h-3.5 ${pushPermission === 'granted' && pushEnabled ? 'text-orange-600' : 'text-neutral-400'}`} />
              <span className="hidden lg:inline">Push 2do Plano</span>
              <span className={`w-2 h-2 rounded-full ${
                pushPermission === 'granted' && pushEnabled ? 'bg-emerald-500' : 'bg-amber-500 animate-ping'
              }`} />
            </button>

            {/* Botón Guía de Inicio Rápido con Pasos Interactivos por Rol */}
            <button
              type="button"
              id="open-quick-guide-btn"
              onClick={() => {
                sounds.playKeypadClick();
                setShowQuickGuideModal(true);
              }}
              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
              title="Ver Guía de Inicio Rápido interactiva por Rol (Mesero, Caja, Cocina, Admin)"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-200 animate-spin" style={{ animationDuration: '4s' }} />
              <span>Guía Rápida</span>
            </button>
          </div>

          {/* Derecha: Duración de Turno, Alertas de Seguridad y Notificaciones de Pedidos */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            
            {/* Shift Active Indicator (for staff) */}
            {currentShift && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-lg text-xs font-semibold ${
                currentShift.estado === 'en_pausa' 
                  ? 'bg-neutral-200/80 border-neutral-300 text-neutral-700' 
                  : 'bg-amber-50 border-amber-200/80 text-amber-900'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  currentShift.estado === 'en_pausa' ? 'bg-amber-500' : 'bg-emerald-500 animate-ping'
                }`} />
                <Clock className={`w-3.5 h-3.5 ${currentShift.estado === 'en_pausa' ? 'text-amber-500' : 'text-amber-600'}`} />
                <span>{shiftDuration}</span>
                {currentShift.estado === 'en_pausa' && <span className="ml-0.5 text-[10px] font-black uppercase text-amber-600">PAUSA</span>}
              </div>
            )}

            {/* Security alerts indicator for Admin/Owner */}
            {currentUserAccount && (
              <div className="relative">
                <button
                  onClick={() => setShowAlertsModal(!showAlertsModal)}
                  className={`relative px-2.5 py-1 rounded-lg transition border flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
                    unreadAlerts.length > 0
                      ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                      : 'bg-white text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 border-neutral-200'
                  }`}
                  title="Alertas de Seguridad y Auditoría"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Seguridad</span>
                  {unreadAlerts.length > 0 && (
                    <span className="w-4 h-4 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                      {unreadAlerts.length}
                    </span>
                  )}
                </button>

                {showAlertsModal && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-neutral-200 p-4 z-50 animate-in fade-in">
                    <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                      <div className="flex items-center gap-1.5 text-xs font-black text-neutral-900 uppercase">
                        <Shield className="w-4 h-4 text-orange-500" />
                        <span>Alertas y Avisos ({securityAlerts.length})</span>
                        {unreadAlerts.length > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
                            {unreadAlerts.length} sin leer
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {securityAlerts.length > 0 && (
                          <button
                            type="button"
                            onClick={async () => {
                              sounds.playKeypadClick();
                              sounds.stopAllAlarms();
                              await clearAllAlerts();
                            }}
                            className="text-[10px] font-bold text-red-600 hover:text-red-800 hover:underline cursor-pointer"
                            title="Borrar todas las alertas"
                          >
                            Borrar todo
                          </button>
                        )}
                        <button 
                          onClick={() => {
                            setShowAlertsModal(false);
                            setShowMessageCenterModal(true);
                          }}
                          className="text-[10px] font-bold text-orange-600 hover:text-orange-700 underline cursor-pointer"
                        >
                          Ver Todo
                        </button>
                        <button onClick={() => setShowAlertsModal(false)} className="text-neutral-400 hover:text-neutral-600 cursor-pointer">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 space-y-2 max-h-72 overflow-y-auto text-xs">
                      {securityAlerts.length === 0 ? (
                        <div className="text-neutral-400 text-center py-6 flex flex-col items-center justify-center gap-1">
                          <ShieldCheck className="w-6 h-6 text-emerald-500 opacity-60" />
                          <span>No hay incidentes de seguridad registrados.</span>
                        </div>
                      ) : (
                        securityAlerts.map((alert, idx) => (
                          <div 
                            key={`${alert.id}-${idx}`}
                            className={`p-3 rounded-xl border transition ${
                              alert.leido 
                                ? 'bg-neutral-50/90 border-neutral-200 text-neutral-600'
                                : alert.tipo === 'fuerza_bruta_pin' 
                                  ? 'bg-red-50/80 border-red-200 text-red-950 shadow-xs ring-1 ring-red-500/20' 
                                  : 'bg-amber-50 border-amber-200 text-amber-950 shadow-xs'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-[11px] uppercase tracking-wider text-red-700">
                                  {alert.tipo === 'fuerza_bruta_pin' ? '⚠️ Fuerza Bruta PIN' : 'Alerta'}
                                </span>
                                {alert.leido && (
                                  <span className="text-[10px] font-bold text-neutral-500 bg-neutral-200/80 px-1.5 py-0.2 rounded-md inline-flex items-center gap-0.5">
                                    <CheckCheck className="w-2.5 h-2.5 text-emerald-600" />
                                    Leído
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-neutral-500">
                                {new Date(alert.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed">
                              {alert.mensaje}
                            </p>
                            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-black/5 text-[11px]">
                              {!alert.leido ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    sounds.playKeypadClick();
                                    sounds.stopRepeatingAlarm('sec-alert-' + alert.id);
                                    sounds.stopRepeatingAlarm('security-alert');
                                    await markAlertRead(alert.id);
                                  }}
                                  className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-100/60 hover:bg-emerald-100 px-2 py-0.5 rounded-md flex items-center gap-1 transition cursor-pointer"
                                  title="Marcar como leído y silenciar alertas"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Marcar leído</span>
                                </button>
                              ) : (
                                <span className="text-[10px] text-neutral-400 font-medium flex items-center gap-1">
                                  <CheckCheck className="w-3 h-3 text-emerald-500" />
                                  Alerta silenciada
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={async () => {
                                  sounds.playKeypadClick();
                                  sounds.stopRepeatingAlarm('sec-alert-' + alert.id);
                                  sounds.stopRepeatingAlarm('security-alert');
                                  await deleteAlert(alert.id);
                                }}
                                className="text-[10px] font-bold text-red-600 hover:text-red-800 bg-white hover:bg-red-50 border border-neutral-200 hover:border-red-300 px-2 py-0.5 rounded-md flex items-center gap-1 transition cursor-pointer"
                                title="Borrar de las notificaciones"
                              >
                                <Trash2 className="w-3 h-3 text-red-500" />
                                <span>Borrar</span>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notifications bell (alerta de cocina a mesero y mostrador) */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative px-2.5 py-1 rounded-lg text-neutral-700 hover:text-orange-600 hover:bg-orange-50 transition border border-neutral-200 bg-white flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                title="Notificaciones de pedidos"
              >
                <Bell className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Avisos</span>
                {unreadReadyOrdersCount > 0 && (
                  <span className="w-4 h-4 bg-orange-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
                    {unreadReadyOrdersCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-neutral-200 p-3.5 z-50 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                    <div className="flex items-center gap-1.5">
                      <Bell className="w-4 h-4 text-orange-500" />
                      <span className="text-xs font-black text-neutral-900 uppercase">
                        Avisos en vivo ({activeReadyOrders.length})
                      </span>
                      {unreadReadyOrdersCount > 0 ? (
                        <span className="px-1.5 py-0.2 rounded-full bg-orange-100 text-orange-800 text-[10px] font-bold">
                          {unreadReadyOrdersCount} sin leer
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-0.5">
                          <CheckCheck className="w-3 h-3" /> Al día
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => sounds.playNotification()}
                        className="text-[10px] font-bold text-neutral-500 hover:text-orange-600 transition cursor-pointer p-0.5"
                        title="Probar sonido de notificación"
                      >
                        🔊
                      </button>
                      {activeReadyOrders.length > 0 && (
                        <>
                          {unreadReadyOrdersCount > 0 && (
                            <button
                              type="button"
                              onClick={markAllOrderNotifsAsRead}
                              className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                              title="Marcar todas como leídas"
                            >
                              Leídos
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={deleteAllOrderNotifs}
                            className="text-[10px] font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                            title="Borrar todas las notificaciones"
                          >
                            Borrar todo
                          </button>
                        </>
                      )}
                      <button onClick={() => setShowNotifications(false)} className="text-neutral-400 hover:text-neutral-600 cursor-pointer p-0.5">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">
                    {activeReadyOrders.length === 0 ? (
                      <div className="text-xs text-neutral-400 text-center py-6 flex flex-col items-center justify-center gap-1.5">
                        <BellOff className="w-6 h-6 text-neutral-300" />
                        <span>No hay pedidos pendientes ni notificaciones activas.</span>
                      </div>
                    ) : (
                      activeReadyOrders.map((o) => {
                        const isRead = readNotifOrderIds.includes(o.id);
                        const isExpressOrder = o.ruta === 'express' || !(o.items || []).some(it => it.requiereCocina !== false);

                        return (
                          <div 
                            key={o.id}
                            className={`p-3 rounded-2xl border transition relative ${
                              isRead 
                                ? 'bg-neutral-50/90 border-neutral-200 text-neutral-600 opacity-90' 
                                : isExpressOrder
                                  ? 'bg-purple-50/90 border-purple-200 text-purple-950 shadow-xs'
                                  : o.estado === 'listo' 
                                    ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950 shadow-xs ring-1 ring-emerald-500/20' 
                                    : 'bg-red-50/90 border-red-200 text-red-950 shadow-xs'
                            }`}
                          >
                            {/* Cabecera y cuerpo clicable para abrir pedido */}
                            <div 
                              onClick={() => {
                                markOrderNotifAsRead(o.id);
                                onOrderClick?.(o);
                                setShowNotifications(false);
                              }}
                              className="cursor-pointer"
                            >
                              <div className="font-extrabold flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1.5 truncate">
                                  <span>{o.tipo === 'local' ? `Mesa #${o.mesaNumero}` : `Delivery (${o.empresaDelivery || 'General'})`}</span>
                                  {isRead && (
                                    <span className="text-[10px] font-bold text-neutral-500 bg-neutral-200/80 px-1.5 py-0.2 rounded-md inline-flex items-center gap-0.5">
                                      <CheckCheck className="w-2.5 h-2.5 text-emerald-600" />
                                      Leído
                                    </span>
                                  )}
                                </span>
                                <span className={`uppercase text-[10px] px-2 py-0.5 rounded-md font-black shrink-0 ${
                                  isRead 
                                    ? 'bg-neutral-200 text-neutral-600'
                                    : isExpressOrder 
                                      ? 'bg-purple-600 text-white' 
                                      : (o.estado === 'listo' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white')
                                }`}>
                                  {isExpressOrder 
                                    ? '⚡ Mostrador' 
                                    : (o.estado === 'listo' ? '¡Listo para entregar!' : 'Rechazado')}
                                </span>
                              </div>

                              <div className="text-[11px] mt-1 text-neutral-600 line-clamp-2">
                                {o.items.map(i => `${i.cantidad}x ${i.nombre}`).join(', ')}
                              </div>
                              {o.motivoRechazo && (
                                <div className="text-[10px] text-red-600 mt-1 font-semibold">
                                  Motivo: {o.motivoRechazo}
                                </div>
                              )}
                            </div>

                            {/* Botones de acción: Marcar como Leído / Borrar */}
                            <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-black/5 text-[11px]">
                              <div>
                                {!isRead ? (
                                  <button
                                    type="button"
                                    onClick={() => markOrderNotifAsRead(o.id)}
                                    className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center gap-1 shadow-xs transition cursor-pointer active:scale-95"
                                    title="Marcar como leído y silenciar alertas"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Marcar leído</span>
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-neutral-400 font-medium flex items-center gap-1">
                                    <CheckCheck className="w-3 h-3 text-emerald-500" />
                                    Alerta silenciada
                                  </span>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => deleteOrderNotif(o.id)}
                                className="px-2 py-0.5 rounded-lg bg-white hover:bg-red-50 text-neutral-500 hover:text-red-700 font-bold text-[10px] flex items-center gap-1 border border-neutral-200 hover:border-red-300 transition cursor-pointer active:scale-95"
                                title="Borrar de las notificaciones"
                              >
                                <Trash2 className="w-3 h-3 text-red-500" />
                                <span>Borrar</span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Banner rápido para activar Push Nativas en 2do plano si aún no se ha concedido permiso */}
        {pushPermission === 'default' && !pushBannerDismissed && (
          <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 text-white px-3 sm:px-6 py-1.5 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <BellRing className="w-3.5 h-3.5 shrink-0 animate-bounce" />
              <span className="font-bold truncate">
                Activa las Notificaciones Push Nativas (FCM) para recibir alertas de nuevos pedidos en segundo plano.
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  const activeBizId = currentUserAccount?.businessId || currentEmployee?.businessId || currentBusiness?.id;
                  const res = await pushNotificationService.requestPermissionAndRegister({
                    businessId: activeBizId,
                    restaurantId: currentRestaurant?.id || null,
                    userId: currentUserAccount?.uid || currentEmployee?.id,
                    userName: currentUserAccount?.nombre || currentEmployee?.nombre,
                    userRole: currentUserAccount?.rol || currentEmployee?.puesto
                  });
                  setPushPermission(res.permission);
                  if (res.success) {
                    setPushEnabled(true);
                    sounds.playNotification();
                  } else {
                    setShowPushModal(true);
                  }
                }}
                className="px-2.5 py-0.5 rounded-lg bg-white text-orange-700 hover:bg-orange-50 font-black text-[11px] shadow-xs transition cursor-pointer"
              >
                Activar Ahora
              </button>
              <button
                type="button"
                onClick={() => setPushBannerDismissed(true)}
                className="text-white/80 hover:text-white p-0.5 cursor-pointer"
                title="Ocultar aviso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

      </header>

      {/* Floating Notification Toast en tiempo real con repetición de sonido hasta marcar leído */}
      {activeToast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full animate-in slide-in-from-bottom-5 fade-in duration-200">
          <div className={`p-4 rounded-2xl shadow-2xl border flex items-start justify-between gap-3 backdrop-blur-md ${
            activeToast.type === 'ready' 
              ? 'bg-emerald-950/95 text-white border-emerald-400/50 shadow-emerald-950/40'
              : activeToast.type === 'security' || activeToast.type === 'rejected'
              ? 'bg-red-950/95 text-white border-red-500/50 shadow-red-950/40'
              : 'bg-neutral-900/95 text-white border-neutral-700/50 shadow-black/50'
          }`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base animate-bounce">
                  {activeToast.type === 'ready' ? '🔔' : activeToast.type === 'security' ? '🛡️' : activeToast.type === 'rejected' ? '⚠️' : '✨'}
                </span>
                <h4 className="font-extrabold text-xs tracking-tight truncate">
                  {activeToast.title}
                </h4>
              </div>
              <p className="text-[11px] text-neutral-200 mt-1 line-clamp-2 leading-relaxed font-medium">
                {activeToast.desc}
              </p>
              
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDismissActiveToast}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-black flex items-center gap-1 transition shadow-sm active:scale-95"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Marcar como Leído</span>
                </button>

                {activeToast.order && onOrderClick && (
                  <button
                    type="button"
                    onClick={() => {
                      handleDismissActiveToast();
                      onOrderClick(activeToast.order!);
                    }}
                    className="px-2.5 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition shadow-xs"
                  >
                    <span>Ver Pedido</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismissActiveToast}
              className="text-neutral-400 hover:text-white p-1 rounded-lg transition"
              title="Cerrar y silenciar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal: Confirmación de Cierre de Turno y Resumen (Operativo) */}
      {showEndShiftModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-neutral-900 text-base">Cierre de Turno</h3>
                  <p className="text-xs text-neutral-500">Resumen de jornada laboral</p>
                </div>
              </div>
              <button
                onClick={() => setShowEndShiftModal(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary metrics */}
            <div className={`grid ${currentEmployee?.puesto === 'caja' ? 'grid-cols-4' : 'grid-cols-3'} gap-2 sm:gap-3 bg-neutral-50 p-3 rounded-2xl border border-neutral-200 text-center`}>
              <div>
                <div className="text-[11px] uppercase font-bold text-neutral-500">Horas</div>
                <div className="text-lg font-black text-neutral-900 mt-0.5">
                  {calculateShiftHours()} h
                </div>
                <div className="text-[10px] text-neutral-400">Trabajadas</div>
              </div>

              <div className="border-x border-neutral-200">
                <div className="text-[11px] uppercase font-bold text-neutral-500">Pedidos</div>
                <div className="text-lg font-black text-orange-600 mt-0.5">
                  {liveSessionMetrics ? liveSessionMetrics.pedidosTomados : (currentShift?.pedidosTomados || 0)}
                </div>
                <div className="text-[10px] text-neutral-400">Atendidos</div>
              </div>

              <div className={currentEmployee?.puesto === 'caja' ? 'border-r border-neutral-200' : ''}>
                <div className="text-[11px] uppercase font-bold text-neutral-500">Ventas</div>
                <div className="text-lg font-black text-emerald-600 mt-0.5">
                  ${((liveSessionMetrics ? liveSessionMetrics.ventasGeneradas : (currentShift?.ventasGeneradas || 0))).toFixed(2)}
                </div>
                <div className="text-[10px] text-neutral-400">Generadas</div>
              </div>

              {currentEmployee?.puesto === 'caja' && (
                <div>
                  <div className="text-[11px] uppercase font-bold text-neutral-500">Cobrado</div>
                  <div className="text-lg font-black text-blue-600 mt-0.5">
                    ${((liveSessionMetrics ? liveSessionMetrics.montoCobrado : 0)).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-neutral-400">En Caja ({liveSessionMetrics ? liveSessionMetrics.pedidosCobrados : 0})</div>
                </div>
              )}
            </div>

            {/* Si es caja, mostrar controles de arqueo de efectivo y fondo inicial */}
            {currentEmployee?.puesto === 'caja' && (
              <div className="grid grid-cols-2 gap-3 bg-blue-50/50 p-3 rounded-2xl border border-blue-200">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">Fondo Inicial ($):</label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={fondoInicial}
                    onChange={(e) => setFondoInicial(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full h-9 px-3 rounded-xl bg-white border border-blue-300 text-xs font-bold text-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">Efectivo Contado ($):</label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={efectivoContado}
                    onChange={(e) => setEfectivoContado(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full h-9 px-3 rounded-xl bg-white border border-blue-300 text-xs font-bold text-neutral-900"
                  />
                </div>
                <div className="col-span-2 flex items-center justify-between pt-1 text-xs font-bold text-neutral-700 border-t border-blue-200">
                  <span>Diferencia de Caja:</span>
                  <span className={`font-mono ${(efectivoContado - (fondoInicial + (liveSessionMetrics?.montoCobrado || 0))) < 0 ? 'text-red-600' : (efectivoContado - (fondoInicial + (liveSessionMetrics?.montoCobrado || 0))) > 0 ? 'text-emerald-600' : 'text-neutral-900'}`}>
                    ${(efectivoContado - (fondoInicial + (liveSessionMetrics?.montoCobrado || 0))).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Reporte opcional de labores */}
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-orange-500" />
                Reporte de labores (Opcional):
              </label>
              <textarea
                value={reporteLabores}
                onChange={(e) => setReporteLabores(e.target.value)}
                placeholder="Ejemplo: Turno completado sin novedades, reposición realizada..."
                rows={3}
                className="w-full text-xs p-3 rounded-xl border border-neutral-300 focus:ring-2 focus:ring-orange-500 focus:outline-none resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEndShiftModal(false)}
                className="h-12 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition"
              >
                Continuar Turno
              </button>
              <button
                type="button"
                onClick={handleConfirmEndShift}
                className="h-12 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Finalizar y Salir
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal Centro de Mensajes & Avisos */}
      <AdminMessageCenterModal
        isOpen={showMessageCenterModal}
        onClose={() => setShowMessageCenterModal(false)}
        alerts={securityAlerts}
        onDismissAndClearAlert={dismissAndClearAlert}
        onMarkRead={markAlertRead}
        onDeleteAlert={deleteAlert}
        onClearReadAlerts={clearReadAlerts}
        onClearAllAlerts={clearAllAlerts}
      />

      {/* Modal de Configuración de Notificaciones Push Nativas (Firebase Cloud Messaging) */}
      <PushNotificationModal
        isOpen={showPushModal}
        onClose={() => setShowPushModal(false)}
        businessId={currentUserAccount?.businessId || currentEmployee?.businessId || currentBusiness?.id}
        restaurantId={currentRestaurant?.id || null}
        restaurantName={currentRestaurant?.nombre || currentBusiness?.nombre}
        userId={currentUserAccount?.uid || currentEmployee?.id}
        userName={userDisplayName}
        userRole={userRole}
        onStatusChange={(perm, enabled) => {
          setPushPermission(perm);
          setPushEnabled(enabled);
        }}
      />

      {/* Modal de Perfil del Administrador & Respaldo ZIP */}
      <AdminProfileModal
        isOpen={showAdminProfileModal}
        onClose={() => setShowAdminProfileModal(false)}
        currentUserAccount={currentUserAccount}
        currentEmployee={currentEmployee}
        currentBusiness={currentBusiness}
        restaurants={allRestaurants}
        businessId={currentUserAccount?.businessId || currentEmployee?.businessId || currentBusiness?.id || ''}
      />

      {/* Modal de Guía de Inicio Rápido con Pasos Interactivos por Rol */}
      <QuickStartGuideModal
        isOpen={showQuickGuideModal}
        onClose={() => setShowQuickGuideModal(false)}
        initialRole={userRole}
      />
    </>
  );
};

