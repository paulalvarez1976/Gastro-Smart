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
  Expense
} from '../types';

// ======================= RESTAURANTS =======================
export function subscribeToRestaurants(callback: (data: Restaurant[]) => void) {
  const q = query(collection(db, 'restaurants'));
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

export async function createRestaurant(data: Omit<Restaurant, 'id'>) {
  return addDoc(collection(db, 'restaurants'), {
    ...data,
    creadoEn: new Date().toISOString()
  });
}

export async function createRestaurantWithTables(
  data: { nombre: string; direccion: string; telefono: string; numeroMesas: number }
): Promise<string> {
  const restRef = await addDoc(collection(db, 'restaurants'), {
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

/**
 * Actualiza el número de mesas de un restaurante.
 * Si aumenta: crea las mesas faltantes.
 * Si disminuye: verifica que las mesas en el rango a eliminar estén libres y sin pedidos abiertos.
 */
export async function updateRestaurantTableCount(
  restaurantId: string, 
  newTableCount: number
): Promise<{ success: boolean; error?: string }> {
  if (newTableCount < 1) {
    return { success: false, error: 'El número mínimo de mesas es 1.' };
  }

  // Traer mesas actuales del restaurante
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
    // Aumentar mesas: crear las que faltan (de currentCount + 1 hasta newTableCount)
    const existingNumbers = new Set(currentTables.map(t => t.numero));
    const batch = writeBatch(db);

    let nextNumber = 1;
    let tablesCreated = 0;
    const targetDiff = newTableCount - currentCount;

    while (tablesCreated < targetDiff) {
      if (!existingNumbers.has(nextNumber)) {
        const tableRef = doc(collection(db, 'tables'));
        batch.set(tableRef, {
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
    // Disminuir mesas:
    // Traer pedidos abiertos del restaurante para verificar si alguna mesa tiene pedido abierto
    const activeOrdersSnap = await getDocs(query(collection(db, 'orders'), where('restaurantId', '==', restaurantId)));
    const openOrders = activeOrdersSnap.docs
      .map(d => d.data() as Order)
      .filter(o => o.estado !== 'cobrado' && o.estado !== 'rechazado');

    const openOrderTableIds = new Set(openOrders.map(o => o.mesaId).filter(Boolean));

    // Identificar mesas con número > newTableCount para eliminar
    const tablesToRemove = currentTables.filter(t => t.numero > newTableCount);

    // Verificar si alguna está ocupada o con pedido abierto
    for (const table of tablesToRemove) {
      if (table.estado === 'ocupada' || openOrderTableIds.has(table.id)) {
        return {
          success: false,
          error: `No se puede reducir a ${newTableCount} mesas. La Mesa #${table.numero} se encuentra actualmente ocupada o con comanda abierta.`
        };
      }
    }

    // Si todas están libres, proceder a eliminarlas
    const batch = writeBatch(db);
    for (const table of tablesToRemove) {
      batch.delete(doc(db, 'tables', table.id));
    }
    await batch.commit();
    await updateDoc(doc(db, 'restaurants', restaurantId), { numeroMesas: newTableCount });
    return { success: true };
  }
}

/**
 * Renumera correlativamente todas las mesas del restaurante de 1 a N
 */
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
export function subscribeToEmployees(restaurantId: string | null, callback: (data: Employee[]) => void) {
  const q = query(collection(db, 'employees'));
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

export function subscribeToShifts(restaurantId: string | null, callback: (shifts: Shift[]) => void) {
  const q = query(collection(db, 'shifts'), orderBy('horaInicio', 'desc'), limit(50));
  return onSnapshot(q, (snapshot) => {
    let list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Shift));
    if (restaurantId) {
      list = list.filter(s => s.restaurantId === restaurantId);
    }
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (shifts):', err);
  });
}

export async function openShift(employee: Employee, restaurantName: string): Promise<Shift> {
  const now = new Date();
  const shiftData: Omit<Shift, 'id'> = {
    employeeId: employee.id,
    employeeName: employee.nombre,
    employeePuesto: employee.puesto,
    restaurantId: employee.restaurantId,
    restaurantNombre: restaurantName,
    fecha: now.toISOString().split('T')[0],
    horaInicio: now.toISOString(),
    estado: 'abierto',
    pedidosTomados: 0,
    ventasGeneradas: 0,
  };

  const docRef = await addDoc(collection(db, 'shifts'), shiftData);
  return { id: docRef.id, ...shiftData };
}

export async function closeShift(shiftId: string, reporteLabores?: string, stats?: { pedidosTomados?: number; ventasGeneradas?: number }) {
  const now = new Date();
  const shiftRef = doc(db, 'shifts', shiftId);

  // Calcular minutos trabajados
  return updateDoc(shiftRef, {
    estado: 'cerrado',
    horaFin: now.toISOString(),
    reporteLabores: reporteLabores || '',
    ...(stats?.pedidosTomados !== undefined ? { pedidosTomados: stats.pedidosTomados } : {}),
    ...(stats?.ventasGeneradas !== undefined ? { ventasGeneradas: stats.ventasGeneradas } : {})
  });
}

// ======================= MENU ITEMS =======================
export function subscribeToMenuItems(restaurantId: string | null, callback: (data: MenuItem[]) => void) {
  const q = query(collection(db, 'menuItems'));
  return onSnapshot(q, (snapshot) => {
    let list: MenuItem[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as MenuItem));
    if (restaurantId) {
      list = list.filter(item => item.restaurantId === restaurantId || item.restaurantId === 'all');
    }
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (menuItems):', err);
  });
}

export function generateMenuItemId(): string {
  return doc(collection(db, 'menuItems')).id;
}

export async function setMenuItem(id: string, data: Omit<MenuItem, 'id'>) {
  const cleanData = {
    ...data,
    fotoUrl: data.fotoUrl ?? data.imagenUrl ?? null,
    imagenUrl: data.imagenUrl ?? data.fotoUrl ?? null,
  };
  return setDoc(doc(db, 'menuItems', id), cleanData);
}

export async function createMenuItem(data: Omit<MenuItem, 'id'>) {
  const cleanData = {
    ...data,
    fotoUrl: data.fotoUrl ?? data.imagenUrl ?? null,
    imagenUrl: data.imagenUrl ?? data.fotoUrl ?? null,
  };
  return addDoc(collection(db, 'menuItems'), cleanData);
}

export async function updateMenuItem(id: string, data: Partial<MenuItem>) {
  const cleanData: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    cleanData[key] = val === undefined ? null : val;
  }
  if (data.fotoUrl !== undefined && data.imagenUrl === undefined) {
    cleanData.imagenUrl = data.fotoUrl;
  } else if (data.imagenUrl !== undefined && data.fotoUrl === undefined) {
    cleanData.fotoUrl = data.imagenUrl;
  }
  return updateDoc(doc(db, 'menuItems', id), cleanData);
}

export async function deleteMenuItem(id: string) {
  return deleteDoc(doc(db, 'menuItems', id));
}

// ======================= TABLES (MESAS) =======================
export function subscribeToTables(restaurantId: string, callback: (data: Table[]) => void) {
  const q = query(collection(db, 'tables'), where('restaurantId', '==', restaurantId));
  return onSnapshot(q, (snapshot) => {
    const list: Table[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as Table)).sort((a, b) => a.numero - b.numero);
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (tables):', err);
  });
}

export async function updateTableStatus(tableId: string, estado: 'libre' | 'ocupada') {
  return updateDoc(doc(db, 'tables', tableId), { estado });
}

// ======================= CLIENTS =======================
export function subscribeToClients(callback: (data: Client[]) => void) {
  const q = query(collection(db, 'clients'));
  return onSnapshot(q, (snapshot) => {
    const list: Client[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as Client));
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (clients):', err);
  });
}

export async function createClient(clientData: { nombre: string; telefono?: string; direccion?: string; email?: string }): Promise<Client> {
  const cleanData = {
    nombre: clientData.nombre.trim(),
    telefono: clientData.telefono?.trim() || '',
    direccion: clientData.direccion?.trim() || '',
    email: clientData.email?.trim() || '',
    creadoEn: new Date().toISOString()
  };
  const docRef = await addDoc(collection(db, 'clients'), cleanData);
  return {
    id: docRef.id,
    ...cleanData
  };
}

export async function findOrCreateClient(nombre: string, telefono: string, direccion?: string): Promise<string> {
  try {
    const q = query(collection(db, 'clients'), where('telefono', '==', telefono));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].id;
    }
    const docRef = await addDoc(collection(db, 'clients'), {
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      direccion: direccion?.trim() || '',
      creadoEn: new Date().toISOString()
    });
    return docRef.id;
  } catch (err) {
    console.warn('Error in findOrCreateClient, creating fallback doc:', err);
    const docRef = await addDoc(collection(db, 'clients'), {
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      direccion: direccion?.trim() || '',
      creadoEn: new Date().toISOString()
    });
    return docRef.id;
  }
}

