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
  deleteField,
  serverTimestamp,
  orderBy,
  limit,
  writeBatch,
  runTransaction
} from 'firebase/firestore';

export { deleteField };
import { db } from '../firebase';
import { UNIQUE_BUSINESS_ID } from '../config/business';
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
  Role,
  OrderStatus, 
  OrderRoute,
  OrderItem,
  ItemStatus,
  OrderRound,
  OrderDiner,
  PartialPayment,
  OrderTimelineEvent,
  CashRegisterClose,
  Expense,
  LoginAttempt,
  SecurityAlert,
  DailyStat,
  Supplier,
  PaymentMethod,
  MenuAuditLog,
  MenuAuditActionType,
  MenuAuditLogChange,
  DeliveryCompanyConfig,
  InventoryItem,
  DishIngredient,
  DeductedSupplyRecord,
  Reservation,
  ReservationStatus
} from '../types';
import {
  calculateTaxBreakdown,
  calculateLoyaltyPointsForAmount,
  setGlobalBusinessTaxConfig,
  getGlobalBusinessTaxConfig
} from '../utils/taxCalculator';
import { 
  getDailyStatDocId, 
  formatDateKey, 
  computeDailyStatFromRawData, 
  getRestaurantLocalDateString,
  getOperationalDateString,
  getOperationalMonthString
} from './financialService';

export { getOperationalDateString, getOperationalMonthString };
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
      const biz = { id: snapshot.id, ...snapshot.data() } as Business;
      setGlobalBusinessTaxConfig(biz);
      callback(biz);
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

export async function getOrCreateSingleBusiness(businessId: string, defaultName?: string): Promise<Business> {
  try {
    const biz = await getBusiness(businessId);
    if (biz && biz.nombre) {
      return biz;
    }
  } catch {
    // Si no existe documento previo o permiso requiere creación con appId
  }
  const defaultData: Omit<Business, 'id'> = {
    nombre: defaultName || 'Mi Negocio',
    rif_o_ruc: 'J-00000000-0',
    plan: 'pro',
    activo: true,
    creadoEn: new Date().toISOString(),
    ownerUid: 'owner_' + businessId,
    email: 'admin@gastrosmart.com',
    appId: 'gastro_smart'
  };
  await createBusiness(defaultData, businessId);
  return { id: businessId, ...defaultData };
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

export async function findUserAccountByCredentials(email: string, pass: string): Promise<UserAccount | null> {
  const cleanEmail = email.trim().toLowerCase();
  
  try {
    // 1. Buscar en colección users
    const qUsers = query(
      collection(db, 'users'), 
      where('appId', '==', 'gastro_smart')
    );
    const snapUsers = await getDocs(qUsers);
    for (const docSnap of snapUsers.docs) {
      const data = docSnap.data() as UserAccount;
      if (data.email && data.email.toLowerCase() === cleanEmail && data.claveAsignada === pass) {
        return data;
      }
    }

    // 2. Buscar en colección businesses por ownerEmail / ownerClave
    const qBiz = query(
      collection(db, 'businesses'), 
      where('appId', '==', 'gastro_smart')
    );
    const snapBiz = await getDocs(qBiz);
    for (const docSnap of snapBiz.docs) {
      const biz = { id: docSnap.id, ...docSnap.data() } as Business;
      if (
        (biz.ownerEmail && biz.ownerEmail.toLowerCase() === cleanEmail && biz.ownerClave === pass) ||
        (biz.email && biz.email.toLowerCase() === cleanEmail && biz.ownerClave === pass)
      ) {
        return {
          uid: biz.ownerUid || ('owner_' + biz.id),
          email: biz.ownerEmail || biz.email || cleanEmail,
          nombre: biz.ownerNombre || 'Administrador (' + biz.nombre + ')',
          rol: 'owner',
          businessId: biz.id,
          restaurantId: null,
          appId: 'gastro_smart',
          creadoEn: biz.creadoEn || new Date().toISOString(),
          ultimoAcceso: new Date().toISOString(),
          claveAsignada: biz.ownerClave
        };
      }
    }
  } catch (err) {
    console.warn('Warning checking credentials in Firestore:', err);
  }

  return null;
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

export async function deleteSecurityAlert(alertId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'securityAlerts', alertId));
  } catch (err) {
    console.warn('Error eliminando alerta de seguridad:', err);
  }
}

export async function clearReadSecurityAlerts(businessId: string | null): Promise<number> {
  if (!businessId) return 0;
  try {
    const q = query(
      collection(db, 'securityAlerts'),
      where('appId', '==', 'gastro_smart'),
      where('businessId', '==', businessId),
      where('leido', '==', true)
    );
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
  } catch (err) {
    console.warn('Error limpiando alertas leídas:', err);
    return 0;
  }
}

export async function clearAllSecurityAlerts(businessId: string | null): Promise<number> {
  if (!businessId) return 0;
  try {
    const q = query(
      collection(db, 'securityAlerts'),
      where('appId', '==', 'gastro_smart'),
      where('businessId', '==', businessId)
    );
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
  } catch (err) {
    console.warn('Error eliminando todas las alertas:', err);
    return 0;
  }
}

// ======================= RESTAURANTS (SUCURSALES) =======================

export function generateUniqueBranchCode(existingCodes: Set<string>): string {
  for (let i = 0; i < 200; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!existingCodes.has(code)) {
      existingCodes.add(code);
      return code;
    }
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

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
    const usedCodes = new Set<string>();
    const rawList: Restaurant[] = snapshot.docs.map(d => {
      const data = { id: d.id, ...d.data() } as Restaurant;
      if (data.codigoSede && /^\d{4}$/.test(data.codigoSede.trim())) {
        usedCodes.add(data.codigoSede.trim());
      }
      return data;
    });

    const list: Restaurant[] = rawList.map(rest => {
      if (rest.codigoSede && /^\d{4}$/.test(rest.codigoSede.trim())) {
        return rest;
      }
      const generatedCode = generateUniqueBranchCode(usedCodes);
      // Persistir automáticamente para no romper restaurantes existentes sin codigoSede
      updateDoc(doc(db, 'restaurants', rest.id), { codigoSede: generatedCode }).catch(() => {});
      return {
        ...rest,
        codigoSede: generatedCode
      };
    });

    callback(list);
  }, (err) => {
    console.warn('Subscription warning (restaurants):', err);
  });
}

export async function createRestaurant(data: Omit<Restaurant, 'id'>, businessId?: string) {
  const targetBizId = businessId || data.businessId || UNIQUE_BUSINESS_ID;
  let finalCodigoSede = (data.codigoSede || '').trim();
  if (!/^\d{4}$/.test(finalCodigoSede)) {
    const existingCodes = new Set<string>();
    try {
      const snap = await getDocs(
        query(collection(db, 'restaurants'), where('appId', '==', 'gastro_smart'), where('businessId', '==', targetBizId))
      );
      snap.docs.forEach(d => {
        const c = (d.data().codigoSede || '').trim();
        if (/^\d{4}$/.test(c)) existingCodes.add(c);
      });
    } catch {
      // fallback
    }
    finalCodigoSede = generateUniqueBranchCode(existingCodes);
  }

  // Garantizar que el documento del negocio exista en la colección businesses para que sea visible en el Panel Creador
  await getOrCreateSingleBusiness(targetBizId, data.nombre);

  return addDoc(collection(db, 'restaurants'), {
    ...data,
    codigoSede: finalCodigoSede,
    usaCocina: data.usaCocina !== false,
    logoUrl: data.logoUrl || null,
    businessId: targetBizId,
    appId: 'gastro_smart',
    creadoEn: new Date().toISOString()
  });
}

export async function createRestaurantWithTables(
  data: { businessId?: string; nombre: string; direccion: string; telefono: string; codigoSede?: string; numeroMesas: number; usaCocina?: boolean; logoUrl?: string | null },
  businessIdParam?: string
): Promise<string> {
  const targetBizId = data.businessId || businessIdParam || UNIQUE_BUSINESS_ID;
  const restRef = doc(collection(db, 'restaurants'));
  const restaurantId = restRef.id;

  let finalCodigoSede = (data.codigoSede || '').trim();
  if (!/^\d{4}$/.test(finalCodigoSede)) {
    const existingCodes = new Set<string>();
    try {
      const snap = await getDocs(
        query(collection(db, 'restaurants'), where('appId', '==', 'gastro_smart'), where('businessId', '==', targetBizId))
      );
      snap.docs.forEach(d => {
        const c = (d.data().codigoSede || '').trim();
        if (/^\d{4}$/.test(c)) existingCodes.add(c);
      });
    } catch {
      // fallback
    }
    finalCodigoSede = generateUniqueBranchCode(existingCodes);
  }

  const batch = writeBatch(db);
  batch.set(restRef, {
    businessId: targetBizId,
    nombre: data.nombre.trim(),
    direccion: data.direccion.trim(),
    telefono: data.telefono.trim(),
    codigoSede: finalCodigoSede,
    numeroMesas: data.numeroMesas,
    usaCocina: data.usaCocina !== false,
    logoUrl: data.logoUrl || null,
    activo: true,
    appId: 'gastro_smart',
    creadoEn: new Date().toISOString()
  });

  // Garantizar que el documento del negocio exista en la colección businesses para que sea visible en el Panel Creador
  await getOrCreateSingleBusiness(targetBizId, data.nombre.trim());

  // Si se proporcionó logo y el negocio no tiene logo configurado, actualizarlo en el negocio
  if (data.logoUrl && targetBizId) {
    const bizRef = doc(db, 'businesses', targetBizId);
    batch.set(bizRef, { logoUrl: data.logoUrl, appId: 'gastro_smart' }, { merge: true });
  }

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

export const DEFAULT_DELIVERY_COMPANIES: DeliveryCompanyConfig[] = [
  { id: 'pedidosya', nombre: 'PedidosYa', comisionPorcentaje: 18, activo: true, color: 'red', tiempoPagoDias: 7 },
  { id: 'ubereats', nombre: 'UberEats', comisionPorcentaje: 20, activo: true, color: 'emerald', tiempoPagoDias: 7 },
  { id: 'rappi', nombre: 'Rappi', comisionPorcentaje: 22, activo: true, color: 'orange', tiempoPagoDias: 7 },
  { id: 'propio', nombre: 'Reparto Propio', comisionPorcentaje: 0, activo: true, color: 'blue', tiempoPagoDias: 1 },
];

export function getRestaurantDeliveryCompanies(restaurant?: Restaurant | null): DeliveryCompanyConfig[] {
  if (!restaurant) return DEFAULT_DELIVERY_COMPANIES;

  // Si ya tiene empresas configuradas
  if (restaurant.deliveryCompanies && restaurant.deliveryCompanies.length > 0) {
    return restaurant.deliveryCompanies;
  }

  // Compatibilidad con deliveryCommissions legacy si existía
  if (restaurant.deliveryCommissions) {
    return [
      { id: 'pedidosya', nombre: 'PedidosYa', comisionPorcentaje: restaurant.deliveryCommissions.pedidosYa ?? 18, activo: true, color: 'red', tiempoPagoDias: 7 },
      { id: 'ubereats', nombre: 'UberEats', comisionPorcentaje: restaurant.deliveryCommissions.uberEats ?? 20, activo: true, color: 'emerald', tiempoPagoDias: 7 },
      { id: 'rappi', nombre: 'Rappi', comisionPorcentaje: restaurant.deliveryCommissions.rappi ?? 22, activo: true, color: 'orange', tiempoPagoDias: 7 },
      { id: 'propio', nombre: 'Reparto Propio', comisionPorcentaje: 0, activo: true, color: 'blue', tiempoPagoDias: 1 },
    ];
  }

  return DEFAULT_DELIVERY_COMPANIES;
}

export async function updateRestaurantDeliveryCompanies(
  restaurantId: string,
  companies: DeliveryCompanyConfig[]
): Promise<void> {
  const commissionsMap: Record<string, number> = {};
  companies.forEach(c => {
    commissionsMap[c.id] = c.comisionPorcentaje;
    if (c.id === 'pedidosya') commissionsMap.pedidosYa = c.comisionPorcentaje;
    if (c.id === 'ubereats') commissionsMap.uberEats = c.comisionPorcentaje;
    if (c.id === 'rappi') commissionsMap.rappi = c.comisionPorcentaje;
  });

  await updateDoc(doc(db, 'restaurants', restaurantId), {
    deliveryCompanies: companies,
    deliveryCommissions: commissionsMap
  });
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
          businessId: businessId || currentTables[0]?.businessId || UNIQUE_BUSINESS_ID,
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
    where('estado', 'in', ['abierto', 'en_pausa']),
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
  arg3?: ((shifts: Shift[]) => void) | string | null
) {
  let businessId: string | null = null;
  let restaurantId: string | null = null;
  let callback: (shifts: Shift[]) => void = () => {};

  if (typeof arg1 === 'function') {
    callback = arg1;
    if (typeof arg2 === 'string') businessId = arg2;
  } else if (typeof arg2 === 'function') {
    restaurantId = arg1 || null;
    callback = arg2;
    if (typeof arg3 === 'string') businessId = arg3;
  } else {
    businessId = arg1 || null;
    restaurantId = arg2 || null;
    callback = typeof arg3 === 'function' ? arg3 : (() => {});
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
    where('estado', 'in', ['abierto', 'en_pausa']),
    limit(1)
  ));

  if (!activeSnap.empty) {
    return activeSnap.docs[0].id;
  }

  const today = new Date().toISOString().split('T')[0];
  const shiftDoc = await addDoc(collection(db, 'shifts'), {
    businessId: businessId || employee.businessId || UNIQUE_BUSINESS_ID,
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
  let minutesWorked = Math.max(1, Math.round((end - start) / (1000 * 60)));

  // Restar el tiempo de pausas
  if (shift.pausas && shift.pausas.length > 0) {
    let pauseMinutes = 0;
    shift.pausas.forEach(p => {
      if (p.fin) {
        pauseMinutes += Math.round((new Date(p.fin).getTime() - new Date(p.inicio).getTime()) / (1000 * 60));
      } else {
        // Pausa en curso
        pauseMinutes += Math.round((end - new Date(p.inicio).getTime()) / (1000 * 60));
      }
    });
    minutesWorked = Math.max(1, minutesWorked - pauseMinutes);
  }

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
  let minutesWorked = Math.max(1, Math.round((end - start) / (1000 * 60)));

  // Restar el tiempo de pausas
  if (data.pausas && data.pausas.length > 0) {
    let pauseMinutes = 0;
    data.pausas.forEach(p => {
      if (p.fin) {
        pauseMinutes += Math.round((new Date(p.fin).getTime() - new Date(p.inicio).getTime()) / (1000 * 60));
      } else {
        // Pausa en curso (cerrando el turno mientras estaba en pausa)
        pauseMinutes += Math.round((end - new Date(p.inicio).getTime()) / (1000 * 60));
      }
    });
    minutesWorked = Math.max(1, minutesWorked - pauseMinutes);
  }

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

export async function pauseShift(shiftId: string): Promise<void> {
  const shiftRef = doc(db, 'shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) {
    throw new Error('Turno no encontrado');
  }
  const data = snap.data() as Shift;
  if (data.estado !== 'abierto') {
    throw new Error('El turno no está abierto');
  }

  const pausas = data.pausas || [];
  pausas.push({
    inicio: new Date().toISOString()
  });

  await updateDoc(shiftRef, {
    estado: 'en_pausa',
    pausas
  });
}

export async function resumeShift(shiftId: string): Promise<void> {
  const shiftRef = doc(db, 'shifts', shiftId);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) {
    throw new Error('Turno no encontrado');
  }
  const data = snap.data() as Shift;
  if (data.estado !== 'en_pausa') {
    throw new Error('El turno no está en pausa');
  }

  const pausas = data.pausas || [];
  if (pausas.length > 0) {
    const lastPause = pausas[pausas.length - 1];
    if (!lastPause.fin) {
      lastPause.fin = new Date().toISOString();
      lastPause.minutos = Math.round((new Date(lastPause.fin).getTime() - new Date(lastPause.inicio).getTime()) / (1000 * 60));
    }
  }

  await updateDoc(shiftRef, {
    estado: 'abierto',
    pausas
  });
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

  const rawModalidad = employee.modalidadPago || employee.tipoSueldo || 'por_dia';
  if (rawModalidad === 'mes' || rawModalidad === 'fijo') {
    throw new Error('Este empleado tiene modalidad de Sueldo Mensual. Utilice la liquidación de planilla en la pestaña Asistencia & Planilla.');
  }

  // Validar que no se pague dos veces el mismo día operativo para el mismo empleado
  const shiftDate = getOperationalDateString(shiftData.horaInicio || shiftData.fecha);
  const qShifts = query(
    collection(db, 'shifts'),
    where('appId', '==', 'gastro_smart'),
    where('employeeId', '==', employee.id)
  );
  const existingShiftsSnap = await getDocs(qShifts);
  const alreadyPaidToday = existingShiftsSnap.docs.some(d => {
    const s = d.data() as Shift;
    const sDate = getOperationalDateString(s.horaInicio || s.fecha);
    return d.id !== shift.id && sDate === shiftDate && (s.pagado === true || s.sueldoPagado === true);
  });

  if (alreadyPaidToday) {
    throw new Error(`El empleado ${employee.nombre} ya tiene una jornada liquidada y pagada para el día operativo ${shiftDate}. Evitando pago diario duplicado.`);
  }

  const dailyRate = (employee.tarifaDiaria && employee.tarifaDiaria > 0)
    ? employee.tarifaDiaria
    : (employee.sueldoMensual && employee.sueldoMensual > 0)
      ? Math.round((employee.sueldoMensual / 30) * 100) / 100
      : (employee.tarifaHora && employee.tarifaHora > 0)
        ? Math.round(employee.tarifaHora * 8 * 100) / 100
        : 50;

  const totalPay = Math.round(dailyRate * 100) / 100;
  const descriptionDesc = `Pago de jornada laboral - ${employee.nombre} (Día trabajado ${shiftDate} • Sueldo diario $${dailyRate.toFixed(2)})`;
  const durationHours = shiftData.minutosTrabajados ? shiftData.minutosTrabajados / 60 : 8;
  const overtimeHours = 0;
  const rateUsed = dailyRate;
  const modalidad = 'por_dia';

  if (isNaN(totalPay) || totalPay <= 0) {
    throw new Error('El monto de sueldo calculado es inválido o igual a cero.');
  }

  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const targetBizId = shiftData.businessId || employee.businessId || UNIQUE_BUSINESS_ID;
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
  arg3?: ((items: MenuItem[]) => void) | string | null
) {
  let businessId: string | null = null;
  let restaurantId: string | null = null;
  let callback: (items: MenuItem[]) => void = () => {};

  if (typeof arg1 === 'function') {
    callback = arg1;
    if (typeof arg2 === 'string') businessId = arg2;
  } else if (typeof arg2 === 'function') {
    restaurantId = arg1 || null;
    callback = arg2;
    if (typeof arg3 === 'string') businessId = arg3;
  } else {
    businessId = arg1 || null;
    restaurantId = arg2 || null;
    callback = typeof arg3 === 'function' ? arg3 : (() => {});
  }

  const colRef = collection(db, 'menuItems');
  const q = businessId
    ? query(colRef, where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))
    : query(colRef, where('appId', '==', 'gastro_smart'));

  return onSnapshot(q, (snapshot) => {
    let list: MenuItem[] = snapshot.docs
      .map(d => ({
        id: d.id,
        ...d.data()
      } as MenuItem))
      .filter(m => m.eliminadoDeCarta !== true);
    if (restaurantId) {
      list = list.filter(m => !m.restaurantId || m.restaurantId === restaurantId || m.restaurantId === 'all');
    }
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (menuItems):', err);
  });
}

export function subscribeToArchivedMenuItems(
  businessId: string | null,
  callback: (items: MenuItem[]) => void
) {
  const colRef = collection(db, 'menuItems');
  const q = businessId
    ? query(colRef, where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))
    : query(colRef, where('appId', '==', 'gastro_smart'));

  return onSnapshot(q, (snapshot) => {
    const archived: MenuItem[] = snapshot.docs
      .map(d => ({
        id: d.id,
        ...d.data()
      } as MenuItem))
      .filter(m => m.eliminadoDeCarta === true);
    callback(archived);
  }, (err) => {
    console.warn('Subscription warning (archivedMenuItems):', err);
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

export async function setMenuItem(id: string, data: Omit<MenuItem, 'id'> | Record<string, any>) {
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      cleaned[key] = val;
    }
  }
  if (data.controlaStock === false) {
    delete cleaned.stockActual;
    delete cleaned.stockMinimo;
    delete cleaned.unidadMedida;
  }
  return setDoc(doc(db, 'menuItems', id), {
    ...cleaned,
    appId: 'gastro_smart'
  }, { merge: true });
}

export async function updateMenuItem(id: string, data: Partial<MenuItem> | Record<string, any>) {
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      cleaned[key] = val;
    }
  }
  // Si explícitamente se desactiva el control de stock y no se envió un nuevo valor numérico, eliminar campos de stock
  if (data.controlaStock === false && !('stockActual' in data)) {
    cleaned.stockActual = deleteField();
    cleaned.stockMinimo = deleteField();
    cleaned.unidadMedida = deleteField();
  }
  return updateDoc(doc(db, 'menuItems', id), cleaned);
}

