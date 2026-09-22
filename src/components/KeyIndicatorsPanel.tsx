import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ReferenceLine,
  PieChart as RechartsPieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Award, 
  ChefHat, 
  Store, 
  Calendar, 
  ShoppingBag, 
  Zap, 
  CheckCircle2, 
  AlertTriangle, 
  Utensils, 
  Flame, 
  BarChart3, 
  PieChart as PieIcon,
  RefreshCw,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { Order, Restaurant, MenuItem, OrderRound } from '../types';
import { sounds } from '../utils/sound';
import { DailySalesExpensesTrendChart } from './DailySalesExpensesTrendChart';
import { DishCostProfitReport } from './DishCostProfitReport';

interface KeyIndicatorsPanelProps {
  orders: Order[];
  restaurants: Restaurant[];
  menuItems: MenuItem[];
  businessId?: string;
  defaultRestaurantId?: string;
  onEditDish?: (item: MenuItem) => void;
}

// Paleta de colores refinada y accesible para gráficos
const CATEGORY_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#64748b'];
const TIME_RANGE_COLORS = {
  rapido: '#10b981',    // < 10 min (Verde)
  normal: '#3b82f6',    // 10 - 15 min (Azul)
  alerta: '#f59e0b',    // 15 - 20 min (Ámbar)
  critico: '#ef4444'    // > 20 min (Rojo)
};

