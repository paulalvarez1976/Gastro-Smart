import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  setDoc,
  updateDoc, 
  doc, 
  getDoc,
  getDocs, 
  deleteDoc, 
  serverTimestamp,
  orderBy,
  limit,
  writeBatch,
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Business,
  UserAccount,
  Restaurant, 
  Employee, 
  Shift, 
  MenuItem, 
  Client, 
  Table, 
  Order, 
  OrderStatus, 
  OrderRoute,
  OrderItem,
  OrderTimelineEvent,
  CashRegisterClose,
  Expense,
  LoginAttempt,
  SecurityAlert,
  DailyStat,
  Supplier,
  PaymentMethod
} from '../types';
import { getDailyStatDocId, formatDateKey, computeDailyStatFromRawData, getRestaurantLocalDateString } from './financialService';
import { guardarDocumento, limpiarDatosUndefined, actualizarDocumento } from './firestoreUtils';

// ======================= BUSINESSES (MULTI-TENANT) =======================

export function subscribeToBusiness(businessId: string, callback: (data: Business | null) => void) {
  if (!businessId) {
    callback(null);
    return () => {};
  }
  const docRef = doc(db, 'businesses', businessId);
  return onSnapshot(docRef, (snapshot) => {
    if (snapshot.exists()) {
      callback({ id: snapshot.id, ...snapshot.data() } as Business);
    } else {
      callback(null);
    }
  }, (err) => {
    console.warn('Subscription warning (business):', err);
  });
}

export function subscribeToAllBusinesses(callback: (data: Business[]) => void) {
  const q = query(collection(db, 'businesses'), where('appId', '==', 'gastro_smart'));
  return onSnapshot(q, (snapshot) => {
    const list: Business[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as Business));
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (all businesses):', err);
  });
}

export async function getBusiness(businessId: string): Promise<Business | null> {
  const docSnap = await getDoc(doc(db, 'businesses', businessId));
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as Business;
  }
  return null;
}

export async function createBusiness(data: Omit<Business, 'id'>, customId?: string): Promise<string> {
  const payload = {
    ...data,
    appId: 'gastro_smart',
    creadoEn: data.creadoEn || new Date().toISOString()
  };
  if (customId) {
    await setDoc(doc(db, 'businesses', customId), payload, { merge: true });
    return customId;
  }
  const ref = await addDoc(collection(db, 'businesses'), payload);
  return ref.id;
}

export async function updateBusiness(businessId: string, data: Partial<Business>): Promise<void> {
  await updateDoc(doc(db, 'businesses', businessId), data);
}

// ======================= USERS & SELF-HEALING =======================

export async function getUserAccount(uid: string): Promise<UserAccount | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (snap.exists()) {
    const data = snap.data();
    if (data.appId === 'gastro_smart') {
      return data as UserAccount;
    }
  }
  return null;
}

export async function createUserAccount(user: UserAccount): Promise<void> {
  await setDoc(doc(db, 'users', user.uid), {
    ...user,
    appId: 'gastro_smart',
    creadoEn: user.creadoEn || new Date().toISOString(),
    ultimoAcceso: new Date().toISOString()
  }, { merge: true });
}

export async function updateUserAccount(uid: string, data: Partial<UserAccount>): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    ...data,
    appId: 'gastro_smart',
    ultimoAcceso: new Date().toISOString()
  });
}

/**
 * Self-healing: al autenticarse con Firebase Auth, si el usuario tiene documento en "users"
 * con appId "gastro_smart", actualiza su último acceso.
 */
export async function checkAndHealAdmin(firebaseUser: { uid: string; email: string | null; displayName?: string | null }): Promise<{ userAccount: UserAccount | null; healed: boolean }> {
  const existingUser = await getUserAccount(firebaseUser.uid);
  if (existingUser) {
    await updateUserAccount(firebaseUser.uid, { ultimoAcceso: new Date().toISOString() });
    return { userAccount: existingUser, healed: false };
  }

  return { userAccount: null, healed: false };
}

// ======================= LOGIN ATTEMPTS & ANTI-BRUTE FORCE =======================

export async function registerLoginAttempt(attempt: LoginAttempt): Promise<void> {
  try {
    await addDoc(collection(db, 'loginAttempts'), {
      ...attempt,
      appId: 'gastro_smart',
      fecha: attempt.fecha || new Date().toISOString()
    });
  } catch (err) {
    console.warn('No se pudo registrar intento de login en auditoría:', err);
  }
}

export async function createSecurityAlert(alertData: Omit<SecurityAlert, 'id'>): Promise<void> {
  try {
    await addDoc(collection(db, 'securityAlerts'), {
      ...alertData,
      appId: 'gastro_smart',
      fecha: alertData.fecha || new Date().toISOString(),
      leido: false
    });
  } catch (err) {
    console.warn('Error al registrar alerta de seguridad:', err);
  }
}

export function subscribeToSecurityAlerts(businessId: string | null, callback: (alerts: SecurityAlert[]) => void) {
  if (!businessId) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, 'securityAlerts'),
    where('appId', '==', 'gastro_smart'),
    where('businessId', '==', businessId),
    limit(30)
  );
  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as SecurityAlert));
    list.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (securityAlerts):', err);
  });
}

export async function markSecurityAlertAsRead(alertId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'securityAlerts', alertId), { leido: true });
  } catch (err) {
    console.warn('Error marcando alerta como leída:', err);
  }
}

// ======================= RESTAURANTS (SUCURSALES) =======================

export function subscribeToRestaurants(
  arg1?: string | null | ((data: Restaurant[]) => void),
  arg2?: (data: Restaurant[]) => void
) {
  let businessId: string | null = null;
  let callback: (data: Restaurant[]) => void = () => {};

  if (typeof arg1 === 'function') {
    callback = arg1;
  } else {
    businessId = arg1 || null;
    callback = arg2 || (() => {});
  }

  const colRef = collection(db, 'restaurants');
  const q = businessId 
    ? query(colRef, where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))
    : query(colRef, where('appId', '==', 'gastro_smart'));

  return onSnapshot(q, (snapshot) => {
    const list: Restaurant[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as Restaurant));
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (restaurants):', err);
  });
}

export async function createRestaurant(data: Omit<Restaurant, 'id'>, businessId?: string) {
  return addDoc(collection(db, 'restaurants'), {
    ...data,
    businessId: businessId || data.businessId || 'biz_default',
    appId: 'gastro_smart',
    creadoEn: new Date().toISOString()
  });
}

export async function createRestaurantWithTables(
  data: { businessId?: string; nombre: string; direccion: string; telefono: string; numeroMesas: number },
  businessIdParam?: string
): Promise<string> {
  const targetBizId = data.businessId || businessIdParam || 'biz_default';
  const restRef = doc(collection(db, 'restaurants'));
  const restaurantId = restRef.id;

  const batch = writeBatch(db);
  batch.set(restRef, {
    businessId: targetBizId,
    nombre: data.nombre.trim(),
    direccion: data.direccion.trim(),
    telefono: data.telefono.trim(),
    numeroMesas: data.numeroMesas,
    activo: true,
    appId: 'gastro_smart',
    creadoEn: new Date().toISOString()
  });

  // Generar mesas del 1 al N en estado "libre" de forma atómica en el mismo batch
  for (let i = 1; i <= data.numeroMesas; i++) {
    const tableRef = doc(collection(db, 'tables'));
    batch.set(tableRef, {
      businessId: targetBizId,
      restaurantId,
      numero: i,
      estado: 'libre',
      capacidad: i <= 4 ? 2 : (i <= 8 ? 4 : 6),
      comandaActivaId: null,
      appId: 'gastro_smart'
    });
  }
  await batch.commit();

  return restaurantId;
}

export async function updateRestaurant(id: string, data: Partial<Restaurant>) {
  return updateDoc(doc(db, 'restaurants', id), data);
}

export async function updateRestaurantTableCount(
  restaurantId: string, 
  newTableCount: number,
  businessId?: string
): Promise<{ success: boolean; error?: string }> {
  if (newTableCount < 1) {
    return { success: false, error: 'El número mínimo de mesas es 1.' };
  }

  const tablesSnap = await getDocs(query(collection(db, 'tables'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId)));
  const currentTables = tablesSnap.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<Table, 'id'>)
  })).sort((a, b) => a.numero - b.numero);

  const currentCount = currentTables.length;

  if (newTableCount === currentCount) {
    await updateDoc(doc(db, 'restaurants', restaurantId), { numeroMesas: newTableCount });
    return { success: true };
  }

  if (newTableCount > currentCount) {
    const existingNumbers = new Set(currentTables.map(t => t.numero));
    const batch = writeBatch(db);
    let nextNumber = 1;
    let tablesCreated = 0;
    const targetDiff = newTableCount - currentCount;

    while (tablesCreated < targetDiff) {
      if (!existingNumbers.has(nextNumber)) {
        const tableRef = doc(collection(db, 'tables'));
        batch.set(tableRef, {
          businessId: businessId || currentTables[0]?.businessId || 'biz_default',
          restaurantId,
          numero: nextNumber,
          estado: 'libre',
          capacidad: 4,
          comandaActivaId: null,
          appId: 'gastro_smart'
        });
        existingNumbers.add(nextNumber);
        tablesCreated++;
      }
      nextNumber++;
    }

    batch.update(doc(db, 'restaurants', restaurantId), { numeroMesas: newTableCount });
    await batch.commit();
    return { success: true };
  } else {
    const activeOrdersSnap = await getDocs(query(collection(db, 'orders'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId)));
    const openOrders = activeOrdersSnap.docs
      .map(d => d.data() as Order)
      .filter(o => o.estado !== 'cobrado' && o.estado !== 'rechazado');

    const openOrderTableIds = new Set(openOrders.map(o => o.mesaId).filter(Boolean));
    const tablesToRemove = currentTables.filter(t => t.numero > newTableCount);

    for (const table of tablesToRemove) {
      if (table.estado === 'ocupada' || openOrderTableIds.has(table.id)) {
        return {
          success: false,
          error: `No se puede reducir a ${newTableCount} mesas. La Mesa #${table.numero} se encuentra actualmente ocupada o con comanda abierta.`
        };
      }
    }

    const batch = writeBatch(db);
    for (const table of tablesToRemove) {
      batch.delete(doc(db, 'tables', table.id));
    }
    batch.update(doc(db, 'restaurants', restaurantId), { numeroMesas: newTableCount });
    await batch.commit();
    return { success: true };
  }
}

export async function renumberTables(restaurantId: string): Promise<void> {
  const tablesSnap = await getDocs(query(collection(db, 'tables'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId)));
  const sorted = tablesSnap.docs
    .map(d => ({ id: d.id, ...(d.data() as Omit<Table, 'id'>) }))
    .sort((a, b) => a.numero - b.numero);

  const batch = writeBatch(db);
  sorted.forEach((table, index) => {
    const newNumber = index + 1;
    if (table.numero !== newNumber) {
      batch.update(doc(db, 'tables', table.id), { numero: newNumber });
    }
  });
  await batch.commit();
  await updateDoc(doc(db, 'restaurants', restaurantId), { numeroMesas: sorted.length });
}

// ======================= EMPLOYEES =======================

