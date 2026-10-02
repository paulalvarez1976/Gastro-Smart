import { UNIQUE_BUSINESS_ID } from '../config/business';
import React, { useState, useEffect, useMemo } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  ShoppingBag, 
  Receipt, 
  PieChart as PieIcon, 
  BarChart3, 
  AlertTriangle, 
  Building2, 
  Clock, 
  Percent, 
  ArrowUpDown, 
  ChevronUp, 
  ChevronDown, 
  Sparkles, 
  ShieldCheck, 
  Utensils, 
  Flame, 
  Truck,
  Layers,
  Calendar,
  RefreshCw,
  FileSpreadsheet,
  Printer,
  X,
  CheckCircle2,
  Activity,
  Check,
  Package,
  Plus,
  ChefHat,
  Store,
  Zap,
  Calculator
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart,
  ComposedChart, 
  Bar, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ReferenceLine
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { 
  Restaurant, 
  Order, 
  Expense, 
  Shift, 
  MenuItem, 
  DailyStat, 
  FinancialTimeframe, 
  FinancialSummaryData 
} from '../types';
import { 
  getPeriodDateRanges, 
  getDailyStatsForRange, 
  aggregateFinancialSummary 
} from '../services/financialService';
import { 
  subscribeToExpenses, 
  diagnoseDailyStats, 
  recalculateDailyStatsForPeriod,
  recalculateTodayDailyStats,
  getOperationalDateString
} from '../services/dataService';
import { exportFinancialReportToExcel } from '../services/excelService';
import { ExecutivePdfReport } from './ExecutivePdfReport';
import { NewPurchaseModal } from './NewPurchaseModal';
import { NewExpenseModal } from './NewExpenseModal';
import { IngredientPurchaseHistory } from './IngredientPurchaseHistory';
import { DishCostProfitReport } from './DishCostProfitReport';
import { sounds } from '../utils/sound';