export async function updateMenuItemStock(id: string, newStock: number, newMin?: number) {
  const safeStock = Math.max(0, Math.round(newStock * 100) / 100);
  const updatePayload: Partial<MenuItem> = {
    stockActual: safeStock,
    controlaStock: true
  };
  if (typeof newMin === 'number') {
    updatePayload.stockMinimo = Math.max(1, newMin);
  }
  if (safeStock <= 0) {
    updatePayload.disponible = false;
  } else {
    updatePayload.disponible = true;
  }
  return updateDoc(doc(db, 'menuItems', id), updatePayload);
}

export async function quickAdjustMenuItemStock(id: string, delta: number) {
  const itemRef = doc(db, 'menuItems', id);
  const snap = await getDoc(itemRef);
  if (!snap.exists()) return;
  const current = (snap.data().stockActual ?? 0) + delta;
  const safeStock = Math.max(0, Math.round(current * 100) / 100);
  const updatePayload: Partial<MenuItem> = {
    stockActual: safeStock,
    controlaStock: true
  };
  if (safeStock <= 0) {
    updatePayload.disponible = false;
  } else if (snap.data().disponible === false && delta > 0) {
    updatePayload.disponible = true;
  }
  return updateDoc(itemRef, updatePayload);
}

export async function deductStockForOrderItems(
  items: OrderItem[],
  businessId?: string,
  restaurantId?: string,
  orderContext?: {
    orderId?: string;
    mesaNumero?: number | null;
    tipo?: string;
    usuario?: string;
  }
): Promise<{ deductedRecords: DeductedSupplyRecord[]; criticalAlerts: DeductedSupplyRecord[] }> {
  const deductedRecords: DeductedSupplyRecord[] = [];
  const criticalAlerts: DeductedSupplyRecord[] = [];

  if (!items || items.length === 0) {
    return { deductedRecords, criticalAlerts };
  }

  const targetBizId = businessId || UNIQUE_BUSINESS_ID;
  const nowIso = new Date().toISOString();

  try {
    // 1. Cargar todos los insumos (inventoryItems) del negocio para poder descontar por receta o coincidencia
    const invSnap = await getDocs(
      query(
        collection(db, 'inventoryItems'),
        where('appId', '==', 'gastro_smart'),
        where('businessId', '==', targetBizId)
      )
    );
    const invMapById = new Map<string, InventoryItem>();
    const invMapByName = new Map<string, InventoryItem>();
    invSnap.docs.forEach(d => {
      const inv = { id: d.id, ...d.data() } as InventoryItem;
      invMapById.set(inv.id, inv);
      if (inv.nombre) {
        invMapByName.set(inv.nombre.trim().toLowerCase(), inv);
      }
    });

    // Acumulador de descuentos por insumo para evitar colisiones si varios platos usan el mismo insumo en el mismo pedido
    const pendingInsumoDeductions = new Map<string, { inv: InventoryItem; qtyToDeduct: number; dishesUsed: string[] }>();

    for (const item of items) {
      const itemQty = Number(item.cantidad) || 1;
      let menuItemData: MenuItem | null = null;

      if (item.menuItemId) {
        const itemRef = doc(db, 'menuItems', item.menuItemId);
        const snap = await getDoc(itemRef);
        if (snap.exists()) {
          menuItemData = { id: snap.id, ...snap.data() } as MenuItem;
        }
      }

      // A) Descontar insumos de la receta del plato (insumosReceta)
      if (menuItemData && Array.isArray(menuItemData.insumosReceta) && menuItemData.insumosReceta.length > 0) {
        for (const rec of menuItemData.insumosReceta) {
          const targetInv =
            (rec.insumoId ? invMapById.get(rec.insumoId) : undefined) ||
            (rec.insumoNombre ? invMapByName.get(rec.insumoNombre.trim().toLowerCase()) : undefined);

          if (targetInv) {
            const deductAmount = Math.round((Number(rec.cantidadPorUnidad) || 0) * itemQty * 1000) / 1000;
            if (deductAmount > 0) {
              const existing = pendingInsumoDeductions.get(targetInv.id);
              if (existing) {
                existing.qtyToDeduct = Math.round((existing.qtyToDeduct + deductAmount) * 1000) / 1000;
                if (!existing.dishesUsed.includes(item.nombre)) existing.dishesUsed.push(item.nombre);
              } else {
                pendingInsumoDeductions.set(targetInv.id, {
                  inv: targetInv,
                  qtyToDeduct: deductAmount,
                  dishesUsed: [item.nombre]
                });
              }
            }
          }
        }
      } else {
        // Fallback inteligente: si hay un insumo con el mismo nombre del producto (ej. gaseosas, cervezas, porciones base)
        const matchingInv = invMapByName.get((item.nombre || '').trim().toLowerCase());
        if (matchingInv) {
          const existing = pendingInsumoDeductions.get(matchingInv.id);
          if (existing) {
            existing.qtyToDeduct = Math.round((existing.qtyToDeduct + itemQty) * 1000) / 1000;
          } else {
            pendingInsumoDeductions.set(matchingInv.id, {
              inv: matchingInv,
              qtyToDeduct: itemQty,
              dishesUsed: [item.nombre]
            });
          }
        }
      }

      // B) Descontar stock directo del plato en menuItems si controlaStock está activo
      if (menuItemData && menuItemData.controlaStock && item.menuItemId) {
        const itemRef = doc(db, 'menuItems', item.menuItemId);
        const currentStock = typeof menuItemData.stockActual === 'number' ? menuItemData.stockActual : 0;
        const minStock = menuItemData.stockMinimo ?? 5;
        const newStock = Math.max(0, Math.round((currentStock - itemQty) * 100) / 100);
        const unit = menuItemData.unidadMedida || 'unidades';
        const isDepleted = newStock <= 0;
        const isCritical = newStock <= minStock;

        const updatePayload: Partial<MenuItem> = { stockActual: newStock };
        if (isDepleted) {
          updatePayload.disponible = false;
        }
        await updateDoc(itemRef, updatePayload);

        const record: DeductedSupplyRecord = {
          insumoId: item.menuItemId,
          nombre: menuItemData.nombre,
          cantidadDescontada: itemQty,
          stockAnterior: currentStock,
          stockRestante: newStock,
          stockMinimo: minStock,
          unidad: unit,
          alertaCritica: isCritical,
          agotado: isDepleted,
          tipo: 'plato'
        };
        deductedRecords.push(record);

        if (isDepleted) {
          criticalAlerts.push(record);
          try {
            await createSecurityAlert({
              businessId: targetBizId,
              restaurantId: restaurantId || menuItemData.restaurantId,
              tipo: 'stock_agotado',
              mensaje: `🚨 PRODUCTO AGOTADO AL ENTREGAR PEDIDO: "${menuItemData.nombre}" quedó en 0 ${unit} (Umbral crítico: ${minStock} ${unit}).`,
              fecha: nowIso,
              leido: false,
              severidad: 'alta'
            });
          } catch (alertErr) {
            console.warn('Could not register stock_agotado alert:', alertErr);
          }
        } else if (isCritical) {
          criticalAlerts.push(record);
          try {
            await createSecurityAlert({
              businessId: targetBizId,
              restaurantId: restaurantId || menuItemData.restaurantId,
              tipo: 'stock_bajo',
              mensaje: `⚠️ STOCK CRÍTICO TRAS ENTREGA: "${menuItemData.nombre}" bajó a ${newStock} ${unit} restantes (Umbral crítico: ${minStock} ${unit}).`,
              fecha: nowIso,
              leido: false,
              severidad: 'media'
            });
          } catch (alertErr) {
            console.warn('Could not register stock_bajo alert:', alertErr);
          }
        }
      }
    }

    // Aplicar descuentos acumulados sobre la colección inventoryItems (Insumos)
    for (const [invId, entry] of pendingInsumoDeductions.entries()) {
      const { inv, qtyToDeduct, dishesUsed } = entry;
      const currentStock = typeof inv.stockActual === 'number' ? inv.stockActual : 0;
      const minStock = inv.stockMinimo ?? 5;
      const newStock = Math.max(0, Math.round((currentStock - qtyToDeduct) * 1000) / 1000);
      const unit = inv.unidadMedida || 'unidades';
      const isDepleted = newStock <= 0;
      const isCritical = newStock <= minStock;

      await updateDoc(doc(db, 'inventoryItems', invId), {
        stockActual: newStock,
        ultimaActualizacion: nowIso
      });

      const record: DeductedSupplyRecord = {
        insumoId: invId,
        nombre: inv.nombre,
        cantidadDescontada: qtyToDeduct,
        stockAnterior: currentStock,
        stockRestante: newStock,
        stockMinimo: minStock,
        unidad: unit,
        alertaCritica: isCritical,
        agotado: isDepleted,
        tipo: 'insumo'
      };
      deductedRecords.push(record);

      if (isDepleted) {
        criticalAlerts.push(record);
        try {
          await createSecurityAlert({
            businessId: targetBizId,
            restaurantId: restaurantId || inv.restaurantId,
            tipo: 'stock_agotado',
            mensaje: `🚨 INSUMO AGOTADO AL ENTREGAR PEDIDO: "${inv.nombre}" se agotó (0 ${unit}). Usado en: ${dishesUsed.join(', ')}.`,
            fecha: nowIso,
            leido: false,
            severidad: 'alta'
          });
        } catch (alertErr) {
          console.warn('Could not register insumo stock_agotado alert:', alertErr);
        }
      } else if (isCritical) {
        criticalAlerts.push(record);
        try {
          await createSecurityAlert({
            businessId: targetBizId,
            restaurantId: restaurantId || inv.restaurantId,
            tipo: 'stock_bajo',
            mensaje: `⚠️ ALERTA DE INSUMO EN NIVEL CRÍTICO: "${inv.nombre}" tiene ${newStock} ${unit} disponibles (Umbral crítico: ${minStock} ${unit}). Descontado: -${qtyToDeduct} ${unit}.`,
            fecha: nowIso,
            leido: false,
            severidad: 'media'
          });
        } catch (alertErr) {
          console.warn('Could not register insumo stock_bajo alert:', alertErr);
        }
      }
    }

    // Registrar en el historial de auditoría de inventario si hubo descuentos
    if (deductedRecords.length > 0) {
      const orderLabel = orderContext?.mesaNumero
        ? `Mesa #${orderContext.mesaNumero}`
        : orderContext?.orderId
        ? `Pedido #${orderContext.orderId.slice(-5).toUpperCase()}`
        : 'Pedido entregado';

      const summaryStr = deductedRecords
        .map(r => `${r.nombre}: -${r.cantidadDescontada} ${r.unidad} (Stock: ${r.stockAnterior} → ${r.stockRestante} ${r.unidad}${r.alertaCritica ? ' ⚠️ CRÍTICO' : ''})`)
        .join(' · ');

      await recordMenuAuditLog({
        businessId: targetBizId,
        restaurantId: restaurantId || 'all',
        platoId: orderContext?.orderId || 'order_delivery',
        platoNombre: `${orderLabel} (Entrega confirmada)`,
        tipoAccion: 'descuento_automatico_entrega',
        detalles: `Descuento automático de inventario al marcar como ENTREGADO (${orderLabel}): ${summaryStr}`,
        cambios: deductedRecords.map(r => ({
          campo: r.nombre,
          valorAnterior: `${r.stockAnterior} ${r.unidad}`,
          valorNuevo: `${r.stockRestante} ${r.unidad}`
        })),
        empleadoNombre: orderContext?.usuario || 'Sistema Automático',
        empleadoRol: 'Operaciones',
        fecha: nowIso
      });
    }

    // Emitir evento global en el navegador para mostrar alerta inmediata en pantalla
    if (typeof window !== 'undefined' && (deductedRecords.length > 0 || criticalAlerts.length > 0)) {
      window.dispatchEvent(
        new CustomEvent('gastro-inventory-deducted', {
          detail: {
            deductedRecords,
            criticalAlerts,
            orderContext
          }
        })
      );
    }
  } catch (err) {
    console.warn('Error deducting stock/supplies for delivered order items:', err);
  }

  return { deductedRecords, criticalAlerts };
}