export function subscribeToEmployees(
  arg1?: string | null | ((data: Employee[]) => void),
  arg2?: string | null | ((data: Employee[]) => void),
  arg3?: (data: Employee[]) => void
) {
  let businessId: string | null = null;
  let restaurantId: string | null = null;
  let callback: (data: Employee[]) => void = () => {};

  if (typeof arg1 === 'function') {
    callback = arg1;
  } else if (typeof arg2 === 'function') {
    restaurantId = arg1 || null;
    callback = arg2;
  } else {
    businessId = arg1 || null;
    restaurantId = arg2 || null;
    callback = arg3 || (() => {});
  }

  const colRef = collection(db, 'employees');
  const q = businessId
    ? query(colRef, where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))
    : query(colRef, where('appId', '==', 'gastro_smart'));

  return onSnapshot(q, (snapshot) => {
    let list: Employee[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as Employee));
    if (restaurantId) {
      list = list.filter(e => e.restaurantId === restaurantId);
    }
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (employees):', err);
  });
}

export async function createEmployee(data: Omit<Employee, 'id'>) {
  return addDoc(collection(db, 'employees'), {
    ...data,
    appId: 'gastro_smart',
    creadoEn: new Date().toISOString()
  });
}

export async function updateEmployee(id: string, data: Partial<Employee>) {
  return updateDoc(doc(db, 'employees', id), data);
}

export async function deleteEmployee(id: string) {
  return deleteDoc(doc(db, 'employees', id));
}

// ======================= SHIFTS (TURNOS) =======================

export function subscribeToActiveShift(employeeId: string, callback: (shift: Shift | null) => void) {
  const q = query(
    collection(db, 'shifts'),
    where('appId', '==', 'gastro_smart'),
    where('employeeId', '==', employeeId),
    where('estado', '==', 'abierto'),
    limit(1)
  );
  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      callback(null);
    } else {
      const d = snapshot.docs[0];
      callback({ id: d.id, ...d.data() } as Shift);
    }
  }, (err) => {
    console.warn('Subscription warning (activeShift):', err);
  });
}

export function subscribeToShifts(
  arg1?: string | null | ((shifts: Shift[]) => void),
  arg2?: string | null | ((shifts: Shift[]) => void),
  arg3?: (shifts: Shift[]) => void
) {
  let businessId: string | null = null;
  let restaurantId: string | null = null;
  let callback: (shifts: Shift[]) => void = () => {};

  if (typeof arg1 === 'function') {
    callback = arg1;
  } else if (typeof arg2 === 'function') {
    restaurantId = arg1 || null;
    callback = arg2;
  } else {
    businessId = arg1 || null;
    restaurantId = arg2 || null;
    callback = arg3 || (() => {});
  }

  const colRef = collection(db, 'shifts');
  const q = businessId
    ? query(colRef, where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId), limit(80))
    : query(colRef, where('appId', '==', 'gastro_smart'), limit(80));

  return onSnapshot(q, (snapshot) => {
    let list: Shift[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as Shift));
    if (restaurantId) {
      list = list.filter(s => s.restaurantId === restaurantId);
    }
    list.sort((a, b) => new Date(b.horaInicio).getTime() - new Date(a.horaInicio).getTime());
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (shifts):', err);
  });
}

export async function openShift(employee: Employee, restaurantNombre: string, businessId?: string): Promise<string> {
  const activeSnap = await getDocs(query(
    collection(db, 'shifts'),
    where('appId', '==', 'gastro_smart'),
    where('employeeId', '==', employee.id),
    where('estado', '==', 'abierto'),
    limit(1)
  ));

  if (!activeSnap.empty) {
    return activeSnap.docs[0].id;
  }

  const today = new Date().toISOString().split('T')[0];
  const shiftDoc = await addDoc(collection(db, 'shifts'), {
    businessId: businessId || employee.businessId || 'biz_default',
    employeeId: employee.id,
    employeeName: employee.nombre,
    employeePuesto: employee.puesto,
    restaurantId: employee.restaurantId,
    restaurantNombre,
    fecha: today,
    horaInicio: new Date().toISOString(),
    estado: 'abierto',
    pedidosTomados: 0,
    ventasGeneradas: 0,
    pagado: false,
    appId: 'gastro_smart'
  });
  return shiftDoc.id;
}

/**
 * Consulta y calcula en tiempo real las ventas y pedidos generados durante la sesión de un turno
 */
export async function getShiftSessionSummary(
  employee: Employee,
  shift: Shift
): Promise<{
  pedidosTomados: number;
  ventasGeneradas: number;
  pedidosCobrados: number;
  montoCobrado: number;
  horasTrabajadas: number;
  minutosTrabajados: number;
}> {
  const start = new Date(shift.horaInicio).getTime();
  const end = Date.now();
  const minutesWorked = Math.max(1, Math.round((end - start) / (1000 * 60)));
  const hoursWorked = Math.round((minutesWorked / 60) * 10) / 10;

  let pedidosTomados = 0;
  let ventasGeneradas = 0;
  let pedidosCobrados = 0;
  let montoCobrado = 0;

  try {
    const qOrders = query(
      collection(db, 'orders'),
      where('appId', '==', 'gastro_smart'),
      where('restaurantId', '==', shift.restaurantId)
    );
    const snap = await getDocs(qOrders);
    
    snap.docs.forEach(docSnap => {
      const ord = docSnap.data() as Order;
      const orderTime = new Date(ord.creadoEn).getTime();

      // Pedidos creados por este empleado durante su turno
      if (ord.meseroId === employee.id && orderTime >= (start - 120000)) {
        pedidosTomados++;
        ventasGeneradas += (ord.total || 0);
      }

      // Si es rol de caja, o cobró comandas durante su turno
      if (employee.puesto === 'caja' || employee.puesto === 'admin' || employee.puesto === 'owner') {
        const cobradoTime = ord.cobradoEn ? new Date(ord.cobradoEn).getTime() : 0;
        const cobradoPorEsteCajero = ord.cajeroNombre === employee.nombre || 
          (ord.timeline && ord.timeline.some(t => t.estado === 'cobrado' && t.usuario === employee.nombre));

        if (ord.estado === 'cobrado' && cobradoPorEsteCajero && cobradoTime >= (start - 120000)) {
          pedidosCobrados++;
          montoCobrado += (ord.total || 0);
        }
      }
    });
  } catch (err) {
    console.warn('Error computing shift session summary:', err);
  }

  // Fallback si la comanda ya tenía contador acumulado
  if (pedidosTomados === 0 && (shift.pedidosTomados || 0) > 0) {
    pedidosTomados = shift.pedidosTomados || 0;
  }
  if (ventasGeneradas === 0 && (shift.ventasGeneradas || 0) > 0) {
    ventasGeneradas = shift.ventasGeneradas || 0;
  }

  return {
    pedidosTomados,
    ventasGeneradas: Math.round(ventasGeneradas * 100) / 100,
    pedidosCobrados,
    montoCobrado: Math.round(montoCobrado * 100) / 100,
    horasTrabajadas: hoursWorked,
    minutosTrabajados: minutesWorked
  };
}

export async function closeShift(
  shiftId: string, 
  reporteLabores?: string,
  sessionMetrics?: {
    pedidosTomados?: number;
    ventasGeneradas?: number;
    pedidosCobrados?: number;
    montoCobrado?: number;
    efectivoContado?: number;
    fondoInicial?: number;
  }
): Promise<{
  pedidosTomados: number;
  ventasGeneradas: number;
  pedidosCobrados: number;
  montoCobrado: number;
  horasTrabajadas: number;
  minutosTrabajados: number;
}> {
  const shiftRef = doc(db, 'shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) {
    return { pedidosTomados: 0, ventasGeneradas: 0, pedidosCobrados: 0, montoCobrado: 0, horasTrabajadas: 0, minutosTrabajados: 0 };
  }

  const data = snap.data() as Shift;
  if (data.estado === 'cerrado') {
    throw new Error('Este turno ya se encuentra cerrado.');
  }

  const horaFin = new Date().toISOString();
  const start = new Date(data.horaInicio).getTime();
  const end = new Date(horaFin).getTime();
  const minutesWorked = Math.max(1, Math.round((end - start) / (1000 * 60)));
  const hoursWorked = Math.round((minutesWorked / 60) * 10) / 10;

  const pedidosTomados = sessionMetrics?.pedidosTomados ?? data.pedidosTomados ?? 0;
  const ventasGeneradas = sessionMetrics?.ventasGeneradas ?? data.ventasGeneradas ?? 0;
  const pedidosCobrados = sessionMetrics?.pedidosCobrados ?? data.pedidosCobrados ?? 0;
  const montoCobrado = sessionMetrics?.montoCobrado ?? data.montoCobrado ?? 0;
  const efectivoContado = sessionMetrics?.efectivoContado ?? 0;
  const fondoInicial = sessionMetrics?.fondoInicial ?? 100;
  const esperadoEnCaja = fondoInicial + montoCobrado;
  const diferenciaCaja = efectivoContado > 0 ? Math.round((efectivoContado - esperadoEnCaja) * 100) / 100 : 0;

  const resumenSesion = {
    horasTrabajadas: hoursWorked,
    pedidosTomados,
    ventasGeneradas,
    pedidosCobrados,
    montoCobrado,
    efectivoContado,
    fondoInicial,
    diferenciaCaja,
    horaInicio: data.horaInicio,
    horaFin
  };

  await updateDoc(shiftRef, {
    estado: 'cerrado',
    horaFin,
    minutosTrabajados: minutesWorked,
    pedidosTomados,
    ventasGeneradas,
    pedidosCobrados,
    montoCobrado,
    efectivoContado,
    fondoInicial,
    diferenciaCaja,
    reporteLabores: reporteLabores?.trim() || null,
    resumenSesion
  });

  return {
    pedidosTomados,
    ventasGeneradas,
    pedidosCobrados,
    montoCobrado,
    horasTrabajadas: hoursWorked,
    minutosTrabajados: minutesWorked
  };
}

