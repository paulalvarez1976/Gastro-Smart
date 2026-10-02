import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  ShoppingBag,
  BarChart3,
  Flame,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Store,
  Layers,
  Info,
  CalendarDays,
  Percent,
  CheckCircle2
} from 'lucide-react';
import { Order, Restaurant, Expense, DailyStat } from '../types';
import { getOperationalDateString } from '../services/dataService';
import { sounds } from '../utils/sound';

export interface SalesTrendChartProps {
  orders: Order[];
  restaurants: Restaurant[];
  adminExpenses?: Expense[];
  adminDailyStats?: DailyStat[];
  defaultBranchId?: string;
}

type ViewMode = 'comparativa_dias' | 'evolucion_semanas' | 'patrones_consumo';
type MetricMode = 'ventas' | 'pedidos' | 'ticketPromedio';
type WeekRange = '4w' | '8w' | '12w';

const DAYS_NAMES_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAYS_SHORT_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Retorna la fecha del lunes de la semana que contiene a `d`.
 * En JS getDay() retorna 0 para Domingo, 1 para Lunes, ..., 6 para Sábado.
 */
function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  // Si es domingo (0), retroceder 6 días; si no, retroceder (day - 1) días
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export const SalesTrendChart: React.FC<SalesTrendChartProps> = ({
  orders,
  restaurants,
  adminExpenses = [],
  adminDailyStats = [],
  defaultBranchId = 'all'
}) => {
  // Filtros
  const [selectedBranch, setSelectedBranch] = useState<string>(defaultBranchId);
  const [viewMode, setViewMode] = useState<ViewMode>('comparativa_dias');
  const [metricMode, setMetricMode] = useState<MetricMode>('ventas');
  const [weekRange, setWeekRange] = useState<WeekRange>('4w');

  // Visibilidad de series en gráfica
  const [showCurrentWeek, setShowCurrentWeek] = useState(true);
  const [showPreviousWeek, setShowPreviousWeek] = useState(true);
  const [showTwoWeeksAgo, setShowTwoWeeksAgo] = useState(false);
  const [showAverageWeek, setShowAverageWeek] = useState(true);

  // Filtrar órdenes cobradas según sucursal
  const effectiveOrders = useMemo(() => {
    return orders.filter(o => {
      const isPaid = o.estado === 'cobrado' || o.estadoPago === 'cobrado';
      if (!isPaid) return false;
      if (selectedBranch !== 'all' && o.restaurantId !== selectedBranch) return false;
      return true;
    });
  }, [orders, selectedBranch]);

  // Filtrar gastos según sucursal
  const effectiveExpenses = useMemo(() => {
    return adminExpenses.filter(e => {
      if (selectedBranch !== 'all' && e.restaurantId !== selectedBranch) return false;
      return true;
    });
  }, [adminExpenses, selectedBranch]);

  // Filtrar estadísticas diarias sincronizadas
  const effectiveDailyStats = useMemo(() => {
    return adminDailyStats.filter(s => {
      if (selectedBranch !== 'all' && s.restaurantId !== selectedBranch) return false;
      return true;
    });
  }, [adminDailyStats, selectedBranch]);

  // Cantidad de semanas a evaluar
  const weeksCount = weekRange === '4w' ? 4 : weekRange === '8w' ? 8 : 12;

  // Estructura de semanas calculada retroactivamente desde el lunes actual
  const weeksData = useMemo(() => {
    const now = new Date();
    const currentMonday = getMondayOfWeek(now);

    const weeks: {
      weekIndex: number; // 0 = actual, 1 = semana pasada, etc.
      mondayDate: Date;
      sundayDate: Date;
      label: string;
      dateRangeLabel: string;
      dailySales: number[]; // 7 días (0=Lun, ..., 6=Dom)
      dailyOrdersCount: number[]; // 7 días
      totalVentas: number;
      totalPedidos: number;
      totalGastos: number;
      ticketPromedio: number;
      ventasFinDeSemana: number; // Vie + Sáb + Dom
      ventasLaborales: number; // Lun a Jue
      diaPicoIndex: number;
    }[] = [];

    for (let w = 0; w < weeksCount; w++) {
      const mon = new Date(currentMonday);
      mon.setDate(currentMonday.getDate() - (w * 7));
      mon.setHours(0, 0, 0, 0);

      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      sun.setHours(23, 59, 59, 999);

      const dailySales = [0, 0, 0, 0, 0, 0, 0];
      const dailyOrders = [0, 0, 0, 0, 0, 0, 0];

      // Mapear cada día de la semana (Lunes=0 a Domingo=6)
      for (let d = 0; d < 7; d++) {
        const dayDate = new Date(mon);
        dayDate.setDate(mon.getDate() + d);
        const opDateStr = getOperationalDateString(dayDate);

        // Órdenes en vivo
        const matchingOrders = effectiveOrders.filter(o => {
          const refDate = o.pagadoEn || o.creadoEn;
          return refDate && getOperationalDateString(new Date(refDate)) === opDateStr;
        });
        const liveSales = matchingOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        const liveOrders = matchingOrders.length;

        // Estadísticas diarias de Firestore como fallback o valor mayor verificado
        const matchingStats = effectiveDailyStats.filter(s => s.fecha === opDateStr);
        const statSales = matchingStats.reduce((sum, s) => sum + (Number(s.ventasTotales) || 0), 0);
        const statOrders = matchingStats.reduce((sum, s) => sum + (Number(s.pedidosCobrados) || 0), 0);

        dailySales[d] = Math.max(liveSales, statSales);
        dailyOrders[d] = Math.max(liveOrders, statOrders);
      }

      const totalVentas = dailySales.reduce((a, b) => a + b, 0);
      const totalPedidos = dailyOrders.reduce((a, b) => a + b, 0);
      const ticketPromedio = totalPedidos > 0 ? totalVentas / totalPedidos : 0;

      // Gastos de esa semana
      const monStr = getOperationalDateString(mon);
      const sunStr = getOperationalDateString(sun);
      const weekExpenses = effectiveExpenses
        .filter(e => {
          if (!e.fecha) return false;
          const eDate = getOperationalDateString(new Date(e.fecha));
          return eDate >= monStr && eDate <= sunStr;
        })
        .reduce((sum, e) => sum + (Number(e.monto) || 0), 0);

      // Fin de semana (Vie: idx 4, Sáb: idx 5, Dom: idx 6)
      const ventasFinDeSemana = dailySales[4] + dailySales[5] + dailySales[6];
      const ventasLaborales = dailySales[0] + dailySales[1] + dailySales[2] + dailySales[3];

      let diaPico = 0;
      let maxDiaVal = -1;
      dailySales.forEach((v, idx) => {
        if (v > maxDiaVal) {
          maxDiaVal = v;
          diaPico = idx;
        }
      });

      const label = w === 0 
        ? 'Semana Actual' 
        : w === 1 
          ? 'Semana Anterior' 
          : `Hace ${w} semanas`;

      const dateRangeLabel = `${mon.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} - ${sun.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`;

      weeks.push({
        weekIndex: w,
        mondayDate: mon,
        sundayDate: sun,
        label,
        dateRangeLabel,
        dailySales,
        dailyOrdersCount: dailyOrders,
        totalVentas: Math.round(totalVentas * 100) / 100,
        totalPedidos,
        totalGastos: Math.round(weekExpenses * 100) / 100,
        ticketPromedio: Math.round(ticketPromedio * 100) / 100,
        ventasFinDeSemana: Math.round(ventasFinDeSemana * 100) / 100,
        ventasLaborales: Math.round(ventasLaborales * 100) / 100,
        diaPicoIndex: diaPico
      });
    }

    return weeks;
  }, [effectiveOrders, effectiveExpenses, effectiveDailyStats, weeksCount]);

  // Datos para Vista 1: Comparativa Día a Día (Lunes a Domingo)
  const dayOfWeekComparativeData = useMemo(() => {
    const sem0 = weeksData[0]; // Actual
    const sem1 = weeksData[1]; // Anterior
    const sem2 = weeksData[2]; // Hace 2 semanas

    // Promedio de las semanas disponibles
    const weeksToAverage = weeksData.slice(0, Math.min(4, weeksData.length));

    return DAYS_SHORT_ES.map((shortName, dayIdx) => {
      // Promedio de este día en las últimas semanas
      const avgSales = weeksToAverage.reduce((acc, w) => acc + (w.dailySales[dayIdx] || 0), 0) / (weeksToAverage.length || 1);
      const avgOrders = weeksToAverage.reduce((acc, w) => acc + (w.dailyOrdersCount[dayIdx] || 0), 0) / (weeksToAverage.length || 1);

      const sem0Ventas = sem0 ? sem0.dailySales[dayIdx] : 0;
      const sem1Ventas = sem1 ? sem1.dailySales[dayIdx] : 0;
      const sem2Ventas = sem2 ? sem2.dailySales[dayIdx] : 0;

      const sem0Pedidos = sem0 ? sem0.dailyOrdersCount[dayIdx] : 0;
      const sem1Pedidos = sem1 ? sem1.dailyOrdersCount[dayIdx] : 0;
      const sem2Pedidos = sem2 ? sem2.dailyOrdersCount[dayIdx] : 0;

      const sem0Ticket = sem0Pedidos > 0 ? sem0Ventas / sem0Pedidos : 0;
      const sem1Ticket = sem1Pedidos > 0 ? sem1Ventas / sem1Pedidos : 0;
      const sem2Ticket = sem2Pedidos > 0 ? sem2Ventas / sem2Pedidos : 0;
      const avgTicket = avgOrders > 0 ? avgSales / avgOrders : 0;

      return {
        dia: shortName,
        diaCompleto: DAYS_NAMES_ES[dayIdx],
        isWeekend: dayIdx >= 4, // Vie, Sáb, Dom
        // Ventas ($)
        semanaActualVentas: Math.round(sem0Ventas * 100) / 100,
        semanaAnteriorVentas: Math.round(sem1Ventas * 100) / 100,
        semanaPreviaVentas: Math.round(sem2Ventas * 100) / 100,
        promedioSemanalVentas: Math.round(avgSales * 100) / 100,
        // Pedidos
        semanaActualPedidos: sem0Pedidos,
        semanaAnteriorPedidos: sem1Pedidos,
        semanaPreviaPedidos: sem2Pedidos,
        promedioSemanalPedidos: Math.round(avgOrders * 10) / 10,
        // Ticket Promedio
        semanaActualTicket: Math.round(sem0Ticket * 100) / 100,
        semanaAnteriorTicket: Math.round(sem1Ticket * 100) / 100,
        semanaPreviaTicket: Math.round(sem2Ticket * 100) / 100,
        promedioSemanalTicket: Math.round(avgTicket * 100) / 100
      };
    });
  }, [weeksData]);

  // Datos para Vista 2: Evolución Semana a Semana (Multi-semanal)
  const weeklyTrendsData = useMemo(() => {
    // Clonar e invertir para mostrar en orden cronológico (de la más antigua a la más reciente)
    const chronologicalWeeks = [...weeksData].reverse();

    return chronologicalWeeks.map((w, idx) => {
      const prevWeek = idx > 0 ? chronologicalWeeks[idx - 1] : null;
      let varPct = 0;
      if (prevWeek && prevWeek.totalVentas > 0) {
        varPct = ((w.totalVentas - prevWeek.totalVentas) / prevWeek.totalVentas) * 100;
      }

      const totalWeekVol = w.totalVentas || 1;
      const weekendPct = Math.round((w.ventasFinDeSemana / totalWeekVol) * 100);

      return {
        key: `sem-${w.weekIndex}`,
        weekIndex: w.weekIndex,
        label: w.weekIndex === 0 ? 'Semana Actual' : w.weekIndex === 1 ? 'Semana -1' : `Sem -${w.weekIndex}`,
        subLabel: w.dateRangeLabel,
        ventas: w.totalVentas,
        pedidos: w.totalPedidos,
        ticketPromedio: w.ticketPromedio,
        gastos: w.totalGastos,
        ganancia: Math.round((w.totalVentas - w.totalGastos) * 100) / 100,
        variacionPorcentaje: Math.round(varPct * 10) / 10,
        diaPicoNombre: DAYS_NAMES_ES[w.diaPicoIndex],
        weekendPct,
        weekdayPct: 100 - weekendPct
      };
    });
  }, [weeksData]);

  // Métricas Clave y Patrones de Consumo Calculados
  const consumptionInsights = useMemo(() => {
    const semActual = weeksData[0] || { totalVentas: 0, totalPedidos: 0, ticketPromedio: 0, ventasFinDeSemana: 0, ventasLaborales: 0, diaPicoIndex: 0 };
    const semAnterior = weeksData[1] || { totalVentas: 0, totalPedidos: 0, ticketPromedio: 0, ventasFinDeSemana: 0, ventasLaborales: 0, diaPicoIndex: 0 };

    // Variación % ventas vs semana anterior
    let salesVariation = 0;
    if (semAnterior.totalVentas > 0) {
      salesVariation = ((semActual.totalVentas - semAnterior.totalVentas) / semAnterior.totalVentas) * 100;
    }

    // Variación % pedidos vs semana anterior
    let ordersVariation = 0;
    if (semAnterior.totalPedidos > 0) {
      ordersVariation = ((semActual.totalPedidos - semAnterior.totalPedidos) / semAnterior.totalPedidos) * 100;
    }

    // Análisis de concentración de volumen en todos los datos analizados
    const totalVentasGlobal = weeksData.reduce((acc, w) => acc + w.totalVentas, 0) || 1;
    const totalFinSemanaGlobal = weeksData.reduce((acc, w) => acc + w.ventasFinDeSemana, 0);
    const pctFinSemanaGlobal = Math.round((totalFinSemanaGlobal / totalVentasGlobal) * 100);

    // Suma acumulada de ventas por día de la semana para encontrar el patrón recurrente
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    weeksData.forEach(w => {
      w.dailySales.forEach((val, idx) => {
        dayTotals[idx] += val;
      });
    });

    let peakDayIdx = 0;
    let minDayIdx = 0;
    let maxDayVal = -1;
    let minDayVal = Infinity;

    dayTotals.forEach((val, idx) => {
      if (val > maxDayVal) {
        maxDayVal = val;
        peakDayIdx = idx;
      }
      if (val < minDayVal) {
        minDayVal = val;
        minDayIdx = idx;
      }
    });

    const peakDayPct = Math.round((maxDayVal / totalVentasGlobal) * 100);
    const minDayPct = Math.round((minDayVal / totalVentasGlobal) * 100);

    return {
      ventasSemanaActual: semActual.totalVentas,
      ventasSemanaAnterior: semAnterior.totalVentas,
      salesVariation: Math.round(salesVariation * 10) / 10,
      pedidosSemanaActual: semActual.totalPedidos,
      pedidosSemanaAnterior: semAnterior.totalPedidos,
      ordersVariation: Math.round(ordersVariation * 10) / 10,
      ticketSemanaActual: semActual.ticketPromedio,
      ticketSemanaAnterior: semAnterior.ticketPromedio,
      pctFinSemanaGlobal,
      pctLaboralesGlobal: 100 - pctFinSemanaGlobal,
      peakDayName: DAYS_NAMES_ES[peakDayIdx],
      peakDayPct,
      minDayName: DAYS_NAMES_ES[minDayIdx],
      minDayPct
    };
  }, [weeksData]);

  // Selección de clave activa para Recharts según métrica seleccionada
  const activeMetricKeys = useMemo(() => {
    if (metricMode === 'ventas') {
      return {
        unit: '$',
        format: (val: number) => `$${Number(val).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        actualKey: 'semanaActualVentas',
        anteriorKey: 'semanaAnteriorVentas',
        previaKey: 'semanaPreviaVentas',
        promedioKey: 'promedioSemanalVentas',
        evolucionKey: 'ventas',
        title: 'Monto de Ventas Cobradas'
      };
    }
    if (metricMode === 'pedidos') {
      return {
        unit: ' pedidos',
        format: (val: number) => `${Number(val)} pedidos`,
        actualKey: 'semanaActualPedidos',
        anteriorKey: 'semanaAnteriorPedidos',
        previaKey: 'semanaPreviaPedidos',
        promedioKey: 'promedioSemanalPedidos',
        evolucionKey: 'pedidos',
        title: 'Volumen de Comandas / Pedidos'
      };
    }
    return {
      unit: '$',
      format: (val: number) => `$${Number(val).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      actualKey: 'semanaActualTicket',
      anteriorKey: 'semanaAnteriorTicket',
      previaKey: 'semanaPreviaTicket',
      promedioKey: 'promedioSemanalTicket',
      evolucionKey: 'ticketPromedio',
      title: 'Ticket Promedio por Pedido'
    };
  }, [metricMode]);

  return (
    <div className="bg-white rounded-3xl border border-neutral-200/90 shadow-xs overflow-hidden flex flex-col transition">
      {/* 1. Header con Branding y Controles de Navegación */}
      <div className="p-5 md:p-6 border-b border-neutral-100 bg-gradient-to-b from-neutral-50/70 to-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-600 flex items-center justify-center shadow-2xs">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-neutral-900 tracking-tight">
                    Gráfica de Tendencia de Ventas
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-black uppercase tracking-wider">
                    Recharts
                  </span>
                </div>
                <p className="text-xs text-neutral-500 font-medium mt-0.5">
                  Visualización del volumen de ventas comparativo por semana e identificación de patrones de consumo
                </p>
              </div>
            </div>
          </div>

          {/* Filtros de Sucursal, Modo de Vista y Rango */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro Sucursal si hay más de 1 */}
            {restaurants.length > 1 && (
              <div className="flex items-center gap-1.5 bg-neutral-100/80 px-2.5 py-1 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-700">
                <Store className="w-3.5 h-3.5 text-neutral-400" />
                <select
                  value={selectedBranch}
                  onChange={(e) => {
                    sounds.playClick();
                    setSelectedBranch(e.target.value);
                  }}
                  className="bg-transparent border-none outline-none font-bold text-neutral-800 text-xs cursor-pointer"
                >
                  <option value="all">Todas las sucursales</option>
                  {restaurants.map(r => (
                    <option key={r.id} value={r.id}>{r.nombre}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Selector de Rango de Semanas */}
            <div className="inline-flex p-1 bg-neutral-100 rounded-xl border border-neutral-200">
              {([
                { id: '4w', label: '4 Semanas' },
                { id: '8w', label: '8 Semanas' },
                { id: '12w', label: '12 Semanas' },
              ] as const).map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    sounds.playKeypadClick();
                    setWeekRange(preset.id);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    weekRange === preset.id
                      ? 'bg-neutral-900 text-white shadow-2xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Selector de Modo de Vista */}
            <div className="inline-flex p-1 bg-orange-50/80 rounded-xl border border-orange-200/80">
              <button
                type="button"
                onClick={() => {
                  sounds.playKeypadClick();
                  setViewMode('comparativa_dias');
                }}
                className={`px-3 py-1 rounded-lg text-[11px] font-black transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'comparativa_dias'
                    ? 'bg-orange-600 text-white shadow-2xs'
                    : 'text-orange-950 hover:bg-orange-100/50'
                }`}
                title="Superponer curvas de Lunes a Domingo entre semanas"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Comparativa Semanal</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sounds.playKeypadClick();
                  setViewMode('evolucion_semanas');
                }}
                className={`px-3 py-1 rounded-lg text-[11px] font-black transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'evolucion_semanas'
                    ? 'bg-orange-600 text-white shadow-2xs'
                    : 'text-orange-950 hover:bg-orange-100/50'
                }`}
                title="Histórico barra por semana con volumen total"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Semana a Semana</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sounds.playKeypadClick();
                  setViewMode('patrones_consumo');
                }}
                className={`px-3 py-1 rounded-lg text-[11px] font-black transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'patrones_consumo'
                    ? 'bg-orange-600 text-white shadow-2xs'
                    : 'text-orange-950 hover:bg-orange-100/50'
                }`}
                title="Análisis inteligente de patrones de consumo"
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Patrones de Consumo</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. Tarjetas de Resumen & Patrones de Consumo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-neutral-100">
          {/* Card 1: Ventas Semana Actual */}
          <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200/80">
            <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wider">
              Ventas Semana Actual
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-lg font-black font-mono text-neutral-900">
                ${consumptionInsights.ventasSemanaActual.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={`inline-flex items-center text-[11px] font-extrabold ${
                consumptionInsights.salesVariation >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {consumptionInsights.salesVariation >= 0 ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {Math.abs(consumptionInsights.salesVariation)}%
              </span>
            </div>
            <span className="text-[10px] text-neutral-400 font-medium block mt-0.5 truncate">
              vs anterior: ${consumptionInsights.ventasSemanaAnterior.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Card 2: Volumen de Pedidos */}
          <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200/80">
            <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wider">
              Volumen de Pedidos
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-lg font-black font-mono text-neutral-900">
                {consumptionInsights.pedidosSemanaActual}
              </span>
              <span className={`inline-flex items-center text-[11px] font-extrabold ${
                consumptionInsights.ordersVariation >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {consumptionInsights.ordersVariation >= 0 ? '+' : ''}{consumptionInsights.ordersVariation}%
              </span>
            </div>
            <span className="text-[10px] text-neutral-400 font-medium block mt-0.5 truncate">
              Ticket prom: ${consumptionInsights.ticketSemanaActual.toFixed(2)}
            </span>
          </div>

          {/* Card 3: Día Pico de Consumo */}
          <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/70">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-amber-700 block tracking-wider">
                Día Pico de Consumo
              </span>
              <Flame className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-base font-black text-amber-950">
                {consumptionInsights.peakDayName}
              </span>
              <span className="text-xs font-bold text-amber-700 font-mono">
                ({consumptionInsights.peakDayPct}%)
              </span>
            </div>
            <span className="text-[10px] text-amber-700/80 font-medium block mt-0.5 truncate">
              Mayor concentración de volumen
            </span>
          </div>

          {/* Card 4: Fin de Semana vs Días Laborables */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200/70">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-indigo-700 block tracking-wider">
                Patrón Fin de Semana
              </span>
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-base font-black text-indigo-950">
                {consumptionInsights.pctFinSemanaGlobal}%
              </span>
              <span className="text-xs text-indigo-700 font-medium">
                (Vie - Dom)
              </span>
            </div>
            <span className="text-[10px] text-indigo-700/80 font-medium block mt-0.5 truncate">
              vs {consumptionInsights.pctLaboralesGlobal}% Días Laborales
            </span>
          </div>
        </div>

        {/* 3. Selector de Métricas y Toggles de Series */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-neutral-100">
          {/* Métrica Activa */}
          <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-600">
            <span className="text-neutral-400 font-bold uppercase text-[10px]">Métrica:</span>
            <div className="flex items-center bg-neutral-100 p-0.5 rounded-lg border border-neutral-200">
              <button
                type="button"
                onClick={() => { sounds.playKeypadClick(); setMetricMode('ventas'); }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                  metricMode === 'ventas' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Ventas ($)
              </button>
              <button
                type="button"
                onClick={() => { sounds.playKeypadClick(); setMetricMode('pedidos'); }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                  metricMode === 'pedidos' ? 'bg-white text-blue-800 shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Nº Pedidos
              </button>
              <button
                type="button"
                onClick={() => { sounds.playKeypadClick(); setMetricMode('ticketPromedio'); }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                  metricMode === 'ticketPromedio' ? 'bg-white text-amber-800 shadow-2xs' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Ticket Prom.
              </button>
            </div>
          </div>

          {/* Toggles interactivos para la vista comparativa de días */}
          {viewMode === 'comparativa_dias' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowCurrentWeek(v => !v)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                  showCurrentWeek
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Semana Actual
              </button>

              <button
                type="button"
                onClick={() => setShowPreviousWeek(v => !v)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                  showPreviousWeek
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                Semana Anterior
              </button>

              <button
                type="button"
                onClick={() => setShowTwoWeeksAgo(v => !v)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                  showTwoWeeksAgo
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Hace 2 Semanas
              </button>

              <button
                type="button"
                onClick={() => setShowAverageWeek(v => !v)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                  showAverageWeek
                    ? 'bg-purple-50 border-purple-300 text-purple-800'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                Promedio Semanal
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. Contenedor de Gráficos Recharts */}
      <div className="p-5 md:p-6 flex-1 min-h-[340px]">
        {/* VISTA 1: Comparativa Semanal Día a Día (Lun - Dom) */}
        {viewMode === 'comparativa_dias' && (
          <div className="space-y-4">
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dayOfWeekComparativeData} margin={{ top: 12, right: 16, left: -5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis
                    dataKey="dia"
                    tick={{ fontSize: 11, fill: '#525252', fontWeight: 600 }}
                    axisLine={{ stroke: '#e5e5e5' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#737373' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => metricMode === 'pedidos' ? `${val}` : `$${val}`}
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
                      activeMetricKeys.format(Number(val)),
                      name
                    ]}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload;
                      const weekendTag = item?.isWeekend ? ' ⭐ Fin de Semana' : ' 💼 Día Laborable';
                      return `${item?.diaCompleto || label}${weekendTag}`;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }} />

                  {/* Semana Actual: Línea Destacada Verde */}
                  {showCurrentWeek && (
                    <Line
                      type="monotone"
                      dataKey={activeMetricKeys.actualKey}
                      name="Semana Actual"
                      stroke="#10b981"
                      strokeWidth={3.5}
                      dot={{ r: 4.5, fill: '#10b981', strokeWidth: 2, stroke: '#ffffff' }}
                      activeDot={{ r: 7, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  )}

                  {/* Semana Anterior: Línea Índigo Punteada */}
                  {showPreviousWeek && (
                    <Line
                      type="monotone"
                      dataKey={activeMetricKeys.anteriorKey}
                      name="Semana Anterior"
                      stroke="#4f46e5"
                      strokeWidth={2.5}
                      strokeDasharray="4 4"
                      dot={{ r: 3.5, fill: '#4f46e5', strokeWidth: 1.5, stroke: '#ffffff' }}
                      activeDot={{ r: 6 }}
                    />
                  )}

                  {/* Hace 2 Semanas: Línea Ámbar */}
                  {showTwoWeeksAgo && (
                    <Line
                      type="monotone"
                      dataKey={activeMetricKeys.previaKey}
                      name="Hace 2 Semanas"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="2 2"
                      dot={{ r: 3, fill: '#f59e0b' }}
                      activeDot={{ r: 5 }}
                    />
                  )}

                  {/* Promedio Semanal: Línea Guía Violeta */}
                  {showAverageWeek && (
                    <Line
                      type="monotone"
                      dataKey={activeMetricKeys.promedioKey}
                      name="Promedio Semanal"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      strokeDasharray="5 3"
                      dot={{ r: 2.5, fill: '#8b5cf6' }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Tabla Comparativa de Días */}
            <div className="overflow-x-auto rounded-2xl border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50/80 text-neutral-500 font-bold border-b border-neutral-200 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Día</th>
                    <th className="py-2.5 px-3 text-right text-emerald-700">Semana Actual</th>
                    <th className="py-2.5 px-3 text-right text-indigo-700">Semana Anterior</th>
                    <th className="py-2.5 px-3 text-right text-purple-700">Promedio Semanal</th>
                    <th className="py-2.5 px-3 text-right">Variación %</th>
                    <th className="py-2.5 px-3 text-center">Tipo Día</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-medium text-neutral-700">
                  {dayOfWeekComparativeData.map((d) => {
                    const currentVal = metricMode === 'ventas' ? d.semanaActualVentas : metricMode === 'pedidos' ? d.semanaActualPedidos : d.semanaActualTicket;
                    const prevVal = metricMode === 'ventas' ? d.semanaAnteriorVentas : metricMode === 'pedidos' ? d.semanaAnteriorPedidos : d.semanaAnteriorTicket;
                    const avgVal = metricMode === 'ventas' ? d.promedioSemanalVentas : metricMode === 'pedidos' ? d.promedioSemanalPedidos : d.promedioSemanalTicket;
                    
                    let diffPct = 0;
                    if (prevVal > 0) {
                      diffPct = Math.round(((currentVal - prevVal) / prevVal) * 100);
                    }

                    return (
                      <tr key={d.dia} className="hover:bg-neutral-50/60 transition">
                        <td className="py-2.5 px-3 font-bold text-neutral-900 flex items-center gap-1.5">
                          {d.diaCompleto}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                          {activeMetricKeys.format(currentVal)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-indigo-700">
                          {activeMetricKeys.format(prevVal)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-purple-700">
                          {activeMetricKeys.format(avgVal)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {prevVal > 0 ? (
                            <span className={`inline-flex items-center gap-0.5 font-bold ${
                              diffPct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                            }`}>
                              {diffPct >= 0 ? '+' : ''}{diffPct}%
                            </span>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            d.isWeekend ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-600'
                          }`}>
                            {d.isWeekend ? 'Fin de Semana' : 'Laboral'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VISTA 2: Evolución Semana a Semana (Multi-semanal ComposedChart) */}
        {viewMode === 'evolucion_semanas' && (
          <div className="space-y-4">
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={weeklyTrendsData} margin={{ top: 12, right: 16, left: -5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#525252', fontWeight: 600 }}
                    axisLine={{ stroke: '#e5e5e5' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: '#737373' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => metricMode === 'pedidos' ? `${val}` : `$${val}`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10, fill: '#6366f1' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => `${val} ped.`}
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
                      name === 'Volumen de Pedidos' ? `${val} comandas` : `$${Number(val).toLocaleString('es-ES', { minimumFractionDigits: 2 })}`,
                      name
                    ]}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload;
                      return `${label} (${item?.subLabel || ''}) · Día más fuerte: ${item?.diaPicoNombre || 'N/A'}`;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }} />

                  {/* Barra de Ventas */}
                  <Bar
                    yAxisId="left"
                    dataKey="ventas"
                    name="Ventas Totales ($)"
                    fill="#10b981"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={42}
                  >
                    {weeklyTrendsData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.weekIndex === 0 ? '#10b981' : '#3b82f6'}
                      />
                    ))}
                  </Bar>

                  {/* Línea de Pedidos en Eje Derecho */}
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="pedidos"
                    name="Volumen de Pedidos"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#f59e0b', strokeWidth: 2, stroke: '#ffffff' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Listado comparativo de semanas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {weeklyTrendsData.map((w) => (
                <div 
                  key={w.key}
                  className={`p-3.5 rounded-2xl border transition ${
                    w.weekIndex === 0 
                      ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-500/20 shadow-xs' 
                      : 'bg-neutral-50/60 border-neutral-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs text-neutral-900">{w.label}</span>
                    <span className="text-[10px] text-neutral-400 font-medium">{w.subLabel}</span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-base font-black font-mono text-neutral-900">
                      ${w.ventas.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                    </span>
                    <span className={`text-[11px] font-extrabold ${
                      w.variacionPorcentaje >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {w.variacionPorcentaje >= 0 ? '+' : ''}{w.variacionPorcentaje}%
                    </span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-black/5 flex items-center justify-between text-[11px] text-neutral-500">
                    <span>{w.pedidos} pedidos</span>
                    <span className="text-amber-700 font-bold">Pico: {w.diaPicoNombre}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VISTA 3: Análisis de Patrones de Consumo */}
        {viewMode === 'patrones_consumo' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Patrón 1: Distribución Fin de Semana vs Días de Semana */}
              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-orange-600" />
                  <h4 className="font-black text-neutral-900 text-sm">
                    Concentración Semanal: Fin de Semana vs Días Laborables
                  </h4>
                </div>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Identifica en qué tramo de la semana se concentra el mayor volumen de facturación para optimizar compras de insumos y turnos del personal.
                </p>

                <div className="space-y-2 pt-2">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-indigo-900">Fin de Semana (Vie, Sáb, Dom)</span>
                      <span className="text-indigo-600">{consumptionInsights.pctFinSemanaGlobal}% del volumen</span>
                    </div>
                    <div className="w-full h-3 bg-neutral-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-600 rounded-full transition-all duration-500" 
                        style={{ width: `${consumptionInsights.pctFinSemanaGlobal}%` }} 
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-neutral-700">Días Laborables (Lun - Jue)</span>
                      <span className="text-neutral-600">{consumptionInsights.pctLaboralesGlobal}% del volumen</span>
                    </div>
                    <div className="w-full h-3 bg-neutral-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-neutral-500 rounded-full transition-all duration-500" 
                        style={{ width: `${consumptionInsights.pctLaboralesGlobal}%` }} 
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-neutral-200/80 text-xs text-neutral-600 space-y-1">
                  <div className="font-bold text-neutral-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Insight Operativo
                  </div>
                  <p className="text-[11px] leading-relaxed text-neutral-500">
                    {consumptionInsights.pctFinSemanaGlobal >= 60
                      ? 'Tu negocio presenta un perfil fuertemente orientado al fin de semana (más del 60% de las ventas). Asegura abastecimiento de insumos críticos los jueves por la tarde.'
                      : 'Tu negocio muestra un flujo de consumo balanceado a lo largo de toda la semana laboral. Ideal para compras escalonadas y turnos rotativos continuos.'}
                  </p>
                </div>
              </div>

              {/* Patrón 2: Días Pico y Oportunidades de Promoción */}
              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-3">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-600" />
                  <h4 className="font-black text-neutral-900 text-sm">
                    Días Pico y Valles de Consumo
                  </h4>
                </div>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Compara los extremos del ciclo semanal para planificar promociones en días de baja demanda y reforzar la capacidad de despacho en los picos.
                </p>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                    <span className="text-[10px] uppercase font-bold text-amber-800 block">Día más Fuerte</span>
                    <span className="text-base font-black text-amber-950 block mt-0.5">{consumptionInsights.peakDayName}</span>
                    <span className="text-[11px] text-amber-700 font-bold block mt-1">
                      {consumptionInsights.peakDayPct}% del total semanal
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-100 border border-neutral-200">
                    <span className="text-[10px] uppercase font-bold text-neutral-500 block">Día más Tranquilo</span>
                    <span className="text-base font-black text-neutral-900 block mt-0.5">{consumptionInsights.minDayName}</span>
                    <span className="text-[11px] text-neutral-600 font-bold block mt-1">
                      {consumptionInsights.minDayPct}% del total semanal
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-neutral-200/80 text-xs text-neutral-600 space-y-1">
                  <div className="font-bold text-neutral-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                    Oportunidad de Crecimiento
                  </div>
                  <p className="text-[11px] leading-relaxed text-neutral-500">
                    Lanzar promociones especiales (ej. "2x1", "Combo Ejecutivo" o "Happy Hour") los días {consumptionInsights.minDayName} puede elevar el ticket promedio e incrementar la facturación semanal entre un 10% y 18%.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Footer con metadata explicativa */}
      <div className="px-6 py-3.5 bg-neutral-50/80 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-400">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-neutral-400" />
          <span>Datos basados en comandas cobradas y turnos operativos (5:00 a.m. a 4:59 a.m.)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-medium">Total Semanas Evaluadas: <strong className="text-neutral-700">{weeksCount}</strong></span>
          <span className="font-medium">Órdenes Analizadas: <strong className="text-neutral-700">{effectiveOrders.length}</strong></span>
        </div>
      </div>
    </div>
  );
};
