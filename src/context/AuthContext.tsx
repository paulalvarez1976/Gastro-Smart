import React, { createContext, useContext, useState, useEffect } from 'react';
import { Employee, Restaurant, Shift } from '../types';
import { 
  subscribeToRestaurants, 
  subscribeToEmployees, 
  subscribeToActiveShift, 
  openShift, 
  closeShift, 
  updateEmployee 
} from '../services/dataService';
import { seedInitialDataIfEmpty } from '../utils/seed';

interface AuthContextType {
  currentEmployee: Employee | null;
  currentShift: Shift | null;
  currentRestaurant: Restaurant | null;
  allRestaurants: Restaurant[];
  allEmployees: Employee[];
  isLocked: boolean;
  lockRemainingSeconds: number;
  loginWithPin: (pin: string) => Promise<{ success: boolean; message: string; employee?: Employee }>;
  logout: () => void;
  endShiftAndLogout: (reporteLabores?: string) => Promise<void>;
  selectRestaurant: (restaurantId: string) => void;
  resetEmployeePin: (employeeId: string, newPin: string) => Promise<void>;
  updateEmployeeHourlyRate: (employeeId: string, rate: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allRestaurants, setAllRestaurants] = useState<Restaurant[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);

  // Intentos fallidos y bloqueo de 30 segundos
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [lockRemainingSeconds, setLockRemainingSeconds] = useState(0);

  // Inicializar seeder y suscripciones principales
  useEffect(() => {
    seedInitialDataIfEmpty();

    const unsubRestaurants = subscribeToRestaurants((data) => {
      setAllRestaurants(data);
      if (data.length > 0 && !selectedRestaurantId) {
        setSelectedRestaurantId(data[0].id);
      }
    });

    const unsubEmployees = subscribeToEmployees(null, (data) => {
      setAllEmployees(data);
    });

    return () => {
      unsubRestaurants();
      unsubEmployees();
    };
  }, []);

  // Suscribirse a turno activo del empleado logueado
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
          console.warn('Turno excedió 14 horas. Cerrando automáticamente con alerta.');
          await closeShift(shift.id, 'Cierre automático preventivo por exceder 14 horas continuas');
          setCurrentShift(null);
          setCurrentEmployee(null);
          alert('Tu turno anterior excedió las 14 horas y fue cerrado automáticamente por seguridad. Se notificó al Administrador.');
          return;
        }

        setCurrentShift(shift);
      } else {
        setCurrentShift(null);
      }
    });

    return () => unsubShift();
  }, [currentEmployee]);

  // Manejo de temporizador de bloqueo por 3 PINs incorrectos
  useEffect(() => {
    if (!lockUntil) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setLockRemainingSeconds(remaining);
      if (remaining <= 0) {
        setLockUntil(null);
        setFailedAttempts(0);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [lockUntil]);

  // Cierre de sesión por inactividad a los 15 minutos (900,000 ms)
  useEffect(() => {
    if (!currentEmployee) return;

    let inactivityTimeout: NodeJS.Timeout;

    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimeout);
      // 15 minutos = 15 * 60 * 1000 ms
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

  const loginWithPin = async (pin: string): Promise<{ success: boolean; message: string; employee?: Employee }> => {
    if (lockUntil && Date.now() < lockUntil) {
      return { 
        success: false, 
        message: `Teclado bloqueado por intentos fallidos. Espera ${lockRemainingSeconds} segundos.` 
      };
    }

    const employee = allEmployees.find(e => e.pin === pin && e.activo);
    if (!employee) {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      if (newAttempts >= 3) {
        const lockTime = Date.now() + 30000;
        setLockUntil(lockTime);
        setLockRemainingSeconds(30);
        return { 
          success: false, 
          message: 'PIN incorrecto 3 veces. Teclado bloqueado por 30 segundos.' 
        };
      }
      return { 
        success: false, 
        message: `PIN incorrecto. Te quedan ${3 - newAttempts} intento(s).` 
      };
    }

    // Resetear fallos
    setFailedAttempts(0);
    setLockUntil(null);
    setCurrentEmployee(employee);

    const restaurant = allRestaurants.find(r => r.id === employee.restaurantId) || allRestaurants[0];
    if (restaurant) {
      setSelectedRestaurantId(restaurant.id);
    }

    // Abrir turno si no existe uno
    // Nota: El listener subscribeToActiveShift se activará, pero si no hay, creamos uno de inmediato
    return {
      success: true,
      message: `Bienvenido, ${employee.nombre}.`,
      employee
    };
  };

  const logout = () => {
    setCurrentEmployee(null);
  };

  const endShiftAndLogout = async (reporteLabores?: string) => {
    if (currentShift) {
      await closeShift(currentShift.id, reporteLabores);
    }
    setCurrentEmployee(null);
    setCurrentShift(null);
  };

  const selectRestaurant = (restaurantId: string) => {
    setSelectedRestaurantId(restaurantId);
  };

  const resetEmployeePin = async (employeeId: string, newPin: string) => {
    await updateEmployee(employeeId, { pin: newPin });
  };

  const updateEmployeeHourlyRate = async (employeeId: string, rate: number) => {
    await updateEmployee(employeeId, { tarifaHora: rate });
  };

  const currentRestaurant = currentEmployee?.puesto === 'admin'
    ? (allRestaurants.find(r => r.id === selectedRestaurantId) || allRestaurants[0] || null)
    : (allRestaurants.find(r => r.id === currentEmployee?.restaurantId) || allRestaurants.find(r => r.id === selectedRestaurantId) || allRestaurants[0] || null);

  return (
    <AuthContext.Provider
      value={{
        currentEmployee,
        currentShift,
        currentRestaurant,
        allRestaurants,
        allEmployees,
        isLocked: !!(lockUntil && Date.now() < lockUntil),
        lockRemainingSeconds,
        loginWithPin,
        logout,
        endShiftAndLogout,
        selectRestaurant,
        resetEmployeePin,
        updateEmployeeHourlyRate
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
