import React, { useState } from 'react';
import { 
  Bell, 
  Volume2, 
  VolumeX, 
  Eye, 
  Sparkles, 
  Clock, 
  Vibrate, 
  RotateCcw, 
  Check, 
  X, 
  Play, 
  Sliders, 
  Radio, 
  SunMedium,
  Layers
} from 'lucide-react';
import { haptics } from '../utils/haptics';

export interface KitchenNotificationConfig {
  // Alertas Sonoras
  soundEnabled: boolean;
  volume: number; // 0.1 a 1.0 (e.g. 0.35, 0.75, 1.0)
  tone: 'campana' | 'buzzer' | 'chime' | 'sirena';
  alarmMode: 'continuous' | 'once';
  repeatIntervalSeconds: number; // 3, 5, 8, 12
  soundOnReady: boolean;

  // Alertas Visuales
  visualFlashing: boolean;
  flashSpeed: 'normal' | 'fast';
  showTopBanner: boolean;
  overdueMinutes: number; // e.g. 10, 15, 20, 25
  highContrast: boolean;
  vibration: boolean;
}

export const DEFAULT_KITCHEN_NOTIFICATIONS: KitchenNotificationConfig = {
  soundEnabled: true,
  volume: 0.8,
  tone: 'campana',
  alarmMode: 'continuous',
  repeatIntervalSeconds: 4,
  soundOnReady: true,
  visualFlashing: true,
  flashSpeed: 'normal',
  showTopBanner: true,
  overdueMinutes: 15,
  highContrast: false,
  vibration: true
};

interface KitchenNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: KitchenNotificationConfig;
  onSaveConfig: (updated: KitchenNotificationConfig) => void;
  onTestSound: (tone: 'campana' | 'buzzer' | 'chime' | 'sirena', volume: number) => void;
}

