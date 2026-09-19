import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

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

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [showBackOnlineToast, setShowBackOnlineToast] = useState(false);
  const [prevOnline, setPrevOnline] = useState(isOnline);

  useEffect(() => {
    if (!prevOnline && isOnline) {
      setShowBackOnlineToast(true);
      const timer = setTimeout(() => setShowBackOnlineToast(false), 4000);
      return () => clearTimeout(timer);
    }
    setPrevOnline(isOnline);
  }, [isOnline, prevOnline]);

  if (!isOnline) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-2xl bg-neutral-900/90 backdrop-blur-md border border-amber-500/50 px-3.5 py-2 text-xs font-semibold text-white shadow-xl animate-in slide-in-from-bottom-2 duration-200">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
        </span>
        <WifiOff className="w-4 h-4 text-amber-400" />
        <span className="text-amber-200 font-bold">Modo Sin Conexión</span>
        <span className="text-neutral-400 text-[11px] hidden sm:inline">— Datos locales activos</span>
      </div>
    );
  }

  if (showBackOnlineToast) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-2xl bg-emerald-950/90 backdrop-blur-md border border-emerald-500/50 px-3.5 py-2 text-xs font-semibold text-white shadow-xl animate-in slide-in-from-bottom-2 duration-200">
        <Wifi className="w-4 h-4 text-emerald-400" />
        <span className="text-emerald-300 font-bold">Conexión Restaurada</span>
        <span className="text-emerald-200/80 text-[11px] hidden sm:inline">— Sincronizando datos</span>
      </div>
    );
  }

  return null;
};
