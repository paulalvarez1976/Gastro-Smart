import React, { useState, useEffect, useRef } from 'react';
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
  ArrowRight
} from 'lucide-react';
import { sounds } from '../utils/sound';
import { getShiftSessionSummary } from '../services/dataService';

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
      const diffMs = Math.max(0, now - start);

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

  // Alertas para mesero y personal: pedidos que acaban de pasar a "listo" o fueron rechazados
  const readyOrdersForServer = orders.filter(
    o => o.restaurantId === currentRestaurant?.id && 
         (o.estado === 'listo' || o.estado === 'rechazado') &&
         (!currentEmployee || currentEmployee.puesto === 'admin' || o.meseroId === currentEmployee.id)
  );

  const unreadAlerts = securityAlerts.filter(a => !a.leido);

  // ================= NOTIFICACIONES SONORAS EN TIEMPO REAL =================
  // 1. Detección de cambios de estado en pedidos (Listo / Rechazado)
  useEffect(() => {
    const currentMap = new Map<string, string>();
    orders.forEach(o => {
      if (o.restaurantId === currentRestaurant?.id) {
        currentMap.set(o.id, o.estado);
      }
    });

    if (isInitialMount.current) {
      prevReadyOrdersMapRef.current = currentMap;
      prevSecurityAlertsCountRef.current = unreadAlerts.length;
      isInitialMount.current = false;
      return;
    }

    // Verificar si algún pedido cambió a 'listo' o 'rechazado'
    orders.forEach(ord => {
      if (ord.restaurantId !== currentRestaurant?.id) return;
      const prevStatus = prevReadyOrdersMapRef.current.get(ord.id);
      
      // Pedido recién puesto en "listo" (mesero debe retirarlo)
      if (ord.estado === 'listo' && prevStatus !== 'listo') {
        const toastId = 'ord-ready-' + ord.id;
        sounds.startRepeatingAlarm(toastId, 'ready', 3800);
        const targetDesc = ord.tipo === 'local' ? `Mesa #${ord.mesaNumero}` : `Delivery (${ord.empresaDelivery || 'Reparto'})`;
        setActiveToast({
          id: toastId,
          title: `🍽️ ¡Pedido Listo para ${targetDesc}!`,
          desc: `La cocina completó el pedido con ${ord.items.length} plato(s). Listo para retirar y entregar.`,
          type: 'ready',
          order: ord
        });
      }

      // Pedido recién rechazado por cocina
      if (ord.estado === 'rechazado' && prevStatus !== 'rechazado') {
        const toastId = 'ord-rej-' + ord.id;
        sounds.startRepeatingAlarm(toastId, 'warning', 3800);
        const targetDesc = ord.tipo === 'local' ? `Mesa #${ord.mesaNumero}` : `Delivery`;
        setActiveToast({
          id: toastId,
          title: `⚠️ Pedido rechazado para ${targetDesc}`,
          desc: ord.motivoRechazo ? `Motivo: ${ord.motivoRechazo}` : 'La cocina no pudo preparar este pedido.',
          type: 'rejected',
          order: ord
        });
      }
    });

    prevReadyOrdersMapRef.current = currentMap;
  }, [orders, currentRestaurant?.id]);

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
    await endShiftAndLogout(reporteLabores, liveSessionMetrics || undefined);
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
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-40 px-3 sm:px-6 py-2.5 flex items-center justify-between shadow-xs">
        
        {/* Left: Brand / Business Name & Restaurant Selector */}
        <div className="flex items-center gap-2.5 sm:gap-5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center font-black shadow-sm shrink-0">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div className="hidden md:block">
              <div className="font-black text-neutral-900 tracking-tight text-sm flex items-center gap-1.5 leading-tight">
                <span>{currentBusiness?.nombre || 'Gastro Smart'}</span>
                {currentUserAccount && (
                  <span className="text-[10px] font-extrabold bg-orange-100 text-orange-700 px-1.5 py-0.2 rounded">
                    {currentUserAccount.rol === 'owner' ? 'DUEÑO' : 'ADMIN'}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-neutral-400 font-medium">
                {currentBusiness?.rif_o_ruc ? `ID: ${currentBusiness.rif_o_ruc}` : 'Plataforma Gastronómica'}
              </div>
            </div>
          </div>

          {/* Restaurant Selector (Multisede) */}
          {allRestaurants.length > 0 && (
            <div className="flex items-center gap-1.5 bg-neutral-50 px-2.5 py-1.5 rounded-xl border border-neutral-200">
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
                className="bg-transparent text-xs sm:text-sm font-bold text-neutral-800 outline-none cursor-pointer pr-1"
                disabled={!currentUserAccount && currentEmployee?.puesto !== 'admin' && allRestaurants.length <= 1}
              >
                {allRestaurants.map((rest) => (
                  <option key={rest.id} value={rest.id}>
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

        {/* Right: Audio Control, Security Alerts, Shift Timer, Notifications & Logout */}
        <div className="flex items-center gap-2 sm:gap-3">
          
          {/* Sound Mute / Unmute / Test Button */}
          <button
            type="button"
            onClick={handleToggleSound}
            className={`p-2 rounded-xl transition border flex items-center justify-center ${
              isAudioMuted 
                ? 'bg-neutral-100 text-neutral-400 border-neutral-200 hover:text-neutral-700 hover:bg-neutral-200' 
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            }`}
            title={isAudioMuted ? 'Sonidos silenciados (Clic para activar notificaciones sonoras)' : 'Sonidos activos (Clic para silenciar)'}
          >
            {isAudioMuted ? (
              <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 animate-pulse" />
            )}
          </button>

          {/* Security alerts indicator for Admin/Owner */}
          {currentUserAccount && (
            <div className="relative">
              <button
                onClick={() => setShowAlertsModal(!showAlertsModal)}
                className={`relative p-2 rounded-xl transition border ${
                  unreadAlerts.length > 0
                    ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                    : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 border-neutral-200'
                }`}
                title="Alertas de Seguridad y Auditoría"
              >
                <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />
                {unreadAlerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
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
                      securityAlerts.map(alert => (
                        <div 
                          key={alert.id}
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

          {/* Shift Active Indicator (for staff) */}
          {currentShift && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200/80 rounded-xl text-xs font-semibold text-amber-900">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>{shiftDuration}</span>
            </div>
          )}

          {/* Notifications bell (alerta de cocina a mesero) */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-xl text-neutral-600 hover:text-orange-600 hover:bg-orange-50 transition border border-neutral-200"
              title="Notificaciones de pedidos"
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
              {readyOrdersForServer.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-orange-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
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
                      className="text-[10px] font-bold text-orange-600 hover:underline flex items-center gap-0.5"
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
                    readyOrdersForServer.map(o => (
                      <div 
                        key={o.id}
                        onClick={() => {
                          sounds.stopRepeatingAlarm('ord-ready-' + o.id);
                          sounds.stopRepeatingAlarm('ord-rej-' + o.id);
                          onOrderClick?.(o);
                          setShowNotifications(false);
                        }}
                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                          o.estado === 'listo' 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100' 
                            : 'bg-red-50 border-red-200 text-red-900 hover:bg-red-100'
                        }`}
                      >
                        <div className="font-bold flex items-center justify-between">
                          <span>
                            {o.tipo === 'local' ? `Mesa #${o.mesaNumero}` : `Delivery (${o.empresaDelivery || 'General'})`}
                          </span>
                          <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-white/80">
                            {o.estado === 'listo' ? '¡LISTO PARA ENTREGAR!' : 'RECHAZADO'}
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
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User badge */}
          <div className="flex items-center gap-2 pl-2 border-l border-neutral-200">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-black text-neutral-900 leading-tight">
                {userDisplayName}
              </div>
              <span className={`text-[10px] uppercase font-extrabold px-1.5 py-0.2 rounded border ${roleColors[userRole] || 'bg-neutral-100'}`}>
                {userRole === 'owner' ? 'DUEÑO (OWNER)' : userRole}
              </span>
            </div>

            {/* Logout or End Shift Button */}
            {currentUserAccount ? (
              <button
                onClick={logoutAdmin}
                className="px-2.5 sm:px-3 py-2 rounded-xl bg-neutral-100 hover:bg-red-50 text-neutral-700 hover:text-red-700 border border-neutral-200 text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                title="Cerrar sesión de Administrador"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Cerrar Sesión</span>
              </button>
            ) : (
              <button
                onClick={() => setShowEndShiftModal(true)}
                className="px-2.5 sm:px-3 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                title="Cerrar turno y ver balance"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Cerrar Turno</span>
              </button>
            )}
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