export async function payShiftSalary(shift: Shift, employee: Employee): Promise<{ expenseId: string; amount: number }> {
  if (!shift || !shift.id) {
    throw new Error('Datos de turno inválidos para procesar el pago.');
  }
  if (!employee || !employee.id) {
    throw new Error('Datos de empleado requeridos para el pago de sueldo.');
  }

  const shiftRef = doc(db, 'shifts', shift.id);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) {
    throw new Error('El turno especificado no existe.');
  }

  const shiftData = snap.data() as Shift;
  if (shiftData.estado !== 'cerrado') {
    throw new Error('Solo se pueden liquidar y pagar turnos cerrados.');
  }

  const isAlreadyPaid = shiftData.pagado === true || shiftData.sueldoPagado === true;
  if (isAlreadyPaid) {
    throw new Error('Este turno ya ha sido liquidado y pagado previamente.');
  }

  const modalidad = employee.modalidadPago || employee.tipoSueldo || 'por_horas';
  if (modalidad === 'mes' || modalidad === 'fijo') {
    throw new Error('Este empleado tiene modalidad de Sueldo Mensual. Utilice el módulo de pago mensual en la pestaña Asistencia & Planilla.');
  }

  let totalPay = 0;
  let descriptionDesc = '';
  let durationHours = 0;
  let overtimeHours = 0;
  let rateUsed = 0;

  if (modalidad === 'por_dia') {
    // Validar que no se pague dos veces el mismo día para el mismo empleado
    const shiftDate = shiftData.fecha || (shiftData.horaInicio || '').split('T')[0];
    const qShifts = query(
      collection(db, 'shifts'),
      where('appId', '==', 'gastro_smart'),
      where('employeeId', '==', employee.id),
      where('fecha', '==', shiftDate)
    );
    const existingShiftsSnap = await getDocs(qShifts);
    const alreadyPaidToday = existingShiftsSnap.docs.some(d => {
      const s = d.data() as Shift;
      return s.id !== shift.id && (s.pagado === true || s.sueldoPagado === true);
    });

    if (alreadyPaidToday) {
      throw new Error(`El empleado ${employee.nombre} ya tiene un turno liquidado y pagado para la fecha ${shiftDate}. Evitando pago diario duplicado.`);
    }

    const dailyRate = (employee.tarifaDiaria && employee.tarifaDiaria > 0) ? employee.tarifaDiaria : 50;
    totalPay = Math.round(dailyRate * 100) / 100;
    rateUsed = dailyRate;
    descriptionDesc = `Pago de sueldo diario - ${employee.nombre} (Jornada ${shiftDate} a $${dailyRate}/día)`;
    durationHours = shiftData.minutosTrabajados ? shiftData.minutosTrabajados / 60 : 8;
  } else {
    // Por horas (por_horas)
    durationHours = shiftData.horaFin 
      ? Math.max(0.1, (new Date(shiftData.horaFin).getTime() - new Date(shiftData.horaInicio).getTime()) / (1000 * 60 * 60))
      : Math.max(0.1, (shiftData.minutosTrabajados || 0) / 60);

    const rate = (employee.tarifaHora && employee.tarifaHora > 0) ? employee.tarifaHora : 12;
    rateUsed = rate;
    const regularHours = Math.min(8, durationHours);
    overtimeHours = Math.max(0, durationHours - 8);
    totalPay = Math.round(((regularHours * rate) + (overtimeHours * rate * 1.5)) * 100) / 100;
    descriptionDesc = `Pago de sueldo turno - ${employee.nombre} (${regularHours.toFixed(1)}h norm + ${overtimeHours.toFixed(1)}h ext a $${rate}/h)`;
  }

  if (isNaN(totalPay) || totalPay <= 0) {
    throw new Error('El monto de sueldo calculado es inválido o igual a cero.');
  }

  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const targetBizId = shiftData.businessId || employee.businessId || 'biz_default';
  const expenseRef = doc(collection(db, 'expenses'));

  const batch = writeBatch(db);

  batch.set(expenseRef, {
    businessId: targetBizId,
    restaurantId: shiftData.restaurantId,
    tipo: 'sueldo',
    monto: totalPay,
    descripcion: descriptionDesc,
    employeeId: employee.id,
    employeeName: employee.nombre,
    shiftId: shift.id,
    modalidadPago: modalidad,
    horasTrabajadas: Math.round(durationHours * 10) / 10,
    horasExtra: Math.round(overtimeHours * 10) / 10,
    tarifaHora: rateUsed,
    fecha: today,
    appId: 'gastro_smart',
    creadoEn: now
  });

  batch.update(shiftRef, {
    pagado: true,
    montoPagadoSueldo: totalPay,
    fechaPago: now,
    sueldoPagado: true,
    sueldoTotal: totalPay
  });

  await batch.commit();

  return { expenseId: expenseRef.id, amount: totalPay };
}

// ======================= MENU ITEMS =======================

export function subscribeToMenuItems(
  arg1?: string | null | ((items: MenuItem[]) => void),
  arg2?: string | null | ((items: MenuItem[]) => void),
  arg3?: (items: MenuItem[]) => void
) {
  let businessId: string | null = null;
  let restaurantId: string | null = null;
  let callback: (items: MenuItem[]) => void = () => {};

  if (typeof arg1 === 'function') {
    callback = arg1;
  } else if (typeof arg2 === 'function') {
    restaurantId = arg1 || null;
    callback = arg2;
  } else {
    businessId = arg1 || null;
    restaurantId = arg2 || null;
    callback = arg3 || (() => {});
  }

  const colRef = collection(db, 'menuItems');
  const q = businessId
    ? query(colRef, where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))
    : query(colRef, where('appId', '==', 'gastro_smart'));

  return onSnapshot(q, (snapshot) => {
    let list: MenuItem[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as MenuItem));
    if (restaurantId) {
      list = list.filter(m => m.restaurantId === restaurantId || m.restaurantId === 'all');
    }
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (menuItems):', err);
  });
}

export function generateMenuItemId(): string {
  return 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
}

export async function createMenuItem(data: Omit<MenuItem, 'id'>) {
  return addDoc(collection(db, 'menuItems'), {
    ...data,
    appId: 'gastro_smart'
  });
}

export async function setMenuItem(id: string, data: Omit<MenuItem, 'id'>) {
  return setDoc(doc(db, 'menuItems', id), {
    ...data,
    appId: 'gastro_smart'
  }, { merge: true });
}

export async function updateMenuItem(id: string, data: Partial<MenuItem>) {
  return updateDoc(doc(db, 'menuItems', id), data);
}

export async function deleteMenuItem(id: string) {
  return deleteDoc(doc(db, 'menuItems', id));
}

// ======================= TABLES =======================

export function subscribeToTables(
  arg1: string, 
  arg2: ((tables: Table[]) => void) | string,
  arg3?: (tables: Table[]) => void
) {
  let restaurantId = arg1;
  let callback: (tables: Table[]) => void;

  if (typeof arg2 === 'function') {
    callback = arg2;
  } else {
    callback = arg3 || (() => {});
  }

  const q = query(
    collection(db, 'tables'),
    where('appId', '==', 'gastro_smart'),
    where('restaurantId', '==', restaurantId)
  );
  return onSnapshot(q, (snapshot) => {
    const list: Table[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as Table));
    list.sort((a, b) => a.numero - b.numero);
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (tables):', err);
  });
}

export async function updateTableStatus(tableId: string, estado: 'libre' | 'ocupada') {
  return updateDoc(doc(db, 'tables', tableId), { estado });
}

// ======================= ORDERS & NOTIFICATIONS =======================

export function subscribeToOrders(
  arg1?: string | null | ((orders: Order[]) => void),
  arg2?: string | null | ((orders: Order[]) => void),
  arg3?: (orders: Order[]) => void
) {
  let businessId: string | null = null;
  let restaurantId: string | null = null;
  let callback: (orders: Order[]) => void = () => {};

  if (typeof arg1 === 'function') {
    callback = arg1;
  } else if (typeof arg2 === 'function') {
    restaurantId = arg1 || null;
    callback = arg2;
  } else {
    businessId = arg1 || null;
    restaurantId = arg2 || null;
    callback = arg3 || (() => {});
  }

  const colRef = collection(db, 'orders');
  const q = businessId
    ? query(colRef, where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId), limit(80))
    : query(colRef, where('appId', '==', 'gastro_smart'), limit(80));

  return onSnapshot(q, (snapshot) => {
    let list: Order[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as Order));
    if (restaurantId) {
      list = list.filter(o => o.restaurantId === restaurantId);
    }
    list.sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (orders):', err);
  });
}