export async function deleteMenuItem(id: string) {
  // Retira el plato de la carta activa sin borrar ni afectar el historial de ventas ni sus costos asociados
  try {
    return await updateDoc(doc(db, 'menuItems', id), {
      appId: 'gastro_smart',
      eliminadoDeCarta: true,
      disponible: false,
      controlaStock: false,
      eliminadoEn: new Date().toISOString()
    });
  } catch (err) {
    return await deleteDoc(doc(db, 'menuItems', id));
  }
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
    restaurantId = arg2;
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
  const updatePayload: Record<string, any> = { estado };
  if (estado === 'libre') {
    updatePayload.comandaActivaId = null;
  }
  return updateDoc(doc(db, 'tables', tableId), updatePayload);
}

/**
 * Libera automáticamente la mesa cambiando su estado a 'libre' y comandaActivaId a null
 * ÚNICAMENTE si todos los pedidos asociados a esa mesa están cobrados o cancelados/rechazados.
 * Si aún quedan pedidos abiertos pendientes de cobro, la mesa permanece 'ocupada'.
 */
export async function releaseTableIfAllOrdersPaid(
  tableId: string, 
  currentPaidOrderId?: string
): Promise<{ released: boolean; pendingOrdersCount: number }> {
  if (!tableId) return { released: false, pendingOrdersCount: 0 };
  
  try {
    const ordersRef = collection(db, 'orders');
    const q = query(
      ordersRef,
      where('appId', '==', 'gastro_smart'),
      where('mesaId', '==', tableId)
    );
    const snap = await getDocs(q);
    
    // Contar cuántos pedidos activos pendientes de cobro quedan en esta mesa
    const pendingOrders = snap.docs.filter(docSnap => {
      if (docSnap.id === currentPaidOrderId) return false;
      const data = docSnap.data() as Order;
      // Si está cobrado o rechazado, ya no está pendiente de cobro
      if (data.estado === 'cobrado' || data.estadoPago === 'cobrado' || data.estado === 'rechazado') {
        return false;
      }
      return true;
    });

    if (pendingOrders.length === 0) {
      // No queda ningún pedido pendiente en esta mesa -> Liberar automáticamente de inmediato
      await updateDoc(doc(db, 'tables', tableId), {
        estado: 'libre',
        comandaActivaId: null
      });
      return { released: true, pendingOrdersCount: 0 };
    } else {
      // Quedan otras cuentas o pedidos abiertos -> La mesa permanece ocupada
      return { released: false, pendingOrdersCount: pendingOrders.length };
    }
  } catch (err) {
    console.warn('Error en releaseTableIfAllOrdersPaid:', err);
    return { released: false, pendingOrdersCount: 0 };
  }
}

/**
 * Revierte un pedido marcado como 'entregado'/'retirado' de vuelta a 'listo'
 * para corregir clics accidentales del mesero sin romper la orden de pago.
 */
export async function revertOrderToReady(orderId: string, userName: string) {
  const orderRef = doc(db, 'orders', orderId);
  const snap = await getDoc(orderRef);
  if (!snap.exists()) return;
  const orderData = snap.data() as Order;
  
  if (orderData.estado === 'cobrado' || orderData.estadoPago === 'cobrado') {
    throw new Error('El pedido ya fue cobrado y no puede ser revertido.');
  }

  const now = new Date().toISOString();
  const timeline: OrderTimelineEvent[] = [
    ...(orderData.timeline || []),
    {
      estado: 'listo' as OrderStatus,
      fecha: now,
      usuario: userName,
      motivo: 'Corrección: retiro revertido a Listo para entrega'
    }
  ];

  await updateDoc(orderRef, {
    estado: 'listo',
    estadoEntrega: 'pendiente',
    timeline
  });
}

// ======================= ORDERS & NOTIFICATIONS =======================

export function subscribeToOrders(
  arg1?: string | null | ((orders: Order[]) => void),
  arg2?: string | null | ((orders: Order[]) => void),
  arg3?: ((orders: Order[]) => void) | string | null
) {
  let businessId: string | null = null;
  let restaurantId: string | null = null;
  let callback: (orders: Order[]) => void = () => {};

  if (typeof arg1 === 'function') {
    callback = arg1;
    if (typeof arg2 === 'string') businessId = arg2;
  } else if (typeof arg2 === 'function') {
    restaurantId = arg1 || null;
    callback = arg2;
    if (typeof arg3 === 'string') businessId = arg3;
  } else {
    businessId = arg1 || null;
    restaurantId = arg2 || null;
    callback = typeof arg3 === 'function' ? arg3 : (() => {});
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

export interface OrderRoutingDecision {
  ruta: OrderRoute;
  requiresKitchen: boolean;
  is100Mostrador: boolean;
  initialState: OrderStatus;
  esVentaExpress: boolean;
}

/**
 * REGLA DEFINITIVA DE ENRUTAMIENTO COCINA VS. MOSTRADOR SEGÚN COMPOSICIÓN DEL PEDIDO
 * 
 * Regla 1 (Al menos un producto que requiere preparación):
 *   - Todo el pedido pasa por Cocina.
 *   - ruta: 'cocina' (si 100% cocina) o 'mixto' (si combina cocina + mostrador).
 *   - initialState: 'pendiente_cocina'.
 *   - Cocina recibe la alerta sonora, visualiza los platos a preparar, y marca "Listo para entregar".
 *   - Al marcar "Listo para entregar", la alerta suena SIMULTÁNEAMENTE para Mesero y Mostrador.
 * 
 * Regla 2 (100% productos que NO requieren preparación / cobro directo):
 *   - El pedido NO pasa por Cocina en absoluto (no se le notifica, no aparece en su cola ni recibe alerta).
 *   - El pedido va directo a Mostrador.
 *   - ruta: 'express'.
 *   - initialState: 'listo' (listo para despacho en mostrador).
 *   - SOLO Mostrador recibe la alerta sonora indicando qué productos debe entregar.
 */
export function determineOrderRouting(items: OrderItem[], restaurantUsaCocina: boolean = true): OrderRoutingDecision {
  if (!restaurantUsaCocina) {
    return {
      ruta: 'express',
      requiresKitchen: false,
      is100Mostrador: true,
      initialState: 'listo',
      esVentaExpress: true
    };
  }
  const safeItems = items || [];
  // Un producto requiere cocina si su flag requiereCocina no es explícitamente false
  const hasKitchenItem = safeItems.some(i => i.requiereCocina !== false);
  const hasNonKitchenItem = safeItems.some(i => i.requiereCocina === false);

  if (hasKitchenItem) {
    const ruta: OrderRoute = hasNonKitchenItem ? 'mixto' : 'cocina';
    return {
      ruta,
      requiresKitchen: true,
      is100Mostrador: false,
      initialState: 'pendiente_cocina',
      esVentaExpress: false
    };
  } else {
    return {
      ruta: 'express',
      requiresKitchen: false,
      is100Mostrador: true,
      initialState: 'pendiente_cocina',
      esVentaExpress: true
    };
  }
}

export async function createOrder(data: Omit<Order, 'id' | 'creadoEn'> & { creadoEn?: string; usaCocina?: boolean }) {
  let targetBusinessId = data.businessId;
  let restaurantUsaCocina = data.usaCocina !== undefined ? data.usaCocina !== false : true;

  if (data.restaurantId) {
    try {
      const rSnap = await getDoc(doc(db, 'restaurants', data.restaurantId));
      if (rSnap.exists()) {
        const rData = rSnap.data();
        if (!targetBusinessId && rData?.businessId) {
          targetBusinessId = rData.businessId;
        }
        if (rData?.usaCocina === false) {
          restaurantUsaCocina = false;
        }
      }
    } catch {
      // fallback
    }
  }

  // Sanitizar items primero para evaluar la composición completa del pedido
  const nowIso = new Date().toISOString();
  const sanitizedItems: OrderItem[] = (data.items || []).map((it, idx) => {
    const itemNeedsKitchen = restaurantUsaCocina && it.requiereCocina !== false;
    return {
      ...it,
      id: it.id || `item_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      requiereCocina: itemNeedsKitchen,
      estadoItem: it.estadoItem || (itemNeedsKitchen ? 'pendiente' : 'listo'),
      estado: it.estado || (itemNeedsKitchen ? 'pendiente_cocina' : 'listo'),
      ronda: it.ronda || 1,
      rondaEnviadaEn: it.rondaEnviadaEn || nowIso,
      comensalId: it.comensalId || null,
      comensalNombre: it.comensalNombre || null,
      comensalNumero: it.comensalNumero || null,
      cobrado: Boolean(it.cobrado)
    };
  });

  // Evaluación canónica única del enrutamiento (Regla 1 vs Regla 2 vs Modo Sin Cocina)
  const routing = determineOrderRouting(sanitizedItems, restaurantUsaCocina);
  const computedRuta: OrderRoute = !restaurantUsaCocina ? 'express' : (data.ruta || routing.ruta);
  const isExpress = !restaurantUsaCocina || computedRuta === 'express' || routing.esVentaExpress || Boolean(data.esVentaExpress);
  
  // Regla 1: Si usa cocina, el estado inicial es 'pendiente_cocina'. Si NO usa cocina, pasa directo a 'listo' (mostrador).
  const finalInitialState: OrderStatus = (data.estado === 'cobrado') 
    ? 'cobrado' 
    : (restaurantUsaCocina ? 'pendiente_cocina' : 'listo');

  const initialTimeline: OrderTimelineEvent[] = [
    {
      estado: finalInitialState,
      fecha: nowIso,
      usuario: data.meseroNombre || 'Mesero',
      motivo: data.tipo === 'local' 
        ? (restaurantUsaCocina ? `Mesa #${data.mesaNumero || ''} · Ronda 1 enviada a cocina` : `Mesa #${data.mesaNumero || ''} · Pedido enviado a mostrador (Sin cocina)`)
        : (restaurantUsaCocina ? 'Pedido enviado a cocina' : 'Pedido enviado a mostrador')
    }
  ];

  const initialRondas: OrderRound[] = [
    {
      numero: 1,
      enviadoEn: nowIso,
      meseroNombre: data.meseroNombre || 'Mesero',
      estado: finalInitialState === 'cobrado' ? 'entregado' : (restaurantUsaCocina ? 'pendiente_cocina' : 'listo'),
      itemsCount: sanitizedItems.length
    }
  ];

  const totalCalculated = data.total || 0;

  const sanitizedData: any = {
    ...data,
    estado: finalInitialState,
    items: sanitizedItems,
    ruta: computedRuta,
    esVentaExpress: isExpress,
    estadoPago: data.estadoPago || (data.estado === 'cobrado' ? 'cobrado' : 'pendiente'),
    estadoEntrega: data.estadoEntrega || (data.estado === 'entregado' ? 'entregado' : 'pendiente'),
    rondaActual: 1,
    rondas: initialRondas,
    comensales: data.comensales || [],
    cobros: data.cobros || [],
    montoCobradoAcumulado: data.montoCobradoAcumulado || (data.estado === 'cobrado' ? totalCalculated : 0),
    saldoPendiente: data.saldoPendiente !== undefined ? data.saldoPendiente : (data.estado === 'cobrado' ? 0 : totalCalculated),
    fuga: null,
    businessId: targetBusinessId || UNIQUE_BUSINESS_ID,
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
    creadoEn: data.creadoEn || nowIso,
    timeline: initialTimeline
  };

  const isInitiallyDelivered = data.estado === 'entregado' || data.estadoEntrega === 'entregado';
  if ( isInitiallyDelivered ) {
    sanitizedData.insumosDescontados = true;
    sanitizedData.insumosDescontadosEn = nowIso;
    sanitizedData.insumosDescontadosRondas = [1];
  }

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

  // Descontar inventario/insumos automáticamente SOLO si el pedido nace marcado como 'entregado'
  if (isInitiallyDelivered) {
    deductStockForOrderItems(sanitizedItems, targetBusinessId, data.restaurantId, {
      orderId: orderRef.id,
      mesaNumero: data.mesaNumero,
      tipo: data.tipo,
      usuario: data.meseroNombre || 'Mostrador'
    }).catch(err => {
      console.warn('Error descontando insumos en createOrder entregado:', err);
    });
  }

  // Incrementar pedidos tomados en el turno del mesero
  try {
    const shiftSnap = await getDocs(query(
      collection(db, 'shifts'),
      where('appId', '==', 'gastro_smart'),
      where('employeeId', '==', data.meseroId),
      where('estado', 'in', ['abierto', 'en_pausa']),
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
      const bId = sanitizedData.businessId || UNIQUE_BUSINESS_ID;
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
  let savedBusinessId = '';
  let savedRestaurantId = '';
  let itemsToDeduct: OrderItem[] = [];

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) {
      throw new Error('La comanda seleccionada no existe.');
    }

    const currentOrder = snap.data() as Order;
    if (currentOrder.estado === 'cobrado' || currentOrder.estado === 'rechazado') {
      throw new Error('No se puede ampliar una comanda que ya fue cobrada o cancelada.');
    }

    savedBusinessId = currentOrder.businessId || '';
    savedRestaurantId = currentOrder.restaurantId || '';

    const nextRound = (currentOrder.rondaActual || 1) + 1;
    const nowIso = new Date().toISOString();

    let restaurantUsaCocina = true;
    if (currentOrder.restaurantId) {
      try {
        const rSnap = await tx.get(doc(db, 'restaurants', currentOrder.restaurantId));
        if (rSnap.exists() && rSnap.data()?.usaCocina === false) {
          restaurantUsaCocina = false;
        }
      } catch {
        // fallback
      }
    }

    const sanitizedNewItems: OrderItem[] = newItems.map((it, idx) => {
      const itemNeedsKitchen = restaurantUsaCocina && it.requiereCocina !== false;
      return {
        ...it,
        id: it.id || `item_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        requiereCocina: itemNeedsKitchen,
        estadoItem: it.estadoItem || (itemNeedsKitchen ? 'pendiente' : 'listo'),
        estado: it.estado || (itemNeedsKitchen ? 'pendiente_cocina' : 'listo'),
        ronda: it.ronda || nextRound,
        rondaEnviadaEn: it.rondaEnviadaEn || nowIso,
        comensalId: it.comensalId || null,
        comensalNombre: it.comensalNombre || null,
        comensalNumero: it.comensalNumero || null,
        cobrado: Boolean(it.cobrado)
      };
    });

    itemsToDeduct = sanitizedNewItems;

    const mergedItems = [...(currentOrder.items || []), ...sanitizedNewItems];

    // Recalcular subtotal de forma precisa sumando todos los ítems
    const calculatedSubtotal = mergedItems.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
    const subtotal = Math.round(calculatedSubtotal * 100) / 100;
    const descuento = currentOrder.descuento || 0;
    const propina = currentOrder.propina || 0;
    const total = Math.max(0, Math.round((subtotal - descuento + propina) * 100) / 100);
    const montoCobradoAcumulado = currentOrder.montoCobradoAcumulado || 0;
    const saldoPendiente = Math.max(0, Math.round((total - montoCobradoAcumulado) * 100) / 100);

    // Evaluación canónica única del enrutamiento de la comanda ampliada
    const routing = determineOrderRouting(mergedItems, restaurantUsaCocina);
    const computedRuta: OrderRoute = !restaurantUsaCocina ? 'express' : routing.ruta;
    const isExpress = !restaurantUsaCocina || routing.esVentaExpress;
    const nextState: OrderStatus = restaurantUsaCocina ? 'pendiente_cocina' : 'listo';

    const userName = typeof options === 'string' ? options : (options?.userName || 'Mesero');
    const addedCount = newItems.reduce((acc, it) => acc + (it.cantidad || 1), 0);

    const timelineEvent: OrderTimelineEvent = (typeof options === 'object' && options?.timelineEvent) ? options.timelineEvent : {
      estado: nextState,
      fecha: nowIso,
      usuario: userName,
      motivo: restaurantUsaCocina
        ? `Mesa #${currentOrder.mesaNumero || ''} · Ronda ${nextRound} enviada a cocina (+${addedCount} plato(s): ${newItems.map(i => `${i.cantidad}x ${i.nombre}`).join(', ')})`
        : `Mesa #${currentOrder.mesaNumero || ''} · Ronda ${nextRound} enviada a mostrador (+${addedCount} item(s): ${newItems.map(i => `${i.cantidad}x ${i.nombre}`).join(', ')})`
    };

    const mergedTimeline = [...(currentOrder.timeline || []), timelineEvent];

    // Actualizar historial de rondas
    const existingRondas: OrderRound[] = currentOrder.rondas && currentOrder.rondas.length > 0 
      ? currentOrder.rondas 
      : [{
          numero: 1,
          enviadoEn: currentOrder.creadoEn || nowIso,
          meseroNombre: currentOrder.meseroNombre || 'Mesero',
          estado: 'entregado',
          itemsCount: (currentOrder.items || []).length
        }];

    const newRoundRecord: OrderRound = {
      numero: nextRound,
      enviadoEn: nowIso,
      meseroNombre: userName,
      estado: restaurantUsaCocina ? 'pendiente_cocina' : 'listo',
      itemsCount: sanitizedNewItems.length
    };

    const updatedRondas = [...existingRondas, newRoundRecord];

    // Mezclar comensales si se enviaron actualizados
    let mergedComensales = currentOrder.comensales || [];
    if (typeof options === 'object' && (options as any)?.comensales) {
      mergedComensales = (options as any).comensales;
    }

    tx.update(orderRef, {
      items: mergedItems,
      subtotal,
      total,
      saldoPendiente,
      montoCobradoAcumulado,
      rondaActual: nextRound,
      rondas: updatedRondas,
      comensales: mergedComensales,
      timeline: mergedTimeline,
      estado: nextState, // Despierta KDS con la nueva ronda
      ruta: computedRuta,
      esVentaExpress: isExpress
    });

    if (currentOrder.mesaId) {
      tx.update(doc(db, 'tables', currentOrder.mesaId), {
        estado: 'ocupada',
        comandaActivaId: orderId
      });
    }
  });
}

/**
 * Actualiza el estado de una RONDA específica de una comanda (ej: Ronda 2 -> en_preparacion -> listo -> entregado)
 */
export async function updateOrderRoundStatus(
  orderId: string,
  roundNumber: number,
  newStatus: 'aceptado' | 'en_preparacion' | 'listo' | 'entregado',
  userName: string
): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  let itemsForDeduction: OrderItem[] = [];
  let orderMeta: { businessId?: string; restaurantId?: string; mesaNumero?: number | null; tipo?: string } = {};

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) return;
    const order = snap.data() as Order;
    const now = new Date().toISOString();

    const updatedItems = (order.items || []).map(it => {
      const itemRound = it.ronda || 1;
      if (itemRound === roundNumber && it.requiereCocina !== false) {
        return {
          ...it,
          estado: newStatus,
          estadoItem: newStatus === 'listo' ? 'listo' : (newStatus === 'entregado' ? 'entregado' : 'pendiente')
        };
      }
      return it;
    });

    const updatedRondas = (order.rondas || []).map(r => {
      if (r.numero === roundNumber) {
        return {
          ...r,
          estado: newStatus,
          ...(newStatus === 'aceptado' ? { aceptadoEn: now } : {}),
          ...(newStatus === 'en_preparacion' ? { enPreparacionEn: now } : {}),
          ...(newStatus === 'listo' ? { listoEn: now } : {}),
          ...(newStatus === 'entregado' ? { entregadoEn: now } : {})
        };
      }
      return r;
    });

    // Determinar estado general del pedido
    const hasKitchenPending = updatedItems.some(i => i.requiereCocina !== false && (i.estado === 'pendiente_cocina' || !i.estado));
    const hasKitchenPrep = updatedItems.some(i => i.requiereCocina !== false && (i.estado === 'aceptado' || i.estado === 'en_preparacion'));
    const hasKitchenReady = updatedItems.some(i => i.requiereCocina !== false && i.estado === 'listo');
    
    let overallState: OrderStatus = order.estado;
    if (order.estado !== 'cobrado') {
      if (hasKitchenPending) overallState = 'pendiente_cocina';
      else if (hasKitchenPrep) overallState = 'en_preparacion';
      else if (hasKitchenReady) overallState = 'listo';
      else overallState = 'entregado';
    }

    const alreadyDeductedRounds = order.insumosDescontadosRondas || [];
    const updatedDeductedRounds = [...alreadyDeductedRounds];

    if ((newStatus === 'entregado' || overallState === 'entregado') && !alreadyDeductedRounds.includes(roundNumber)) {
      updatedDeductedRounds.push(roundNumber);
      itemsForDeduction = (order.items || []).filter(it => (it.ronda || 1) === roundNumber);
      orderMeta = {
        businessId: order.businessId,
        restaurantId: order.restaurantId,
        mesaNumero: order.mesaNumero,
        tipo: order.tipo
      };
    }

    const newTimelineEvent: OrderTimelineEvent = {
      estado: overallState,
      fecha: now,
      usuario: userName || 'Cocina',
      motivo: `Mesa #${order.mesaNumero || ''} · Ronda ${roundNumber} pasada a ${newStatus}`
    };

    const txUpdatePayload: Record<string, any> = {
      items: updatedItems,
      rondas: updatedRondas,
      estado: overallState,
      timeline: [...(order.timeline || []), newTimelineEvent]
    };

    if (itemsForDeduction.length > 0) {
      txUpdatePayload.insumosDescontadosRondas = updatedDeductedRounds;
      if (overallState === 'entregado') {
        txUpdatePayload.insumosDescontados = true;
        txUpdatePayload.insumosDescontadosEn = now;
        txUpdatePayload.entregadoEn = now;
        txUpdatePayload.estadoEntrega = 'entregado';
      }
    }

    tx.update(orderRef, txUpdatePayload);
  });

  if (itemsForDeduction.length > 0) {
    await deductStockForOrderItems(
      itemsForDeduction,
      orderMeta.businessId,
      orderMeta.restaurantId,
      {
        orderId,
        mesaNumero: orderMeta.mesaNumero,
        tipo: orderMeta.tipo,
        usuario: userName
      }
    );
  }
}

/**
 * Actualiza el estado de un ITEM individual de una comanda
 */
export async function updateOrderItemStatus(
  orderId: string,
  itemIdOrIndex: string | number,
  newStatus: ItemStatus,
  userName: string
): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) return;
    const order = snap.data() as Order;
    const now = new Date().toISOString();

    const updatedItems = (order.items || []).map((it, idx) => {
      const match = typeof itemIdOrIndex === 'number' ? idx === itemIdOrIndex : it.id === itemIdOrIndex;
      if (match) {
        return {
          ...it,
          estado: newStatus,
          estadoItem: newStatus === 'listo' ? 'listo' : (newStatus === 'entregado' ? 'entregado' : 'pendiente')
        };
      }
      return it;
    });

    const hasKitchenPending = updatedItems.some(i => i.requiereCocina !== false && i.estado === 'pendiente_cocina');
    const hasKitchenPrep = updatedItems.some(i => i.requiereCocina !== false && (i.estado === 'aceptado' || i.estado === 'en_preparacion'));
    const hasKitchenReady = updatedItems.some(i => i.requiereCocina !== false && i.estado === 'listo');

    let overallState: OrderStatus = order.estado;
    if (order.estado !== 'cobrado') {
      if (hasKitchenPending) overallState = 'pendiente_cocina';
      else if (hasKitchenPrep) overallState = 'en_preparacion';
      else if (hasKitchenReady) overallState = 'listo';
      else overallState = 'entregado';
    }

    tx.update(orderRef, {
      items: updatedItems,
      estado: overallState
    });
  });
}

