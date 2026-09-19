import { useState, useEffect } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type DeviceOrientation = 'portrait' | 'landscape';

export interface DeviceInfo {
  deviceType: DeviceType;
  orientation: DeviceOrientation;
  isTouch: boolean;
  isStandalone: boolean;
  isCompactHeight: boolean;
  width: number;
  height: number;
  label: string;
}

/**
 * Hook para reconocer en qué tipo de dispositivo se despliega la aplicación
 * (Móvil, Tablet/TPV o Escritorio), su orientación y dimensiones, permitiendo
 * adaptar la interfaz para que todos los comandos y botones entren en pantalla sin scroll.
 */
export function useDeviceDetection(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(() => {
    if (typeof window === 'undefined') {
      return {
        deviceType: 'desktop',
        orientation: 'landscape',
        isTouch: false,
        isStandalone: false,
        isCompactHeight: false,
        width: 1280,
        height: 800,
        label: 'Escritorio',
      };
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const orientation: DeviceOrientation = width < height ? 'portrait' : 'landscape';

    // Touch support detection
    const isTouch = 
      ('ontouchstart' in window) || 
      (navigator.maxTouchPoints > 0) || 
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    // Standalone PWA detection (instalada en pantalla de inicio)
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes('android-app://');

    // Categorización por ancho de pantalla
    let deviceType: DeviceType = 'desktop';
    if (width < 768) {
      deviceType = 'mobile';
    } else if (width >= 768 && width < 1024) {
      deviceType = 'tablet';
    } else {
      deviceType = 'desktop';
    }

    const isCompactHeight = height < 640;

    let label = 'Escritorio';
    if (deviceType === 'mobile') {
      label = orientation === 'portrait' ? 'Móvil Vertical' : 'Móvil Horizontal';
    } else if (deviceType === 'tablet') {
      label = orientation === 'portrait' ? 'Tablet / TPV Vertical' : 'Tablet / TPV Horizontal';
    } else {
      label = 'Pantalla PC / TPV';
    }

    return {
      deviceType,
      orientation,
      isTouch,
      isStandalone,
      isCompactHeight,
      width,
      height,
      label,
    };
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const orientation: DeviceOrientation = width < height ? 'portrait' : 'landscape';

      const isTouch = 
        ('ontouchstart' in window) || 
        (navigator.maxTouchPoints > 0) || 
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

      const isStandalone = 
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://');

      let deviceType: DeviceType = 'desktop';
      if (width < 768) {
        deviceType = 'mobile';
      } else if (width >= 768 && width < 1024) {
        deviceType = 'tablet';
      } else {
        deviceType = 'desktop';
      }

      const isCompactHeight = height < 640;

      let label = 'Escritorio';
      if (deviceType === 'mobile') {
        label = orientation === 'portrait' ? 'Móvil' : 'Móvil Apaisado';
      } else if (deviceType === 'tablet') {
        label = orientation === 'portrait' ? 'Tablet' : 'Tablet TPV';
      } else {
        label = 'Escritorio TPV';
      }

      setDeviceInfo({
        deviceType,
        orientation,
        isTouch,
        isStandalone,
        isCompactHeight,
        width,
        height,
        label,
      });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return deviceInfo;
}