export async function createOrder(data: Omit<Order, 'id' | 'creadoEn'> & { creadoEn?: string }) {
  const initialTimeline: OrderTimelineEvent[] = [
    {
      estado: data.estado || 'pendiente_cocina',
      fecha: new Date().toISOString(),
      usuario: data.meseroNombre || 'Mesero',
      motivo: null
    }
  ];

  let targetBusinessId = data.businessId;
  if (!targetBusinessId && data.restaurantId) {
    try {
      const rSnap = await getDoc(doc(db, 'restaurants', data.restaurantId));
      if (rSnap.exists() && rSnap.data()?.businessId) {
        targetBusinessId = rSnap.data().businessId;
      }
    } catch {
      // fallback
    }
  }

  // Determinar ruta del pedido si no viene especificada
  let computedRuta: OrderRoute = data.ruta || 'cocina';
  if (!data.ruta && data.items && data.items.length > 0) {
    const allNoKitchen = data.items.every(i => i.requiereCocina === false);
    const someNoKitchen = data.items.some(i => i.requiereCocina === false);
    const someKitchen = data.items.some(i => i.requiereCocina !== false);
    if (allNoKitchen) {
      computedRuta = 'express';
    } else if (someNoKitchen && someKitchen) {
      computedRuta = 'mixto';
    } else {
      computedRuta = 'cocina';
    }
  }

  const isExpress = computedRuta === 'express' || Boolean(data.esVentaExpress);

  const sanitizedItems: OrderItem[] = (data.items || []).map(it => ({
    ...it,
    requiereCocina: it.requiereCocina !== undefined ? it.requiereCocina : true,
    estadoItem: it.estadoItem || (it.requiereCocina === false ? 'listo' : 'pendiente')
  }));

  const sanitizedData: any = {
    ...data,
    items: sanitizedItems,
    ruta: computedRuta,
    esVentaExpress: isExpress,
    estadoPago: data.estadoPago || (data.estado === 'cobrado' ? 'cobrado' : 'pendiente'),
    estadoEntrega: data.estadoEntrega || (data.estado === 'entregado' ? 'entregado' : 'pendiente'),
    businessId: targetBusinessId || 'biz_default',
    appId: 'gastro_smart',
    empresaDelivery: data.tipo === 'delivery' ? (data.empresaDelivery || 'Propio') : null,
    mesaId: data.tipo === 'local' ? (data.mesaId || null) : null,
    mesaNumero: data.tipo === 'local' ? (data.mesaNumero || null) : null,
    clienteId: data.clienteId || null,
    clienteNombre: data.clienteNombre || null,
    clienteTelefono: data.clienteTelefono || null,
    clienteDireccion: data.clienteDireccion || null,
    descuento: data.descuento || 0,
    propina: data.propina || 0,
    motivoRechazo: data.motivoRechazo || null,
    metodoPago: data.metodoPago || null,
    montoPagado: data.montoPagado || 0,
    vuelto: data.vuelto || 0,
    cajeroNombre: data.cajeroNombre || null,
    creadoEn: data.creadoEn || new Date().toISOString(),
    timeline: initialTimeline
  };

  const orderRef = doc(collection(db, 'orders'));
  const batch = writeBatch(db);
  batch.set(orderRef, sanitizedData);

  if (data.tipo === 'local' && data.mesaId) {
    batch.update(doc(db, 'tables', data.mesaId), {
      estado: 'ocupada',
      comandaActivaId: orderRef.id
    });
  }

  await batch.commit();

  // Incrementar pedidos tomados en el turno del mesero
  try {
    const shiftSnap = await getDocs(query(
      collection(db, 'shifts'),
      where('appId', '==', 'gastro_smart'),
      where('employeeId', '==', data.meseroId),
      where('estado', '==', 'abierto'),
      limit(1)
    ));
    if (!shiftSnap.empty) {
      const shiftDoc = shiftSnap.docs[0];
      const prevOrders = shiftDoc.data().pedidosTomados || 0;
      await updateDoc(shiftDoc.ref, {
        pedidosTomados: prevOrders + 1
      });
    }
  } catch (e) {
    console.warn('Could not update shift order count:', e);
  }

  // Si se crea cobrado directamente (por ejemplo en Venta Mostrador POS Rápido)
  if (data.estado === 'cobrado') {
    try {
      const fechaHoy = formatDateKey(new Date());
      const bId = sanitizedData.businessId || 'biz_default';
      const rId = sanitizedData.restaurantId;
      const statDocId = getDailyStatDocId(bId, rId, fechaHoy);
      const statRef = doc(db, 'dailyStats', statDocId);
      const statSnap = await getDoc(statRef);
      const totalOrder = sanitizedData.total || 0;

      if (statSnap.exists()) {
        const prevStat = statSnap.data() as DailyStat;
        const newVentas = (prevStat.ventasTotales || 0) + totalOrder;
        const newPedidos = (prevStat.pedidosCobrados || 0) + 1;
        const newGastos = prevStat.gastosTotales || 0;
        await updateDoc(statRef, {
          ventasTotales: Math.round(newVentas * 100) / 100,
          pedidosCobrados: newPedidos,
          gananciaNeta: Math.round((newVentas - newGastos) * 100) / 100,
          ticketPromedio: newPedidos > 0 ? Math.round((newVentas / newPedidos) * 100) / 100 : 0,
          actualizadoEn: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn('Could not update dailyStats for instant order:', e);
    }
  }

  return orderRef.id;
}

export async function appendItemsToExistingOrder(
  orderId: string, 
  newItems: OrderItem[], 
  options?: {
    userName?: string;
    subtotal?: number;
    total?: number;
    timelineEvent?: OrderTimelineEvent;
  } | string,
  _legacyTimeline?: OrderTimelineEvent[]
): Promise<void> {
  if (!orderId) {
    throw new Error('Identificador de comanda requerido para la ampliación.');
  }
  if (!Array.isArray(newItems) || newItems.length === 0) {
    throw new Error('El carrito de nuevos platos está vacío.');
  }

  // Validaciones rigurosas de platos e importes
  for (const item of newItems) {
    if (!item.nombre || typeof item.nombre !== 'string' || item.nombre.trim().length === 0) {
      throw new Error('Todos los platos añadidos deben tener un nombre válido.');
    }
    if (typeof item.precio !== 'number' || isNaN(item.precio) || item.precio < 0) {
      throw new Error(`El plato "${item.nombre}" tiene un precio unitario inválido.`);
    }
    if (typeof item.cantidad !== 'number' || isNaN(item.cantidad) || item.cantidad <= 0) {
      throw new Error(`El plato "${item.nombre}" debe tener una cantidad mayor a cero.`);
    }
  }

  const orderRef = doc(db, 'orders', orderId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) {
      throw new Error('La comanda seleccionada no existe.');
    }

    const currentOrder = snap.data() as Order;
    if (currentOrder.estado === 'cobrado' || currentOrder.estado === 'rechazado') {
      throw new Error('No se puede ampliar una comanda que ya fue cobrada o cancelada.');
    }

    const sanitizedNewItems: OrderItem[] = newItems.map(it => ({
      ...it,
      requiereCocina: it.requiereCocina !== undefined ? it.requiereCocina : true,
      estadoItem: it.estadoItem || (it.requiereCocina === false ? 'listo' : 'pendiente')
    }));

    const mergedItems = [...(currentOrder.items || []), ...sanitizedNewItems];

    // Recalcular subtotal de forma precisa sumando todos los ítems
    const calculatedSubtotal = mergedItems.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
    const subtotal = Math.round(calculatedSubtotal * 100) / 100;
    const descuento = currentOrder.descuento || 0;
    const propina = currentOrder.propina || 0;
    const total = Math.max(0, Math.round((subtotal - descuento + propina) * 100) / 100);

    // Determinar la ruta de preparación según los ítems
    const allNoKitchen = mergedItems.every(i => i.requiereCocina === false);
    const someNoKitchen = mergedItems.some(i => i.requiereCocina === false);
    const someKitchen = mergedItems.some(i => i.requiereCocina !== false);
    let computedRuta: OrderRoute = 'cocina';
    if (allNoKitchen) computedRuta = 'express';
    else if (someNoKitchen && someKitchen) computedRuta = 'mixto';

    const userName = typeof options === 'string' ? options : (options?.userName || 'Mesero');
    const addedCount = newItems.reduce((acc, it) => acc + (it.cantidad || 1), 0);

    const timelineEvent: OrderTimelineEvent = (typeof options === 'object' && options?.timelineEvent) ? options.timelineEvent : {
      estado: 'pendiente_cocina',
      fecha: new Date().toISOString(),
      usuario: userName,
      motivo: `Ampliación de comanda: +${addedCount} plato(s) agregados (${newItems.map(i => `${i.cantidad}x ${i.nombre}`).join(', ')})`
    };

    const mergedTimeline = [...(currentOrder.timeline || []), timelineEvent];

    tx.update(orderRef, {
      items: mergedItems,
      subtotal,
      total,
      timeline: mergedTimeline,
      estado: 'pendiente_cocina', // Despierta la pantalla de KDS/Cocina
      ruta: computedRuta,
      esVentaExpress: computedRuta === 'express'
    });

    if (currentOrder.mesaId) {
      tx.update(doc(db, 'tables', currentOrder.mesaId), {
        estado: 'ocupada',
        comandaActivaId: orderId
      });
    }
  });
}

export async function updateOrderStatus(
  orderId: string, 
  newStatus: OrderStatus, 
  userName: string, 
  options?: {
    motivoRechazo?: string;
    timeline?: OrderTimelineEvent[];
    metodoPago?: 'efectivo' | 'tarjeta' | 'transferencia';
    montoPagado?: number;
    vuelto?: number;
    cajeroNombre?: string;
    subtotal?: number;
    total?: number;
    descuento?: number;
    propina?: number;
    estadoEntrega?: 'pendiente' | 'entregado';
    estadoPago?: 'pendiente' | 'cobrado';
    ruta?: OrderRoute;
    items?: OrderItem[];
  },
  _extraParam?: any
) {
  const orderRef = doc(db, 'orders', orderId);
  const currentSnap = await getDoc(orderRef);
  if (!currentSnap.exists()) return;
  const orderData = currentSnap.data() as Order;

  const now = new Date().toISOString();
  const currentTimeline = options?.timeline || orderData.timeline || [];
  const updatedTimeline: OrderTimelineEvent[] = [
    ...currentTimeline,
    {
      estado: newStatus,
      fecha: now,
      usuario: userName,
      motivo: options?.motivoRechazo || null
    }
  ];

  const updatePayload: any = {
    estado: newStatus,
    timeline: updatedTimeline
  };

  if (options?.subtotal !== undefined) updatePayload.subtotal = options.subtotal;
  if (options?.total !== undefined) updatePayload.total = options.total;
  if (options?.descuento !== undefined) updatePayload.descuento = options.descuento;
  if (options?.propina !== undefined) updatePayload.propina = options.propina;
  if (options?.estadoEntrega !== undefined) updatePayload.estadoEntrega = options.estadoEntrega;
  if (options?.estadoPago !== undefined) updatePayload.estadoPago = options.estadoPago;
  if (options?.ruta !== undefined) updatePayload.ruta = options.ruta;
  if (options?.items !== undefined) updatePayload.items = options.items;

  if (newStatus === 'aceptado') updatePayload.aceptadoEn = now;
  if (newStatus === 'listo') updatePayload.listoEn = now;
  if (newStatus === 'entregado') {
    updatePayload.entregadoEn = now;
    updatePayload.estadoEntrega = 'entregado';
  }

  if (newStatus === 'rechazado' && options?.motivoRechazo) {
    updatePayload.motivoRechazo = options.motivoRechazo;
    if (orderData.mesaId) {
      await updateTableStatus(orderData.mesaId, 'libre');
    }
  }

  if (newStatus === 'cobrado') {
    updatePayload.cobradoEn = now;
    updatePayload.estadoPago = 'cobrado';
    if (options?.metodoPago) updatePayload.metodoPago = options.metodoPago;
    if (options?.montoPagado !== undefined) updatePayload.montoPagado = options.montoPagado;
    if (options?.vuelto !== undefined) updatePayload.vuelto = options.vuelto;
    if (options?.cajeroNombre) updatePayload.cajeroNombre = options.cajeroNombre;

    if (orderData.mesaId) {
      await updateTableStatus(orderData.mesaId, 'libre');
    }

    try {
      const shiftSnap = await getDocs(query(
        collection(db, 'shifts'),
        where('appId', '==', 'gastro_smart'),
        where('employeeId', '==', orderData.meseroId),
        where('estado', '==', 'abierto'),
        limit(1)
      ));
      if (!shiftSnap.empty) {
        const shiftDoc = shiftSnap.docs[0];
        const prevSales = shiftDoc.data().ventasGeneradas || 0;
        await updateDoc(shiftDoc.ref, {
          ventasGeneradas: prevSales + (orderData.total || 0)
        });
      }
    } catch (e) {
      console.warn('Could not update shift sales count:', e);
    }

    // Sincronizar en tiempo real con dailyStats
    try {
      const fechaHoy = formatDateKey(new Date());
      const bId = orderData.businessId || 'biz_default';
      const rId = orderData.restaurantId;
      const statDocId = getDailyStatDocId(bId, rId, fechaHoy);
      const statRef = doc(db, 'dailyStats', statDocId);
      const statSnap = await getDoc(statRef);
      const totalOrder = options?.total !== undefined ? options.total : (orderData.total || 0);

      if (statSnap.exists()) {
        const prevStat = statSnap.data() as DailyStat;
        const newVentas = (prevStat.ventasTotales || 0) + totalOrder;
        const newPedidos = (prevStat.pedidosCobrados || 0) + 1;
        const newGastos = prevStat.gastosTotales || 0;
        await updateDoc(statRef, {
          ventasTotales: Math.round(newVentas * 100) / 100,
          pedidosCobrados: newPedidos,
          gananciaNeta: Math.round((newVentas - newGastos) * 100) / 100,
          ticketPromedio: newPedidos > 0 ? Math.round((newVentas / newPedidos) * 100) / 100 : 0,
          actualizadoEn: new Date().toISOString()
        });
      } else {
        const isDelivery = orderData.tipo === 'delivery';
        const empDeliv = (orderData.empresaDelivery || '').toLowerCase();
        const initialStat: DailyStat = {
          id: statDocId,
          businessId: bId,
          restaurantId: rId,
          fecha: fechaHoy,
          ventasTotales: Math.round(totalOrder * 100) / 100,
          gastosTotales: 0,
          gananciaNeta: Math.round(totalOrder * 100) / 100,
          pedidosCobrados: 1,
          ticketPromedio: Math.round(totalOrder * 100) / 100,
          ventasPorCanal: {
            local: orderData.tipo === 'local' ? totalOrder : 0,
            pedidosYa: empDeliv.includes('pedidos') || empDeliv.includes('ya') ? totalOrder : 0,
            uberEats: empDeliv.includes('uber') ? totalOrder : 0,
            rappi: empDeliv.includes('rappi') ? totalOrder : 0,
            propio: empDeliv.includes('propio') ? totalOrder : 0,
            otro: isDelivery && !empDeliv.match(/pedidos|uber|rappi|propio/) ? totalOrder : 0
          },
          pedidosPorCanal: {
            local: orderData.tipo === 'local' ? 1 : 0,
            pedidosYa: empDeliv.includes('pedidos') || empDeliv.includes('ya') ? 1 : 0,
            uberEats: empDeliv.includes('uber') ? 1 : 0,
            rappi: empDeliv.includes('rappi') ? 1 : 0,
            propio: empDeliv.includes('propio') ? 1 : 0,
            otro: isDelivery && !empDeliv.match(/pedidos|uber|rappi|propio/) ? 1 : 0
          },
          gastosPorTipo: { sueldos: 0, viveres: 0, transporte: 0, servicios: 0, mantenimiento: 0, otros: 0 },
          ventasPorHora: {},
          topPlatos: (orderData.items || []).map(i => ({ nombre: i.nombre, cantidad: i.cantidad || 1, total: (i.precio || 0) * (i.cantidad || 1) })),
          horasTrabajadasTotal: 0,
          costoSueldosTurnos: 0,
          appId: 'gastro_smart',
          actualizadoEn: new Date().toISOString()
        };
        await setDoc(statRef, initialStat);
      }
    } catch (e) {
      console.warn('Could not update dailyStats for order:', e);
    }
  }

  return updateDoc(orderRef, updatePayload);
}

/**
 * Marca un pedido como entregado (especialmente útil para entregas en mostrador/express)
 */
export async function markOrderDelivered(orderId: string, userName: string): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  const snap = await getDoc(orderRef);
  if (!snap.exists()) return;
  const order = snap.data() as Order;

  const now = new Date().toISOString();
  const timeline = order.timeline || [];
  const updatedTimeline: OrderTimelineEvent[] = [
    ...timeline,
    {
      estado: 'entregado',
      fecha: now,
      usuario: userName,
      motivo: 'Entrega en mostrador confirmada'
    }
  ];

  await updateDoc(orderRef, {
    estadoEntrega: 'entregado',
    entregadoEn: now,
    timeline: updatedTimeline
  });
}

