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
  writeBatch
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
  OrderItem,
  OrderTimelineEvent,
  CashRegisterClose,
  Expense,
  LoginAttempt,
  SecurityAlert
} from '../types';

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
    ? query(colRef, where('businessId', '==', businessId))
    : query(colRef);

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
    creadoEn: new Date().toISOString()
  });
}

export async function createRestaurantWithTables(
  data: { businessId?: string; nombre: string; direccion: string; telefono: string; numeroMesas: number },
  businessIdParam?: string
): Promise<string> {
  const targetBizId = data.businessId || businessIdParam || 'biz_default';
  const restRef = await addDoc(collection(db, 'restaurants'), {
    businessId: targetBizId,
    nombre: data.nombre.trim(),
    direccion: data.direccion.trim(),
    telefono: data.telefono.trim(),
    numeroMesas: data.numeroMesas,
    activo: true,
    creadoEn: new Date().toISOString()
  });

  const restaurantId = restRef.id;

  // Generar mesas del 1 al N en estado "libre"
  const batch = writeBatch(db);
  for (let i = 1; i <= data.numeroMesas; i++) {
    const tableRef = doc(collection(db, 'tables'));
    batch.set(tableRef, {
      businessId: targetBizId,
      restaurantId,
      numero: i,
      estado: 'libre',
      capacidad: i <= 4 ? 2 : (i <= 8 ? 4 : 6)
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

  const tablesSnap = await getDocs(query(collection(db, 'tables'), where('restaurantId', '==', restaurantId)));
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
          capacidad: 4
        });
        existingNumbers.add(nextNumber);
        tablesCreated++;
      }
      nextNumber++;
    }

    await batch.commit();
    await updateDoc(doc(db, 'restaurants', restaurantId), { numeroMesas: newTableCount });
    return { success: true };
  } else {
    const activeOrdersSnap = await getDocs(query(collection(db, 'orders'), where('restaurantId', '==', restaurantId)));
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
    await batch.commit();
    await updateDoc(doc(db, 'restaurants', restaurantId), { numeroMesas: newTableCount });
    return { success: true };
  }
}

export async function renumberTables(restaurantId: string): Promise<void> {
  const tablesSnap = await getDocs(query(collection(db, 'tables'), where('restaurantId', '==', restaurantId)));
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
    ? query(colRef, where('businessId', '==', businessId))
    : query(colRef);

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
    ? query(colRef, where('businessId', '==', businessId), limit(80))
    : query(colRef, limit(80));

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
    pagado: false
  });
  return shiftDoc.id;
}

