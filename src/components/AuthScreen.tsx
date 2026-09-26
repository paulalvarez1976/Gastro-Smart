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
    loginSuperAdminDemoMode,
    registerOwnerAndBusiness, 
    resetAdminPassword,
    loginWithPin, 
    isLocked, 
    lockRemainingSeconds, 
    lockSeverity,
    allRestaurants,
    allEmployees,
    selfHealingToast,
    dismissSelfHealingToast
  } = useAuth();

  // Tab de modo: 'admin' | 'creator' | 'employee'
  const [authMode, setAuthMode] = useState<'admin' | 'creator' | 'employee'>('admin');

  // Sub-vista de admin: 'login' | 'register' | 'forgot'
  const [adminView, setAdminView] = useState<'login' | 'register' | 'forgot'>('login');

  // Form states - Creator Login
  const [creatorEmail, setCreatorEmail] = useState('');
  const [creatorPassword, setCreatorPassword] = useState('');
  const [showCreatorPassword, setShowCreatorPassword] = useState(false);
  const [creatorLoading, setCreatorLoading] = useState(false);
  const [creatorFeedback, setCreatorFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states - Admin Login
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [adminFeedback, setAdminFeedback] = useState<{ type: 'success' | 'error'; text: string; notRegisteredInApp?: boolean } | null>(null);

  // Form states - Register Business & Owner
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regFeedback, setRegFeedback] = useState<{ type: 'success' | 'error'; text: string; isEmailInUse?: boolean } | null>(null);

  // Form states - Forgot Password
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotFeedback, setForgotFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states - Employee PIN (Código de 8 dígitos: 4 de sede + 4 de PIN personal)
  const [pin, setPin] = useState<string>('');
  const [pinErrorMsg, setPinErrorMsg] = useState<string>('');
  const [pinLoading, setPinLoading] = useState(false);

  // Reproducir sonido cuando aparece toast de autorrecuperación o notificación
  useEffect(() => {
    if (selfHealingToast) {
      sounds.playNotification();
    }
  }, [selfHealingToast]);

  // ================= ADMIN HANDLERS =================
  const handleGoogleAuth = async (isCreator = false) => {
    setGoogleLoading(true);
    setAdminFeedback(null);
    setRegFeedback(null);
    setCreatorFeedback(null);
    try {
      sounds.playKeypadClick();
      const res = await loginAdminWithGoogle(isCreator);
      if (res.success) {
        sounds.playCashRegister();
      } else {
        sounds.playAlertWarning();
        if (isCreator) {
          setCreatorFeedback({ type: 'error', text: res.message });
        } else if (adminView === 'register') {
          setRegFeedback({ type: 'error', text: res.message });
        } else {
          setAdminFeedback({ type: 'error', text: res.message });
        }
      }
    } catch (err: any) {
      const msg = err.message || 'Error al autenticar con Google';
      if (isCreator) {
        setCreatorFeedback({ type: 'error', text: msg });
      } else if (adminView === 'register') {
        setRegFeedback({ type: 'error', text: msg });
      } else {
        setAdminFeedback({ type: 'error', text: msg });
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleCreatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creatorEmail.trim() || !creatorPassword) {
      setCreatorFeedback({ type: 'error', text: 'Por favor ingresa tu correo y contraseña de Creador.' });
      return;
    }

    setCreatorLoading(true);
    setCreatorFeedback(null);
    try {
      const res = await loginAdminWithEmail(creatorEmail, creatorPassword);
      if (res.success) {
        sounds.playCashRegister();
      } else {
        sounds.playAlertWarning();
        setCreatorFeedback({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setCreatorFeedback({ type: 'error', text: err.message || 'Error al iniciar sesión como Creador' });
    } finally {
      setCreatorLoading(false);
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
    if (!regOwnerName.trim() || !regEmail.trim() || !regPassword) {
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

  // ================= EMPLOYEE PIN HANDLERS (8 DÍGITOS: 4 SEDE + 4 PIN) =================
  const handleDigit = (digit: string) => {
    if (isLocked || pinLoading || pin.length >= 8) return;
    sounds.playKeypadClick();
    const newPin = pin + digit;
    setPin(newPin);
    setPinErrorMsg('');

    if (newPin.length === 8) {
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
    if (inputPin.length !== 8) return;
    setPinLoading(true);
    setPinErrorMsg('');
    try {
      const codigoSede = inputPin.slice(0, 4);
      const pinEmpleado = inputPin.slice(4, 8);

      const restaurantEncontrado = allRestaurants.find(
        r => (r.codigoSede || '').trim() === codigoSede
      );

      if (!restaurantEncontrado) {
        // Mantener intacto el sistema anti-fuerza-bruta y mostrar el mismo mensaje genérico de PIN inválido
        const res = await loginWithPin('__INVALID_PIN__', '__INVALID_BRANCH__');
        sounds.playAlertWarning();
        setPinErrorMsg(res.message.replace(/\s+para\s+[^.]+/, ''));
        setPin('');
        return;
      }

      // Verificar si el empleado activo pertenece a esa sucursal específica
      const employeeInBranch = allEmployees.some(
        e => e.activo && e.pin === pinEmpleado && e.restaurantId === restaurantEncontrado.id
      );

      const res = await loginWithPin(
        employeeInBranch ? pinEmpleado : '__INVALID_PIN__',
        restaurantEncontrado.id
      );

      if (res.success && res.employee) {
        sounds.playKeypadClick();
      } else {
        sounds.playAlertWarning();
        // Mantener el mensaje de error genérico sin revelar el nombre de la sede
        setPinErrorMsg(res.message.replace(/\s+para\s+[^.]+/, ''));
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

      {/* Selector de Modo: Dueño Restaurante vs Creador SaaS vs Empleado */}
      <div className="w-full max-w-lg mb-4 bg-white/90 p-1.5 rounded-2xl shadow-sm border border-orange-200/60 backdrop-blur-xs grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => {
            sounds.playKeypadClick();
            setAuthMode('admin');
            setAdminFeedback(null);
          }}
          className={`h-11 rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-1.5 ${
            authMode === 'admin'
              ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
              : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Restaurante</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playKeypadClick();
            setAuthMode('creator');
            setCreatorFeedback(null);
          }}
          className={`h-11 rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-1.5 ${
            authMode === 'creator'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
              : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-purple-200" />
          <span>Creador (SaaS)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playKeypadClick();
            setAuthMode('employee');
            setPinErrorMsg('');
          }}
          className={`h-11 rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-1.5 ${
            authMode === 'employee'
              ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
              : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Personal (PIN)</span>
        </button>
      </div>

      {/* ===================== VISTA CREADOR / SUPERADMIN (SAAS) ===================== */}
      {authMode === 'creator' && (
        <div className="w-full max-w-md bg-neutral-900 text-white rounded-3xl shadow-2xl border border-purple-900/60 p-6 sm:p-8 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-150">
          <div className="text-center mb-5">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-purple-600/20 border border-purple-500/30 text-purple-400 mb-2.5">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-black text-white">Panel Creador (Manejo de Base de Datos)</h2>
            <p className="text-xs text-neutral-400 mt-1">
              Acceso exclusivo para el Creador de la plataforma. Crea restaurantes, gestiona la base de datos y acredita cuentas y claves a los administradores.
            </p>
          </div>

          <div className="p-3 mb-4 rounded-xl bg-purple-950/60 border border-purple-800/60 text-purple-200 text-xs flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
            <span>El Creador administra los inquilinos (Tenants) y asigna claves de acceso.</span>
          </div>

          {creatorFeedback && (
            <div className={`p-3.5 mb-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              creatorFeedback.type === 'success' 
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                : 'bg-red-500/20 text-red-300 border border-red-500/40'
            }`}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{creatorFeedback.text}</span>
            </div>
          )}

          <form onSubmit={handleCreatorLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-purple-400" />
                Correo de Creador
              </label>
              <input
                type="email"
                required
                placeholder="superadmin@gastrosmart.com"
                value={creatorEmail}
                onChange={(e) => setCreatorEmail(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-neutral-800 border border-neutral-700 text-sm text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition placeholder-neutral-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-purple-400" />
                Contraseña Master
              </label>
              <div className="relative">
                <input
                  type={showCreatorPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={creatorPassword}
                  onChange={(e) => setCreatorPassword(e.target.value)}
                  className="w-full h-11 pl-3.5 pr-10 rounded-xl bg-neutral-800 border border-neutral-700 text-sm text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition placeholder-neutral-500"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatorPassword(!showCreatorPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200"
                >
                  {showCreatorPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={creatorLoading}
              className="w-full h-12 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-extrabold text-sm shadow-lg shadow-purple-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {creatorLoading ? 'Autenticando Creador...' : 'Iniciar Sesión Creador'}
            </button>
          </form>

          <div className="mt-4 space-y-3">
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-neutral-800"></div>
              <span className="shrink mx-2 text-[11px] font-bold text-neutral-400 uppercase tracking-wider">O accede con Google</span>
              <div className="flex-grow border-t border-neutral-800"></div>
            </div>

            <button
              type="button"
              disabled={googleLoading}
              onClick={() => handleGoogleAuth(true)}
              className="w-full h-11 rounded-xl bg-white hover:bg-neutral-100 text-neutral-900 font-bold text-xs transition flex items-center justify-center gap-2.5 shadow-md cursor-pointer disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>{googleLoading ? 'Conectando con Google...' : 'Ingresar con Google (Creador)'}</span>
            </button>
          </div>

        </div>
      )}

      {/* ===================== VISTA ADMINISTRADOR / DUEÑO ===================== */}
      {authMode === 'admin' && (
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-orange-100 p-6 sm:p-8 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-150">
          
          {/* Sub-view: Login */}
          {adminView === 'login' && (
            <div>
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-orange-100 text-orange-600 mb-2">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-black text-neutral-900">Acceso Administrador de Restaurante</h2>
                <p className="text-xs text-neutral-500 mt-0.5">Ingresa con el correo y clave acreditada por el Creador</p>
              </div>

              <div className="p-3 mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Las cuentas y claves son creadas y acreditadas directamente por el Creador.</span>
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
            </div>
          )}

          {/* Sub-view: Register New Business */}
          {adminView === 'register' && (
            <div>
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-orange-100 text-orange-600 mb-2">
                  <Store className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-black text-neutral-900">Registro de Administrador</h2>
                <p className="text-xs text-neutral-500 mt-0.5">Crea tu cuenta de acceso autorizado</p>
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
                  <span>{googleLoading ? 'Autenticando...' : 'Registrar con Google en 1 clic'}</span>
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
                    <User className="w-3.5 h-3.5 text-orange-500" />
                    Nombre y Apellido: *
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
          
          {/* Estado de Entrada: 8 Puntos de Código (4 Código de Sede + 4 PIN Personal) */}
          <div className="w-full flex flex-col items-center mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-neutral-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Ingresá tu código de 8 dígitos
              </span>
            </div>

            {/* 8 PIN Dots agrupados visualmente en dos bloques de 4 con separador */}
            <div className="flex items-center justify-center gap-3 my-3">
              {/* Bloque 1: Primeros 4 dígitos (Código de Sede) */}
              <div className="flex items-center gap-2.5">
                {[0, 1, 2, 3].map((idx) => {
                  const isFilled = pin.length > idx;
                  return (
                    <div
                      key={idx}
                      className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full transition-all duration-200 ${
                        isFilled 
                          ? 'bg-orange-500 scale-125 shadow-md shadow-orange-300' 
                          : 'bg-neutral-200'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Pequeño separador visual entre los dos bloques de 4 */}
              <div className="w-3 h-1 rounded-full bg-neutral-300 mx-1" />

              {/* Bloque 2: Últimos 4 dígitos (PIN Personal) */}
              <div className="flex items-center gap-2.5">
                {[4, 5, 6, 7].map((idx) => {
                  const isFilled = pin.length > idx;
                  return (
                    <div
                      key={idx}
                      className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full transition-all duration-200 ${
                        isFilled 
                          ? 'bg-orange-500 scale-125 shadow-md shadow-orange-300' 
                          : 'bg-neutral-200'
                      }`}
                    />
                  );
                })}
              </div>
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