/**
 * Registra un cobro parcial (Cobro por comensal, partes iguales o cuenta general)
 */
export async function registerPartialPayment(
  orderId: string,
  paymentData: {
    tipo: 'comensal' | 'partes_iguales' | 'cuenta_compartida' | 'total' | 'general';
    comensalId?: string;
    comensalNombre?: string;
    comensalNumero?: number;
    items?: OrderItem[];
    monto: number;
    subtotal?: number;
    impuesto?: number;
    descuento?: number;
    propina?: number;
    total: number;
    saldoPendiente?: number;
    metodoPago: string;
    montoRecibido?: number;
    vuelto?: number;
    cajeroNombre?: string;
    clienteNombre?: string;
    clienteTelefono?: string;
    numeroParte?: number;
    totalPartes?: number;
  }
): Promise<{ orderCompleted: boolean; saldoRestante: number; paymentId: string }> {
  const orderRef = doc(db, 'orders', orderId);
  let orderCompleted = false;
  let saldoRestante = 0;
  const paymentId = 'pay_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error('Pedido no existe');
    const order = snap.data() as Order;
    const now = new Date().toISOString();

    const newPayment: PartialPayment = {
      id: paymentId,
      tipo: paymentData.tipo,
      monto: Number(paymentData.monto) || 0,
      subtotal: Number(paymentData.subtotal ?? paymentData.monto) || 0,
      descuento: Number(paymentData.descuento || 0),
      propina: Number(paymentData.propina || 0),
      total: Number(paymentData.total ?? paymentData.monto) || 0,
      metodoPago: paymentData.metodoPago || 'efectivo',
      fecha: now,
      ticketImpreso: true,
      cajeroNombre: paymentData.cajeroNombre || 'Cajero'
    };

    if (paymentData.comensalId) newPayment.comensalId = paymentData.comensalId;
    if (paymentData.comensalNombre) newPayment.comensalNombre = paymentData.comensalNombre;
    if (paymentData.comensalNumero !== undefined && paymentData.comensalNumero !== null) {
      newPayment.comensalNumero = paymentData.comensalNumero;
    }
    if (paymentData.items && paymentData.items.length > 0) {
      newPayment.items = limpiarDatosUndefined(paymentData.items);
    }
    if (paymentData.montoRecibido !== undefined && paymentData.montoRecibido !== null) {
      newPayment.montoRecibido = Number(paymentData.montoRecibido);
    }
    if (paymentData.vuelto !== undefined && paymentData.vuelto !== null) {
      newPayment.vuelto = Number(paymentData.vuelto);
    }
    if (paymentData.clienteNombre) newPayment.clienteNombre = paymentData.clienteNombre;
    if (paymentData.clienteTelefono) newPayment.clienteTelefono = paymentData.clienteTelefono;
    if (paymentData.numeroParte !== undefined && paymentData.numeroParte !== null) {
      newPayment.numeroParte = paymentData.numeroParte;
    }
    if (paymentData.totalPartes !== undefined && paymentData.totalPartes !== null) {
      newPayment.totalPartes = paymentData.totalPartes;
    }

    const sanitizedPayment = limpiarDatosUndefined(newPayment);
    const existingCobros = (order.cobros || []).map(c => limpiarDatosUndefined(c));
    const updatedCobros = [...existingCobros, sanitizedPayment];
    const totalCobrado = Math.round(updatedCobros.reduce((sum, c) => sum + (Number(c.monto) || Number(c.total) || 0), 0) * 100) / 100;
    const orderTotal = Number(order.total) || 0;
    const newSaldoPendiente = Math.max(0, Math.round((orderTotal - totalCobrado) * 100) / 100);
    saldoRestante = newSaldoPendiente;

    const isFullyPaid = newSaldoPendiente <= 0.01;
    orderCompleted = isFullyPaid;

    // Actualizar items si el cobro fue por comensal o cuenta general
    const updatedItems = (order.items || []).map(it => {
      if (isFullyPaid) {
        return { ...it, cobrado: true, estado: 'cobrado' as ItemStatus };
      }
      if (paymentData.tipo === 'comensal' && paymentData.comensalId && (it.comensalId === paymentData.comensalId || it.comensalNombre === paymentData.comensalNombre)) {
        return { ...it, cobrado: true, cobroId: paymentId, estado: 'cobrado' as ItemStatus };
      }
      if (paymentData.tipo === 'general' && (!it.comensalId || it.comensalId === 'general')) {
        return { ...it, cobrado: true, cobroId: paymentId, estado: 'cobrado' as ItemStatus };
      }
      return it;
    });

    // Actualizar comensales
    const existingComensales = order.comensales && order.comensales.length > 0 ? order.comensales : [];
    const updatedComensales = existingComensales.map(c => {
      if (paymentData.tipo === 'comensal' && (c.id === paymentData.comensalId || c.nombre === paymentData.comensalNombre)) {
        return { ...c, pagado: true, montoPagado: (c.montoPagado || 0) + paymentData.total };
      }
      if (isFullyPaid) {
        return { ...c, pagado: true };
      }
      return c;
    });

    const timelineEvent: OrderTimelineEvent = {
      estado: isFullyPaid ? 'cobrado' : (order.estado || 'entregado'),
      fecha: now,
      usuario: paymentData.cajeroNombre || 'Cajero',
      motivo: isFullyPaid 
        ? `Cobro final completado (${paymentData.tipo === 'comensal' ? `Comensal: ${paymentData.comensalNombre || 'Comensal'}` : 'Cuenta liquidada'}). Total cobrado: $${totalCobrado.toFixed(2)}`
        : `Pago parcial registrado: $${paymentData.total.toFixed(2)} (${paymentData.tipo === 'comensal' ? `Comensal: ${paymentData.comensalNombre || 'Comensal'}` : `Parte ${paymentData.numeroParte || 1}/${paymentData.totalPartes || 1}`}). Saldo pendiente: $${newSaldoPendiente.toFixed(2)}`
    };

    const updatePayload: Record<string, any> = {
      appId: (order as any).appId || 'gastro_smart',
      cobros: updatedCobros,
      montoCobradoAcumulado: totalCobrado,
      saldoPendiente: newSaldoPendiente,
      items: updatedItems,
      comensales: updatedComensales,
      estadoPago: isFullyPaid ? 'cobrado' : 'parcial',
      timeline: [...(order.timeline || []), timelineEvent]
    };

    if (isFullyPaid) {
      updatePayload.estado = 'cobrado';
      updatePayload.cobradoEn = now;
      updatePayload.metodoPago = paymentData.metodoPago || 'efectivo';
      updatePayload.montoPagado = totalCobrado;
      updatePayload.cajeroNombre = paymentData.cajeroNombre || 'Cajero';
    }

    const payloadLimpio = limpiarDatosUndefined(updatePayload);
    tx.update(orderRef, payloadLimpio);
  });

  // Si está totalmente pagado y tenía mesa asignada, liberar la mesa de manera segura fuera de la transacción
  if (orderCompleted) {
    try {
      const snap = await getDoc(orderRef);
      if (snap.exists()) {
        const orderData = snap.data() as Order;
        if (orderData.mesaId) {
          await releaseTableIfAllOrdersPaid(orderData.mesaId, orderId);
        }
      }
    } catch (tblErr) {
      console.warn('Advertencia al verificar liberación de mesa:', tblErr);
    }
  }

  // Sincronizar estadísticas diarias con el monto cobrado en este pago parcial
  try {
    const snap = await getDoc(orderRef);
    if (snap.exists()) {
      const orderData = snap.data() as Order;
      const fechaHoy = getOperationalDateString(new Date());
      const bId = orderData.businessId || UNIQUE_BUSINESS_ID;
      const rId = orderData.restaurantId;
      const statDocId = getDailyStatDocId(bId, rId, fechaHoy);
      const statRef = doc(db, 'dailyStats', statDocId);
      const statSnap = await getDoc(statRef);
      const amountPaid = paymentData.total;

      if (statSnap.exists()) {
        const prevStat = statSnap.data() as DailyStat;
        const newVentas = (prevStat.ventasTotales || 0) + amountPaid;
        const newPedidos = orderCompleted ? (prevStat.pedidosCobrados || 0) + 1 : (prevStat.pedidosCobrados || 0);
        const newGastos = prevStat.gastosTotales || 0;
        await updateDoc(statRef, {
          ventasTotales: Math.round(newVentas * 100) / 100,
          pedidosCobrados: newPedidos,
          gananciaNeta: Math.round((newVentas - newGastos) * 100) / 100,
          actualizadoEn: new Date().toISOString()
        });
      }
    }
  } catch (e) {
    console.warn('Error updating dailyStats for partial payment:', e);
  }

  // Si se registró teléfono de comensal, vincular al historial del cliente
  if (paymentData.clienteTelefono) {
    try {
      const clientsSnap = await getDocs(query(
        collection(db, 'clients'),
        where('appId', '==', 'gastro_smart'),
        where('telefono', '==', paymentData.clienteTelefono),
        limit(1)
      ));
      if (!clientsSnap.empty) {
        const clDoc = clientsSnap.docs[0];
        const clData = clDoc.data();
        await updateDoc(clDoc.ref, {
          totalConsumido: (clData.totalConsumido || 0) + paymentData.total,
          pedidosCount: (clData.pedidosCount || 0) + 1,
          ultimaVisita: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn('Error updating client loyalty for diner payment:', e);
    }
  }

  return { orderCompleted, saldoRestante, paymentId };
}

/**
 * Cierre por Fuga / Salió sin pagar (Permite a Administrador/Cajero registrar la pérdida y liberar la mesa)
 */
export async function registerOrderFuga(
  orderId: string,
  motivo: string,
  userName: string
): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error('Pedido no existe');
    const order = snap.data() as Order;
    const now = new Date().toISOString();
    const saldoPerdido = order.saldoPendiente !== undefined ? order.saldoPendiente : (order.total || 0);

    const fugaRecord = {
      motivo: motivo.trim() || 'Comensales salieron sin pagar',
      usuario: userName,
      fecha: now,
      montoPerdido: saldoPerdido
    };

    const timelineEvent: OrderTimelineEvent = {
      estado: 'cobrado',
      fecha: now,
      usuario: userName,
      motivo: `Cierre forzado por fuga (Salió sin pagar). Motivo: ${fugaRecord.motivo}. Saldo perdido: $${saldoPerdido.toFixed(2)}`
    };

    tx.update(orderRef, {
      fuga: fugaRecord,
      estado: 'cobrado',
      estadoPago: 'cobrado',
      cobradoEn: now,
      saldoPendiente: 0,
      timeline: [...(order.timeline || []), timelineEvent]
    });

    if (order.mesaId) {
      tx.update(doc(db, 'tables', order.mesaId), {
        estado: 'libre',
        comandaActivaId: null
      });
    }
  });
}

