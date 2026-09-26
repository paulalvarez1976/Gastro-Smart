import { useState, useCallback } from 'react';

export function useKioskMode() {
  const [isWakeLocked, setIsWakeLocked] = useState(false);
  const [wakeLockSupported] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Safe in-app display active mode without triggering native WakeLock permissions/locker errors in iframes
  const toggleWakeLock = useCallback(async () => {
    setIsWakeLocked(prev => {
      const next = !prev;
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('gastro-keep-awake', next);
      }
      return next;
    });
    return !isWakeLocked;
  }, [isWakeLocked]);

  // Safe in-viewport expanded mode without calling document.requestFullscreen() which triggers Browser Locker detection
  const toggleFullscreen = useCallback(async () => {
    setIsFullscreen(prev => {
      const next = !prev;
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('gastro-expanded-view', next);
      }
      return next;
    });
  }, []);

  return {
    isWakeLocked,
    wakeLockSupported,
    toggleWakeLock,
    isFullscreen,
    toggleFullscreen
  };
}
