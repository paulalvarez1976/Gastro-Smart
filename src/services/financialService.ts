import { 
  collection, 
  query, 
  where, 
  getDocs, 
  setDoc, 
  doc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Order, 
  Expense, 
  Shift, 
  Restaurant, 
  MenuItem,
  DailyStat, 
  FinancialTimeframe, 
  FinancialSummaryData, 
  DailyDishSale 
} from '../types';

/**
 * Genera el ID determinístico para un registro diario de estadísticas
 */
export function getDailyStatDocId(businessId: string, restaurantId: string, fechaYYYYMMDD: string): string {
  return `${businessId}_${restaurantId}_${fechaYYYYMMDD}`;
}

/**
 * Obtiene la fecha local del restaurante formateada como YYYY-MM-DD
 * usando la zona horaria del restaurante si está configurada.
 */
export function getRestaurantLocalDateString(date: Date = new Date(), timeZone?: string): string {
  if (timeZone) {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      return formatter.format(date); // YYYY-MM-DD
    } catch (e) {
      console.warn('Zona horaria inválida, usando local estándar:', timeZone);
    }
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Retorna la fecha operativa YYYY-MM-DD para cualquier fecha, string ISO o timestamp.
 * REGLA OPERATIVA: El día operativo de restaurante inicia a las 5:00 a.m. y concluye
 * a las 4:59 a.m. del día siguiente.
 * Por ejemplo:
 * - 2026-09-14T03:30:00 -> pertenece al día operativo 2026-09-13 (madrugada de la jornada)
 * - 2026-09-14T05:00:00 -> pertenece al día operativo 2026-09-14 (inicio jornada)
 * - 2026-09-14T23:59:00 -> pertenece al día operativo 2026-09-14
 * Desplazar el timestamp en -5 horas (-5 * 60 * 60 * 1000 ms) garantiza la alineación matemática perfecta.
 */
export function getOperationalDateString(dateInput?: string | Date | number | null): string {
  if (!dateInput) return '';
  // Si ya es estrictamente una fecha 'YYYY-MM-DD' sin hora
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  // Desplazar 5 horas hacia atrás
  const shifted = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Retorna el mes operativo YYYY-MM para cualquier fecha/timestamp.
 * El mes operativo inicia a las 5:00 a.m. del 1er día del mes y concluye a las 4:59 a.m. del 1er día del mes siguiente.
 */
export function getOperationalMonthString(dateInput?: string | Date | number | null): string {
  const opDate = getOperationalDateString(dateInput);
  return opDate ? opDate.substring(0, 7) : '';
}

/**
 * Formato YYYY-MM-DD estándar basado en día operativo
 */
export function formatDateKey(date: Date, _timeZone?: string): string {
  return getOperationalDateString(date);
}

/**
 * Calcula las estadísticas agregadas para un restaurante en una fecha específica
 * leyendo directamente las comandas cobradas y los gastos de ese día operativo.
 */
export function computeDailyStatFromRawData(
  businessId: string,
  restaurantId: string,
  fecha: string,
  orders: Order[],
  expenses: Expense[],
  shifts: Shift[]
): DailyStat {
  // Filtrar pedidos cobrados del restaurante para la fecha operativa (5:00 a.m. a 4:59 a.m.)
  const dayOrders = orders.filter(o => {
    if (o.businessId && businessId && o.businessId !== businessId && o.businessId !== 'biz_default' && businessId !== 'biz_default') return false;
    if (o.restaurantId !== restaurantId) return false;
    const isPaid = o.estado === 'cobrado' || o.estadoPago === 'cobrado';
    if (!isPaid) return false;
    const orderDate = getOperationalDateString(o.cobradoEn || o.creadoEn);
    return orderDate === fecha;
  });

  // Filtrar gastos del restaurante para la fecha operativa
  const dayExpenses = expenses.filter(e => {
    if (e.businessId && e.businessId !== businessId) return false;
    if (e.restaurantId !== restaurantId) return false;
    const expDate = getOperationalDateString(e.fecha || e.creadoEn);
    return expDate === fecha;
  });

  // Filtrar turnos según fecha operativa de inicio
  const dayShifts = shifts.filter(s => {
    if (s.businessId && s.businessId !== businessId) return false;
    if (s.restaurantId !== restaurantId) return false;
    const shiftDate = getOperationalDateString(s.horaInicio || s.fecha);
    return shiftDate === fecha;
  });

  let ventasTotales = 0;
  const ventasPorCanal = {
    local: 0,
    pedidosYa: 0,
    uberEats: 0,
    rappi: 0,
    propio: 0,
    otro: 0
  };
  const pedidosPorCanal = {
    local: 0,
    pedidosYa: 0,
    uberEats: 0,
    rappi: 0,
    propio: 0,
    otro: 0
  };

  const ventasPorHora: Record<string, { ventas: number; gastos: number; pedidos: number }> = {};
  for (let h = 0; h < 24; h++) {
    const key = String(h).padStart(2, '0');
    ventasPorHora[key] = { ventas: 0, gastos: 0, pedidos: 0 };
  }

  const dishMap = new Map<string, { nombre: string; cantidad: number; total: number }>();

  dayOrders.forEach(ord => {
    const total = ord.total || 0;
    ventasTotales += total;

    // Hora
    const timeStr = ord.cobradoEn || ord.creadoEn;
    if (timeStr) {
      const hour = new Date(timeStr).getHours();
      const hKey = String(hour).padStart(2, '0');
      if (ventasPorHora[hKey]) {
        ventasPorHora[hKey].ventas += total;
        ventasPorHora[hKey].pedidos += 1;
      }
    }

    // Canal
    if (ord.tipo === 'delivery') {
      const company = (ord.empresaDelivery || '').toLowerCase();
      if (company.includes('pedidos') || company.includes('ya')) {
        ventasPorCanal.pedidosYa += total;
        pedidosPorCanal.pedidosYa += 1;
      } else if (company.includes('uber')) {
        ventasPorCanal.uberEats += total;
        pedidosPorCanal.uberEats += 1;
      } else if (company.includes('rappi')) {
        ventasPorCanal.rappi += total;
        pedidosPorCanal.rappi += 1;
      } else if (company.includes('propio')) {
        ventasPorCanal.propio += total;
        pedidosPorCanal.propio += 1;
      } else {
        ventasPorCanal.otro += total;
        pedidosPorCanal.otro += 1;
      }
    } else {
      ventasPorCanal.local += total;
      pedidosPorCanal.local += 1;
    }

    // Top platos
    (ord.items || []).forEach(item => {
      const itemKey = item.nombre;
      const prev = dishMap.get(itemKey) || { nombre: item.nombre, cantidad: 0, total: 0 };
      prev.cantidad += (item.cantidad || 1);
      prev.total += (item.precio || 0) * (item.cantidad || 1);
      dishMap.set(itemKey, prev);
    });
  });

  // Gastos
  let gastosTotales = 0;
  const gastosPorTipo = {
    sueldos: 0,
    viveres: 0,
    transporte: 0,
    servicios: 0,
    mantenimiento: 0,
    otros: 0
  };

  dayExpenses.forEach(exp => {
    const m = exp.monto || 0;
    gastosTotales += m;
    const tipo = exp.tipo;
    if (tipo === 'sueldo') {
      gastosPorTipo.sueldos += m;
    } else if (tipo === 'insumos' || tipo === 'viveres') {
      gastosPorTipo.viveres += m;
    } else if (tipo === 'transporte') {
      gastosPorTipo.transporte += m;
    } else if (tipo === 'servicios') {
      gastosPorTipo.servicios += m;
    } else if (tipo === 'mantenimiento') {
      gastosPorTipo.mantenimiento += m;
    } else {
      gastosPorTipo.otros += m;
    }

    // Distribuir gasto en ventasPorHora si tiene hora
    const expTime = exp.creadoEn || exp.fecha;
    if (expTime && expTime.includes('T')) {
      const hour = new Date(expTime).getHours();
      const hKey = String(hour).padStart(2, '0');
      if (ventasPorHora[hKey]) {
        ventasPorHora[hKey].gastos += m;
      }
    }
  });

  // Turnos y horas trabajadas
  let horasTrabajadasTotal = 0;
  let costoSueldosTurnos = 0;
  dayShifts.forEach(shift => {
    const mins = shift.minutosTrabajados || 0;
    const hours = mins / 60;
    horasTrabajadasTotal += hours;
    costoSueldosTurnos += (shift.montoPagadoSueldo || (hours * 12));
  });

  const topPlatos: DailyDishSale[] = Array.from(dishMap.values())
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 10);

  const pedidosCobrados = dayOrders.length;
  const ticketPromedio = pedidosCobrados > 0 ? ventasTotales / pedidosCobrados : 0;
  const gananciaNeta = ventasTotales - gastosTotales;

  return {
    id: getDailyStatDocId(businessId, restaurantId, fecha),
    businessId,
    restaurantId,
    fecha,
    ventasTotales: Math.round(ventasTotales * 100) / 100,
    gastosTotales: Math.round(gastosTotales * 100) / 100,
    gananciaNeta: Math.round(gananciaNeta * 100) / 100,
    pedidosCobrados,
    ticketPromedio: Math.round(ticketPromedio * 100) / 100,
    ventasPorCanal,
    pedidosPorCanal,
    gastosPorTipo,
    ventasPorHora,
    topPlatos,
    horasTrabajadasTotal: Math.round(horasTrabajadasTotal * 10) / 10,
    costoSueldosTurnos: Math.round(costoSueldosTurnos * 100) / 100,
    appId: 'gastro_smart',
    actualizadoEn: new Date().toISOString()
  };
}

/**
 * Guarda o actualiza un documento de DailyStat en Firestore de forma atómica y segura
 */
export async function saveDailyStat(stat: DailyStat): Promise<void> {
  try {
    const docRef = doc(db, 'dailyStats', stat.id);
    await setDoc(docRef, stat, { merge: true });
  } catch (err) {
    console.warn('Error saving dailyStat:', err);
  }
}

/**
 * Obtiene dailyStats desde Firestore para un rango de fechas y restaurantes,
 * calculando al vuelo y almacenando los días faltantes.
 */
export async function getDailyStatsForRange(
  businessId: string,
  restaurantId: string | null, // null = todas las sucursales
  dates: string[], // lista de fechas YYYY-MM-DD
  allOrders: Order[],
  allExpenses: Expense[],
  allShifts: Shift[],
  restaurants: Restaurant[]
): Promise<DailyStat[]> {
  if (dates.length === 0) return [];

  const targetRestaurants = restaurantId
    ? restaurants.filter(r => r.id === restaurantId)
    : restaurants;

  if (targetRestaurants.length === 0) return [];

  // 1. Consultar Firestore para DailyStats existentes del rango
  const statsFromDb: Map<string, DailyStat> = new Map();

  try {
    const colRef = collection(db, 'dailyStats');
    const q = query(
      colRef,
      where('appId', '==', 'gastro_smart'),
      where('businessId', '==', businessId)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => {
      const data = d.data() as DailyStat;
      statsFromDb.set(d.id, data);
    });
  } catch (err) {
    console.warn('Error fetching dailyStats from Firestore, fallback to computed:', err);
  }

  const todayOpStr = getOperationalDateString(new Date());
  const finalStats: DailyStat[] = [];

  // Para cada combinación de fecha y restaurante:
  for (const date of dates) {
    for (const rest of targetRestaurants) {
      const docId = getDailyStatDocId(businessId, rest.id, date);
      const existing = statsFromDb.get(docId);

      // Verificar si existen órdenes cobradas en memoria para este día operativo y restaurante
      const hasCobradoOrders = allOrders.some(o => {
        if (o.restaurantId !== rest.id) return false;
        const isPaid = o.estado === 'cobrado' || o.estadoPago === 'cobrado';
        if (!isPaid) return false;
        const ordDate = getOperationalDateString(o.cobradoEn || o.creadoEn);
        return ordDate === date;
      });

      // Si es el día de hoy, si falta en DB, o si en DB tenía 0 ventas pero existen pedidos cobrados, o si faltan topPlatos:
      const needsRecompute = !existing 
        || date === todayOpStr 
        || (hasCobradoOrders && ((existing.ventasTotales || 0) === 0 || !existing.topPlatos || existing.topPlatos.length === 0));

      if (needsRecompute) {
        const computed = computeDailyStatFromRawData(
          businessId,
          rest.id,
          date,
          allOrders,
          allExpenses,
          allShifts
        );
        // Persistir en Firestore si hay ventas, gastos o si es hoy
        if (computed.ventasTotales > 0 || computed.gastosTotales > 0 || date === todayOpStr) {
          saveDailyStat(computed).catch(() => {});
        }
        finalStats.push(computed);
      } else {
        finalStats.push(existing);
      }
    }
  }

  return finalStats;
}

/**
 * Calcula las listas de fechas para el periodo actual y el periodo anterior
 */
export function getPeriodDateRanges(timeframe: FinancialTimeframe): {
  currentDates: string[];
  previousDates: string[];
  currentLabel: string;
  previousLabel: string;
} {
  const currentOpDateStr = getOperationalDateString(new Date());
  const [opYear, opMonth, opDay] = currentOpDateStr.split('-').map(Number);
  const opDateObj = new Date(opYear, opMonth - 1, opDay, 12, 0, 0);
  const currentDates: string[] = [];
  const previousDates: string[] = [];

  if (timeframe === 'dia') {
    // Hoy vs Ayer (días operativos)
    currentDates.push(currentOpDateStr);

    const yesterday = new Date(opDateObj);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    previousDates.push(yesterdayStr);

    return {
      currentDates,
      previousDates,
      currentLabel: 'Hoy',
      previousLabel: 'Ayer'
    };
  }

  if (timeframe === 'semana') {
    // Semana actual (últimos 7 días operativos) vs 7 días previos
    for (let i = 6; i >= 0; i--) {
      const d = new Date(opDateObj);
      d.setDate(d.getDate() - i);
      currentDates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }

    for (let i = 13; i >= 7; i--) {
      const d = new Date(opDateObj);
      d.setDate(d.getDate() - i);
      previousDates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }

    return {
      currentDates,
      previousDates,
      currentLabel: 'Esta semana (últimos 7 días)',
      previousLabel: 'Semana anterior'
    };
  }

  // Mes: Mes operativo actual (desde el 1 hasta fin del mes operativo) vs Mes anterior equivalente
  const year = opYear;
  const month = opMonth - 1; // 0-indexed
  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInCurrentMonth; day++) {
    currentDates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }

  // Mes anterior
  const prevMonthDate = new Date(year, month - 1, 1, 12, 0, 0);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth();
  const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();

  for (let day = 1; day <= daysInPrevMonth; day++) {
    previousDates.push(`${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  return {
    currentDates,
    previousDates,
    currentLabel: monthNames[month],
    previousLabel: monthNames[prevMonth]
  };
}

/**
 * Calcula el % de variación entre dos valores numéricos
 */
export function calculateVariationPercentage(actual: number, anterior: number): number {
  if (anterior === 0) {
    if (actual === 0) return 0;
    return 100; // Crecimiento del 100% si antes era 0
  }
  const diff = ((actual - anterior) / Math.abs(anterior)) * 100;
  return Math.round(diff * 10) / 10;
}

/**
 * Construye todo el resumen financiero (KPIs con variación, gráficas, paneles, alertas y tabla multi-sucursal)
 */
export function aggregateFinancialSummary(
  timeframe: FinancialTimeframe,
  currentStats: DailyStat[],
  previousStats: DailyStat[],
  restaurants: Restaurant[],
  selectedRestaurantId: string | null,
  allMenuItems: MenuItem[],
  allOrders?: Order[],
  currentDates?: string[]
): FinancialSummaryData {
  // 1. Totales Periodo Actual
  let currVentas = 0;
  let currGastos = 0;
  let currPedidos = 0;
  let currHoras = 0;
  let currCostoLaboral = 0;

  const canalSalesMap: Record<string, { monto: number; pedidos: number }> = {
    local: { monto: 0, pedidos: 0 },
    pedidosYa: { monto: 0, pedidos: 0 },
    uberEats: { monto: 0, pedidos: 0 },
    rappi: { monto: 0, pedidos: 0 },
    propio: { monto: 0, pedidos: 0 },
    otro: { monto: 0, pedidos: 0 }
  };

  const expTypeMap: Record<string, number> = {
    sueldos: 0,
    viveres: 0,
    transporte: 0,
    servicios: 0,
    mantenimiento: 0,
    otros: 0
  };

  const dishMap = new Map<string, { nombre: string; cantidad: number; total: number }>();

  // Por sucursal para la comparativa multi-sucursal
  const restMap = new Map<string, {
    restaurantId: string;
    nombre: string;
    ventas: number;
    gastos: number;
    pedidos: number;
  }>();

  restaurants.forEach(r => {
    restMap.set(r.id, {
      restaurantId: r.id,
      nombre: r.nombre,
      ventas: 0,
      gastos: 0,
      pedidos: 0
    });
  });

  currentStats.forEach(stat => {
    currVentas += stat.ventasTotales || 0;
    currGastos += stat.gastosTotales || 0;
    currPedidos += stat.pedidosCobrados || 0;
    currHoras += stat.horasTrabajadasTotal || 0;
    currCostoLaboral += (stat.gastosPorTipo?.sueldos || stat.costoSueldosTurnos || 0);

    // Canales
    if (stat.ventasPorCanal) {
      canalSalesMap.local.monto += stat.ventasPorCanal.local || 0;
      canalSalesMap.pedidosYa.monto += stat.ventasPorCanal.pedidosYa || 0;
      canalSalesMap.uberEats.monto += stat.ventasPorCanal.uberEats || 0;
      canalSalesMap.rappi.monto += stat.ventasPorCanal.rappi || 0;
      canalSalesMap.propio.monto += stat.ventasPorCanal.propio || 0;
      canalSalesMap.otro.monto += stat.ventasPorCanal.otro || 0;
    }
    if (stat.pedidosPorCanal) {
      canalSalesMap.local.pedidos += stat.pedidosPorCanal.local || 0;
      canalSalesMap.pedidosYa.pedidos += stat.pedidosPorCanal.pedidosYa || 0;
      canalSalesMap.uberEats.pedidos += stat.pedidosPorCanal.uberEats || 0;
      canalSalesMap.rappi.pedidos += stat.pedidosPorCanal.rappi || 0;
      canalSalesMap.propio.pedidos += stat.pedidosPorCanal.propio || 0;
      canalSalesMap.otro.pedidos += stat.pedidosPorCanal.otro || 0;
    }

    // Gastos por tipo
    if (stat.gastosPorTipo) {
      expTypeMap.sueldos += stat.gastosPorTipo.sueldos || 0;
      expTypeMap.viveres += stat.gastosPorTipo.viveres || 0;
      expTypeMap.transporte = (expTypeMap.transporte || 0) + (stat.gastosPorTipo.transporte || 0);
      expTypeMap.servicios += stat.gastosPorTipo.servicios || 0;
      expTypeMap.mantenimiento += stat.gastosPorTipo.mantenimiento || 0;
      expTypeMap.otros += stat.gastosPorTipo.otros || 0;
    }

    // Top platos
    (stat.topPlatos || []).forEach(p => {
      const prev = dishMap.get(p.nombre) || { nombre: p.nombre, cantidad: 0, total: 0 };
      prev.cantidad += p.cantidad;
      prev.total += p.total;
      dishMap.set(p.nombre, prev);
    });

    // Comparativa de sucursales
    const restData = restMap.get(stat.restaurantId);
    if (restData) {
      restData.ventas += stat.ventasTotales || 0;
      restData.gastos += stat.gastosTotales || 0;
      restData.pedidos += stat.pedidosCobrados || 0;
    }
  });

  // Respaldo y sincronización en tiempo real con órdenes en memoria si dishMap está vacío
  if (allOrders && allOrders.length > 0 && currentDates && currentDates.length > 0 && dishMap.size === 0) {
    const datesSet = new Set(currentDates);
    allOrders.forEach(ord => {
      if (selectedRestaurantId && ord.restaurantId !== selectedRestaurantId) return;
      const isPaid = ord.estado === 'cobrado' || ord.estadoPago === 'cobrado';
      if (!isPaid) return;
      const opDate = getOperationalDateString(ord.cobradoEn || ord.creadoEn);
      if (datesSet.has(opDate)) {
        (ord.items || []).forEach(item => {
          const itemKey = item.nombre;
          const prev = dishMap.get(itemKey) || { nombre: item.nombre, cantidad: 0, total: 0 };
          prev.cantidad += (item.cantidad || 1);
          prev.total += (item.precio || 0) * (item.cantidad || 1);
          dishMap.set(itemKey, prev);
        });
      }
    });
  }

  // 2. Totales Periodo Anterior
  let prevVentas = 0;
  let prevGastos = 0;
  let prevPedidos = 0;
  let prevViveres = 0;

  previousStats.forEach(stat => {
    prevVentas += stat.ventasTotales || 0;
    prevGastos += stat.gastosTotales || 0;
    prevPedidos += stat.pedidosCobrados || 0;
    if (stat.gastosPorTipo?.viveres) {
      prevViveres += stat.gastosPorTipo.viveres;
    }
  });

  // KPIs actuales
  const currGanancia = currVentas - currGastos;
  const currMargen = currVentas > 0 ? (currGanancia / currVentas) * 100 : 0;
  const currTicket = currPedidos > 0 ? currVentas / currPedidos : 0;

  // KPIs anteriores
  const prevGanancia = prevVentas - prevGastos;
  const prevMargen = prevVentas > 0 ? (prevGanancia / prevVentas) * 100 : 0;
  const prevTicket = prevPedidos > 0 ? prevVentas / prevPedidos : 0;

  // 3. Gráfica Principal: Ventas vs Gastos
  const chartData: {
    label: string;
    ventas: number;
    gastos: number;
    ganancia: number;
    pedidos?: number;
  }[] = [];

  if (timeframe === 'dia') {
    // Horas del día (12h a 22h, mostrando desde 08h a 23h para visión completa)
    // Agrupamos ventasPorHora de todos los stats del día actual
    const hourlyAggregate: Record<string, { ventas: number; gastos: number; ganancia: number; pedidos: number }> = {};
    for (let h = 8; h <= 23; h++) {
      const key = String(h).padStart(2, '0');
      hourlyAggregate[key] = { ventas: 0, gastos: 0, ganancia: 0, pedidos: 0 };
    }

    currentStats.forEach(stat => {
      if (stat.ventasPorHora) {
        Object.entries(stat.ventasPorHora).forEach(([h, val]) => {
          const numH = parseInt(h, 10);
          if (numH >= 8 && numH <= 23) {
            const hKey = String(numH).padStart(2, '0');
            if (hourlyAggregate[hKey]) {
              hourlyAggregate[hKey].ventas += val.ventas || 0;
              hourlyAggregate[hKey].gastos += val.gastos || 0;
              hourlyAggregate[hKey].pedidos += val.pedidos || 0;
            }
          }
        });
      }
    });

    Object.entries(hourlyAggregate).forEach(([h, val]) => {
      const v = Math.round(val.ventas * 100) / 100;
      const g = Math.round(val.gastos * 100) / 100;
      chartData.push({
        label: `${h}:00`,
        ventas: v,
        gastos: g,
        ganancia: Math.round((v - g) * 100) / 100,
        pedidos: val.pedidos
      });
    });
  } else if (timeframe === 'semana') {
    // Días de la semana (Lunes a Domingo o los 7 días analizados)
    // Mapear por fecha de la semana
    const dayMap = new Map<string, { ventas: number; gastos: number; pedidos: number }>();
    const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    // Obtener las fechas ordenadas
    const uniqueDates = Array.from(new Set(currentStats.map(s => s.fecha))).sort();

    uniqueDates.forEach(dStr => {
      dayMap.set(dStr, { ventas: 0, gastos: 0, pedidos: 0 });
    });

    currentStats.forEach(stat => {
      const item = dayMap.get(stat.fecha);
      if (item) {
        item.ventas += stat.ventasTotales || 0;
        item.gastos += stat.gastosTotales || 0;
        item.pedidos += stat.pedidosCobrados || 0;
      }
    });

    uniqueDates.forEach(dStr => {
      const [y, m, d] = dStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const dayName = dayLabels[dateObj.getDay()];
      const item = dayMap.get(dStr) || { ventas: 0, gastos: 0, pedidos: 0 };
      const v = Math.round(item.ventas * 100) / 100;
      const g = Math.round(item.gastos * 100) / 100;

      chartData.push({
        label: `${dayName} ${d}`,
        ventas: v,
        gastos: g,
        ganancia: Math.round((v - g) * 100) / 100,
        pedidos: item.pedidos
      });
    });
  } else {
    // Mes: Semanas del mes (Semana 1: días 1-7, Semana 2: 8-14, Semana 3: 15-21, Semana 4: 22-28, Semana 5: 29+)
    const weeks = [
      { label: 'Semana 1 (1-7)', min: 1, max: 7, ventas: 0, gastos: 0, pedidos: 0 },
      { label: 'Semana 2 (8-14)', min: 8, max: 14, ventas: 0, gastos: 0, pedidos: 0 },
      { label: 'Semana 3 (15-21)', min: 15, max: 21, ventas: 0, gastos: 0, pedidos: 0 },
      { label: 'Semana 4 (22-28)', min: 22, max: 28, ventas: 0, gastos: 0, pedidos: 0 },
      { label: 'Semana 5 (29+)', min: 29, max: 31, ventas: 0, gastos: 0, pedidos: 0 }
    ];

    currentStats.forEach(stat => {
      const dayNum = parseInt(stat.fecha.split('-')[2], 10);
      const w = weeks.find(item => dayNum >= item.min && dayNum <= item.max);
      if (w) {
        w.ventas += stat.ventasTotales || 0;
        w.gastos += stat.gastosTotales || 0;
        w.pedidos += stat.pedidosCobrados || 0;
      }
    });

    weeks.forEach(w => {
      const v = Math.round(w.ventas * 100) / 100;
      const g = Math.round(w.gastos * 100) / 100;
      chartData.push({
        label: w.label,
        ventas: v,
        gastos: g,
        ganancia: Math.round((v - g) * 100) / 100,
        pedidos: w.pedidos
      });
    });
  }

  // 4. Panel 1: Ventas por Canal
  const channelDefinitions = [
    { key: 'local', nombre: 'Salón / Local', color: '#3B82F6' },
    { key: 'pedidosYa', nombre: 'PedidosYa', color: '#EF4444' },
    { key: 'uberEats', nombre: 'UberEats', color: '#10B981' },
    { key: 'rappi', nombre: 'Rappi', color: '#F97316' },
    { key: 'propio', nombre: 'Delivery Propio', color: '#8B5CF6' },
    { key: 'otro', nombre: 'Otros Canales', color: '#6B7280' }
  ];

  const totalChannelSales = Object.values(canalSalesMap).reduce((acc, c) => acc + c.monto, 0);

  const ventasPorCanal = channelDefinitions.map(def => {
    const data = canalSalesMap[def.key] || { monto: 0, pedidos: 0 };
    const pct = totalChannelSales > 0 ? (data.monto / totalChannelSales) * 100 : 0;
    return {
      canal: def.key,
      nombre: def.nombre,
      monto: Math.round(data.monto * 100) / 100,
      porcentaje: Math.round(pct * 10) / 10,
      pedidos: data.pedidos,
      color: def.color
    };
  });

  // 5. Panel 2: Gastos por Tipo (sueldos, víveres, transporte, otros)
  const expenseDefinitions = [
    { key: 'sueldos', nombre: 'Sueldos y Personal', color: '#6366F1' },
    { key: 'viveres', nombre: 'Víveres e Insumos', color: '#F59E0B' },
    { key: 'transporte', nombre: 'Transporte y Logística', color: '#8B5CF6' },
    { key: 'servicios', nombre: 'Servicios Básicos (Luz, Agua, Gas)', color: '#06B6D4' },
    { key: 'mantenimiento', nombre: 'Mantenimiento y Reparación', color: '#EC4899' },
    { key: 'otros', nombre: 'Otros Gastos Operativos', color: '#9CA3AF' }
  ];

  const totalExpensesCalc = Object.values(expTypeMap).reduce((acc, v) => acc + v, 0);

  const gastosPorTipo = expenseDefinitions.map(def => {
    const monto = expTypeMap[def.key] || 0;
    const pct = totalExpensesCalc > 0 ? (monto / totalExpensesCalc) * 100 : 0;
    return {
      tipo: def.key,
      nombre: def.nombre,
      monto: Math.round(monto * 100) / 100,
      porcentaje: Math.round(pct * 10) / 10,
      color: def.color
    };
  });

  // 6. Panel 3: Top 5 Platos más vendidos
  const topPlatos = Array.from(dishMap.values())
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 5);

  // 7. Panel 4: Alertas Inteligentes
  const alertas: FinancialSummaryData['alertas'] = [];

  // Alerta A: Gastos de víveres subieron vs periodo anterior
  const currViveres = expTypeMap.viveres || 0;
  if (prevViveres > 0 && currViveres > prevViveres) {
    const aumentoViveres = Math.round(((currViveres - prevViveres) / prevViveres) * 100);
    if (aumentoViveres >= 5) {
      alertas.push({
        id: 'alerta-viveres',
        tipo: 'warning',
        titulo: 'Alerta de Costes de Comida',
        mensaje: `Los gastos de víveres e insumos subieron un ${aumentoViveres}% vs el periodo anterior ($${currViveres.toFixed(2)} vs $${prevViveres.toFixed(2)}). Revise mermas y precios de proveedores.`
      });
    }
  }

  // Alerta B: Plato que vende poco (considerar retirarlo)
  // Identificar platos del menú que tuvieron 0 o muy pocas ventas (< 2) en el periodo
  if (allMenuItems.length > 0 && currPedidos >= 3) {
    const lowSellingDish = allMenuItems.find(item => {
      const sold = dishMap.get(item.nombre);
      return !sold || sold.cantidad <= 1;
    });

    if (lowSellingDish) {
      alertas.push({
        id: 'alerta-plato-bajo',
        tipo: 'info',
        titulo: 'Optimización de Carta',
        mensaje: `El plato "${lowSellingDish.nombre}" vende poco en este periodo (${dishMap.get(lowSellingDish.nombre)?.cantidad || 0} u.). Considere reubicarlo, promocionarlo o retirarlo de la carta.`
      });
    }
  }

  // Alerta C: Sucursal con menor margen que el promedio del negocio
  if (restaurants.length > 1) {
    const avgMargen = currMargen;
    const underperformingRest = Array.from(restMap.values()).find(r => {
      if (r.ventas > 100) {
        const branchMargen = ((r.ventas - r.gastos) / r.ventas) * 100;
        return branchMargen < avgMargen - 8; // 8% por debajo del promedio
      }
      return false;
    });

    if (underperformingRest) {
      const branchMargen = Math.round(((underperformingRest.ventas - underperformingRest.gastos) / underperformingRest.ventas) * 100);
      alertas.push({
        id: 'alerta-sucursal-margen',
        tipo: 'danger',
        titulo: 'Rendimiento por Sucursal',
        mensaje: `La sucursal "${underperformingRest.nombre}" tiene un margen neto del ${branchMargen}%, menor que el promedio general del negocio (${Math.round(avgMargen)}%).`
      });
    }
  }

  // Si no hay alertas críticas, emitir mensaje positivo de rentabilidad
  if (alertas.length === 0) {
    if (currMargen >= 20) {
      alertas.push({
        id: 'alerta-salud-financiera',
        tipo: 'success',
        titulo: 'Excelente Salud Financiera',
        mensaje: `El margen neto se sitúa en un saludable ${Math.round(currMargen)}%, superando el estándar de la industria restaurantera (15%-20%).`
      });
    } else {
      alertas.push({
        id: 'alerta-general',
        tipo: 'info',
        titulo: 'Control de Gastos y Costos',
        mensaje: `Monitoree los ratios de costo laboral e insumos para optimizar el margen del periodo.`
      });
    }
  }

  // 8. Panel 5: Costo laboral (horas y ratio sueldos vs ventas)
  const ratioCostoLaboral = currVentas > 0 ? (currCostoLaboral / currVentas) * 100 : 0;

  // 9. Comparativa Multi-sucursal (Tabla ordenable)
  const comparativaSucursales = Array.from(restMap.values()).map(r => {
    const ganancia = r.ventas - r.gastos;
    const margen = r.ventas > 0 ? (ganancia / r.ventas) * 100 : 0;
    const ticket = r.pedidos > 0 ? r.ventas / r.pedidos : 0;

    return {
      restaurantId: r.restaurantId,
      nombre: r.nombre,
      ventas: Math.round(r.ventas * 100) / 100,
      gastos: Math.round(r.gastos * 100) / 100,
      ganancia: Math.round(ganancia * 100) / 100,
      pedidos: r.pedidos,
      ticketPromedio: Math.round(ticket * 100) / 100,
      margen: Math.round(margen * 10) / 10
    };
  });

  return {
    ventasTotales: {
      actual: Math.round(currVentas * 100) / 100,
      anterior: Math.round(prevVentas * 100) / 100,
      variacionPorcentaje: calculateVariationPercentage(currVentas, prevVentas)
    },
    gastosOperativos: {
      actual: Math.round(currGastos * 100) / 100,
      anterior: Math.round(prevGastos * 100) / 100,
      variacionPorcentaje: calculateVariationPercentage(currGastos, prevGastos)
    },
    gananciaNeta: {
      actual: Math.round(currGanancia * 100) / 100,
      anterior: Math.round(prevGanancia * 100) / 100,
      variacionPorcentaje: calculateVariationPercentage(currGanancia, prevGanancia)
    },
    margenPorcentaje: {
      actual: Math.round(currMargen * 10) / 10,
      anterior: Math.round(prevMargen * 10) / 10,
      variacionPorcentaje: Math.round((currMargen - prevMargen) * 10) / 10 // Diferencia en puntos porcentuales
    },
    pedidosTotales: {
      actual: currPedidos,
      anterior: prevPedidos,
      variacionPorcentaje: calculateVariationPercentage(currPedidos, prevPedidos)
    },
    ticketPromedio: {
      actual: Math.round(currTicket * 100) / 100,
      anterior: Math.round(prevTicket * 100) / 100,
      variacionPorcentaje: calculateVariationPercentage(currTicket, prevTicket)
    },
    ventasPorCanal,
    gastosPorTipo,
    topPlatos,
    horasTrabajadas: Math.round(currHoras * 10) / 10,
    costoLaboral: Math.round(currCostoLaboral * 100) / 100,
    ratioCostoLaboral: Math.round(ratioCostoLaboral * 10) / 10,
    chartData,
    alertas,
    comparativaSucursales
  };
}