// ======================= CLIENTS =======================

export function subscribeToClients(
  arg1?: string | null | ((clients: Client[]) => void),
  arg2?: (clients: Client[]) => void
) {
  let businessId: string | null = null;
  let callback: (clients: Client[]) => void = () => {};

  if (typeof arg1 === 'function') {
    callback = arg1;
  } else {
    businessId = arg1 || null;
    callback = arg2 || (() => {});
  }

  const colRef = collection(db, 'clients');
  const q = businessId
    ? query(colRef, where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))
    : query(colRef, where('appId', '==', 'gastro_smart'));

  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as Client));
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (clients):', err);
  });
}

export async function createOrUpdateClient(data: Omit<Client, 'id'>): Promise<string> {
  if (data.telefono) {
    const snap = await getDocs(query(collection(db, 'clients'), where('appId', '==', 'gastro_smart'), where('telefono', '==', data.telefono)));
    if (!snap.empty) {
      const clientDoc = snap.docs[0];
      await updateDoc(clientDoc.ref, data);
      return clientDoc.id;
    }
  }
  const ref = await addDoc(collection(db, 'clients'), {
    ...data,
    businessId: data.businessId || 'biz_default',
    appId: 'gastro_smart',
    creadoEn: new Date().toISOString()
  });
  return ref.id;
}

export const createClient = createOrUpdateClient;

// ======================= CASH REGISTER CLOSES =======================

export function subscribeToCashCloses(
  arg1?: string | null | ((data: CashRegisterClose[]) => void),
  arg2?: string | null | ((data: CashRegisterClose[]) => void),
  arg3?: (data: CashRegisterClose[]) => void
) {
  let businessId: string | null = null;
  let restaurantId: string | null = null;
  let callback: (data: CashRegisterClose[]) => void = () => {};

  if (typeof arg1 === 'function') {
    callback = arg1;
  } else if (typeof arg2 === 'function') {
    restaurantId = arg1 || null;
    callback = arg2;
  } else {
    businessId = arg1 || null;
    restaurantId = arg2 || null;
    callback = arg3 || (() => {});
  }

  const colRef = collection(db, 'cashRegisterCloses');
  const q = businessId
    ? query(colRef, where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId), limit(50))
    : query(colRef, where('appId', '==', 'gastro_smart'), limit(50));

  return onSnapshot(q, (snapshot) => {
    let list = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as CashRegisterClose));
    if (restaurantId) {
      list = list.filter(c => c.restaurantId === restaurantId);
    }
    list.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (cashCloses):', err);
  });
}

export async function createCashRegisterClose(data: Omit<CashRegisterClose, 'id'> | Omit<CashRegisterClose, 'id' | 'creadoEn'>) {
  return addDoc(collection(db, 'cashRegisterCloses'), {
    ...data,
    businessId: (data as any).businessId || 'biz_default',
    appId: 'gastro_smart',
    creadoEn: (data as any).creadoEn || new Date().toISOString()
  });
}

// ======================= EXPENSES =======================

export function subscribeToExpenses(
  arg1?: string | null | ((expenses: Expense[]) => void),
  arg2?: string | null | ((expenses: Expense[]) => void),
  arg3?: (expenses: Expense[]) => void
) {
  let businessId: string | null = null;
  let restaurantId: string | null = null;
  let callback: (expenses: Expense[]) => void = () => {};

  if (typeof arg1 === 'function') {
    callback = arg1;
  } else if (typeof arg2 === 'function') {
    restaurantId = arg1 || null;
    callback = arg2;
  } else {
    businessId = arg1 || null;
    restaurantId = arg2 || null;
    callback = arg3 || (() => {});
  }

  const colRef = collection(db, 'expenses');
  const q = businessId
    ? query(colRef, where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId), limit(100))
    : query(colRef, where('appId', '==', 'gastro_smart'), limit(100));

  return onSnapshot(q, (snapshot) => {
    let list = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as Expense));
    if (restaurantId) {
      list = list.filter(e => e.restaurantId === restaurantId);
    }
    list.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (expenses):', err);
  });
}

export async function createExpense(data: Omit<Expense, 'id'>) {
  const sanitized = limpiarDatosUndefined({
    ...data,
    businessId: data.businessId || 'biz_default',
    appId: 'gastro_smart',
    creadoEn: data.creadoEn || new Date().toISOString()
  });

  const { id: expenseId, ref: expenseRef } = await guardarDocumento('expenses', sanitized);

  // Sincronizar gasto con dailyStats
  try {
    const fecha = (data.fecha || new Date().toISOString()).split('T')[0];
    const bId = data.businessId || 'biz_default';
    const rId = data.restaurantId;
    const statDocId = getDailyStatDocId(bId, rId, fecha);
    const statRef = doc(db, 'dailyStats', statDocId);
    const statSnap = await getDoc(statRef);
    const monto = data.monto || 0;

    if (statSnap.exists()) {
      const prevStat = statSnap.data() as DailyStat;
      const newGastos = (prevStat.gastosTotales || 0) + monto;
      const newVentas = prevStat.ventasTotales || 0;
      const gastosPorTipo = { 
        sueldos: 0, 
        viveres: 0, 
        transporte: 0, 
        servicios: 0, 
        mantenimiento: 0, 
        otros: 0,
        ...(prevStat.gastosPorTipo || {}) 
      };

      if (data.tipo === 'sueldo') gastosPorTipo.sueldos += monto;
      else if (data.tipo === 'insumos' || data.tipo === 'viveres') gastosPorTipo.viveres += monto;
      else if (data.tipo === 'transporte') gastosPorTipo.transporte += monto;
      else if (data.tipo === 'servicios') gastosPorTipo.servicios += monto;
      else if (data.tipo === 'mantenimiento') gastosPorTipo.mantenimiento += monto;
      else gastosPorTipo.otros += monto;

      await updateDoc(statRef, {
        gastosTotales: Math.round(newGastos * 100) / 100,
        gananciaNeta: Math.round((newVentas - newGastos) * 100) / 100,
        gastosPorTipo,
        actualizadoEn: new Date().toISOString()
      });
    } else {
      const gastosPorTipo = { sueldos: 0, viveres: 0, transporte: 0, servicios: 0, mantenimiento: 0, otros: 0 };
      if (data.tipo === 'sueldo') gastosPorTipo.sueldos += monto;
      else if (data.tipo === 'insumos' || data.tipo === 'viveres') gastosPorTipo.viveres += monto;
      else if (data.tipo === 'transporte') gastosPorTipo.transporte += monto;
      else if (data.tipo === 'servicios') gastosPorTipo.servicios += monto;
      else if (data.tipo === 'mantenimiento') gastosPorTipo.mantenimiento += monto;
      else gastosPorTipo.otros += monto;

      const initialStat: DailyStat = {
        id: statDocId,
        businessId: bId,
        restaurantId: rId,
        fecha,
        ventasTotales: 0,
        gastosTotales: Math.round(monto * 100) / 100,
        gananciaNeta: Math.round(-monto * 100) / 100,
        pedidosCobrados: 0,
        ticketPromedio: 0,
        ventasPorCanal: { local: 0, pedidosYa: 0, uberEats: 0, rappi: 0, propio: 0, otro: 0 },
        pedidosPorCanal: { local: 0, pedidosYa: 0, uberEats: 0, rappi: 0, propio: 0, otro: 0 },
        gastosPorTipo,
        ventasPorHora: {},
        topPlatos: [],
        horasTrabajadasTotal: 0,
        costoSueldosTurnos: data.tipo === 'sueldo' ? monto : 0,
        appId: 'gastro_smart',
        actualizadoEn: new Date().toISOString()
      };
      await setDoc(statRef, initialStat);
    }
  } catch (e) {
    console.warn('Could not update dailyStats for expense:', e);
  }

  // Si se proporcionó proveedor y no existe aún, guardarlo automáticamente
  if (data.proveedor && data.proveedor.trim()) {
    try {
      await createSupplier({
        nombre: data.proveedor.trim(),
        telefono: data.proveedorTelefono || '',
        businessId: data.businessId || 'biz_default',
        creadoEn: new Date().toISOString()
      });
    } catch (suppErr) {
      console.warn('Could not auto-create supplier:', suppErr);
    }
  }

  return expenseRef;
}

/**
 * Elimina un gasto y actualiza / recalcula en tiempo real el dailyStats correspondiente
 */
