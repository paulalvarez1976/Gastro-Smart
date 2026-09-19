import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { sounds } from '../utils/sound';
import { PWAInstallButton } from './PWAInstallButton';
import { DeviceBadge } from './DeviceBadge';
import { 
  Lock, 
  Mail, 
  KeyRound, 
  Building2, 
  UtensilsCrossed, 
  ShieldAlert, 
  ShieldCheck, 
  Sparkles, 
  Delete, 
  Store, 
  User, 
  FileText, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  EyeOff,
  Clock,
  Briefcase
} from 'lucide-react';

export const AuthScreen: React.FC = () => {
  const { 
    loginAdminWithEmail, 
    loginAdminWithGoogle,
    loginDemoMode,
    registerOwnerAndBusiness, 
    resetAdminPassword,
    loginWithPin, 
    isLocked, 
    lockRemainingSeconds, 
    lockSeverity,
    allRestaurants,
    allBusinesses,
    selectedRestaurantId,
    selectRestaurant,
    currentBusiness,
    selfHealingToast,
    dismissSelfHealingToast
  } = useAuth();

  // Tab de modo: 'admin' | 'employee'
  const [authMode, setAuthMode] = useState<'admin' | 'employee'>('admin');

  // Sub-vista de admin: 'login' | 'register' | 'forgot'
  const [adminView, setAdminView] = useState<'login' | 'register' | 'forgot'>('login');

  // Form states - Admin Login
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [adminFeedback, setAdminFeedback] = useState<{ type: 'success' | 'error'; text: string; notRegisteredInApp?: boolean } | null>(null);

  // Form states - Register Business & Owner
  const [regBusinessName, setRegBusinessName] = useState('');
  const [regRif, setRegRif] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regFeedback, setRegFeedback] = useState<{ type: 'success' | 'error'; text: string; isEmailInUse?: boolean } | null>(null);

  // Form states - Forgot Password
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotFeedback, setForgotFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states - Employee PIN
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    return selectedRestaurantId || (allRestaurants[0]?.id) || '';
  });
  const [pin, setPin] = useState<string>('');
  const [pinErrorMsg, setPinErrorMsg] = useState<string>('');
  const [pinLoading, setPinLoading] = useState(false);

  // Sincronizar sucursal seleccionada con la lista de restaurantes disponibles
  useEffect(() => {
    if (selectedRestaurantId && allRestaurants.some(r => r.id === selectedRestaurantId)) {
      setSelectedBranchId(selectedRestaurantId);
    } else if (allRestaurants.length > 0 && (!selectedBranchId || !allRestaurants.some(r => r.id === selectedBranchId))) {
      setSelectedBranchId(allRestaurants[0].id);
    }
  }, [allRestaurants, selectedRestaurantId]);

  // Reproducir sonido cuando aparece toast de autorrecuperación o notificación
  useEffect(() => {
    if (selfHealingToast) {
      sounds.playNotification();
    }
  }, [selfHealingToast]);

  const activeRest = allRestaurants.find(r => r.id === (selectedBranchId || selectedRestaurantId)) || allRestaurants[0] || null;
  const activeBiz = activeRest ? allBusinesses.find(b => b.id === activeRest.businessId) : null;

  // ================= ADMIN HANDLERS =================
  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    setAdminFeedback(null);
    setRegFeedback(null);
    try {
      sounds.playKeypadClick();
      const res = await loginAdminWithGoogle();
      if (res.success) {
        sounds.playCashRegister();
      } else {
        sounds.playAlertWarning();
        if (adminView === 'register') {
          setRegFeedback({ type: 'error', text: res.message });
        } else {
          setAdminFeedback({ type: 'error', text: res.message });
        }
      }
    } catch (err: any) {
      const msg = err.message || 'Error al autenticar con Google';
      if (adminView === 'register') {
        setRegFeedback({ type: 'error', text: msg });
      } else {
        setAdminFeedback({ type: 'error', text: msg });
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail.trim() || !adminPassword) {
      setAdminFeedback({ type: 'error', text: 'Por favor ingresa tu email y contraseña.' });
      return;
    }

    setAdminLoading(true);
    setAdminFeedback(null);
    try {
      const res = await loginAdminWithEmail(adminEmail, adminPassword);
      if (res.success) {
        sounds.playCashRegister();
      } else {
        sounds.playAlertWarning();
        setAdminFeedback({ 
          type: 'error', 
          text: res.message, 
          notRegisteredInApp: res.notRegisteredInApp 
        });
      }
    } catch (err: any) {
      setAdminFeedback({ type: 'error', text: err.message || 'Error al iniciar sesión' });
    } finally {
      setAdminLoading(false);
    }
  };

  const handleRegisterBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regBusinessName.trim() || !regOwnerName.trim() || !regEmail.trim() || !regPassword) {
      setRegFeedback({ type: 'error', text: 'Por favor completa todos los campos obligatorios.' });
      return;
    }
    if (regPassword.length < 6) {
      setRegFeedback({ type: 'error', text: 'La contraseña debe tener mínimo 6 caracteres.' });
      return;
    }

    setRegLoading(true);
    setRegFeedback(null);
    try {
      sounds.playKeypadClick();
      const res = await registerOwnerAndBusiness({
        businessName: regBusinessName,
        rif_o_ruc: regRif || 'N/A',
        ownerName: regOwnerName,
        email: regEmail,
        pass: regPassword
      });

      if (res.success) {
        sounds.playCashRegister();
      } else {
        sounds.playAlertWarning();
        setRegFeedback({ 
          type: 'error', 
          text: res.message,
          isEmailInUse: res.isEmailInUse
        });
      }
    } catch (err: any) {
      setRegFeedback({ type: 'error', text: err.message || 'Error en el registro' });
    } finally {
      setRegLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setForgotFeedback({ type: 'error', text: 'Por favor ingresa tu email registrado.' });
      return;
    }
    setForgotLoading(true);
    setForgotFeedback(null);
    try {
      const res = await resetAdminPassword(forgotEmail);
      if (res.success) {
        setForgotFeedback({ type: 'success', text: res.message });
      } else {
        setForgotFeedback({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setForgotFeedback({ type: 'error', text: err.message || 'Error al enviar recuperación' });
    } finally {
      setForgotLoading(false);
    }
  };

  // ================= EMPLOYEE PIN HANDLERS =================
  const handleDigit = (digit: string) => {
    if (isLocked || pin.length >= 4) return;
    sounds.playKeypadClick();
    const newPin = pin + digit;
    setPin(newPin);
    setPinErrorMsg('');

    if (newPin.length === 4) {
      submitEmployeePin(newPin);
    }
  };

  const handleDelete = () => {
    if (isLocked) return;
    sounds.playKeypadClick();
    setPin(prev => prev.slice(0, -1));
    setPinErrorMsg('');
  };

  const handleClear = () => {
    if (isLocked) return;
    sounds.playKeypadClick();
    setPin('');
    setPinErrorMsg('');
  };

  const submitEmployeePin = async (inputPin: string) => {
    setPinLoading(true);
    setPinErrorMsg('');
    try {
      const branchToUse = selectedBranchId || (allRestaurants[0]?.id);
      const res = await loginWithPin(inputPin, branchToUse);
      if (res.success && res.employee) {
        sounds.playKeypadClick();
      } else {
        sounds.playAlertWarning();
        setPinErrorMsg(res.message);
        setPin('');
      }
    } catch (err: any) {
      setPinErrorMsg(err.message || 'Error al validar PIN');
      setPin('');
    } finally {
      setPinLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 flex flex-col justify-center items-center p-4 sm:p-6 select-none">
      
      {/* Toast de Self-Healing si ocurrió autorrecuperación de admin */}
      {selfHealingToast && (
        <div className="fixed top-5 z-50 max-w-md w-full px-4 animate-in slide-in-from-top duration-300">
          <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-xl flex items-center justify-between gap-3 border border-emerald-400">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 shrink-0" />
              <div className="text-xs font-bold leading-tight">
                {selfHealingToast}
              </div>
            </div>
            <button
              onClick={dismissSelfHealingToast}
              className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shrink-0 transition"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Brand Header */}
      <div className="w-full max-w-md text-center mb-5">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/20 mb-3 transform hover:scale-105 transition-all">
          <UtensilsCrossed className="w-8 h-8 sm:w-10 sm:h-10" />
        </div>
        <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-neutral-900 flex items-center justify-center gap-2">
          Gastro <span className="text-orange-600">Smart</span>
        </h1>
        <p className="text-neutral-600 font-medium text-xs sm:text-sm mt-0.5">
          Plataforma Multi-sucursal para Restaurantes & Bares
        </p>
        <div className="flex items-center justify-center gap-2 mt-2.5">
          <DeviceBadge />
          <PWAInstallButton variant="nav" />
        </div>
      </div>

      {/* Selector de Modo: Administrador vs Empleado */}
      <div className="w-full max-w-md mb-4 bg-white/80 p-1.5 rounded-2xl shadow-sm border border-orange-200/60 backdrop-blur-xs grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => {
            sounds.playKeypadClick();
            setAuthMode('admin');
            setAdminFeedback(null);
          }}
          className={`h-11 rounded-xl font-extrabold text-xs sm:text-sm transition flex items-center justify-center gap-2 ${
            authMode === 'admin'
              ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
              : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Dueño / Admin</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playKeypadClick();
            setAuthMode('employee');
            setPinErrorMsg('');
          }}
          className={`h-11 rounded-xl font-extrabold text-xs sm:text-sm transition flex items-center justify-center gap-2 ${
            authMode === 'employee'
              ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
              : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>Personal (PIN)</span>
        </button>
      </div>

      {/* ===================== VISTA ADMINISTRADOR / DUEÑO ===================== */}
      {authMode === 'admin' && (
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-orange-100 p-6 sm:p-8 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-150">
          
          {/* Sub-view: Login */}
          {adminView === 'login' && (
            <div>
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-orange-100 text-orange-600 mb-2">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-black text-neutral-900">Acceso Administrativo</h2>
                <p className="text-xs text-neutral-500 mt-0.5">Ingresa con tus credenciales de Dueño o Administrador</p>
              </div>

              {adminFeedback && (
                <div className={`p-3.5 mb-4 rounded-xl text-xs font-semibold flex flex-col gap-2 ${
                  adminFeedback.type === 'success' 
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{adminFeedback.text}</span>
                  </div>
                  {adminFeedback.notRegisteredInApp && (
                    <button
                      type="button"
                      onClick={() => {
                        sounds.playKeypadClick();
                        setAdminView('register');
                        setRegEmail(adminEmail);
                        setRegFeedback(null);
                        setAdminFeedback(null);
                      }}
                      className="mt-1 w-full py-2 px-3 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <Store className="w-3.5 h-3.5" />
                      <span>Crear cuenta en Gastro Smart</span>
                    </button>
                  )}
                </div>
              )}

              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-orange-500" />
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="admin@gastrosmart.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-neutral-300 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-neutral-700 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-orange-500" />
                      Contraseña
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setAdminView('forgot');
                        setForgotFeedback(null);
                      }}
                      className="text-[11px] font-bold text-orange-600 hover:underline"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full h-11 pl-3.5 pr-10 rounded-xl border border-neutral-300 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={adminLoading}
                  className="w-full h-12 rounded-xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-extrabold text-sm shadow-md shadow-orange-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {adminLoading ? 'Autenticando...' : 'Iniciar Sesión'}
                </button>
              </form>

              {/* Enlace para registrar nuevo negocio */}
              <div className="mt-5 pt-4 border-t border-neutral-100 text-center space-y-3">
                <button
                  type="button"
                  disabled={googleLoading}
                  onClick={handleGoogleAuth}
                  className="w-full h-11 rounded-xl bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-800 font-bold text-xs transition flex items-center justify-center gap-2.5 shadow-sm"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>{googleLoading ? 'Conectando con Google...' : 'Continuar con Google'}</span>
                </button>

                <p className="text-xs text-neutral-600">
                  ¿Eres nuevo en Gastro Smart?
                </p>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playKeypadClick();
                    setAdminView('register');
                    setRegFeedback(null);
                  }}
                  className="w-full h-11 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-extrabold text-xs transition flex items-center justify-center gap-2"
                >
                  <Store className="w-4 h-4 text-orange-600" />
                  <span>Crear Cuenta de Negocio (Gratis)</span>
                </button>
              </div>

              {/* Demo Helper Rápido */}
              <div className="mt-4 pt-3 border-t border-neutral-100 space-y-2">
                <button
                  type="button"
                  onClick={async () => {
                    sounds.playKeypadClick();
                    const res = await loginDemoMode();
                    if (res.success) {
                      sounds.playCashRegister();
                    } else {
                      setAdminFeedback({ type: 'error', text: res.message });
                    }
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-white" />
                  <span>🚀 Acceso DEMO Instantáneo (Sin Red / Offline)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdminEmail('admin@gastrosmart.com');
                    setAdminPassword('admin1234');
                  }}
                  className="w-full text-center text-[11px] text-neutral-500 hover:text-orange-600 font-semibold py-1 transition flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Rellenar con credenciales demo (admin@gastrosmart.com / admin1234)
                </button>
              </div>
            </div>
          )}

          {/* Sub-view: Register New Business */}
          {adminView === 'register' && (
            <div>
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-orange-100 text-orange-600 mb-2">
                  <Store className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-black text-neutral-900">Registrar Nuevo Negocio</h2>
                <p className="text-xs text-neutral-500 mt-0.5">Crea tu empresa y activa el panel de control</p>
              </div>

              {regFeedback && (
                <div className={`p-3.5 mb-4 rounded-xl text-xs font-semibold space-y-2.5 ${
                  regFeedback.type === 'success' 
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{regFeedback.text}</span>
                  </div>
                  {regFeedback.isEmailInUse && (
                    <div className="flex flex-col gap-1.5 pt-1.5 border-t border-red-200/60">
                      <button
                        type="button"
                        onClick={() => {
                          setAdminEmail(regEmail);
                          setAdminPassword(regPassword);
                          setAdminView('login');
                          setAdminFeedback(null);
                        }}
                        className="w-full py-1.5 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs text-center transition"
                      >
                        🔑 Iniciar Sesión con {regEmail}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotEmail(regEmail);
                          setAdminView('forgot');
                          setForgotFeedback(null);
                        }}
                        className="w-full py-1.5 px-3 rounded-lg bg-white hover:bg-neutral-100 text-neutral-700 font-bold text-xs border border-neutral-300 text-center transition"
                      >
                        ❓ Recuperar mi contraseña
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="mb-4">
                <button
                  type="button"
                  disabled={googleLoading}
                  onClick={handleGoogleAuth}
                  className="w-full h-11 rounded-xl bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-800 font-bold text-xs transition flex items-center justify-center gap-2.5 shadow-sm"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>{googleLoading ? 'Creando con Google...' : 'Registrar con Google en 1 clic'}</span>
                </button>
                <div className="relative flex py-3 items-center">
                  <div className="flex-grow border-t border-neutral-200"></div>
                  <span className="flex-shrink mx-2 text-[11px] font-semibold text-neutral-400 uppercase">o con correo</span>
                  <div className="flex-grow border-t border-neutral-200"></div>
                </div>
              </div>

              <form onSubmit={handleRegisterBusiness} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-orange-500" />
                    Nombre del Negocio / Cadena: *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Grupo Gastronómico Don Mario"
                    value={regBusinessName}
                    onChange={(e) => setRegBusinessName(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-medium focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-orange-500" />
                      RIF / RUC / ID Fiscal:
                    </label>
                    <input
                      type="text"
                      placeholder="J-12345678-0"
                      value={regRif}
                      onChange={(e) => setRegRif(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-medium focus:border-orange-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-orange-500" />
                      Nombre del Dueño: *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Mario Rossi"
                      value={regOwnerName}
                      onChange={(e) => setRegOwnerName(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-medium focus:border-orange-500 outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-orange-500" />
                    Email de Administrador: *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="dueno@restaurante.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-medium focus:border-orange-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-orange-500" />
                    Contraseña (mínimo 6 caracteres): *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-medium focus:border-orange-500 outline-none transition"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAdminView('login')}
                    className="w-1/3 h-11 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition"
                  >
                    Volver
                  </button>
                  <button
                    type="submit"
                    disabled={regLoading}
                    className="w-2/3 h-11 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs shadow-md transition disabled:opacity-50"
                  >
                    {regLoading ? 'Registrando...' : 'Crear Negocio'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Sub-view: Forgot Password */}
          {adminView === 'forgot' && (
            <div>
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-amber-100 text-amber-600 mb-2">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-black text-neutral-900">Recuperar Contraseña</h2>
                <p className="text-xs text-neutral-500 mt-0.5">Te enviaremos un enlace oficial a tu correo registrado</p>
              </div>

              {forgotFeedback && (
                <div className={`p-3.5 mb-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  forgotFeedback.type === 'success' 
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{forgotFeedback.text}</span>
                </div>
              )}

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-orange-500" />
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="admin@gastrosmart.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-neutral-300 text-sm focus:border-orange-500 outline-none transition"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAdminView('login')}
                    className="w-1/3 h-11 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-2/3 h-11 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs shadow-md transition disabled:opacity-50"
                  >
                    {forgotLoading ? 'Enviando...' : 'Enviar Correo'}
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      )}

      {/* ===================== VISTA PERSONAL OPERATIVO (PIN) ===================== */}
      {authMode === 'employee' && (
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-orange-100/80 p-6 sm:p-8 flex flex-col items-center backdrop-blur-sm animate-in fade-in zoom-in-95 duration-150">
          
          {/* Selector y Visualizador de Restaurante / Sucursal */}
          {allRestaurants.length === 0 ? (
            <div className="w-full mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center">
              <Store className="w-6 h-6 text-amber-600 mx-auto mb-1.5" />
              <p className="text-xs font-bold text-neutral-800">No hay restaurantes registrados aún</p>
              <p className="text-[11px] text-neutral-500 mt-1">
                El dueño o administrador debe iniciar sesión para crear el primer restaurante y dar de alta a los empleados.
              </p>
              <button
                type="button"
                onClick={() => setAuthMode('admin')}
                className="mt-3 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition"
              >
                Acceder como Administrador
              </button>
            </div>
          ) : (
            <div className="w-full mb-4 bg-orange-50/70 border border-orange-200/80 rounded-2xl p-3 shadow-xs">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-extrabold text-orange-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-orange-600" />
                  <span>Restaurante / Sucursal de Ingreso</span>
                </label>
                {allRestaurants.length > 1 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-orange-200/80 text-orange-800 rounded-full">
                    {allRestaurants.length} sucursales
                  </span>
                )}
              </div>

              {allRestaurants.length > 1 ? (
                <select
                  value={activeRest?.id || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedBranchId(val);
                    selectRestaurant(val);
                    setPinErrorMsg('');
                  }}
                  className="w-full h-11 px-3 rounded-xl border border-orange-300 bg-white text-xs font-black text-neutral-800 outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 shadow-xs cursor-pointer"
                >
                  {allRestaurants.map(r => {
                    const biz = allBusinesses.find(b => b.id === r.businessId);
                    const bizLabel = biz ? ` [${biz.nombre}]` : '';
                    return (
                      <option key={r.id} value={r.id}>
                        🏢 {r.nombre}{bizLabel} {r.direccion ? `• ${r.direccion}` : `• ${r.numeroMesas || 10} mesas`}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <div className="flex items-center justify-between px-3 py-2 bg-white rounded-xl border border-orange-200 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-sm shrink-0">
                      🏢
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-neutral-800 truncate">
                        {activeRest?.nombre || 'Restaurante Principal'}
                      </div>
                      <div className="text-[10px] text-neutral-500 font-semibold truncate">
                        {activeBiz?.nombre || 'Gastro Smart'} {activeRest?.direccion ? `• ${activeRest.direccion}` : ''}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full shrink-0">
                    Activo
                  </span>
                </div>
              )}

              {/* Contexto visible para el empleado */}
              {activeRest && (
                <div className="mt-2 pt-2 border-t border-orange-200/60 flex items-center justify-between text-[11px] text-neutral-600 font-medium">
                  <span className="flex items-center gap-1 text-orange-900 font-semibold truncate">
                    <span>📍 Ingresando a:</span>
                    <strong className="text-neutral-900 font-extrabold">{activeRest.nombre}</strong>
                  </span>
                  <span className="text-neutral-500 text-[10px] shrink-0 font-bold">
                    {activeRest.numeroMesas || 10} Mesas
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Estado de Entrada: 4 Puntos de PIN */}
          <div className="w-full flex flex-col items-center mb-4">
            <div className="flex items-center gap-2 mb-2">
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

            {/* Avisos de Seguridad y Bloqueo Anti-Fuerza Bruta */}
            {isLocked ? (
              <div className="mt-3 flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl animate-pulse text-center">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  {lockSeverity === 'blocked_15m' 
                    ? `Bloqueo de seguridad: ${Math.ceil(lockRemainingSeconds / 60)} min restantes` 
                    : `Enfriamiento temporal: ${lockRemainingSeconds}s`}
                </span>
              </div>
            ) : pinErrorMsg ? (
              <div className="mt-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-xl text-center">
                {pinErrorMsg}
              </div>
            ) : (
              <div className="h-7 flex items-center text-[11px] text-neutral-400">
                Toca los números para identificarte
              </div>
            )}
          </div>

          {/* Teclado Táctil Grande */}
          <div className="w-full grid grid-cols-3 gap-3 max-w-xs">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={isLocked || pinLoading}
                onClick={() => handleDigit(digit)}
                className="h-14 sm:h-16 rounded-2xl bg-neutral-50 hover:bg-orange-50 active:bg-orange-500 active:text-white border border-neutral-200 hover:border-orange-300 text-2xl font-bold text-neutral-800 transition-all flex items-center justify-center shadow-xs active:scale-95 disabled:opacity-40"
              >
                {digit}
              </button>
            ))}

            <button
              type="button"
              disabled={isLocked || pin.length === 0}
              onClick={handleClear}
              className="h-14 sm:h-16 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-600 font-bold text-xs transition-all flex items-center justify-center active:scale-95 disabled:opacity-30"
            >
              LIMPIAR
            </button>

            <button
              type="button"
              disabled={isLocked || pinLoading}
              onClick={() => handleDigit('0')}
              className="h-14 sm:h-16 rounded-2xl bg-neutral-50 hover:bg-orange-50 active:bg-orange-500 active:text-white border border-neutral-200 hover:border-orange-300 text-2xl font-bold text-neutral-800 transition-all flex items-center justify-center shadow-xs active:scale-95 disabled:opacity-40"
            >
              0
            </button>

            <button
              type="button"
              disabled={isLocked || pin.length === 0}
              onClick={handleDelete}
              className="h-14 sm:h-16 rounded-2xl bg-neutral-100 hover:bg-red-50 hover:text-red-600 text-neutral-600 transition-all flex items-center justify-center active:scale-95 disabled:opacity-30"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-5 text-center text-[11px] text-neutral-500">
            Protección anti-fuerza bruta activa • 3 intentos = 30s • 5 intentos = 15m
          </div>
        </div>
      )}

      {/* Footer info */}
      <div className="mt-6 text-center text-xs text-neutral-500 font-medium">
        Gastro Smart POS • Gestión Segura de Restaurantes
      </div>

    </div>
  );
};
