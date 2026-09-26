import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi, RefreshCw, ShieldAlert } from 'lucide-react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

interface OfflineIndicatorProps {
  isLoadingLiveData?: boolean;
  onRetry?: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  isLoadingLiveData = false,
  onRetry,
}) => {
  const isOnline = useOnlineStatus();
  const [showBackOnlineToast, setShowBackOnlineToast] = useState(false);
  const [prevOnline, setPrevOnline] = useState(isOnline);
  const [dismissedOverlay, setDismissedOverlay] = useState(false);

  useEffect(() => {
    if (!prevOnline && isOnline) {
      setShowBackOnlineToast(true);
      setDismissedOverlay(false);
      const timer = setTimeout(() => setShowBackOnlineToast(false), 4000);
      return () => clearTimeout(timer);
    }
    if (!isOnline && prevOnline) {
      setDismissedOverlay(false);
    }
    setPrevOnline(isOnline);
  }, [isOnline, prevOnline]);

  if (!isOnline) {
    return (
      <>
        {/* Pantalla amigable de "Sin conexión" cuando no hay red */}
        {(!dismissedOverlay || isLoadingLiveData) && (
          <div className="fixed inset-0 z-[9990] bg-neutral-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-neutral-900 border border-amber-500/40 rounded-3xl max-w-md w-full p-6 text-white shadow-2xl space-y-5 text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto">
                <WifiOff className="w-8 h-8 text-amber-400" />
              </div>

              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-black uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  Modo Offline Activo
                </span>
                <h2 className="text-xl font-black text-white">Sin conexión a Internet</h2>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  La aplicación <strong>Gastro Smart</strong> se cargó desde la memoria caché del dispositivo, pero en este momento no hay red para sincronizar datos en vivo con el servidor.
                </p>
              </div>

              <div className="bg-neutral-800/80 border border-neutral-700 rounded-2xl p-3.5 text-left text-xs text-neutral-300 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-200">¿Qué puedes hacer?</div>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Verifica tu conexión Wi-Fi o datos móviles. En cuanto vuelva la señal, la aplicación reconectará automáticamente sin perder tu sesión actual.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (onRetry) {
                      onRetry();
                    } else {
                      window.location.reload();
                    }
                  }}
                  className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Reintentar conexión</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedOverlay(true)}
                  className="flex-1 h-11 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs transition cursor-pointer border border-neutral-700"
                >
                  Ver pantalla en caché
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Indicador flotante inferior persistente */}
        <div
          onClick={() => setDismissedOverlay(false)}
          title="Haz clic para ver el estado de conexión"
          className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-2xl bg-neutral-900/95 backdrop-blur-md border border-amber-500/50 px-3.5 py-2 text-xs font-semibold text-white shadow-xl animate-in slide-in-from-bottom-2 duration-200 cursor-pointer hover:bg-neutral-800"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
          </span>
          <WifiOff className="w-4 h-4 text-amber-400" />
          <span className="text-amber-200 font-bold">Sin Conexión</span>
          <span className="text-neutral-400 text-[11px] hidden sm:inline">— App en caché activa (Clic para detalles)</span>
        </div>
      </>
    );
  }

  if (showBackOnlineToast) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-2xl bg-emerald-950/90 backdrop-blur-md border border-emerald-500/50 px-3.5 py-2 text-xs font-semibold text-white shadow-xl animate-in slide-in-from-bottom-2 duration-200">
        <Wifi className="w-4 h-4 text-emerald-400" />
        <span className="text-emerald-300 font-bold">Conexión Restaurada</span>
        <span className="text-emerald-200/80 text-[11px] hidden sm:inline">— Sincronizando datos en vivo</span>
      </div>
    );
  }

  return null;
};