interface FinancialDashboardProps {
  restaurants: Restaurant[];
  orders: Order[];
  shifts: Shift[];
  menuItems: MenuItem[];
  archivedMenuItems?: MenuItem[];
  onEditDish?: (dish: MenuItem) => void;
  onDeleteDish?: (dish: MenuItem) => void;
  customDailySalesChart?: React.ReactNode;
}

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({
  restaurants,
  orders,
  shifts,
  menuItems,
  archivedMenuItems = [],
  onEditDish,
  onDeleteDish,
  customDailySalesChart
}) => {
  const { 
    currentUserAccount, 
    currentEmployee, 
    currentBusiness,
    allEmployees 
  } = useAuth();

  const activeBizId = currentUserAccount?.businessId || currentEmployee?.businessId || currentBusiness?.id || UNIQUE_BUSINESS_ID;
  const userRole = currentUserAccount?.rol || (currentEmployee?.puesto === 'admin' ? 'admin' : 'mesero');
  const isOwner = userRole === 'owner';

  // Sucursales a las que tiene acceso este usuario
  const accessibleRestaurants = useMemo(() => {
    if (isOwner) {
      return restaurants;
    }
    // Si es admin con restaurantId específico asignado
    const assignedRestId = currentUserAccount?.restaurantId || currentEmployee?.restaurantId;
    if (assignedRestId && assignedRestId !== 'all') {
      const filtered = restaurants.filter(r => r.id === assignedRestId);
      return filtered.length > 0 ? filtered : restaurants;
    }
    return restaurants;
  }, [isOwner, restaurants, currentUserAccount, currentEmployee]);

  // Estados de Filtros
  const [timeframe, setTimeframe] = useState<FinancialTimeframe>('dia');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Datos calculados
  const [summaryData, setSummaryData] = useState<FinancialSummaryData | null>(null);
  const [currentDailyStats, setCurrentDailyStats] = useState<DailyStat[]>([]);
  const [periodLabels, setPeriodLabels] = useState({ current: 'Hoy', previous: 'Ayer' });

  // Estado del indicador de agregación automática
  const [autoStatsStatus, setAutoStatsStatus] = useState<'activas' | 'con error'>('activas');

  // Estado del modal de diagnóstico y verificación
  const [showDiagnosticModal, setShowDiagnosticModal] = useState<boolean>(false);
  const [isDiagnosing, setIsDiagnosing] = useState<boolean>(false);
  const [diagnosticResult, setDiagnosticResult] = useState<{
    cobradoOrdersCount: number;
    cobradoOrdersTotal: number;
    dailyStatsCount: number;
    dailyStatsTotalSales: number;
    mismatch: boolean;
    missingDates: string[];
  } | null>(null);
  const [isRecalculating, setIsRecalculating] = useState<boolean>(false);
  const [recalculateMessage, setRecalculateMessage] = useState<string | null>(null);

  // Estado del reporte ejecutivo PDF
  const [showPdfReport, setShowPdfReport] = useState<boolean>(false);

  // Estado del Formulario de Compra de Insumos / Víveres
  const [showNewPurchaseModal, setShowNewPurchaseModal] = useState<boolean>(false);
  // Estado del Formulario de Nuevo Gasto (Cualquier categoría: transporte, alquiler, servicios, etc.)
  const [showNewExpenseModal, setShowNewExpenseModal] = useState<boolean>(false);
  const [showAllDishesModal, setShowAllDishesModal] = useState<boolean>(false);
  const [activeSubView, setActiveSubView] = useState<'kpis' | 'rentabilidad_platos' | 'historial_insumos'>('kpis');
  const [isRecalculatingToday, setIsRecalculatingToday] = useState<boolean>(false);
  const [todayToastMessage, setTodayToastMessage] = useState<string | null>(null);

  // Estados del Gráfico de Líneas Dinámico de Evolución Diaria de Ventas
  const [dailyChartRange, setDailyChartRange] = useState<'7d' | '14d' | '30d' | 'mes_actual'>('14d');
  const [showSalesLine, setShowSalesLine] = useState<boolean>(true);
  const [showExpensesLine, setShowExpensesLine] = useState<boolean>(true);
  const [showProfitLine, setShowProfitLine] = useState<boolean>(true);
  const [showTicketLine, setShowTicketLine] = useState<boolean>(false);
  const [showBranchTextTable, setShowBranchTextTable] = useState<boolean>(false);

  // Serie temporal diaria reactiva para el Gráfico de Líneas Dinámico (Recharts LineChart)
  const dailySalesEvolution = useMemo(() => {
    const monthNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const dayNamesShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dayNamesFull = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const monthNamesFull = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const opTodayStr = getOperationalDateString(new Date());
    const [opY, opM, opD] = opTodayStr.split('-').map(Number);
    const endObj = new Date(opY, opM - 1, opD, 12, 0, 0);
    const startObj = new Date(endObj);

    if (dailyChartRange === '7d') {
      startObj.setDate(endObj.getDate() - 6);
    } else if (dailyChartRange === '14d') {
      startObj.setDate(endObj.getDate() - 13);
    } else if (dailyChartRange === '30d') {
      startObj.setDate(endObj.getDate() - 29);
    } else {
      startObj.setDate(1);
    }

    const dayMap = new Map<string, { ventas: number; gastos: number; pedidos: number }>();
    const cursor = new Date(startObj);
    const pad = (n: number) => String(n).padStart(2, '0');

    while (cursor <= endObj) {
      const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
      dayMap.set(key, { ventas: 0, gastos: 0, pedidos: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    // 1. Acumular desde órdenes cobradas en memoria
    const datesWithOrders = new Set<string>();
    orders.forEach(order => {
      const isPaid = order.estado === 'cobrado' || order.estadoPago === 'cobrado';
      if (!isPaid) return;
      if (selectedBranchId !== 'all' && order.restaurantId !== selectedBranchId) return;
      const dStr = getOperationalDateString(order.cobradoEn || order.creadoEn);
      if (dStr && dayMap.has(dStr)) {
        const entry = dayMap.get(dStr)!;
        entry.ventas += Number(order.total) || 0;
        entry.pedidos += 1;
        datesWithOrders.add(dStr);
      }
    });

    // 2. Respaldo desde currentDailyStats para días sin órdenes en memoria pero con dailyStats consolidados
    currentDailyStats.forEach(stat => {
      if (selectedBranchId !== 'all' && stat.restaurantId !== selectedBranchId) return;
      if (dayMap.has(stat.fecha) && !datesWithOrders.has(stat.fecha)) {
        const entry = dayMap.get(stat.fecha)!;
        entry.ventas += Number(stat.ventasTotales) || 0;
        entry.pedidos += Number(stat.pedidosCobrados) || 0;
      }
    });

    // 3. Acumular gastos operativos diarios
    expenses.forEach(exp => {
      if (selectedBranchId !== 'all' && exp.restaurantId !== selectedBranchId) return;
      const dStr = getOperationalDateString(exp.fecha || exp.creadoEn);
      if (dStr && dayMap.has(dStr)) {
        const entry = dayMap.get(dStr)!;
        entry.gastos += Number(exp.monto) || 0;
      }
    });

    const data = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, vals]) => {
        const [y, m, d] = dateKey.split('-').map(Number);
        const dObj = new Date(y, m - 1, d);
        const diaSemana = dayNamesShort[dObj.getDay()];
        const mesCorto = monthNamesShort[dObj.getMonth()];
        const ventas = Math.round(vals.ventas * 100) / 100;
        const gastos = Math.round(vals.gastos * 100) / 100;
        const ganancia = Math.round((ventas - gastos) * 100) / 100;
        const ticketPromedio = vals.pedidos > 0 ? Math.round((ventas / vals.pedidos) * 100) / 100 : 0;

        return {
          fecha: dateKey,
          label: `${diaSemana} ${d} ${mesCorto}`,
          shortLabel: `${d} ${mesCorto}`,
          fechaCompleta: `${dayNamesFull[dObj.getDay()]}, ${d} de ${monthNamesFull[dObj.getMonth()]} ${y}`,
          ventas,
          gastos,
          ganancia,
          pedidos: vals.pedidos,
          ticketPromedio
        };
      });

    const totalRangeSales = data.reduce((acc, item) => acc + item.ventas, 0);
    const avgDailySales = data.length > 0 ? Math.round((totalRangeSales / data.length) * 100) / 100 : 0;
    const peakDay = data.reduce(
      (best, item) => (item.ventas > best.ventas ? item : best),
      { label: '-', ventas: 0, fechaCompleta: '-' }
    );

    return {
      data,
      totalRangeSales: Math.round(totalRangeSales * 100) / 100,
      avgDailySales,
      peakDay
    };
  }, [orders, expenses, currentDailyStats, selectedBranchId, dailyChartRange]);

  // Horizonte de proyección financiera (7, 15 o 30 días hacia adelante)
  const [projectionHorizonDays, setProjectionHorizonDays] = useState<7 | 15 | 30>(7);

  // Cálculo de Ventas contra Gastos y Proyección Financiera (Forecast P&L)
  const salesExpensesProjection = useMemo(() => {
    const history = dailySalesEvolution.data;
    const n = history.length;

    const totalRealSales = history.reduce((acc, d) => acc + d.ventas, 0);
    const totalRealExpenses = history.reduce((acc, d) => acc + d.gastos, 0);
    const totalRealProfit = totalRealSales - totalRealExpenses;

    const activeSalesDays = history.filter(d => d.ventas > 0);
    const activeExpenseDays = history.filter(d => d.gastos > 0);

    // Base diaria ponderada (combina promedio global y promedio de días activos recientes)
    const recentSlice = history.slice(-7);
    const recentAvgSales = recentSlice.length > 0
      ? recentSlice.reduce((s, d) => s + d.ventas, 0) / recentSlice.length
      : 0;
    const recentAvgExpenses = recentSlice.length > 0
      ? recentSlice.reduce((s, d) => s + d.gastos, 0) / recentSlice.length
      : 0;

    const activeAvgSales = activeSalesDays.length > 0
      ? activeSalesDays.reduce((s, d) => s + d.ventas, 0) / activeSalesDays.length
      : 0;
    const activeAvgExpenses = activeExpenseDays.length > 0
      ? activeExpenseDays.reduce((s, d) => s + d.gastos, 0) / activeExpenseDays.length
      : 0;

    const baseDailySales = recentAvgSales > 0
      ? (recentAvgSales * 0.65 + activeAvgSales * 0.35)
      : activeAvgSales;
    const baseDailyExpenses = recentAvgExpenses > 0
      ? (recentAvgExpenses * 0.65 + activeAvgExpenses * 0.35)
      : activeAvgExpenses;

    // Pendiente de tendencia lineal suave sobre los últimos días
    let salesSlope = 0;
    let expensesSlope = 0;
    if (recentSlice.length >= 3) {
      const m = recentSlice.length;
      const xMean = (m - 1) / 2;
      let numS = 0;
      let numE = 0;
      let den = 0;
      recentSlice.forEach((pt, idx) => {
        const dx = idx - xMean;
        numS += dx * (pt.ventas - recentAvgSales);
        numE += dx * (pt.gastos - recentAvgExpenses);
        den += dx * dx;
      });
      if (den > 0) {
        salesSlope = Math.max(-baseDailySales * 0.06, Math.min(baseDailySales * 0.08, numS / den));
        expensesSlope = Math.max(-baseDailyExpenses * 0.05, Math.min(baseDailyExpenses * 0.06, numE / den));
      }
    }

    const dayNamesShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const monthNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    // Construir serie combinada: Histórico Real + Horizonte Proyectado
    const combinedData: {
      label: string;
      fechaCompleta: string;
      esProyeccion: boolean;
      ventasReales: number | null;
      gastosReales: number | null;
      gananciaReal: number | null;
      ventasProyectadas: number | null;
      gastosProyectados: number | null;
      gananciaProyectada: number | null;
    }[] = history.map((d, idx) => {
      const isLastReal = idx === n - 1;
      return {
        label: d.shortLabel,
        fechaCompleta: `${d.fechaCompleta} (Real)`,
        esProyeccion: false,
        ventasReales: d.ventas,
        gastosReales: d.gastos,
        gananciaReal: d.ganancia,
        // Conectar el último punto real con el inicio de la línea de proyección
        ventasProyectadas: isLastReal ? d.ventas : null,
        gastosProyectados: isLastReal ? d.gastos : null,
        gananciaProyectada: isLastReal ? d.ganancia : null
      };
    });

    let projectedSalesSum = 0;
    let projectedExpensesSum = 0;
    const now = new Date();

    for (let step = 1; step <= projectionHorizonDays; step++) {
      const futDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + step);
      const dayOfWeek = futDate.getDay();
      // Factor estacional ligero para fin de semana (Viernes/Sábado +12%, Domingo +5%)
      const weekendBoost = (dayOfWeek === 5 || dayOfWeek === 6) ? 1.12 : dayOfWeek === 0 ? 1.05 : 0.97;

      const projSale = Math.max(0, Math.round(((baseDailySales + salesSlope * step * 0.35) * weekendBoost) * 100) / 100);
      const projExp = Math.max(0, Math.round((baseDailyExpenses + expensesSlope * step * 0.25) * 100) / 100);
      const projProf = Math.round((projSale - projExp) * 100) / 100;

      projectedSalesSum += projSale;
      projectedExpensesSum += projExp;

      const dNum = futDate.getDate();
      const mShort = monthNamesShort[futDate.getMonth()];
      const dShort = dayNamesShort[dayOfWeek];

      combinedData.push({
        label: `+${ dNum } ${ mShort }`,
        fechaCompleta: `Proyección: ${dShort} ${dNum} ${mShort} (+${step}d)`,
        esProyeccion: true,
        ventasReales: null,
        gastosReales: null,
        gananciaReal: null,
        ventasProyectadas: projSale,
        gastosProyectados: projExp,
        gananciaProyectada: projProf
      });
    }

    const projectedProfitSum = projectedSalesSum - projectedExpensesSum;
    const projectedMarginPct = projectedSalesSum > 0
      ? (projectedProfitSum / projectedSalesSum) * 100
      : 0;

    const dailyBreakEven = Math.round(baseDailyExpenses * 100) / 100;
    const daysAboveBreakEven = history.filter(d => d.ventas > 0 && d.ventas >= dailyBreakEven).length;

    return {
      combinedData,
      totalRealSales: Math.round(totalRealSales * 100) / 100,
      totalRealExpenses: Math.round(totalRealExpenses * 100) / 100,
      totalRealProfit: Math.round(totalRealProfit * 100) / 100,
      projectedSalesSum: Math.round(projectedSalesSum * 100) / 100,
      projectedExpensesSum: Math.round(projectedExpensesSum * 100) / 100,
      projectedProfitSum: Math.round(projectedProfitSum * 100) / 100,
      projectedMarginPct: Math.round(projectedMarginPct * 10) / 10,
      dailyBreakEven,
      daysAboveBreakEven,
      totalHistoryDays: n
    };
  }, [dailySalesEvolution.data, projectionHorizonDays]);

  // Pulso operativo en tiempo real (integrado desde el antiguo Panel de Indicadores sin duplicar reportes)
  const liveOperationsMetrics = useMemo(() => {
    const branchOrders = selectedBranchId === 'all'
      ? orders
      : orders.filter(o => o.restaurantId === selectedBranchId);

    const activeOrders = branchOrders.filter(
      o => o.estado !== 'cobrado' && o.estado !== 'entregado' && o.estado !== 'cancelado'
    );

    const inKitchenOrders = activeOrders.filter(o => o.estado === 'nuevo' || o.estado === 'preparando');
    const readyToServeOrders = activeOrders.filter(o => o.estado === 'listo');
    const activeDineInOrders = activeOrders.filter(o => (!o.tipo || o.tipo === 'local') && !o.esPedidoExpress);
    const activeExpressOrDelivery = activeOrders.filter(o => o.esPedidoExpress || o.tipo === 'para_llevar' || o.tipo === 'delivery');

    const nowMs = Date.now();
    const delayedOrders = inKitchenOrders.filter(o => {
      const createdMs = new Date(o.creadoEn || nowMs).getTime();
      return (nowMs - createdMs) / 60000 > 20;
    });

    const lowStockDishesCount = menuItems.filter(m => {
      if (selectedBranchId !== 'all' && m.restaurantId && m.restaurantId !== 'all' && m.restaurantId !== selectedBranchId) return false;
      return m.controlaStock && (m.stockActual ?? 0) <= (m.stockMinimo ?? 5);
    }).length;

    return {
      inKitchenCount: inKitchenOrders.length,
      readyCount: readyToServeOrders.length,
      dineInCount: activeDineInOrders.length,
      expressDeliveryCount: activeExpressOrDelivery.length,
      delayedCount: delayedOrders.length,
      lowStockDishesCount
    };
  }, [orders, menuItems, selectedBranchId]);

  // Handler para recalcular deterministicamente las estadísticas de hoy
  const handleRecalculateToday = async () => {
    setIsRecalculatingToday(true);
    setTodayToastMessage(null);
    sounds.playKeypadClick();
    try {
      const targetRestId = selectedBranchId === 'all' ? null : selectedBranchId;
      const res = await recalculateTodayDailyStats(activeBizId, targetRestId, accessibleRestaurants);
      sounds.playCashRegister();
      setTodayToastMessage(`¡Estadísticas de hoy recalculadas exitosamente! (${res.recalculatedCount} registro(s) sincronizados para ${res.targetDate})`);
      await loadFinancialData(true);
      setTimeout(() => setTodayToastMessage(null), 6000);
    } catch (err: any) {
      console.error('Error recalculando estadísticas de hoy:', err);
      setTodayToastMessage(`Error al recalcular hoy: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsRecalculatingToday(false);
    }
  };

  // Estado de ordenamiento para la tabla multi-sucursal
  const [sortField, setSortField] = useState<'nombre' | 'ventas' | 'gastos' | 'ganancia' | 'pedidos' | 'ticketPromedio' | 'margen'>('ventas');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Suscribirse a gastos del negocio
  useEffect(() => {
    const unsubExpenses = subscribeToExpenses(activeBizId, null, (data) => {
      setExpenses(data);
    });
    return () => unsubExpenses();
  }, [activeBizId]);

  // Carga y agregación de datos financieros
  const loadFinancialData = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const ranges = getPeriodDateRanges(timeframe);
      setPeriodLabels({ current: ranges.currentLabel, previous: ranges.previousLabel });

      const targetRestId = selectedBranchId === 'all' ? null : selectedBranchId;

      // Obtener dailyStats para el periodo actual y periodo anterior (con fallback a cálculo en vivo)
      const [currentStats, previousStats] = await Promise.all([
        getDailyStatsForRange(
          activeBizId,
          targetRestId,
          ranges.currentDates,
          orders,
          expenses,
          shifts,
          accessibleRestaurants
        ),
        getDailyStatsForRange(
          activeBizId,
          targetRestId,
          ranges.previousDates,
          orders,
          expenses,
          shifts,
          accessibleRestaurants
        )
      ]);

      // Guardar estadísticas diarias del periodo actual
      setCurrentDailyStats(currentStats);

      // Si las comandas u operaciones en base de datos están vacías para el periodo anterior (ej. negocio nuevo de prueba),
      // generamos estadísticas representativas proporcionales para calcular las variaciones reales y periodos sin romper la experiencia.
      const enrichedSummary = aggregateFinancialSummary(
        timeframe,
        currentStats,
        previousStats,
        accessibleRestaurants,
        targetRestId,
        menuItems,
        orders,
        ranges.currentDates,
        expenses
      );

      setSummaryData(enrichedSummary);
    } catch (err) {
      console.error('Error al procesar métricas financieras:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Handler para correr el diagnóstico de integridad
  const handleRunDiagnostic = async () => {
    sounds.playKeypadClick();
    setIsDiagnosing(true);
    setRecalculateMessage(null);
    setShowDiagnosticModal(true);
    try {
      const ranges = getPeriodDateRanges(timeframe);
      const targetRestId = selectedBranchId === 'all' ? null : selectedBranchId;
      const result = await diagnoseDailyStats(activeBizId, targetRestId, ranges.currentDates);
      setDiagnosticResult(result);
      if (result.mismatch) {
        setAutoStatsStatus('con error');
      } else {
        setAutoStatsStatus('activas');
      }
    } catch (err) {
      console.error('Error al diagnosticar estadísticas:', err);
      setAutoStatsStatus('con error');
    } finally {
      setIsDiagnosing(false);
    }
  };

  // Handler para recalcular estadísticas faltantes
  const handleRecalculate = async () => {
    setIsRecalculating(true);
    setRecalculateMessage(null);
    sounds.playKeypadClick();
    try {
      const ranges = getPeriodDateRanges(timeframe);
      const targetRestId = selectedBranchId === 'all' ? null : selectedBranchId;
      const allDates = [...ranges.currentDates, ...ranges.previousDates];
      const res = await recalculateDailyStatsForPeriod(
        activeBizId,
        targetRestId,
        allDates,
        accessibleRestaurants
      );
      sounds.playCashRegister();
      setRecalculateMessage(`¡Sincronización exitosa! Se actualizaron ${res.recalculatedCount} registros diarios (${res.fixedOrdersCount} comandas verificadas).`);
      setAutoStatsStatus('activas');
      // Recargar datos del dashboard
      await loadFinancialData(true);
      // Actualizar diagnóstico
      const updatedDiag = await diagnoseDailyStats(activeBizId, targetRestId, ranges.currentDates);
      setDiagnosticResult(updatedDiag);
    } catch (err: any) {
      console.error('Error recalculando estadísticas:', err);
      setRecalculateMessage(`Error: ${err.message || 'Fallo al recalcular'}`);
      setAutoStatsStatus('con error');
    } finally {
      setIsRecalculating(false);
    }
  };

  // Handler para exportar reporte a Excel
  const handleExportExcel = () => {
    if (!summaryData) return;
    sounds.playKeypadClick();
    const branchName = selectedBranchId === 'all' 
      ? 'Todas las Sucursales' 
      : (accessibleRestaurants.find(r => r.id === selectedBranchId)?.nombre || 'Sucursal');
    const businessName = currentBusiness?.nombre || currentUserAccount?.businessId || 'GastroSmart';
    exportFinancialReportToExcel({
      summary: summaryData,
      dailyStats: currentDailyStats,
      periodLabel: periodLabels.current,
      businessName,
      selectedBranchName: branchName,
      expenses,
      orders,
      restaurants: accessibleRestaurants
    });
  };

  useEffect(() => {
    loadFinancialData();
  }, [timeframe, selectedBranchId, orders, expenses, shifts, accessibleRestaurants]);

  // Handler de cambio de sucursal
  const handleBranchChange = (branchId: string) => {
    sounds.playKeypadClick();
    setSelectedBranchId(branchId);
  };

  // Handler de cambio de temporalidad
  const handleTimeframeChange = (tf: FinancialTimeframe) => {
    sounds.playKeypadClick();
    setTimeframe(tf);
  };

  // Tabla multi-sucursal ordenada
  const sortedBranches = useMemo(() => {
    if (!summaryData?.comparativaSucursales) return [];
    return [...summaryData.comparativaSucursales].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [summaryData, sortField, sortAsc]);

  const handleToggleSort = (field: typeof sortField) => {
    sounds.playKeypadClick();
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Componente interno para Render de Variación Porcentual
  const VariationBadge: React.FC<{ 
    value: number; 
    isInverse?: boolean; // Si es gasto, que suba puede ser rojo
    isPercentagePoints?: boolean;
  }> = ({ value, isInverse = false, isPercentagePoints = false }) => {
    const isZero = value === 0;
    const isPositive = value > 0;
    
    // Para gastos: si sube es desfavorable (rojo), si baja es favorable (verde)
    const isGood = isInverse ? !isPositive : isPositive;

    const colorClass = isZero 
      ? 'bg-neutral-100 text-neutral-600' 
      : isGood 
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
        : 'bg-rose-50 text-rose-700 border border-rose-200';

    const Icon = isZero ? ArrowUpDown : isPositive ? TrendingUp : TrendingDown;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${colorClass}`}>
        <Icon className="w-3.5 h-3.5" />
        <span>
          {isPositive ? '+' : ''}
          {value.toFixed(1)}
          {isPercentagePoints ? ' pts' : '%'}
        </span>
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* 1. BARRA SUPERIOR DE FILTROS & CONTROL */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        
        {/* Selector de Temporalidad (Día / Semana / Mes) */}
        <div className="flex flex-col gap-1.5 w-full md:w-auto">
          <label className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>Temporalidad de Análisis</span>
          </label>
          <div className="inline-flex p-1 bg-neutral-100 rounded-xl border border-neutral-200">
            {(['dia', 'semana', 'mes'] as FinancialTimeframe[]).map((tf) => {
              const active = timeframe === tf;
              const label = tf === 'dia' ? 'Día (Hoy)' : tf === 'semana' ? 'Semana (7d)' : 'Mes';
              return (
                <button
                  key={tf}
                  onClick={() => handleTimeframeChange(tf)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    active 
                      ? 'bg-white text-blue-700 shadow-xs border border-neutral-200/60' 
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/50'
                  }`}
                >
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selector de Sucursal & Modo Consolidado */}
        <div className="flex flex-col gap-1.5 w-full md:w-auto">
          <label className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-orange-600" />
            <span>Alcance / Sucursales</span>
          </label>
          
          {accessibleRestaurants.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="relative">
                <select
                  value={selectedBranchId}
                  onChange={(e) => handleBranchChange(e.target.value)}
                  className="h-10 pl-3.5 pr-8 rounded-xl bg-neutral-50 border border-neutral-300 font-bold text-xs text-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer shadow-2xs"
                >
                  <option value="all">🏢 Todas las sucursales (Consolidado General - {accessibleRestaurants.length} Sedes)</option>
                  {accessibleRestaurants.map(r => (
                    <option key={r.id} value={r.id}>
                      📍 {r.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Botón rápido para alternar a Consolidado General */}
              {selectedBranchId !== 'all' && (
                <button
                  type="button"
                  onClick={() => handleBranchChange('all')}
                  className="h-10 px-3 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-black transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Ver consolidado general de todas las sucursales"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Ver Consolidado</span>
                </button>
              )}
            </div>
          ) : (
            <div className="h-10 px-3.5 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center gap-2 text-xs font-bold text-neutral-700">
              <Building2 className="w-4 h-4 text-orange-500" />
              <span>{accessibleRestaurants[0]?.nombre || 'Sede Principal'}</span>
            </div>
          )}
        </div>

        {/* Indicador de conexión en tiempo real & Acciones */}
        <div className="flex flex-wrap items-center justify-between md:justify-end gap-2.5 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-neutral-100">
          
          {/* Indicador Realtime onSnapshot */}
          <div 
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition ${
              isLoading || isRefreshing
                ? 'bg-neutral-100 text-neutral-600 border-neutral-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
            title="Sincronización en tiempo real vía Firebase Firestore onSnapshot"
          >
            <span className={`w-2 h-2 rounded-full ${
              isLoading || isRefreshing 
                ? 'bg-neutral-400 animate-ping' 
                : 'bg-emerald-500 animate-pulse'
            }`} />
            <span>
              {isLoading || isRefreshing ? 'Reconectando...' : 'Conectado - datos en vivo'}
            </span>
          </div>

          {/* Botón Verificar Datos (Solo Owner y Admin) */}
          {(isOwner || userRole === 'admin') && (
            <button
              onClick={handleRunDiagnostic}
              disabled={isDiagnosing}
              title="Diagnosticar integridad de pedidos cobrados vs dailyStats vs expenses"
              className="px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>{isDiagnosing ? 'Analizando...' : 'Diagnóstico'}</span>
            </button>
          )}

          {/* Botón Recalcular Hoy (Solo Owner y Admin) */}
          {(isOwner || userRole === 'admin') && (
            <button
              onClick={handleRecalculateToday}
              disabled={isRecalculatingToday}
              title="Borrar y regenerar deterministicamente las estadísticas de hoy desde comandas y gastos"
              className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRecalculatingToday ? 'animate-spin text-indigo-600' : 'text-indigo-600'}`} />
              <span>{isRecalculatingToday ? 'Recalculando hoy...' : 'Recalcular Hoy'}</span>
            </button>
          )}

          {/* Botón Nuevo Gasto (Cualquier categoría: transporte, alquiler, servicios, etc.) */}
          {(isOwner || userRole === 'admin') && (
            <button
              onClick={() => setShowNewExpenseModal(true)}
              title="Registrar nuevo gasto operativo: transporte, sueldo, servicios, alquiler, mantenimiento, etc."
              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black transition flex items-center gap-1.5 shadow-sm shadow-purple-600/25 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>＋ Nuevo Gasto</span>
            </button>
          )}

          {/* Botón Nueva Compra de Víveres/Insumos (Solo Owner y Admin) */}
          {(isOwner || userRole === 'admin') && (
            <button
              onClick={() => setShowNewPurchaseModal(true)}
              title="Registrar nueva compra detallada de víveres e insumos con autocompletado y escaneo de ticket"
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition flex items-center gap-1.5 shadow-sm shadow-emerald-600/25 cursor-pointer"
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Compra Insumos</span>
            </button>
          )}

          {/* Botón Exportar Excel */}
          <button
            onClick={handleExportExcel}
            title="Exportar reporte contable en formato Excel (.xlsx)"
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Excel</span>
          </button>

          {/* Botón Informe Ejecutivo PDF */}
          <button
            onClick={() => setShowPdfReport(true)}
            title="Ver e imprimir informe financiero ejecutivo"
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">PDF</span>
          </button>

          {/* Botón Refrescar */}
          <button
            onClick={() => loadFinancialData(true)}
            disabled={isRefreshing}
            title="Recalcular métricas"
            className="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>

      </div>

      {/* BARRA DE SUB-VISTAS UNIFICADAS (Sin duplicar reportes entre Indicadores y Finanzas P&L) */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-2 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => { sounds.playKeypadClick(); setActiveSubView('kpis'); }}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer ${
              activeSubView === 'kpis'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>1. Estado de Resultados (P&L) & Pulso en Vivo</span>
          </button>

          <button
            type="button"
            onClick={() => { sounds.playKeypadClick(); setActiveSubView('rentabilidad_platos'); }}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer ${
              activeSubView === 'rentabilidad_platos'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>2. Costos & Rentabilidad por Plato (Food Cost)</span>
          </button>

          <button
            type="button"
            onClick={() => { sounds.playKeypadClick(); setActiveSubView('historial_insumos'); }}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer ${
              activeSubView === 'historial_insumos'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>3. Compras & Proveedores de Insumos ({summaryData?.comprasInsumosDetalle?.length || 0})</span>
          </button>
        </div>

        <div className="px-2.5 py-1 rounded-lg bg-neutral-50 border border-neutral-200/80 text-[11px] font-bold text-neutral-500">
          Panel Unificado: Indicadores + Finanzas P&L (Sin reportes repetidos)
        </div>
      </div>

      {/* Toast Feedback de Recalculo de Hoy */}
      {todayToastMessage && (
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-indigo-900 text-xs font-bold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>{todayToastMessage}</span>
          </div>
          <button 
            onClick={() => setTodayToastMessage(null)}
            className="text-indigo-400 hover:text-indigo-700 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* RENDERIZADO CONDICIONAL UNIFICADO */}
      {activeSubView === 'historial_insumos' ? (
        <IngredientPurchaseHistory
          expenses={expenses}
          restaurants={accessibleRestaurants}
          selectedBranchId={selectedBranchId}
          onClose={() => setActiveSubView('kpis')}
        />
      ) : activeSubView === 'rentabilidad_platos' ? (
        <DishCostProfitReport
          orders={orders}
          restaurants={accessibleRestaurants}
          menuItems={menuItems}
          archivedMenuItems={archivedMenuItems}
          onEditDish={onEditDish}
          onDeleteDish={onDeleteDish}
        />
      ) : (
        <>
      {/* 1.5 PULSO OPERATIVO EN TIEMPO REAL (Integrado desde Indicadores sin duplicar KPIs) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900 text-white rounded-2xl p-3.5 flex items-center justify-between border border-slate-800 shadow-xs">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-400 flex items-center gap-1">
              <ChefHat className="w-3.5 h-3.5" /> Cocina KDS (En Vivo)
            </span>
            <div className="text-lg font-black mt-0.5">
              {liveOperationsMetrics.inKitchenCount} <span className="text-xs font-semibold text-slate-400">en prep.</span>
            </div>
            <div className="text-[11px] text-emerald-400 font-bold">
              {liveOperationsMetrics.readyCount} listos para entregar
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center font-black">
            <ChefHat className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 text-white rounded-2xl p-3.5 flex items-center justify-between border border-slate-800 shadow-xs">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-400 flex items-center gap-1">
              <Store className="w-3.5 h-3.5" /> Servicio en Salón
            </span>
            <div className="text-lg font-black mt-0.5">
              {liveOperationsMetrics.dineInCount} <span className="text-xs font-semibold text-slate-400">comandas activas</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Atención en mesas en curso
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-black">
            <Store className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 text-white rounded-2xl p-3.5 flex items-center justify-between border border-slate-800 shadow-xs">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-400 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" /> Express & Delivery
            </span>
            <div className="text-lg font-black mt-0.5">
              {liveOperationsMetrics.expressDeliveryCount} <span className="text-xs font-semibold text-slate-400">en despacho</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Mostrador y envío a domicilio
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-black">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 text-white rounded-2xl p-3.5 flex items-center justify-between border border-slate-800 shadow-xs">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" /> Alertas Operativas
            </span>
            <div className="text-lg font-black mt-0.5">
              {liveOperationsMetrics.delayedCount} <span className="text-xs font-semibold text-slate-400">demorados (&gt;20m)</span>
            </div>
            <div className="text-[11px] text-amber-300 font-bold">
              {liveOperationsMetrics.lowStockDishesCount} platos en stock crítico
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>
      {/* 2. TARJETAS DE KPIs PRINCIPALES (Con variación % vs periodo anterior) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        
        {/* KPI 1: Ventas Totales */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Ventas Totales</span>
            <DollarSign className="w-4 h-4 text-blue-600" />
          </div>
          <div className="my-2.5">
            <div className="text-2xl font-black text-neutral-900">
              ${summaryData?.ventasTotales.actual.toFixed(2) || '0.00'}
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              Ant: ${summaryData?.ventasTotales.anterior.toFixed(2) || '0.00'}
            </div>
          </div>
          <div>
            <VariationBadge value={summaryData?.ventasTotales.variacionPorcentaje || 0} />
          </div>
        </div>

        {/* KPI 2: Gastos Operativos */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Gastos Operativos</span>
            <Receipt className="w-4 h-4 text-rose-600" />
          </div>
          <div className="my-2.5">
            <div className="text-2xl font-black text-neutral-900">
              ${summaryData?.gastosOperativos.actual.toFixed(2) || '0.00'}
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              Ant: ${summaryData?.gastosOperativos.anterior.toFixed(2) || '0.00'}
            </div>
          </div>
          <div>
            <VariationBadge 
              value={summaryData?.gastosOperativos.variacionPorcentaje || 0} 
              isInverse={true}
            />
          </div>
        </div>

        {/* KPI 3: Ganancia Neta */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Ganancia Neta</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="my-2.5">
            <div className={`text-2xl font-black ${
              (summaryData?.gananciaNeta.actual || 0) >= 0 ? 'text-emerald-700' : 'text-rose-600'
            }`}>
              ${summaryData?.gananciaNeta.actual.toFixed(2) || '0.00'}
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              Ant: ${summaryData?.gananciaNeta.anterior.toFixed(2) || '0.00'}
            </div>
          </div>
          <div>
            <VariationBadge value={summaryData?.gananciaNeta.variacionPorcentaje || 0} />
          </div>
        </div>

        {/* KPI 4: Margen % */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Margen Neto %</span>
            <Percent className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="my-2.5">
            <div className="text-2xl font-black text-neutral-900">
              {summaryData?.margenPorcentaje.actual.toFixed(1) || '0.0'}%
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              Ant: {summaryData?.margenPorcentaje.anterior.toFixed(1) || '0.0'}%
            </div>
          </div>
          <div>
            <VariationBadge 
              value={summaryData?.margenPorcentaje.variacionPorcentaje || 0} 
              isPercentagePoints={true}
            />
          </div>
        </div>

        {/* KPI 5: Pedidos Cobrados */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Pedidos Cobrados</span>
            <ShoppingBag className="w-4 h-4 text-amber-600" />
          </div>
          <div className="my-2.5">
            <div className="text-2xl font-black text-neutral-900">
              {summaryData?.pedidosTotales.actual || 0}
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              Ant: {summaryData?.pedidosTotales.anterior || 0} pedidos
            </div>
          </div>
          <div>
            <VariationBadge value={summaryData?.pedidosTotales.variacionPorcentaje || 0} />
          </div>
        </div>

        {/* KPI 6: Ticket Promedio */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-neutral-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Ticket Promedio</span>
            <BarChart3 className="w-4 h-4 text-purple-600" />
          </div>
          <div className="my-2.5">
            <div className="text-2xl font-black text-neutral-900">
              ${summaryData?.ticketPromedio.actual.toFixed(2) || '0.00'}
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              Ant: ${summaryData?.ticketPromedio.anterior.toFixed(2) || '0.00'}
            </div>
          </div>
          <div>
            <VariationBadge value={summaryData?.ticketPromedio.variacionPorcentaje || 0} />
          </div>
        </div>

      </div>

      {/* 3. GRÁFICO DE LÍNEAS DINÁMICO (RECHARTS): EVOLUCIÓN DIARIA DE LAS VENTAS Y BALANCE P&L */}
      {customDailySalesChart ? (
        customDailySalesChart
      ) : (
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-neutral-100">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h3 className="font-black text-neutral-900 text-base">
                Evolución Diaria de las Ventas (Gráfico de Líneas Dinámico)
              </h3>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Curva interactiva día por día de ventas cobradas, gastos operativos, ganancia neta y ticket promedio en tiempo real
            </p>
          </div>

          {/* Controles dinámicos de rango diario */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 bg-neutral-100 rounded-xl border border-neutral-200">
              {([
                { id: '7d', label: '7 Días' },
                { id: '14d', label: '14 Días' },
                { id: '30d', label: '30 Días' },
                { id: 'mes_actual', label: 'Este Mes' },
              ] as const).map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    sounds.playKeypadClick();
                    setDailyChartRange(preset.id);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    dailyChartRange === preset.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Selectores dinámicos de líneas */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => { sounds.playKeypadClick(); setShowSalesLine(v => !v); }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                  showSalesLine ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-neutral-50 text-neutral-400 border-neutral-200'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                <span>Ventas Diarias</span>
              </button>

              <button
                type="button"
                onClick={() => { sounds.playKeypadClick(); setShowExpensesLine(v => !v); }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                  showExpensesLine ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-neutral-50 text-neutral-400 border-neutral-200'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span>Gastos</span>
              </button>

              <button
                type="button"
                onClick={() => { sounds.playKeypadClick(); setShowProfitLine(v => !v); }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                  showProfitLine ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-neutral-50 text-neutral-400 border-neutral-200'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <span>Ganancia Neta</span>
              </button>

              <button
                type="button"
                onClick={() => { sounds.playKeypadClick(); setShowTicketLine(v => !v); }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                  showTicketLine ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-neutral-50 text-neutral-400 border-neutral-200'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                <span>Ticket Prom.</span>
              </button>
            </div>
          </div>
        </div>

        {/* Resumen rápido del rango diario analizado */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-neutral-50/80 p-3.5 rounded-xl border border-neutral-200/70 text-xs">
          <div className="flex items-center justify-between sm:justify-start sm:gap-3">
            <span className="text-neutral-500 font-semibold">Ventas Acumuladas ({dailySalesEvolution.data.length} días):</span>
            <span className="font-mono font-black text-blue-700 text-sm">${dailySalesEvolution.totalRangeSales.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between sm:justify-start sm:gap-3">
            <span className="text-neutral-500 font-semibold">Promedio Diario de Ventas:</span>
            <span className="font-mono font-black text-neutral-900 text-sm">${dailySalesEvolution.avgDailySales.toFixed(2)} / día</span>
          </div>
          <div className="flex items-center justify-between sm:justify-start sm:gap-3">
            <span className="text-neutral-500 font-semibold">Mejor Día del Rango:</span>
            <span className="font-mono font-black text-emerald-700 text-sm">
              {dailySalesEvolution.peakDay.ventas > 0
                ? `${dailySalesEvolution.peakDay.label} ($${dailySalesEvolution.peakDay.ventas.toFixed(2)})`
                : 'Sin ventas registradas'}
            </span>
          </div>
        </div>

        {/* Canvas del Gráfico de Líneas Dinámico Recharts */}
        <div className="w-full h-80">
          {dailySalesEvolution.data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={dailySalesEvolution.data}
                margin={{ top: 15, right: 20, bottom: 20, left: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="shortLabel" 
                  tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                />
                <YAxis 
                  tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 600 }}
                  tickFormatter={(val) => `$${val}`}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                />
                {dailySalesEvolution.avgDailySales > 0 && (
                  <ReferenceLine
                    y={dailySalesEvolution.avgDailySales}
                    stroke="#3B82F6"
                    strokeDasharray="4 4"
                    label={{
                      value: `Prom: $${dailySalesEvolution.avgDailySales}`,
                      position: 'insideTopRight',
                      fill: '#2563EB',
                      fontSize: 10,
                      fontWeight: 700
                    }}
                  />
                )}
                <Tooltip
                  formatter={(value: any, name: any) => {
                    return [`$${Number(value).toFixed(2)}`, name];
                  }}
                  labelFormatter={(label: any, payload: any) => {
                    const item = payload?.[0]?.payload;
                    if (!item) return label;
                    return `${item.fechaCompleta} (${item.pedidos} pedidos cobrados)`;
                  }}
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    color: '#F9FAFB',
                    borderRadius: '14px',
                    border: '1px solid #334155',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)'
                  }}
                  itemStyle={{ color: '#F9FAFB' }}
                />
                <Legend 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: '10px', fontSize: '12px', fontWeight: 'bold' }}
                />
                
                {/* Línea 1: Evolución Diaria de Ventas (Azul) */}
                {showSalesLine && (
                  <Line 
                    type="monotone" 
                    dataKey="ventas" 
                    name="Ventas Diarias" 
                    stroke="#2563EB" 
                    strokeWidth={3.5}
                    dot={{ r: 4, fill: '#FFFFFF', stroke: '#2563EB', strokeWidth: 2.5 }}
                    activeDot={{ r: 6.5, fill: '#2563EB', stroke: '#FFFFFF', strokeWidth: 2 }}
                  />
                )}

                {/* Línea 2: Gastos Operativos Diarios (Rojo) */}
                {showExpensesLine && (
                  <Line 
                    type="monotone" 
                    dataKey="gastos" 
                    name="Gastos Operativos" 
                    stroke="#EF4444" 
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#FFFFFF', stroke: '#EF4444', strokeWidth: 2 }}
                    activeDot={{ r: 5.5, fill: '#EF4444', stroke: '#FFFFFF', strokeWidth: 2 }}
                  />
                )}

                {/* Línea 3: Ganancia Neta Diaria (Verde Esmeralda) */}
                {showProfitLine && (
                  <Line 
                    type="monotone" 
                    dataKey="ganancia" 
                    name="Ganancia Neta" 
                    stroke="#10B981" 
                    strokeWidth={2.5}
                    strokeDasharray="5 4"
                    dot={{ r: 3.5, fill: '#10B981', stroke: '#FFFFFF', strokeWidth: 1.5 }}
                    activeDot={{ r: 6, fill: '#10B981', stroke: '#FFFFFF', strokeWidth: 2 }}
                  />
                )}

                {/* Línea 4: Ticket Promedio Diario (Púrpura) */}
                {showTicketLine && (
                  <Line 
                    type="monotone" 
                    dataKey="ticketPromedio" 
                    name="Ticket Promedio" 
                    stroke="#9333EA" 
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#FFFFFF', stroke: '#9333EA', strokeWidth: 2 }}
                    activeDot={{ r: 5.5 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-neutral-400 text-sm font-semibold">
              Cargando gráfico de líneas de evolución diaria de ventas...
            </div>
          )}
        </div>
      </div>
      )}

      {/* 3.5 GRÁFICO AMPLIADO DE VENTAS CONTRA GASTOS OPERATIVOS Y PROYECCIÓN FINANCIERA (FORECAST P&L) */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-neutral-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200/70">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h3 className="font-black text-neutral-900 text-base sm:text-lg">
                Ventas contra Gastos Operativos y Proyección Financiera
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 border border-indigo-200">
                Real + Proyección ({projectionHorizonDays} Días)
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Comparativa directa de ingresos frente a egresos reales y proyección estimada de flujo de caja y punto de equilibrio
            </p>
          </div>

          {/* Selector de Horizonte de Proyección */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-neutral-500 uppercase">Horizonte Proyectado:</span>
            <div className="inline-flex p-1 bg-neutral-100 rounded-xl border border-neutral-200">
              {([
                { days: 7 as const, label: '+7 Días' },
                { days: 15 as const, label: '+15 Días' },
                { days: 30 as const, label: '+30 Días (Mes)' }
              ]).map(opt => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => {
                    sounds.playKeypadClick();
                    setProjectionHorizonDays(opt.days);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    projectionHorizonDays === opt.days
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tarjetas de Resumen Ventas vs Gastos + Proyección */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Ventas Proyectadas */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] font-black uppercase text-emerald-800">
              <span>Ventas Proyectadas (+{projectionHorizonDays}d)</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-black font-mono text-emerald-700 my-1">
              ${salesExpensesProjection.projectedSalesSum.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-emerald-800/80 font-semibold">
              Real acumulado rango: <strong className="font-mono">${salesExpensesProjection.totalRealSales.toFixed(2)}</strong>
            </div>
          </div>

          {/* Card 2: Gastos Proyectados */}
          <div className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] font-black uppercase text-rose-800">
              <span>Gastos Proyectados (+{projectionHorizonDays}d)</span>
              <TrendingDown className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-xl font-black font-mono text-rose-600 my-1">
              ${salesExpensesProjection.projectedExpensesSum.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-rose-800/80 font-semibold">
              Gasto real rango: <strong className="font-mono">${salesExpensesProjection.totalRealExpenses.toFixed(2)}</strong>
            </div>
          </div>

          {/* Card 3: Utilidad Neta Proyectada */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] font-black uppercase text-indigo-900">
              <span>Utilidad Neta Proyectada</span>
              <DollarSign className="w-4 h-4 text-indigo-600" />
            </div>
            <div className={`text-xl font-black font-mono my-1 ${
              salesExpensesProjection.projectedProfitSum >= 0 ? 'text-indigo-700' : 'text-rose-600'
            }`}>
              {salesExpensesProjection.projectedProfitSum >= 0 ? '+' : ''}
              ${salesExpensesProjection.projectedProfitSum.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-indigo-800/80 font-semibold">
              Margen proyectado: <strong>{salesExpensesProjection.projectedMarginPct.toFixed(1)}%</strong>
            </div>
          </div>

          {/* Card 4: Punto de Equilibrio Diario */}
          <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] font-black uppercase text-amber-900">
              <span>Punto de Equilibrio / Día</span>
              <Activity className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-xl font-black font-mono text-amber-800 my-1">
              ${salesExpensesProjection.dailyBreakEven.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-amber-900/80 font-semibold">
              Superado en <strong>{salesExpensesProjection.daysAboveBreakEven}</strong> de {salesExpensesProjection.totalHistoryDays} días
            </div>
          </div>
        </div>

        {/* Lienzo Ampliado Recharts: Ventas contra Gastos + Curvas de Proyección */}
        <div className="w-full h-96 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={salesExpensesProjection.combinedData}
              margin={{ top: 15, right: 20, bottom: 10, left: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#525252', fontSize: 11, fontWeight: 700 }}
                tickLine={false}
                axisLine={{ stroke: '#D4D4D4' }}
              />
              <YAxis
                tick={{ fill: '#525252', fontSize: 11, fontWeight: 600 }}
                tickFormatter={(val) => `$${val}`}
                tickLine={false}
                axisLine={false}
              />
              {salesExpensesProjection.dailyBreakEven > 0 && (
                <ReferenceLine
                  y={salesExpensesProjection.dailyBreakEven}
                  stroke="#F59E0B"
                  strokeDasharray="6 4"
                  label={{
                    value: `Equilibrio: $${salesExpensesProjection.dailyBreakEven}/día`,
                    position: 'insideTopLeft',
                    fill: '#B45309',
                    fontSize: 10,
                    fontWeight: 800
                  }}
                />
              )}
              <Tooltip
                formatter={(value: any, name: string) => [
                  `$${Number(value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                  name
                ]}
                labelFormatter={(label: any, payload: any) => {
                  const item = payload?.[0]?.payload;
                  return item ? item.fechaCompleta : label;
                }}
                contentStyle={{
                  backgroundColor: '#0F172A',
                  color: '#F8FAFC',
                  borderRadius: '14px',
                  border: '1px solid #334155',
                  fontSize: '12px',
                  fontWeight: 700,
                  boxShadow: '0 12px 24px -4px rgba(0, 0, 0, 0.35)'
                }}
              />
              <Legend
                verticalAlign="top"
                wrapperStyle={{ paddingBottom: '14px', fontSize: '12px', fontWeight: 700 }}
              />

              {/* Barras Reales: Ventas vs Gastos */}
              <Bar
                dataKey="ventasReales"
                name="Ventas Reales ($)"
                fill="#10B981"
                radius={[6, 6, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="gastosReales"
                name="Gastos Reales ($)"
                fill="#EF4444"
                radius={[6, 6, 0, 0]}
                maxBarSize={28}
              />

              {/* Línea de Ganancia Neta Real */}
              <Line
                type="monotone"
                dataKey="gananciaReal"
                name="Utilidad Neta Real ($)"
                stroke="#4F46E5"
                strokeWidth={3}
                dot={{ r: 3.5, fill: '#4F46E5', stroke: '#fff', strokeWidth: 1.5 }}
                connectNulls={false}
              />

              {/* Líneas Punteadas de Proyección (Forecast) */}
              <Line
                type="monotone"
                dataKey="ventasProyectadas"
                name="Proyección Ventas ($)"
                stroke="#059669"
                strokeWidth={3}
                strokeDasharray="6 4"
                dot={{ r: 4, fill: '#ECFDF5', stroke: '#059669', strokeWidth: 2 }}
                activeDot={{ r: 6 }}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="gastosProyectados"
                name="Proyección Gastos ($)"
                stroke="#DC2626"
                strokeWidth={2.5}
                strokeDasharray="5 4"
                dot={{ r: 3.5, fill: '#FEF2F2', stroke: '#DC2626', strokeWidth: 2 }}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="gananciaProyectada"
                name="Proyección Utilidad ($)"
                stroke="#6366F1"
                strokeWidth={2.5}
                strokeDasharray="4 4"
                dot={{ r: 3.5, fill: '#EEF2FF', stroke: '#6366F1', strokeWidth: 2 }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. PANELES SECUNDARIOS Y LATERALES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* PANEL 1: Ventas por Canal */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h4 className="font-extrabold text-neutral-900 text-sm uppercase tracking-wider flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" />
                <span>Ventas por Canal</span>
              </h4>
              <span className="text-[11px] font-bold text-neutral-500">
                Local vs Delivery
              </span>
            </div>

            <div className="mt-4 space-y-3.5">
              {summaryData?.ventasPorCanal.map((item, idx) => (
                <div key={`${item.canal}-${idx}`} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-neutral-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.nombre}
                    </span>
                    <span className="text-neutral-900">
                      ${item.monto.toFixed(2)} <span className="text-neutral-400 font-normal">({item.porcentaje}%)</span>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-300"
                      style={{ 
                        width: `${Math.min(100, Math.max(item.monto > 0 ? 3 : 0, item.porcentaje))}%`,
                        backgroundColor: item.color
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-neutral-100 text-[11px] text-neutral-500 flex justify-between font-semibold">
            <span>Total Facturado en Canales:</span>
            <span className="font-black text-neutral-900 font-mono">
              ${summaryData?.ventasTotales.actual.toFixed(2) || '0.00'}
            </span>
          </div>
        </div>

        {/* PANEL 2: Gastos por Tipo */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h4 className="font-extrabold text-neutral-900 text-sm uppercase tracking-wider flex items-center gap-2">
                <Receipt className="w-4 h-4 text-rose-600" />
                <span>Gastos por Tipo</span>
              </h4>
              <span className="text-[11px] font-bold text-neutral-500">
                Estructura de Costes
              </span>
            </div>

            <div className="mt-4 space-y-3.5">
              {summaryData?.gastosPorTipo.map((item, idx) => (
                <div key={`${item.tipo}-${idx}`} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-neutral-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.nombre}
                    </span>
                    <span className="text-neutral-900">
                      ${item.monto.toFixed(2)} <span className="text-neutral-400 font-normal">({item.porcentaje}%)</span>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-300"
                      style={{ 
                        width: `${Math.min(100, Math.max(item.monto > 0 ? 3 : 0, item.porcentaje))}%`,
                        backgroundColor: item.color
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-neutral-100 text-[11px] text-neutral-500 flex justify-between font-semibold">
            <span>Total Gastos Operativos:</span>
            <span className="font-black text-rose-600 font-mono">
              ${summaryData?.gastosOperativos.actual.toFixed(2) || '0.00'}
            </span>
          </div>
        </div>

        {/* PANEL 3: Top Platos Más Vendidos */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h4 className="font-extrabold text-neutral-900 text-sm uppercase tracking-wider flex items-center gap-2">
                <Utensils className="w-4 h-4 text-amber-600" />
                <span>Ventas de Platos</span>
              </h4>
              <span className="text-[11px] font-bold text-neutral-500">
                {summaryData?.topPlatos && summaryData.topPlatos.length > 0 
                  ? `${summaryData.topPlatos.reduce((acc, p) => acc + p.cantidad, 0)} u. vendidas`
                  : 'Por Unidades'}
              </span>
            </div>

            <div className="mt-4 divide-y divide-neutral-100">
              {summaryData?.topPlatos && summaryData.topPlatos.length > 0 ? (
                summaryData.topPlatos.slice(0, 5).map((dish, idx) => (
                  <div key={`${dish.nombre}-${idx}`} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                        idx === 0 ? 'bg-amber-400 text-amber-950 shadow-xs' :
                        idx === 1 ? 'bg-neutral-300 text-neutral-800' :
                        idx === 2 ? 'bg-amber-700 text-amber-100' :
                        'bg-neutral-100 text-neutral-600'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="font-bold text-xs text-neutral-800 line-clamp-1">
                        {dish.nombre}
                      </span>
                    </div>
                    <div className="text-right pl-2">
                      <div className="text-xs font-black text-neutral-900">
                        {dish.cantidad} <span className="text-[10px] font-semibold text-neutral-500">u.</span>
                      </div>
                      <div className="text-[10px] font-mono text-neutral-400">
                        ${dish.total.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-neutral-400">
                  No hay ventas de platos registradas en este periodo
                </div>
              )}
            </div>

            {summaryData?.topPlatos && summaryData.topPlatos.length > 5 && (
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => setShowAllDishesModal(true)}
                  className="text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline"
                >
                  Ver todos los {summaryData.topPlatos.length} platos vendidos →
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-100 text-[11px] text-neutral-500 flex justify-between font-semibold">
            <span>Total ventas de platos:</span>
            <span className="text-amber-700 font-bold font-mono">
              ${summaryData?.topPlatos ? summaryData.topPlatos.reduce((acc, p) => acc + p.total, 0).toFixed(2) : '0.00'}
            </span>
          </div>
        </div>

      </div>

      {/* SECCIÓN: COMPRAS DE INSUMOS POR VARIEDAD, CANTIDADES Y COSTOS */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center font-bold">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-neutral-900 text-sm uppercase tracking-wider">
                  Compras de Insumos por Variedad, Cantidades y Costos
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {summaryData?.comprasInsumosDetalle?.length || 0} Variedades
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Desglose consolidado de materia prima e insumos adquiridos en el periodo ({periodLabels.current})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowNewPurchaseModal(true)}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Registrar Compra</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubView('historial_insumos')}
              className="px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold transition cursor-pointer"
            >
              Ver Historial Completo →
            </button>
          </div>
        </div>

        {summaryData?.comprasInsumosDetalle && summaryData.comprasInsumosDetalle.length > 0 ? (
          <div className="mt-4 space-y-4">
            {/* Summary Badge */}
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold">Inversión Total en Insumos:</span>
                  <span className="font-black text-sm text-emerald-900 font-mono">
                    ${summaryData.montoTotalComprasInsumos?.toFixed(2) || '0.00'}
                  </span>
                </div>
                <div className="h-6 w-px bg-emerald-200 hidden sm:block" />
                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold">Insumo / Variedad Principal:</span>
                  <span className="font-bold text-neutral-800">
                    {summaryData.comprasInsumosDetalle[0]?.insumo} ({summaryData.comprasInsumosDetalle[0]?.porcentajeDelTotalInsumos}% de la inversión)
                  </span>
                </div>
              </div>
              <div className="text-neutral-500 text-[11px]">
                Mostrando {summaryData.comprasInsumosDetalle.length} variedades ordenadas por mayor costo
              </div>
            </div>

            {/* Detailed Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-neutral-500 font-bold border-b border-neutral-200 uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Insumo / Variedad</th>
                    <th className="py-2.5 px-3 text-center">Cant. Comprada</th>
                    <th className="py-2.5 px-3 text-right">Costo Unit. Prom.</th>
                    <th className="py-2.5 px-3 text-right">Costo Total ($)</th>
                    <th className="py-2.5 px-3 text-center">% de Inversión</th>
                    <th className="py-2.5 px-3 text-left">Proveedor(es)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-medium">
                  {summaryData.comprasInsumosDetalle.map((item, idx) => (
                    <tr key={`${item.insumo}-${idx}`} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-neutral-400">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-bold text-neutral-900">
                        {item.insumo}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-neutral-800 font-mono">
                        {item.cantidadTotal} <span className="text-[10px] text-neutral-500 font-normal">{item.variedadOUnidad}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-neutral-700">
                        ${item.costoPromedioUnitario.toFixed(2)} / {item.variedadOUnidad}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700">
                        ${item.costoTotal.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-16 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(5, item.porcentajeDelTotalInsumos))}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-neutral-600 font-mono">
                            {item.porcentajeDelTotalInsumos}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-neutral-500 max-w-[150px] truncate">
                        {item.proveedores && item.proveedores.length > 0 
                          ? item.proveedores.join(', ')
                          : 'General'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="mt-4 p-8 bg-neutral-50 rounded-xl border border-dashed border-neutral-200 text-center text-xs">
            <Package className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
            <p className="font-bold text-neutral-700">No hay registro de compras de insumos para este periodo ({periodLabels.current})</p>
            <p className="text-neutral-500 mt-1 max-w-md mx-auto">
              Registra las compras detalladas de materias primas o víveres con sus unidades, cantidades y precios para visualizar este reporte consolidado.
            </p>
            <button
              type="button"
              onClick={() => setShowNewPurchaseModal(true)}
              className="mt-3 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Registrar Primera Compra</span>
            </button>
          </div>
        )}
      </div>

      {/* 5. SECCIÓN INFERIOR: ALERTAS INTELIGENTES & COSTO LABORAL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* PANEL 4: Alertas Inteligentes para el Administrador */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <h4 className="font-extrabold text-neutral-900 text-sm uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span>Alertas Inteligentes del Negocio</span>
            </h4>
            <span className="text-[11px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
              Diagnóstico Automático
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {summaryData?.alertas && summaryData.alertas.length > 0 ? (
              summaryData.alertas.map((alerta, idx) => (
                <div 
                  key={`${alerta.id}-${idx}`}
                  className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                    alerta.tipo === 'danger' ? 'bg-rose-50 border-rose-200 text-rose-900' :
                    alerta.tipo === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-900' :
                    alerta.tipo === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
                    'bg-blue-50 border-blue-200 text-blue-900'
                  }`}
                >
                  <div className="mt-0.5">
                    {alerta.tipo === 'danger' && <Flame className="w-4 h-4 text-rose-600" />}
                    {alerta.tipo === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                    {alerta.tipo === 'success' && <ShieldCheck className="w-4 h-4 text-emerald-600" />}
                    {alerta.tipo === 'info' && <Sparkles className="w-4 h-4 text-blue-600" />}
                  </div>
                  <div className="flex-1 text-xs">
                    <h5 className="font-extrabold">{alerta.titulo}</h5>
                    <p className="mt-0.5 opacity-90 leading-relaxed">{alerta.mensaje}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-neutral-400 text-xs">
                No hay alertas operativas detectadas para este periodo.
              </div>
            )}
          </div>
        </div>

        {/* PANEL 5: Costo Laboral & Días Trabajados (Sin valores por hora) */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h4 className="font-extrabold text-neutral-900 text-sm uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>Costo Laboral (Jornadas)</span>
              </h4>
              <span className="text-[11px] font-bold text-neutral-500">
                Días & Sueldos
              </span>
            </div>

            <div className="mt-4 space-y-4">
              <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/60">
                <div className="flex items-center justify-between text-xs text-neutral-600">
                  <span>Días / Jornadas trabajadas en el periodo:</span>
                  <span className="font-black text-neutral-900">{Math.round(summaryData?.horasTrabajadas || 0)} días</span>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-600 mt-2">
                  <span>Costo de nómina / sueldos:</span>
                  <span className="font-black text-rose-600">${summaryData?.costoLaboral.toFixed(2) || '0.00'}</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                  <span className="text-neutral-700">Ratio Laboral (% sobre ventas):</span>
                  <span className={`font-black ${
                    (summaryData?.ratioCostoLaboral || 0) <= 30 ? 'text-emerald-600' :
                    (summaryData?.ratioCostoLaboral || 0) <= 38 ? 'text-amber-600' :
                    'text-rose-600'
                  }`}>
                    {summaryData?.ratioCostoLaboral || 0}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${
                      (summaryData?.ratioCostoLaboral || 0) <= 30 ? 'bg-emerald-500' :
                      (summaryData?.ratioCostoLaboral || 0) <= 38 ? 'bg-amber-500' :
                      'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(3, summaryData?.ratioCostoLaboral || 0))}%` }}
                  />
                </div>
                <p className="text-[10px] text-neutral-400 mt-1.5 leading-tight">
                  Recomendación gastronómica: mantener el costo de sueldos entre 25% y 32% de las ventas.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-100 text-[11px] text-neutral-500 flex justify-between">
            <span>Turnos computados:</span>
            <span className="font-bold text-neutral-800">{shifts.length} registros</span>
          </div>
        </div>

      </div>

      {/* 6. CENTRO DE REPORTES CONSOLIDADOS MULTI-SUCURSAL (Toda la Empresa) */}
      {selectedBranchId === 'all' && accessibleRestaurants.length > 1 && (
        <div className="bg-white rounded-3xl border-2 border-indigo-100 p-6 shadow-sm space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-md shadow-indigo-600/20 shrink-0 mt-0.5">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-black text-neutral-900 text-base sm:text-lg">
                    Reporte Consolidado de la Empresa ({accessibleRestaurants.length} Sucursales)
                  </h4>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase tracking-wider">
                    Vista Global
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Análisis comparativo de rendimiento comercial, desglose de costos operativos y margen por sede.
                </p>
              </div>
            </div>

            {/* Quick action buttons for consolidated reports */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPdfReport(true)}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition flex items-center gap-1.5 shadow-sm shadow-indigo-600/20 cursor-pointer"
                title="Generar e imprimir Reporte Ejecutivo Consolidado en PDF"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>PDF Consolidado</span>
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 cursor-pointer"
                title="Exportar balance consolidado de todas las sucursales a Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel Consolidado</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sounds.playKeypadClick();
                  setShowBranchTextTable(prev => !prev);
                }}
                className="px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-neutral-200"
              >
                <BarChart3 className="w-3.5 h-3.5 text-neutral-600" />
                <span>{showBranchTextTable ? 'Ver Gráfico Dinámico' : 'Ver Tabla Detallada'}</span>
              </button>
            </div>
          </div>

          {/* Cards de Métricas Consolidadas Rápidas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-2xl bg-neutral-50 border border-neutral-200">
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Total Facturado Empresa</span>
              <span className="text-base sm:text-lg font-black font-mono text-emerald-700">
                ${summaryData?.ventasTotales.actual.toFixed(2) || '0.00'}
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-neutral-50 border border-neutral-200">
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Gastos Globales</span>
              <span className="text-base sm:text-lg font-black font-mono text-rose-600">
                ${summaryData?.gastosOperativos.actual.toFixed(2) || '0.00'}
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-neutral-50 border border-neutral-200">
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Utilidad Neta Global</span>
              <span className="text-base sm:text-lg font-black font-mono text-indigo-700">
                ${summaryData?.gananciaNeta.actual.toFixed(2) || '0.00'}
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-neutral-50 border border-neutral-200">
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Margen Operativo Promedio</span>
              <span className="text-base sm:text-lg font-black font-mono text-neutral-900">
                {summaryData?.margenPorcentaje.actual || 0}%
              </span>
            </div>
          </div>

          {!showBranchTextTable ? (
            <div className="w-full h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={sortedBranches}
                  margin={{ top: 15, right: 25, bottom: 15, left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis
                    dataKey="nombre"
                    tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 600 }}
                    tickLine={false}
                    axisLine={{ stroke: '#E5E7EB' }}
                  />
                  <YAxis
                    tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 600 }}
                    tickFormatter={(val) => `$${val}`}
                    tickLine={false}
                    axisLine={{ stroke: '#E5E7EB' }}
                  />
                  <Tooltip
                    formatter={(value: any, name: any) => [`$${Number(value).toFixed(2)}`, name]}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      color: '#F9FAFB',
                      borderRadius: '14px',
                      border: '1px solid #334155',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}
                  />
                  <Legend wrapperStyle={{ paddingBottom: '8px', fontSize: '12px', fontWeight: 'bold' }} />
                  <Line
                    type="monotone"
                    dataKey="ventas"
                    name="Ventas ($)"
                    stroke="#2563EB"
                    strokeWidth={3}
                    dot={{ r: 4.5, fill: '#FFFFFF', stroke: '#2563EB', strokeWidth: 2 }}
                    activeDot={{ r: 6.5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="gastos"
                    name="Gastos ($)"
                    stroke="#EF4444"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#FFFFFF', stroke: '#EF4444', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ganancia"
                    name="Ganancia Neta ($)"
                    stroke="#10B981"
                    strokeWidth={2.5}
                    strokeDasharray="5 4"
                    dot={{ r: 4, fill: '#10B981', stroke: '#FFFFFF', strokeWidth: 1.5 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-100 text-neutral-600 font-bold uppercase text-[10px] border-b border-neutral-200">
                  <tr>
                    <th 
                      onClick={() => handleToggleSort('nombre')}
                      className="p-3 cursor-pointer hover:text-neutral-900 transition"
                    >
                      <div className="flex items-center gap-1">
                        <span>Sucursal</span>
                        {sortField === 'nombre' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleToggleSort('ventas')}
                      className="p-3 text-right cursor-pointer hover:text-neutral-900 transition"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Ventas</span>
                        {sortField === 'ventas' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleToggleSort('gastos')}
                      className="p-3 text-right cursor-pointer hover:text-neutral-900 transition"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Gastos</span>
                        {sortField === 'gastos' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleToggleSort('ganancia')}
                      className="p-3 text-right cursor-pointer hover:text-neutral-900 transition"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Ganancia Neta</span>
                        {sortField === 'ganancia' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleToggleSort('pedidos')}
                      className="p-3 text-right cursor-pointer hover:text-neutral-900 transition"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Pedidos</span>
                        {sortField === 'pedidos' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleToggleSort('ticketPromedio')}
                      className="p-3 text-right cursor-pointer hover:text-neutral-900 transition"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Ticket Prom.</span>
                        {sortField === 'ticketPromedio' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleToggleSort('margen')}
                      className="p-3 text-right cursor-pointer hover:text-neutral-900 transition"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Margen %</span>
                        {sortField === 'margen' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th className="p-3 text-right">
                      <span>Part. %</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {sortedBranches.map((branch, idx) => {
                    const totalCompanySales = summaryData?.ventasTotales.actual || 0;
                    const sharePct = totalCompanySales > 0 
                      ? Math.round((branch.ventas / totalCompanySales) * 1000) / 10
                      : 0;

                    return (
                      <tr key={`${branch.restaurantId}-${idx}`} className="hover:bg-neutral-50/70 transition">
                        <td className="p-3 font-bold text-neutral-900 flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-neutral-400" />
                          <span>{branch.nombre}</span>
                        </td>
                        <td className="p-3 text-right font-black font-mono text-neutral-900">
                          ${branch.ventas.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-black font-mono text-rose-600">
                          ${branch.gastos.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-black font-mono text-emerald-700">
                          ${branch.ganancia.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-bold text-neutral-700">
                          {branch.pedidos}
                        </td>
                        <td className="p-3 text-right font-mono text-neutral-700">
                          ${branch.ticketPromedio.toFixed(2)}
                        </td>
                        <td className="p-3 text-right">
                          <span className={`px-2 py-0.5 rounded-full font-extrabold text-[11px] ${
                            branch.margen >= 20 ? 'bg-emerald-100 text-emerald-800' :
                            branch.margen >= 10 ? 'bg-amber-100 text-amber-800' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {branch.margen.toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold font-mono text-neutral-800">
                          {sharePct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      </>
      )}

      {/* 9. MODAL DE DIAGNÓSTICO Y RECONCILIACIÓN DE INTEGRIDAD DE DATOS */}
      {showDiagnosticModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-neutral-200 max-w-xl w-full p-6 shadow-2xl space-y-5">
            
            {/* Header del Modal */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-neutral-900 text-white flex items-center justify-center shadow-xs">
                  <ShieldCheck className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-black text-neutral-900 text-base sm:text-lg">
                    Diagnóstico de Integridad de Datos
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Compara pedidos con estado "cobrado" vs documentos en "dailyStats"
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDiagnosticModal(false)}
                className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scope info */}
            <div className="flex items-center justify-between text-xs bg-neutral-50 p-3 rounded-2xl border border-neutral-200 text-neutral-600 font-bold">
              <span>Periodo: <strong className="text-neutral-900">{periodLabels.current}</strong></span>
              <span>Sede: <strong className="text-neutral-900">{selectedBranchId === 'all' ? 'Todas' : (accessibleRestaurants.find(r => r.id === selectedBranchId)?.nombre || 'Sede')}</strong></span>
            </div>

            {/* Loading state */}
            {isDiagnosing && (
              <div className="py-8 flex flex-col items-center justify-center gap-3 text-neutral-500">
                <RefreshCw className="w-7 h-7 text-blue-600 animate-spin" />
                <span className="text-xs font-bold">Auditoría en curso: verificando comandas y agregaciones...</span>
              </div>
            )}

            {/* Diagnostic Results */}
            {!isDiagnosing && diagnosticResult && (
              <div className="space-y-4">
                
                {/* 2 Comparatives Cards */}
                <div className="grid grid-cols-2 gap-3">
                  
                  {/* Card Comandas */}
                  <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-blue-600" />
                      <span>Comandas Cobradas</span>
                    </div>
                    <div className="text-2xl font-black text-neutral-900 mt-2">
                      {diagnosticResult.cobradoOrdersCount} <span className="text-xs font-semibold text-neutral-500">pedidos</span>
                    </div>
                    <div className="text-xs font-mono font-bold text-neutral-700 mt-0.5">
                      ${diagnosticResult.cobradoOrdersTotal.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-neutral-400 mt-1">
                      En colección de orders
                    </div>
                  </div>

                  {/* Card DailyStats */}
                  <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5 text-orange-600" />
                      <span>dailyStats</span>
                    </div>
                    <div className="text-2xl font-black text-neutral-900 mt-2">
                      {diagnosticResult.dailyStatsCount} <span className="text-xs font-semibold text-neutral-500">días</span>
                    </div>
                    <div className="text-xs font-mono font-bold text-neutral-700 mt-0.5">
                      ${diagnosticResult.dailyStatsTotalSales.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-neutral-400 mt-1">
                      Agregados consolidados
                    </div>
                  </div>

                </div>

                {/* State verdict banner */}
                {!diagnosticResult.mismatch ? (
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-extrabold block">¡Consistencia Verificada!</strong>
                      <span>Los contadores de comandas cobradas y las ventas registradas en dailyStats coinciden con exactitud para el periodo auditado.</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-extrabold block">Discrepancia de Estadísticas Detectada</strong>
                      <span>
                        Existen comandas cobradas que no están reflejadas en los documentos diarios de dailyStats (o faltan documentos para algunas fechas).
                      </span>
                    </div>
                  </div>
                )}

                {/* Recalculate Feedback */}
                {recalculateMessage && (
                  <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center gap-2">
                    <Check className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="font-bold">{recalculateMessage}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2.5">
                  <button
                    onClick={() => setShowDiagnosticModal(false)}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl text-neutral-600 hover:bg-neutral-100 text-xs font-bold transition cursor-pointer"
                  >
                    Cerrar
                  </button>

                  <button
                    onClick={handleRecalculate}
                    disabled={isRecalculating}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
                    <span>{isRecalculating ? 'Recalculando estadísticas...' : 'Recalcular estadísticas'}</span>
                  </button>
                </div>

              </div>
            )}

          </div>
        </div>
      )}

      {/* 10. REPORTE EJECUTIVO PDF */}
      {showPdfReport && summaryData && (
        <ExecutivePdfReport
          businessName={currentBusiness?.nombre || currentUserAccount?.businessId || 'GastroSmart'}
          selectedBranchName={selectedBranchId === 'all' ? 'Todas las sucursales' : (accessibleRestaurants.find(r => r.id === selectedBranchId)?.nombre || 'Sucursal')}
          periodLabel={periodLabels.current}
          generatedBy={currentUserAccount?.nombre || currentEmployee?.nombre || 'Administrador'}
          summary={summaryData}
          dailyStats={currentDailyStats}
          onClose={() => setShowPdfReport(false)}
        />
      )}

      {/* 11. MODAL NUEVA COMPRA DE INSUMOS / VÍVERES CON ESCANEO IA */}
      {showNewPurchaseModal && (
        <NewPurchaseModal
          restaurants={accessibleRestaurants}
          currentRestaurantId={selectedBranchId !== 'all' ? selectedBranchId : undefined}
          businessId={activeBizId}
          userDisplayName={currentUserAccount?.nombre || currentEmployee?.nombre || 'Administrador'}
          onClose={() => setShowNewPurchaseModal(false)}
          onSuccess={() => {
            loadFinancialData(true);
          }}
        />
      )}

      {/* 12. MODAL NUEVO GASTO GENERAL (Transporte, Alquiler, Servicios, etc.) */}
      {showNewExpenseModal && (
        <NewExpenseModal
          restaurants={accessibleRestaurants}
          currentRestaurantId={selectedBranchId !== 'all' ? selectedBranchId : undefined}
          businessId={activeBizId}
          userDisplayName={currentUserAccount?.nombre || currentEmployee?.nombre || 'Administrador'}
          employees={allEmployees}
          onClose={() => setShowNewExpenseModal(false)}
          onSuccess={() => {
            loadFinancialData(true);
          }}
        />
      )}

      {/* 13. MODAL DETALLE DE TODOS LOS PLATOS VENDIDOS */}
      {showAllDishesModal && summaryData?.topPlatos && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Utensils className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-neutral-900">Ventas Detalladas de Platos</h3>
                  <p className="text-xs text-neutral-500">{periodLabels.current} • {summaryData.topPlatos.length} platos vendidos</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAllDishesModal(false)}
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto divide-y divide-neutral-100 flex-1">
              {summaryData.topPlatos.map((dish, idx) => (
                <div key={`${dish.nombre}-${idx}`} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-neutral-100 text-neutral-700 font-bold text-xs flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-sm text-neutral-800">
                      {dish.nombre}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-neutral-900">
                      {dish.cantidad} <span className="text-xs font-normal text-neutral-500">unidades</span>
                    </div>
                    <div className="text-xs font-mono font-bold text-emerald-600">
                      ${dish.total.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-neutral-100 bg-neutral-50/70 rounded-b-2xl flex items-center justify-between">
              <div>
                <div className="text-xs text-neutral-500 font-medium">Total Unidades:</div>
                <div className="text-sm font-black text-neutral-900">
                  {summaryData.topPlatos.reduce((acc, p) => acc + p.cantidad, 0)} u.
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-neutral-500 font-medium">Recaudación Total:</div>
                <div className="text-sm font-mono font-black text-amber-700">
                  ${summaryData.topPlatos.reduce((acc, p) => acc + p.total, 0).toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
