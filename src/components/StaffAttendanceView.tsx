import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shift } from '../types';
import { openShift, closeShift, subscribeToShifts, pauseShift, resumeShift } from '../services/dataService';
import { sounds } from '../utils/sound';
import { 
  Clock, 
  Calendar, 
  Play, 
  Square, 
  Pause,
  FileText, 
  CheckCircle2, 
  LogOut, 
  Sparkles, 
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';

export const StaffAttendanceView: React.FC = () => {
  const { currentEmployee, currentShift, currentRestaurant, logout, endShiftAndLogout } = useAuth();

  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [reporteLabores, setReporteLabores] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [employeeShifts, setEmployeeShifts] = useState<Shift[]>([]);

  // Reloj en tiempo real
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Suscribirse al historial de turnos de este empleado
  useEffect(() => {
    if (!currentEmployee) return;
    const unsub = subscribeToShifts(null, (allShifts) => {
      const mine = allShifts.filter(s => s.employeeId === currentEmployee.id);
      setEmployeeShifts(mine);
    });
    return () => unsub();
  }, [currentEmployee]);

  if (!currentEmployee) return null;

  // Calcular horas acumuladas hoy
  const todayString = currentTime.toISOString().split('T')[0];
  const todayShifts = employeeShifts.filter(s => s.fecha === todayString && s.estado === 'cerrado');
  const todayMinutesClosed = todayShifts.reduce((acc, s) => acc + (s.minutosTrabajados || 0), 0);

  // Si tiene turno abierto ahora, sumarlo a las horas de hoy
  let currentShiftMinutes = 0;
  if (currentShift && (currentShift.estado === 'abierto' || currentShift.estado === 'en_pausa')) {
    const startMs = new Date(currentShift.horaInicio).getTime();
    currentShiftMinutes = Math.max(0, Math.floor((currentTime.getTime() - startMs) / 60000));
    
    if (currentShift.pausas && currentShift.pausas.length > 0) {
      let pauseMinutes = 0;
      currentShift.pausas.forEach(p => {
        if (p.fin) {
          pauseMinutes += Math.max(0, Math.floor((new Date(p.fin).getTime() - new Date(p.inicio).getTime()) / 60000));
        } else {
          pauseMinutes += Math.max(0, Math.floor((currentTime.getTime() - new Date(p.inicio).getTime()) / 60000));
        }
      });
      currentShiftMinutes = Math.max(0, currentShiftMinutes - pauseMinutes);
    }
  }
  const totalTodayHours = ((todayMinutesClosed + currentShiftMinutes) / 60).toFixed(1);

  // Calcular horas acumuladas esta semana (últimos 7 días)
  const oneWeekAgoMs = currentTime.getTime() - 7 * 24 * 60 * 60 * 1000;
  const weekShifts = employeeShifts.filter(s => {
    const shiftTime = new Date(s.horaInicio).getTime();
    return shiftTime >= oneWeekAgoMs && s.estado === 'cerrado';
  });
  const weekMinutesClosed = weekShifts.reduce((acc, s) => acc + (s.minutosTrabajados || 0), 0);
  const totalWeekHours = ((weekMinutesClosed + currentShiftMinutes) / 60).toFixed(1);

  const handleStartShift = async () => {
    setIsProcessing(true);
    sounds.playKeypadClick();
    try {
      await openShift(currentEmployee, currentRestaurant?.nombre || 'Sede Central');
    } catch (e) {
      console.error('Error starting shift:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmCloseShift = async () => {
    setIsProcessing(true);
    sounds.playCashRegister();
    try {
      await endShiftAndLogout(reporteLabores);
      setShowCloseModal(false);
    } catch (e) {
      console.error('Error closing shift:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const roleTitle = currentEmployee.puesto === 'ayudante_cocina' ? 'Ayudante de Cocina' : 'Personal de Limpieza';
  const roleBadgeColor = currentEmployee.puesto === 'ayudante_cocina'
    ? 'bg-amber-100 text-amber-800 border-amber-300'
    : 'bg-teal-100 text-teal-800 border-teal-300';

  const isShiftOpen = !!(currentShift && (currentShift.estado === 'abierto' || currentShift.estado === 'en_pausa'));

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col justify-between p-6 sm:p-10 select-none">
      
      {/* Top Header: Restaurante y Cerrar Sesión */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <div className="text-xs uppercase tracking-widest font-black text-orange-400">
            {currentRestaurant?.nombre || 'Gastro Smart'}
          </div>
          <div className="text-sm text-neutral-400 font-medium mt-0.5">
            Módulo Exclusivo de Asistencia y Jornada
          </div>
        </div>

        <button
          onClick={logout}
          className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-bold transition flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Cambiar Usuario</span>
        </button>
      </div>

      {/* Main Center Area */}
      <div className="max-w-xl mx-auto w-full my-auto text-center space-y-6">
        
        {/* Nombre y Puesto Grande */}
        <div>
          <span className={`inline-block text-xs uppercase tracking-widest font-black px-3.5 py-1.5 rounded-full border mb-3 ${roleBadgeColor}`}>
            {roleTitle}
          </span>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white">
            {currentEmployee.nombre}
          </h1>
        </div>

        {/* Hora y Fecha Actual */}
        <div className="bg-neutral-800/80 rounded-3xl p-6 border border-neutral-700 shadow-xl backdrop-blur-md">
          <div className="text-5xl sm:text-6xl font-mono font-black text-white tracking-wider flex items-center justify-center gap-3">
            <Clock className="w-10 h-10 text-orange-500 animate-pulse shrink-0" />
            <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </div>
          <div className="text-neutral-400 text-sm sm:text-base font-semibold mt-2 flex items-center justify-center gap-2">
            <Calendar className="w-4 h-4 text-neutral-500" />
            <span>{currentTime.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>

        {/* Botón Gigante Iniciar / Cerrar Turno */}
        <div className="pt-2">
          {!isShiftOpen ? (
            <button
              onClick={handleStartShift}
              disabled={isProcessing}
              className="w-full h-24 sm:h-28 rounded-3xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-2xl sm:text-3xl shadow-2xl shadow-emerald-900/50 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-4 disabled:opacity-50"
            >
              <Play className="w-9 h-9 fill-current" />
              <span>INICIAR TURNO</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={async () => {
                  try {
                    setIsProcessing(true);
                    sounds.playNotification();
                    if (currentShift?.estado === 'en_pausa') {
                      await resumeShift(currentShift.id);
                    } else {
                      await pauseShift(currentShift.id);
                    }
                  } catch (e) {
                    console.error(e);
                    alert('Error al cambiar estado de pausa');
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                disabled={isProcessing}
                className={`w-full h-24 sm:h-28 rounded-3xl font-black text-xl sm:text-2xl transition-all transform hover:scale-[1.02] active:scale-[0.98] flex flex-col items-center justify-center gap-2 disabled:opacity-50 ${
                  currentShift?.estado === 'en_pausa'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xl shadow-emerald-900/50'
                    : 'bg-amber-500 hover:bg-amber-400 text-amber-950 shadow-2xl shadow-amber-900/50'
                }`}
              >
                {currentShift?.estado === 'en_pausa' ? <Play className="w-8 h-8 fill-current" /> : <Pause className="w-8 h-8 fill-current" />}
                <span>{currentShift?.estado === 'en_pausa' ? 'REANUDAR' : 'PAUSAR'}</span>
              </button>
              
              <button
                onClick={() => setShowCloseModal(true)}
                disabled={isProcessing}
                className="w-full h-24 sm:h-28 rounded-3xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-black text-xl sm:text-2xl shadow-2xl shadow-red-900/50 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex flex-col items-center justify-center gap-2 disabled:opacity-50"
              >
                <Square className="w-8 h-8 fill-current" />
                <span>CERRAR TURNO</span>
              </button>
            </div>
          )}

          {isShiftOpen && (
            <div className={`mt-3 flex items-center justify-center gap-2 text-xs font-bold ${currentShift?.estado === 'en_pausa' ? 'text-amber-400' : 'text-emerald-400 animate-pulse'}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${currentShift?.estado === 'en_pausa' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <span>{currentShift?.estado === 'en_pausa' ? 'Turno actualmente en pausa' : 'Turno actualmente abierto (en curso)'}</span>
            </div>
          )}
        </div>

        {/* Resumen Simple de Horas */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="bg-neutral-800/60 rounded-2xl p-4 border border-neutral-700 text-center">
            <div className="text-[11px] uppercase tracking-wider font-bold text-neutral-400">
              Horas Acumuladas Hoy
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white mt-1">
              {totalTodayHours} <span className="text-sm font-normal text-neutral-400">hrs</span>
            </div>
          </div>

          <div className="bg-neutral-800/60 rounded-2xl p-4 border border-neutral-700 text-center">
            <div className="text-[11px] uppercase tracking-wider font-bold text-neutral-400">
              Esta Semana (7 días)
            </div>
            <div className="text-2xl sm:text-3xl font-black text-orange-400 mt-1">
              {totalWeekHours} <span className="text-sm font-normal text-neutral-400">hrs</span>
            </div>
          </div>
        </div>

      </div>

      {/* Footer Info */}
      <div className="text-center text-xs text-neutral-500 pt-4 border-t border-neutral-800">
        Control biométrico/PIN • Turno auto-cierre a las 14h • Inactividad a los 15 min
      </div>

      {/* MODAL: Cierre de Turno y Reporte de Labores */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-neutral-800 rounded-3xl max-w-md w-full p-6 sm:p-7 border border-neutral-700 shadow-2xl text-left space-y-4">
            
            <div className="flex items-center gap-3 pb-3 border-b border-neutral-700">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center">
                <Square className="w-5 h-5 fill-current" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base">Confirmar Cierre de Turno</h3>
                <p className="text-xs text-neutral-400">Finalizarás tu jornada laboral actual</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1.5 flex items-center gap-2">
                <FileText className="w-4 h-4 text-orange-400" />
                <span>Reporte de labores (Opcional):</span>
              </label>
              <textarea
                rows={4}
                value={reporteLabores}
                onChange={(e) => setReporteLabores(e.target.value)}
                placeholder={currentEmployee.puesto === 'limpieza' 
                  ? "Ej: Áreas atendidas: salón principal, sanitarios y cocina profunda. Insumo faltante: detergente y toallas de papel..."
                  : "Ej: Preparación de mise en place para cena, picado de verduras y apoyo en lavado de loza..."}
                className="w-full p-3 rounded-2xl bg-neutral-900 border border-neutral-700 text-white text-xs placeholder-neutral-500 focus:border-orange-500 outline-none resize-none leading-relaxed"
              />
              <p className="text-[11px] text-neutral-500 mt-1">
                Especialmente útil para reportar tareas terminadas, incidencias o faltantes de insumos.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="h-12 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-white font-bold text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmCloseShift}
                className="h-12 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs shadow-lg shadow-red-900/40 transition flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar y Salir</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
