import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Order } from '../types';
import { 
  LogOut, 
  Store, 
  Clock, 
  User, 
  Bell, 
  CheckCircle2, 
  X, 
  Sparkles,
  ChevronDown,
  DollarSign,
  TrendingUp,
  FileText
} from 'lucide-react';
import { sounds } from '../utils/sound';

interface TopNavProps {
  orders?: Order[];
  onOrderClick?: (order: Order) => void;
}

export const TopNav: React.FC<TopNavProps> = ({ orders = [], onOrderClick }) => {
  const { 
    currentEmployee, 
    currentShift, 
    currentRestaurant, 
    allRestaurants, 
    selectRestaurant, 
    endShiftAndLogout, 
    logout 
  } = useAuth();

  const [shiftDuration, setShiftDuration] = useState<string>('00:00:00');
  const [showEndShiftModal, setShowEndShiftModal] = useState(false);
  const [reporteLabores, setReporteLabores] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);

  // Contador de tiempo de turno
  useEffect(() => {
    if (!currentShift) return;

    const updateTimer = () => {
      const start = new Date(currentShift.horaInicio).getTime();
      const now = Date.now();
      const diffMs = Math.max(0, now - start);

      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

      setShiftDuration(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [currentShift]);

  // Alertas para mesero: pedidos que acaban de pasar a "listo" o fueron rechazados
  const readyOrdersForServer = orders.filter(
    o => o.restaurantId === currentRestaurant?.id && 
         (o.estado === 'listo' || o.estado === 'rechazado') &&
         (currentEmployee?.puesto === 'admin' || o.meseroId === currentEmployee?.id)
  );

  // Calcular horas trabajadas con decimales para el resumen de fin de turno
  const calculateShiftHours = () => {
    if (!currentShift) return 0;
    const start = new Date(currentShift.horaInicio).getTime();
    const now = Date.now();
    const hours = (now - start) / (1000 * 60 * 60);
    return Math.round(hours * 100) / 100;
  };

  const handleConfirmEndShift = async () => {
    sounds.playCashRegister();
    await endShiftAndLogout(reporteLabores);
    setShowEndShiftModal(false);
  };

  if (!currentEmployee) return null;

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-800 border-purple-200',
    caja: 'bg-blue-100 text-blue-800 border-blue-200',
    mesero: 'bg-amber-100 text-amber-800 border-amber-200',
    cocina: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    ayudante_cocina: 'bg-amber-100 text-amber-900 border-amber-300',
    limpieza: 'bg-teal-100 text-teal-800 border-teal-200',
  };

  return (
    <>
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-40 px-4 sm:px-6 py-2.5 flex items-center justify-between shadow-xs">
        
        {/* Left: Brand & Restaurant Selector */}
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center font-black shadow-sm">
              GS
            </div>
            <div className="hidden sm:block">
              <span className="font-extrabold text-neutral-900 tracking-tight text-base">Gastro</span>
              <span className="font-extrabold text-orange-600 tracking-tight text-base">Smart</span>
            </div>
          </div>

          {/* Restaurant Selector (Multisede) */}
          <div className="flex items-center gap-1.5 bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-200">
            <Store className="w-4 h-4 text-orange-500 shrink-0" />
            <select
              value={currentRestaurant?.id || ''}
              onChange={(e) => {
                if (e.target.value === '__NEW__') {
                  window.dispatchEvent(new CustomEvent('open-new-restaurant-modal'));
                } else {
                  selectRestaurant(e.target.value);
                }
              }}
              className="bg-transparent text-xs sm:text-sm font-semibold text-neutral-800 outline-none cursor-pointer pr-1"
              disabled={currentEmployee.puesto !== 'admin' && allRestaurants.length <= 1}
            >
              {allRestaurants.map((rest) => (
                <option key={rest.id} value={rest.id}>
                  {rest.nombre}
                </option>
              ))}
              {currentEmployee.puesto === 'admin' && (
                <option value="__NEW__" className="text-orange-600 font-bold">
                  + Crear otro restaurante...
                </option>
              )}
            </select>
          </div>
        </div>

        {/* Right: Shift Timer, Employee info, Notifications & Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-4">
          
          {/* Shift Active Indicator */}
          {currentShift && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200/80 rounded-xl text-xs font-semibold text-amber-900">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Turno: {shiftDuration}</span>
            </div>
          )}

          {/* Notifications bell (alerta de cocina a mesero) */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-xl text-neutral-600 hover:text-orange-600 hover:bg-orange-50 transition border border-neutral-200"
              title="Notificaciones de pedidos"
            >
              <Bell className="w-5 h-5" />
              {readyOrdersForServer.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-600 text-white text-[11px] font-bold rounded-full flex items-center justify-center animate-bounce">
                  {readyOrdersForServer.length}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-neutral-200 p-3 z-50">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Avisos en vivo
                  </span>
                  <button onClick={() => setShowNotifications(false)} className="text-neutral-400 hover:text-neutral-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                  {readyOrdersForServer.length === 0 ? (
                    <div className="text-xs text-neutral-400 text-center py-4">
                      No hay pedidos pendientes de retiro
                    </div>
                  ) : (
                    readyOrdersForServer.map(o => (
                      <div 
                        key={o.id}
                        onClick={() => {
                          onOrderClick?.(o);
                          setShowNotifications(false);
                        }}
                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                          o.estado === 'listo' 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100' 
                            : 'bg-red-50 border-red-200 text-red-900 hover:bg-red-100'
                        }`}
                      >
                        <div className="font-bold flex items-center justify-between">
                          <span>
                            {o.tipo === 'local' ? `Mesa #${o.mesaNumero}` : `Delivery (${o.empresaDelivery || 'General'})`}
                          </span>
                          <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-white/80">
                            {o.estado === 'listo' ? '¡LISTO PARA ENTREGAR!' : 'RECHAZADO'}
                          </span>
                        </div>
                        <div className="text-[11px] mt-1 text-neutral-600 truncate">
                          {o.items.map(i => `${i.cantidad}x ${i.nombre}`).join(', ')}
                        </div>
                        {o.motivoRechazo && (
                          <div className="text-[10px] text-red-600 mt-1 font-semibold">
                            Motivo: {o.motivoRechazo}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Employee badge */}
          <div className="flex items-center gap-2 pl-2 border-l border-neutral-200">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-neutral-900 leading-tight">
                {currentEmployee.nombre}
              </div>
              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded border ${roleColors[currentEmployee.puesto] || 'bg-neutral-100'}`}>
                {currentEmployee.puesto}
              </span>
            </div>

            {/* End Shift Button */}
            <button
              onClick={() => setShowEndShiftModal(true)}
              className="px-3 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              title="Cerrar turno y ver balance"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Cerrar Turno</span>
            </button>
          </div>

        </div>

      </header>

      {/* Modal: Confirmación de Cierre de Turno y Resumen */}
      {showEndShiftModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-neutral-900 text-base">Cierre de Turno</h3>
                  <p className="text-xs text-neutral-500">Resumen de jornada laboral</p>
                </div>
              </div>
              <button
                onClick={() => setShowEndShiftModal(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary metrics */}
            <div className="grid grid-cols-3 gap-3 bg-neutral-50 p-3 rounded-2xl border border-neutral-200 text-center">
              <div>
                <div className="text-[11px] uppercase font-bold text-neutral-500">Horas</div>
                <div className="text-lg font-black text-neutral-900 mt-0.5">
                  {calculateShiftHours()} h
                </div>
                <div className="text-[10px] text-neutral-400">Trabajadas</div>
              </div>

              <div className="border-x border-neutral-200">
                <div className="text-[11px] uppercase font-bold text-neutral-500">Pedidos</div>
                <div className="text-lg font-black text-orange-600 mt-0.5">
                  {currentShift?.pedidosTomados || 0}
                </div>
                <div className="text-[10px] text-neutral-400">Atendidos</div>
              </div>

              <div>
                <div className="text-[11px] uppercase font-bold text-neutral-500">Ventas</div>
                <div className="text-lg font-black text-emerald-600 mt-0.5">
                  ${(currentShift?.ventasGeneradas || 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-neutral-400">Generadas</div>
              </div>
            </div>

            {/* Reporte opcional de labores */}
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-orange-500" />
                Reporte de labores (Opcional):
              </label>
              <textarea
                value={reporteLabores}
                onChange={(e) => setReporteLabores(e.target.value)}
                placeholder="Ejemplo: Turno completado sin novedades, reposición de vajilla realizada..."
                rows={3}
                className="w-full text-xs p-3 rounded-xl border border-neutral-300 focus:ring-2 focus:ring-orange-500 focus:outline-none resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEndShiftModal(false)}
                className="h-12 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition"
              >
                Continuar Turno
              </button>
              <button
                type="button"
                onClick={handleConfirmEndShift}
                className="h-12 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 transition flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Finalizar y Salir
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
