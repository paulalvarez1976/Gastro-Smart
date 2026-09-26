import React, { useState, useMemo, useEffect } from 'react';
import { 
  History, 
  Search, 
  Filter, 
  Calendar, 
  Store, 
  CreditCard, 
  Banknote, 
  Smartphone, 
  ArrowRightLeft, 
  FileSpreadsheet, 
  Printer, 
  Clock, 
  User, 
  Users, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ChefHat, 
  ShoppingBag, 
  Truck, 
  Receipt, 
  Eye, 
  Share2, 
  ChevronRight, 
  X, 
  Percent, 
  DollarSign, 
  RefreshCw,
  TrendingUp,
  MapPin,
  Utensils
} from 'lucide-react';
import { Order, Restaurant, Employee, OrderItem, PartialPayment } from '../types';
import { sounds } from '../utils/sound';
import { fetchHistoricalOrders } from '../services/dataService';
import { ThermalReceiptModal } from './ThermalReceiptModal';
import { getOrderTaxBreakdown } from '../utils/taxCalculator';

interface OrderHistoryAdminViewProps {
  restaurants: Restaurant[];
  employees: Employee[];
  initialOrders: Order[];
  businessId?: string;
}

type DateRangePreset = 'hoy' | 'ayer' | 'ultimos_7_dias' | 'este_mes' | 'mes_anterior' | 'todo' | 'personalizado';