export async function deleteExpense(expenseId: string, expenseData?: Partial<Expense>): Promise<void> {
  const expenseRef = doc(db, 'expenses', expenseId);
  let exp = expenseData;

  if (!exp || !exp.restaurantId || !exp.monto) {
    try {
      const snap = await getDoc(expenseRef);
      if (snap.exists()) {
        exp = { id: snap.id, ...snap.data() } as Expense;
      }
    } catch (e) {
      console.warn('Could not fetch expense before deletion:', e);
    }
  }

  await deleteDoc(expenseRef);

  if (exp && exp.restaurantId && exp.monto) {
    try {
      const fecha = (exp.fecha || exp.creadoEn || new Date().toISOString()).split('T')[0];
      const bId = exp.businessId || 'biz_default';
      const rId = exp.restaurantId;
      const statDocId = getDailyStatDocId(bId, rId, fecha);
      const statRef = doc(db, 'dailyStats', statDocId);
      const statSnap = await getDoc(statRef);

      if (statSnap.exists()) {
        const prevStat = statSnap.data() as DailyStat;
        const monto = exp.monto || 0;
        const newGastos = Math.max(0, (prevStat.gastosTotales || 0) - monto);
        const newVentas = prevStat.ventasTotales || 0;
        const gastosPorTipo = { 
          sueldos: 0, 
          viveres: 0, 
          transporte: 0, 
          servicios: 0, 
          mantenimiento: 0, 
          otros: 0,
          ...(prevStat.gastosPorTipo || {}) 
        };

        if (exp.tipo === 'sueldo') gastosPorTipo.sueldos = Math.max(0, gastosPorTipo.sueldos - monto);
        else if (exp.tipo === 'insumos' || exp.tipo === 'viveres') gastosPorTipo.viveres = Math.max(0, gastosPorTipo.viveres - monto);
        else if (exp.tipo === 'transporte') gastosPorTipo.transporte = Math.max(0, gastosPorTipo.transporte - monto);
        else if (exp.tipo === 'servicios') gastosPorTipo.servicios = Math.max(0, gastosPorTipo.servicios - monto);
        else if (exp.tipo === 'mantenimiento') gastosPorTipo.mantenimiento = Math.max(0, gastosPorTipo.mantenimiento - monto);
        else gastosPorTipo.otros = Math.max(0, gastosPorTipo.otros - monto);

        await updateDoc(statRef, {
          gastosTotales: Math.round(newGastos * 100) / 100,
          gananciaNeta: Math.round((newVentas - newGastos) * 100) / 100,
          gastosPorTipo,
          actualizadoEn: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn('Could not sync dailyStats on deleteExpense:', e);
    }
  }
}

/**
 * Paga el sueldo fijo mensual de un empleado:
 * - Genera un documento en expenses de tipo 'sueldo'
 * - Actualiza el documento del empleado agregando el mes (YYYY-MM) a mesesPagados
 * - Registra la alerta de auditoría
 */
export async function payFixedSalaryExpense(params: {
  employee: Employee;
  monthKey: string; // ej. '2026-09'
  monthLabel: string; // ej. 'Septiembre 2026'
  amount: number;
  userDisplayName: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}): Promise<{ success: boolean; expenseId?: string; error?: string }> {
  const { employee, monthKey, monthLabel, amount, userDisplayName, paymentMethod, notes } = params;

  if (!employee.id || !employee.restaurantId) {
    return { success: false, error: 'Datos de empleado incompletos' };
  }

  // Verificar si ya fue pagado
  const currentPaidMonths = employee.mesesPagados || [];
  if (currentPaidMonths.includes(monthKey)) {
    return { success: false, error: `El sueldo de ${monthLabel} para ${employee.nombre} ya fue pagado previamente.` };
  }

  try {
    const today = getRestaurantLocalDateString();
    
    // 1. Crear Gasto de Sueldo
    const expenseData: Omit<Expense, 'id'> = {
      businessId: employee.businessId || 'biz_default',
      restaurantId: employee.restaurantId,
      tipo: 'sueldo',
      monto: amount,
      descripcion: `Pago de sueldo mensual fijo a ${employee.nombre} (${monthLabel})`,
      employeeId: employee.id,
      employeeName: employee.nombre,
      metodoPago: paymentMethod || 'transferencia',
      notas: notes || `Sueldo fijo mensual correspondiente al periodo ${monthLabel}. Procesado por ${userDisplayName}.`,
      registradoPor: userDisplayName,
      fecha: today,
      creadoEn: new Date().toISOString()
    };

    const expRef = await createExpense(expenseData);

    // 2. Actualizar empleado con el mes pagado
    const empRef = doc(db, 'employees', employee.id);
    await updateDoc(empRef, {
      mesesPagados: [...currentPaidMonths, monthKey]
    });

    // 3. Alerta de seguridad / auditoría
    await createSecurityAlert({
      businessId: employee.businessId || 'biz_default',
      restaurantId: employee.restaurantId,
      tipo: 'pago_sueldos_generado',
      mensaje: `Sueldo fijo de ${monthLabel} pagado a ${employee.nombre} ($${amount.toFixed(2)}) por ${userDisplayName}.`,
      fecha: new Date().toISOString(),
      leido: false,
      severidad: 'info'
    });

    return { success: true, expenseId: expRef.id };
  } catch (err: any) {
    console.error('Error paying fixed salary:', err);
    return { success: false, error: err.message || 'Error al procesar el pago de sueldo fijo' };
  }
}

// ======================= SUPPLIERS (PROVEEDORES) =======================

export function subscribeToSuppliers(
  businessId: string,
  callback: (suppliers: Supplier[]) => void
) {
  const colRef = collection(db, 'suppliers');
  const q = query(
    colRef, 
    where('appId', '==', 'gastro_smart'), 
    where('businessId', '==', businessId)
  );

  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as Supplier));
    list.sort((a, b) => a.nombre.localeCompare(b.nombre));
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (suppliers):', err);
  });
}

export async function createSupplier(data: Omit<Supplier, 'id'>): Promise<string> {
  const cleanName = data.nombre.trim();
  if (!cleanName) throw new Error('El nombre del proveedor es obligatorio');

  const bId = data.businessId || 'biz_default';
  const q = query(
    collection(db, 'suppliers'),
    where('appId', '==', 'gastro_smart'),
    where('businessId', '==', bId),
    where('nombre', '==', cleanName)
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    const docRef = snap.docs[0];
    if (data.telefono && !docRef.data().telefono) {
      await updateDoc(docRef.ref, { telefono: data.telefono });
    }
    return docRef.id;
  }

  const newDoc = await addDoc(collection(db, 'suppliers'), {
    ...data,
    nombre: cleanName,
    businessId: bId,
    appId: 'gastro_smart',
    creadoEn: new Date().toISOString()
  });
  return newDoc.id;
}

// ======================= DAILY STATS SUBSCRIPTION =======================

export function subscribeToDailyStats(
  businessId: string,
  restaurantId: string | null,
  callback: (stats: DailyStat[]) => void
) {
  const colRef = collection(db, 'dailyStats');
  const q = restaurantId
    ? query(
        colRef,
        where('appId', '==', 'gastro_smart'),
        where('businessId', '==', businessId),
        where('restaurantId', '==', restaurantId)
      )
    : query(
        colRef,
        where('appId', '==', 'gastro_smart'),
        where('businessId', '==', businessId)
      );

  return onSnapshot(q, (snapshot) => {
    const list: DailyStat[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as DailyStat));
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (dailyStats):', err);
  });
}

// ======================= STATS & SAFE CASCADE DELETION =======================

export interface OperationalStatsSummary {
  ordersCount: number;
  clientsCount: number;
  expensesCount: number;
  shiftsCount: number;
  cashClosesCount: number;
}

export interface FullRestaurantStatsSummary extends OperationalStatsSummary {
  tablesCount: number;
  employeesCount: number;
  menuItemsCount: number;
}

export async function getRestaurantOperationalCounts(restaurantId: string, businessId?: string): Promise<OperationalStatsSummary> {
  let targetBizId = businessId;
  if (!targetBizId) {
    try {
      const restDoc = await getDoc(doc(db, 'restaurants', restaurantId));
      if (restDoc.exists()) {
        targetBizId = restDoc.data().businessId;
      }
    } catch (e) {
      console.warn('Could not fetch restaurant businessId for counts:', e);
    }
  }

  const clientsQuery = targetBizId
    ? query(collection(db, 'clients'), where('appId', '==', 'gastro_smart'), where('businessId', '==', targetBizId))
    : query(collection(db, 'clients'), where('appId', '==', 'gastro_smart'));

  const [ordersSnap, clientsSnap, expensesSnap, shiftsSnap, cashSnap] = await Promise.all([
    getDocs(query(collection(db, 'orders'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId))),
    getDocs(clientsQuery),
    getDocs(query(collection(db, 'expenses'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'shifts'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'cashRegisterCloses'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId)))
  ]);

  return {
    ordersCount: ordersSnap.size,
    clientsCount: clientsSnap.size,
    expensesCount: expensesSnap.size,
    shiftsCount: shiftsSnap.size,
    cashClosesCount: cashSnap.size
  };
}

export async function getRestaurantFullCounts(restaurantId: string, businessId?: string): Promise<FullRestaurantStatsSummary> {
  const [opCounts, tablesSnap, employeesSnap, menuSnap] = await Promise.all([
    getRestaurantOperationalCounts(restaurantId, businessId),
    getDocs(query(collection(db, 'tables'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'employees'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'menuItems'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId)))
  ]);

  return {
    ...opCounts,
    tablesCount: tablesSnap.size,
    employeesCount: employeesSnap.size,
    menuItemsCount: menuSnap.size
  };
}

export async function resetOperationalData(restaurantId: string): Promise<void> {
  const [ordersSnap, expensesSnap, shiftsSnap, cashSnap, tablesSnap] = await Promise.all([
    getDocs(query(collection(db, 'orders'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'expenses'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'shifts'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'cashRegisterCloses'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'tables'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId)))
  ]);

  const batch = writeBatch(db);
  ordersSnap.docs.forEach(d => batch.delete(d.ref));
  expensesSnap.docs.forEach(d => batch.delete(d.ref));
  shiftsSnap.docs.forEach(d => batch.delete(d.ref));
  cashSnap.docs.forEach(d => batch.delete(d.ref));
  tablesSnap.docs.forEach(d => batch.update(d.ref, { estado: 'libre' }));
  await batch.commit();
}

/**
 * ELIMINACIÓN EN CASCADA DE SUCURSAL:
 * CRÍTICO - REGLA DE SEGURIDAD INDEPENDIENTE:
 * El documento del usuario en la colección "users" con rol "owner"/"admin" NUNCA se elimina
 * ni modifica al borrar sucursales. El borrado en cascada solo toca:
 * tables, employees, menuItems, orders, shifts, expenses, cashRegisterCloses — NUNCA users.
 */
export async function deleteRestaurantCascade(restaurantId: string): Promise<void> {
  const [
    ordersSnap,
    expensesSnap,
    shiftsSnap,
    cashSnap,
    tablesSnap,
    employeesSnap,
    menuSnap
  ] = await Promise.all([
    getDocs(query(collection(db, 'orders'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'expenses'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'shifts'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'cashRegisterCloses'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'tables'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'employees'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'menuItems'), where('appId', '==', 'gastro_smart'), where('restaurantId', '==', restaurantId)))
  ]);

  const batch = writeBatch(db);

  ordersSnap.docs.forEach(d => batch.delete(d.ref));
  expensesSnap.docs.forEach(d => batch.delete(d.ref));
  shiftsSnap.docs.forEach(d => batch.delete(d.ref));
  cashSnap.docs.forEach(d => batch.delete(d.ref));
  tablesSnap.docs.forEach(d => batch.delete(d.ref));
  employeesSnap.docs.forEach(d => batch.delete(d.ref));
  menuSnap.docs.forEach(d => batch.delete(d.ref));

  // Borrar el restaurante
  batch.delete(doc(db, 'restaurants', restaurantId));

  await batch.commit();
}

/**
 * ELIMINACIÓN EN CASCADA DE NEGOCIO (MULTI-TENANT):
 * Borra todo el tenant businessId (sucursales, mesas, empleados, cartas, pedidos, gastos, alertas).
 * Otros negocios y cuentas permanecen intactos.
 */
export async function deleteBusinessCascade(businessId: string): Promise<void> {
  const collections = [
    'restaurants',
    'employees',
    'tables',
    'menuItems',
    'orders',
    'clients',
    'shifts',
    'expenses',
    'cashRegisterCloses',
    'loginAttempts',
    'securityAlerts'
  ];

  for (const colName of collections) {
    const snap = await getDocs(query(collection(db, colName), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId)));
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  // Eliminar el documento del negocio
  await deleteDoc(doc(db, 'businesses', businessId));
}

export const deleteAllAccountData = deleteBusinessCascade;

// ======================= SEED SAMPLE DISHES & DEMO =======================

