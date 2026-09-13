import React, { useState, useMemo, useEffect } from 'react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ReferenceLine 
} from 'recharts';
import { 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Receipt, 
  Store, 
  Filter, 
  Eye, 
  EyeOff, 
  FileSpreadsheet, 
  ChevronLeft, 
  ChevronRight, 
  Award, 
  AlertCircle,
  Percent,
  CheckCircle2,
  Table as TableIcon
} from 'lucide-react';
import { Order, Restaurant, Expense } from '../types';
import { subscribeToExpenses } from '../services/dataService';
import { sounds } from '../utils/sound';

interface DailyTrendItem {
  fecha: string;          // YYYY-MM-DD
  label: string;          // Formato corto para el eje X (ej: '12 Sep')
  diaSemana: string;      // ej: 'Sáb'
  fechaCompleta: string;  // ej: 'Sábado 12 de Septiembre, 2026'
  ventas: number;
  pedidos: number;
  gastos: number;
  gastosCount: number;
  ganancia: number;
  margen: number;
}

interface DailySalesExpensesTrendChartProps {
  orders: Order[];
  restaurants: Restaurant[];
  businessId: string;
  defaultRestaurantId?: string;
}

type TimePreset = '7d' | '14d' | '30d' | 'mes_actual' | 'mes_anterior' | 'custom';