export const OrderHistoryAdminView: React.FC<OrderHistoryAdminViewProps> = ({
  restaurants,
  employees,
  initialOrders,
  businessId
}) => {
  // Filters State
  const [datePreset, setDatePreset] = useState<DateRangePreset>('ultimos_7_dias');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedOrderType, setSelectedOrderType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<'fecha_desc' | 'fecha_asc' | 'total_desc' | 'total_asc'>('fecha_desc');

  // Dynamic Orders State (combines initial realtime orders with full historical queries)
  const [ordersList, setOrdersList] = useState<Order[]>(initialOrders);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Traceability & Detail Modal
  const [inspectingOrder, setInspectingOrder] = useState<Order | null>(null);

  // Thermal Receipt Modal
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  // Sync initialOrders if updated in real-time
  useEffect(() => {
    if (initialOrders && initialOrders.length > 0) {
      setOrdersList(prev => {
        const map = new Map<string, Order>();
        prev.forEach(o => map.set(o.id, o));
        initialOrders.forEach(o => map.set(o.id, o));
        return Array.from(map.values()).sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());
      });
    }
  }, [initialOrders]);

  // Handle Date Preset Changes
  const handleDatePresetChange = (preset: DateRangePreset) => {
    setDatePreset(preset);
    sounds.playKeypadClick();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'hoy') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'ayer') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === 'ultimos_7_dias') {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      setStartDate(d.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (preset === 'este_mes') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (preset === 'mes_anterior') {
      const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      setStartDate(firstDayLastMonth.toISOString().split('T')[0]);
      setEndDate(lastDayLastMonth.toISOString().split('T')[0]);
    } else if (preset === 'todo') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Fetch full historical data if user requests a broader date range or refreshes
  const handleFetchFullHistorical = async () => {
    setIsLoadingHistory(true);
    sounds.playKeypadClick();
    try {
      const fetched = await fetchHistoricalOrders({
        businessId,
        restaurantId: selectedBranchId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        paymentMethod: selectedPaymentMethod,
        status: selectedStatus,
        maxLimit: 500
      });

      if (fetched.length > 0) {
        setOrdersList(prev => {
          const map = new Map<string, Order>();
          prev.forEach(o => map.set(o.id, o));
          fetched.forEach(o => map.set(o.id, o));
          return Array.from(map.values()).sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());
        });
      }
    } catch (err) {
      console.error('Error fetching historical orders in view:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Filter and Sort Orders
  const filteredOrders = useMemo(() => {
    return ordersList.filter(order => {
      // 1. Date Range
      if (startDate || endDate) {
        const orderDate = (order.creadoEn || '').split('T')[0];
        if (startDate && orderDate < startDate) return false;
        if (endDate && orderDate > endDate) return false;
      }

      // 2. Branch / Restaurant
      if (selectedBranchId !== 'all' && order.restaurantId !== selectedBranchId) {
        return false;
      }

      // 3. Payment Method
      if (selectedPaymentMethod !== 'all') {
        if (selectedPaymentMethod === 'mixto') {
          const hasMultiple = order.cobros && order.cobros.length > 1;
          if (!hasMultiple) return false;
        } else {
          const mainMethodMatch = order.metodoPago === selectedPaymentMethod;
          const cobroMatch = order.cobros?.some(c => c.metodoPago === selectedPaymentMethod);
          if (!mainMethodMatch && !cobroMatch) return false;
        }
      }

      // 4. Status
      if (selectedStatus !== 'all') {
        if (selectedStatus === 'cobrado') {
          if (order.estado !== 'cobrado' && order.estadoPago !== 'cobrado') return false;
        } else if (selectedStatus === 'en_curso') {
          if (order.estado === 'cobrado' || order.estado === 'rechazado') return false;
        } else if (order.estado !== selectedStatus && order.estadoPago !== selectedStatus) {
          return false;
        }
      }

      // 5. Order Type (Mesa, Takeout, Delivery)
      if (selectedOrderType !== 'all') {
        if (order.tipo !== selectedOrderType) return false;
      }

      // 6. Search Term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const idMatch = order.id.toLowerCase().includes(q);
        const clientMatch = order.clienteNombre?.toLowerCase().includes(q);
        const waiterMatch = order.meseroNombre?.toLowerCase().includes(q);
        const cashierMatch = order.cajeroNombre?.toLowerCase().includes(q);
        const tableMatch = order.mesaNumero?.toString() === q || `mesa ${order.mesaNumero}`.toLowerCase().includes(q);
        const itemMatch = order.items.some(i => i.nombre.toLowerCase().includes(q));
        const deliveryMatch = order.empresaDelivery?.toLowerCase().includes(q);

        if (!idMatch && !clientMatch && !waiterMatch && !cashierMatch && !tableMatch && !itemMatch && !deliveryMatch) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'fecha_desc') {
        return new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime();
      } else if (sortBy === 'fecha_asc') {
        return new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime();
      } else if (sortBy === 'total_desc') {
        return (b.total || 0) - (a.total || 0);
      } else if (sortBy === 'total_asc') {
        return (a.total || 0) - (b.total || 0);
      }
      return 0;
    });
  }, [ordersList, startDate, endDate, selectedBranchId, selectedPaymentMethod, selectedStatus, selectedOrderType, searchTerm, sortBy]);

  // Aggregate Metrics & KPI Calculations
  const metrics = useMemo(() => {
    let totalSales = 0;
    let totalTips = 0;
    let totalDiscounts = 0;
    let totalPaidCount = 0;
    let totalCanceledCount = 0;
    let totalActiveCount = 0;
    let totalPrepTimeMinutes = 0;
    let prepTimeCount = 0;

    const paymentMix: Record<string, number> = {
      efectivo: 0,
      tarjeta: 0,
      yape: 0,
      transferencia: 0,
      otros: 0
    };

    filteredOrders.forEach(o => {
      const isPaid = o.estado === 'cobrado' || o.estadoPago === 'cobrado';
      const isCanceled = o.estado === 'rechazado';

      if (isPaid) {
        totalPaidCount++;
        totalSales += (o.total || 0);
        totalTips += (o.propina || 0);
        totalDiscounts += (o.descuento || 0);

        // Mix de pago
        if (o.cobros && o.cobros.length > 0) {
          o.cobros.forEach(c => {
            const m = (c.metodoPago || '').toLowerCase();
            if (m.includes('efectivo')) paymentMix.efectivo += (c.total || c.monto || 0);
            else if (m.includes('tarjeta') || m.includes('pos')) paymentMix.tarjeta += (c.total || c.monto || 0);
            else if (m.includes('yape') || m.includes('plin')) paymentMix.yape += (c.total || c.monto || 0);
            else if (m.includes('transf')) paymentMix.transferencia += (c.total || c.monto || 0);
            else paymentMix.otros += (c.total || c.monto || 0);
          });
        } else if (o.metodoPago) {
          const m = (o.metodoPago || '').toLowerCase();
          if (m.includes('efectivo')) paymentMix.efectivo += o.total;
          else if (m.includes('tarjeta')) paymentMix.tarjeta += o.total;
          else if (m.includes('yape') || m.includes('plin')) paymentMix.yape += o.total;
          else if (m.includes('transf')) paymentMix.transferencia += o.total;
          else paymentMix.otros += o.total;
        }
      } else if (isCanceled) {
        totalCanceledCount++;
      } else {
        totalActiveCount++;
      }

      // Cálculo de tiempo de preparación
      if (o.creadoEn && (o.listoEn || o.entregadoEn)) {
        const end = new Date(o.listoEn || o.entregadoEn!).getTime();
        const start = new Date(o.creadoEn).getTime();
        const diffMin = (end - start) / (1000 * 60);
        if (diffMin > 0 && diffMin < 180) {
          totalPrepTimeMinutes += diffMin;
          prepTimeCount++;
        }
      }
    });

    const averageTicket = totalPaidCount > 0 ? totalSales / totalPaidCount : 0;
    const averagePrepTime = prepTimeCount > 0 ? Math.round(totalPrepTimeMinutes / prepTimeCount) : 0;

    return {
      totalSales,
      totalPaidCount,
      totalCanceledCount,
      totalActiveCount,
      totalOrders: filteredOrders.length,
      averageTicket,
      totalTips,
      totalDiscounts,
      averagePrepTime,
      paymentMix
    };
  }, [filteredOrders]);

  // Export to CSV Function
  const handleExportCSV = () => {
    sounds.playCashRegister();
    const headers = [
      'ID Pedido',
      'Fecha / Hora',
      'Sucursal',
      'Canal / Tipo',
      'Mesa / Destino',
      'Cliente',
      'Mesero',
      'Cajero',
      'Estado',
      'Estado Pago',
      'Metodo de Pago',
      'Cantidad Items',
      'Subtotal ($)',
      'Descuento ($)',
      'Propina ($)',
      'Total Facturado ($)',
      'Detalle Items'
    ];

    const rows = filteredOrders.map(o => {
      const rest = restaurants.find(r => r.id === o.restaurantId)?.nombre || 'Central';
      const itemsSummary = o.items.map(i => `${i.cantidad}x ${i.nombre}`).join(' | ');
      const paymentSummary = o.cobros && o.cobros.length > 1 
        ? `Mixto (${o.cobros.map(c => `${c.metodoPago}: $${c.total}`).join(', ')})`
        : (o.metodoPago || 'No especificado');

      return [
        `"${o.id}"`,
        `"${new Date(o.creadoEn).toLocaleString('es-ES')}"`,
        `"${rest.replace(/"/g, '""')}"`,
        `"${o.tipo}"`,
        `"${o.mesaNumero ? `Mesa ${o.mesaNumero}` : (o.empresaDelivery ? `Delivery (${o.empresaDelivery})` : 'Para Llevar')}"`,
        `"${(o.clienteNombre || 'Consumidor Final').replace(/"/g, '""')}"`,
        `"${(o.meseroNombre || '-').replace(/"/g, '""')}"`,
        `"${(o.cajeroNombre || '-').replace(/"/g, '""')}"`,
        `"${o.estado}"`,
        `"${o.estadoPago || 'pendiente'}"`,
        `"${paymentSummary.replace(/"/g, '""')}"`,
        o.items.reduce((s, i) => s + i.cantidad, 0),
        (o.subtotal || o.total).toFixed(2),
        (o.descuento || 0).toFixed(2),
        (o.propina || 0).toFixed(2),
        o.total.toFixed(2),
        `"${itemsSummary.replace(/"/g, '""')}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + 
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Historial_Pedidos_${startDate || 'inicio'}_a_${endDate || 'fin'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper for Payment Method Badges
  const renderPaymentBadge = (order: Order) => {
    if (order.cobros && order.cobros.length > 1) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
          <ArrowRightLeft className="w-3 h-3" />
          Pago Dividido ({order.cobros.length} cobros)
        </span>
      );
    }

    const m = (order.metodoPago || '').toLowerCase();
    if (m === 'efectivo') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Banknote className="w-3 h-3" />
          Efectivo
        </span>
      );
    }
    if (m === 'tarjeta' || m === 'pos' || m === 'credito' || m === 'debito') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
          <CreditCard className="w-3 h-3" />
          Tarjeta
        </span>
      );
    }
    if (m === 'yape' || m === 'plin') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
          <Smartphone className="w-3 h-3" />
          {order.metodoPago}
        </span>
      );
    }
    if (m.includes('transf')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-50 text-cyan-700 border border-cyan-200">
          <ArrowRightLeft className="w-3 h-3" />
          Transferencia
        </span>
      );
    }

    if (order.estadoPago === 'cobrado' || order.estado === 'cobrado') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-700">
          <Receipt className="w-3 h-3" />
          Cobrado
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="w-3 h-3" />
        Por Cobrar
      </span>
    );
  };

  // Helper for Order Status Badges
  const renderStatusBadge = (order: Order) => {
    if (order.estado === 'cobrado' || order.estadoPago === 'cobrado') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="w-3 h-3" />
          Cobrado
        </span>
      );
    }
    if (order.estado === 'rechazado') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-800">
          <XCircle className="w-3 h-3" />
          Rechazado
        </span>
      );
    }
    if (order.estado === 'entregado') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">
          <CheckCircle2 className="w-3 h-3" />
          Entregado
        </span>
      );
    }
    if (order.estado === 'listo') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300">
          Listo
        </span>
      );
    }
    if (order.estado === 'en_preparacion') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse">
          <ChefHat className="w-3 h-3" />
          En Cocina
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-600">
        Pendiente
      </span>
    );
  };

  const selectedRestObj = restaurants.find(r => r.id === (receiptOrder?.restaurantId || inspectingOrder?.restaurantId));

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Header & Export Controls */}
      <div className="bg-white rounded-3xl p-5 border border-neutral-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-neutral-900 tracking-tight flex items-center gap-2">
                Historial de Pedidos & Trazabilidad
                <span className="text-xs font-bold px-2.5 py-0.5 bg-neutral-100 text-neutral-600 rounded-full">
                  {filteredOrders.length} registros
                </span>
              </h2>
              <p className="text-xs text-neutral-500">
                Auditoría completa de comandas, trazabilidad operativa por etapa, sucursal y desglose de cobros.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={handleFetchFullHistorical}
            disabled={isLoadingHistory}
            className="px-3.5 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Consultar pedidos históricos adicionales en el servidor"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
            <span>{isLoadingHistory ? 'Cargando...' : 'Sincronizar'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredOrders.length === 0}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Exportar CSV / Excel</span>
          </button>
        </div>
      </div>

      {/* KPI & Metrics Summary Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-xs">
          <span className="text-[11px] font-bold text-neutral-400 block uppercase">Ventas Cobradas</span>
          <span className="text-xl font-black text-emerald-600 font-mono tracking-tight block mt-1">
            ${metrics.totalSales.toFixed(2)}
          </span>
          <span className="text-[10px] text-neutral-400 mt-0.5 block">
            {metrics.totalPaidCount} pedidos cobrados
          </span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-xs">
          <span className="text-[11px] font-bold text-neutral-400 block uppercase">Ticket Promedio</span>
          <span className="text-xl font-black text-neutral-900 font-mono tracking-tight block mt-1">
            ${metrics.averageTicket.toFixed(2)}
          </span>
          <span className="text-[10px] text-neutral-400 mt-0.5 block">
            Por comanda cobrada
          </span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-xs">
          <span className="text-[11px] font-bold text-neutral-400 block uppercase">Total Comandas</span>
          <span className="text-xl font-black text-neutral-900 font-mono tracking-tight block mt-1">
            {metrics.totalOrders}
          </span>
          <span className="text-[10px] text-neutral-400 mt-0.5 block">
            {metrics.totalActiveCount} en curso · {metrics.totalCanceledCount} anuladas
          </span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-xs">
          <span className="text-[11px] font-bold text-neutral-400 block uppercase">Descuentos & Propinas</span>
          <div className="mt-1 space-y-0.5 font-mono text-xs">
            <div className="text-orange-600 font-bold">Desc: -${metrics.totalDiscounts.toFixed(2)}</div>
            <div className="text-blue-600 font-bold">Prop: +${metrics.totalTips.toFixed(2)}</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-xs">
          <span className="text-[11px] font-bold text-neutral-400 block uppercase">Tiempo Prom. Cocina</span>
          <span className="text-xl font-black text-indigo-900 font-mono tracking-tight block mt-1">
            {metrics.averagePrepTime > 0 ? `${metrics.averagePrepTime} min` : '--'}
          </span>
          <span className="text-[10px] text-neutral-400 mt-0.5 block">
            Creación hasta entrega
          </span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-xs">
          <span className="text-[11px] font-bold text-neutral-400 block uppercase">Mix de Pago</span>
          <div className="mt-1 space-y-0.5 text-[10px] font-mono">
            <div className="flex justify-between text-emerald-700">
              <span>Efect:</span>
              <span className="font-bold">${metrics.paymentMix.efectivo.toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-blue-700">
              <span>Tarj:</span>
              <span className="font-bold">${metrics.paymentMix.tarjeta.toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-purple-700">
              <span>Yape/Plin:</span>
              <span className="font-bold">${metrics.paymentMix.yape.toFixed(0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Filter Bar */}
      <div className="bg-white rounded-3xl p-5 border border-neutral-200 shadow-xs space-y-4">
        
        {/* Date Presets Row */}
        <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-neutral-100">
          <span className="text-xs font-black text-neutral-700 mr-2 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-orange-600" />
            Periodo:
          </span>
          {[
            { id: 'hoy', label: 'Hoy' },
            { id: 'ayer', label: 'Ayer' },
            { id: 'ultimos_7_dias', label: 'Últimos 7 Días' },
            { id: 'este_mes', label: 'Este Mes' },
            { id: 'mes_anterior', label: 'Mes Anterior' },
            { id: 'todo', label: 'Todo el Historial' },
            { id: 'personalizado', label: 'Personalizado' },
          ].map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleDatePresetChange(p.id as DateRangePreset)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                datePreset === p.id 
                  ? 'bg-orange-600 text-white shadow-xs' 
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Dropdown Filters & Search Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          
          {/* Custom Date Pickers */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-600 mb-1">Fecha Inicio:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset('personalizado');
              }}
              className="w-full h-9 px-2.5 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-neutral-600 mb-1">Fecha Fin:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset('personalizado');
              }}
              className="w-full h-9 px-2.5 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 outline-none focus:border-orange-500"
            />
          </div>

          {/* Sucursal Selector */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-600 mb-1">Sucursal / Local:</label>
            <select
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value);
                sounds.playKeypadClick();
              }}
              className="w-full h-9 px-2 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 outline-none focus:border-orange-500"
            >
              <option value="all">Todas las Sucursales</option>
              {restaurants.map(r => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
          </div>

          {/* Método de Pago */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-600 mb-1">Método de Pago:</label>
            <select
              value={selectedPaymentMethod}
              onChange={(e) => {
                setSelectedPaymentMethod(e.target.value);
                sounds.playKeypadClick();
              }}
              className="w-full h-9 px-2 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 outline-none focus:border-orange-500"
            >
              <option value="all">Todos los Métodos</option>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta (POS / Débito / Crédito)</option>
              <option value="yape">Yape / Plin</option>
              <option value="transferencia">Transferencia Bancaria</option>
              <option value="mixto">Pago Dividido / Mixto</option>
            </select>
          </div>

          {/* Estado del Pedido */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-600 mb-1">Estado:</label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                sounds.playKeypadClick();
              }}
              className="w-full h-9 px-2 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 outline-none focus:border-orange-500"
            >
              <option value="all">Todos los Estados</option>
              <option value="cobrado">Cobrado</option>
              <option value="entregado">Entregado</option>
              <option value="listo">Listo en Cocina</option>
              <option value="en_preparacion">En Preparación</option>
              <option value="pendiente">Pendiente</option>
              <option value="rechazado">Rechazado / Anulado</option>
              <option value="en_curso">En Curso (Activos)</option>
            </select>
          </div>

          {/* Canal / Tipo de Entrega */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-600 mb-1">Canal de Venta:</label>
            <select
              value={selectedOrderType}
              onChange={(e) => {
                setSelectedOrderType(e.target.value);
                sounds.playKeypadClick();
              }}
              className="w-full h-9 px-2 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 outline-none focus:border-orange-500"
            >
              <option value="all">Todos los Canales</option>
              <option value="mesa">Consumo en Mesa (Local)</option>
              <option value="para_llevar">Para Llevar (Takeout)</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
        </div>

        {/* Search Input & Sort Row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="relative w-full sm:max-w-md">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por ID, mesa, cliente, mesero o plato..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-9 pr-8 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 placeholder:text-neutral-400 outline-none focus:border-orange-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <span className="text-xs text-neutral-500 font-bold whitespace-nowrap">Ordenar por:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-9 px-2.5 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-700 bg-white"
            >
              <option value="fecha_desc">Fecha (Más recientes primero)</option>
              <option value="fecha_asc">Fecha (Más antiguos primero)</option>
              <option value="total_desc">Total ($ Mayor a menor)</option>
              <option value="total_asc">Total ($ Menor a mayor)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-3xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50/80 border-b border-neutral-200 text-neutral-500 font-bold uppercase tracking-wider">
              <tr>
                <th className="p-3.5">ID / Fecha</th>
                <th className="p-3.5">Sucursal</th>
                <th className="p-3.5">Canal / Mesa</th>
                <th className="p-3.5">Personal</th>
                <th className="p-3.5">Consumo / Ítems</th>
                <th className="p-3.5">Método de Pago</th>
                <th className="p-3.5 text-right">Total</th>
                <th className="p-3.5 text-center">Estado</th>
                <th className="p-3.5 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredOrders.map(order => {
                const restName = restaurants.find(r => r.id === order.restaurantId)?.nombre || 'Central';
                const totalItemsCount = order.items.reduce((s, i) => s + i.cantidad, 0);
                const orderDateObj = new Date(order.creadoEn);
                const formattedDate = orderDateObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const formattedTime = orderDateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

                return (
                  <tr key={order.id} className="hover:bg-neutral-50/70 transition">
                    
                    {/* ID / Fecha */}
                    <td className="p-3.5">
                      <div className="font-mono font-bold text-neutral-900 text-xs">
                        #{order.id.slice(-6).toUpperCase()}
                      </div>
                      <div className="text-[11px] text-neutral-500 font-mono">
                        {formattedDate} · {formattedTime}
                      </div>
                    </td>

                    {/* Sucursal */}
                    <td className="p-3.5 font-bold text-neutral-700">
                      <div className="flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-neutral-400" />
                        <span>{restName}</span>
                      </div>
                    </td>

                    {/* Canal / Mesa */}
                    <td className="p-3.5">
                      {order.tipo === 'mesa' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-orange-50 text-orange-800 font-bold rounded-lg border border-orange-200">
                            Mesa {order.mesaNumero || '-'}
                          </span>
                        </div>
                      ) : order.tipo === 'para_llevar' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-800 font-bold rounded-lg border border-purple-200 flex items-center gap-1">
                            <ShoppingBag className="w-3 h-3" />
                            Para Llevar
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-800 font-bold rounded-lg border border-blue-200 flex items-center gap-1">
                            <Truck className="w-3 h-3" />
                            {order.empresaDelivery || 'Delivery'}
                          </span>
                        </div>
                      )}
                      {order.clienteNombre && (
                        <span className="text-[11px] text-neutral-500 block truncate max-w-[140px] mt-0.5">
                          👤 {order.clienteNombre}
                        </span>
                      )}
                    </td>

                    {/* Personal */}
                    <td className="p-3.5 text-[11px]">
                      {order.meseroNombre && (
                        <div className="text-neutral-700 font-medium">
                          Mesero: <strong className="text-neutral-900">{order.meseroNombre}</strong>
                        </div>
                      )}
                      {order.cajeroNombre && (
                        <div className="text-neutral-500">
                          Caja: {order.cajeroNombre}
                        </div>
                      )}
                    </td>

                    {/* Consumo / Ítems */}
                    <td className="p-3.5 max-w-[220px]">
                      <div className="font-bold text-neutral-900">
                        {totalItemsCount} {totalItemsCount === 1 ? 'producto' : 'productos'}
                      </div>
                      <div className="text-[11px] text-neutral-500 truncate" title={order.items.map(i => `${i.cantidad}x ${i.nombre}`).join(', ')}>
                        {order.items.map(i => `${i.cantidad}x ${i.nombre}`).slice(0, 2).join(', ')}
                        {order.items.length > 2 && ` +${order.items.length - 2} más`}
                      </div>
                    </td>

                    {/* Método de Pago */}
                    <td className="p-3.5">
                      {renderPaymentBadge(order)}
                    </td>

                    {/* Total */}
                    <td className="p-3.5 text-right">
                      <div className="font-mono font-black text-sm text-neutral-900">
                        ${order.total.toFixed(2)}
                      </div>
                      {(order.descuento || 0) > 0 && (
                        <div className="text-[10px] font-mono text-orange-600 font-bold">
                          Desc: -${order.descuento?.toFixed(2)}
                        </div>
                      )}
                      {(order.propina || 0) > 0 && (
                        <div className="text-[10px] font-mono text-blue-600 font-bold">
                          Prop: +${order.propina?.toFixed(2)}
                        </div>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="p-3.5 text-center">
                      {renderStatusBadge(order)}
                    </td>

                    {/* Acciones */}
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            sounds.playKeypadClick();
                            setInspectingOrder(order);
                          }}
                          className="p-1.5 rounded-lg bg-neutral-100 hover:bg-orange-50 hover:text-orange-600 text-neutral-600 transition"
                          title="Ver detalle y trazabilidad completa"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            sounds.playKeypadClick();
                            setReceiptOrder(order);
                          }}
                          className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition"
                          title="Imprimir ticket térmico o compartir por WhatsApp"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-neutral-400">
                    <History className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                    <p className="font-bold text-sm text-neutral-700">No se encontraron pedidos con los filtros actuales</p>
                    <p className="text-xs text-neutral-400 mt-1">
                      Ajusta el rango de fecha o borra los términos de búsqueda para visualizar más resultados.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* TRACEABILITY & ORDER DETAIL MODAL */}
      {inspectingOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-neutral-100 p-6 space-y-6">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center font-bold">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-neutral-900 flex items-center gap-2">
                    Comanda #{inspectingOrder.id.slice(-6).toUpperCase()}
                    {renderStatusBadge(inspectingOrder)}
                  </h3>
                  <p className="text-xs text-neutral-500 font-mono">
                    Registrada el {new Date(inspectingOrder.creadoEn).toLocaleString('es-ES')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectingOrder(null)}
                className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* General Info Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-50 p-4 rounded-2xl border border-neutral-200/60 text-xs">
              <div>
                <span className="text-[10px] text-neutral-400 font-bold block uppercase">Sucursal</span>
                <strong className="text-neutral-800">
                  {restaurants.find(r => r.id === inspectingOrder.restaurantId)?.nombre || 'Central'}
                </strong>
              </div>

              <div>
                <span className="text-[10px] text-neutral-400 font-bold block uppercase">Ubicación / Canal</span>
                <strong className="text-neutral-800">
                  {inspectingOrder.tipo === 'mesa' ? `Mesa ${inspectingOrder.mesaNumero || '-'}` : inspectingOrder.tipo}
                </strong>
              </div>

              <div>
                <span className="text-[10px] text-neutral-400 font-bold block uppercase">Mesero / Atendido</span>
                <strong className="text-neutral-800">
                  {inspectingOrder.meseroNombre || 'No registrado'}
                </strong>
              </div>

              <div>
                <span className="text-[10px] text-neutral-400 font-bold block uppercase">Cajero / Liquidado</span>
                <strong className="text-neutral-800">
                  {inspectingOrder.cajeroNombre || 'No liquidado'}
                </strong>
              </div>
            </div>

            {/* Client Info (if available) */}
            {(inspectingOrder.clienteNombre || inspectingOrder.clienteTelefono || inspectingOrder.clienteDireccion) && (
              <div className="p-3.5 bg-blue-50/50 rounded-2xl border border-blue-100 text-xs space-y-1">
                <span className="text-[10px] font-black uppercase text-blue-800 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  Datos del Cliente
                </span>
                <div className="text-neutral-800 font-bold">{inspectingOrder.clienteNombre || 'Consumidor'}</div>
                {inspectingOrder.clienteTelefono && (
                  <div className="text-neutral-600 font-mono">Teléfono: {inspectingOrder.clienteTelefono}</div>
                )}
                {inspectingOrder.clienteDireccion && (
                  <div className="text-neutral-600">Dirección: {inspectingOrder.clienteDireccion}</div>
                )}
              </div>
            )}

            {/* Traceability Timeline */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-orange-600" />
                Línea de Tiempo Operativa (Trazabilidad)
              </h4>

              <div className="space-y-2 border-l-2 border-neutral-200 ml-3 pl-4 text-xs">
                
                {/* 1. Creación */}
                <div className="relative">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 absolute -left-[21px] top-1" />
                  <div className="font-bold text-neutral-900">Pedido Creado & Enviado</div>
                  <div className="text-[11px] text-neutral-500 font-mono">
                    {new Date(inspectingOrder.creadoEn).toLocaleTimeString('es-ES')} · por {inspectingOrder.meseroNombre || 'Mesero'}
                  </div>
                </div>

                {/* 2. Aceptación */}
                {inspectingOrder.aceptadoEn && (
                  <div className="relative">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 absolute -left-[21px] top-1" />
                    <div className="font-bold text-neutral-900">Aceptado en Cocina</div>
                    <div className="text-[11px] text-neutral-500 font-mono">
                      {new Date(inspectingOrder.aceptadoEn).toLocaleTimeString('es-ES')}
                    </div>
                  </div>
                )}

                {/* 3. En Preparación */}
                {inspectingOrder.enPreparacionEn && (
                  <div className="relative">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500 absolute -left-[21px] top-1" />
                    <div className="font-bold text-neutral-900">En Fuego / Preparación</div>
                    <div className="text-[11px] text-neutral-500 font-mono">
                      {new Date(inspectingOrder.enPreparacionEn).toLocaleTimeString('es-ES')}
                    </div>
                  </div>
                )}

                {/* 4. Listo */}
                {inspectingOrder.listoEn && (
                  <div className="relative">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 absolute -left-[21px] top-1" />
                    <div className="font-bold text-neutral-900">Platos Listos para Servir</div>
                    <div className="text-[11px] text-neutral-500 font-mono">
                      {new Date(inspectingOrder.listoEn).toLocaleTimeString('es-ES')}
                    </div>
                  </div>
                )}

                {/* 5. Entregado */}
                {inspectingOrder.entregadoEn && (
                  <div className="relative">
                    <div className="w-2.5 h-2.5 rounded-full bg-sky-500 absolute -left-[21px] top-1" />
                    <div className="font-bold text-neutral-900">Entregado a Mesa / Cliente</div>
                    <div className="text-[11px] text-neutral-500 font-mono">
                      {new Date(inspectingOrder.entregadoEn).toLocaleTimeString('es-ES')}
                    </div>
                  </div>
                )}

                {/* 6. Cobrado */}
                {inspectingOrder.cobradoEn && (
                  <div className="relative">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-600 absolute -left-[21px] top-1" />
                    <div className="font-bold text-emerald-800">Liquidado en Caja (${inspectingOrder.total.toFixed(2)})</div>
                    <div className="text-[11px] text-neutral-500 font-mono">
                      {new Date(inspectingOrder.cobradoEn).toLocaleTimeString('es-ES')} · por {inspectingOrder.cajeroNombre || 'Cajero'}
                    </div>
                  </div>
                )}

                {/* Rechazo si aplica */}
                {inspectingOrder.estado === 'rechazado' && (
                  <div className="relative">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-600 absolute -left-[21px] top-1" />
                    <div className="font-bold text-red-700">Comanda Rechazada / Cancelada</div>
                    {inspectingOrder.motivoRechazo && (
                      <div className="text-[11px] text-red-600 mt-0.5">
                        Motivo: &quot;{inspectingOrder.motivoRechazo}&quot;
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Products & Items Breakdown */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                <Utensils className="w-3.5 h-3.5 text-orange-600" />
                Desglose de Ítems Consumidos
              </h4>

              <div className="bg-neutral-50 rounded-2xl border border-neutral-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-neutral-100 text-neutral-500 font-bold border-b border-neutral-200">
                    <tr>
                      <th className="p-2.5 text-center w-10">Cant</th>
                      <th className="p-2.5 text-left">Plato / Bebida</th>
                      <th className="p-2.5 text-left">Comensal</th>
                      <th className="p-2.5 text-right">P. Unit</th>
                      <th className="p-2.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200/60">
                    {inspectingOrder.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-white/60">
                        <td className="p-2.5 text-center font-bold font-mono">{item.cantidad}x</td>
                        <td className="p-2.5">
                          <div className="font-bold text-neutral-900">{item.nombre}</div>
                          {item.notas && <div className="text-[10px] text-neutral-500 italic font-mono">Nota: {item.notas}</div>}
                        </td>
                        <td className="p-2.5 text-neutral-500">
                          {item.comensalNumero ? `C${item.comensalNumero}` : 'General'}
                        </td>
                        <td className="p-2.5 text-right font-mono text-neutral-600">${item.precio.toFixed(2)}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-neutral-900">
                          ${(item.precio * item.cantidad).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Partial Payments History (Cobros Compartidos) */}
            {inspectingOrder.cobros && inspectingOrder.cobros.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
                  Registro de Cobros Parciales / Compartidos ({inspectingOrder.cobros.length})
                </h4>

                <div className="space-y-2">
                  {inspectingOrder.cobros.map((cobro, idx) => (
                    <div key={idx} className="bg-indigo-50/40 border border-indigo-200/80 rounded-2xl p-3 text-xs flex items-center justify-between">
                      <div>
                        <div className="font-bold text-indigo-950 flex items-center gap-2">
                          <span>Cobro #{idx + 1} - {cobro.tipo === 'comensal' ? (cobro.comensalNombre || `Comensal C${cobro.comensalNumero || 1}`) : `Parte ${cobro.numeroParte || 1}/${cobro.totalPartes || 1}`}</span>
                          <span className="uppercase text-[9px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-black">
                            {cobro.metodoPago}
                          </span>
                        </div>
                        <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                          {new Date(cobro.creadoEn || cobro.fecha).toLocaleString('es-ES')} · Cajero: {cobro.cajeroNombre || 'Caja'}
                        </div>
                      </div>

                      <div className="text-right font-mono font-black text-sm text-indigo-900">
                        ${cobro.total.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Financial Summary */}
            {(() => {
              const breakdown = getOrderTaxBreakdown(inspectingOrder);
              return (
                <div className="bg-neutral-900 text-white rounded-2xl p-4 space-y-2 font-mono text-xs">
                  <div className="flex justify-between text-neutral-400">
                    <span>Subtotal Base:</span>
                    <span>${breakdown.subtotal.toFixed(2)}</span>
                  </div>
                  {breakdown.descuento > 0 && (
                    <div className="flex justify-between text-orange-400">
                      <span>Descuento Aplicado:</span>
                      <span>-${breakdown.descuento.toFixed(2)}</span>
                    </div>
                  )}
                  {breakdown.impuesto > 0 && (
                    <div className="flex justify-between text-amber-400">
                      <span>
                        {breakdown.porcentajeImpuesto > 0
                          ? `Impuesto (${breakdown.porcentajeImpuesto}%${breakdown.impuestoIncluidoEnPrecio ? ' incl.' : ''}):`
                          : 'Impuesto / IVA:'}
                      </span>
                      <span>
                        {breakdown.impuestoIncluidoEnPrecio ? '(incl.) ' : '+'}${breakdown.impuesto.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {breakdown.propina > 0 && (
                    <div className="flex justify-between text-blue-400">
                      <span>Propina / Servicio:</span>
                      <span>+${breakdown.propina.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-black text-white pt-2 border-t border-neutral-800">
                    <span>Total Facturado:</span>
                    <span className="text-emerald-400">${breakdown.total.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Actions Footer */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setReceiptOrder(inspectingOrder);
                  setInspectingOrder(null);
                }}
                className="flex-1 h-11 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Imprimir Comprobante Térmico / Ticket
              </button>
              <button
                type="button"
                onClick={() => setInspectingOrder(null)}
                className="h-11 px-5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THERMAL RECEIPT MODAL */}
      {receiptOrder && (
        <ThermalReceiptModal
          order={receiptOrder}
          restaurantName={selectedRestObj?.nombre || 'Gastro Smart'}
          restaurantAddress={selectedRestObj?.direccion || 'Calle Principal 123'}
          restaurantPhone={selectedRestObj?.telefono || '099-000-0000'}
          clientName={receiptOrder.clienteNombre || 'Consumidor Final'}
          clientPhone={receiptOrder.clienteTelefono || ''}
          onClose={() => setReceiptOrder(null)}
        />
      )}

    </div>
  );
};
