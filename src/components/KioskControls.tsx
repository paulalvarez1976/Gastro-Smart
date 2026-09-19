import React from 'react';
import { Sun, SunDim, Maximize, Minimize } from 'lucide-react';
import { useKioskMode } from '../hooks/useKioskMode';
import { haptics } from '../utils/haptics';

interface KioskControlsProps {
  className?: string;
  variant?: 'nav' | 'compact';
}

export const KioskControls: React.FC<KioskControlsProps> = ({ className = '', variant = 'nav' }) => {
  const { isWakeLocked, wakeLockSupported, toggleWakeLock, isFullscreen, toggleFullscreen } = useKioskMode();

  const handleWakeLockClick = async () => {
    haptics.tap();
    await toggleWakeLock();
  };

  const handleFullscreenClick = async () => {
    haptics.tap();
    await toggleFullscreen();
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {/* WakeLock Button */}
      {wakeLockSupported && (
        <button
          type="button"
          onClick={handleWakeLockClick}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
            isWakeLocked
              ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
              : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200'
          }`}
          title={isWakeLocked ? 'Pantalla siempre activa (Kiosco ON)' : 'Activar pantalla siempre encendida (Evitar reposo en KDS/Caja)'}
        >
          {isWakeLocked ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-600 animate-spin-slow" />
              <span className="hidden lg:inline text-[11px]">Kiosco Activo</span>
            </>
          ) : (
            <>
              <SunDim className="w-3.5 h-3.5 text-neutral-500" />
              <span className="hidden lg:inline text-[11px]">Mantener Activo</span>
            </>
          )}
        </button>
      )}

      {/* Fullscreen Toggle */}
      <button
        type="button"
        onClick={handleFullscreenClick}
        className="p-1.5 rounded-xl bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-200 transition cursor-pointer"
        title={isFullscreen ? 'Salir de pantalla completa' : 'Modo Pantalla Completa POS/KDS'}
      >
        {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};