// ======================= ORDERS (PEDIDOS EN TIEMPO REAL) =======================
export function subscribeToOrders(restaurantId: string | null, callback: (data: Order[]) => void) {
  const q = query(collection(db, 'orders'), orderBy('creadoEn', 'desc'), limit(100));

  return onSnapshot(q, (snapshot) => {
    let list: Order[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as Order));
    if (restaurantId) {
      list = list.filter(o => o.restaurantId === restaurantId);
    }
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (orders):', err);
  });
}

export async function appendItemsToExistingOrder(
  orderId: string, 
  newItems: OrderItem[], 
  userName: string,
  existingTimeline: OrderTimelineEvent[] = []
): Promise<string> {
  const orderRef = doc(db, 'orders', orderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) {
    throw new Error('El pedido abierto no fue encontrado.');
  }
  const currentOrder = orderSnap.data() as Order;
  const combinedItems = [...(currentOrder.items || []), ...newItems];
  const addedTotal = newItems.reduce((acc, it) => acc + (it.precio * it.cantidad), 0);
  const newTotal = (currentOrder.total || 0) + addedTotal;

  const now = new Date().toISOString();
  const newTimelineItem: OrderTimelineEvent = {
    estado: 'pendiente_cocina',
    fecha: now,
    usuario: userName,
    motivo: `Se agregaron +${newItems.length} platos a la comanda abierta`
  };

  await updateDoc(orderRef, {
    items: combinedItems,
    total: newTotal,
    subtotal: newTotal,
    estado: 'pendiente_cocina', // cocina receives alert for added dishes!
    timeline: [...(currentOrder.timeline || existingTimeline), newTimelineItem]
  });

  return orderId;
}

