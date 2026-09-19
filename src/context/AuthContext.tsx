import { UNIQUE_BUSINESS_ID, getAdminEmailsWhitelist } from '../config/business';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  signInWithPopup,
  User as FirebaseUser
} from 'firebase/auth';
import { auth } from '../firebase';
import { 
  Employee, 
  Restaurant, 
  Shift, 
  Business, 
  UserAccount, 
  SecurityAlert 
} from '../types';
import { 
  subscribeToRestaurants, 
  subscribeToEmployees, 
  subscribeToActiveShift, 
  subscribeToBusiness,
  subscribeToAllBusinesses,
  getBusiness,
  getOrCreateSingleBusiness,
  openShift, 
  closeShift, 
  updateEmployee,
  checkAndHealAdmin,
  getUserAccount,
  createUserAccount,
  updateUserAccount,
  createBusiness,
  bootstrapNewBusinessDefaults,
  registerLoginAttempt,
  createSecurityAlert,
  subscribeToSecurityAlerts,
  markSecurityAlertAsRead
} from '../services/dataService';
import { seedInitialDataIfEmpty } from '../utils/seed';

interface AuthContextType {
  // Estado de usuario y negocio
  firebaseUser: FirebaseUser | null;
  currentUserAccount: UserAccount | null;
  currentBusiness: Business | null;
  allBusinesses: Business[];
  currentEmployee: Employee | null;
  currentShift: Shift | null;
  currentRestaurant: Restaurant | null;
  allRestaurants: Restaurant[];
  allEmployees: Employee[];
  securityAlerts: SecurityAlert[];
  selectedRestaurantId: string | null;
  
  // Estados de carga y avisos
  isLoadingAuth: boolean;
  selfHealingToast: string | null;
  dismissSelfHealingToast: () => void;

  // Anti-fuerza bruta PIN
  isLocked: boolean;
  lockRemainingSeconds: number;
  lockSeverity: 'cooldown_30s' | 'blocked_15m' | null;

  // Autenticación de Admin / Owner
  loginAdminWithEmail: (email: string, pass: string) => Promise<{ success: boolean; message: string; notRegisteredInApp?: boolean }>;
  loginAdminWithGoogle: () => Promise<{ success: boolean; message: string }>;
  loginDemoMode: () => Promise<{ success: boolean; message: string }>;
  registerOwnerAndBusiness: (data: { businessName: string; rif_o_ruc: string; ownerName: string; email: string; pass: string }) => Promise<{ success: boolean; message: string; isExistingLogin?: boolean; isEmailInUse?: boolean }>;
  logoutAdmin: () => Promise<void>;
  resetAdminPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  changeAdminPassword: (currentPass: string, newPass: string) => Promise<{ success: boolean; message: string }>;

  // Autenticación operativa (PIN)
  loginWithPin: (pin: string, branchId?: string) => Promise<{ success: boolean; message: string; employee?: Employee }>;
  logoutEmployee: () => void;
  endShiftAndLogout: (
    reporteLabores?: string,
    sessionMetrics?: {
      pedidosTomados?: number;
      ventasGeneradas?: number;
      pedidosCobrados?: number;
      montoCobrado?: number;
    }
  ) => Promise<void>;
  
