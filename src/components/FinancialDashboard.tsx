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
  Plus
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Bar, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
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
  recalculateTodayDailyStats 
} from '../services/dataService';
import { exportFinancialReportToExcel } from '../services/excelService';
import { ExecutivePdfReport } from './ExecutivePdfReport';
import { NewPurchaseModal } from './NewPurchaseModal';
import { NewExpenseModal } from './NewExpenseModal';
import { IngredientPurchaseHistory } from './IngredientPurchaseHistory';
import { sounds } from '../utils/sound';

interface FinancialDashboardProps {
  restaurants: Restaurant[];
  orders: Order[];
  shifts: Shift[];
  menuItems: MenuItem[];
}

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({
  restaurants,
  orders,
  shifts,
  menuItems
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
  const [activeSubView, setActiveSubView] = useState<'kpis' | 'historial_insumos'>('kpis');
  const [isRecalculatingToday, setIsRecalculatingToday] = useState<boolean>(false);
  const [todayToastMessage, setTodayToastMessage] = useState<string | null>(null);

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
        ranges.currentDates
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

        {/* Selector de Sucursal */}
        <div className="flex flex-col gap-1.5 w-full md:w-auto">
          <label className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-orange-600" />
            <span>Sucursal / Sede</span>
          </label>
          
          {accessibleRestaurants.length > 1 ? (
            <div className="relative">
              <select
                value={selectedBranchId}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="h-10 pl-3.5 pr-8 rounded-xl bg-neutral-50 border border-neutral-300 font-bold text-xs text-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
              >
                {isOwner && <option value="all">🏢 Todas las sucursales ({accessibleRestaurants.length})</option>}
                {accessibleRestaurants.map(r => (
                  <option key={r.id} value={r.id}>
                    📍 {r.nombre}
                  </option>
                ))}
              </select>
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

          {/* Opción Historial de compras por insumo */}
          <button
            onClick={() => setActiveSubView(activeSubView === 'historial_insumos' ? 'kpis' : 'historial_insumos')}
            title="Analizar compras por insumo, evolución por semana/mes y comparativa de proveedores para negociar"
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer border ${
              activeSubView === 'historial_insumos'
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'bg-white hover:bg-neutral-100 text-neutral-800 border-neutral-200'
            }`}
          >
            <Package className="w-3.5 h-3.5 text-emerald-600" />
            <span>{activeSubView === 'historial_insumos' ? 'Ver KPIs y Gráficos' : 'Historial Insumos'}</span>
          </button>

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

      {/* RENDERIZADO CONDICIONAL: HISTORIAL POR INSUMO O DASHBOARD GENERAL */}
      {activeSubView === 'historial_insumos' ? (
        <IngredientPurchaseHistory
          expenses={expenses}
          restaurants={accessibleRestaurants}
          selectedBranchId={selectedBranchId}
          onClose={() => setActiveSubView('kpis')}
        />
      ) : (
        <>
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

      {/* 3. GRÁFICA PRINCIPAL: VENTAS VS GASTOS (Barras agrupadas azul/rojo + Línea Ganancia Neta) */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-neutral-100">
          <div>
            <h3 className="font-black text-neutral-900 text-base flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <span>Evolución Financiera: Ventas vs Gastos</span>
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {timeframe === 'dia' && 'Distribución horaria del día actual (ventas en azul, gastos en rojo y línea de ganancia neta en verde)'}
              {timeframe === 'semana' && 'Desglose diario por días de la semana con balance neto superpuesto'}
              {timeframe === 'mes' && 'Comportamiento financiero agrupado por semanas del mes en curso'}
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-bold">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-blue-600 inline-block" />
              <span className="text-neutral-700">Ventas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-rose-500 inline-block" />
              <span className="text-neutral-700">Gastos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-emerald-600 inline-block" />
              <span className="text-emerald-700">Ganancia Neta</span>
            </div>
          </div>
        </div>

        {/* Canvas de la Gráfica Recharts */}
        <div className="w-full h-80">
          {summaryData?.chartData && summaryData.chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={summaryData.chartData}
                margin={{ top: 15, right: 20, bottom: 20, left: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fill: '#6B7280', fontSize: 11, fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                />
                <YAxis 
                  tick={{ fill: '#6B7280', fontSize: 11 }}
                  tickFormatter={(val) => `$${val}`}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                />
                <Tooltip
                  formatter={(value: any, name: any) => {
                    const labelName = name === 'ventas' ? 'Ventas Totales' : name === 'gastos' ? 'Gastos Operativos' : 'Ganancia Neta';
                    return [`$${Number(value).toFixed(2)}`, labelName];
                  }}
                  contentStyle={{
                    backgroundColor: '#111827',
                    color: '#F9FAFB',
                    borderRadius: '12px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                  }}
                  itemStyle={{ color: '#F9FAFB' }}
                />
                <Legend 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: '10px', fontSize: '12px', fontWeight: 'bold' }}
                />
                
                {/* Barra 1: Ventas (Azul) */}
                <Bar 
                  dataKey="ventas" 
                  name="Ventas" 
                  fill="#2563EB" 
                  radius={[4, 4, 0, 0]} 
                  maxBarSize={40}
                />

                {/* Barra 2: Gastos (Rojo) */}
                <Bar 
                  dataKey="gastos" 
                  name="Gastos" 
                  fill="#EF4444" 
                  radius={[4, 4, 0, 0]} 
                  maxBarSize={40}
                />

                {/* Línea superpuesta: Ganancia Neta (Verde Esmeralda) */}
                <Line 
                  type="monotone" 
                  dataKey="ganancia" 
                  name="Ganancia Neta" 
                  stroke="#10B981" 
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#10B981', strokeWidth: 2, stroke: '#FFFFFF' }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-neutral-400 text-sm font-semibold">
              Cargando gráfica de ventas y gastos...
            </div>
          )}
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

        {/* PANEL 5: Costo Laboral & Turnos (Labor Cost Ratio) */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h4 className="font-extrabold text-neutral-900 text-sm uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>Costo Laboral (Turnos)</span>
              </h4>
              <span className="text-[11px] font-bold text-neutral-500">
                Personal
              </span>
            </div>

            <div className="mt-4 space-y-4">
              <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/60">
                <div className="flex items-center justify-between text-xs text-neutral-600">
                  <span>Horas trabajadas en el periodo:</span>
                  <span className="font-black text-neutral-900">{summaryData?.horasTrabajadas || 0} hrs</span>
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

      {/* 6. COMPARATIVO MULTI-SUCURSAL (Visible cuando se selecciona "Todas las sucursales") */}
      {selectedBranchId === 'all' && accessibleRestaurants.length > 1 && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-neutral-100">
            <div>
              <h4 className="font-black text-neutral-900 text-base flex items-center gap-2">
                <Building2 className="w-5 h-5 text-orange-600" />
                <span>Comparativa de Rendimiento entre Sucursales</span>
              </h4>
              <p className="text-xs text-neutral-500 mt-0.5">
                Tabla comparativa ordenable de todas las sucursales del negocio en el periodo seleccionado.
              </p>
            </div>
            <div className="text-xs text-neutral-500 font-semibold">
              Haga clic en los encabezados para ordenar ↕
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase text-[10px] border-b border-neutral-200">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {sortedBranches.map((branch, idx) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
