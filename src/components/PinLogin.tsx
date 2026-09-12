import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { sounds } from '../utils/sound';
import { openShift } from '../services/dataService';
import { Lock, UtensilsCrossed, ShieldAlert, Sparkles, Delete } from 'lucide-react';

export const PinLogin: React.FC = () => {
  const [pin, setPin] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const { loginWithPin, isLocked, lockRemainingSeconds, allEmployees, allRestaurants } = useAuth();

  const handleDigit = (digit: string) => {
    if (isLocked || pin.length >= 4) return;
    sounds.playKeypadClick();
    const newPin = pin + digit;
    setPin(newPin);
    setErrorMsg('');

    if (newPin.length === 4) {
      submitPin(newPin);
    }
  };

  const handleDelete = () => {
    if (isLocked) return;
    sounds.playKeypadClick();
    setPin(prev => prev.slice(0, -1));
    setErrorMsg('');
  };

  const handleClear = () => {
    if (isLocked) return;
    sounds.playKeypadClick();
    setPin('');
    setErrorMsg('');
  };

  const submitPin = async (inputPin: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await loginWithPin(inputPin);
      if (res.success && res.employee) {
        sounds.playKeypadClick();
        // Verificar o abrir turno
        const rest = allRestaurants.find(r => r.id === res.employee!.restaurantId) || allRestaurants[0];
        // Iniciar turno si no tenía uno abierto
        // La función openShift se ejecutará si hace falta
        try {
          // Buscamos si ya tiene turno o lo dejamos al hook
          await openShift(res.employee, rest?.nombre || 'Sede Central');
        } catch (e) {
          // Si ya tiene turno abierto o falla creación duplicada no bloquea
          console.log('Turno previo activo o inicializado.');
        }
      } else {
        sounds.playAlertWarning();
        setErrorMsg(res.message);
        setPin('');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al validar PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="pin-login-container" className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 flex flex-col justify-center items-center p-4 sm:p-6 select-none">
      
      {/* Brand Header */}
      <div className="w-full max-w-md text-center mb-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/20 mb-3 transform hover:scale-105 transition-all">
          <UtensilsCrossed className="w-10 h-10" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-neutral-900 flex items-center justify-center gap-2">
          Gastro <span className="text-orange-600">Smart</span>
        </h1>
        <p className="text-neutral-600 font-medium text-sm sm:text-base mt-1">
          Control de acceso táctil multisede
        </p>
      </div>

      {/* Main Tablet Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-orange-100/80 p-6 sm:p-8 flex flex-col items-center backdrop-blur-sm">
        
        {/* State Display: Dots or Lock Status */}
        <div className="w-full flex flex-col items-center mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-neutral-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Ingresa tu PIN de 4 dígitos
            </span>
          </div>

          {/* 4 PIN Dots */}
          <div className="flex items-center justify-center gap-4 my-2">
            {[0, 1, 2, 3].map((idx) => {
              const isFilled = pin.length > idx;
              return (
                <div
                  key={idx}
                  className={`w-5 h-5 rounded-full transition-all duration-200 ${
                    isFilled 
                      ? 'bg-orange-500 scale-125 shadow-md shadow-orange-300' 
                      : 'bg-neutral-200'
                  }`}
                />
              );
            })}
          </div>

          {/* Feedback & Lock status */}
          {isLocked ? (
            <div className="mt-3 flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-xl animate-pulse">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Bloqueado temporalmente: {lockRemainingSeconds}s</span>
            </div>
          ) : errorMsg ? (
            <div className="mt-3 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium rounded-xl text-center">
              {errorMsg}
            </div>
          ) : (
            <div className="h-9 flex items-center text-xs text-neutral-400">
              Presiona los números en la pantalla táctil
            </div>
          )}
        </div>

        {/* Large Tactile Keypad (Optimizado Tablet con mínimo 56px de alto) */}
        <div className="w-full grid grid-cols-3 gap-3 sm:gap-4 max-w-xs">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={isLocked || loading}
              onClick={() => handleDigit(digit)}
              className="h-16 sm:h-18 rounded-2xl bg-neutral-50 hover:bg-orange-50 active:bg-orange-500 active:text-white border border-neutral-200/80 hover:border-orange-300 text-2xl sm:text-3xl font-bold text-neutral-800 transition-all flex items-center justify-center shadow-sm active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
            >
              {digit}
            </button>
          ))}

          {/* Clear button */}
          <button
            type="button"
            disabled={isLocked || pin.length === 0}
            onClick={handleClear}
            className="h-16 sm:h-18 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-600 font-semibold text-sm transition-all flex items-center justify-center active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
          >
            LIMPIAR
          </button>

          {/* Zero */}
          <button
            type="button"
            disabled={isLocked || loading}
            onClick={() => handleDigit('0')}
            className="h-16 sm:h-18 rounded-2xl bg-neutral-50 hover:bg-orange-50 active:bg-orange-500 active:text-white border border-neutral-200/80 hover:border-orange-300 text-2xl sm:text-3xl font-bold text-neutral-800 transition-all flex items-center justify-center shadow-sm active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
          >
            0
          </button>

          {/* Backspace */}
          <button
            type="button"
            disabled={isLocked || pin.length === 0}
            onClick={handleDelete}
            className="h-16 sm:h-18 rounded-2xl bg-neutral-100 hover:bg-red-50 hover:text-red-600 text-neutral-600 transition-all flex items-center justify-center active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>

        {/* Demo Fast Access (Ayuda para pruebas de evaluación rápida) */}
        <div className="w-full mt-6 pt-5 border-t border-neutral-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider font-bold text-neutral-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Accesos Demo Rápidos (PIN)
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <button
              onClick={() => { setPin('1111'); submitPin('1111'); }}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-50 hover:bg-orange-50 border border-neutral-200 text-left transition"
            >
              <div className="font-bold text-neutral-800">Admin: 1111</div>
              <div className="text-[10px] text-neutral-500">Acceso total</div>
            </button>
            <button
              onClick={() => { setPin('2222'); submitPin('2222'); }}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-50 hover:bg-orange-50 border border-neutral-200 text-left transition"
            >
              <div className="font-bold text-neutral-800">Caja: 2222</div>
              <div className="text-[10px] text-neutral-500">Cobros y Arqueo</div>
            </button>
            <button
              onClick={() => { setPin('3333'); submitPin('3333'); }}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-50 hover:bg-orange-50 border border-neutral-200 text-left transition"
            >
              <div className="font-bold text-neutral-800">Mesero: 3333</div>
              <div className="text-[10px] text-neutral-500">POS y Pedidos</div>
            </button>
            <button
              onClick={() => { setPin('4444'); submitPin('4444'); }}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-50 hover:bg-orange-50 border border-neutral-200 text-left transition"
            >
              <div className="font-bold text-neutral-800">Cocina: 4444</div>
              <div className="text-[10px] text-neutral-500">Kiosko en vivo</div>
            </button>
            <button
              onClick={() => { setPin('6666'); submitPin('6666'); }}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-50 hover:bg-orange-50 border border-neutral-200 text-left transition"
            >
              <div className="font-bold text-neutral-800">Ayudante: 6666</div>
              <div className="text-[10px] text-neutral-500">Solo asistencia</div>
            </button>
            <button
              onClick={() => { setPin('7777'); submitPin('7777'); }}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-50 hover:bg-orange-50 border border-neutral-200 text-left transition"
            >
              <div className="font-bold text-neutral-800">Limpieza: 7777</div>
              <div className="text-[10px] text-neutral-500">Solo asistencia</div>
            </button>
          </div>
        </div>

      </div>

      <div className="mt-6 text-center text-xs text-neutral-500">
        Inactividad: Cierre a los 15 minutos • Bloqueo de 30s tras 3 fallos • Auto-cierre a las 14h
      </div>

    </div>
  );
};