/**
 * Tabla de Transiciones Legales de la Máquina de Estados:
 * pendiente_cocina → aceptado → en_preparacion → listo → entregado → cobrado
 * pendiente_cocina → rechazado (con motivo)
 * (los estados nunca saltan pasos ni retroceden, salvo admin)
 */
export const LEGAL_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pendiente_cocina: ['aceptado', 'rechazado', 'cobrado'],
  aceptado: ['en_preparacion', 'rechazado', 'cobrado'],
  en_preparacion: ['listo', 'rechazado', 'cobrado'],
  listo: ['entregado', 'cobrado'],
  entregado: ['cobrado'],
  cobrado: ['entregado'],
  rechazado: []
};

export interface CambiarEstadoPedidoOptions {
  motivoRechazo?: string;
  motivo?: string;
  timeline?: OrderTimelineEvent[];
  metodoPago?: 'efectivo' | 'tarjeta' | 'transferencia';
  montoPagado?: number;
  vuelto?: number;
  cajeroNombre?: string;
  subtotal?: number;
  impuesto?: number;
  porcentajeImpuesto?: number;
  impuestoIncluidoEnPrecio?: boolean;
  total?: number;
  descuento?: number;
  propina?: number;
  clienteNombre?: string;
  clienteTelefono?: string;
  montoCobradoAcumulado?: number;
  saldoPendiente?: number;
  estadoEntrega?: 'pendiente' | 'entregado';
  estadoPago?: 'pendiente' | 'cobrado';
  ruta?: OrderRoute;
  items?: OrderItem[];
  esAdmin?: boolean;
  forzarAdmin?: boolean;
}

/**
 * Función Centralizada para TODOS los cambios de estado de pedidos.
 * Valida que la transición sea legal y añade el evento al timeline.
 */
export async function cambiarEstadoPedido(
  orderId: string, 
  nuevoEstado: OrderStatus, 
  usuario: string, 
  options?: CambiarEstadoPedidoOptions
): Promise<boolean> {
  if (!orderId) {
    console.error('cambiarEstadoPedido: orderId no proporcionado');
    return false;
  }

  const orderRef = doc(db, 'orders', orderId);
  const currentSnap = await getDoc(orderRef);
  if (!currentSnap.exists()) {
    console.error(`cambiarEstadoPedido: Pedido #${orderId} no existe`);
    return false;
  }

  const orderData = currentSnap.data() as Order;
  const estadoActual = orderData.estado || 'pendiente_cocina';

  // Si ya está en ese estado, no hacer nada redundante
  if (estadoActual === nuevoEstado) {
    return true;
  }

  const isAdmin = Boolean(options?.esAdmin || options?.forzarAdmin);
  const legalNextStates = LEGAL_ORDER_TRANSITIONS[estadoActual] || [];
  const isLegal = legalNextStates.includes(nuevoEstado);

  if (!isLegal && !isAdmin) {
    const errorMsg = `Transición inválida: ${estadoActual} → ${nuevoEstado}`;
    console.error(errorMsg);
    console.warn(errorMsg);
    throw new Error(errorMsg);
  }

  const now = new Date().toISOString();
  const currentTimeline = options?.timeline || orderData.timeline || [];
  const newTimelineEvent: OrderTimelineEvent = {
    estado: nuevoEstado,
    fecha: now,
    usuario: usuario || 'Sistema',
    motivo: options?.motivoRechazo || options?.motivo || null
  };

  const updatedTimeline: OrderTimelineEvent[] = [
    ...currentTimeline,
    newTimelineEvent
  ];

  const updatePayload: any = {
    estado: nuevoEstado,
    timeline: updatedTimeline
  };

  if (options?.subtotal !== undefined) updatePayload.subtotal = options.subtotal;
  if (options?.impuesto !== undefined) updatePayload.impuesto = options.impuesto;
  if (options?.porcentajeImpuesto !== undefined) updatePayload.porcentajeImpuesto = options.porcentajeImpuesto;
  if (options?.impuestoIncluidoEnPrecio !== undefined) updatePayload.impuestoIncluidoEnPrecio = options.impuestoIncluidoEnPrecio;
  if (options?.total !== undefined) updatePayload.total = options.total;
  if (options?.descuento !== undefined) updatePayload.descuento = options.descuento;
  if (options?.propina !== undefined) updatePayload.propina = options.propina;
  if (options?.clienteNombre !== undefined) updatePayload.clienteNombre = options.clienteNombre;
  if (options?.clienteTelefono !== undefined) updatePayload.clienteTelefono = options.clienteTelefono;
  if (options?.estadoEntrega !== undefined) updatePayload.estadoEntrega = options.estadoEntrega;
  if (options?.estadoPago !== undefined) updatePayload.estadoPago = options.estadoPago;
  if (options?.ruta !== undefined) updatePayload.ruta = options.ruta;
  if (options?.items !== undefined) updatePayload.items = options.items;

  if (nuevoEstado === 'aceptado') {
    updatePayload.aceptadoEn = now;
  }
  if (nuevoEstado === 'en_preparacion' && !orderData.enPreparacionEn) {
    updatePayload.enPreparacionEn = now;
  }
  if (nuevoEstado === 'listo') {
    updatePayload.listoEn = now;
  }
  if (nuevoEstado === 'entregado') {
    updatePayload.entregadoEn = now;
    updatePayload.estadoEntrega = 'entregado';
    if (estadoActual === 'cobrado' || orderData.estadoPago === 'cobrado') {
      updatePayload.estado = 'cobrado';
    }

    // Marcar todos los items y rondas como entregados
    if (Array.isArray(orderData.items)) {
      updatePayload.items = (options?.items || orderData.items).map(it => ({
        ...it,
        estadoItem: 'entregado',
        estado: it.estado === 'cobrado' ? 'cobrado' : 'entregado'
      }));
    }
    if (Array.isArray(orderData.rondas)) {
      updatePayload.rondas = orderData.rondas.map(r => ({
        ...r,
        estado: 'entregado',
        entregadoEn: r.entregadoEn || now
      }));
    }

    // Descontar insumos y existencias automáticamente al marcar el pedido como 'entregado'
    const alreadyDeductedRounds = orderData.insumosDescontadosRondas || [];
    const allItems = options?.items || orderData.items || [];
    const undeductedItems = orderData.insumosDescontados
      ? allItems.filter(it => !alreadyDeductedRounds.includes(it.ronda || 1))
      : allItems;

    if (undeductedItems.length > 0) {
      const allRounds = Array.from(new Set(allItems.map(it => it.ronda || 1)));
      updatePayload.insumosDescontados = true;
      updatePayload.insumosDescontadosEn = now;
      updatePayload.insumosDescontadosRondas = allRounds;

      try {
        const { deductedRecords } = await deductStockForOrderItems(
          undeductedItems,
          orderData.businessId || UNIQUE_BUSINESS_ID,
          orderData.restaurantId,
          {
            orderId,
            mesaNumero: orderData.mesaNumero,
            tipo: orderData.tipo,
            usuario: usuario || 'Personal'
          }
        );
        if (deductedRecords.length > 0) {
          updatePayload.detalleInsumosDescontados = [
            ...(orderData.detalleInsumosDescontados || []),
            ...deductedRecords
          ];
        }
      } catch (deductErr) {
        console.warn('Error al descontar insumos en pedido entregado:', deductErr);
      }
    }
  }

  if (nuevoEstado === 'rechazado') {
    const motivo = options?.motivoRechazo || options?.motivo || 'Rechazado por cocina';
    updatePayload.motivoRechazo = motivo;
    if (orderData.mesaId) {
      await releaseTableIfAllOrdersPaid(orderData.mesaId, orderId);
    }
  }

  if (nuevoEstado === 'cobrado') {
    updatePayload.cobradoEn = now;
    updatePayload.estadoPago = 'cobrado';

    if (options?.metodoPago) updatePayload.metodoPago = options.metodoPago;
    if (options?.montoPagado !== undefined) updatePayload.montoPagado = options.montoPagado;
    if (options?.vuelto !== undefined) updatePayload.vuelto = options.vuelto;
    if (options?.cajeroNombre) updatePayload.cajeroNombre = options.cajeroNombre;

    // Acumulación automática de puntos de fidelidad si hay cliente identificado por teléfono
    const targetPhone = (options?.clienteTelefono || orderData.clienteTelefono || '').trim();
    const targetClientName = (options?.clienteNombre || orderData.clienteNombre || '').trim();
    const finalTotalOrder = options?.total !== undefined ? options.total : (orderData.total || 0);
    if (targetPhone && finalTotalOrder > 0) {
      try {
        const loyaltyRes = await awardLoyaltyPointsToClient({
          businessId: orderData.businessId || UNIQUE_BUSINESS_ID,
          telefono: targetPhone,
          nombre: targetClientName || 'Cliente',
          montoGastado: finalTotalOrder
        });
        if (loyaltyRes.pointsAdded > 0) {
          updatePayload.puntosFidelidadOtorgados = loyaltyRes.pointsAdded;
        }
      } catch (loyaltyErr) {
        console.warn('Error acumulando puntos de fidelidad al cerrar pedido:', loyaltyErr);
      }
    }

    if (orderData.mesaId) {
      await releaseTableIfAllOrdersPaid(orderData.mesaId, orderId);
    }

    try {
      const shiftSnap = await getDocs(query(
        collection(db, 'shifts'),
        where('appId', '==', 'gastro_smart'),
        where('employeeId', '==', orderData.meseroId),
        where('estado', 'in', ['abierto', 'en_pausa']),
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
      const fechaHoy = getOperationalDateString(new Date());
      const bId = orderData.businessId || UNIQUE_BUSINESS_ID;
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

        // Actualizar topPlatos acumulando los ítems de esta comanda
        const existingTopPlatos = [...(prevStat.topPlatos || [])];
        (orderData.items || []).forEach(item => {
          const found = existingTopPlatos.find(p => p.nombre === item.nombre);
          if (found) {
            found.cantidad += (item.cantidad || 1);
            found.total += (item.precio || 0) * (item.cantidad || 1);
          } else {
            existingTopPlatos.push({
              nombre: item.nombre,
              cantidad: item.cantidad || 1,
              total: (item.precio || 0) * (item.cantidad || 1)
            });
          }
        });
        existingTopPlatos.sort((a, b) => b.cantidad - a.cantidad);

        await updateDoc(statRef, {
          ventasTotales: Math.round(newVentas * 100) / 100,
          pedidosCobrados: newPedidos,
          gananciaNeta: Math.round((newVentas - newGastos) * 100) / 100,
          ticketPromedio: newPedidos > 0 ? Math.round((newVentas / newPedidos) * 100) / 100 : 0,
          topPlatos: existingTopPlatos,
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
      console.warn('Could not update dailyStats:', e);
    }
  }

  await updateDoc(orderRef, updatePayload);
  return true;
}

/**
 * Wrapper de compatibilidad directa hacia cambiarEstadoPedido
 */
export async function updateOrderStatus(
  orderId: string, 
  newStatus: OrderStatus, 
  userName: string, 
  options?: CambiarEstadoPedidoOptions,
  _extraParam?: any
) {
  return cambiarEstadoPedido(orderId, newStatus, userName, options);
}

/**
 * Marca un pedido como entregado (especialmente útil para entregas en mostrador/express o retiro de mesero)
 */
export async function markOrderDelivered(orderId: string, userName: string): Promise<void> {
  await cambiarEstadoPedido(orderId, 'entregado', userName);
}

// ======================= CLIENTS =======================

export function subscribeToClients(
  arg1?: string | null | ((clients: Client[]) => void),
  arg2?: ((clients: Client[]) => void) | string | null
) {
  let businessId: string | null = null;
  let callback: (clients: Client[]) => void = () => {};

  if (typeof arg1 === 'function') {
    callback = arg1;
    if (typeof arg2 === 'string') businessId = arg2;
  } else {
    businessId = arg1 || null;
    callback = typeof arg2 === 'function' ? arg2 : (() => {});
  }

  const colRef = collection(db, 'clients');
  const q = businessId
    ? query(colRef, where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))
    : query(colRef, where('appId', '==', 'gastro_smart'));

  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      puntosFidelidad: Number(d.data().puntosFidelidad) || 0
    } as Client));
    list.sort((a, b) => (b.puntosFidelidad || 0) - (a.puntosFidelidad || 0));
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
    businessId: data.businessId || UNIQUE_BUSINESS_ID,
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
    businessId: (data as any).businessId || UNIQUE_BUSINESS_ID,
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
    businessId: data.businessId || UNIQUE_BUSINESS_ID,
    appId: 'gastro_smart',
    creadoEn: data.creadoEn || new Date().toISOString()
  });

  const { id: expenseId, ref: expenseRef } = await guardarDocumento('expenses', sanitized);

  // Sincronizar gasto con dailyStats
  try {
    const fecha = (data.fecha || new Date().toISOString()).split('T')[0];
    const bId = data.businessId || UNIQUE_BUSINESS_ID;
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
        businessId: data.businessId || UNIQUE_BUSINESS_ID,
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
      const bId = exp.businessId || UNIQUE_BUSINESS_ID;
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
  abonoPrevio?: number;
  userDisplayName: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}): Promise<{ success: boolean; expenseId?: string; error?: string }> {
  const { employee, monthKey, monthLabel, amount, abonoPrevio = 0, userDisplayName, paymentMethod, notes } = params;

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
    const netAmount = Math.max(0, Math.round((amount - abonoPrevio) * 100) / 100);

    let expRef = null;
    if (netAmount > 0) {
      let finalDesc = `Pago de sueldo mensual fijo a ${employee.nombre} (${monthLabel})`;
      let finalNotes = notes || `Sueldo fijo mensual correspondiente al periodo ${monthLabel}. Procesado por ${userDisplayName}.`;
      if (abonoPrevio > 0) {
        finalDesc = `Liquidación final sueldo fijo ${monthLabel} - ${employee.nombre} (Base $${amount.toFixed(2)} - Abonos $${abonoPrevio.toFixed(2)} = Neto $${netAmount.toFixed(2)})`;
        finalNotes = `Liquidación neta tras deducir abonos previos de $${abonoPrevio.toFixed(2)}. ${notes || ''}`;
      }

      // 1. Crear Gasto de Sueldo por el neto pendiente
      const expenseData: Omit<Expense, 'id'> = {
        businessId: employee.businessId || UNIQUE_BUSINESS_ID,
        restaurantId: employee.restaurantId,
        tipo: 'sueldo',
        monto: netAmount,
        descripcion: finalDesc,
        employeeId: employee.id,
        employeeName: employee.nombre,
        modalidadPago: 'mes',
        metodoPago: paymentMethod || 'transferencia',
        notas: finalNotes,
        registradoPor: userDisplayName,
        fecha: today,
        creadoEn: new Date().toISOString()
      };

      expRef = await createExpense(expenseData);
    }

    // 2. Actualizar empleado con el mes pagado
    const empRef = doc(db, 'employees', employee.id);
    await updateDoc(empRef, {
      mesesPagados: [...currentPaidMonths, monthKey]
    });

    // 3. Alerta de seguridad / auditoría
    await createSecurityAlert({
      businessId: employee.businessId || UNIQUE_BUSINESS_ID,
      restaurantId: employee.restaurantId,
      tipo: 'pago_sueldos_generado',
      mensaje: `Sueldo fijo de ${monthLabel} pagado a ${employee.nombre} (Neto $${netAmount.toFixed(2)}, Abonos: $${abonoPrevio.toFixed(2)}) por ${userDisplayName}.`,
      fecha: new Date().toISOString(),
      leido: false,
      severidad: 'info'
    });

    return { success: true, expenseId: expRef?.id };
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

  const bId = data.businessId || UNIQUE_BUSINESS_ID;
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
 * Borra todo el tenant businessId (sucursales, mesas, empleados, cartas, pedidos, gastos, alertas, estadísticas).
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
    'securityAlerts',
    'dailyStats',
    'menuAuditLogs'
  ];

  for (const colName of collections) {
    const snap = await getDocs(query(collection(db, colName), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId)));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = snap.docs.slice(i, i + 400);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }

  // Eliminar el documento del negocio
  await deleteDoc(doc(db, 'businesses', businessId));
}