export async function closeShift(shiftId: string, reporteLabores?: string): Promise<void> {
  const shiftRef = doc(db, 'shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) return;

  const data = snap.data() as Shift;
  const horaFin = new Date().toISOString();
  const start = new Date(data.horaInicio).getTime();
  const end = new Date(horaFin).getTime();
  const minutesWorked = Math.max(1, Math.round((end - start) / (1000 * 60)));

  await updateDoc(shiftRef, {
    estado: 'cerrado',
    horaFin,
    minutosTrabajados: minutesWorked,
    reporteLabores: reporteLabores?.trim() || null
  });
}

export async function payShiftSalary(shift: Shift, employee: Employee): Promise<{ expenseId: string; amount: number }> {
  const hoursWorked = Math.max(0.1, (shift.minutosTrabajados || 0) / 60);
  const baseSalary = hoursWorked * (employee.tarifaHora || 10);
  const totalPay = Math.round(baseSalary * 100) / 100;

  const expenseRef = await addDoc(collection(db, 'expenses'), {
    businessId: shift.businessId || employee.businessId || 'biz_default',
    restaurantId: shift.restaurantId,
    tipo: 'sueldo',
    monto: totalPay,
    descripcion: `Pago de sueldo por turno a ${employee.nombre} (${hoursWorked.toFixed(1)}h a $${employee.tarifaHora}/h)`,
    employeeId: employee.id,
    employeeName: employee.nombre,
    shiftId: shift.id,
    horasTrabajadas: Math.round(hoursWorked * 10) / 10,
    tarifaHora: employee.tarifaHora,
    fecha: new Date().toISOString().split('T')[0],
    creadoEn: new Date().toISOString()
  });

  await updateDoc(doc(db, 'shifts', shift.id), {
    pagado: true,
    montoPagadoSueldo: totalPay,
    fechaPago: new Date().toISOString()
  });

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
    ? query(colRef, where('businessId', '==', businessId))
    : query(colRef);

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
  return addDoc(collection(db, 'menuItems'), data);
}

export async function setMenuItem(id: string, data: Omit<MenuItem, 'id'>) {
  return setDoc(doc(db, 'menuItems', id), data);
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
    ? query(colRef, where('businessId', '==', businessId), limit(80))
    : query(colRef, limit(80));

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

  const sanitizedData: any = {
    ...data,
    businessId: data.businessId || 'biz_default',
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

  const orderRef = await addDoc(collection(db, 'orders'), sanitizedData);

  if (data.tipo === 'local' && data.mesaId) {
    await updateTableStatus(data.mesaId, 'ocupada');
  }

  // Incrementar pedidos tomados en el turno del mesero
  try {
    const shiftSnap = await getDocs(query(
      collection(db, 'shifts'),
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

  return orderRef.id;
}

export async function appendItemsToExistingOrder(
  orderId: string, 
  newItems: OrderItem[], 
  newSubtotal: number, 
  newTotal: number, 
  timelineEvent?: OrderTimelineEvent
): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  const snap = await getDoc(orderRef);
  if (!snap.exists()) return;

  const currentOrder = snap.data() as Order;
  const mergedItems = [...(currentOrder.items || []), ...newItems];
  const mergedTimeline = [...(currentOrder.timeline || [])];
  if (timelineEvent) {
    mergedTimeline.push(timelineEvent);
  }

  await updateDoc(orderRef, {
    items: mergedItems,
    subtotal: newSubtotal,
    total: newTotal,
    timeline: mergedTimeline,
    estado: 'pendiente_cocina' // Notifica a cocina de nueva comanda / ampliación
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

  if (newStatus === 'aceptado') updatePayload.aceptadoEn = now;
  if (newStatus === 'listo') updatePayload.listoEn = now;
  if (newStatus === 'entregado') updatePayload.entregadoEn = now;

  if (newStatus === 'rechazado' && options?.motivoRechazo) {
    updatePayload.motivoRechazo = options.motivoRechazo;
    if (orderData.mesaId) {
      await updateTableStatus(orderData.mesaId, 'libre');
    }
  }

  if (newStatus === 'cobrado') {
    updatePayload.cobradoEn = now;
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
  }

  return updateDoc(orderRef, updatePayload);
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
    ? query(colRef, where('businessId', '==', businessId))
    : query(colRef);

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
    const snap = await getDocs(query(collection(db, 'clients'), where('telefono', '==', data.telefono)));
    if (!snap.empty) {
      const clientDoc = snap.docs[0];
      await updateDoc(clientDoc.ref, data);
      return clientDoc.id;
    }
  }
  const ref = await addDoc(collection(db, 'clients'), {
    ...data,
    businessId: data.businessId || 'biz_default',
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
    ? query(colRef, where('businessId', '==', businessId), limit(50))
    : query(colRef, limit(50));

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
    ? query(colRef, where('businessId', '==', businessId), limit(100))
    : query(colRef, limit(100));

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
  return addDoc(collection(db, 'expenses'), {
    ...data,
    businessId: data.businessId || 'biz_default',
    creadoEn: new Date().toISOString()
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

export async function getRestaurantOperationalCounts(restaurantId: string): Promise<OperationalStatsSummary> {
  const [ordersSnap, clientsSnap, expensesSnap, shiftsSnap, cashSnap] = await Promise.all([
    getDocs(query(collection(db, 'orders'), where('restaurantId', '==', restaurantId))),
    getDocs(collection(db, 'clients')),
    getDocs(query(collection(db, 'expenses'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'shifts'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'cashRegisterCloses'), where('restaurantId', '==', restaurantId)))
  ]);

  return {
    ordersCount: ordersSnap.size,
    clientsCount: clientsSnap.size,
    expensesCount: expensesSnap.size,
    shiftsCount: shiftsSnap.size,
    cashClosesCount: cashSnap.size
  };
}

export async function getRestaurantFullCounts(restaurantId: string): Promise<FullRestaurantStatsSummary> {
  const [opCounts, tablesSnap, employeesSnap, menuSnap] = await Promise.all([
    getRestaurantOperationalCounts(restaurantId),
    getDocs(query(collection(db, 'tables'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'employees'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'menuItems'), where('restaurantId', '==', restaurantId)))
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
    getDocs(query(collection(db, 'orders'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'expenses'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'shifts'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'cashRegisterCloses'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'tables'), where('restaurantId', '==', restaurantId)))
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
    getDocs(query(collection(db, 'orders'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'expenses'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'shifts'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'cashRegisterCloses'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'tables'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'employees'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'menuItems'), where('restaurantId', '==', restaurantId)))
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
    const snap = await getDocs(query(collection(db, colName), where('businessId', '==', businessId)));
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
  const sampleItems: Omit<MenuItem, 'id'>[] = [
    {
      businessId,
      restaurantId,
      nombre: 'Hamburguesa Gourmet Angus',
      descripcion: '200g de carne Angus, queso cheddar fundido, tocino crujiente, cebolla caramelizada en pan brioche.',
      precio: 14.50,
      categoria: 'Hamburguesas',
      disponible: true,
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
