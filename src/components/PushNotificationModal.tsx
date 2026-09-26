import React, { useState, useEffect } from 'react';
import {
  BellRing,
  CheckCircle2,
  ShieldAlert,
  Smartphone,
  X,
  Send,
  Clock,
  RefreshCw,
  Check,
  Radio,
  KeyRound,
  Info
} from 'lucide-react';
import {
  pushNotificationService,
  PushNotificationPreferences
} from '../services/pushNotificationService';
import { sounds } from '../utils/sound';

interface PushNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId?: string;
  restaurantId?: string | null;
  restaurantName?: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  onStatusChange?: (permission: NotificationPermission | 'unsupported', enabled: boolean) => void;
}

export const PushNotificationModal: React.FC<PushNotificationModalProps> = ({
  isOpen,
  onClose,
  businessId,
  restaurantId,
  restaurantName,
  userId,
  userName,
  userRole,
  onStatusChange
}) => {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    pushNotificationService.getPermissionStatus()
  );
  const [prefs, setPrefs] = useState<PushNotificationPreferences>(() =>
    pushNotificationService.getPreferences()
  );
  const [deviceToken, setDeviceToken] = useState<string | null>(() =>
    pushNotificationService.getStoredToken()
  );
  const [registeredDevicesCount, setRegisteredDevicesCount] = useState<number>(0);
  const [isRegistering, setIsRegistering] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [countdownSec, setCountdownSec] = useState<number | null>(null);
  const [showAdvancedVapid, setShowAdvancedVapid] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPermission(pushNotificationService.getPermissionStatus());
    setPrefs(pushNotificationService.getPreferences());
    setDeviceToken(pushNotificationService.getStoredToken());
    if (businessId) {
      pushNotificationService.getRegisteredDevicesCount(businessId).then(setRegisteredDevicesCount);
    }
  }, [isOpen, businessId]);

  if (!isOpen) return null;

  const handleActivatePush = async () => {
    setIsRegistering(true);
    setStatusMessage(null);
    try {
      const result = await pushNotificationService.requestPermissionAndRegister({
        businessId,
        restaurantId,
        userId,
        userName,
        userRole
      });
      setPermission(result.permission);
      if (result.token) {
        setDeviceToken(result.token);
      }
      if (result.success) {
        const updatedPrefs = { ...prefs, enabled: true };
        setPrefs(updatedPrefs);
        pushNotificationService.savePreferences(updatedPrefs);
        onStatusChange?.(result.permission, true);
        sounds.playNotification();
        setStatusMessage({
          type: 'success',
          text: result.message
        });
        if (businessId) {
          pushNotificationService.getRegisteredDevicesCount(businessId).then(setRegisteredDevicesCount);
        }
      } else {
        setStatusMessage({
          type: 'error',
          text: result.message
        });
      }
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'No se pudo completar el registro de notificaciones push.'
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleUpdatePrefs = (partial: Partial<PushNotificationPreferences>) => {
    const updated = { ...prefs, ...partial };
    setPrefs(updated);
    pushNotificationService.savePreferences(updated);
    onStatusChange?.(permission, updated.enabled);
  };

  const handleSendImmediateTest = async () => {
    if (permission !== 'granted') {
      await handleActivatePush();
      if (pushNotificationService.getPermissionStatus() !== 'granted') return;
    }

    const sent = await pushNotificationService.showNativeNotification({
      title: `🔥 Nuevo Pedido en ${restaurantName || 'Gastro Smart'}`,
      body: `Mesa #4 • 2x Lomo Saltado, 1x Limonada Frozen (Prueba Push FCM)`,
      notifType: 'test',
      forceShow: true
    });

    if (sent) {
      sounds.playNotification();
      setStatusMessage({
        type: 'success',
        text: '¡Notificación Push Nativa enviada! Revisa la bandeja de notificaciones de tu dispositivo.'
      });
    } else {
      setStatusMessage({
        type: 'warning',
        text: 'Asegúrate de conceder permisos de notificaciones al navegador o sistema.'
      });
    }
  };

  const handleSendBackgroundDelayedTest = async () => {
    if (permission !== 'granted') {
      await handleActivatePush();
      if (pushNotificationService.getPermissionStatus() !== 'granted') return;
    }

    setCountdownSec(4);
    setStatusMessage({
      type: 'success',
      text: 'Minimiza la app o bloquea tu pantalla ahora: recibirás la alerta nativa en 4 segundos...'
    });

    let remaining = 4;
    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdownSec(remaining);
      } else {
        clearInterval(interval);
        setCountdownSec(null);
        pushNotificationService.showNativeNotification({
          title: `🔔 ¡Pedido Nuevo en 2do Plano! (${restaurantName || 'Sucursal'})`,
          body: `Comanda urgente recibida para Cocina / Mostrador mientras la app estaba en segundo plano.`,
          notifType: 'new_order',
          forceShow: true
        });
      }
    }, 1000);
  };

  const isGranted = permission === 'granted';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-orange-600 to-amber-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center shadow-inner">
              <BellRing className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-base leading-tight">
                Notificaciones Push Nativas (FCM)
              </h3>
              <p className="text-[11px] text-orange-100 font-medium">
                Alertas de pedidos nuevos incluso con la app en 2do plano
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Estado de Conexión FCM & Permisos del Dispositivo */}
          <div className={`p-4 rounded-2xl border flex items-start justify-between gap-3 ${
            isGranted && prefs.enabled
              ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
              : permission === 'denied'
              ? 'bg-red-50 border-red-200 text-red-950'
              : 'bg-amber-50 border-amber-200 text-amber-950'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                isGranted && prefs.enabled
                  ? 'bg-emerald-600 text-white'
                  : permission === 'denied'
                  ? 'bg-red-600 text-white'
                  : 'bg-amber-500 text-white'
              }`}>
                {isGranted && prefs.enabled ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : permission === 'denied' ? (
                  <ShieldAlert className="w-5 h-5" />
                ) : (
                  <Smartphone className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="font-extrabold text-xs sm:text-sm flex items-center gap-2">
                  <span>
                    {isGranted && prefs.enabled
                      ? 'Push Nativas Activas en este Dispositivo'
                      : permission === 'denied'
                      ? 'Permiso Bloqueado en el Navegador'
                      : 'Activar Alertas en Segundo Plano'}
                  </span>
                </div>
                <p className="text-[11px] opacity-85 mt-0.5 leading-relaxed">
                  {isGranted && prefs.enabled
                    ? `Conectado a Firebase Cloud Messaging y Service Worker para el rol (${(userRole || 'personal').toUpperCase()}). Recibirás avisos del sistema aunque cambies de app.`
                    : permission === 'denied'
                    ? 'Debes habilitar el permiso de "Notificaciones" en la configuración del navegador o de la app Android para recibir alertas push.'
                    : 'Autoriza las notificaciones nativas para que el teléfono o tablet vibre y muestre alertas de pedidos nuevos en segundo plano.'}
                </p>
                {deviceToken && isGranted && (
                  <div className="mt-2 flex items-center gap-2 text-[10px] font-mono bg-white/80 px-2.5 py-1 rounded-lg border border-emerald-200/80 text-emerald-900">
                    <Radio className="w-3 h-3 text-emerald-600 animate-pulse shrink-0" />
                    <span className="truncate max-w-[230px]">Token FCM: {deviceToken}</span>
                    {registeredDevicesCount > 0 && (
                      <span className="ml-auto font-sans font-bold text-emerald-700 shrink-0">
                        • {registeredDevicesCount} disp.
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {!isGranted ? (
              <button
                type="button"
                onClick={handleActivatePush}
                disabled={isRegistering}
                className="px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shadow-md shadow-orange-600/20 transition shrink-0 cursor-pointer flex items-center gap-1.5"
              >
                {isRegistering ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <BellRing className="w-3.5 h-3.5" />
                )}
                <span>Activar</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleUpdatePrefs({ enabled: !prefs.enabled })}
                className={`px-3 py-1.5 rounded-xl font-black text-[11px] transition shrink-0 cursor-pointer ${
                  prefs.enabled
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'
                }`}
              >
                {prefs.enabled ? 'ACTIVO' : 'PAUSADO'}
              </button>
            )}
          </div>

          {statusMessage && (
            <div className={`p-3 rounded-xl border text-[11px] font-bold flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : statusMessage.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              <Info className="w-4 h-4 shrink-0" />
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Modo de Entrega (Segundo plano vs Siempre) */}
          <div className="bg-neutral-50 p-3.5 rounded-2xl border border-neutral-200 space-y-2.5">
            <label className="block font-extrabold text-neutral-800 text-xs">
              ¿Cuándo mostrar notificaciones nativas del sistema?
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleUpdatePrefs({ deliveryMode: 'always' })}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  prefs.deliveryMode === 'always'
                    ? 'bg-orange-50 border-orange-500 text-orange-950 ring-1 ring-orange-500'
                    : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <div className="font-black text-xs flex items-center justify-between">
                  <span>Siempre (Recomendado)</span>
                  {prefs.deliveryMode === 'always' && <Check className="w-3.5 h-3.5 text-orange-600" />}
                </div>
                <p className="text-[10px] text-neutral-500 mt-0.5 leading-snug">
                  Tanto en 2do plano (pantalla apagada / otra app) como con la app abierta.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleUpdatePrefs({ deliveryMode: 'background_only' })}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  prefs.deliveryMode === 'background_only'
                    ? 'bg-orange-50 border-orange-500 text-orange-950 ring-1 ring-orange-500'
                    : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <div className="font-black text-xs flex items-center justify-between">
                  <span>Solo en 2do Plano</span>
                  {prefs.deliveryMode === 'background_only' && <Check className="w-3.5 h-3.5 text-orange-600" />}
                </div>
                <p className="text-[10px] text-neutral-500 mt-0.5 leading-snug">
                  Muestra el banner del sistema únicamente cuando la app está minimizada.
                </p>
              </button>
            </div>
          </div>

          {/* Tipos de Eventos Push */}
          <div className="bg-neutral-50 p-3.5 rounded-2xl border border-neutral-200 space-y-2">
            <span className="block font-extrabold text-neutral-800 text-xs mb-1">
              Eventos que disparan Alerta Push al Personal
            </span>

            {[
              {
                key: 'notifyNewOrders' as const,
                title: '🔥 Nuevos Pedidos y Rondas Entrantes',
                desc: 'Alerta inmediata cuando ingresa una comanda nueva a Cocina o Mostrador'
              },
              {
                key: 'notifyOrderReady' as const,
                title: '🍽️ Pedidos Listos para Retirar / Entregar',
                desc: 'Avisa a Meseros y Mostrador cuando Cocina termina de preparar una orden'
              },
              {
                key: 'notifyOrderRejected' as const,
                title: '⚠️ Pedidos Rechazados y Alertas Operativas',
                desc: 'Notifica de inmediato si un plato fue rechazado o requiere atención'
              }
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-neutral-200/80 cursor-pointer hover:border-orange-300 transition"
              >
                <div className="pr-3">
                  <div className="font-bold text-neutral-900 text-xs">{item.title}</div>
                  <div className="text-[10px] text-neutral-500">{item.desc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={prefs[item.key]}
                  onChange={(e) => handleUpdatePrefs({ [item.key]: e.target.checked })}
                  className="w-4 h-4 accent-orange-600 rounded cursor-pointer shrink-0"
                />
              </label>
            ))}
          </div>

          {/* Configuración opcional de VAPID Key de Firebase Cloud Messaging */}
          <div className="border border-neutral-200 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvancedVapid(!showAdvancedVapid)}
              className="w-full px-3.5 py-2.5 bg-neutral-50 hover:bg-neutral-100 flex items-center justify-between text-[11px] font-bold text-neutral-600 cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-neutral-400" />
                Configuración avanzada de certificado Web Push (VAPID FCM)
              </span>
              <span>{showAdvancedVapid ? '▲' : '▼'}</span>
            </button>
            {showAdvancedVapid && (
              <div className="p-3.5 bg-white border-t border-neutral-200 space-y-2">
                <p className="text-[10px] text-neutral-500 leading-relaxed">
                  El Service Worker de Firebase Cloud Messaging funciona automáticamente. Si dispones de una clave pública Web Push (VAPID) de tu consola de Firebase, puedes ingresarla aquí:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={prefs.vapidKey || ''}
                    onChange={(e) => handleUpdatePrefs({ vapidKey: e.target.value })}
                    placeholder="Ej: BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFg..."
                    className="flex-1 px-3 py-1.5 rounded-xl border border-neutral-300 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    type="button"
                    onClick={handleActivatePush}
                    className="px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-[11px] cursor-pointer"
                  >
                    Sincronizar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Botones de Prueba de Notificaciones Nativas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleSendImmediateTest}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
            >
              <Send className="w-3.5 h-3.5 text-orange-400" />
              <span>Probar Push Ahora</span>
            </button>

            <button
              type="button"
              onClick={handleSendBackgroundDelayedTest}
              disabled={countdownSec !== null}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-900 border border-orange-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-orange-600" />
              <span>
                {countdownSec !== null
                  ? `Enviando en ${countdownSec}s (Minimiza)...`
                  : 'Probar en 2do Plano (4s)'}
              </span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-neutral-50 border-t border-neutral-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shadow-sm transition cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