export const deleteAllAccountData = deleteBusinessCascade;

export interface TestOperationalSummary {
  pedidos: number;
  gastos: number;
  turnos: number;
  arqueos: number;
  alertas: number;
  estadisticas: number;
  mesasOcupadas: number;
}

export async function getTestOperationalCounts(businessId: string): Promise<TestOperationalSummary> {
  const [ordersSnap, expensesSnap, shiftsSnap, cashSnap, alertsSnap, statsSnap, tablesSnap] = await Promise.all([
    getDocs(query(collection(db, 'orders'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))),
    getDocs(query(collection(db, 'expenses'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))),
    getDocs(query(collection(db, 'shifts'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))),
    getDocs(query(collection(db, 'cashRegisterCloses'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))),
    getDocs(query(collection(db, 'securityAlerts'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))),
    getDocs(query(collection(db, 'dailyStats'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))),
    getDocs(query(collection(db, 'tables'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId)))
  ]);

  const mesasOcupadas = tablesSnap.docs.filter(d => d.data().estado !== 'libre').length;

  return {
    pedidos: ordersSnap.size,
    gastos: expensesSnap.size,
    turnos: shiftsSnap.size,
    arqueos: cashSnap.size,
    alertas: alertsSnap.size,
    estadisticas: statsSnap.size,
    mesasOcupadas
  };
}

/**
 * RESET DE FASE DE PRUEBAS:
 * Elimina todos los pedidos, cuentas, comandas, gastos, turnos de prueba, cierres de caja y alertas.
 * Desocupa y libera todas las mesas a 'libre'.
 * MANTIENE: Restaurantes, Mesas, Empleados con sus PINs y la Carta de Menú.
 */
export async function resetTestOperationalData(businessId: string): Promise<TestOperationalSummary> {
  const [ordersSnap, expensesSnap, shiftsSnap, cashSnap, alertsSnap, statsSnap, tablesSnap] = await Promise.all([
    getDocs(query(collection(db, 'orders'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))),
    getDocs(query(collection(db, 'expenses'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))),
    getDocs(query(collection(db, 'shifts'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))),
    getDocs(query(collection(db, 'cashRegisterCloses'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))),
    getDocs(query(collection(db, 'securityAlerts'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))),
    getDocs(query(collection(db, 'dailyStats'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))),
    getDocs(query(collection(db, 'tables'), where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId)))
  ]);

  const summary: TestOperationalSummary = {
    pedidos: ordersSnap.size,
    gastos: expensesSnap.size,
    turnos: shiftsSnap.size,
    arqueos: cashSnap.size,
    alertas: alertsSnap.size,
    estadisticas: statsSnap.size,
    mesasOcupadas: tablesSnap.docs.filter(d => d.data().estado !== 'libre').length
  };

  const deleteInChunks = async (docs: Array<any>) => {
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + 400);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  };

  await Promise.all([
    deleteInChunks(ordersSnap.docs),
    deleteInChunks(expensesSnap.docs),
    deleteInChunks(shiftsSnap.docs),
    deleteInChunks(cashSnap.docs),
    deleteInChunks(alertsSnap.docs),
    deleteInChunks(statsSnap.docs)
  ]);

  // Reset mesas a libre
  for (let i = 0; i < tablesSnap.docs.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = tablesSnap.docs.slice(i, i + 400);
    chunk.forEach(d => batch.update(d.ref, { estado: 'libre' }));
    await batch.commit();
  }

  return summary;
}

/**
 * Pone todas las suscripciones de negocios en versión "prueba" (Trial/Testing)
 * e incrementa sus días de validez para pruebas libres.
 */
export async function setAllBusinessesToTrialMode(): Promise<number> {
  const q = query(collection(db, 'businesses'), where('appId', '==', 'gastro_smart'));
  const snap = await getDocs(q);
  const now = new Date();
  const futureExpiry = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 días de prueba

  const batch = writeBatch(db);
  let count = 0;

  snap.docs.forEach(docSnap => {
    const data = docSnap.data() as Business;
    const currentSub = data.suscripcion || {
      plan: data.plan || 'pro',
      estado: 'prueba',
      fechaInicio: now.toISOString(),
      fechaVencimiento: futureExpiry,
      limiteSucursales: 5,
      limiteMesasPorSucursal: 50,
      limiteUsuarios: 20,
      precioMensualUSD: 0,
      notasSuscripcion: 'Modo Prueba / Testing Activado Globalmente'
    };

    batch.update(docSnap.ref, {
      activo: true,
      suscripcion: {
        ...currentSub,
        estado: 'prueba',
        fechaVencimiento: futureExpiry,
        notasSuscripcion: (currentSub.notasSuscripcion || '') + ' [VERSIÓN PRUEBA]'
      }
    });
    count++;
  });

  await batch.commit();
  return count;
}

/**
 * Sembrar datos rápidos de prueba si el menú o mesas están vacíos
 */
export async function seedQuickTestingDishesAndOrder(businessId: string, restaurantId: string): Promise<void> {
  const menuSnap = await getDocs(query(
    collection(db, 'menuItems'), 
    where('appId', '==', 'gastro_smart'), 
    where('businessId', '==', businessId)
  ));

  if (menuSnap.size === 0) {
    await seedSampleDishesForBusiness(businessId, restaurantId);
  }
}

/**
 * SIMULADOR OPERATIVO: Crea una comanda de prueba en una mesa con notas de cocina
 */
export async function simulateTableOrder(
  businessId: string, 
  restaurantId: string, 
  mesaNumero: number = 1
): Promise<{ orderId: string; tableNumber: number; total: number }> {
  await seedQuickTestingDishesAndOrder(businessId, restaurantId);

  const menuSnap = await getDocs(query(
    collection(db, 'menuItems'),
    where('appId', '==', 'gastro_smart'),
    where('businessId', '==', businessId)
  ));
  const menuList = menuSnap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem));

  const itemsToOrder: OrderItem[] = menuList.slice(0, 2).map((item, idx) => ({
    menuItemId: item.id,
    nombre: item.nombre,
    precio: item.precio,
    cantidad: idx === 0 ? 2 : 1,
    notas: idx === 0 ? 'Término medio, sin cebolla' : 'Salsa aparte, bien caliente',
    requiereCocina: true,
    estadoItem: 'pendiente'
  }));

  if (itemsToOrder.length === 0) {
    itemsToOrder.push({
      menuItemId: 'demo-dish-1',
      nombre: 'Hamburguesa Gourmet Angus',
      precio: 14.50,
      cantidad: 2,
      notas: 'Término medio, sin cebolla',
      requiereCocina: true,
      estadoItem: 'pendiente'
    });
  }

  const subtotal = itemsToOrder.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
  const impuesto = Math.round(subtotal * 0.12 * 100) / 100;
  const total = Math.round((subtotal + impuesto) * 100) / 100;

  // Buscar o crear la mesa
  let targetTableId: string | null = null;
  const tableSnap = await getDocs(query(
    collection(db, 'tables'),
    where('appId', '==', 'gastro_smart'),
    where('restaurantId', '==', restaurantId),
    where('numero', '==', mesaNumero)
  ));

  if (!tableSnap.empty) {
    targetTableId = tableSnap.docs[0].id;
  } else {
    const createdTable = await addDoc(collection(db, 'tables'), {
      businessId,
      restaurantId,
      numero: mesaNumero,
      capacidad: 4,
      estado: 'libre',
      appId: 'gastro_smart'
    });
    targetTableId = createdTable.id;
  }

  const orderId = await createOrder({
    businessId,
    restaurantId,
    meseroId: 'simulador',
    meseroNombre: 'Simulador de Pruebas',
    tipo: 'local',
    mesaId: targetTableId,
    mesaNumero,
    items: itemsToOrder,
    total,
    metodoPago: 'efectivo',
    estado: 'pendiente_cocina',
    estadoPago: 'pendiente',
    clienteNombre: 'Mesa ' + mesaNumero + ' (Simulación)'
  });

  await updateDoc(doc(db, 'tables', targetTableId), {
    estado: 'ocupada',
    comandaActivaId: orderId
  });

  return { orderId, tableNumber: mesaNumero, total };
}

/**
 * SIMULADOR OPERATIVO: Crea un pedido express de mostrador / delivery
 */
export async function simulateExpressOrder(
  businessId: string, 
  restaurantId: string,
  tipo: 'mostrador' | 'delivery' = 'mostrador'
): Promise<{ orderId: string; total: number; canal: string }> {
  await seedQuickTestingDishesAndOrder(businessId, restaurantId);

  const menuSnap = await getDocs(query(
    collection(db, 'menuItems'),
    where('appId', '==', 'gastro_smart'),
    where('businessId', '==', businessId)
  ));
  const menuList = menuSnap.docs.map(d => ({ id: d.id, ...d.data() } as MenuItem));

  const selectedItem = menuList[0] || {
    id: 'demo-item',
    nombre: 'Combo Alitas BBQ + Papas',
    precio: 11.90
  };

  const items: OrderItem[] = [{
    menuItemId: selectedItem.id,
    nombre: selectedItem.nombre,
    precio: selectedItem.precio,
    cantidad: 1,
    notas: tipo === 'delivery' ? 'Empaque sellado para delivery' : 'Para llevar en bolsa kraft',
    requiereCocina: true,
    estadoItem: 'pendiente'
  }];

  const subtotal = items[0].precio * items[0].cantidad;
  const impuesto = Math.round(subtotal * 0.12 * 100) / 100;
  const deliveryFee = tipo === 'delivery' ? 2.50 : 0;
  const total = Math.round((subtotal + impuesto + deliveryFee) * 100) / 100;

  const orderId = await createOrder({
    businessId,
    restaurantId,
    meseroId: 'simulador',
    meseroNombre: 'Mostrador / Simulador',
    tipo: tipo === 'delivery' ? 'delivery' : 'para_llevar',
    empresaDelivery: tipo === 'delivery' ? 'PedidosYa' : undefined,
    mesaId: null,
    items,
    total,
    metodoPago: 'efectivo',
    estado: 'pendiente_cocina',
    estadoPago: 'pendiente',
    clienteNombre: tipo === 'delivery' ? 'Cliente Delivery (Simulado)' : 'Cliente Mostrador (Simulado)',
    clienteTelefono: '0991234567',
    clienteDireccion: tipo === 'delivery' ? 'Av. Principal #123 y Calle 4' : undefined
  });

  return { orderId, total, canal: tipo === 'delivery' ? 'PedidosYa / Delivery' : 'Mostrador Express' };
}

/**
 * SIMULADOR OPERATIVO: Simula apertura de turno de caja
 */
export async function simulateCashShift(
  businessId: string,
  restaurantId: string,
  restaurantNombre: string,
  fondoInicial: number = 50.00
): Promise<{ shiftId: string; fondoInicial: number; employeeName: string }> {
  const empSnap = await getDocs(query(
    collection(db, 'employees'),
    where('appId', '==', 'gastro_smart'),
    where('businessId', '==', businessId)
  ));
  
  let employeeName = 'Cajero de Pruebas';
  let employeeId = 'cajero-test-id';
  let employeePuesto: Role = 'caja';

  if (!empSnap.empty) {
    const cashiers = empSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)).filter(e => e.puesto === 'caja');
    const emp = cashiers[0] || (empSnap.docs[0].data() as Employee);
    employeeName = emp.nombre;
    employeeId = empSnap.docs[0].id;
    employeePuesto = emp.puesto;
  }

  const today = new Date().toISOString().split('T')[0];
  const shiftDoc = await addDoc(collection(db, 'shifts'), {
    businessId,
    employeeId,
    employeeName,
    employeePuesto,
    restaurantId,
    restaurantNombre,
    fecha: today,
    horaInicio: new Date().toISOString(),
    estado: 'abierto',
    fondoInicial,
    pedidosTomados: 0,
    ventasGeneradas: 0,
    pagado: false,
    appId: 'gastro_smart'
  });

  return { shiftId: shiftDoc.id, fondoInicial, employeeName };
}

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
export async function bootstrapNewBusinessDefaults(
  businessId: string,
  businessName: string,
  logoUrl?: string | null,
  customCodigoSede?: string
): Promise<{ restaurantId: string; codigoSede: string }> {
  // 1. Crear sucursal principal con código de sede único de 4 dígitos (asignado por el creador o autogenerado)
  const cleanCustomCode = (customCodigoSede || '').replace(/\D/g, '').slice(0, 4);
  let finalCodigoSede = cleanCustomCode.length === 4 ? cleanCustomCode : '';
  if (!finalCodigoSede) {
    const existingSnap = await getDocs(query(collection(db, 'restaurants'), where('appId', '==', 'gastro_smart')));
    const existingCodes = new Set(existingSnap.docs.map(d => d.data().codigoSede).filter(Boolean));
    finalCodigoSede = generateUniqueBranchCode(existingCodes);
  }

  const restRef = await addDoc(collection(db, 'restaurants'), {
    businessId,
    nombre: `${businessName.trim()} - Sede Principal`,
    direccion: 'Av. Principal #100',
    telefono: '+1 (555) 000-0000',
    codigoSede: finalCodigoSede,
    numeroMesas: 12,
    activo: true,
    logoUrl: logoUrl || null,
    appId: 'gastro_smart',
    creadoEn: new Date().toISOString()
  });

  const restaurantId = restRef.id;

  try {
    const updatePayload: Record<string, any> = { codigoSede: finalCodigoSede };
    if (logoUrl) updatePayload.logoUrl = logoUrl;
    await updateDoc(doc(db, 'businesses', businessId), updatePayload);
  } catch {
    // Ignorar si el negocio aún no terminó de escribirse
  }

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

  return { restaurantId, codigoSede: finalCodigoSede };
}

/**
 * Permite al Creador (SuperAdmin) o Propietario asignar, crear o modificar el código de 4 dígitos
 * de una empresa / sede y sincronizarlo en las colecciones 'businesses' y 'restaurants'.
 */