export async function seedSampleDishesForBusiness(businessId: string, restaurantId: string) {
  const sampleItems: (Omit<MenuItem, 'id'> & { appId: string })[] = [
    {
      businessId,
      restaurantId,
      nombre: 'Hamburguesa Gourmet Angus',
      descripcion: '200g de carne Angus, queso cheddar fundido, tocino crujiente, cebolla caramelizada en pan brioche.',
      precio: 14.50,
      categoria: 'Hamburguesas',
      disponible: true,
      appId: 'gastro_smart',
      imagenUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=60'
    },
    {
      businessId,
      restaurantId,
      nombre: 'Pizza Margherita Di Bufala',
      descripcion: 'Masa madre tradicional, salsa pomodoro italiana, mozzarella di bufala fresca y albahaca.',
      precio: 16.00,
      categoria: 'Pizzas',
      disponible: true,
      appId: 'gastro_smart',
      imagenUrl: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=500&auto=format&fit=crop&q=60'
    },
    {
      businessId,
      restaurantId,
      nombre: 'Lomo Saltado Clásico',
      descripcion: 'Lomo fino al wok con cebolla morada, tomates frescos, ají amarillo y papas rústicas doradas.',
      precio: 18.50,
      categoria: 'Platos Fuertes',
      disponible: true,
      appId: 'gastro_smart',
      imagenUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=60'
    },
    {
      businessId,
      restaurantId,
      nombre: 'Papas Rústicas Trufadas',
      descripcion: 'Papas cortadas a mano con aceite de trufa blanca, parmesano rallado y dip de ajo asado.',
      precio: 7.50,
      categoria: 'Entradas',
      disponible: true,
      appId: 'gastro_smart',
      imagenUrl: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500&auto=format&fit=crop&q=60'
    },
    {
      businessId,
      restaurantId,
      nombre: 'Limonada de Hierbabuena Frozen',
      descripcion: 'Limones verdes recién exprimidos, hojas de hierbabuena fresca y toque de jengibre.',
      precio: 4.50,
      categoria: 'Bebidas',
      disponible: true,
      appId: 'gastro_smart',
      imagenUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=60'
    },
    {
      businessId,
      restaurantId,
      nombre: 'Tiramisú Tradicional',
      descripcion: 'Bizcochos bañados en espresso italiano, capas de queso mascarpone y cacao amargo.',
      precio: 6.50,
      categoria: 'Postres',
      disponible: true,
      appId: 'gastro_smart',
      imagenUrl: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=500&auto=format&fit=crop&q=60'
    }
  ];

  const batch = writeBatch(db);
  for (const item of sampleItems) {
    const itemRef = doc(collection(db, 'menuItems'));
    batch.set(itemRef, item);
  }
  await batch.commit();
}

/**
 * Bootstrap completo para un negocio recién registrado:
 * 1. Crea la sucursal / sede principal con mesas
 * 2. Registra la plantilla inicial de empleados operativos con PINs y restaurante asignado
 * 3. Siembra la carta inicial de platos y bebidas
 */
export async function bootstrapNewBusinessDefaults(businessId: string, businessName: string): Promise<{ restaurantId: string }> {
  // 1. Crear sucursal principal
  const restRef = await addDoc(collection(db, 'restaurants'), {
    businessId,
    nombre: `${businessName.trim()} - Sede Principal`,
    direccion: 'Av. Principal #100',
    telefono: '+1 (555) 000-0000',
    numeroMesas: 12,
    activo: true,
    appId: 'gastro_smart',
    creadoEn: new Date().toISOString()
  });

  const restaurantId = restRef.id;

  // 2. Generar 12 mesas en estado libre
  const tableBatch = writeBatch(db);
  for (let i = 1; i <= 12; i++) {
    const tableRef = doc(collection(db, 'tables'));
    tableBatch.set(tableRef, {
      businessId,
      restaurantId,
      numero: i,
      capacidad: i % 3 === 0 ? 6 : 4,
      estado: 'libre',
      ubicacion: i <= 6 ? 'Salón Principal' : 'Terraza',
      appId: 'gastro_smart',
      creadoEn: new Date().toISOString()
    });
  }
  await tableBatch.commit();

  // 3. Crear plantilla inicial de empleados vinculados a este restaurante y negocio
  const defaultEmployees = [
    {
      businessId,
      restaurantId,
      nombre: 'Mesero Turno',
      puesto: 'mesero' as const,
      pin: '1234',
      tarifaHora: 12.0,
      activo: true,
      appId: 'gastro_smart',
      creadoEn: new Date().toISOString()
    },
    {
      businessId,
      restaurantId,
      nombre: 'Cajero General',
      puesto: 'caja' as const,
      pin: '1111',
      tarifaHora: 14.0,
      activo: true,
      appId: 'gastro_smart',
      creadoEn: new Date().toISOString()
    },
    {
      businessId,
      restaurantId,
      nombre: 'Chef de Cocina',
      puesto: 'cocina' as const,
      pin: '2222',
      tarifaHora: 16.0,
      activo: true,
      appId: 'gastro_smart',
      creadoEn: new Date().toISOString()
    },
    {
      businessId,
      restaurantId,
      nombre: 'Encargado de Turno',
      puesto: 'admin' as const,
      pin: '4321',
      tarifaHora: 18.0,
      activo: true,
      appId: 'gastro_smart',
      creadoEn: new Date().toISOString()
    }
  ];

  const empBatch = writeBatch(db);
  for (const emp of defaultEmployees) {
    const empRef = doc(collection(db, 'employees'));
    empBatch.set(empRef, emp);
  }
  await empBatch.commit();

  // 4. Sembrar menú de platos inicial
  try {
    await seedSampleDishesForBusiness(businessId, restaurantId);
  } catch (err) {
    console.warn('Error seeding sample dishes for new business:', err);
  }

  return { restaurantId };
}

/**
 * Diagnóstico de datos para Owner/Admin:
 * Compara los pedidos en estado "cobrado" vs los documentos de dailyStats del periodo filtrado.
 */
/**
 * Diagnóstico exhaustivo de integridad financiera:
 * Compara los pedidos cobrados y los gastos registrados (hoy y periodo)
 * contra los documentos consolidados en dailyStats, identificando discrepancias de ventas y gastos.
 */
export async function diagnoseDailyStats(
  businessId: string,
  restaurantId: string | null,
  dates: string[],
  timeZone?: string
): Promise<{
  cobradoOrdersCount: number;
  cobradoOrdersTotal: number;
  expensesCount: number;
  expensesTotal: number;
  expensesByTipo: Record<string, number>;
  dailyStatsCount: number;
  dailyStatsTotalSales: number;
  dailyStatsTotalExpenses: number;
  todayOrdersCount: number;
  todayOrdersTotal: number;
  todayExpensesCount: number;
  todayExpensesTotal: number;
  todayDailyStatsSales: number;
  todayDailyStatsExpenses: number;
  todayDailyStatsOrders: number;
  diffSalesToday: number;
  diffExpensesToday: number;
  mismatch: boolean;
  statusIndicator: 'activas' | 'con error';
}> {
  try {
    const todayStr = getRestaurantLocalDateString(new Date(), timeZone);
    const filterDates = dates.length > 0 ? dates : [todayStr];

    // 1. Consultar orders
    const qOrders = query(
      collection(db, 'orders'),
      where('appId', '==', 'gastro_smart'),
      where('businessId', '==', businessId)
    );
    const orderSnap = await getDocs(qOrders);
    
    let cobradoOrdersCount = 0;
    let cobradoOrdersTotal = 0;
    let todayOrdersCount = 0;
    let todayOrdersTotal = 0;
    
    orderSnap.docs.forEach(d => {
      const o = d.data() as Order;
      if (restaurantId && o.restaurantId !== restaurantId) return;
      if (o.estado !== 'cobrado') return;
      const orderDate = (o.cobradoEn || o.creadoEn || '').split('T')[0];
      const tot = o.total || 0;

      if (filterDates.includes(orderDate)) {
        cobradoOrdersCount++;
        cobradoOrdersTotal += tot;
      }
      if (orderDate === todayStr) {
        todayOrdersCount++;
        todayOrdersTotal += tot;
      }
    });

    // 2. Consultar expenses
    const qExpenses = query(
      collection(db, 'expenses'),
      where('appId', '==', 'gastro_smart'),
      where('businessId', '==', businessId)
    );
    const expSnap = await getDocs(qExpenses);

    let expensesCount = 0;
    let expensesTotal = 0;
    let todayExpensesCount = 0;
    let todayExpensesTotal = 0;
    const expensesByTipo: Record<string, number> = {
      sueldos: 0,
      viveres: 0,
      transporte: 0,
      servicios: 0,
      mantenimiento: 0,
      otros: 0
    };

    expSnap.docs.forEach(d => {
      const e = d.data() as Expense;
      if (restaurantId && e.restaurantId !== restaurantId) return;
      const expDate = (e.fecha || e.creadoEn || '').split('T')[0];
      const m = e.monto || 0;

      if (filterDates.includes(expDate)) {
        expensesCount++;
        expensesTotal += m;
        const tipo = e.tipo;
        if (tipo === 'sueldo') expensesByTipo.sueldos += m;
        else if (tipo === 'viveres' || tipo === 'insumos') expensesByTipo.viveres += m;
        else if (tipo === 'transporte') expensesByTipo.transporte += m;
        else if (tipo === 'servicios') expensesByTipo.servicios += m;
        else if (tipo === 'mantenimiento') expensesByTipo.mantenimiento += m;
        else expensesByTipo.otros += m;
      }

      if (expDate === todayStr) {
        todayExpensesCount++;
        todayExpensesTotal += m;
      }
    });

    // 3. Consultar dailyStats
    const qStats = query(
      collection(db, 'dailyStats'),
      where('appId', '==', 'gastro_smart'),
      where('businessId', '==', businessId)
    );
    const statsSnap = await getDocs(qStats);
    
    let dailyStatsCount = 0;
    let dailyStatsTotalSales = 0;
    let dailyStatsTotalExpenses = 0;
    let todayDailyStatsSales = 0;
    let todayDailyStatsExpenses = 0;
    let todayDailyStatsOrders = 0;

    statsSnap.docs.forEach(d => {
      const st = d.data() as DailyStat;
      if (restaurantId && st.restaurantId !== restaurantId) return;

      if (filterDates.includes(st.fecha)) {
        dailyStatsCount++;
        dailyStatsTotalSales += (st.ventasTotales || 0);
        dailyStatsTotalExpenses += (st.gastosTotales || 0);
      }

      if (st.fecha === todayStr) {
        todayDailyStatsSales += (st.ventasTotales || 0);
        todayDailyStatsExpenses += (st.gastosTotales || 0);
        todayDailyStatsOrders += (st.pedidosCobrados || 0);
      }
    });

    cobradoOrdersTotal = Math.round(cobradoOrdersTotal * 100) / 100;
    expensesTotal = Math.round(expensesTotal * 100) / 100;
    dailyStatsTotalSales = Math.round(dailyStatsTotalSales * 100) / 100;
    dailyStatsTotalExpenses = Math.round(dailyStatsTotalExpenses * 100) / 100;

    todayOrdersTotal = Math.round(todayOrdersTotal * 100) / 100;
    todayExpensesTotal = Math.round(todayExpensesTotal * 100) / 100;
    todayDailyStatsSales = Math.round(todayDailyStatsSales * 100) / 100;
    todayDailyStatsExpenses = Math.round(todayDailyStatsExpenses * 100) / 100;

    const diffSales = Math.abs(cobradoOrdersTotal - dailyStatsTotalSales);
    const diffExpenses = Math.abs(expensesTotal - dailyStatsTotalExpenses);
    const diffSalesToday = Math.round(Math.abs(todayOrdersTotal - todayDailyStatsSales) * 100) / 100;
    const diffExpensesToday = Math.round(Math.abs(todayExpensesTotal - todayDailyStatsExpenses) * 100) / 100;

    const mismatchToday = diffSalesToday > 0.05 || diffExpensesToday > 0.05 || (todayOrdersCount > 0 && todayDailyStatsOrders === 0);
    const mismatch = (cobradoOrdersCount > 0 && dailyStatsCount === 0) || diffSales > 1 || diffExpenses > 1 || mismatchToday;
    const statusIndicator = mismatch ? 'con error' : 'activas';

    return {
      cobradoOrdersCount,
      cobradoOrdersTotal,
      expensesCount,
      expensesTotal,
      expensesByTipo,
      dailyStatsCount,
      dailyStatsTotalSales,
      dailyStatsTotalExpenses,
      todayOrdersCount,
      todayOrdersTotal,
      todayExpensesCount,
      todayExpensesTotal,
      todayDailyStatsSales,
      todayDailyStatsExpenses,
      todayDailyStatsOrders,
      diffSalesToday,
      diffExpensesToday,
      mismatch,
      statusIndicator
    };
  } catch (err) {
    console.error('Error diagnosing dailyStats:', err);
    return {
      cobradoOrdersCount: 0,
      cobradoOrdersTotal: 0,
      expensesCount: 0,
      expensesTotal: 0,
      expensesByTipo: {},
      dailyStatsCount: 0,
      dailyStatsTotalSales: 0,
      dailyStatsTotalExpenses: 0,
      todayOrdersCount: 0,
      todayOrdersTotal: 0,
      todayExpensesCount: 0,
      todayExpensesTotal: 0,
      todayDailyStatsSales: 0,
      todayDailyStatsExpenses: 0,
      todayDailyStatsOrders: 0,
      diffSalesToday: 0,
      diffExpensesToday: 0,
      mismatch: true,
      statusIndicator: 'con error'
    };
  }
}