export const DailySalesExpensesTrendChart: React.FC<DailySalesExpensesTrendChartProps> = ({
  orders,
  restaurants,
  businessId,
  defaultRestaurantId = 'all'
}) => {
  // Filtro de sucursal
  const [selectedBranchId, setSelectedBranchId] = useState<string>(defaultRestaurantId);

  // Filtros de fecha
  const [timePreset, setTimePreset] = useState<TimePreset>('30d');

  // Fechas personalizadas (formato YYYY-MM-DD)
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  
  const thirtyDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().split('T')[0];
  }, []);

  const [customStartDate, setCustomStartDate] = useState<string>(thirtyDaysAgoStr);
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr);

  // Visibilidad de series
  const [showSalesLine, setShowSalesLine] = useState<boolean>(true);
  const [showExpensesLine, setShowExpensesLine] = useState<boolean>(true);
  const [showProfitLine, setShowProfitLine] = useState<boolean>(true);

  // Vista de tabla de desglose diario
  const [showDataTable, setShowDataTable] = useState<boolean>(false);

  // Gastos cargados en tiempo real
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Suscripción en vivo a gastos
  useEffect(() => {
    const targetRestId = selectedBranchId === 'all' ? null : selectedBranchId;
    const unsubscribe = subscribeToExpenses(businessId, targetRestId, (list) => {
      setExpenses(list);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [businessId, selectedBranchId]);

  // Calcular rango efectivo de fechas [startDate, endDate]
  const dateRange = useMemo<{ start: Date; end: Date; startStr: string; endStr: string }>(() => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);

    if (timePreset === '7d') {
      start.setDate(now.getDate() - 6);
    } else if (timePreset === '14d') {
      start.setDate(now.getDate() - 13);
    } else if (timePreset === '30d') {
      start.setDate(now.getDate() - 29);
    } else if (timePreset === 'mes_actual') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (timePreset === 'mes_anterior') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (timePreset === 'custom') {
      if (customStartDate) {
        const [y, m, d] = customStartDate.split('-').map(Number);
        start = new Date(y, m - 1, d);
      }
      if (customEndDate) {
        const [y, m, d] = customEndDate.split('-').map(Number);
        end = new Date(y, m - 1, d);
      }
    }

    // Asegurar horas a 00:00:00 y 23:59:59
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const pad = (n: number) => String(n).padStart(2, '0');
    const startStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
    const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;

    return { start, end, startStr, endStr };
  }, [timePreset, customStartDate, customEndDate]);

  // Generar serie temporal completa día por día en el rango
  const trendData = useMemo<DailyTrendItem[]>(() => {
    const dayMap = new Map<string, {
      ventas: number;
      pedidos: number;
      gastos: number;
      gastosCount: number;
    }>();

    // 1. Inicializar todos los días del rango para que no queden huecos
    const current = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);

    while (current <= endDate) {
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateKey = `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`;
      dayMap.set(dateKey, { ventas: 0, pedidos: 0, gastos: 0, gastosCount: 0 });
      current.setDate(current.getDate() + 1);
    }

    // 2. Acumular ventas de órdenes cobradas
    orders.forEach(order => {
      if (order.estado !== 'cobrado') return;
      if (selectedBranchId !== 'all' && order.restaurantId !== selectedBranchId) return;

      const orderDateStr = (order.cobradoEn || order.creadoEn || '').split('T')[0];
      if (orderDateStr && dayMap.has(orderDateStr)) {
        const existing = dayMap.get(orderDateStr)!;
        existing.ventas += (order.total || 0);
        existing.pedidos += 1;
      }
    });

    // 3. Acumular gastos
    expenses.forEach(exp => {
      if (selectedBranchId !== 'all' && exp.restaurantId !== selectedBranchId) return;

      const expDateStr = (exp.fecha || exp.creadoEn || '').split('T')[0];
      if (expDateStr && dayMap.has(expDateStr)) {
        const existing = dayMap.get(expDateStr)!;
        existing.gastos += (exp.monto || 0);
        existing.gastosCount += 1;
      }
    });

    // 4. Formatear arreglo final con etiquetas en español
    const monthNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const dayNamesShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dayNamesFull = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const monthNamesFull = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const sortedKeys = Array.from(dayMap.keys()).sort();

    return sortedKeys.map(key => {
      const data = dayMap.get(key)!;
      const [y, m, d] = key.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);

      const diaSemana = dayNamesShort[dateObj.getDay()];
      const diaNum = dateObj.getDate();
      const mesCorto = monthNamesShort[dateObj.getMonth()];
      const label = `${diaNum} ${mesCorto}`;
      const fechaCompleta = `${dayNamesFull[dateObj.getDay()]}, ${diaNum} de ${monthNamesFull[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

      const ventas = Math.round(data.ventas * 100) / 100;
      const gastos = Math.round(data.gastos * 100) / 100;
      const ganancia = Math.round((ventas - gastos) * 100) / 100;
      const margen = ventas > 0 ? Math.round(((ventas - gastos) / ventas) * 1000) / 10 : 0;

      return {
        fecha: key,
        label,
        diaSemana,
        fechaCompleta,
        ventas,
        pedidos: data.pedidos,
        gastos,
        gastosCount: data.gastosCount,
        ganancia,
        margen
      };
    });
  }, [dateRange, orders, expenses, selectedBranchId]);

  // Resumen estadístico del rango
  const periodSummary = useMemo(() => {
    let totalVentas = 0;
    let totalGastos = 0;
    let totalPedidos = 0;
    let maxVenta = { monto: 0, fecha: '-' };
    let maxGasto = { monto: 0, fecha: '-' };

    trendData.forEach(d => {
      totalVentas += d.ventas;
      totalGastos += d.gastos;
      totalPedidos += d.pedidos;

      if (d.ventas > maxVenta.monto) {
        maxVenta = { monto: d.ventas, fecha: d.label };
      }
      if (d.gastos > maxGasto.monto) {
        maxGasto = { monto: d.gastos, fecha: d.label };
      }
    });

    const gananciaNeta = totalVentas - totalGastos;
    const margenGeneral = totalVentas > 0 ? (gananciaNeta / totalVentas) * 100 : 0;
    const diasTotal = trendData.length || 1;
    const promedioDiarioVentas = totalVentas / diasTotal;
    const promedioDiarioGastos = totalGastos / diasTotal;

    return {
      totalVentas,
      totalGastos,
      gananciaNeta,
      margenGeneral,
      totalPedidos,
      diasTotal,
      promedioDiarioVentas,
      promedioDiarioGastos,
      maxVenta,
      maxGasto
    };
  }, [trendData]);

  // Exportar a CSV / Excel de los datos filtrados
  const handleExportCSV = () => {
    sounds.playKeypadClick();
    const headers = ['Fecha', 'Dia', 'Ventas ($)', 'Comandas', 'Gastos ($)', 'Reg. Gastos', 'Ganancia Neta ($)', 'Margen (%)'];
    const rows = trendData.map(d => [
      d.fecha,
      d.diaSemana,
      d.ventas.toFixed(2),
      d.pedidos,
      d.gastos.toFixed(2),
      d.gastosCount,
      d.ganancia.toFixed(2),
      `${d.margen}%`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + 
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `tendencia_ventas_vs_gastos_${dateRange.startStr}_al_${dateRange.endStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Custom Tooltip para el LineChart de Recharts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataItem = payload[0]?.payload as DailyTrendItem;
      if (!dataItem) return null;

      const isProfit = dataItem.ganancia >= 0;

      return (
        <div className="bg-neutral-900/95 text-white p-4 rounded-2xl shadow-xl border border-neutral-700/80 backdrop-blur-md min-w-[240px] space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="border-b border-neutral-700 pb-2">
            <span className="text-xs font-black text-neutral-100 block">
              {dataItem.fechaCompleta}
            </span>
            <span className="text-[10px] text-neutral-400">
              {dataItem.pedidos} comandas • {dataItem.gastosCount} registros de gasto
            </span>
          </div>

          <div className="space-y-1.5 text-xs font-bold">
            {/* Ventas */}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-blue-400">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                Ventas Diarias:
              </span>
              <span className="font-mono text-neutral-100 font-black">
                ${dataItem.ventas.toFixed(2)}
              </span>
            </div>

            {/* Gastos */}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-rose-400">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                Gastos Operativos:
              </span>
              <span className="font-mono text-neutral-100 font-black">
                ${dataItem.gastos.toFixed(2)}
              </span>
            </div>

            {/* Ganancia Neta */}
            <div className="flex items-center justify-between pt-1 border-t border-neutral-700/70">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Ganancia Neta:
              </span>
              <span className={`font-mono font-black ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${dataItem.ganancia.toFixed(2)}
              </span>
            </div>

            {/* Margen */}
            <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-0.5">
              <span>Margen Operativo:</span>
              <span className={`font-mono font-bold ${isProfit ? 'text-emerald-300' : 'text-rose-300'}`}>
                {dataItem.margen.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Header & Filter Bar */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-neutral-200 shadow-xs space-y-4">
        
        {/* Title & Branch Selector */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-600 text-xs font-bold uppercase tracking-wider mb-1">
              <TrendingUp className="w-4 h-4" />
              <span>Análisis Comparativo & Tendencias</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
              Tendencia de Ventas Diarias vs Gastos
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Visualiza la evolución temporal de ingresos y egresos para detectar picos, días deficitarios y margen neto acumulado.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Branch Selector */}
            <div className="flex items-center gap-1.5 bg-neutral-50 p-1 rounded-2xl border border-neutral-200">
              <Store className="w-4 h-4 text-neutral-400 ml-2" />
              <select
                value={selectedBranchId}
                onChange={(e) => {
                  setSelectedBranchId(e.target.value);
                  sounds.playKeypadClick();
                }}
                className="bg-transparent text-xs font-bold text-neutral-800 pr-3 py-1.5 outline-hidden cursor-pointer"
              >
                <option value="all">🏢 Todas las Sucursales</option>
                {restaurants.map(r => (
                  <option key={r.id} value={r.id}>
                    📍 {r.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExportCSV}
              title="Exportar datos del gráfico a CSV"
              className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Exportar Datos</span>
            </button>
          </div>
        </div>

        {/* Time Presets & Custom Date Picker */}
        <div className="pt-3 border-t border-neutral-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: '7d', label: '7 Días' },
              { id: '14d', label: '14 Días' },
              { id: '30d', label: '30 Días' },
              { id: 'mes_actual', label: 'Este Mes' },
              { id: 'mes_anterior', label: 'Mes Anterior' },
              { id: 'custom', label: 'Personalizado' },
            ].map((preset) => {
              const isActive = timePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => {
                    setTimePreset(preset.id as TimePreset);
                    sounds.playKeypadClick();
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Selector de Rango Personalizado si está activo */}
          {timePreset === 'custom' && (
            <div className="flex items-center gap-2 bg-blue-50/60 p-1.5 rounded-2xl border border-blue-200 animate-in fade-in">
              <Calendar className="w-4 h-4 text-blue-600 ml-1.5 shrink-0" />
              <div className="flex items-center gap-1.5 text-xs">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-blue-200 bg-white text-xs font-bold text-neutral-800 outline-hidden"
                />
                <span className="text-neutral-400 font-bold">a</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-blue-200 bg-white text-xs font-bold text-neutral-800 outline-hidden"
                />
              </div>
            </div>
          )}

          {/* Serie Visibility Toggles */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowSalesLine(prev => !prev); sounds.playKeypadClick(); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                showSalesLine
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-neutral-50 text-neutral-400 border-neutral-200 opacity-60'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <span>Ventas</span>
            </button>

            <button
              onClick={() => { setShowExpensesLine(prev => !prev); sounds.playKeypadClick(); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                showExpensesLine
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-neutral-50 text-neutral-400 border-neutral-200 opacity-60'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
              <span>Gastos</span>
            </button>

            <button
              onClick={() => { setShowProfitLine(prev => !prev); sounds.playKeypadClick(); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                showProfitLine
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-neutral-50 text-neutral-400 border-neutral-200 opacity-60'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
              <span>Ganancia</span>
            </button>
          </div>

        </div>

      </div>

      {/* 2. Resumen de Métricas del Periodo Filtrado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Ventas Totales */}
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-bold uppercase">
            <span>Ventas en el Rango</span>
            <DollarSign className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-neutral-900 mt-1 font-mono">
            ${periodSummary.totalVentas.toFixed(2)}
          </div>
          <div className="text-[11px] text-neutral-400 mt-1">
            Promedio: <strong className="text-neutral-700 font-mono">${periodSummary.promedioDiarioVentas.toFixed(2)}/día</strong> ({periodSummary.totalPedidos} comandas)
          </div>
        </div>

        {/* Gastos Totales */}
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-bold uppercase">
            <span>Gastos Operativos</span>
            <Receipt className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-600 mt-1 font-mono">
            ${periodSummary.totalGastos.toFixed(2)}
          </div>
          <div className="text-[11px] text-neutral-400 mt-1">
            Promedio: <strong className="text-neutral-700 font-mono">${periodSummary.promedioDiarioGastos.toFixed(2)}/día</strong>
          </div>
        </div>

        {/* Ganancia Neta */}
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-bold uppercase">
            <span>Ganancia Neta</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className={`text-2xl font-black mt-1 font-mono ${
            periodSummary.gananciaNeta >= 0 ? 'text-emerald-600' : 'text-rose-600'
          }`}>
            ${periodSummary.gananciaNeta.toFixed(2)}
          </div>
          <div className="text-[11px] text-neutral-400 mt-1">
            Margen: <strong className={periodSummary.margenGeneral >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
              {periodSummary.margenGeneral.toFixed(1)}%
            </strong>
          </div>
        </div>

        {/* Pico Máximo de Ventas */}
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-bold uppercase">
            <span>Pico de Ventas</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-neutral-900 mt-1 font-mono">
            ${periodSummary.maxVenta.monto.toFixed(2)}
          </div>
          <div className="text-[11px] text-neutral-400 mt-1">
            Fecha pico: <strong className="text-neutral-700">{periodSummary.maxVenta.fecha}</strong>
          </div>
        </div>

      </div>

      {/* 3. Gráfico Principal Recharts */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-neutral-200 shadow-xs space-y-4">
        
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div>
            <h3 className="font-extrabold text-sm sm:text-base text-neutral-900">
              Curva de Tendencia Diaria ({trendData.length} días analizados)
            </h3>
            <span className="text-xs text-neutral-400">
              Del {dateRange.startStr} al {dateRange.endStr}
            </span>
          </div>

          <button
            onClick={() => {
              setShowDataTable(prev => !prev);
              sounds.playKeypadClick();
            }}
            className="px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <TableIcon className="w-3.5 h-3.5 text-neutral-500" />
            <span>{showDataTable ? 'Ocultar Tabla' : 'Ver Tabla de Datos'}</span>
          </button>
        </div>

        {/* Canvas del LineChart */}
        <div className="w-full h-80 sm:h-96">
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={trendData}
                margin={{ top: 15, right: 20, bottom: 20, left: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fill: '#64748B', fontSize: 11, fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  dy={6}
                />
                <YAxis 
                  tick={{ fill: '#64748B', fontSize: 11, fontWeight: 600 }}
                  tickFormatter={(val) => `$${val}`}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  dx={-4}
                />
                <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="3 3" />
                <Tooltip content={<CustomTooltip />} />
                <Legend 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: '12px', fontSize: '12px', fontWeight: 'bold' }}
                />

                {/* Línea de Ventas (Azul) */}
                {showSalesLine && (
                  <Line 
                    type="monotone" 
                    dataKey="ventas" 
                    name="Ventas Diarias" 
                    stroke="#2563EB" 
                    strokeWidth={3}
                    dot={{ r: 3.5, fill: '#FFFFFF', stroke: '#2563EB', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#2563EB', stroke: '#FFFFFF', strokeWidth: 2 }}
                  />
                )}

                {/* Línea de Gastos (Rojo) */}
                {showExpensesLine && (
                  <Line 
                    type="monotone" 
                    dataKey="gastos" 
                    name="Gastos Operativos" 
                    stroke="#EF4444" 
                    strokeWidth={3}
                    dot={{ r: 3.5, fill: '#FFFFFF', stroke: '#EF4444', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#EF4444', stroke: '#FFFFFF', strokeWidth: 2 }}
                  />
                )}

                {/* Línea de Ganancia Neta (Verde Esmeralda) */}
                {showProfitLine && (
                  <Line 
                    type="monotone" 
                    dataKey="ganancia" 
                    name="Ganancia Neta" 
                    stroke="#10B981" 
                    strokeWidth={2.5}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: '#10B981', stroke: '#FFFFFF', strokeWidth: 1.5 }}
                    activeDot={{ r: 5, fill: '#10B981', stroke: '#FFFFFF', strokeWidth: 2 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-neutral-400 text-sm font-semibold">
              No hay datos registrados para el rango de fechas seleccionado.
            </div>
          )}
        </div>

      </div>

      {/* 4. Tabla de Detalle Diario (Expandible) */}
      {showDataTable && (
        <div className="bg-white rounded-3xl border border-neutral-200 shadow-xs overflow-hidden animate-in fade-in">
          <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-neutral-900">
              Desglose Día por Día ({trendData.length} registros)
            </h3>
            <span className="text-xs text-neutral-500 font-medium">
              Orden cronológico
            </span>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase text-[10px] border-b border-neutral-200 sticky top-0">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Día</th>
                  <th className="p-3 text-right">Comandas</th>
                  <th className="p-3 text-right">Ventas ($)</th>
                  <th className="p-3 text-right">Gastos ($)</th>
                  <th className="p-3 text-right">Ganancia Neta ($)</th>
                  <th className="p-3 text-right">Margen (%)</th>
                  <th className="p-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-mono">
                {trendData.slice().reverse().map(row => {
                  const isProfit = row.ganancia >= 0;
                  return (
                    <tr key={row.fecha} className="hover:bg-neutral-50/50 transition">
                      <td className="p-3 font-bold text-neutral-900 font-sans">{row.fecha}</td>
                      <td className="p-3 text-neutral-600 font-sans">{row.diaSemana}</td>
                      <td className="p-3 text-right text-neutral-600">{row.pedidos}</td>
                      <td className="p-3 text-right font-black text-blue-600">${row.ventas.toFixed(2)}</td>
                      <td className="p-3 text-right font-black text-rose-600">${row.gastos.toFixed(2)}</td>
                      <td className={`p-3 text-right font-black ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                        ${row.ganancia.toFixed(2)}
                      </td>
                      <td className={`p-3 text-right font-bold ${isProfit ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {row.margen.toFixed(1)}%
                      </td>
                      <td className="p-3 text-center font-sans">
                        {row.ventas === 0 && row.gastos === 0 ? (
                          <span className="text-neutral-400 text-[10px]">Sin actividad</span>
                        ) : isProfit ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                            Superávit
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertCircle className="w-2.5 h-2.5 text-rose-600" />
                            Déficit
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