export async function assignOrCreateBranchCodeForBusiness(params: {
  businessId: string;
  businessName: string;
  codigoSede: string;
  restaurantId?: string;
  logoUrl?: string | null;
}): Promise<{ codigoSede: string; restaurantId: string }> {
  const cleanCode = (params.codigoSede || '').replace(/\D/g, '').slice(0, 4);
  if (cleanCode.length !== 4) {
    throw new Error('El código de sede debe tener exactamente 4 dígitos numéricos.');
  }

  // 1. Actualizar el código en el documento de la empresa ('businesses')
  try {
    await setDoc(
      doc(db, 'businesses', params.businessId),
      { codigoSede: cleanCode, appId: 'gastro_smart' },
      { merge: true }
    );
  } catch (e) {
    console.warn('Could not update codigoSede on businesses doc:', e);
  }

  // 2. Si se especificó un restaurantId concreto, actualizarlo directamente
  if (params.restaurantId) {
    await updateDoc(doc(db, 'restaurants', params.restaurantId), {
      codigoSede: cleanCode
    });
    return { codigoSede: cleanCode, restaurantId: params.restaurantId };
  }

  // 3. Buscar sucursales existentes para este businessId
  const restSnap = await getDocs(
    query(
      collection(db, 'restaurants'),
      where('appId', '==', 'gastro_smart'),
      where('businessId', '==', params.businessId)
    )
  );

  if (!restSnap.empty) {
    const primaryRest = restSnap.docs[0];
    await updateDoc(doc(db, 'restaurants', primaryRest.id), {
      codigoSede: cleanCode
    });
    return { codigoSede: cleanCode, restaurantId: primaryRest.id };
  }

  // 4. Si la empresa aún no tenía sucursal creada en 'restaurants', inicializarla con este código de 4 dígitos
  const created = await bootstrapNewBusinessDefaults(
    params.businessId,
    params.businessName || 'Restaurante',
    params.logoUrl || null,
    cleanCode
  );
  return { codigoSede: created.codigoSede, restaurantId: created.restaurantId };
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
      const isPaid = o.estado === 'cobrado' || o.estadoPago === 'cobrado';
      if (!isPaid) return;
      const orderDate = getOperationalDateString(o.cobradoEn || o.creadoEn);
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
  const targetDate = dateStr || getOperationalDateString(new Date());
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
        if (!ord.businessId || (ord.businessId === UNIQUE_BUSINESS_ID && businessId !== UNIQUE_BUSINESS_ID)) {
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
 * Obtener pedidos históricos con filtros avanzados (fecha, sucursal, método de pago, estado)
 */
export async function fetchHistoricalOrders(params: {
  businessId?: string;
  restaurantId?: string;
  startDate?: string;
  endDate?: string;
  paymentMethod?: string;
  status?: string;
  maxLimit?: number;
}): Promise<Order[]> {
  try {
    const colRef = collection(db, 'orders');
    let q = query(
      colRef,
      where('appId', '==', 'gastro_smart'),
      limit(params.maxLimit || 400)
    );
    if (params.businessId) {
      q = query(colRef, where('appId', '==', 'gastro_smart'), where('businessId', '==', params.businessId), limit(params.maxLimit || 400));
    }
    const snap = await getDocs(q);
    let list: Order[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
    
    if (params.restaurantId && params.restaurantId !== 'all') {
      list = list.filter(o => o.restaurantId === params.restaurantId);
    }
    if (params.startDate) {
      list = list.filter(o => {
        const orderDate = (o.creadoEn || '').split('T')[0];
        return orderDate >= params.startDate!;
      });
    }
    if (params.endDate) {
      list = list.filter(o => {
        const orderDate = (o.creadoEn || '').split('T')[0];
        return orderDate <= params.endDate!;
      });
    }
    if (params.paymentMethod && params.paymentMethod !== 'all') {
      list = list.filter(o => {
        if (params.paymentMethod === 'mixto') {
          return (o.cobros && o.cobros.length > 1);
        }
        if (o.metodoPago === params.paymentMethod) return true;
        if (o.cobros?.some(c => c.metodoPago === params.paymentMethod)) return true;
        return false;
      });
    }
    if (params.status && params.status !== 'all') {
      list = list.filter(o => o.estado === params.status || o.estadoPago === params.status);
    }

    list.sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());
    return list;
  } catch (err) {
    console.error('Error fetching historical orders:', err);
    return [];
  }
}

/**
 * Pago masivo de nóminas / sueldos y generación de gastos automáticos
 * Soporta cálculo dinámico según la modalidad del empleado (por hora, por día / jornal, o mensual)
 */
export async function paySalaryBatch(
  businessId: string,
  restaurantId: string,
  shifts: Shift[],
  employeeRateMap: Record<string, number>,
  periodLabel: string,
  userName: string,
  overtimeMultiplier = 1.5,
  employeeDataMap?: Record<string, { modalidad?: string; tarifaHora?: number; tarifaDiaria?: number; sueldoMensual?: number }>,
  abonosMap?: Record<string, number>
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
    const empInfo = employeeDataMap ? employeeDataMap[employeeId] : undefined;
    const rawMod = empInfo?.modalidad || 'por_dia';
    const isMonthly = rawMod === 'mes' || rawMod === 'fijo';
    const modalidad = isMonthly ? 'mes' : 'por_dia';
    const employeeName = empShifts[0]?.employeeName || 'Empleado';

    // Días trabajados únicos bajo el ciclo operativo (5:00 a.m. - 4:59 a.m.)
    const uniqueDays = new Set(
      empShifts.map(s => getOperationalDateString(s.horaInicio || s.fecha))
    ).size;
    const daysCount = uniqueDays || empShifts.length;

    const dailyRate = (empInfo?.tarifaDiaria && empInfo.tarifaDiaria > 0)
      ? empInfo.tarifaDiaria
      : (empInfo?.sueldoMensual && empInfo.sueldoMensual > 0)
        ? Math.round((empInfo.sueldoMensual / 30) * 100) / 100
        : (empInfo?.tarifaHora && empInfo.tarifaHora > 0)
          ? Math.round(empInfo.tarifaHora * 8 * 100) / 100
          : (employeeRateMap[employeeId] || 50);

    let totalPay = 0;
    let description = '';

    if (isMonthly) {
      const monthlySalary = (empInfo?.sueldoMensual && empInfo.sueldoMensual > 0)
        ? empInfo.sueldoMensual
        : Math.round(dailyRate * 30 * 100) / 100;
      totalPay = Math.round(monthlySalary * 100) / 100;
      description = `Pago de sueldo mensual ${periodLabel} - ${employeeName} (${daysCount} días trabajados • Sueldo base $${monthlySalary.toFixed(2)}/mes)`;
    } else {
      totalPay = Math.round(daysCount * dailyRate * 100) / 100;
      description = `Pago de sueldo por días trabajados (${periodLabel}) - ${employeeName} (${daysCount} ${daysCount === 1 ? 'día trabajado' : 'días trabajados'} a $${dailyRate.toFixed(2)}/día)`;
    }

    const abonoPrevio = abonosMap ? (abonosMap[employeeId] || 0) : 0;
    const netPay = Math.max(0, Math.round((totalPay - abonoPrevio) * 100) / 100);

    totalPaidOverall += netPay;

    // 1. Crear gasto de sueldo únicamente si hay un saldo neto por liquidar
    if (netPay > 0) {
      let finalDescription = description;
      if (abonoPrevio > 0) {
        finalDescription = `Liquidación final de sueldo ${periodLabel} - ${employeeName} (${daysCount} días trabajados • Sueldo $${totalPay.toFixed(2)} - Abonos $${abonoPrevio.toFixed(2)} = Neto $${netPay.toFixed(2)})`;
      }

      await createExpense({
        businessId,
        restaurantId: empShifts[0]?.restaurantId || restaurantId,
        tipo: 'sueldo',
        monto: netPay,
        descripcion: finalDescription,
        employeeId,
        employeeName,
        diasTrabajados: daysCount,
        modalidadPago: modalidad,
        tarifaDiaria: dailyRate,
        fecha: today,
        appId: 'gastro_smart',
        creadoEn: now
      });
    }

    // 2. Marcar cada shift como pagado
    const perShiftPay = empShifts.length > 0 ? Math.round((totalPay / empShifts.length) * 100) / 100 : dailyRate;
    for (const shift of empShifts) {
      const shiftRef = doc(db, 'shifts', shift.id);
      await updateDoc(shiftRef, {
        pagado: true,
        fechaPago: now,
        montoPagadoSueldo: perShiftPay,
        sueldoPagado: true,
        sueldoTotal: perShiftPay
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

// ==========================================
// REGISTROS DE AUDITORÍA DE MENÚ Y STOCK
// ==========================================

export async function recordMenuAuditLog(entry: Omit<MenuAuditLog, 'id' | 'appId'>): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, 'menuAuditLogs'), {
      ...entry,
      appId: 'gastro_smart',
      fecha: entry.fecha || new Date().toISOString()
    });
    return docRef.id;
  } catch (err) {
    console.warn('Error al registrar auditoría de menú y stock:', err);
    return '';
  }
}

export function subscribeToMenuAuditLogs(
  businessId: string | null,
  callback: (logs: MenuAuditLog[]) => void,
  maxLimit: number = 200
) {
  if (!businessId) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, 'menuAuditLogs'),
    where('appId', '==', 'gastro_smart'),
    where('businessId', '==', businessId),
    limit(maxLimit)
  );

  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as MenuAuditLog));
    // Ordenar descendentemente por fecha y hora exacta
    list.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (menuAuditLogs):', err);
  });
}

export async function seedSampleMenuAuditLogsIfEmpty(
  businessId: string,
  employeesList: Employee[],
  menuItemsList: MenuItem[]
): Promise<void> {
  try {
    const snap = await getDocs(query(
      collection(db, 'menuAuditLogs'),
      where('appId', '==', 'gastro_smart'),
      where('businessId', '==', businessId),
      limit(1)
    ));

    if (!snap.empty) return; // Ya existen registros

    if (!menuItemsList || menuItemsList.length === 0) return;

    const sampleEmployees = employeesList.length > 0 
      ? employeesList 
      : [{ id: 'emp-admin', nombre: 'Admin General', puesto: 'admin' as Role }];

    const now = Date.now();
    const batch = writeBatch(db);

    const sampleActions: Array<{
      itemIndex: number;
      empIndex: number;
      tipoAccion: MenuAuditActionType;
      detalles: string;
      cambios?: MenuAuditLogChange[];
      minutesAgo: number;
    }> = [
      {
        itemIndex: 0,
        empIndex: 0,
        tipoAccion: 'ajuste_stock',
        detalles: 'Reposición rápida de stock: +15 unidades añadidas tras llegada de proveedor.',
        cambios: [{ campo: 'stockActual', valorAnterior: 5, valorNuevo: 20 }],
        minutesAgo: 25
      },
      {
        itemIndex: 1,
        empIndex: sampleEmployees.length > 1 ? 1 : 0,
        tipoAccion: 'modificacion_plato',
        detalles: 'Actualización de precio de venta: $12.00 → $13.50 por ajuste en costo de ingredientes.',
        cambios: [
          { campo: 'precio', valorAnterior: 12, valorNuevo: 13.5 },
          { campo: 'costoElaboracion', valorAnterior: 4.5, valorNuevo: 5.2 }
        ],
        minutesAgo: 70
      },
      {
        itemIndex: 2,
        empIndex: 0,
        tipoAccion: 'cambio_disponibilidad',
        detalles: 'Plato marcado temporalmente como Fuera de Carta por falta de insumos frescos.',
        cambios: [{ campo: 'disponible', valorAnterior: true, valorNuevo: false }],
        minutesAgo: 180
      },
      {
        itemIndex: 0,
        empIndex: sampleEmployees.length > 2 ? 2 : 0,
        tipoAccion: 'creacion_plato',
        detalles: 'Alta de nuevo plato en carta con receta y destino de preparación en Cocina.',
        minutesAgo: 360
      }
    ];

    sampleActions.forEach((action, idx) => {
      const item = menuItemsList[action.itemIndex % menuItemsList.length];
      const emp = sampleEmployees[action.empIndex % sampleEmployees.length];
      const logDate = new Date(now - action.minutesAgo * 60 * 1000).toISOString();

      const ref = doc(collection(db, 'menuAuditLogs'));
      batch.set(ref, {
        businessId,
        restaurantId: item.restaurantId || 'central',
        restaurantNombre: 'Sucursal Principal',
        platoId: item.id,
        platoNombre: item.nombre,
        tipoAccion: action.tipoAccion,
        detalles: action.detalles,
        cambios: action.cambios || [],
        empleadoId: emp.id,
        empleadoNombre: emp.nombre,
        empleadoRol: emp.puesto,
        fecha: logDate,
        appId: 'gastro_smart'
      });
    });

    await batch.commit();
  } catch (err) {
    console.warn('Error sembrando registros de auditoría de muestra:', err);
  }
}

// ==========================================
// SISTEMA DE GESTIÓN DE INVENTARIO E INSUMOS
// ==========================================

export function subscribeToInventoryItems(
  arg1?: string | null | ((items: InventoryItem[]) => void),
  arg2?: ((items: InventoryItem[]) => void) | string | null,
  arg3?: string | null
) {
  let restaurantId: string | null = null;
  let businessId: string | null = null;
  let callback: (items: InventoryItem[]) => void = () => {};

  if (typeof arg1 === 'function') {
    callback = arg1;
    if (typeof arg2 === 'string') businessId = arg2;
  } else {
    restaurantId = arg1 || null;
    if (typeof arg2 === 'function') {
      callback = arg2;
      if (typeof arg3 === 'string') businessId = arg3;
    }
  }

  const colRef = collection(db, 'inventoryItems');
  const q = businessId
    ? query(colRef, where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))
    : query(colRef, where('appId', '==', 'gastro_smart'));

  return onSnapshot(
    q,
    (snapshot) => {
      let list: InventoryItem[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as InventoryItem));
      if (restaurantId && restaurantId !== 'all') {
        list = list.filter(i => !i.restaurantId || i.restaurantId === 'all' || i.restaurantId === restaurantId);
      }
      list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      callback(list);
    },
    (err) => {
      console.warn('Subscription warning (inventoryItems):', err);
    }
  );
}

export async function createInventoryItem(
  data: Omit<InventoryItem, 'id' | 'appId'>
): Promise<string> {
  const nowIso = new Date().toISOString();
  const payload = {
    ...data,
    businessId: data.businessId || UNIQUE_BUSINESS_ID,
    restaurantId: data.restaurantId || 'all',
    stockActual: Math.max(0, Number(data.stockActual) || 0),
    stockMinimo: Math.max(1, Number(data.stockMinimo) || 5),
    unidadMedida: data.unidadMedida || 'unidades',
    costoUnitario: Number(data.costoUnitario) || 0,
    ultimaActualizacion: nowIso,
    appId: 'gastro_smart' as const
  };
  const docRef = await addDoc(collection(db, 'inventoryItems'), payload);
  return docRef.id;
}

export async function updateInventoryItem(
  id: string,
  data: Partial<InventoryItem>
): Promise<void> {
  const cleaned: Record<string, any> = {
    ultimaActualizacion: new Date().toISOString()
  };
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      cleaned[key] = val;
    }
  }
  await updateDoc(doc(db, 'inventoryItems', id), cleaned);
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await deleteDoc(doc(db, 'inventoryItems', id));
}