export const KitchenNotificationModal: React.FC<KitchenNotificationModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onTestSound
}) => {
  const [localConfig, setLocalConfig] = useState<KitchenNotificationConfig>(config);
  const [activeTab, setActiveTab] = useState<'sound' | 'visual'>('sound');
  const [justTested, setJustTested] = useState(false);

  if (!isOpen) return null;

  const handleToggleSound = (enabled: boolean) => {
    setLocalConfig(prev => ({ ...prev, soundEnabled: enabled }));
  };

  const handleTestCurrent = () => {
    haptics.impactMedium();
    setJustTested(true);
    onTestSound(localConfig.tone, localConfig.volume);
    setTimeout(() => setJustTested(false), 1200);
  };

  const handleResetDefaults = () => {
    setLocalConfig(DEFAULT_KITCHEN_NOTIFICATIONS);
  };

  const handleSaveAndClose = () => {
    onSaveConfig(localConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none">
      <div 
        id="kitchen-notification-settings-dialog"
        className="bg-neutral-900 border border-neutral-700/80 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-neutral-100 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/20 border border-orange-500/30 text-orange-400 flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-white">
                Alertas de Cocina (KDS)
              </h3>
              <p className="text-xs text-neutral-400">
                Ajusta las notificaciones sonoras y visuales para nuevos pedidos
              </p>
            </div>
          </div>
          <button
            id="close-kitchen-notifications-btn"
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-800 bg-neutral-950/60 p-1.5 gap-1.5 shrink-0">
          <button
            id="tab-sound-alerts-btn"
            type="button"
            onClick={() => setActiveTab('sound')}
            className={`flex-1 min-h-[44px] rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition ${
              activeTab === 'sound'
                ? 'bg-orange-600 text-white shadow-md'
                : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            <span>Alertas Sonoras</span>
            {localConfig.soundEnabled ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            ) : (
              <span className="w-2 h-2 rounded-full bg-red-400"></span>
            )}
          </button>
          <button
            id="tab-visual-alerts-btn"
            type="button"
            onClick={() => setActiveTab('visual')}
            className={`flex-1 min-h-[44px] rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition ${
              activeTab === 'visual'
                ? 'bg-orange-600 text-white shadow-md'
                : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>Alertas Visuales</span>
            {localConfig.visualFlashing && (
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            )}
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs sm:text-sm">
          {activeTab === 'sound' && (
            <div className="space-y-4">
              {/* Master Sound Switch */}
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    localConfig.soundEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {localConfig.soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                  </div>
                  <div>
                    <span className="font-bold text-white block">
                      Sonido de Notificaciones
                    </span>
                    <span className="text-xs text-neutral-400">
                      {localConfig.soundEnabled ? 'Alarmas activadas para nuevos pedidos' : 'Cocina en modo silencioso'}
                    </span>
                  </div>
                </div>
                <button
                  id="toggle-master-sound-btn"
                  type="button"
                  onClick={() => handleToggleSound(!localConfig.soundEnabled)}
                  className={`min-h-[44px] px-4 rounded-xl font-black text-xs transition ${
                    localConfig.soundEnabled 
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500' 
                      : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                  }`}
                >
                  {localConfig.soundEnabled ? 'ACTIVADO' : 'MUTED'}
                </button>
              </div>

              {localConfig.soundEnabled && (
                <>
                  {/* Selector de Tono */}
                  <div>
                    <label className="block text-xs font-black text-neutral-300 uppercase tracking-wider mb-2">
                      Tono de Campana para Nuevos Pedidos
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { 
                          id: 'campana', 
                          name: 'Campana Restaurante', 
                          desc: 'Ding metálico tradicional y claro',
                          badge: 'Recomendado'
                        },
                        { 
                          id: 'buzzer', 
                          name: 'Buzzer Industrial', 
                          desc: 'Zumbido penetrante para cocinas ruidosas',
                          badge: 'Fuerte'
                        },
                        { 
                          id: 'chime', 
                          name: 'Chime Melódico', 
                          desc: 'Secuencia suave de 4 tonos armónicos',
                          badge: 'Suave'
                        },
                        { 
                          id: 'sirena', 
                          name: 'Alerta Rápida', 
                          desc: 'Tono oscilante urgente para horas pico',
                          badge: 'Urgente'
                        },
                      ].map(t => {
                        const isSelected = localConfig.tone === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setLocalConfig({ ...localConfig, tone: t.id as any });
                              onTestSound(t.id as any, localConfig.volume);
                            }}
                            className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between min-h-[70px] ${
                              isSelected
                                ? 'bg-orange-600/20 border-orange-500 text-white shadow-xs'
                                : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800/40'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-xs text-white">{t.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                isSelected ? 'bg-orange-500 text-white' : 'bg-neutral-800 text-neutral-400'
                              }`}>
                                {t.badge}
                              </span>
                            </div>
                            <span className="text-[11px] text-neutral-400 mt-1 leading-tight">{t.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Volumen de Alerta */}
                  <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-neutral-300 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-orange-400" />
                        Volumen de Alerta
                      </span>
                      <span className="font-mono font-black text-orange-400">
                        {Math.round(localConfig.volume * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <VolumeX className="w-4 h-4 text-neutral-500" />
                      <input
                        id="sound-volume-slider"
                        type="range"
                        min="0.15"
                        max="1"
                        step="0.05"
                        value={localConfig.volume}
                        onChange={(e) => setLocalConfig({ ...localConfig, volume: parseFloat(e.target.value) })}
                        className="flex-1 accent-orange-500 h-2 bg-neutral-800 rounded-lg cursor-pointer"
                      />
                      <Volume2 className="w-4 h-4 text-orange-400" />
                    </div>
                  </div>

                  {/* Modo de Alarma: Continuo vs Una vez */}
                  <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2.5">
                    <span className="font-bold text-neutral-300 block text-xs">
                      Comportamiento de la Alarma al Recibir Comanda
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setLocalConfig({ ...localConfig, alarmMode: 'continuous' })}
                        className={`p-2.5 rounded-xl border text-left transition ${
                          localConfig.alarmMode === 'continuous'
                            ? 'bg-orange-600/20 border-orange-500 text-white'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                        }`}
                      >
                        <div className="font-black text-xs text-white">Continuo (Recomendado)</div>
                        <div className="text-[11px] text-neutral-400 mt-0.5">Suena repetidamente hasta pulsar "Aceptar"</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocalConfig({ ...localConfig, alarmMode: 'once' })}
                        className={`p-2.5 rounded-xl border text-left transition ${
                          localConfig.alarmMode === 'once'
                            ? 'bg-orange-600/20 border-orange-500 text-white'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                        }`}
                      >
                        <div className="font-black text-xs text-white">Un Solo Ding</div>
                        <div className="text-[11px] text-neutral-400 mt-0.5">Suena una sola vez al entrar el pedido</div>
                      </button>
                    </div>

                    {localConfig.alarmMode === 'continuous' && (
                      <div className="pt-2 flex items-center justify-between border-t border-neutral-800 text-xs">
                        <span className="text-neutral-400">Intervalo de repetición:</span>
                        <div className="flex gap-1.5">
                          {[3, 4, 6, 10].map(sec => (
                            <button
                              key={sec}
                              type="button"
                              onClick={() => setLocalConfig({ ...localConfig, repeatIntervalSeconds: sec })}
                              className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs transition ${
                                localConfig.repeatIntervalSeconds === sec
                                  ? 'bg-orange-600 text-white'
                                  : 'bg-neutral-900 text-neutral-400 hover:text-white'
                              }`}
                            >
                              {sec}s
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sonido al finalizar comanda */}
                  <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white text-xs block">
                        Sonido al Marcar Ronda Lista
                      </span>
                      <span className="text-[11px] text-neutral-400">
                        Reproduce un acorde de confirmación al terminar la preparación
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLocalConfig({ ...localConfig, soundOnReady: !localConfig.soundOnReady })}
                      className={`min-h-[38px] px-3 rounded-xl font-bold text-xs transition ${
                        localConfig.soundOnReady 
                          ? 'bg-emerald-600 text-white' 
                          : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      {localConfig.soundOnReady ? 'SÍ' : 'NO'}
                    </button>
                  </div>

                  {/* Botón de Prueba Rápida */}
                  <button
                    id="test-sound-preview-btn"
                    type="button"
                    onClick={handleTestCurrent}
                    className={`w-full min-h-[46px] rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 border transition ${
                      justTested 
                        ? 'bg-emerald-600 border-emerald-500 text-white' 
                        : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-orange-400'
                    }`}
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>{justTested ? '¡Reproduciendo Alerta!' : 'Probar Tono Configurado Ahora'}</span>
                  </button>
                </>
              )}
            </div>
          )}

          {activeTab === 'visual' && (
            <div className="space-y-4">
              {/* Parpadeo de tarjetas de comandas pendientes */}
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white text-xs block">
                    Parpadeo Luminoso en Comandas Nuevas
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    Borde naranja vibrante pulsante para que destaquen inmediatamente
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setLocalConfig({ ...localConfig, visualFlashing: !localConfig.visualFlashing })}
                  className={`min-h-[40px] px-3.5 rounded-xl font-black text-xs transition ${
                    localConfig.visualFlashing ? 'bg-orange-600 text-white' : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {localConfig.visualFlashing ? 'PULSANTE' : 'ESTÁTICO'}
                </button>
              </div>

              {/* Banner superior de aviso masivo */}
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white text-xs block">
                    Banner Superior Fijo de Nuevos Pedidos
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    Muestra la barra superior con contador y botón para "Aceptar Todo"
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setLocalConfig({ ...localConfig, showTopBanner: !localConfig.showTopBanner })}
                  className={`min-h-[40px] px-3.5 rounded-xl font-black text-xs transition ${
                    localConfig.showTopBanner ? 'bg-orange-600 text-white' : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {localConfig.showTopBanner ? 'VISIBLE' : 'OCULTO'}
                </button>
              </div>

              {/* Tiempo de Demora / Alerta de Retraso */}
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-red-400" />
                    Alerta de Demora Excesiva (Tarjeta Roja)
                  </span>
                  <span className="font-mono font-bold text-red-400">
                    +{localConfig.overdueMinutes} min
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Resalta la tarjeta en color rojo de advertencia cuando la preparación supera este tiempo:
                </p>
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {[10, 15, 20, 30].map(mins => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setLocalConfig({ ...localConfig, overdueMinutes: mins })}
                      className={`min-h-[38px] rounded-xl font-mono font-black text-xs transition border ${
                        localConfig.overdueMinutes === mins
                          ? 'bg-red-600/30 border-red-500 text-red-200'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>
              </div>

              {/* Modo Alto Contraste para pantallas lejanas */}
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <SunMedium className="w-3.5 h-3.5 text-yellow-400" />
                    Modo Alto Contraste
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    Bordes más gruesos y tipografía ampliada para pantallas colgadas lejos
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setLocalConfig({ ...localConfig, highContrast: !localConfig.highContrast })}
                  className={`min-h-[40px] px-3.5 rounded-xl font-black text-xs transition ${
                    localConfig.highContrast ? 'bg-yellow-600 text-white' : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {localConfig.highContrast ? 'ALTO' : 'ESTÁNDAR'}
                </button>
              </div>

              {/* Vibración háptica en tablets táctiles */}
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Vibrate className="w-3.5 h-3.5 text-blue-400" />
                    Vibración en Dispositivos Táctiles
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    Retroalimentación háptica al pulsar botones y al recibir pedidos
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setLocalConfig({ ...localConfig, vibration: !localConfig.vibration })}
                  className={`min-h-[40px] px-3.5 rounded-xl font-black text-xs transition ${
                    localConfig.vibration ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {localConfig.vibration ? 'ACTIVA' : 'OFF'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="min-h-[44px] px-3.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white font-bold text-xs flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Por Defecto</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs transition"
            >
              Cancelar
            </button>
            <button
              id="save-kitchen-notifications-btn"
              type="button"
              onClick={handleSaveAndClose}
              className="min-h-[44px] px-5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-orange-600/30 transition"
            >
              <Check className="w-4 h-4" />
              <span>Guardar Configuración</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