export async function createOrder(orderData: Omit<Order, 'id' | 'timeline'>, userName: string) {
  const initialTimeline = [{
    estado: orderData.estado,
    fecha: new Date().toISOString(),
    usuario: userName,
    motivo: orderData.motivoRechazo ?? null
  }];

  // Construir documento de pedido garantizando que NINGÚN campo sea undefined
  // En pedidos delivery: se guarda la empresa seleccionada
  // En pedidos local o para llevar: se guarda como null
  const isDelivery = orderData.tipo === 'delivery';
  const empresaDeliveryVal = isDelivery 
    ? (orderData.empresaDelivery || 'Propio') 
    : null;

  // Sanitizar items del pedido
  const sanitizedItems = (orderData.items || []).map(item => ({
    menuItemId: item.menuItemId,
    nombre: item.nombre,
    cantidad: item.cantidad,
    precio: item.precio,
    notas: item.notas ?? null,
    fotoUrl: item.fotoUrl ?? item.imagenUrl ?? null,
    imagenUrl: item.imagenUrl ?? item.fotoUrl ?? null
  }));

  const sanitizedOrder: Record<string, any> = {
    restaurantId: orderData.restaurantId,
    meseroId: orderData.meseroId,
    meseroNombre: orderData.meseroNombre ?? 'Mesero',
    tipo: orderData.tipo,
    items: sanitizedItems,
    total: orderData.total,
    subtotal: orderData.subtotal ?? orderData.total,
    estado: orderData.estado,
    creadoEn: orderData.creadoEn || new Date().toISOString(),
    timeline: initialTimeline,

    // Campos opcionales solicitados: ninguno puede enviarse como undefined
    empresaDelivery: empresaDeliveryVal,
    mesaId: orderData.mesaId ?? null,
    mesaNumero: orderData.mesaNumero ?? null,
    clienteId: orderData.clienteId ?? null,
    clienteNombre: orderData.clienteNombre ?? null,
    clienteTelefono: orderData.clienteTelefono ?? null,
    clienteDireccion: orderData.clienteDireccion ?? null,
    motivoRechazo: orderData.motivoRechazo ?? null,
    propina: orderData.propina ?? null,
    descuento: orderData.descuento ?? null,
    metodoPago: orderData.metodoPago ?? null,
    montoPagado: orderData.montoPagado ?? null,
    vuelto: orderData.vuelto ?? null,
    cajeroNombre: orderData.cajeroNombre ?? null,
    aceptadoEn: orderData.aceptadoEn ?? null,
    listoEn: orderData.listoEn ?? null,
    entregadoEn: orderData.entregadoEn ?? null,
    cobradoEn: orderData.cobradoEn ?? null
  };

  // Limpieza defensiva contra cualquier otro undefined accidental
  for (const key of Object.keys(sanitizedOrder)) {
    if (sanitizedOrder[key] === undefined) {
      sanitizedOrder[key] = null;
    }
  }

  const docRef = await addDoc(collection(db, 'orders'), sanitizedOrder);

  // Si es pedido en mesa, marcar mesa como ocupada
  if (sanitizedOrder.mesaId) {
    await updateTableStatus(sanitizedOrder.mesaId, 'ocupada');
  }

  return docRef.id;
}

