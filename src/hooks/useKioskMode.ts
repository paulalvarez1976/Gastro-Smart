import { useState, useEffect, useCallback } from 'react';

export function useKioskMode() {
  const [isWakeLocked, setIsWakeLocked] = useState(false);
  const [wakeLockSupported, setWakeLockSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wakeLockSentinel, setWakeLockSentinel] = useState<any>(null);

  useEffect(() => {
    // Check WakeLock support
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      setWakeLockSupported(true);
    }

    // Check Fullscreen state
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Request screen wake lock to keep display awake (essential for Kitchen & POS)
  const toggleWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return false;

    if (isWakeLocked && wakeLockSentinel) {
      try {
        await wakeLockSentinel.release();
        setWakeLockSentinel(null);
        setIsWakeLocked(false);
        return false;
      } catch (err) {
        console.warn('No se pudo liberar el Screen Wake Lock:', err);
      }
    } else {
      try {
        const sentinel = await (navigator as any).wakeLock.request('screen');
        sentinel.addEventListener('release', () => {
          setIsWakeLocked(false);
          setWakeLockSentinel(null);
        });
        setWakeLockSentinel(sentinel);
        setIsWakeLocked(true);
        return true;
      } catch (err: any) {
        const isDisallowedByPolicy = 
          err?.name === 'NotAllowedError' || 
          err?.name === 'SecurityError' || 
          (typeof err?.message === 'string' && (
            err.message.includes('permissions policy') || 
            err.message.includes('disallowed') ||
            err.message.includes('WakeLock')
          ));

        if (isDisallowedByPolicy) {
          console.warn('Screen Wake Lock no disponible en este marco/iframe por política de permisos.');
          setWakeLockSupported(false);
        } else {
          console.warn('No se pudo activar Screen Wake Lock:', err);
        }
        setIsWakeLocked(false);
        setWakeLockSentinel(null);
      }
    }
    return false;
  }, [isWakeLocked, wakeLockSentinel]);

  // Toggle Fullscreen (Kiosk full screen mode)
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          setIsFullscreen(true);
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
    } catch (err) {
      console.warn('No se pudo cambiar el modo de pantalla completa en este contexto:', err);
    }
  }, []);

  return {
    isWakeLocked,
    wakeLockSupported,
    toggleWakeLock,
    isFullscreen,
    toggleFullscreen
  };
}
