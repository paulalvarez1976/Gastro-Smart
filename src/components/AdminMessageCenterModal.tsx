import React, { useState } from 'react';
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  Trash2, 
  CheckCheck, 
  X, 
  AlertTriangle, 
  Clock, 
  Eye, 
  Bell, 
  Check, 
  Info,
  Sparkles,
  ExternalLink,
  VolumeX
} from 'lucide-react';
import { SecurityAlert } from '../types';
import { sounds } from '../utils/sound';

interface AdminMessageCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: SecurityAlert[];
  onDismissAndClearAlert: (alertId: string) => Promise<void>;
  onMarkRead: (alertId: string) => Promise<void>;
  onDeleteAlert: (alertId: string) => Promise<void>;
  onClearReadAlerts: () => Promise<number>;
  onClearAllAlerts: () => Promise<number>;
}

export const AdminMessageCenterModal: React.FC<AdminMessageCenterModalProps> = ({
  isOpen,
  onClose,
  alerts,
  onDismissAndClearAlert,
  onMarkRead,
  onDeleteAlert,
  onClearReadAlerts,
  onClearAllAlerts
}) => {
  const [selectedAlert, setSelectedAlert] = useState<SecurityAlert | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  const handleReadAndDismiss = async (alert: SecurityAlert) => {
    sounds.playKeypadClick();
    sounds.stopRepeatingAlarm('sec-alert-' + alert.id);
    sounds.stopRepeatingAlarm('security-alert');
    setIsProcessing(true);
    try {
      await onDismissAndClearAlert(alert.id);
      if (selectedAlert?.id === alert.id) {
        setSelectedAlert(null);
      }
      showToast('Aviso leído y eliminado de la lista.');
    } catch (err: any) {
      showToast('Error al procesar: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteSingle = async (alertId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    sounds.playKeypadClick();
    sounds.stopRepeatingAlarm('sec-alert-' + alertId);
    sounds.stopRepeatingAlarm('security-alert');
    setIsProcessing(true);
    try {
      await onDeleteAlert(alertId);
      if (selectedAlert?.id === alertId) {
        setSelectedAlert(null);
      }
      showToast('Alerta eliminada correctamente.');
    } catch (err: any) {
      showToast('Error al eliminar: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('¿Desea borrar todas las alertas y avisos del Centro de Mensajes?')) {
      return;
    }
    sounds.playKeypadClick();
    sounds.stopAllAlarms();
    setIsProcessing(true);
    try {
      const count = await onClearAllAlerts();
      setSelectedAlert(null);
      showToast(`Se eliminaron todas las alertas (${count}).`);
    } catch (err: any) {
      showToast('Error: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const unreadCount = alerts.filter(a => !a.leido).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white flex items-center justify-between border-b border-neutral-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base tracking-tight text-white">Centro de Mensajes & Avisos de Seguridad</h3>
                {unreadCount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-extrabold animate-pulse">
                    {unreadCount} {unreadCount === 1 ? 'nuevo' : 'nuevos'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                    Al día
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Lee los avisos operacionales y de seguridad. Al marcarlos como leídos se borran automáticamente.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {alerts.length > 0 && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleClearAll}
                className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold transition flex items-center gap-1.5 border border-neutral-700 disabled:opacity-50"
                title="Borrar todas las alertas"
              >
                <Trash2 className="w-3.5 h-3.5 text-neutral-400" />
                <span className="hidden sm:inline">Limpiar Todo</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Toast */}
        {feedbackToast && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between animate-in fade-in">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              {feedbackToast}
            </span>
            <button onClick={() => setFeedbackToast(null)} className="text-white/80 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body Layout: 2 Columns on desktop */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-0">
          
          {/* Column 1: List of Alerts */}
          <div className={`p-4 overflow-y-auto space-y-2 border-r border-neutral-200 bg-neutral-50/50 ${selectedAlert ? 'hidden md:block md:col-span-5' : 'col-span-12 md:col-span-12'}`}>
            <div className="flex items-center justify-between text-xs text-neutral-500 font-bold px-1 mb-2">
              <span>Avisos Activos ({alerts.length})</span>
              <span className="text-[11px] text-neutral-400">Clic en un aviso para leer</span>
            </div>

            {alerts.length === 0 ? (
              <div className="text-center py-16 px-4 bg-white rounded-2xl border border-neutral-200">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h4 className="font-black text-neutral-900 text-sm">Bandeja Limpia</h4>
                <p className="text-xs text-neutral-500 max-w-sm mx-auto mt-1">
                  No hay avisos ni alertas de seguridad pendientes. Todo opera con normalidad.
                </p>
              </div>
            ) : (
              alerts.map((alert) => {
                const isSelected = selectedAlert?.id === alert.id;
                const isBruteForce = alert.tipo === 'fuerza_bruta_pin';
                const isCancelAudit = alert.tipo === 'auditoria_cancelacion' || alert.tipo === 'auditoria';
                
                return (
                  <div
                    key={alert.id}
                    onClick={() => {
                      sounds.playKeypadClick();
                      setSelectedAlert(alert);
                    }}
                    className={`p-3.5 rounded-2xl border transition text-left cursor-pointer relative group ${
                      isSelected
                        ? 'bg-orange-50 border-orange-300 ring-2 ring-orange-500/20 shadow-xs'
                        : !alert.leido
                          ? isBruteForce 
                            ? 'bg-rose-50/80 border-rose-200 hover:border-rose-300 shadow-xs' 
                            : 'bg-amber-50/80 border-amber-200 hover:border-amber-300 shadow-xs'
                          : 'bg-white border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {isBruteForce ? (
                          <span className="p-1 rounded-lg bg-rose-100 text-rose-700">
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </span>
                        ) : isCancelAudit ? (
                          <span className="p-1 rounded-lg bg-purple-100 text-purple-700">
                            <Info className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span className="p-1 rounded-lg bg-amber-100 text-amber-700">
                            <Shield className="w-3.5 h-3.5" />
                          </span>
                        )}
                        <span className={`font-black text-xs uppercase tracking-tight ${
                          isBruteForce ? 'text-rose-900' : isCancelAudit ? 'text-purple-900' : 'text-amber-900'
                        }`}>
                          {isBruteForce ? 'Bloqueo PIN / Fuerza Bruta' : 
                           isCancelAudit ? 'Auditoría de Comanda' : 'Alerta de Seguridad'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-neutral-400 font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(alert.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {!alert.leido && (
                          <span className="w-2 h-2 rounded-full bg-red-600" title="No leído"></span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-neutral-700 mt-2 line-clamp-2 leading-relaxed font-medium">
                      {alert.mensaje}
                    </p>

                    <div className="mt-2.5 pt-2 border-t border-black/5 flex items-center justify-between text-[11px]">
                      <span className="text-neutral-400 font-medium">
                        {new Date(alert.fecha).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReadAndDismiss(alert);
                          }}
                          className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center gap-1 shadow-xs transition"
                          title="Leer y borrar alerta"
                        >
                          <Check className="w-3 h-3" />
                          Leer y borrar
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSingle(alert.id, e)}
                          className="p-1 rounded-md text-neutral-400 hover:text-red-600 hover:bg-neutral-100 transition"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Column 2: Detailed Reader view */}
          {selectedAlert && (
            <div className="col-span-12 md:col-span-7 p-6 overflow-y-auto bg-white flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase ${
                      selectedAlert.tipo === 'fuerza_bruta_pin' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {selectedAlert.tipo}
                    </span>
                    <span className="text-xs text-neutral-400 font-mono">
                      {new Date(selectedAlert.fecha).toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedAlert(null)}
                    className="md:hidden text-neutral-400 hover:text-neutral-600 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <h4 className="font-black text-neutral-900 text-base">
                    Detalle del Aviso
                  </h4>
                  <div className="mt-3 p-4 rounded-2xl bg-neutral-50 border border-neutral-200 text-neutral-800 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">
                    {selectedAlert.mensaje}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                    <span className="text-neutral-400 font-bold block uppercase text-[10px]">ID de Alerta</span>
                    <span className="font-mono text-neutral-700 truncate block mt-0.5">{selectedAlert.id}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                    <span className="text-neutral-400 font-bold block uppercase text-[10px]">Estado</span>
                    <span className={`font-bold mt-0.5 block ${selectedAlert.leido ? 'text-neutral-600' : 'text-red-600'}`}>
                      {selectedAlert.leido ? 'Leído previamente' : 'No leído (Activo)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-neutral-100 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleDeleteSingle(selectedAlert.id)}
                  className="px-4 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4 text-neutral-500" />
                  Eliminar Alerta
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleReadAndDismiss(selectedAlert)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
                >
                  <CheckCheck className="w-4 h-4" />
                  Marcar como Leído y Borrar
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-neutral-50 border-t border-neutral-200 text-neutral-400 text-[11px] flex items-center justify-between">
          <span>GastroSmart Security & Notifications Engine</span>
          <span>Al confirmar la lectura, las alertas son removidas para mantener el panel limpio.</span>
        </div>

      </div>
    </div>
  );
};
