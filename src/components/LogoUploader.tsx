import React, { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon, Link as LinkIcon, Check, Loader2 } from 'lucide-react';
import { compressLogo } from '../utils/imageCompressor';

interface LogoUploaderProps {
  logoUrl: string | null | undefined;
  onChange: (url: string) => void;
  theme?: 'dark' | 'light';
  label?: string;
  helperText?: string;
  restaurantName?: string;
}

export const LogoUploader: React.FC<LogoUploaderProps> = ({
  logoUrl,
  onChange,
  theme = 'light',
  label = 'Logo del Restaurante',
  helperText = 'Formatos recomendados: PNG, JPG o WEBP. Dimensión cuadrada (ej. 400x400)',
  restaurantName
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isDark = theme === 'dark';

  const handleFileSelected = async (file: File) => {
    if (!file) return;
    setErrorMsg(null);
    setIsProcessing(true);
    try {
      const { dataUrl } = await compressLogo(file, 400);
      onChange(dataUrl);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al procesar la imagen del logo');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await handleFileSelected(file);
    }
  };

  const handleApplyUrl = () => {
    if (!customUrl.trim()) return;
    onChange(customUrl.trim());
    setShowUrlInput(false);
    setCustomUrl('');
  };

  const handleRemove = () => {
    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className={`block text-xs font-bold ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
          {label}
        </label>
        {!logoUrl && (
          <button
            type="button"
            onClick={() => setShowUrlInput(!showUrlInput)}
            className={`text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
              isDark ? 'text-purple-400 hover:text-purple-300' : 'text-orange-600 hover:text-orange-700'
            }`}
          >
            <LinkIcon className="w-3 h-3" />
            <span>{showUrlInput ? 'Subir archivo' : 'Usar enlace web (URL)'}</span>
          </button>
        )}
      </div>

      {showUrlInput && !logoUrl ? (
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https://ejemplo.com/logo.png"
            className={`flex-1 h-10 px-3 rounded-xl text-xs font-mono outline-none border transition ${
              isDark
                ? 'bg-neutral-950 border-neutral-800 text-white focus:border-purple-500'
                : 'bg-white border-neutral-300 text-neutral-900 focus:border-orange-500'
            }`}
          />
          <button
            type="button"
            onClick={handleApplyUrl}
            className={`h-10 px-4 rounded-xl text-xs font-bold text-white transition flex items-center gap-1 cursor-pointer ${
              isDark ? 'bg-purple-600 hover:bg-purple-700' : 'bg-orange-600 hover:bg-orange-700'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>Aplicar</span>
          </button>
        </div>
      ) : logoUrl ? (
        /* Preview del Logo existente o cargado */
        <div className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
          isDark ? 'bg-neutral-950/80 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden border shrink-0 ${
              isDark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-200 shadow-xs'
            }`}>
              <img
                src={logoUrl}
                alt={restaurantName || 'Logo'}
                className="w-full h-full object-contain p-1"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  // Si falla la carga de imagen por URL rota, mostrar placeholder
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%23999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                }}
              />
            </div>
            <div>
              <p className={`text-xs font-extrabold ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                Logo asignado
              </p>
              <p className={`text-[11px] ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                Se mostrará en navegación, pedidos y TPV
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                isDark
                  ? 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-700'
                  : 'bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-300 shadow-xs'
              }`}
            >
              Cambiar
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="p-1.5 rounded-xl text-red-500 hover:bg-red-500/10 transition cursor-pointer"
              title="Quitar logotipo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* Dropzone para subir el logo */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`p-4 rounded-2xl border-2 border-dashed transition text-center cursor-pointer flex flex-col items-center justify-center gap-2 ${
            isDragging
              ? isDark
                ? 'border-purple-500 bg-purple-950/20'
                : 'border-orange-500 bg-orange-50'
              : isDark
              ? 'border-neutral-800 hover:border-neutral-700 bg-neutral-950/40 hover:bg-neutral-950/80'
              : 'border-neutral-300 hover:border-neutral-400 bg-neutral-50/50 hover:bg-neutral-100/50'
          }`}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center gap-1.5 py-2">
              <Loader2 className={`w-6 h-6 animate-spin ${isDark ? 'text-purple-400' : 'text-orange-600'}`} />
              <span className={`text-xs font-bold ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                Optimizando logo...
              </span>
            </div>
          ) : (
            <>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isDark ? 'bg-neutral-900 text-purple-400' : 'bg-orange-100 text-orange-600'
              }`}>
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-neutral-800'}`}>
                  Haz clic para subir o arrastra la imagen aquí
                </p>
                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                  {helperText}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {errorMsg && (
        <p className="text-[11px] text-red-500 font-semibold">{errorMsg}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFileSelected(e.target.files[0]);
          }
        }}
        className="hidden"
      />
    </div>
  );
};
