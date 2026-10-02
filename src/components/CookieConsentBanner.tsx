import React, { useState, useEffect } from 'react';
import { 
  Cookie, 
  ShieldCheck, 
  Check, 
  X, 
  Settings, 
  Lock, 
  FileText, 
  Sparkles,
  Info
} from 'lucide-react';
import { sounds } from '../utils/sound';
import { haptics } from '../utils/haptics';

interface CookieConsentBannerProps {
  onOpenContract?: () => void;
}

interface CookieSettings {
  essential: boolean;
  functional: boolean;
  analytics: boolean;
}

const STORAGE_KEY = 'gastro_cookie_consent_v1';

export const CookieConsentBanner: React.FC<CookieConsentBannerProps> = ({ onOpenContract }) => {
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState<boolean>(false);
  const [settings, setSettings] = useState<CookieSettings>({
    essential: true, // Always required for POS & Auth
    functional: true,
    analytics: true
  });

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      // Show banner after brief delay
      const timer = setTimeout(() => setIsVisible(true), 1200);
      return () => clearTimeout(timer);
    } else {
      try {
        const parsed = JSON.parse(stored);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch {
        // fallback
      }
    }
  }, []);

  // Listen for global custom event to re-open cookie settings anytime
  useEffect(() => {
    const handleOpenCookies = () => {
      setIsVisible(true);
      setShowPreferencesModal(true);
    };
    window.addEventListener('open-cookie-settings', handleOpenCookies);
    return () => window.removeEventListener('open-cookie-settings', handleOpenCookies);
  }, []);

  const saveConsent = (acceptedSettings: CookieSettings) => {
    sounds.playKeypadClick();
    haptics.tap();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(acceptedSettings));
    setSettings(acceptedSettings);
    setIsVisible(false);
    setShowPreferencesModal(false);
  };

  const handleAcceptAll = () => {
    saveConsent({ essential: true, functional: true, analytics: true });
  };

  const handleAcceptEssentialOnly = () => {
    saveConsent({ essential: true, functional: false, analytics: false });
  };

  if (!isVisible && !showPreferencesModal) return null;

  return (
    <>
      {/* Banner Principal Flotante en Bottom */}
      {isVisible && !showPreferencesModal && (
        <aside 
          aria-label="Consentimiento de cookies" 
          role="region"
          className="fixed bottom-3 left-3 right-3 sm:left-6 sm:right-6 max-w-4xl mx-auto bg-slate-900/95 backdrop-blur-md text-white p-4 sm:p-5 rounded-3xl shadow-2xl border border-slate-700/80 z-40 animate-in slide-in-from-bottom-6 duration-200"
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            
            {/* Left: Icon & Description */}
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <Cookie className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-sm text-white">
                    Autorización de Cookies & Privacidad de Datos
                  </h4>
                  <span className="px-2 py-0.2 rounded-full text-[9px] font-black uppercase bg-slate-800 text-emerald-400 border border-emerald-500/30">
                    RGPD Seguro
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                  Gastro Smart utiliza cookies esenciales para la autenticación por PIN/Sesión, sincronización en tiempo real de comandas de cocina y almacenamiento local seguro de tickets térmicos. Nunca vendemos tus datos comerciales ni tus recetas.
                </p>
                {onOpenContract && (
                  <button
                    type="button"
                    onClick={onOpenContract}
                    className="text-[11px] font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2 flex items-center gap-1 pt-0.5 cursor-pointer"
                  >
                    <FileText className="w-3 h-3" />
                    <span>Leer Contrato de Confidencialidad & Secreto Comercial</span>
                  </button>
                )}
              </div>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0 justify-end pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
              <button
                type="button"
                onClick={() => setShowPreferencesModal(true)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                <span>Configurar</span>
              </button>
              
              <button
                type="button"
                onClick={handleAcceptEssentialOnly}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition border border-slate-700 cursor-pointer"
              >
                Solo Esenciales
              </button>

              <button
                type="button"
                onClick={handleAcceptAll}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition shadow-md shadow-emerald-600/20 flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Aceptar Todas</span>
              </button>
            </div>

          </div>
        </aside>
      )}

      {/* Modal de Preferencias Detalladas */}
      {showPreferencesModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-neutral-200 space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Cookie className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-neutral-900 text-sm sm:text-base">
                    Configuración de Cookies & Privacidad
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Personaliza las tecnologías de almacenamiento según tus preferencias
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPreferencesModal(false)}
                className="p-1.5 rounded-xl hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* 1. Esenciales */}
              <div className="p-3 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <strong className="text-neutral-900 font-bold">1. Cookies Estrictamente Esenciales</strong>
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.2 bg-neutral-200 text-neutral-800 rounded">
                      Obligatorias
                    </span>
                  </div>
                  <p className="text-neutral-500 text-[11px] leading-snug">
                    Requeridas para la sesión de cajeros, meseros, autenticación segura con Firebase Auth y prevención de fraudes. No pueden desactivarse.
                  </p>
                </div>
                <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
              </div>

              {/* 2. Funcionales */}
              <div className="p-3 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <strong className="text-neutral-900 font-bold">2. Cookies Funcionales & POS</strong>
                  <p className="text-neutral-500 text-[11px] leading-snug">
                    Guardan preferencias del rollo térmico (58mm/80mm), sonidos de caja, volumen y recordatorio del último restaurante seleccionado.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.functional}
                  onChange={(e) => setSettings(prev => ({ ...prev, functional: e.target.checked }))}
                  className="w-5 h-5 accent-indigo-600 rounded cursor-pointer mt-0.5"
                />
              </div>

              {/* 3. Diagnóstico y Rendimiento */}
              <div className="p-3 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <strong className="text-neutral-900 font-bold">3. Diagnóstico de Red & Modo Offline</strong>
                  <p className="text-neutral-500 text-[11px] leading-snug">
                    Permite la recuperación automática de red y colas de pedidos offline en caso de cortes de internet temporal en el local.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.analytics}
                  onChange={(e) => setSettings(prev => ({ ...prev, analytics: e.target.checked }))}
                  className="w-5 h-5 accent-indigo-600 rounded cursor-pointer mt-0.5"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-between gap-2 border-t border-neutral-100">
              {onOpenContract && (
                <button
                  type="button"
                  onClick={() => {
                    setShowPreferencesModal(false);
                    onOpenContract();
                  }}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                >
                  Ver Contrato
                </button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => saveConsent(settings)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  Guardar Preferencias
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