export async function quickAdjustInventoryItemStock(
  id: string,
  delta: number,
  userName: string = 'Administrador',
  businessId: string = UNIQUE_BUSINESS_ID
): Promise<number> {
  const ref = doc(db, 'inventoryItems', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return 0;

  const inv = { id: snap.id, ...snap.data() } as InventoryItem;
  const prevStock = Number(inv.stockActual) || 0;
  const newStock = Math.max(0, Math.round((prevStock + delta) * 1000) / 1000);
  const nowIso = new Date().toISOString();

  await updateDoc(ref, {
    stockActual: newStock,
    ultimaActualizacion: nowIso
  });

  await recordMenuAuditLog({
    businessId: inv.businessId || businessId,
    restaurantId: inv.restaurantId || 'all',
    platoId: inv.id,
    platoNombre: `Insumo: ${inv.nombre}`,
    tipoAccion: 'ajuste_insumo',
    detalles: `Ajuste de stock de insumo "${inv.nombre}": ${delta > 0 ? `+${delta}` : delta} ${inv.unidadMedida} (${prevStock} → ${newStock} ${inv.unidadMedida})`,
    cambios: [{ campo: 'stockActual', valorAnterior: prevStock, valorNuevo: newStock }],
    empleadoNombre: userName,
    empleadoRol: 'Inventario',
    fecha: nowIso
  });

  return newStock;
}

/**
 * Siembra insumos base realistas y vincula automáticamente recetas a los platos de la carta
 * para que al marcar cualquier pedido como 'entregado' se descuenten insumos y se activen alertas críticas.
 */
export async function seedDefaultInventoryItemsAndLinkDishes(
  businessId: string,
  restaurantId: string,
  menuItems: MenuItem[]
): Promise<{ createdCount: number; linkedDishesCount: number }> {
  const targetBizId = businessId || UNIQUE_BUSINESS_ID;
  const targetRestId = restaurantId || 'all';
  const nowIso = new Date().toISOString();

  const existingSnap = await getDocs(
    query(
      collection(db, 'inventoryItems'),
      where('appId', '==', 'gastro_smart'),
      where('businessId', '==', targetBizId)
    )
  );

  const existingByName = new Map<string, InventoryItem>();
  existingSnap.docs.forEach(d => {
    const item = { id: d.id, ...d.data() } as InventoryItem;
    existingByName.set(item.nombre.trim().toLowerCase(), item);
  });

  const baseSupplies: Array<Omit<InventoryItem, 'id' | 'appId'>> = [
    {
      businessId: targetBizId,
      restaurantId: targetRestId,
      nombre: 'Carne de Res Premium (Porción 200g)',
      categoria: 'Carnes y Proteínas',
      stockActual: 12,
      stockMinimo: 10,
      unidadMedida: 'porciones',
      costoUnitario: 2.2,
      proveedor: 'Frigorífico Central',
      ultimaActualizacion: nowIso
    },
    {
      businessId: targetBizId,
      restaurantId: targetRestId,
      nombre: 'Pechuga de Pollo Fresca (Porción)',
      categoria: 'Carnes y Proteínas',
      stockActual: 14,
      stockMinimo: 10,
      unidadMedida: 'porciones',
      costoUnitario: 1.6,
      proveedor: 'Avícola del Valle',
      ultimaActualizacion: nowIso
    },
    {
      businessId: targetBizId,
      restaurantId: targetRestId,
      nombre: 'Pan Brioche / Artesanal',
      categoria: 'Panadería y Harinas',
      stockActual: 9,
      stockMinimo: 10, // Inicia justo bajo umbral crítico para evidenciar alerta visual inmediata
      unidadMedida: 'unidades',
      costoUnitario: 0.45,
      proveedor: 'Panadería La Espiga',
      ultimaActualizacion: nowIso
    },
    {
      businessId: targetBizId,
      restaurantId: targetRestId,
      nombre: 'Queso Cheddar / Mozzarella',
      categoria: 'Lácteos y Quesos',
      stockActual: 15,
      stockMinimo: 12,
      unidadMedida: 'porciones',
      costoUnitario: 0.5,
      proveedor: 'Lácteos Andinos',
      ultimaActualizacion: nowIso
    },
    {
      businessId: targetBizId,
      restaurantId: targetRestId,
      nombre: 'Papas Seleccionadas para Freír',
      categoria: 'Verduras y Guarniciones',
      stockActual: 8,
      stockMinimo: 8, // En el umbral crítico para disparar alerta al entregar 1 pedido
      unidadMedida: 'porciones',
      costoUnitario: 0.65,
      proveedor: 'Mercado Mayorista',
      ultimaActualizacion: nowIso
    },
    {
      businessId: targetBizId,
      restaurantId: targetRestId,
      nombre: 'Mix Vegetales Frescos (Lechuga y Tomate)',
      categoria: 'Verduras y Guarniciones',
      stockActual: 20,
      stockMinimo: 8,
      unidadMedida: 'porciones',
      costoUnitario: 0.35,
      proveedor: 'Mercado Mayorista',
      ultimaActualizacion: nowIso
    },
    {
      businessId: targetBizId,
      restaurantId: targetRestId,
      nombre: 'Aceite Vegetal y Salsas Base',
      categoria: 'Abarrotes y Salsas',
      stockActual: 25,
      stockMinimo: 6,
      unidadMedida: 'porciones',
      costoUnitario: 0.25,
      proveedor: 'Distribuidora Global',
      ultimaActualizacion: nowIso
    },
    {
      businessId: targetBizId,
      restaurantId: targetRestId,
      nombre: 'Bebida / Refresco Frío',
      categoria: 'Bebidas',
      stockActual: 7,
      stockMinimo: 8,
      unidadMedida: 'unidades',
      costoUnitario: 0.8,
      proveedor: 'Embotelladora Nacional',
      ultimaActualizacion: nowIso
    },
    {
      businessId: targetBizId,
      restaurantId: targetRestId,
      nombre: 'Servilletas y Empaque de Servicio',
      categoria: 'Empaques y Descartables',
      stockActual: 30,
      stockMinimo: 10,
      unidadMedida: 'unidades',
      costoUnitario: 0.15,
      proveedor: 'EcoPack',
      ultimaActualizacion: nowIso
    }
  ];

  const batch = writeBatch(db);
  let createdCount = 0;

  for (const sup of baseSupplies) {
    const key = sup.nombre.trim().toLowerCase();
    if (!existingByName.has(key)) {
      const newRef = doc(collection(db, 'inventoryItems'));
      const fullItem: InventoryItem = {
        ...sup,
        id: newRef.id,
        appId: 'gastro_smart'
      };
      batch.set(newRef, {
        ...sup,
        appId: 'gastro_smart'
      });
      existingByName.set(key, fullItem);
      createdCount++;
    }
  }

  const getInsumo = (partialName: string): InventoryItem | undefined => {
    for (const [k, val] of existingByName.entries()) {
      if (k.includes(partialName.toLowerCase())) return val;
    }
    return undefined;
  };

  const carne = getInsumo('carne');
  const pollo = getInsumo('pollo');
  const pan = getInsumo('pan');
  const queso = getInsumo('queso');
  const papas = getInsumo('papas');
  const vegetales = getInsumo('vegetales');
  const aceite = getInsumo('aceite');
  const bebida = getInsumo('bebida');
  const empaque = getInsumo('empaque');

  let linkedDishesCount = 0;

  for (const dish of menuItems) {
    if (dish.insumosReceta && dish.insumosReceta.length > 0) continue;

    const nameLower = (dish.nombre || '').toLowerCase();
    const catLower = (dish.categoria || '').toLowerCase();
    const recipe: DishIngredient[] = [];

    if (
      nameLower.includes('hamburguesa') ||
      nameLower.includes('burger') ||
      nameLower.includes('sandwich') ||
      nameLower.includes('sándwich') ||
      nameLower.includes('pepito')
    ) {
      if (carne) recipe.push({ insumoId: carne.id, insumoNombre: carne.nombre, cantidadPorUnidad: 1, unidadMedida: carne.unidadMedida });
      if (pan) recipe.push({ insumoId: pan.id, insumoNombre: pan.nombre, cantidadPorUnidad: 1, unidadMedida: pan.unidadMedida });
      if (queso) recipe.push({ insumoId: queso.id, insumoNombre: queso.nombre, cantidadPorUnidad: 1, unidadMedida: queso.unidadMedida });
      if (papas) recipe.push({ insumoId: papas.id, insumoNombre: papas.nombre, cantidadPorUnidad: 1, unidadMedida: papas.unidadMedida });
    } else if (
      nameLower.includes('pollo') ||
      nameLower.includes('alitas') ||
      nameLower.includes('broaster') ||
      nameLower.includes('pechuga')
    ) {
      if (pollo) recipe.push({ insumoId: pollo.id, insumoNombre: pollo.nombre, cantidadPorUnidad: 1, unidadMedida: pollo.unidadMedida });
      if (papas) recipe.push({ insumoId: papas.id, insumoNombre: papas.nombre, cantidadPorUnidad: 1, unidadMedida: papas.unidadMedida });
      if (aceite) recipe.push({ insumoId: aceite.id, insumoNombre: aceite.nombre, cantidadPorUnidad: 1, unidadMedida: aceite.unidadMedida });
    } else if (
      catLower.includes('bebida') ||
      nameLower.includes('coca') ||
      nameLower.includes('gaseosa') ||
      nameLower.includes('jugo') ||
      nameLower.includes('agua') ||
      nameLower.includes('cerveza') ||
      nameLower.includes('refresco')
    ) {
      if (bebida) recipe.push({ insumoId: bebida.id, insumoNombre: bebida.nombre, cantidadPorUnidad: 1, unidadMedida: bebida.unidadMedida });
    } else {
      // Plato general de cocina
      if (carne) recipe.push({ insumoId: carne.id, insumoNombre: carne.nombre, cantidadPorUnidad: 1, unidadMedida: carne.unidadMedida });
      if (vegetales) recipe.push({ insumoId: vegetales.id, insumoNombre: vegetales.nombre, cantidadPorUnidad: 1, unidadMedida: vegetales.unidadMedida });
      if (papas) recipe.push({ insumoId: papas.id, insumoNombre: papas.nombre, cantidadPorUnidad: 1, unidadMedida: papas.unidadMedida });
    }

    if (empaque) {
      recipe.push({ insumoId: empaque.id, insumoNombre: empaque.nombre, cantidadPorUnidad: 1, unidadMedida: empaque.unidadMedida });
    }

    if (recipe.length > 0) {
      batch.update(doc(db, 'menuItems', dish.id), {
        insumosReceta: recipe
      });
      linkedDishesCount++;
    }
  }

  await batch.commit();
  return { createdCount, linkedDishesCount };
}

// ==========================================
// CONFIGURACIÓN DEL NEGOCIO (IMPUESTOS, FIDELIZACIÓN, IDIOMA)
// ==========================================

export async function updateBusinessSettings(
  businessId: string,
  settings: Partial<Pick<Business, 'porcentajeImpuesto' | 'impuestoIncluidoEnPrecio' | 'fidelidadMontoPorPunto' | 'fidelidadPuntosPorUnidad' | 'idioma' | 'nombre' | 'telefono' | 'direccion'>>
): Promise<void> {
  const targetBizId = businessId || UNIQUE_BUSINESS_ID;
  const ref = doc(db, 'businesses', targetBizId);
  const snap = await getDoc(ref);
  const cleaned = limpiarDatosUndefined({
    ...settings,
    appId: 'gastro_smart'
  });
  if (snap.exists()) {
    await updateDoc(ref, cleaned);
  } else {
    await setDoc(ref, {
      id: targetBizId,
      nombre: settings.nombre || 'Gastro Smart',
      rif_o_ruc: 'J-00000000-0',
      plan: 'enterprise',
      activo: true,
      creadoEn: new Date().toISOString(),
      ownerUid: targetBizId,
      ...cleaned
    }, { merge: true });
  }
  setGlobalBusinessTaxConfig(settings);
}

// ==========================================
// PROGRAMA DE FIDELIZACIÓN / PUNTOS DE CLIENTES
// ==========================================

export function normalizePhoneForLoyalty(phone: string): string {
  return (phone || '').replace(/[^\d+]/g, '').trim();
}

export async function findClientByPhone(
  businessId: string,
  phone: string
): Promise<Client | null> {
  const cleanPhone = normalizePhoneForLoyalty(phone);
  if (!cleanPhone) return null;

  const targetBizId = businessId || UNIQUE_BUSINESS_ID;
  const snap = await getDocs(
    query(
      collection(db, 'clients'),
      where('appId', '==', 'gastro_smart'),
      where('businessId', '==', targetBizId)
    )
  );

  for (const d of snap.docs) {
    const data = d.data() as Client;
    const docPhone = normalizePhoneForLoyalty(data.telefono || '');
    if (docPhone && (docPhone === cleanPhone || docPhone.endsWith(cleanPhone) || cleanPhone.endsWith(docPhone))) {
      return {
        id: d.id,
        ...data,
        puntosFidelidad: Number(data.puntosFidelidad) || 0
      };
    }
  }
  return null;
}

export async function upsertClientLoyaltyProfile(params: {
  businessId: string;
  nombre: string;
  telefono: string;
  email?: string;
  puntosFidelidad?: number;
}): Promise<Client> {
  const targetBizId = params.businessId || UNIQUE_BUSINESS_ID;
  const cleanPhone = (params.telefono || '').trim();
  const existing = await findClientByPhone(targetBizId, cleanPhone);
  const nowIso = new Date().toISOString();

  if (existing) {
    const updatedPoints =
      typeof params.puntosFidelidad === 'number'
        ? Math.max(0, params.puntosFidelidad)
        : existing.puntosFidelidad || 0;
    await updateDoc(doc(db, 'clients', existing.id), limpiarDatosUndefined({
      nombre: params.nombre.trim() || existing.nombre,
      telefono: cleanPhone,
      email: params.email !== undefined ? params.email.trim() : existing.email,
      puntosFidelidad: updatedPoints,
      appId: 'gastro_smart'
    }));
    return {
      ...existing,
      nombre: params.nombre.trim() || existing.nombre,
      telefono: cleanPhone,
      email: params.email !== undefined ? params.email.trim() : existing.email,
      puntosFidelidad: updatedPoints
    };
  }

  const newRef = doc(collection(db, 'clients'));
  const newClient: Client = {
    id: newRef.id,
    businessId: targetBizId,
    nombre: params.nombre.trim() || 'Cliente',
    telefono: cleanPhone,
    email: (params.email || '').trim(),
    puntosFidelidad: Math.max(0, Number(params.puntosFidelidad) || 0),
    totalGastadoAcumulado: 0,
    creadoEn: nowIso
  };
  await setDoc(newRef, {
    ...newClient,
    appId: 'gastro_smart'
  });
  return newClient;
}

export async function awardLoyaltyPointsToClient(params: {
  businessId: string;
  telefono: string;
  nombre?: string;
  email?: string;
  montoGastado: number;
}): Promise<{ client: Client | null; pointsAdded: number; newBalance: number }> {
  const cleanPhone = (params.telefono || '').trim();
  if (!cleanPhone || params.montoGastado <= 0) {
    return { client: null, pointsAdded: 0, newBalance: 0 };
  }

  const targetBizId = params.businessId || UNIQUE_BUSINESS_ID;
  let bizData: Partial<Business> | null = null;
  try {
    const bizSnap = await getDoc(doc(db, 'businesses', targetBizId));
    if (bizSnap.exists()) {
      bizData = bizSnap.data() as Business;
    }
  } catch {
    // fallback to defaults
  }

  const pointsAdded = calculateLoyaltyPointsForAmount(params.montoGastado, bizData);
  const existing = await findClientByPhone(targetBizId, cleanPhone);
  const nowIso = new Date().toISOString();

  if (existing) {
    const prevPoints = Number(existing.puntosFidelidad) || 0;
    const newBalance = prevPoints + pointsAdded;
    const prevSpent = Number(existing.totalGastadoAcumulado) || 0;
    await updateDoc(doc(db, 'clients', existing.id), limpiarDatosUndefined({
      nombre: params.nombre?.trim() || existing.nombre || 'Cliente',
      telefono: existing.telefono || cleanPhone,
      email: params.email?.trim() || existing.email || '',
      puntosFidelidad: newBalance,
      totalGastadoAcumulado: Number((prevSpent + params.montoGastado).toFixed(2)),
      ultimaCompraEn: nowIso,
      appId: 'gastro_smart'
    }));
    return {
      client: { ...existing, puntosFidelidad: newBalance },
      pointsAdded,
      newBalance
    };
  } else {
    const newRef = doc(collection(db, 'clients'));
    const newClient: Client = {
      id: newRef.id,
      businessId: targetBizId,
      nombre: params.nombre?.trim() || 'Cliente Frecuente',
      telefono: cleanPhone,
      email: params.email?.trim() || '',
      puntosFidelidad: pointsAdded,
      totalGastadoAcumulado: Number(params.montoGastado.toFixed(2)),
      ultimaCompraEn: nowIso,
      creadoEn: nowIso
    };
    await setDoc(newRef, {
      ...newClient,
      appId: 'gastro_smart'
    });
    return {
      client: newClient,
      pointsAdded,
      newBalance: pointsAdded
    };
  }
}

// ==========================================
// MENÚ DIGITAL PÚBLICO (SOLO LECTURA PARA QR EN MESA)
// ==========================================

export interface PublicMenuDish {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  categoria: string;
  disponible: boolean;
  fotoUrl?: string | null;
  imagenUrl?: string | null;
  restaurantId: string;
}

/**
 * Obtiene únicamente los campos públicos del menú (nombre, descripción, precio, categoría, foto, disponibilidad)
 * para una sede específica sin exponer costos de elaboración ni datos internos del negocio.
 */
export async function fetchPublicMenuForRestaurant(
  restaurantId: string,
  businessIdHint?: string | null
): Promise<PublicMenuDish[]> {
  const snap = await getDocs(collection(db, 'menuItems'));
  const allDocs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  // Identificar el businessId de la sede a partir de los platos de esa sede o del hint
  const inferredBizId =
    businessIdHint ||
    allDocs.find(item => item.restaurantId === restaurantId && item.businessId)?.businessId ||
    null;

  const filtered = allDocs.filter(item => {
    if (item.eliminadoDeCarta === true) return false;
    if (item.disponible === false) return false;
    if (item.restaurantId === restaurantId) return true;
    if (item.restaurantId === 'all') {
      return inferredBizId ? item.businessId === inferredBizId : true;
    }
    return false;
  });

  return filtered.map(item => ({
    id: item.id,
    nombre: item.nombre || 'Plato',
    descripcion: item.descripcion || '',
    precio: Number(item.precio) || 0,
    categoria: item.categoria || 'General',
    disponible: item.disponible !== false,
    fotoUrl: item.fotoUrl || item.imagenUrl || null,
    imagenUrl: item.imagenUrl || item.fotoUrl || null,
    restaurantId: item.restaurantId || restaurantId
  }));
}

// ==========================================
// MÓDULO DE RESERVAS DE MESAS (reservations)
// ==========================================

export function subscribeToReservations(
  businessId: string | null,
  callback: (reservations: Reservation[]) => void
) {
  const colRef = collection(db, 'reservations');
  const q = businessId
    ? query(colRef, where('appId', '==', 'gastro_smart'), where('businessId', '==', businessId))
    : query(colRef, where('appId', '==', 'gastro_smart'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Reservation[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as Reservation));
      list.sort((a, b) => {
        const dateA = `${a.fecha || ''}T${a.hora || '00:00'}`;
        const dateB = `${b.fecha || ''}T${b.hora || '00:00'}`;
        return dateA.localeCompare(dateB);
      });
      callback(list);
    },
    (err) => {
      console.warn('Subscription warning (reservations):', err);
    }
  );
}

export async function createReservation(
  data: Omit<Reservation, 'id' | 'appId' | 'creadoEn'>
): Promise<string> {
  const nowIso = new Date().toISOString();
  const payload = limpiarDatosUndefined({
    ...data,
    businessId: data.businessId || UNIQUE_BUSINESS_ID,
    cantidadPersonas: Math.max(1, Number(data.cantidadPersonas) || 2),
    mesaAsignada: data.mesaAsignada ? Number(data.mesaAsignada) : null,
    estado: data.estado || 'pendiente',
    creadoEn: nowIso,
    appId: 'gastro_smart' as const
  });
  const docRef = await addDoc(collection(db, 'reservations'), payload);
  return docRef.id;
}

export async function updateReservationStatus(
  reservationId: string,
  estado: ReservationStatus,
  mesaAsignada?: number | null
): Promise<void> {
  const payload: Record<string, any> = { estado };
  if (mesaAsignada !== undefined) {
    payload.mesaAsignada = mesaAsignada ? Number(mesaAsignada) : null;
  }
  await updateDoc(doc(db, 'reservations', reservationId), payload);
}

export async function deleteReservation(reservationId: string): Promise<void> {
  await deleteDoc(doc(db, 'reservations', reservationId));
}



