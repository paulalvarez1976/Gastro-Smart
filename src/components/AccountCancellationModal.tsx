import React, { useState } from 'react';
import { 
  Trash2, 
  FileArchive, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Loader2, 
  Download, 
  ShieldAlert, 
  Lock, 
  Building2, 
  Sparkles,
  ArrowRight,
  LogOut,
  FileText
} from 'lucide-react';
import { sounds } from '../utils/sound';
import { haptics } from '../utils/haptics';
import { fetchAllBusinessDataForBackup, deleteEntireBusinessAndAllData } from '../services/dataService';
import { generateAndDownloadBusinessZip } from '../services/zipExportService';
import { useAuth } from '../context/AuthContext';

interface AccountCancellationModalProps {
  businessId: string;
  businessName: string;
  onClose: () => void;
  onSuccessPurge?: () => void;
}

const CONFIRMATION_PHRASE = 'ELIMINAR DEFINITIVAMENTE MI RESTAURANTE Y DATOS';

export const AccountCancellationModal: React.FC<AccountCancellationModalProps> = ({
  businessId,
  businessName,
  onClose,
  onSuccessPurge
}) => {
  const { logoutAdmin } = useAuth();

  // Stages: 'overview' -> 'downloading_zip' -> 'confirm_phrase' -> 'purging' -> 'completed'
  const [stage, setStage] = useState<'overview' | 'downloading_zip' | 'confirm_phrase' | 'purging' | 'completed'>('overview');
  const [inputPhrase, setInputPhrase] = useState('');
  const [hasDownloadedZip, setHasDownloadedZip] = useState(false);
  const [isProcessingZip, setIsProcessingZip] = useState(false);
  const [purgeStatusMessage, setPurgeStatusMessage] = useState('');
  const [deletedSummary, setDeletedSummary] = useState<Record<string, number> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Step 1: Trigger ZIP download
  const handleDownloadZipBackup = async () => {
    setIsProcessingZip(true);
    setErrorMsg(null);
    sounds.playKeypadClick();
    haptics.tap();

    try {
      setPurgeStatusMessage('Extrayendo registros de comandas, carta, inventario y finanzas...');
      const fullData = await fetchAllBusinessDataForBackup(businessId);
      
      setPurgeStatusMessage('Comprimiendo archivos y generando paquete ZIP oficial...');
      await generateAndDownloadBusinessZip(fullData);

      setHasDownloadedZip(true);
      sounds.playCashRegister();
      haptics.success();
      setStage('confirm_phrase');
    } catch (err: any) {
      console.error('Error generating backup ZIP:', err);
      setErrorMsg(err.message || 'Error al generar el respaldo ZIP. Inténtalo de nuevo.');
      sounds.playAlertWarning();
    } finally {
      setIsProcessingZip(false);
      setPurgeStatusMessage('');
    }
  };

  // Step 2: Purge database
  const handleExecutePurge = async () => {
    if (inputPhrase.trim() !== CONFIRMATION_PHRASE) {
      setErrorMsg(`Debes escribir exactamente la frase en mayúsculas: "${CONFIRMATION_PHRASE}"`);
      sounds.playAlertWarning();
      return;
    }

    setStage('purging');
    setErrorMsg(null);
    sounds.playKeypadClick();
    haptics.warning();

    try {
      setPurgeStatusMessage('Purgando comandas, inventario y cartas de la base de datos...');
      const result = await deleteEntireBusinessAndAllData(businessId);
      
      setDeletedSummary(result.deletedCounts);
      setStage('completed');
      sounds.playNotification();
      haptics.success();

      // Clear any session info
      setTimeout(() => {
        if (onSuccessPurge) onSuccessPurge();
        logoutAdmin();
      }, 5000);
    } catch (err: any) {
      console.error('Error purging business data:', err);
      setErrorMsg(err.message || 'Error durante la eliminación de datos.');
      setStage('confirm_phrase');
      sounds.playAlertWarning();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-7 shadow-2xl border border-red-200 flex flex-col max-h-[92vh] overflow-y-auto space-y-4">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-red-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-neutral-900 text-base sm:text-lg">
                  Baja del Servicio & Supresión Total de Datos
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-800 border border-red-200">
                  RGPD / Irreversible
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Descarga todos tus archivos en un ZIP y elimina permanentemente tu negocio de Gastro Smart
              </p>
            </div>
          </div>
          {stage !== 'purging' && stage !== 'completed' && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Error notification if any */}
        {errorMsg && (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ================= STAGE 1: OVERVIEW & WARNING ================= */}
        {stage === 'overview' && (
          <div className="space-y-4 text-xs">
            
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Advertencia Importante sobre la Baja de {businessName}:</span>
              </div>
              <p className="text-[11.5px] leading-relaxed">
                Este proceso te permite <strong>descargar en un único archivo ZIP comprimido</strong> todo el historial comercial, cartas, clientes, recetas, comandas y finanzas. Una vez descargado, todos los registros serán <strong>eliminados permanentemente e irreversiblemente</strong> de los servidores de Gastro Smart.
              </p>
            </div>

            {/* List of files contained in the ZIP */}
            <div className="border border-neutral-200 rounded-2xl p-4 bg-neutral-50 space-y-2.5">
              <span className="font-extrabold text-neutral-900 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <FileArchive className="w-4 h-4 text-indigo-600" />
                Contenido del Paquete ZIP de Portabilidad:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-neutral-700">
                <div className="p-2 rounded-xl bg-white border border-neutral-200/80 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span><strong>Ventas & Comandas:</strong> CSV y JSON completos</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-neutral-200/80 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span><strong>Carta & Recetas:</strong> Platos, costos e ingredientes</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-neutral-200/80 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  <span><strong>Inventario & Stock:</strong> Insumos, mermas y auditoría</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-neutral-200/80 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                  <span><strong>Cierres de Caja & Finanzas:</strong> Arqueos y gastos</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-neutral-200/80 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-pink-500"></span>
                  <span><strong>Clientes & Fidelidad:</strong> Cartera y puntos</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-neutral-200/80 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                  <span><strong>Legal & Privacidad:</strong> Contrato y certificado RGPD</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition cursor-pointer"
              >
                Cancelar y Permanecer en Gastro Smart
              </button>
              
              <button
                type="button"
                disabled={isProcessingZip}
                onClick={handleDownloadZipBackup}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-md shadow-indigo-600/20 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                {isProcessingZip ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Preparando Respaldo ZIP...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Paso 1: Descargar Todos mis Archivos en ZIP</span>
                  </>
                )}
              </button>
            </div>

          </div>
        )}

        {/* ================= STAGE 2: CONFIRMATION PHRASE ================= */}
        {stage === 'confirm_phrase' && (
          <div className="space-y-4 text-xs">
            
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <strong className="block text-xs">¡Paquete ZIP descargado exitosamente en tu equipo!</strong>
                <p className="text-[11px] text-emerald-800">
                  Ya posees la copia completa de todos tus datos. Ahora procede con la supresión definitiva de la base de datos de Gastro Smart.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-950 space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-red-900 text-xs uppercase tracking-wide">
                <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                <span>Confirmación de Seguridad Final e Irreversible</span>
              </div>
              <p className="text-[11.5px] text-red-900/90 leading-relaxed">
                Para confirmar el borrado total de <strong>{businessName}</strong>, escribe la siguiente frase de seguridad en el campo de texto inferior:
              </p>
              <div className="p-2.5 rounded-xl bg-white border border-red-300 font-mono font-black text-xs text-red-950 select-all text-center">
                {CONFIRMATION_PHRASE}
              </div>

              <input
                type="text"
                value={inputPhrase}
                onChange={(e) => setInputPhrase(e.target.value)}
                placeholder="Escribe la frase exacta aquí..."
                className="w-full h-11 px-3.5 rounded-xl border-2 border-red-300 bg-white font-mono font-bold text-xs text-neutral-900 outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              
              <button
                type="button"
                disabled={inputPhrase.trim() !== CONFIRMATION_PHRASE}
                onClick={handleExecutePurge}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs shadow-md shadow-red-600/20 flex items-center gap-2 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                <span>Paso 2: Borrar Definitivamente de la Base de Datos</span>
              </button>
            </div>

          </div>
        )}

        {/* ================= STAGE 3: PURGING PROGRESS ================= */}
        {stage === 'purging' && (
          <div className="py-8 space-y-4 text-center">
            <div className="w-14 h-14 rounded-3xl bg-red-100 text-red-600 flex items-center justify-center mx-auto shadow-md animate-pulse">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-black text-neutral-900">
                Eliminando Base de Datos y Revocando Credenciales...
              </h4>
              <p className="text-xs text-neutral-500">
                {purgeStatusMessage || 'Eliminando colecciones y registros de producción de forma atómica'}
              </p>
            </div>
            <div className="w-full bg-neutral-200 h-2 rounded-full overflow-hidden max-w-md mx-auto">
              <div className="bg-red-600 h-full rounded-full animate-[progress_1.5s_ease-in-out_infinite]" style={{ width: '85%' }}></div>
            </div>
          </div>
        )}

        {/* ================= STAGE 4: COMPLETED ================= */}
        {stage === 'completed' && (
          <div className="py-6 space-y-4 text-center text-xs">
            <div className="w-14 h-14 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-md">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            
            <div className="space-y-1">
              <h4 className="text-base font-black text-neutral-900">
                ¡Baja Completada y Datos Suprimidos Exitosamente!
              </h4>
              <p className="text-neutral-600 max-w-md mx-auto text-xs leading-relaxed">
                Todos los registros de <strong>{businessName}</strong> han sido purgados permanentemente de la base de datos de Gastro Smart en cumplimiento de la normativa RGPD.
              </p>
            </div>

            {deletedSummary && (
              <div className="max-w-md mx-auto p-3 rounded-2xl bg-neutral-50 border border-neutral-200 text-left space-y-1 text-[11px] font-mono">
                <span className="font-bold text-neutral-800 font-sans block text-xs">Resumen de Supresión:</span>
                <div className="grid grid-cols-2 gap-1 text-neutral-600">
                  {Object.entries(deletedSummary).map(([col, count]) => (
                    <div key={col} className="flex justify-between border-b border-neutral-100 py-0.5">
                      <span className="capitalize">{col}:</span>
                      <strong>{count} eliminados</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-neutral-400 italic">
              Cerrando sesión y redirigiendo a la pantalla inicial en unos segundos...
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  if (onSuccessPurge) onSuccessPurge();
                  logoutAdmin();
                }}
                className="px-6 py-2.5 rounded-xl bg-neutral-900 hover:bg-black text-white font-bold text-xs transition cursor-pointer"
              >
                Finalizar y Salir Ahora
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
