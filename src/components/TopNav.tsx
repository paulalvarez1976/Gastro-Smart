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
  Play
} from 'lucide-react';
import { sounds } from '../utils/sound';
import { getShiftSessionSummary, pauseShift, resumeShift } from '../services/dataService';
import { PWAInstallButton } from './PWAInstallButton';
import { KioskControls } from './KioskControls';
import { DeviceBadge } from './DeviceBadge';

interface TopNavProps {
  orders?: Order[];
  onOrderClick?: (order: Order) => void;
  onOpenNewRestaurantModal?: () => void;
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
  onOpenNewRestaurantModal 
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
    markAlertRead
  } = useAuth();

  const [shiftDuration, setShiftDuration] = useState<string>('00:00:00');
  const [showEndShiftModal, setShowEndShiftModal] = useState(false);
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
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(() => sounds.isMuted());
  const [activeToast, setActiveToast] = useState<NotificationToast | null>(null);

  // Refs para rastrear cambios en tiempo real y evitar sonidos en la carga inicial
  const isInitialMount = useRef(true);
  const prevReadyOrdersMapRef = useRef<Map<string, string>>(new Map());
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

      const hasKitchen = o.ruta !== 'express' && (o.items || []).some(it => it.requiereCocina !== false);
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

  // ================= NOTIFICACIONES SONORAS EN TIEMPO REAL =================
  // Sincronización de alarmas sonoras con Regla 1 (Cocina lista -> Mesero + Mostrador) y Regla 2 (100% mostrador -> Solo Mostrador)
  useEffect(() => {
    // Cocina gestiona sus alarmas en KitchenDisplay; no duplicar en TopNav
    if (isCocina) {
      sounds.stopAllAlarms();
      return;
    }

    const currentMap = new Map<string, string>();
    const activeAlarmKeys = new Set<string>();

    orders.forEach(o => {
      if (o.restaurantId !== currentRestaurant?.id) return;
      currentMap.set(o.id, o.estado);

      const hasKitchen = o.ruta !== 'express' && (o.items || []).some(it => it.requiereCocina !== false);
      const is100Mostrador = !hasKitchen || o.ruta === 'express';

      const readyAlarmId = 'ord-ready-' + o.id;
      const mostradorAlarmId = 'ord-mostrador-' + o.id;
      const rejectAlarmId = 'ord-rej-' + o.id;

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

    // Detener cualquier alarma de pedidos que ya no estén activos
    sounds.getActiveAlarmKeys().forEach(key => {
      if ((key.startsWith('ord-ready-') || key.startsWith('ord-mostrador-') || key.startsWith('ord-rej-')) && !activeAlarmKeys.has(key)) {
        sounds.stopRepeatingAlarm(key);
      }
    });

    if (isInitialMount.current) {
      prevReadyOrdersMapRef.current = currentMap;
      prevSecurityAlertsCountRef.current = unreadAlerts.length;
      isInitialMount.current = false;
      return;
    }

    // Verificar transiciones de estado para mostrar toasts visuales contextuales
    orders.forEach(ord => {
      if (ord.restaurantId !== currentRestaurant?.id) return;
      const prevStatus = prevReadyOrdersMapRef.current.get(ord.id);
      const hasKitchen = ord.ruta !== 'express' && (ord.items || []).some(it => it.requiereCocina !== false);
      const is100Mostrador = !hasKitchen || ord.ruta === 'express';
      const targetDesc = ord.tipo === 'local' ? `Mesa #${ord.mesaNumero}` : `Delivery (${ord.empresaDelivery || 'Reparto'})`;

      // Regla 1: Transición a "listo" (Cocina completó pedido) -> Alerta a Mesero y Mostrador
      if (ord.estado === 'listo' && prevStatus !== 'listo' && !is100Mostrador) {
        const toastId = 'ord-ready-' + ord.id;
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

      // Regla 2: Nuevo pedido 100% Mostrador entrante -> Notificación solo a Mostrador
      if (is100Mostrador && prevStatus === undefined && ord.estadoPago !== 'cobrado' && ord.estadoEntrega !== 'entregado') {
        if (isMostrador || isAdminOrOwner) {
          const toastId = 'ord-mostrador-' + ord.id;
          const itemsDesc = ord.items.map(i => `${i.cantidad}x ${i.nombre}`).join(', ');
          setActiveToast({
            id: toastId,
            title: `⚡ ¡Nuevo Pedido en Mostrador para ${targetDesc}!`,
            desc: `Despachar productos de mostrador: ${itemsDesc}`,
            type: 'general',
            order: ord
          });
        }
      }

      // Rechazado por Cocina
      if (ord.estado === 'rechazado' && prevStatus !== 'rechazado' && !is100Mostrador) {
        if (isMesero || isAdminOrOwner) {
          const toastId = 'ord-rej-' + ord.id;
          setActiveToast({
            id: toastId,
            title: `⚠️ Pedido rechazado para ${targetDesc}`,
            desc: ord.motivoRechazo ? `Motivo: ${ord.motivoRechazo}` : 'La cocina no pudo preparar este pedido.',
            type: 'rejected',
            order: ord
          });
        }
      }
    });

    prevReadyOrdersMapRef.current = currentMap;

    return () => {
      // Limpiar alarmas al desmontar o cambiar de restaurante/negocio
      sounds.stopAllAlarms();
    };
  }, [orders, currentRestaurant?.id, isCocina, isMesero, isMostrador, isAdminOrOwner, currentEmployee]);

  // 2. Detección de Alertas de Seguridad en tiempo real (PIN brute-force, etc.)
  useEffect(() => {
    if (isInitialMount.current) return;

    if (unreadAlerts.length > prevSecurityAlertsCountRef.current) {
      const latestAlert = unreadAlerts[0];
      const toastId = 'sec-alert-' + (latestAlert?.id || Date.now());
      sounds.startRepeatingAlarm(toastId, 'security', 4200);
      setActiveToast({
        id: toastId,
        title: '🛡️ ¡Alerta de Seguridad Registrada!',
        desc: latestAlert?.mensaje || 'Se detectó un incidente de seguridad en el sistema.',
        type: 'security'
      });
    }

    prevSecurityAlertsCountRef.current = unreadAlerts.length;
  }, [unreadAlerts]);

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

  return (
    <>
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-40 shadow-xs shrink-0 flex flex-col">
        
        {/* FRANJA 1: Identidad del Negocio, Selector Multisede y Perfil/Sesión de Usuario */}
        <div className="px-3 sm:px-6 py-2 flex items-center justify-between border-b border-neutral-100 gap-3">
          
          {/* Izquierda: Logo, Nombre de Negocio y Selector Multisede */}
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center font-black shadow-xs shrink-0">
                <UtensilsCrossed className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="hidden md:block">
                <div className="font-black text-neutral-900 tracking-tight text-xs sm:text-sm flex items-center gap-1.5 leading-tight">
                  <span className="truncate">{currentBusiness?.nombre || 'Gastro Smart'}</span>
                  {currentUserAccount && (
                    <span className="text-[10px] font-extrabold bg-orange-100 text-orange-700 px-1.5 py-0.2 rounded">
                      {currentUserAccount.rol === 'owner' ? 'DUEÑO' : 'ADMIN'}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-neutral-400 font-medium truncate">
                  {currentBusiness?.rif_o_ruc ? `ID: ${currentBusiness.rif_o_ruc}` : 'Plataforma Gastronómica'}
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
            <div className="text-right hidden sm:block">
              <div className="text-xs font-black text-neutral-900 leading-tight">
                {userDisplayName}
              </div>
              <span className={`text-[10px] uppercase font-extrabold px-1.5 py-0.2 rounded border ${roleColors[userRole] || 'bg-neutral-100'}`}>
                {userRole === 'owner' ? 'DUEÑO (OWNER)' : userRole}
              </span>
            </div>

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
                        Alertas de Seguridad ({securityAlerts.length})
                      </div>
                      <button onClick={() => setShowAlertsModal(false)} className="text-neutral-400 hover:text-neutral-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="mt-2 space-y-2 max-h-72 overflow-y-auto text-xs">
                      {securityAlerts.length === 0 ? (
                        <div className="text-neutral-400 text-center py-6">
                          No hay incidentes de seguridad registrados.
                        </div>
                      ) : (
                        securityAlerts.map((alert, idx) => (
                          <div 
                            key={`${alert.id}-${idx}`}
                            className={`p-3 rounded-xl border ${
                              alert.tipo === 'fuerza_bruta_pin' 
                                ? 'bg-red-50/80 border-red-200 text-red-950' 
                                : 'bg-amber-50 border-amber-200 text-amber-950'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-extrabold text-[11px] uppercase tracking-wider text-red-700">
                                {alert.tipo === 'fuerza_bruta_pin' ? '⚠️ Fuerza Bruta PIN' : 'Alerta'}
                              </span>
                              <span className="text-[10px] text-neutral-500">
                                {new Date(alert.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed">
                              {alert.mensaje}
                            </p>
                            {!alert.leido && (
                              <button
                                onClick={() => {
                                  markAlertRead(alert.id);
                                  sounds.stopRepeatingAlarm('sec-alert-' + alert.id);
                                  sounds.stopRepeatingAlarm('security-alert');
                                }}
                                className="mt-2 text-[10px] font-bold text-red-700 hover:underline"
                              >
                                Marcar como atendida / leída
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notifications bell (alerta de cocina a mesero) */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative px-2.5 py-1 rounded-lg text-neutral-700 hover:text-orange-600 hover:bg-orange-50 transition border border-neutral-200 bg-white flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                title="Notificaciones de pedidos"
              >
                <Bell className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Avisos</span>
                {readyOrdersForServer.length > 0 && (
                  <span className="w-4 h-4 bg-orange-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
                    {readyOrdersForServer.length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-neutral-200 p-3 z-50">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                        Avisos en vivo
                      </span>
                      <button
                        type="button"
                        onClick={() => sounds.playNotification()}
                        className="text-[10px] font-bold text-orange-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                        title="Probar sonido de notificación"
                      >
                        (🔊 Probar)
                      </button>
                    </div>
                    <button onClick={() => setShowNotifications(false)} className="text-neutral-400 hover:text-neutral-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                    {readyOrdersForServer.length === 0 ? (
                      <div className="text-xs text-neutral-400 text-center py-4">
                        No hay pedidos pendientes de retiro
                      </div>
                    ) : (
                      readyOrdersForServer.map((o, idx) => {
                        const isExpressOrder = o.ruta === 'express' || !(o.items || []).some(it => it.requiereCocina !== false);
                        return (
                          <div 
                            key={`${o.id}-${idx}`}
                            onClick={() => {
                              sounds.stopRepeatingAlarm('ord-ready-' + o.id);
                              sounds.stopRepeatingAlarm('ord-mostrador-' + o.id);
                              sounds.stopRepeatingAlarm('ord-rej-' + o.id);
                              onOrderClick?.(o);
                              setShowNotifications(false);
                            }}
                            className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                              isExpressOrder
                                ? 'bg-purple-50 border-purple-200 text-purple-900 hover:bg-purple-100'
                                : o.estado === 'listo' 
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100' 
                                  : 'bg-red-50 border-red-200 text-red-900 hover:bg-red-100'
                            }`}
                          >
                            <div className="font-bold flex items-center justify-between">
                              <span>
                                {o.tipo === 'local' ? `Mesa #${o.mesaNumero}` : `Delivery (${o.empresaDelivery || 'General'})`}
                              </span>
                              <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-white/80 font-black">
                                {isExpressOrder 
                                  ? '⚡ MOSTRADOR' 
                                  : (o.estado === 'listo' ? '¡LISTO PARA ENTREGAR!' : 'RECHAZADO')}
                              </span>
                            </div>
                            <div className="text-[11px] mt-1 text-neutral-600 truncate">
                              {o.items.map(i => `${i.cantidad}x ${i.nombre}`).join(', ')}
                            </div>
                            {o.motivoRechazo && (
                              <div className="text-[10px] text-red-600 mt-1 font-semibold">
                                Motivo: {o.motivoRechazo}
                              </div>
                            )}
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
    </>
  );
};

