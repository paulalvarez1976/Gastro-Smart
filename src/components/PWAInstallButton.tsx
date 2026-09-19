import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, Share, PlusSquare, X, CheckCircle2 } from 'lucide-react';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'nav' | 'banner' | 'button';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ 
  className = '', 
  variant = 'nav' 
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // If already running in standalone mode, do not show install prompt
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      setIsInstalling(true);
      try {
        await install();
      } finally {
        setIsInstalling(false);
      }
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      // Direct desktop or browser hint
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {variant === 'nav' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          disabled={isInstalling}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-extrabold shadow-sm hover:shadow transition cursor-pointer ${className}`}
          title="Instalar Gastro Smart en tu dispositivo como App Nativa / PWA"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Instalar App</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          disabled={isInstalling}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold shadow-md hover:shadow-lg transition cursor-pointer ${className}`}
        >
          <Smartphone className="w-4 h-4" />
          <span>Instalar como App Nativa</span>
        </button>
      )}

      {/* iOS / Browser Guided Installation Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-neutral-100 text-neutral-900 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-neutral-900">Instalar Gastro Smart</h3>
                  <p className="text-[11px] text-neutral-500">PWA / App Móvil y Tablet</p>
                </div>
              </div>
              <button 
                onClick={() => setShowIOSGuide(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg hover:bg-neutral-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-neutral-700">
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-orange-50/70 border border-orange-200/60">
                <span className="w-5 h-5 rounded-full bg-orange-500 text-white font-black text-[11px] flex items-center justify-center shrink-0">1</span>
                <div>
                  <p className="font-bold text-neutral-900">En iOS Safari:</p>
                  <p className="text-neutral-600 mt-0.5 flex items-center gap-1">
                    Toca el botón <Share className="w-3.5 h-3.5 inline text-blue-600" /> <strong>Compartir</strong> en la barra inferior del navegador.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-orange-50/70 border border-orange-200/60">
                <span className="w-5 h-5 rounded-full bg-orange-500 text-white font-black text-[11px] flex items-center justify-center shrink-0">2</span>
                <div>
                  <p className="font-bold text-neutral-900">Agregar a inicio:</p>
                  <p className="text-neutral-600 mt-0.5 flex items-center gap-1">
                    Desliza hacia abajo y presiona <PlusSquare className="w-3.5 h-3.5 inline text-neutral-700" /> <strong>"Agregar a pantalla de inicio"</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200/60">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-emerald-900 leading-snug">
                  Se abrirá en pantalla completa sin barra de navegador, con soporte sin conexión y carga instantánea para cocina, caja y meseros.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full h-11 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs transition"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};