export async function updateOrderStatus(
  orderId: string, 
  newStatus: OrderStatus, 
  userName: string, 
  extraData: Partial<Order> = {},
  motivoRechazo?: string
) {
  const orderRef = doc(db, 'orders', orderId);
  const now = new Date().toISOString();

  const newTimelineItem = {
    estado: newStatus,
    fecha: now,
    usuario: userName,
    motivo: motivoRechazo ?? null
  };

  const updatePayload: Record<string, any> = {
    estado: newStatus,
  };

  if (newStatus === 'aceptado') updatePayload.aceptadoEn = now;
  if (newStatus === 'en_preparacion' && !updatePayload.aceptadoEn) updatePayload.aceptadoEn = now;
  if (newStatus === 'listo') updatePayload.listoEn = now;
  if (newStatus === 'entregado') updatePayload.entregadoEn = now;
  if (newStatus === 'cobrado') updatePayload.cobradoEn = now;
  if (motivoRechazo !== undefined) updatePayload.motivoRechazo = motivoRechazo ?? null;

  // Sanitizar extraData convirtiendo cualquier undefined en null
  for (const [key, val] of Object.entries(extraData)) {
    if (key === 'timeline') continue;
    updatePayload[key] = val === undefined ? null : val;
  }

  // Actualizar también la timeline
  return updateDoc(orderRef, {
    ...updatePayload,
    timeline: [...(extraData.timeline || []), newTimelineItem]
  });
}

// ======================= ARQUEO Y CIERRE DE CAJA =======================
export async function createCashRegisterClose(closeData: Omit<CashRegisterClose, 'id' | 'creadoEn'>) {
  return addDoc(collection(db, 'cashRegisterCloses'), {
    ...closeData,
    creadoEn: new Date().toISOString()
  });
}

export function subscribeToCashRegisterCloses(restaurantId: string, callback: (data: CashRegisterClose[]) => void) {
  const q = query(collection(db, 'cashRegisterCloses'), orderBy('creadoEn', 'desc'), limit(30));
  return onSnapshot(q, (snapshot) => {
    let list: CashRegisterClose[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as CashRegisterClose));
    if (restaurantId) {
      list = list.filter(c => c.restaurantId === restaurantId);
    }
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (cashRegisterCloses):', err);
  });
}

// ======================= EXPENSES & SUELDOS =======================
export function subscribeToExpenses(restaurantId: string | null, callback: (data: Expense[]) => void) {
  const q = query(collection(db, 'expenses'), orderBy('creadoEn', 'desc'), limit(100));
  return onSnapshot(q, (snapshot) => {
    let list: Expense[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    } as Expense));
    if (restaurantId) {
      list = list.filter(e => e.restaurantId === restaurantId);
    }
    callback(list);
  }, (err) => {
    console.warn('Subscription warning (expenses):', err);
  });
}