/**
 * Recalcula y regenera determinísticamente las estadísticas del DÍA DE HOY (o fecha dada)
 * borrando cualquier estado corrupto y recalculando directamente desde las comandas cobradas y gastos.
 */
export async function recalculateTodayDailyStats(
  businessId: string,
  restaurantId: string | null,
  restaurants: Restaurant[],
  dateStr?: string,
  timeZone?: string
): Promise<{ recalculatedCount: number; targetDate: string }> {
  const targetDate = dateStr || getRestaurantLocalDateString(new Date(), timeZone);
  const targetRestIds = restaurantId ? [restaurantId] : restaurants.map(r => r.id);
  let recalculatedCount = 0;

  try {
    const [ordersSnap, expensesSnap, shiftsSnap] = await Promise.all([
      getDocs(query(collection(db, 'orders'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))),
      getDocs(query(collection(db, 'expenses'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))),
      getDocs(query(collection(db, 'shifts'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId)))
    ]);

    const allOrders: Order[] = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
    const allExpenses: Expense[] = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));
    const allShifts: Shift[] = shiftsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Shift));

    for (const restId of targetRestIds) {
      const computed = computeDailyStatFromRawData(
        businessId,
        restId,
        targetDate,
        allOrders,
        allExpenses,
        allShifts
      );

      const docId = getDailyStatDocId(businessId, restId, targetDate);
      const statRef = doc(db, 'dailyStats', docId);
      // Guardar limpio sin undefined y reemplazar para evitar inconsistencias residuales
      const sanitized = limpiarDatosUndefined(computed);
      await setDoc(statRef, sanitized, { merge: false });
      recalculatedCount++;
    }
  } catch (err) {
    console.error('Error in recalculateTodayDailyStats:', err);
    throw err;
  }

  return { recalculatedCount, targetDate };
}

/**
 * Recalcula estadísticas diarias para un periodo y repara órdenes huérfanas sin businessId
 */
export async function recalculateDailyStatsForPeriod(
  businessId: string,
  restaurantId: string | null,
  dates: string[],
  restaurants: Restaurant[]
): Promise<{ recalculatedCount: number; fixedOrdersCount: number }> {
  let fixedOrdersCount = 0;
  let recalculatedCount = 0;

  try {
    const targetRestIds = restaurantId 
      ? [restaurantId] 
      : restaurants.map(r => r.id);

    const ordersSnap = await getDocs(query(
      collection(db, 'orders'),
      where('appId', '==', 'gastro_smart')
    ));

    const allOrders: Order[] = [];
    for (const docSnap of ordersSnap.docs) {
      const ord = { id: docSnap.id, ...docSnap.data() } as Order;
      if (targetRestIds.includes(ord.restaurantId)) {
        if (!ord.businessId || (ord.businessId === 'biz_default' && businessId !== 'biz_default')) {
          await updateDoc(docSnap.ref, { businessId });
          ord.businessId = businessId;
          fixedOrdersCount++;
        }
      }
      allOrders.push(ord);
    }

    const expensesSnap = await getDocs(query(
      collection(db, 'expenses'),
      where('appId', '==', 'gastro_smart')
    ));
    const allExpenses: Expense[] = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Expense));

    const shiftsSnap = await getDocs(query(
      collection(db, 'shifts'),
      where('appId', '==', 'gastro_smart')
    ));
    const allShifts: Shift[] = shiftsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Shift));

    for (const date of dates) {
      for (const restId of targetRestIds) {
        const computed = computeDailyStatFromRawData(
          businessId,
          restId,
          date,
          allOrders,
          allExpenses,
          allShifts
        );

        const docId = getDailyStatDocId(businessId, restId, date);
        const statRef = doc(db, 'dailyStats', docId);
        const sanitized = limpiarDatosUndefined(computed);
        await setDoc(statRef, sanitized, { merge: true });
        recalculatedCount++;
      }
    }
  } catch (err) {
    console.error('Error recalculating daily stats:', err);
  }

  return { recalculatedCount, fixedOrdersCount };
}

/**
 * Marca pedidos de delivery como pagados / conciliados y registra ajustes contables
 */
export async function markOrdersDeliveryPaid(
  orderIds: string[],
  payoutInfo: {
    businessId: string;
    restaurantId: string;
    fecha: string;
    empresa: string;
    montoCalculado: number;
    montoReal: number;
    usuario: string;
    notas?: string;
  }
): Promise<void> {
  const payoutId = `payout_${Date.now()}`;
  
  // 1. Actualizar comandas
  for (const orderId of orderIds) {
    const ordRef = doc(db, 'orders', orderId);
    await updateDoc(ordRef, {
      deliveryPaid: true,
      deliveryPaidDate: payoutInfo.fecha,
      deliveryPayoutId: payoutId
    });
  }

  // 2. Si hay diferencia entre monto real y teórico, registrar ajuste en gastos
  const diff = Math.round((payoutInfo.montoReal - payoutInfo.montoCalculado) * 100) / 100;
  if (Math.abs(diff) >= 0.01) {
    await addDoc(collection(db, 'expenses'), {
      businessId: payoutInfo.businessId,
      restaurantId: payoutInfo.restaurantId,
      tipo: 'otros',
      monto: Math.abs(diff),
      descripcion: `Ajuste liquidación delivery (${payoutInfo.empresa}): Teórico $${payoutInfo.montoCalculado.toFixed(2)} vs Recibido $${payoutInfo.montoReal.toFixed(2)} ${diff < 0 ? '(descuento plataforma)' : '(abono a favor)'}`,
      fecha: payoutInfo.fecha,
      appId: 'gastro_smart',
      creadoEn: new Date().toISOString()
    });
  }

  // 3. Auditoría / Security Alert
  await createSecurityAlert({
    businessId: payoutInfo.businessId,
    restaurantId: payoutInfo.restaurantId,
    tipo: 'pago_delivery_conciliado',
    severidad: 'baja',
    mensaje: `Conciliación delivery: Depósito de ${payoutInfo.empresa} confirmado por $${payoutInfo.montoReal.toFixed(2)} (${orderIds.length} comandas). Responsable: ${payoutInfo.usuario}`,
    origen: 'Delivery Reconciliation',
    resuelta: true,
    fecha: new Date().toISOString(),
    leido: true
  });
}

/**
 * Pago masivo de nóminas / sueldos y generación de gastos automáticos
 */
export async function paySalaryBatch(
  businessId: string,
  restaurantId: string,
  shifts: Shift[],
  employeeRateMap: Record<string, number>,
  periodLabel: string,
  userName: string,
  overtimeMultiplier = 1.5
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  // Agrupar turnos por empleado
  const shiftsByEmployee: Record<string, Shift[]> = {};
  shifts.forEach(s => {
    if (!shiftsByEmployee[s.employeeId]) {
      shiftsByEmployee[s.employeeId] = [];
    }
    shiftsByEmployee[s.employeeId].push(s);
  });

  let totalPaidOverall = 0;

  for (const [employeeId, empShifts] of Object.entries(shiftsByEmployee)) {
    const rate = employeeRateMap[employeeId] || 12;
    let normalHours = 0;
    let overtimeHours = 0;
    const employeeName = empShifts[0]?.employeeName || 'Empleado';

    empShifts.forEach(shift => {
      const h = (shift.minutosTrabajados || 0) / 60;
      normalHours += Math.min(8, h);
      overtimeHours += Math.max(0, h - 8);
    });

    const totalPay = Math.round((normalHours * rate + overtimeHours * rate * overtimeMultiplier) * 100) / 100;
    totalPaidOverall += totalPay;

    // 1. Crear gasto de sueldo
    await addDoc(collection(db, 'expenses'), {
      businessId,
      restaurantId: empShifts[0]?.restaurantId || restaurantId,
      tipo: 'sueldo',
      monto: totalPay,
      descripcion: `Pago de sueldo ${periodLabel} - ${employeeName} (${normalHours.toFixed(1)}h norm + ${overtimeHours.toFixed(1)}h ext a $${rate}/h)`,
      employeeId,
      employeeName,
      horasTrabajadas: Math.round((normalHours + overtimeHours) * 10) / 10,
      horasExtra: Math.round(overtimeHours * 10) / 10,
      tarifaHora: rate,
      fecha: today,
      appId: 'gastro_smart',
      creadoEn: now
    });

    // 2. Marcar cada shift como pagado
    for (const shift of empShifts) {
      const shiftRef = doc(db, 'shifts', shift.id);
      const shiftHours = (shift.minutosTrabajados || 0) / 60;
      const shiftNorm = Math.min(8, shiftHours);
      const shiftExt = Math.max(0, shiftHours - 8);
      const shiftPay = Math.round((shiftNorm * rate + shiftExt * rate * overtimeMultiplier) * 100) / 100;

      await updateDoc(shiftRef, {
        pagado: true,
        fechaPago: now,
        montoPagadoSueldo: shiftPay
      });
    }
  }

  // 3. Auditoría
  await createSecurityAlert({
    businessId,
    restaurantId,
    tipo: 'pago_sueldos_generado',
    severidad: 'media',
    mensaje: `Liquidación de planilla ${periodLabel}: $${totalPaidOverall.toFixed(2)} generados en gastos para ${Object.keys(shiftsByEmployee).length} empleados por ${userName}.`,
    origen: 'Staff Attendance / Payroll',
    resuelta: true,
    fecha: new Date().toISOString(),
    leido: true
  });
}
