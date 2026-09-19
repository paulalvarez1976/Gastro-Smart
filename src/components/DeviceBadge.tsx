import React, { useState } from 'react';
import { useDeviceDetection } from '../hooks/useDeviceDetection';
import { Smartphone, Tablet, Monitor, Info, X, CheckCircle2, Maximize2 } from 'lucide-react';

export const DeviceBadge: React.FC = () => {
  const device = useDeviceDetection();
  const [showDetails, setShowDetails] = useState(false);

  const getDeviceIcon = () => {
    switch (device.deviceType) {
      case 'mobile':
        return <Smartphone className="w-3.5 h-3.5 text-orange-600" />;
      case 'tablet':
        return <Tablet className="w-3.5 h-3.5 text-blue-600" />;
      case 'desktop':
      default:
        return <Monitor className="w-3.5 h-3.5 text-emerald-600" />;
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowDetails(true)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 border border-neutral-200/80 text-[11px] font-bold text-neutral-700 transition cursor-pointer shrink-0"
        title={`Dispositivo detectado: ${device.label} (${device.width}x${device.height}px). Clic para ver ajustes de pantalla.`}
      >
        {getDeviceIcon()}
        <span className="hidden xl:inline">{device.label}</span>
        {device.isStandalone && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Modo App Nativa / Standalone activo" />
        )}
      </button>

      {/* Popover con detalles de reconocimiento del dispositivo y adaptaciones automáticas */}
      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl border border-neutral-200 text-neutral-900 space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
                  {getDeviceIcon()}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-neutral-900">Dispositivo Reconocido</h3>
                  <p className="text-xs text-neutral-500">{device.label}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDetails(false)}
                className="text-neutral-400 hover:text-neutral-700 p-1 rounded-lg hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-neutral-50 p-3 rounded-2xl border border-neutral-100">
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-bold">Tipo:</span>
                  <span className="font-extrabold text-neutral-800 capitalize">{device.deviceType}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-bold">Orientación:</span>
                  <span className="font-extrabold text-neutral-800 capitalize">
                    {device.orientation === 'portrait' ? 'Vertical' : 'Horizontal'}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-bold">Resolución:</span>
                  <span className="font-extrabold text-neutral-800">{device.width} × {device.height} px</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-bold">Modo App:</span>
                  <span className="font-extrabold text-neutral-800">
                    {device.isStandalone ? '✅ Nativa (PWA)' : '🌐 Navegador Web'}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Optimizaciones Activas:</span>
                </div>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-emerald-800">
                  <li>Todos los botones y comandos principales están anclados a la pantalla.</li>
                  <li>
                    {device.deviceType === 'mobile' 
                      ? 'Navegación compacta y pestañas táctiles optimizadas para una sola mano.'
                      : 'Diseño en columnas múltiples simultáneas para servicio de alta velocidad.'}
                  </li>
                  <li>Altura calculada dinámicamente (`dvh`) sin ser empujada por barras de navegación.</li>
                  <li>Soporte táctil háptico de 44px+ para tomas de pedido sin errores.</li>
                </ul>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowDetails(false)}
              className="w-full h-10 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs transition"
            >
              Aceptar
            </button>

          </div>
        </div>
      )}
    </>
  );
};