export async function createExpense(data: Omit<Expense, 'id' | 'creadoEn'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'expenses'), {
    ...data,
    creadoEn: new Date().toISOString()
  });
  return docRef.id;
}

/**
 * Paga el sueldo correspondiente a un turno completado:
 * Calcula horas * tarifaHora + horasExtra * 1.5 * tarifaHora
 * Genera el registro de gasto tipo 'sueldo' y marca el turno como pagado
 */
export async function payShiftSalary(
  shift: Shift, 
  employee: Employee
): Promise<{ success: boolean; amount: number }> {
  const minutes = shift.minutosTrabajados || 0;
  const hours = minutes / 60;
  const standardHours = Math.min(8, hours);
  const overtimeHours = Math.max(0, hours - 8);

  const rate = employee.tarifaHora || 0;
  const salary = (standardHours * rate) + (overtimeHours * rate * 1.5);
  const roundedSalary = Math.round(salary * 100) / 100;

  // 1. Crear registro en expenses
  await createExpense({
    restaurantId: shift.restaurantId,
    tipo: 'sueldo',
    monto: roundedSalary,
    descripcion: `Pago de jornada a ${employee.nombre} (${employee.puesto}) - ${hours.toFixed(2)}h`,
    employeeId: employee.id,
    employeeName: employee.nombre,
    shiftId: shift.id,
    horasTrabajadas: Math.round(hours * 100) / 100,
    horasExtra: Math.round(overtimeHours * 100) / 100,
    tarifaHora: rate,
    fecha: shift.fecha || new Date().toISOString().split('T')[0]
  });

  // 2. Marcar turno como pagado
  await updateDoc(doc(db, 'shifts', shift.id), {
    pagado: true,
    montoPagadoSueldo: roundedSalary,
    fechaPago: new Date().toISOString()
  });

  return { success: true, amount: roundedSalary };
}

// ======================= ZONA DE PELIGRO (DANGER ZONE) =======================

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

/**
 * Obtiene el resumen de datos operativos de un restaurante antes de restablecer
 */
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

/**
 * Obtiene el resumen de TODOS los datos de un restaurante antes de borrarlo
 */
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

/**
 * 1. Restablecer datos operativos:
 * Borra pedidos, clientes, gastos, turnos y cierres de caja del restaurante.
 * Conserva restaurante, empleados, menú y mesas (reseteando mesas a 'libre').
 */
export async function resetOperationalData(restaurantId: string): Promise<void> {
  const [ordersSnap, clientsSnap, expensesSnap, shiftsSnap, cashSnap, tablesSnap] = await Promise.all([
    getDocs(query(collection(db, 'orders'), where('restaurantId', '==', restaurantId))),
    getDocs(collection(db, 'clients')),
    getDocs(query(collection(db, 'expenses'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'shifts'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'cashRegisterCloses'), where('restaurantId', '==', restaurantId))),
    getDocs(query(collection(db, 'tables'), where('restaurantId', '==', restaurantId)))
  ]);

  const batch = writeBatch(db);

  ordersSnap.docs.forEach(d => batch.delete(d.ref));
  clientsSnap.docs.forEach(d => batch.delete(d.ref));
  expensesSnap.docs.forEach(d => batch.delete(d.ref));
  shiftsSnap.docs.forEach(d => batch.delete(d.ref));
  cashSnap.docs.forEach(d => batch.delete(d.ref));

  // Resetear estado de todas las mesas a 'libre'
  tablesSnap.docs.forEach(d => batch.update(d.ref, { estado: 'libre' }));

  await batch.commit();
}

/**
 * 2. Eliminar restaurante completamente en cascada:
 * Borra mesas, empleados, menú, pedidos, gastos, turnos, cierres y el documento de restaurante.
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
 * 3. Borrar toda la cuenta y datos del administrador:
 * Elimina todas las colecciones de todos los restaurantes.
 */
export async function deleteAllAccountData(): Promise<void> {
  const collections = [
    'restaurants',
    'employees',
    'tables',
    'menuItems',
    'orders',
    'clients',
    'shifts',
    'expenses',
    'cashRegisterCloses'
  ];

  for (const colName of collections) {
    const snap = await getDocs(collection(db, colName));
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}
