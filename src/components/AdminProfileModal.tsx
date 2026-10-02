import React, { useState } from 'react';
import {
  X,
  User,
  Shield,
  ShieldCheck,
  Building2,
  Store,
  Download,
  FileArchive,
  CheckCircle2,
  Clock,
  Mail,
  Phone,
  MapPin,
  KeyRound,
  FileSpreadsheet,
  Layers,
  Database,
  Loader2,
  Sparkles,
  Lock,
  Receipt,
  Boxes,
  Users,
  Wallet
} from 'lucide-react';
import { UserAccount, Business, Restaurant, Employee } from '../types';
import { fetchAllBusinessDataForBackup } from '../services/dataService';
import { generateAndDownloadBusinessZip } from '../services/zipExportService';
import { sounds } from '../utils/sound';

interface AdminProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserAccount: UserAccount | null;
  currentEmployee: Employee | null;
  currentBusiness: Business | null;
  restaurants: Restaurant[];
  businessId: string;
}

export const AdminProfileModal: React.FC<AdminProfileModalProps> = ({
  isOpen,
  onClose,
  currentUserAccount,
  currentEmployee,
  currentBusiness,
  restaurants,
  businessId
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportStep, setExportStep] = useState<string>('');
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  if (!isOpen) return null;

  const adminName = currentUserAccount?.nombre || currentEmployee?.nombre || 'Administrador Principal';
  const adminEmail = currentUserAccount?.email || currentBusiness?.email || currentBusiness?.ownerEmail || 'admin@gastrosmart.com';
  const adminRole = currentUserAccount?.rol || currentEmployee?.puesto || 'admin';
  const bizName = currentBusiness?.nombre || restaurants[0]?.nombre || 'Gastro Smart Restaurante';
  const bizTaxId = currentBusiness?.rif_o_ruc || 'No especificado';

  const handleDownloadFullZipBackup = async () => {
    sounds.playKeypadClick();
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(null);
    setExportStep('Extrayendo colecciones y registros de la base de datos...');

    try {
      // 1. Fetch complete dataset
      setExportStep('1/3: Descargando comandas, inventario, turnos, finanzas y configuraciones...');
      const fullData = await fetchAllBusinessDataForBackup(businessId);

      // Si no viene el business en Firestore, enriquecer con los props locales
      if (!fullData.business && currentBusiness) {
        fullData.business = currentBusiness;
      }
      if (fullData.restaurants.length === 0 && restaurants.length > 0) {
        fullData.restaurants = restaurants;
      }

      // 2. Compilar y estructurar archivo ZIP
      setExportStep('2/3: Compilando archivos CSV, JSON estructurados y contratos...');
      await new Promise(r => setTimeout(r, 600));

      // 3. Generar archivo comprimido .ZIP y descargar
      setExportStep('3/3: Comprimiendo paquete ZIP oficial y descargando en navegador...');
      await generateAndDownloadBusinessZip(fullData);

      sounds.playSuccess();
      setExportSuccess(`¡Historial completo descargado con éxito! Se empaquetaron ${fullData.orders.length} pedidos, ${fullData.menuItems.length} platos, ${fullData.inventory.length} insumos y ${fullData.expenses.length} gastos.`);
    } catch (err: any) {
      console.error('Error al generar respaldo ZIP:', err);
      sounds.playAlertWarning();
      setExportError(err.message || 'Error al compilar el archivo ZIP. Intente nuevamente.');
    } finally {
      setIsExporting(false);
      setExportStep('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white flex items-center justify-between border-b border-neutral-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base tracking-tight text-white">Perfil del Administrador</h3>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 text-[10px] font-black uppercase tracking-wider">
                  {adminRole === 'owner' ? 'Propietario / Dueño' : adminRole === 'superadmin' ? 'SuperAdmin' : 'Administrador'}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Datos de cuenta, permisos y descarga del historial integral del negocio (.ZIP)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Tarjeta 1: Información de Perfil del Usuario & Negocio */}
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200/90 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200/80">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white flex items-center justify-center font-black text-lg shadow-sm">
                  {adminName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-black text-neutral-900 text-base">{adminName}</h4>
                  <div className="flex items-center gap-2 text-xs text-neutral-500 mt-0.5">
                    <Mail className="w-3.5 h-3.5 text-neutral-400" />
                    <span>{adminEmail}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Acceso Total
                </span>
              </div>
            </div>

            {/* Grid de Información de Empresa */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white rounded-xl border border-neutral-200">
                <span className="text-neutral-400 uppercase font-bold text-[10px] block">Razón Social / Empresa</span>
                <span className="font-bold text-neutral-900 block mt-0.5 truncate">{bizName}</span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-neutral-200">
                <span className="text-neutral-400 uppercase font-bold text-[10px] block">Identificación Fiscal</span>
                <span className="font-mono font-bold text-neutral-900 block mt-0.5 truncate">{bizTaxId}</span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-neutral-200">
                <span className="text-neutral-400 uppercase font-bold text-[10px] block">Sedes a Cargo</span>
                <span className="font-bold text-indigo-700 block mt-0.5">
                  {restaurants.length} {restaurants.length === 1 ? 'Sucursal Activa' : 'Sucursales Activas'}
                </span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-neutral-200">
                <span className="text-neutral-400 uppercase font-bold text-[10px] block">Seguridad & Cifrado</span>
                <span className="font-bold text-emerald-700 block mt-0.5 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  TLS 256-bit + RBAC
                </span>
              </div>
            </div>
          </div>

          {/* Tarjeta 2: GENERACIÓN DE ARCHIVO .ZIP DEL HISTORIAL COMPLETO */}
          <div className="p-5 rounded-3xl bg-gradient-to-br from-indigo-900 via-neutral-900 to-neutral-900 text-white border border-indigo-800/60 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0 shadow-xs">
                  <FileArchive className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-black text-base text-white flex items-center gap-2">
                    <span>Exportación de Historial y Respaldo Completo (.ZIP)</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-400 text-neutral-950 text-[10px] font-black uppercase">
                      Portabilidad Total
                    </span>
                  </h4>
                  <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                    Descarga un archivo comprimido <code className="text-amber-300 font-mono">.zip</code> estructurado con la totalidad de tus ventas, comandas, carta gastronómica, insumos de inventario, finanzas, turnos del personal y configuraciones de la empresa.
                  </p>
                </div>
              </div>
            </div>

            {/* Lista de Carpetas y Contenidos Incluidos en el ZIP */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[11px] text-neutral-300">
              <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
                <Receipt className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate font-medium">Ventas & Comandas (CSV/JSON)</span>
              </div>
              <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate font-medium">Carta, Menú & Recetas</span>
              </div>
              <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
                <Boxes className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate font-medium">Inventario & Stock Valorizado</span>
              </div>
              <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="truncate font-medium">Empleados & Asistencias</span>
              </div>
              <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
                <Wallet className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="truncate font-medium">Cierres de Caja & Gastos</span>
              </div>
              <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                <span className="truncate font-medium">Auditoría & Contrato Legal</span>
              </div>
            </div>

            {/* Mensaje de Progreso en Vivo */}
            {isExporting && (
              <div className="p-3.5 rounded-2xl bg-indigo-950/80 border border-indigo-500/40 text-xs text-indigo-200 space-y-2 animate-pulse">
                <div className="flex items-center gap-2 font-bold text-white">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Procesando archivo ZIP en tiempo real...</span>
                </div>
                <p className="text-[11px] text-indigo-300 font-mono">
                  {exportStep}
                </p>
              </div>
            )}

            {/* Mensaje de Éxito */}
            {exportSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-xs text-emerald-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{exportSuccess}</span>
              </div>
            )}

            {/* Mensaje de Error */}
            {exportError && (
              <div className="p-3.5 rounded-2xl bg-rose-950/80 border border-rose-500/50 text-xs text-rose-200 flex items-start gap-2.5">
                <X className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{exportError}</span>
              </div>
            )}

            {/* Botón Principal de Descarga */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isExporting}
                onClick={handleDownloadFullZipBackup}
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-neutral-950 font-black text-xs transition shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-neutral-950" />
                    <span>Compilando archivo .ZIP...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Descargar Respaldo Completo (.ZIP)</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-neutral-50 border-t border-neutral-200 text-neutral-400 text-[11px] flex flex-wrap items-center justify-between gap-2">
          <span>GastroSmart Security & Portability Engine</span>
          <span>Archivos compatibles con Excel, Google Sheets, PowerBI y JSON</span>
        </div>

      </div>
    </div>
  );
};