export const KeyIndicatorsPanel: React.FC<KeyIndicatorsPanelProps> = ({
  orders,
  restaurants,
  menuItems,
  businessId = 'central',
  defaultRestaurantId = 'all',
  onEditDish
}) => {
  // Vista activa dentro del Panel Unificado
  const [activeSubTab, setActiveSubTab] = useState<'operaciones' | 'tendencias' | 'costos'>('operaciones');

  // Filtros interactivos
  const [selectedBranchId, setSelectedBranchId] = useState<string>(defaultRestaurantId);
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | 'last7' | 'thisMonth'>('today');
  const [topDishesMetric, setTopDishesMetric] = useState<'quantity' | 'revenue'>('quantity');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fecha operativa de hoy y ayer (formato YYYY-MM-DD local)
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

  const handleRefresh = () => {
    sounds.playKeypadClick();
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // 1. Filtrar órdenes por sede y por rango de fechas seleccionado
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Filtro de restaurante
      if (selectedBranchId !== 'all' && order.restaurantId !== selectedBranchId) {
        return false;
      }

      // No contar rechazados
      if (order.estado === 'rechazado') {
        return false;
      }

      const orderDateStr = order.creadoEn ? order.creadoEn.split('T')[0] : '';

      if (dateRange === 'today') {
        return orderDateStr === todayStr;
      } else if (dateRange === 'yesterday') {
        return orderDateStr === yesterdayStr;
      } else if (dateRange === 'last7') {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
        return orderDateStr >= sevenDaysAgoStr && orderDateStr <= todayStr;
      } else if (dateRange === 'thisMonth') {
        const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM
        return orderDateStr.startsWith(currentMonthStr);
      }
      return true;
    });
  }, [orders, selectedBranchId, dateRange, todayStr, yesterdayStr]);

  // Órdenes de hoy específicamente (para comparar KPIs)
  const todayOrders = useMemo(() => {
    return orders.filter(o => {
      if (selectedBranchId !== 'all' && o.restaurantId !== selectedBranchId) return false;
      if (o.estado === 'rechazado') return false;
      const d = o.creadoEn ? o.creadoEn.split('T')[0] : '';
      return d === todayStr;
    });
  }, [orders, selectedBranchId, todayStr]);

  // Órdenes de ayer (para cálculo de variación porcentual)
  const yesterdayOrders = useMemo(() => {
    return orders.filter(o => {
      if (selectedBranchId !== 'all' && o.restaurantId !== selectedBranchId) return false;
      if (o.estado === 'rechazado') return false;
      const d = o.creadoEn ? o.creadoEn.split('T')[0] : '';
      return d === yesterdayStr;
    });
  }, [orders, selectedBranchId, yesterdayStr]);

  // 2. CÁLCULO DE KPIs PRINCIPALES
  const kpis = useMemo(() => {
    const totalSales = filteredOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const paidOrders = filteredOrders.filter(o => o.estado === 'cobrado');
    const totalOrdersCount = filteredOrders.length;
    const avgTicket = totalOrdersCount > 0 ? totalSales / totalOrdersCount : 0;

    // Ventas de ayer para comparación
    const yesterdaySales = yesterdayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const salesChangePercent = yesterdaySales > 0 
      ? ((totalSales - yesterdaySales) / yesterdaySales) * 100 
      : 0;

    // Cálculo exhaustivo de tiempos de preparación (en minutos)
    const prepTimes: number[] = [];

    filteredOrders.forEach(order => {
      // Si la orden tiene rondas explícitas
      if (order.rondas && order.rondas.length > 0) {
        order.rondas.forEach((round: OrderRound) => {
          if (round.listoEn && (round.aceptadoEn || round.enviadoEn)) {
            const start = new Date(round.aceptadoEn || round.enviadoEn).getTime();
            const end = new Date(round.listoEn).getTime();
            const diffMin = (end - start) / (1000 * 60);
            if (diffMin > 0.5 && diffMin < 180) {
              prepTimes.push(diffMin);
            }
          }
        });
      } else if (order.listoEn && (order.aceptadoEn || order.creadoEn)) {
        // Orden directa o legacy
        const start = new Date(order.aceptadoEn || order.creadoEn).getTime();
        const end = new Date(order.listoEn).getTime();
        const diffMin = (end - start) / (1000 * 60);
        if (diffMin > 0.5 && diffMin < 180) {
          prepTimes.push(diffMin);
        }
      }
    });

    const avgPrepMinutes = prepTimes.length > 0 
      ? prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length 
      : 0;

    const onTimeOrdersCount = prepTimes.filter(t => t <= 15).length;
    const kitchenEfficiency = prepTimes.length > 0 
      ? (onTimeOrdersCount / prepTimes.length) * 100 
      : 100;

    // Conteo de platos vendidos
    const dishMap: Record<string, { name: string; quantity: number; revenue: number; category: string }> = {};
    filteredOrders.forEach(order => {
      (order.items || []).forEach(it => {
        const key = it.nombre || 'Plato';
        if (!dishMap[key]) {
          dishMap[key] = {
            name: key,
            quantity: 0,
            revenue: 0,
            category: it.requiereCocina === false ? 'Bebidas/Bar' : 'Cocina'
          };
        }
        const cant = Number(it.cantidad) || 1;
        const sub = Number(it.precio || 0) * cant;
        dishMap[key].quantity += cant;
        dishMap[key].revenue += sub;
      });
    });

    const dishList = Object.values(dishMap).sort((a, b) => b.quantity - a.quantity);
    const topDish = dishList.length > 0 ? dishList[0] : null;

    return {
      totalSales,
      totalOrdersCount,
      paidOrdersCount: paidOrders.length,
      avgTicket,
      salesChangePercent,
      avgPrepMinutes,
      prepTimesCount: prepTimes.length,
      kitchenEfficiency,
      topDish,
      dishList
    };
  }, [filteredOrders, yesterdayOrders]);

  // 3. DATOS DE VENTAS POR HORA (Para el gráfico interactivo de Ventas del Día)
  const hourlySalesData = useMemo(() => {
    // Si es vista de 1 día (today o yesterday), agrupamos de 08:00 a 23:00
    if (dateRange === 'today' || dateRange === 'yesterday') {
      const hoursMap: Record<number, { horaLabel: string; horaNum: number; ventas: number; pedidos: number }> = {};
      
      // Inicializar franjas horarias principales del restaurante (8am a 23pm)
      for (let h = 8; h <= 23; h++) {
        hoursMap[h] = {
          horaLabel: `${h}:00`,
          horaNum: h,
          ventas: 0,
          pedidos: 0
        };
      }

      filteredOrders.forEach(order => {
        if (!order.creadoEn) return;
        const d = new Date(order.creadoEn);
        const h = d.getHours();
        if (hoursMap[h]) {
          hoursMap[h].ventas += Number(order.total) || 0;
          hoursMap[h].pedidos += 1;
        } else if (h < 8 && hoursMap[8]) {
          // Madrugada antes de 8am agrupar en primer bloque
          hoursMap[8].ventas += Number(order.total) || 0;
          hoursMap[8].pedidos += 1;
        }
      });

      return Object.values(hoursMap).map(item => ({
        ...item,
        ventas: Math.round(item.ventas * 100) / 100,
        ticketPromedio: item.pedidos > 0 ? Math.round((item.ventas / item.pedidos) * 100) / 100 : 0
      }));
    } else {
      // Para rangos de varios días (last7 o thisMonth), agrupar por fecha
      const daysMap: Record<string, { fecha: string; label: string; ventas: number; pedidos: number }> = {};

      filteredOrders.forEach(order => {
        const dStr = order.creadoEn ? order.creadoEn.split('T')[0] : todayStr;
        if (!daysMap[dStr]) {
          const parts = dStr.split('-');
          const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dStr;
          daysMap[dStr] = { fecha: dStr, label, ventas: 0, pedidos: 0 };
        }
        daysMap[dStr].ventas += Number(order.total) || 0;
        daysMap[dStr].pedidos += 1;
      });

      return Object.values(daysMap)
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map(item => ({
          ...item,
          horaLabel: item.label,
          ventas: Math.round(item.ventas * 100) / 100,
          ticketPromedio: item.pedidos > 0 ? Math.round((item.ventas / item.pedidos) * 100) / 100 : 0
        }));
    }
  }, [filteredOrders, dateRange, todayStr]);

  // 4. DATOS DE PLATOS MÁS VENDIDOS (Top 8 platos con Recharts BarChart)
  const topDishesChartData = useMemo(() => {
    const list = [...kpis.dishList];
    if (topDishesMetric === 'quantity') {
      list.sort((a, b) => b.quantity - a.quantity);
    } else {
      list.sort((a, b) => b.revenue - a.revenue);
    }

    return list.slice(0, 8).map(d => ({
      name: d.name.length > 18 ? d.name.substring(0, 16) + '...' : d.name,
      fullName: d.name,
      cantidad: d.quantity,
      ingresos: Math.round(d.revenue * 100) / 100,
      categoria: d.category
    }));
  }, [kpis.dishList, topDishesMetric]);

  // 5. DATOS DE TIEMPO PROMEDIO DE PREPARACIÓN DE COCINA
  const prepTimeDistributionData = useMemo(() => {
    let rapido = 0;   // <= 10 min
    let normal = 0;   // 11 - 15 min
    let alerta = 0;   // 16 - 20 min
    let critico = 0;  // > 20 min

    filteredOrders.forEach(order => {
      const inspectItem = (startIso?: string, endIso?: string) => {
        if (startIso && endIso) {
          const diff = (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60);
          if (diff > 0.5 && diff < 180) {
            if (diff <= 10) rapido++;
            else if (diff <= 15) normal++;
            else if (diff <= 20) alerta++;
            else critico++;
          }
        }
      };

      if (order.rondas && order.rondas.length > 0) {
        order.rondas.forEach((r: OrderRound) => {
          inspectItem(r.aceptadoEn || r.enviadoEn, r.listoEn);
        });
      } else {
        inspectItem(order.aceptadoEn || order.creadoEn, order.listoEn);
      }
    });

    const total = rapido + normal + alerta + critico;

    return [
      { 
        rango: 'Rápido (≤10 min)', 
        cantidad: rapido, 
        porcentaje: total > 0 ? Math.round((rapido / total) * 100) : 0,
        fill: TIME_RANGE_COLORS.rapido,
        estado: 'Excelente'
      },
      { 
        rango: 'Estándar (11-15 min)', 
        cantidad: normal, 
        porcentaje: total > 0 ? Math.round((normal / total) * 100) : 0,
        fill: TIME_RANGE_COLORS.normal,
        estado: 'Óptimo'
      },
      { 
        rango: 'Atención (16-20 min)', 
        cantidad: alerta, 
        porcentaje: total > 0 ? Math.round((alerta / total) * 100) : 0,
        fill: TIME_RANGE_COLORS.alerta,
        estado: 'Demorado'
      },
      { 
        rango: 'Crítico (>20 min)', 
        cantidad: critico, 
        porcentaje: total > 0 ? Math.round((critico / total) * 100) : 0,
        fill: TIME_RANGE_COLORS.critico,
        estado: 'Exceso'
      }
    ];
  }, [filteredOrders]);

  // 6. TIEMPO PROMEDIO DE COCINA POR HORA DEL DÍA
  const prepTimeByHourData = useMemo(() => {
    const hours: Record<number, { count: number; totalMinutes: number }> = {};
    for (let h = 9; h <= 23; h++) {
      hours[h] = { count: 0, totalMinutes: 0 };
    }

    filteredOrders.forEach(order => {
      const inspectItem = (startIso?: string, endIso?: string) => {
        if (startIso && endIso) {
          const startDate = new Date(startIso);
          const h = startDate.getHours();
          const diff = (new Date(endIso).getTime() - startDate.getTime()) / (1000 * 60);
          if (diff > 0.5 && diff < 180 && hours[h]) {
            hours[h].count += 1;
            hours[h].totalMinutes += diff;
          }
        }
      };

      if (order.rondas && order.rondas.length > 0) {
        order.rondas.forEach((r: OrderRound) => {
          inspectItem(r.aceptadoEn || r.enviadoEn, r.listoEn);
        });
      } else {
        inspectItem(order.aceptadoEn || order.creadoEn, order.listoEn);
      }
    });

    return Object.entries(hours).map(([hStr, val]) => {
      const h = Number(hStr);
      const avg = val.count > 0 ? Math.round((val.totalMinutes / val.count) * 10) / 10 : 0;
      return {
        hora: `${h}:00`,
        minutosPromedio: avg,
        comandas: val.count,
        objetivo: 15 // Meta de 15 minutos en cocina
      };
    });
  }, [filteredOrders]);

  // 7. DISTRIBUCIÓN POR CANAL / TIPO DE COMANDA (Salón vs Delivery vs Express)
  const channelDistributionData = useMemo(() => {
    let local = 0;
    let delivery = 0;
    let express = 0;

    filteredOrders.forEach(o => {
      const val = Number(o.total) || 0;
      if (o.ruta === 'express' || o.esVentaExpress) {
        express += val;
      } else if (o.tipo === 'delivery') {
        delivery += val;
      } else {
        local += val;
      }
    });

    const total = local + delivery + express;
    if (total === 0) {
      return [
        { name: 'Salón', value: 1, monto: 0, fill: '#f97316' },
        { name: 'Delivery', value: 0, monto: 0, fill: '#3b82f6' },
        { name: 'Express', value: 0, monto: 0, fill: '#10b981' }
      ];
    }

    return [
      { name: 'Salón (Mesas)', value: Math.round((local / total) * 100), monto: local, fill: '#f97316' },
      { name: 'Delivery', value: Math.round((delivery / total) * 100), monto: delivery, fill: '#3b82f6' },
      { name: 'Venta Express', value: Math.round((express / total) * 100), monto: express, fill: '#10b981' }
    ].filter(item => item.monto > 0);
  }, [filteredOrders]);

  return (
    <div id="key-indicators-panel-section" className="space-y-6 animate-in fade-in duration-200">
      
      {/* Cabecera del Panel Unificado de Indicadores */}
      <div className="bg-white rounded-3xl border border-neutral-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-lg sm:text-xl text-neutral-900 tracking-tight flex items-center gap-2">
                Panel Unificado de Indicadores
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 font-bold border border-orange-200">
                  Global
                </span>
              </h2>
              <p className="text-xs text-neutral-500">
                Métricas integradas de ventas, operaciones, tendencias de ingresos vs gastos y rentabilidad por plato
              </p>
            </div>
          </div>
        </div>

        {/* Sub-Tabs de Navegación del Panel Unificado */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-neutral-100 rounded-2xl border border-neutral-200">
          {[
            { id: 'operaciones', label: 'Operaciones & Ventas', icon: BarChart3 },
            { id: 'tendencias', label: 'Tendencias (Ventas vs Gastos)', icon: TrendingUp },
            { id: 'costos', label: 'Costos & Rentabilidad', icon: PieIcon }
          ].map(sub => {
            const Icon = sub.icon;
            const isActive = activeSubTab === sub.id;
            return (
              <button
                key={sub.id}
                id={`indicators-subtab-${sub.id}`}
                type="button"
                onClick={() => {
                  sounds.playKeypadClick();
                  setActiveSubTab(sub.id as any);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                  isActive 
                    ? 'bg-orange-600 text-white shadow-xs' 
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{sub.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* VISTA 1: Operaciones & Ventas en Vivo */}
      {activeSubTab === 'operaciones' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Filtros de Sede y Periodo para Operaciones */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-neutral-500">Filtrar Sede:</span>
              <div className="flex items-center gap-1.5 bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-200">
                <Store className="w-3.5 h-3.5 text-neutral-500" />
                <select
                  id="indicators-branch-filter"
                  value={selectedBranchId}
                  onChange={(e) => {
                    sounds.playKeypadClick();
                    setSelectedBranchId(e.target.value);
                  }}
                  className="bg-transparent text-xs font-bold text-neutral-700 outline-none cursor-pointer"
                >
                  <option value="all">Todas las Sedes ({restaurants.length})</option>
                  {restaurants.map(r => (
                    <option key={r.id} value={r.id}>{r.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selector de Rango de Fecha */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl border border-neutral-200 text-xs">
                {[
                  { id: 'today', label: 'Hoy' },
                  { id: 'yesterday', label: 'Ayer' },
                  { id: 'last7', label: '7 Días' },
                  { id: 'thisMonth', label: 'Mes' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    id={`indicators-date-tab-${tab.id}`}
                    type="button"
                    onClick={() => {
                      sounds.playKeypadClick();
                      setDateRange(tab.id as any);
                    }}
                    className={`px-3 py-1 rounded-lg font-bold transition ${
                      dateRange === tab.id
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Botón Refrescar */}
              <button
                id="indicators-refresh-btn"
                type="button"
                onClick={handleRefresh}
                title="Refrescar métricas"
                className="w-9 h-9 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center transition active:scale-95"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-orange-600' : ''}`} />
              </button>
            </div>
          </div>

      {/* FILA 1: TARJETAS KPI RESUMEN */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: Ventas del Día */}
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs relative overflow-hidden group">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-bold uppercase tracking-wider">
            <span>Ventas del Periodo</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-neutral-900 mt-2 font-mono tracking-tight">
            ${kpis.totalSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 pt-2 border-t border-neutral-100 flex items-center justify-between text-xs">
            <span className="text-neutral-500">{kpis.totalOrdersCount} comandas ({kpis.paidOrdersCount} cobradas)</span>
            {kpis.salesChangePercent !== 0 && (
              <span className={`inline-flex items-center font-bold text-[11px] ${
                kpis.salesChangePercent >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {kpis.salesChangePercent >= 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                {kpis.salesChangePercent >= 0 ? '+' : ''}{kpis.salesChangePercent.toFixed(1)}% vs ayer
              </span>
            )}
          </div>
        </div>

        {/* KPI 2: Ticket Promedio */}
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-bold uppercase tracking-wider">
            <span>Ticket Promedio</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-neutral-900 mt-2 font-mono tracking-tight">
            ${kpis.avgTicket.toFixed(2)}
          </div>
          <div className="mt-2 pt-2 border-t border-neutral-100 text-xs text-neutral-500 flex items-center justify-between">
            <span>Consumo medio / mesa</span>
            <span className="font-bold text-neutral-700 font-mono">
              {kpis.totalOrdersCount > 0 ? (kpis.totalSales / kpis.totalOrdersCount).toFixed(2) : '$0.00'}
            </span>
          </div>
        </div>

        {/* KPI 3: Plato Más Vendido */}
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-bold uppercase tracking-wider">
            <span>Plato Estrella</span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg font-black text-neutral-900 truncate leading-tight" title={kpis.topDish?.name || 'Sin ventas'}>
              {kpis.topDish ? kpis.topDish.name : 'Sin pedidos aún'}
            </div>
            <div className="text-xs text-orange-600 font-bold mt-1 flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-orange-500" />
              <span>{kpis.topDish ? `${kpis.topDish.quantity} platos vendidos` : 'Esperando comandas'}</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-neutral-100 text-xs text-neutral-500 flex items-center justify-between">
            <span>Ingresos generados:</span>
            <span className="font-bold text-neutral-900 font-mono">
              {kpis.topDish ? `$${kpis.topDish.revenue.toFixed(2)}` : '$0.00'}
            </span>
          </div>
        </div>

        {/* KPI 4: Tiempo Promedio de Preparación en Cocina */}
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 text-xs font-bold uppercase tracking-wider">
            <span>Tiempo Medio Cocina</span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              kpis.avgPrepMinutes === 0 ? 'bg-neutral-100 text-neutral-500' :
              kpis.avgPrepMinutes <= 15 ? 'bg-emerald-50 text-emerald-600' : 
              kpis.avgPrepMinutes <= 20 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
            }`}>
              <ChefHat className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-neutral-900 mt-2 font-mono tracking-tight flex items-baseline gap-1.5">
            <span>{kpis.avgPrepMinutes > 0 ? kpis.avgPrepMinutes.toFixed(1) : '--'}</span>
            <span className="text-xs font-bold text-neutral-500">min</span>
          </div>
          <div className="mt-2 pt-2 border-t border-neutral-100 flex items-center justify-between text-xs">
            <span className="text-neutral-500">Meta: ≤ 15 min</span>
            <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
              kpis.avgPrepMinutes === 0 ? 'bg-neutral-100 text-neutral-600' :
              kpis.avgPrepMinutes <= 15 ? 'bg-emerald-100 text-emerald-800' :
              kpis.avgPrepMinutes <= 20 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
            }`}>
              {kpis.avgPrepMinutes === 0 ? 'Sin registros' :
               kpis.avgPrepMinutes <= 15 ? 'Óptimo' :
               kpis.avgPrepMinutes <= 20 ? 'Atención' : 'Demorado'}
            </span>
          </div>
        </div>

      </div>

      {/* FILA 2: GRÁFICOS PRINCIPALES DE RECHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* GRÁFICO 1: Ventas por Hora / Tendencia del Día (2 Columnas) */}
        <div className="lg:col-span-2 bg-white p-5 sm:p-6 rounded-3xl border border-neutral-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-neutral-100">
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-neutral-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span>{dateRange === 'today' ? 'Curva de Ventas de Hoy (Por Franja Horaria)' : 'Tendencia de Ventas del Periodo'}</span>
              </h3>
              <p className="text-xs text-neutral-400">
                Monto recaudado y número de pedidos atendidos en cada horario
              </p>
            </div>
            <div className="text-xs text-neutral-500 font-semibold bg-neutral-50 px-3 py-1 rounded-xl border border-neutral-200">
              Total: <strong className="text-neutral-900 font-mono">${kpis.totalSales.toFixed(2)}</strong>
            </div>
          </div>

          {/* Recharts Area Chart */}
          <div className="w-full h-72">
            {hourlySalesData.length > 0 && hourlySalesData.some(d => d.ventas > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlySalesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis 
                    dataKey="horaLabel" 
                    tick={{ fontSize: 11, fill: '#64748b' }} 
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: '#64748b' }} 
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      borderRadius: '12px', 
                      border: 'none', 
                      color: '#ffffff',
                      fontSize: '12px',
                      padding: '10px 14px'
                    }}
                    formatter={(val: any, name: any) => {
                      if (name === 'ventas') return [`$${Number(val).toFixed(2)}`, 'Ventas Totales'];
                      if (name === 'pedidos') return [val, 'Comandas Atendidas'];
                      return [val, name];
                    }}
                    labelFormatter={(label) => `Horario: ${label}`}
                  />
                  <Legend 
                    verticalAlign="top" 
                    align="right" 
                    iconType="circle"
                    formatter={(value) => value === 'ventas' ? 'Ventas ($)' : 'Comandas'}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="ventas" 
                    stroke="#f97316" 
                    strokeWidth={2.5}
                    fillOpacity={1} 
                    fill="url(#salesGradient)" 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="pedidos" 
                    stroke="#3b82f6" 
                    strokeWidth={1.5} 
                    strokeDasharray="4 4"
                    fillOpacity={1} 
                    fill="url(#ordersGradient)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400 text-xs bg-neutral-50/50 rounded-2xl border border-dashed border-neutral-200">
                <Utensils className="w-8 h-8 text-neutral-300 mb-2" />
                <span>No hay ventas registradas en el periodo seleccionado</span>
              </div>
            )}
          </div>
        </div>

        {/* GRÁFICO 2: Distribución por Canal de Venta (Salón vs Delivery vs Express) */}
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-neutral-200 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="pb-2 border-b border-neutral-100">
            <h3 className="font-extrabold text-sm sm:text-base text-neutral-900 flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-orange-500" />
              <span>Canales de Venta</span>
            </h3>
            <p className="text-xs text-neutral-400">
              Distribución porcentual de los ingresos por tipo de comanda
            </p>
          </div>

          <div className="w-full h-48 flex items-center justify-center">
            {channelDistributionData.length > 0 && channelDistributionData.some(d => d.monto > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={channelDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {channelDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      borderRadius: '12px', 
                      border: 'none', 
                      color: '#ffffff',
                      fontSize: '12px',
                      padding: '8px 12px'
                    }}
                    formatter={(val: any, name: any, item: any) => [
                      `${val}% ($${(item.payload.monto || 0).toFixed(2)})`, 
                      item.payload.name
                    ]}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-neutral-400 text-xs text-center">
                Sin pedidos en este periodo
              </div>
            )}
          </div>

          {/* Leyenda y Totales por Canal */}
          <div className="space-y-2 pt-2 border-t border-neutral-100">
            {channelDistributionData.map(ch => (
              <div key={ch.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ch.fill }}></span>
                  <span className="font-bold text-neutral-700">{ch.name}</span>
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <span className="font-black text-neutral-900">${(ch.monto || 0).toFixed(2)}</span>
                  <span className="text-[11px] text-neutral-400">({ch.value}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* FILA 3: PLATOS MÁS VENDIDOS & TIEMPOS DE PREPARACIÓN DE COCINA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* SECCIÓN: Platos Más Vendidos con Recharts BarChart */}
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-neutral-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-neutral-100">
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-neutral-900 flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-600" />
                <span>Platos Más Vendidos (Top Demandados)</span>
              </h3>
              <p className="text-xs text-neutral-400">
                Productos con mayor rotación e impacto en facturación
              </p>
            </div>
            
            {/* Toggle: Por Cantidad vs Por Ingresos */}
            <div className="flex items-center bg-neutral-100 p-1 rounded-xl text-xs font-bold border border-neutral-200">
              <button
                type="button"
                onClick={() => setTopDishesMetric('quantity')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  topDishesMetric === 'quantity' ? 'bg-white text-orange-600 shadow-xs' : 'text-neutral-600'
                }`}
              >
                Por Cantidad
              </button>
              <button
                type="button"
                onClick={() => setTopDishesMetric('revenue')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  topDishesMetric === 'revenue' ? 'bg-white text-orange-600 shadow-xs' : 'text-neutral-600'
                }`}
              >
                Por Ingresos ($)
              </button>
            </div>
          </div>

          {/* Gráfico de Barras con Recharts */}
          <div className="w-full h-72">
            {topDishesChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={topDishesChartData}
                  margin={{ top: 10, right: 30, left: 20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis 
                    type="number" 
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                    tickFormatter={(v) => topDishesMetric === 'quantity' ? `${v}` : `$${v}`}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                    width={110}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      borderRadius: '12px', 
                      border: 'none', 
                      color: '#ffffff',
                      fontSize: '12px',
                      padding: '10px 14px'
                    }}
                    formatter={(val: any, name: any, item: any) => {
                      return [
                        topDishesMetric === 'quantity'
                          ? `${val} unidades vendidas ($${item.payload.ingresos.toFixed(2)})`
                          : `$${Number(val).toFixed(2)} (${item.payload.cantidad} unidades)`,
                        item.payload.fullName
                      ];
                    }}
                  />
                  <Bar 
                    dataKey={topDishesMetric === 'quantity' ? 'cantidad' : 'ingresos'} 
                    radius={[0, 8, 8, 0]}
                  >
                    {topDishesChartData.map((_, index) => (
                      <Cell key={`dish-bar-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400 text-xs bg-neutral-50/50 rounded-2xl border border-dashed border-neutral-200">
                <Utensils className="w-8 h-8 text-neutral-300 mb-2" />
                <span>No se encontraron platos vendidos en este periodo</span>
              </div>
            )}
          </div>

          {/* Tabla Resumen de los Top 5 Platos */}
          {topDishesChartData.length > 0 && (
            <div className="pt-2 border-t border-neutral-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {topDishesChartData.slice(0, 4).map((d, idx) => (
                  <div key={d.fullName} className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-orange-100 text-orange-700 font-black text-[10px] flex items-center justify-center shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="font-bold text-neutral-800 truncate" title={d.fullName}>{d.fullName}</span>
                    </div>
                    <div className="text-right shrink-0 ml-2 font-mono">
                      <span className="font-bold text-neutral-900">{d.cantidad} un.</span>
                      <span className="text-[11px] text-neutral-500 block">${d.ingresos.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* SECCIÓN: Tiempo Promedio de Preparación en Cocina */}
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-neutral-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-neutral-100">
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-neutral-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Tiempo Promedio de Preparación (KDS)</span>
              </h3>
              <p className="text-xs text-neutral-400">
                Velocidad de despacho de comandas y cumplimiento de tiempos meta
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
              <ChefHat className="w-3.5 h-3.5" />
              <span>Promedio: {kpis.avgPrepMinutes > 0 ? `${kpis.avgPrepMinutes.toFixed(1)} min` : 'N/D'}</span>
            </div>
          </div>

          {/* Gráfico de Barras con Distribución de Tiempos de Cocina */}
          <div className="w-full h-56">
            {kpis.prepTimesCount > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={prepTimeDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis 
                    dataKey="rango" 
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      borderRadius: '12px', 
                      border: 'none', 
                      color: '#ffffff',
                      fontSize: '12px',
                      padding: '10px 14px'
                    }}
                    formatter={(val: any, _: any, item: any) => [
                      `${val} comandas (${item.payload.porcentaje}%)`, 
                      `Rango: ${item.payload.rango}`
                    ]}
                  />
                  <Bar dataKey="cantidad" radius={[8, 8, 0, 0]}>
                    {prepTimeDistributionData.map((entry, index) => (
                      <Cell key={`prep-cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400 text-xs bg-neutral-50/50 rounded-2xl border border-dashed border-neutral-200">
                <Clock className="w-8 h-8 text-neutral-300 mb-2" />
                <span>No hay comandas finalizadas en este periodo para calcular tiempos</span>
              </div>
            )}
          </div>

          {/* Indicadores de Eficiencia de Cocina */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-neutral-100">
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
              <span className="text-[11px] text-emerald-800 font-bold block">A Tiempo (≤ 15 min)</span>
              <span className="text-lg font-black text-emerald-900 font-mono">
                {kpis.kitchenEfficiency.toFixed(0)}%
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-center">
              <span className="text-[11px] text-blue-800 font-bold block">Comandas Medidas</span>
              <span className="text-lg font-black text-blue-900 font-mono">
                {kpis.prepTimesCount}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-neutral-50 border border-neutral-200 text-center col-span-2 sm:col-span-1">
              <span className="text-[11px] text-neutral-600 font-bold block">Meta de Servicio</span>
              <span className="text-lg font-black text-neutral-900 font-mono">
                15 min
              </span>
            </div>
          </div>
        </div>

      </div>
        </div>
      )}

      {/* VISTA 2: Tendencias Históricas (Ventas vs Gastos) */}
      {activeSubTab === 'tendencias' && (
        <div className="animate-in fade-in">
          <DailySalesExpensesTrendChart 
            orders={orders}
            restaurants={restaurants}
            businessId={businessId}
            defaultRestaurantId={selectedBranchId}
          />
        </div>
      )}

      {/* VISTA 3: Costos y Rentabilidad por Plato */}
      {activeSubTab === 'costos' && (
        <div className="animate-in fade-in">
          <DishCostProfitReport 
            menuItems={menuItems}
            orders={orders}
            restaurants={restaurants}
            onEditDish={onEditDish}
          />
        </div>
      )}

    </div>
  );
};
