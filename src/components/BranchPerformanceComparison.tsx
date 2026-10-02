import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  ReferenceLine
} from 'recharts';
import {
  Store,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Award,
  Crown,
  Calendar,
  Layers,
  ShoppingBag,
  Receipt,
  Percent,
  Sparkles,
  Filter,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Download,
  Building2,
  PieChart as PieIcon,
  BarChart3,
  Wallet
} from 'lucide-react';
import { Order, Restaurant, Expense, DailyStat } from '../types';
import { getOperationalDateString } from '../services/dataService';
import { sounds } from '../utils/sound';

export interface BranchPerformanceComparisonProps {
  restaurants: Restaurant[];
  orders: Order[];
  expenses: Expense[];
  dailyStats?: DailyStat[];
}

type DateRangePreset = 'hoy' | 'ayer' | 'esta_semana' | 'semana_anterior' | 'este_mes' | 'mes_anterior' | 'ultimos_30' | 'personalizado';
type ChartViewMode = 'flujo_paralelo' | 'margen_porcentaje' | 'pedidos_volumen';

export const BranchPerformanceComparison: React.FC<BranchPerformanceComparisonProps> = ({
  restaurants,
  orders,
  expenses,
  dailyStats = []
}) => {
  // Estados de Filtro de Fecha
  const [datePreset, setDatePreset] = useState<DateRangePreset>('este_mes');
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>('flujo_paralelo');

  // Series visibles en la gráfica de barras
  const [showSalesBar, setShowSalesBar] = useState(true);
  const [showExpensesBar, setShowExpensesBar] = useState(true);
  const [showProfitBar, setShowProfitBar] = useState(true);

  // Fechas operativas calculadas
  const todayOpStr = useMemo(() => getOperationalDateString(new Date()), []);

  const defaultCustomDates = useMemo(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start: getOperationalDateString(firstDay),
      end: todayOpStr
    };
  }, [todayOpStr]);

  const [customStartDate, setCustomStartDate] = useState<string>(defaultCustomDates.start);
  const [customEndDate, setCustomEndDate] = useState<string>(defaultCustomDates.end);

  // Calcular rango de fechas efectivo según preset
  const effectiveDateRange = useMemo(() => {
    const now = new Date();

    if (datePreset === 'hoy') {
      return { start: todayOpStr, end: todayOpStr, label: 'Hoy (Día Operativo)' };
    }

    if (datePreset === 'ayer') {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const yStr = getOperationalDateString(yesterday);
      return { start: yStr, end: yStr, label: 'Ayer' };
    }

    if (datePreset === 'esta_semana') {
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const mon = new Date(now);
      mon.setDate(now.getDate() + diff);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return {
        start: getOperationalDateString(mon),
        end: getOperationalDateString(sun),
        label: 'Esta Semana (Lun - Dom)'
      };
    }

    if (datePreset === 'semana_anterior') {
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const mon = new Date(now);
      mon.setDate(now.getDate() + diff - 7);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return {
        start: getOperationalDateString(mon),
        end: getOperationalDateString(sun),
        label: 'Semana Anterior'
      };
    }

    if (datePreset === 'este_mes') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        start: getOperationalDateString(firstDay),
        end: getOperationalDateString(lastDay),
        label: 'Este Mes'
      };
    }

    if (datePreset === 'mes_anterior') {
      const firstDayPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        start: getOperationalDateString(firstDayPrev),
        end: getOperationalDateString(lastDayPrev),
        label: 'Mes Anterior'
      };
    }

    if (datePreset === 'ultimos_30') {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 29);
      return {
        start: getOperationalDateString(thirtyDaysAgo),
        end: todayOpStr,
        label: 'Últimos 30 Días'
      };
    }

    // Personalizado
    return {
      start: customStartDate || defaultCustomDates.start,
      end: customEndDate || defaultCustomDates.end,
      label: `Rango: ${customStartDate} al ${customEndDate}`
    };
  }, [datePreset, customStartDate, customEndDate, todayOpStr, defaultCustomDates]);

  // Filtrar órdenes cobradas en el rango de fechas
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const isPaid = o.estado === 'cobrado' || o.estadoPago === 'cobrado';
      if (!isPaid) return false;
      const refDate = o.pagadoEn || o.creadoEn;
      if (!refDate) return false;
      const opDate = getOperationalDateString(new Date(refDate));
      return opDate >= effectiveDateRange.start && opDate <= effectiveDateRange.end;
    });
  }, [orders, effectiveDateRange]);

  // Filtrar gastos en el rango de fechas
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (!e.fecha) return false;
      const opDate = getOperationalDateString(new Date(e.fecha));
      return opDate >= effectiveDateRange.start && opDate <= effectiveDateRange.end;
    });
  }, [expenses, effectiveDateRange]);

  // Filtrar estadísticas diarias en el rango
  const filteredDailyStats = useMemo(() => {
    return dailyStats.filter(s => {
      if (!s.fecha) return false;
      return s.fecha >= effectiveDateRange.start && s.fecha <= effectiveDateRange.end;
    });
  }, [dailyStats, effectiveDateRange]);

  // Cálculo consolidado y métricas individuales por sucursal
  const branchMetrics = useMemo(() => {
    // Si no hay restaurantes registrados, devolver vacío
    if (!restaurants || restaurants.length === 0) return [];

    return restaurants.map((branch, index) => {
      // 1. Ventas y pedidos de esta sucursal
      const branchOrders = filteredOrders.filter(o => o.restaurantId === branch.id);
      const liveSales = branchOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const liveOrdersCount = branchOrders.length;

      // Estadísticas diarias sincronizadas como verificación
      const branchStats = filteredDailyStats.filter(s => s.restaurantId === branch.id);
      const statSales = branchStats.reduce((sum, s) => sum + (Number(s.ventasTotales) || 0), 0);
      const statOrdersCount = branchStats.reduce((sum, s) => sum + (Number(s.pedidosCobrados) || 0), 0);

      const totalVentas = Math.max(liveSales, statSales);
      const totalPedidos = Math.max(liveOrdersCount, statOrdersCount);

      // 2. Gastos y costos de esta sucursal
      const branchExpenses = filteredExpenses.filter(e => e.restaurantId === branch.id);
      const totalGastos = branchExpenses.reduce((sum, e) => sum + (Number(e.monto) || 0), 0);

      // 3. Flujo de caja neto (Ganancia neta)
      const flujoCajaNeto = totalVentas - totalGastos;

      // 4. Margen de utilidad neto (%)
      const margenUtilidad = totalVentas > 0 ? (flujoCajaNeto / totalVentas) * 100 : 0;

      // 5. Ticket promedio
      const ticketPromedio = totalPedidos > 0 ? totalVentas / totalPedidos : 0;

      // 6. Desglose de gastos por categoría
      const gastosInsumos = branchExpenses.filter(e => e.tipo === 'compra_inventario' || e.tipo === 'insumo').reduce((s, e) => s + (Number(e.monto) || 0), 0);
      const gastosSueldos = branchExpenses.filter(e => e.tipo === 'sueldo_empleado' || e.tipo === 'personal').reduce((s, e) => s + (Number(e.monto) || 0), 0);
      const gastosServicios = branchExpenses.filter(e => e.tipo === 'servicio_basico' || e.tipo === 'alquiler').reduce((s, e) => s + (Number(e.monto) || 0), 0);
      const gastosOtros = totalGastos - (gastosInsumos + gastosSueldos + gastosServicios);

      return {
        id: branch.id,
        nombre: branch.nombre || `Sucursal ${index + 1}`,
        direccion: branch.direccion || '',
        color: branch.color || '#f97316',
        ventas: Math.round(totalVentas * 100) / 100,
        gastos: Math.round(totalGastos * 100) / 100,
        flujoCajaNeto: Math.round(flujoCajaNeto * 100) / 100,
        margenUtilidad: Math.round(margenUtilidad * 10) / 10,
        pedidos: totalPedidos,
        ticketPromedio: Math.round(ticketPromedio * 100) / 100,
        gastosInsumos: Math.round(gastosInsumos * 100) / 100,
        gastosSueldos: Math.round(gastosSueldos * 100) / 100,
        gastosServicios: Math.round(gastosServicios * 100) / 100,
        gastosOtros: Math.round(gastosOtros * 100) / 100,
        participacionVentas: 0 // Se calcula abajo con el total
      };
    });
  }, [restaurants, filteredOrders, filteredExpenses, filteredDailyStats]);

  // Totales Consolidados Globales (Todas las Sedes Combinadas)
  const consolidatedTotals = useMemo(() => {
    const totalVentas = branchMetrics.reduce((acc, b) => acc + b.ventas, 0);
    const totalGastos = branchMetrics.reduce((acc, b) => acc + b.gastos, 0);
    const totalFlujoCaja = totalVentas - totalGastos;
    const totalPedidos = branchMetrics.reduce((acc, b) => acc + b.pedidos, 0);
    const margenConsolidado = totalVentas > 0 ? (totalFlujoCaja / totalVentas) * 100 : 0;
    const ticketConsolidado = totalPedidos > 0 ? totalVentas / totalPedidos : 0;

    // Calcular % de participación en ventas de cada sucursal
    branchMetrics.forEach(b => {
      b.participacionVentas = totalVentas > 0 ? Math.round((b.ventas / totalVentas) * 1000) / 10 : 0;
    });

    // Ranking de Desempeño: Ordenar sucursales de mayor a menor flujo neto y ventas
    const rankedBranches = [...branchMetrics].sort((a, b) => {
      if (b.flujoCajaNeto !== a.flujoCajaNeto) return b.flujoCajaNeto - a.flujoCajaNeto;
      return b.ventas - a.ventas;
    });

    const topBranch = rankedBranches[0] || null;
    const mostSalesBranch = [...branchMetrics].sort((a, b) => b.ventas - a.ventas)[0] || null;
    const highestMarginBranch = [...branchMetrics].filter(b => b.ventas > 0).sort((a, b) => b.margenUtilidad - a.margenUtilidad)[0] || null;

    return {
      totalVentas: Math.round(totalVentas * 100) / 100,
      totalGastos: Math.round(totalGastos * 100) / 100,
      totalFlujoCaja: Math.round(totalFlujoCaja * 100) / 100,
      totalPedidos,
      margenConsolidado: Math.round(margenConsolidado * 10) / 10,
      ticketConsolidado: Math.round(ticketConsolidado * 100) / 100,
      rankedBranches,
      topBranch,
      mostSalesBranch,
      highestMarginBranch
    };
  }, [branchMetrics]);

  // Datos formateados para la gráfica de barras de Recharts
  const chartData = useMemo(() => {
    return branchMetrics.map(b => ({
      name: b.nombre,
      id: b.id,
      ventas: b.ventas,
      gastos: b.gastos,
      flujoCajaNeto: b.flujoCajaNeto,
      margenUtilidad: b.margenUtilidad,
      pedidos: b.pedidos,
      ticketPromedio: b.ticketPromedio,
      participacionVentas: b.participacionVentas
    }));
  }, [branchMetrics]);

  // Función para exportar a CSV/Excel consolidado
  const handleExportCSV = () => {
    sounds.playClick();
    const headers = ['Sucursal', 'Ventas Totales ($)', 'Gastos Totales ($)', 'Flujo Neto ($)', 'Margen (%)', 'Pedidos', 'Ticket Promedio ($)', '% Participacion'];
    const rows = branchMetrics.map(b => [
      `"${b.nombre}"`,
      b.ventas.toFixed(2),
      b.gastos.toFixed(2),
      b.flujoCajaNeto.toFixed(2),
      `${b.margenUtilidad}%`,
      b.pedidos,
      b.ticketPromedio.toFixed(2),
      `${b.participacionVentas}%`
    ]);

    // Fila totalizadora
    rows.push([
      '"TOTAL CONSOLIDADO"',
      consolidatedTotals.totalVentas.toFixed(2),
      consolidatedTotals.totalGastos.toFixed(2),
      consolidatedTotals.totalFlujoCaja.toFixed(2),
      `${consolidatedTotals.margenConsolidado}%`,
      consolidatedTotals.totalPedidos,
      consolidatedTotals.ticketConsolidado.toFixed(2),
      '100%'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `reporte_consolidado_sucursales_${effectiveDateRange.start}_${effectiveDateRange.end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* 1. Header con Selector de Rango de Fechas y Presets Rápidos */}
      <div className="bg-white rounded-3xl border border-neutral-200/90 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 flex items-center justify-center shadow-2xs">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-black text-neutral-900 tracking-tight">
                    Comparativa de Rendimiento & Consolidado Multi-Sucursal
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-[10px] font-black uppercase tracking-wider">
                    {restaurants.length} {restaurants.length === 1 ? 'Sede' : 'Sedes'}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 font-medium mt-0.5">
                  Ventas, costos operativos y flujo de caja en paralelo para identificar las sedes con mejor desempeño
                </p>
              </div>
            </div>
          </div>

          {/* Botón de Exportar */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
              title="Exportar reporte consolidado a formato CSV / Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Exportar Consolidado CSV</span>
            </button>
          </div>
        </div>

        {/* Barra de Filtro de Fechas */}
        <div className="mt-5 pt-4 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <span className="text-neutral-400 font-bold uppercase text-[10px] flex items-center gap-1 shrink-0 mr-1">
              <Calendar className="w-3.5 h-3.5" />
              Periodo:
            </span>
            {([
              { id: 'hoy', label: 'Hoy' },
              { id: 'ayer', label: 'Ayer' },
              { id: 'esta_semana', label: 'Esta Semana' },
              { id: 'semana_anterior', label: 'Sem. Anterior' },
              { id: 'este_mes', label: 'Este Mes' },
              { id: 'mes_anterior', label: 'Mes Anterior' },
              { id: 'ultimos_30', label: 'Últimos 30d' },
              { id: 'personalizado', label: 'Personalizado' },
            ] as const).map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  sounds.playKeypadClick();
                  setDatePreset(preset.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  datePreset === preset.id
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200/80 hover:text-neutral-900'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Rango de Fechas Personalizado */}
          {datePreset === 'personalizado' && (
            <div className="flex items-center gap-2 bg-neutral-50 p-1.5 rounded-xl border border-neutral-200 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-neutral-400 uppercase">Desde:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-white px-2 py-1 rounded-lg border border-neutral-200 text-xs font-bold text-neutral-800 outline-none"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-neutral-400 uppercase">Hasta:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-white px-2 py-1 rounded-lg border border-neutral-200 text-xs font-bold text-neutral-800 outline-none"
                />
              </div>
            </div>
          )}

          <div className="text-[11px] font-bold text-indigo-900 bg-indigo-50/80 px-3 py-1 rounded-xl border border-indigo-200/60 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
            <span>{effectiveDateRange.label} ({effectiveDateRange.start} al {effectiveDateRange.end})</span>
          </div>
        </div>
      </div>

      {/* 2. Tarjetas de KPIs Consolidados Globales & Podio de Rendimiento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Ventas Consolidadas */}
        <div className="bg-white rounded-3xl border border-neutral-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Ventas Consolidadas (Todas las Sedes)
              </span>
              <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-black font-mono text-emerald-700">
                ${consolidatedTotals.totalVentas.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
            <span>{consolidatedTotals.totalPedidos} comandas cobradas</span>
            <span className="font-bold text-neutral-700">Ticket: ${consolidatedTotals.ticketConsolidado.toFixed(2)}</span>
          </div>
        </div>

        {/* Card 2: Costos y Gastos Consolidados */}
        <div className="bg-white rounded-3xl border border-neutral-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Costos & Gastos Consolidados
              </span>
              <div className="w-7 h-7 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-black font-mono text-rose-600">
                ${consolidatedTotals.totalGastos.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
            <span>Ratio costo / venta</span>
            <span className="font-bold text-rose-700">
              {consolidatedTotals.totalVentas > 0
                ? `${((consolidatedTotals.totalGastos / consolidatedTotals.totalVentas) * 100).toFixed(1)}%`
                : '0%'}
            </span>
          </div>
        </div>

        {/* Card 3: Flujo de Caja Neto Consolidado */}
        <div className="bg-white rounded-3xl border border-neutral-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Flujo de Caja Neto Consolidado
              </span>
              <div className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className={`text-2xl font-black font-mono ${
                consolidatedTotals.totalFlujoCaja >= 0 ? 'text-indigo-900' : 'text-rose-700'
              }`}>
                ${consolidatedTotals.totalFlujoCaja.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
            <span>Margen Operativo Global</span>
            <span className={`font-black ${
              consolidatedTotals.margenConsolidado >= 20 ? 'text-emerald-600' : consolidatedTotals.margenConsolidado >= 10 ? 'text-amber-600' : 'text-rose-600'
            }`}>
              {consolidatedTotals.margenConsolidado}%
            </span>
          </div>
        </div>

        {/* Card 4: Sede con Mejor Desempeño */}
        <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-white rounded-3xl border border-amber-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider flex items-center gap-1">
                <Crown className="w-3.5 h-3.5 text-amber-600" />
                Sede Líder en Desempeño
              </span>
              <div className="w-7 h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                <Award className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-xl font-black text-neutral-900 truncate block">
                {consolidatedTotals.topBranch?.nombre || 'Sin datos'}
              </span>
              <span className="text-xs text-amber-700 font-bold block mt-0.5">
                Flujo Neto: ${consolidatedTotals.topBranch?.flujoCajaNeto.toLocaleString('es-ES', { minimumFractionDigits: 2 }) || '0.00'}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-amber-200/60 flex items-center justify-between text-xs text-amber-900 font-medium">
            <span>Participación de ventas:</span>
            <span className="font-black text-amber-800">{consolidatedTotals.topBranch?.participacionVentas || 0}%</span>
          </div>
        </div>
      </div>

      {/* 3. Gráfica de Barras Comparativa en Paralelo (Recharts BarChart) */}
      <div className="bg-white rounded-3xl border border-neutral-200/90 shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-neutral-100 bg-gradient-to-b from-neutral-50/60 to-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base sm:text-lg font-black text-neutral-900">
                  Comparativa de Ventas, Costos y Flujo de Caja por Sucursal
                </h3>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Evaluación en paralelo del desempeño financiero y rentabilidad de cada sede
              </p>
            </div>

            {/* Switcher de Modo de Gráfica */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-1 bg-neutral-100 rounded-xl border border-neutral-200">
                <button
                  type="button"
                  onClick={() => { sounds.playKeypadClick(); setChartViewMode('flujo_paralelo'); }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    chartViewMode === 'flujo_paralelo' ? 'bg-white text-indigo-900 shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Flujo Financiero ($)
                </button>
                <button
                  type="button"
                  onClick={() => { sounds.playKeypadClick(); setChartViewMode('margen_porcentaje'); }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    chartViewMode === 'margen_porcentaje' ? 'bg-white text-indigo-900 shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Margen (%)
                </button>
                <button
                  type="button"
                  onClick={() => { sounds.playKeypadClick(); setChartViewMode('pedidos_volumen'); }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    chartViewMode === 'pedidos_volumen' ? 'bg-white text-indigo-900 shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Nº Pedidos
                </button>
              </div>

              {/* Toggles de Series para el modo Flujo Financiero */}
              {chartViewMode === 'flujo_paralelo' && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowSalesBar(v => !v)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                      showSalesBar ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    Ventas
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowExpensesBar(v => !v)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                      showExpensesBar ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    Costos
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowProfitBar(v => !v)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                      showProfitBar ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                    Flujo Neto
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Lienzo Recharts */}
        <div className="p-5 sm:p-6">
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartViewMode === 'flujo_paralelo' ? (
                <BarChart data={chartData} margin={{ top: 15, right: 15, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: '#404040', fontWeight: 700 }}
                    axisLine={{ stroke: '#e5e5e5' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#737373' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#171717',
                      border: 'none',
                      borderRadius: '16px',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 600,
                      boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.35)',
                      padding: '12px 14px'
                    }}
                    formatter={(val: any, name: string) => [
                      `$${Number(val).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      name
                    ]}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload;
                      return `${label} · ${item?.participacionVentas || 0}% de las ventas globales`;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />

                  {/* Barra de Ventas */}
                  {showSalesBar && (
                    <Bar
                      dataKey="ventas"
                      name="Ventas Totales ($)"
                      fill="#10b981"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                    />
                  )}

                  {/* Barra de Costos/Gastos */}
                  {showExpensesBar && (
                    <Bar
                      dataKey="gastos"
                      name="Costos & Gastos ($)"
                      fill="#ef4444"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                    />
                  )}

                  {/* Barra de Flujo Neto */}
                  {showProfitBar && (
                    <Bar
                      dataKey="flujoCajaNeto"
                      name="Flujo de Caja Neto ($)"
                      fill="#4f46e5"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                    />
                  )}
                </BarChart>
              ) : chartViewMode === 'margen_porcentaje' ? (
                <BarChart data={chartData} margin={{ top: 15, right: 15, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: '#404040', fontWeight: 700 }}
                    axisLine={{ stroke: '#e5e5e5' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#737373' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => `${val}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#171717',
                      border: 'none',
                      borderRadius: '16px',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 600,
                      boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.35)'
                    }}
                    formatter={(val: any) => [`${val}%`, 'Margen de Utilidad Neto']}
                  />
                  <ReferenceLine y={20} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Meta 20%', fill: '#10b981', fontSize: 10 }} />
                  <Bar
                    dataKey="margenUtilidad"
                    name="Margen de Utilidad Neto (%)"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={54}
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-margin-${index}`}
                        fill={entry.margenUtilidad >= 20 ? '#10b981' : entry.margenUtilidad >= 10 ? '#f59e0b' : '#ef4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 15, right: 15, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: '#404040', fontWeight: 700 }}
                    axisLine={{ stroke: '#e5e5e5' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#737373' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => `${val}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#171717',
                      border: 'none',
                      borderRadius: '16px',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 600
                    }}
                    formatter={(val: any) => [`${val} comandas`, 'Volumen de Pedidos']}
                  />
                  <Bar
                    dataKey="pedidos"
                    name="Volumen de Pedidos"
                    fill="#3b82f6"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={54}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. Tabla Detallada Consolidada Multi-Sucursal */}
      <div className="bg-white rounded-3xl border border-neutral-200/90 shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-black text-neutral-900">
              Desglose Consolidado por Sucursal
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Auditoría financiera individual de cada local comercial en el periodo seleccionado
            </p>
          </div>
          <span className="text-xs font-bold text-neutral-500">
            Total Sedes Evaluadas: <strong>{branchMetrics.length}</strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50/90 text-neutral-500 font-bold border-b border-neutral-200 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Posición / Sede</th>
                <th className="py-3 px-4 text-right text-emerald-700">Ventas Cobradas ($)</th>
                <th className="py-3 px-4 text-right text-rose-600">Costos & Gastos ($)</th>
                <th className="py-3 px-4 text-right text-indigo-700">Flujo Neto ($)</th>
                <th className="py-3 px-4 text-center">Margen (%)</th>
                <th className="py-3 px-4 text-center">Pedidos</th>
                <th className="py-3 px-4 text-right">Ticket Prom.</th>
                <th className="py-3 px-4 text-center">% Del Negocio</th>
                <th className="py-3 px-4 text-center">Desempeño</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-medium text-neutral-700">
              {consolidatedTotals.rankedBranches.map((branch, rankIdx) => {
                const isTop = rankIdx === 0;
                const isSecond = rankIdx === 1;

                return (
                  <tr key={branch.id} className="hover:bg-neutral-50/70 transition">
                    <td className="py-3.5 px-4 font-bold text-neutral-900 flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                        isTop ? 'bg-amber-100 text-amber-800' : isSecond ? 'bg-neutral-200 text-neutral-800' : 'bg-neutral-100 text-neutral-500'
                      }`}>
                        {rankIdx + 1}
                      </span>
                      <div>
                        <span className="text-sm font-black text-neutral-900 block">{branch.nombre}</span>
                        {branch.direccion && (
                          <span className="text-[10px] text-neutral-400 font-medium block truncate max-w-[180px]">
                            {branch.direccion}
                          </span>
                        )}
                      </div>
                      {isTop && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-black uppercase flex items-center gap-0.5">
                          <Crown className="w-3 h-3 text-amber-600" /> Líder
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700">
                      ${branch.ventas.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-rose-600">
                      ${branch.gastos.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-black text-indigo-900">
                      ${branch.flujoCajaNeto.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                        branch.margenUtilidad >= 20 ? 'bg-emerald-100 text-emerald-800' : branch.margenUtilidad >= 10 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {branch.margenUtilidad}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono">
                      {branch.pedidos}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-neutral-800">
                      ${branch.ticketPromedio.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="font-bold text-indigo-700">
                        {branch.participacionVentas}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {branch.margenUtilidad >= 20 ? (
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                          Excelente
                        </span>
                      ) : branch.margenUtilidad >= 10 ? (
                        <span className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                          Saludable
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
                          Atención
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Fila Totalizadora Consolidada */}
            <tfoot className="bg-neutral-900 text-white font-black text-xs border-t-2 border-neutral-700">
              <tr>
                <td className="py-3.5 px-4 uppercase tracking-wider text-amber-400">
                  Total Consolidado ({restaurants.length} Sedes)
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-emerald-300">
                  ${consolidatedTotals.totalVentas.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-rose-300">
                  ${consolidatedTotals.totalGastos.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-indigo-300">
                  ${consolidatedTotals.totalFlujoCaja.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3.5 px-4 text-center text-emerald-300">
                  {consolidatedTotals.margenConsolidado}%
                </td>
                <td className="py-3.5 px-4 text-center font-mono">
                  {consolidatedTotals.totalPedidos}
                </td>
                <td className="py-3.5 px-4 text-right font-mono">
                  ${consolidatedTotals.ticketConsolidado.toFixed(2)}
                </td>
                <td className="py-3.5 px-4 text-center">
                  100%
                </td>
                <td className="py-3.5 px-4 text-center text-amber-300">
                  Consolidado
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