  // Utilidades de sucursales y empleados
  selectRestaurant: (restaurantId: string) => void;
  resetEmployeePin: (employeeId: string, newPin: string) => Promise<void>;
  updateEmployeeHourlyRate: (employeeId: string, rate: number) => Promise<void>;
  markAlertRead: (alertId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentUserAccount, setCurrentUserAccount] = useState<UserAccount | null>(null);
  const [currentBusiness, setCurrentBusiness] = useState<Business | null>(null);
  const [allBusinesses, setAllBusinesses] = useState<Business[]>([]);
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [allRestaurants, setAllRestaurants] = useState<Restaurant[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(() => {
    return localStorage.getItem('gastro_terminal_restaurant_id') || null;
  });

  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [selfHealingToast, setSelfHealingToast] = useState<string | null>(null);

  // Anti-fuerza bruta PIN de empleados
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [lockRemainingSeconds, setLockRemainingSeconds] = useState(0);
  const [lockSeverity, setLockSeverity] = useState<'cooldown_30s' | 'blocked_15m' | null>(null);

  // 1. Inicializar seeder y escuchar Auth de Firebase
  useEffect(() => {
    seedInitialDataIfEmpty();

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const userAccount = await getUserAccount(user.uid);
          if (userAccount) {
            await updateUserAccount(user.uid, { ultimoAcceso: new Date().toISOString() });
            setCurrentUserAccount(userAccount);
          } else {
            // Usuario en Auth pero sin registro en Gastro Smart (pertenece a otra app en proyecto compartido)
            setCurrentUserAccount(null);
          }
        } catch (err) {
          console.error('Error fetching user account on auth state change:', err);
          setCurrentUserAccount(null);
        }
      } else {
        setCurrentUserAccount(null);
      }
      setIsLoadingAuth(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Suscribirse a todos los negocios registrados en Gastro Smart
  useEffect(() => {
    const unsubAllBiz = subscribeToAllBusinesses((data) => {
      setAllBusinesses(data);
    });
    return () => unsubAllBiz();
  }, []);

  // 3. Suscribirse al negocio del usuario logueado o default
  const loggedInBusinessId = currentUserAccount?.businessId || currentEmployee?.businessId || null;

  useEffect(() => {
    if (!loggedInBusinessId) return;
    const unsubBiz = subscribeToBusiness(loggedInBusinessId, (biz) => {
      setCurrentBusiness(biz);
    });
    const unsubAlerts = subscribeToSecurityAlerts(loggedInBusinessId, (alerts) => {
      setSecurityAlerts(alerts);
    });
    return () => {
      unsubBiz();
      unsubAlerts();
    };
  }, [loggedInBusinessId]);

  // 4. Suscribirse a restaurantes y empleados:
  // Si hay sesión activa (Admin/Dueño o Empleado): suscripción acotada a su businessId.
  // Si NO hay sesión (Pantalla de login / Terminal PIN): suscribir a todos los restaurantes y empleados de Gastro Smart.
  useEffect(() => {
    if (loggedInBusinessId) {
      const unsubRestaurants = subscribeToRestaurants(loggedInBusinessId, (data) => {
        setAllRestaurants(data);
        if (data.length > 0) {
          if (!selectedRestaurantId || !data.some(r => r.id === selectedRestaurantId)) {
            const firstId = data[0].id;
            setSelectedRestaurantId(firstId);
            localStorage.setItem('gastro_terminal_restaurant_id', firstId);
          }
        } else {
          setSelectedRestaurantId(null);
        }
      });

      const unsubEmployees = subscribeToEmployees(loggedInBusinessId, null, (data) => {
        setAllEmployees(data);
      });

      return () => {
        unsubRestaurants();
        unsubEmployees();
      };
    } else {
      const unsubRestaurants = subscribeToRestaurants(null, (data) => {
        setAllRestaurants(data);
        if (data.length > 0) {
          const stored = localStorage.getItem('gastro_terminal_restaurant_id');
          if (stored && data.some(r => r.id === stored)) {
            setSelectedRestaurantId(stored);
          } else if (!selectedRestaurantId || !data.some(r => r.id === selectedRestaurantId)) {
            const firstId = data[0].id;
            setSelectedRestaurantId(firstId);
            localStorage.setItem('gastro_terminal_restaurant_id', firstId);
          }
        }
      });

      const unsubEmployees = subscribeToEmployees(null, null, (data) => {
        setAllEmployees(data);
      });

      return () => {
        unsubRestaurants();
        unsubEmployees();
      };
    }
  }, [loggedInBusinessId]);

  // 4. Suscribirse al turno activo del empleado operativo
  useEffect(() => {
    if (!currentEmployee) {
      setCurrentShift(null);
      return;
    }

    const unsubShift = subscribeToActiveShift(currentEmployee.id, async (shift) => {
      if (shift) {
        // Verificar si lleva más de 14 horas abierto
        const startTime = new Date(shift.horaInicio).getTime();
        const now = Date.now();
        const diffHours = (now - startTime) / (1000 * 60 * 60);

        if (diffHours >= 14 && shift.estado === 'abierto') {
          console.warn('Turno excedió 14 horas. Cerrando automáticamente por seguridad.');
          await closeShift(shift.id, 'Cierre automático preventivo por exceder 14 horas continuas');
          setCurrentShift(null);
          setCurrentEmployee(null);
          alert('Tu turno anterior excedió las 14 horas y fue cerrado automáticamente por seguridad.');
          return;
        }

        setCurrentShift(shift);
      } else {
        setCurrentShift(null);
      }
    });

    return () => unsubShift();
  }, [currentEmployee]);

  // 5. Manejo del contador de bloqueo por PIN incorrecto
  useEffect(() => {
    if (!lockUntil) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setLockRemainingSeconds(remaining);
      if (remaining <= 0) {
        setLockUntil(null);
        setLockSeverity(null);
        setFailedAttempts(0);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [lockUntil]);

  // 6. Cierre de sesión por inactividad de empleados operativos (15 min)
  useEffect(() => {
    if (!currentEmployee) return;

    let inactivityTimeout: NodeJS.Timeout;

    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimeout);
      // 15 minutos
      inactivityTimeout = setTimeout(() => {
        alert('Sesión cerrada por inactividad (15 minutos sin interacción). Introduce tu PIN para reanudar.');
        setCurrentEmployee(null);
      }, 15 * 60 * 1000);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach(ev => window.addEventListener(ev, resetInactivityTimer));
    resetInactivityTimer();

    return () => {
      clearTimeout(inactivityTimeout);
      events.forEach(ev => window.removeEventListener(ev, resetInactivityTimer));
    };
  }, [currentEmployee]);

  // ======================= MÉTODOS AUTH ADMIN / OWNER =======================

  const loginAdminWithEmail = async (email: string, pass: string): Promise<{ success: boolean; message: string; notRegisteredInApp?: boolean }> => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), pass);
      const userAccount = await getUserAccount(userCredential.user.uid);

      if (!userAccount) {
        // El usuario está en Firebase Auth (pertenece a otra app), pero no tiene documento con appId "gastro_smart"
        await signOut(auth);
        setCurrentUserAccount(null);
        setFirebaseUser(null);
        return { 
          success: false, 
          message: 'Este correo no está registrado en Gastro Smart',
          notRegisteredInApp: true 
        };
      }

      await updateUserAccount(userAccount.uid, { ultimoAcceso: new Date().toISOString() });
      setCurrentUserAccount(userAccount);
      return { success: true, message: `Bienvenido, ${userAccount.nombre}.` };
    } catch (err: any) {
      console.error('Error logging in admin:', err);
      let msg = 'Credenciales incorrectas. Verifica tu email y contraseña.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Email o contraseña inválidos.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Demasiados intentos fallidos. Acceso temporalmente bloqueado por Firebase.';
      } else if (err.code === 'auth/network-request-failed' || err.message?.includes('network-request-failed')) {
        msg = 'Error de conexión con Firebase Auth (auth/network-request-failed). Utilice el acceso DEMO offline.';
      }
      return { success: false, message: msg };
    }
  };

  const loginDemoMode = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const demoAccount: UserAccount = {
        uid: 'demo_owner_uid',
        email: 'demo@gastrosmart.com',
        nombre: 'Dueño Administrador (Demo)',
        rol: 'owner',
        businessId: 'biz_demo123',
        restaurantId: null,
        appId: 'gastro_smart',
        creadoEn: new Date().toISOString(),
        ultimoAcceso: new Date().toISOString()
      };
      setCurrentUserAccount(demoAccount);
      return { success: true, message: '¡Acceso Demo Iniciado Exitosamente!' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Error en acceso demo' };
    }
  };

  const loginAdminWithGoogle = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const uid = user.uid;
      const email = user.email || '';
      const name = user.displayName || 'Dueño';

      // Verificar whitelist
      const whitelist = getAdminEmailsWhitelist();
      if (whitelist.length > 0 && !whitelist.includes(email.toLowerCase())) {
        await signOut(auth);
        return { success: false, message: 'Este email no está autorizado para crear una cuenta de administrador. Contactá al dueño del negocio.' };
      }

      // Verificar si ya existe en Gastro Smart
      const existingAccount = await getUserAccount(uid);
      if (existingAccount) {
        await updateUserAccount(uid, { ultimoAcceso: new Date().toISOString() });
        setCurrentUserAccount(existingAccount);
        return { success: true, message: `¡Bienvenido, ${existingAccount.nombre}!` };
      }

      // Usar negocio único
      await getOrCreateSingleBusiness(UNIQUE_BUSINESS_ID);
      const businessId = UNIQUE_BUSINESS_ID;

      const newUserAccount: UserAccount = {
        uid,
        email,
        nombre: name,
        rol: 'owner',
        businessId,
        restaurantId: null,
        appId: 'gastro_smart',
        creadoEn: new Date().toISOString(),
        ultimoAcceso: new Date().toISOString()
      };
      await createUserAccount(newUserAccount);
      setCurrentUserAccount(newUserAccount);

      return { success: true, message: '¡Cuenta de administrador vinculada exitosamente!' };
    } catch (err: any) {
      console.error('Google Auth error:', err);
      let msg = err.message || 'Error al autenticar con Google.';
      if (err.code === 'auth/popup-closed-by-user') {
        msg = 'Ventana de Google cerrada antes de completar el inicio de sesión.';
      } else if (err.code === 'auth/popup-blocked') {
        msg = 'Ventana emergente bloqueada por el navegador. Permite popups para continuar.';
      } else if (err.code === 'auth/network-request-failed') {
        msg = 'Error de conexión con Firebase. Revisa tu conexión a internet.';
      }
      return { success: false, message: msg };
    }
  };

  const registerOwnerAndBusiness = async (data: {
    ownerName: string;
    email: string;
    pass: string;
  }): Promise<{ success: boolean; message: string; isExistingLogin?: boolean; isEmailInUse?: boolean }> => {
    const trimmedEmail = data.email.trim();

    // Validar whitelist
    const whitelist = getAdminEmailsWhitelist();
    if (whitelist.length > 0 && !whitelist.includes(trimmedEmail.toLowerCase())) {
      return { success: false, message: 'Este email no está autorizado para crear una cuenta de administrador. Contactá al dueño del negocio.' };
    }

    try {
      // 1. Intento crear el usuario con createUserWithEmailAndPassword
      const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, data.pass);
      const uid = userCredential.user.uid;

      await getOrCreateSingleBusiness(UNIQUE_BUSINESS_ID);
      const businessId = UNIQUE_BUSINESS_ID;

      // 2. Crear registro de usuario en colección users con appId: "gastro_smart" y rol 'owner'
      const newUserAccount: UserAccount = {
        uid,
        email: trimmedEmail,
        nombre: data.ownerName.trim(),
        rol: 'owner',
        businessId,
        restaurantId: null,
        appId: 'gastro_smart',
        creadoEn: new Date().toISOString(),
        ultimoAcceso: new Date().toISOString()
      };
      await createUserAccount(newUserAccount);
      setCurrentUserAccount(newUserAccount);

      return { success: true, message: '¡Cuenta de administrador creada exitosamente!' };
    } catch (err: any) {
      console.error('Registration attempt caught error:', err);

      // Si Firebase responde auth/email-already-in-use: intentar login transparente
      if (err.code === 'auth/email-already-in-use') {
        try {
          const loginCred = await signInWithEmailAndPassword(auth, trimmedEmail, data.pass);
          const uid = loginCred.user.uid;

          // Verificar en Firestore si este uid ya tiene documento con appId "gastro_smart"
          const existingAccount = await getUserAccount(uid);

          if (!existingAccount) {
            await getOrCreateSingleBusiness(UNIQUE_BUSINESS_ID);
            const businessId = UNIQUE_BUSINESS_ID;

            const newUserAccount: UserAccount = {
              uid,
              email: trimmedEmail,
              nombre: data.ownerName.trim() || loginCred.user.displayName || 'Dueño',
              rol: 'owner',
              businessId,
              restaurantId: null,
              appId: 'gastro_smart',
              creadoEn: new Date().toISOString(),
              ultimoAcceso: new Date().toISOString()
            };
            await createUserAccount(newUserAccount);
            setCurrentUserAccount(newUserAccount);

            return { success: true, message: '¡Bienvenido a Gastro Smart!' };
          } else {
            // SÍ existe con rol owner / admin en Gastro Smart
            await updateUserAccount(uid, { ultimoAcceso: new Date().toISOString() });
            setCurrentUserAccount(existingAccount);
            return { 
              success: true, 
              isExistingLogin: true,
              message: 'Ya tienes una cuenta en Gastro Smart, iniciando sesión...' 
            };
          }
        } catch (loginErr: any) {
          return {
            success: false,
            isEmailInUse: true,
            message: 'Este correo ya está registrado en Firebase. Si ya tienes cuenta, ingresa tu contraseña en Iniciar Sesión o usa Recuperar Contraseña.'
          };
        }
      }

      let msg = 'Error al registrar la cuenta.';
      if (err.code === 'auth/weak-password') {
        msg = 'La contraseña debe tener al menos 6 caracteres.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'El formato del correo electrónico no es válido.';
      } else if (err.code === 'auth/network-request-failed') {
        msg = 'Error de conexión con Firebase. Verifica tu conexión a internet.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Demasiados intentos. Espera unos momentos antes de reintentar.';
      } else if (err.message) {
        msg = err.message;
      }
      return { success: false, message: msg };
    }
  };

  const logoutAdmin = async () => {
    await signOut(auth);
    setCurrentUserAccount(null);
    setFirebaseUser(null);
  };

  const resetAdminPassword = async (email: string): Promise<{ success: boolean; message: string }> => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return { success: true, message: `Hemos enviado un enlace de recuperación a ${email}. Revisa tu bandeja.` };
    } catch (err: any) {
      return { success: false, message: err.message || 'No se pudo enviar el correo de recuperación.' };
    }
  };

  const changeAdminPassword = async (currentPass: string, newPass: string): Promise<{ success: boolean; message: string }> => {
    if (!auth.currentUser || !auth.currentUser.email) {
      return { success: false, message: 'No hay sesión de usuario activa.' };
    }
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPass);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPass);
      return { success: true, message: '¡Contraseña actualizada con éxito!' };
    } catch (err: any) {
      return { success: false, message: 'Contraseña actual incorrecta o error de seguridad: ' + err.message };
    }
  };

  // ======================= MÉTODOS AUTH OPERATIVA (PIN) =======================

  const loginWithPin = async (pin: string, branchId?: string): Promise<{ success: boolean; message: string; employee?: Employee }> => {
    // 1. Comprobar bloqueo activo
    if (lockUntil && Date.now() < lockUntil) {
      const mins = Math.ceil(lockRemainingSeconds / 60);
      const timeStr = lockSeverity === 'blocked_15m' ? `${mins} minuto(s)` : `${lockRemainingSeconds} segundo(s)`;
      return { 
        success: false, 
        message: `Teclado bloqueado por intentos fallidos. Espera ${timeStr}.` 
      };
    }

    const effectiveBranchId = branchId || selectedRestaurantId;

    // 2. Buscar primero en la sucursal seleccionada si existe
    let employee: Employee | undefined;
    if (effectiveBranchId) {
      employee = allEmployees.find(e => e.activo && e.pin === pin && e.restaurantId === effectiveBranchId);
    }

    // 3. Si no se encontró en la sucursal seleccionada, buscar en todo el catálogo de empleados activos
    if (!employee) {
      employee = allEmployees.find(e => e.activo && e.pin === pin);
    }

    const targetRestaurant = employee 
      ? allRestaurants.find(r => r.id === employee.restaurantId) 
      : allRestaurants.find(r => r.id === effectiveBranchId);

    const targetBizId = employee?.businessId || targetRestaurant?.businessId || UNIQUE_BUSINESS_ID;

    // Auditoría en Firestore
    await registerLoginAttempt({
      businessId: targetBizId,
      restaurantId: employee ? employee.restaurantId : (effectiveBranchId || 'general'),
      pinIntentado: '****',
      fecha: new Date().toISOString(),
      resultado: employee ? 'exitoso' : 'fallido',
      motivo: employee 
        ? `Acceso concedido a ${employee.nombre} (${employee.puesto}) en ${targetRestaurant?.nombre || 'Restaurante'}` 
        : `PIN no encontrado en ${targetRestaurant?.nombre || 'Sucursal'}`
    });

    if (!employee) {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);

      if (newAttempts >= 5) {
        // Bloqueo estricto de 15 minutos (900s) + Notificación de seguridad
        const lockTime = Date.now() + 15 * 60 * 1000;
        setLockUntil(lockTime);
        setLockRemainingSeconds(900);
        setLockSeverity('blocked_15m');

        const restName = targetRestaurant?.nombre || 'Sucursal';
        await createSecurityAlert({
          businessId: targetBizId,
          restaurantId: effectiveBranchId || undefined,
          restaurantNombre: restName,
          tipo: 'fuerza_bruta_pin',
          mensaje: `Se detectaron 5 intentos fallidos consecutivos de PIN en ${restName}. El teclado fue bloqueado por 15 minutos.`,
          fecha: new Date().toISOString(),
          leido: false
        });

        return { 
          success: false, 
          message: '5 intentos fallidos detectados. Teclado bloqueado por 15 minutos y alerta de seguridad emitida al administrador.' 
        };
      }

      if (newAttempts >= 3) {
        // Cooldown de 30 segundos
        const lockTime = Date.now() + 30000;
        setLockUntil(lockTime);
        setLockRemainingSeconds(30);
        setLockSeverity('cooldown_30s');
        return { 
          success: false, 
          message: 'PIN incorrecto 3 veces. Teclado en enfriamiento por 30 segundos.' 
        };
      }

      const restMsg = targetRestaurant ? ` para ${targetRestaurant.nombre}` : '';
      return { 
        success: false, 
        message: `PIN no reconocido${restMsg}. Te quedan ${3 - newAttempts} intento(s) antes del bloqueo.` 
      };
    }

    // Éxito: sincronizar empleado, restaurante y negocio
    setFailedAttempts(0);
    setLockUntil(null);
    setLockSeverity(null);
    setCurrentEmployee(employee);

    if (employee.restaurantId) {
      setSelectedRestaurantId(employee.restaurantId);
      localStorage.setItem('gastro_terminal_restaurant_id', employee.restaurantId);
    }

    if (employee.businessId) {
      try {
        const biz = await getBusiness(employee.businessId);
        if (biz) {
          setCurrentBusiness(biz);
        }
      } catch (e) {
        console.warn('Error loading employee business:', e);
      }
    }

    // Abrir turno automáticamente si el empleado no tiene uno abierto
    const restToUse = allRestaurants.find(r => r.id === employee.restaurantId) || targetRestaurant;
    if (restToUse) {
      try {
        await openShift(employee, restToUse.nombre, employee.businessId || targetBizId);
      } catch (err) {
        console.warn('Auto open shift error:', err);
      }
    }

    return {
      success: true,
      message: `¡Bienvenido, ${employee.nombre}!`,
      employee
    };
  };

  const logoutEmployee = () => {
    setCurrentEmployee(null);
  };

  const endShiftAndLogout = async (
    reporteLabores?: string,
    sessionMetrics?: {
      pedidosTomados?: number;
      ventasGeneradas?: number;
      pedidosCobrados?: number;
      montoCobrado?: number;
    }
  ) => {
    let res = null;
    if (currentShift) {
      res = await closeShift(currentShift.id, reporteLabores, sessionMetrics);
    }
    setCurrentEmployee(null);
    setCurrentShift(null);
    return res;
  };

  const selectRestaurant = (restaurantId: string) => {
    setSelectedRestaurantId(restaurantId);
    localStorage.setItem('gastro_terminal_restaurant_id', restaurantId);
  };

  const resetEmployeePin = async (employeeId: string, newPin: string) => {
    await updateEmployee(employeeId, { pin: newPin });
  };

  const updateEmployeeHourlyRate = async (employeeId: string, rate: number) => {
    await updateEmployee(employeeId, { tarifaHora: rate });
  };

  const markAlertRead = async (alertId: string) => {
    await markSecurityAlertAsRead(alertId);
  };

  const dismissSelfHealingToast = () => {
    setSelfHealingToast(null);
  };

  // Restaurante activo calculado
  const currentRestaurant = currentUserAccount
    ? (allRestaurants.find(r => r.id === selectedRestaurantId) || allRestaurants[0] || null)
    : (allRestaurants.find(r => r.id === currentEmployee?.restaurantId) || allRestaurants.find(r => r.id === selectedRestaurantId) || allRestaurants[0] || null);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        currentUserAccount,
        currentBusiness,
        allBusinesses,
        currentEmployee,
        currentShift,
        currentRestaurant,
        allRestaurants,
        allEmployees,
        securityAlerts,
        selectedRestaurantId,
        isLoadingAuth,
        selfHealingToast,
        dismissSelfHealingToast,
        isLocked: !!(lockUntil && Date.now() < lockUntil),
        lockRemainingSeconds,
        lockSeverity,
        loginAdminWithEmail,
        loginAdminWithGoogle,
        loginDemoMode,
        registerOwnerAndBusiness,
        logoutAdmin,
        resetAdminPassword,
        changeAdminPassword,
        loginWithPin,
        logoutEmployee,
        endShiftAndLogout,
        selectRestaurant,
        resetEmployeePin,
        updateEmployeeHourlyRate,
        markAlertRead
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
