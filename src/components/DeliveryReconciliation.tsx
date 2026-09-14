import React, { useState, useMemo } from 'react';
import { 
  Order, 
  Restaurant 
} from '../types';
import { 
  markOrdersDeliveryPaid 
} from '../services/dataService';
import { sounds } from '../utils/sound';
import { 
  Truck, 
  DollarSign, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Calendar, 
  Percent, 
  ArrowRight, 
  Check, 
  X,
  FileSpreadsheet,
  Building2,
  Receipt
} from 'lucide-react';

interface DeliveryReconciliationProps {
  orders: Order[];
  restaurants: Restaurant[];
  businessId: string;
  selectedBranchId: string;
  currentUserName: string;
  userRole?: string;
}

interface CompanySummary {
  empresa: 'PedidosYa' | 'UberEats' | 'Rappi';
  pedidosTotal: number;
  pedidosPendientes: number;
  pedidosPagados: number;
  ventasBrutas: number;
  comisionPorcentaje: number;
  montoComision: number;
  netoTotal: number;
  netoPendiente: number;
  netoPagado: number;
  oldestPendingDays: number;
  semaforo: 'verde' | 'amarillo' | 'rojo';
  orders: Order[];
}

export const DeliveryReconciliation: React.FC<DeliveryReconciliationProps> = ({
  orders,
  restaurants,
  businessId,
  selectedBranchId,
  currentUserName,
  userRole = 'owner'
}) => {
  if (userRole !== 'owner' && userRole !== 'admin') {
    return (
      <div className="p-8 text-center text-neutral-500 font-bold bg-white rounded-2xl border border-neutral-200">
        Acceso restringido: Solo administradores y propietarios pueden conciliar comisiones de delivery.
      </div>
    );
  }
  // Modal para registrar pago / depósito de delivery
  const [activeModalCompany, setActiveModalCompany] = useState<CompanySummary | null>(null);
  const [depositDate, setDepositDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [realAmountReceived, setRealAmountReceived] = useState<number>(0);
  const [depositNotes, setDepositNotes] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filtrar comandas por sucursal
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.tipo !== 'delivery' || o.estado !== 'cobrado') return false;
      if (selectedBranchId !== 'all' && o.restaurantId !== selectedBranchId) return false;
      return true;
    });
  }, [orders, selectedBranchId]);

  // Obtener comisiones configuradas del restaurante o por defecto
  const activeRest = restaurants.find(r => r.id === selectedBranchId) || restaurants[0];
  const commissions = activeRest?.deliveryCommissions || {
    pedidosYa: 18,
    uberEats: 20,
    rappi: 22
  };

  const companiesList: Array<'PedidosYa' | 'UberEats' | 'Rappi'> = ['PedidosYa', 'UberEats', 'Rappi'];

  const summaries: CompanySummary[] = useMemo(() => {
    const nowTime = Date.now();

    return companiesList.map(comp => {
      const compOrders = filteredOrders.filter(o => {
        const c = (o.empresaDelivery || '').toLowerCase();
        if (comp === 'PedidosYa') return c.includes('pedidos') || c.includes('ya');
        if (comp === 'UberEats') return c.includes('uber');
        if (comp === 'Rappi') return c.includes('rappi');
        return false;
      });

      const commRate = comp === 'PedidosYa' 
        ? (commissions.pedidosYa ?? 18) 
        : comp === 'UberEats' 
          ? (commissions.uberEats ?? 20) 
          : (commissions.rappi ?? 22);

      let ventasBrutas = 0;
      let pedidosPendientes = 0;
      let pedidosPagados = 0;
      let netoPendiente = 0;
      let netoPagado = 0;
      let oldestPendingDays = 0;

      compOrders.forEach(ord => {
        const t = ord.total || 0;
        ventasBrutas += t;
        const ordNeto = t - (t * commRate) / 100;

        if (ord.deliveryPaid) {
          pedidosPagados++;
          netoPagado += ordNeto;
        } else {
          pedidosPendientes++;
          netoPendiente += ordNeto;

          const createdTime = new Date(ord.creadoEn || ord.cobradoEn || '').getTime();
          const daysDiff = Math.floor((nowTime - createdTime) / (1000 * 60 * 60 * 24));
          if (daysDiff > oldestPendingDays) {
            oldestPendingDays = daysDiff;
          }
        }
      });

      const montoComision = (ventasBrutas * commRate) / 100;
      const netoTotal = ventasBrutas - montoComision;

      // Semáforo:
      // Verde: sin saldo pendiente (todo conciliado)
      // Amarillo: pendiente menos de 7 días
      // Rojo: pendiente más de 7 días
      let semaforo: 'verde' | 'amarillo' | 'rojo' = 'verde';
      if (pedidosPendientes > 0) {
        semaforo = oldestPendingDays > 7 ? 'rojo' : 'amarillo';
      }

      return {
        empresa: comp,
        pedidosTotal: compOrders.length,
        pedidosPendientes,
        pedidosPagados,
        ventasBrutas: Math.round(ventasBrutas * 100) / 100,
        comisionPorcentaje: commRate,
        montoComision: Math.round(montoComision * 100) / 100,
        netoTotal: Math.round(netoTotal * 100) / 100,
        netoPendiente: Math.round(netoPendiente * 100) / 100,
        netoPagado: Math.round(netoPagado * 100) / 100,
        oldestPendingDays,
        semaforo,
        orders: compOrders
      };
    });
  }, [filteredOrders, commissions]);

  // Total acumulado que deben las aplicaciones
  const totalPendienteCobrar = useMemo(() => {
    return summaries.reduce((sum, s) => sum + s.netoPendiente, 0);
  }, [summaries]);

  const handleOpenMarkPaid = (summary: CompanySummary) => {
    sounds.playKeypadClick();
    setActiveModalCompany(summary);
    setDepositDate(new Date().toISOString().split('T')[0]);
    setRealAmountReceived(summary.netoPendiente);
    setDepositNotes('');
  };

  const handleConfirmDeposit = async () => {
    if (!activeModalCompany) return;
    setIsProcessing(true);
    sounds.playCashRegister();

    try {
      const pendingOrders = activeModalCompany.orders.filter(o => !o.deliveryPaid);
      const pendingOrderIds = pendingOrders.map(o => o.id);

      await markOrdersDeliveryPaid(pendingOrderIds, {
        businessId,
        restaurantId: selectedBranchId === 'all' ? (pendingOrders[0]?.restaurantId || 'central') : selectedBranchId,
        fecha: depositDate,
        empresa: activeModalCompany.empresa,
        montoCalculado: activeModalCompany.netoPendiente,
        montoReal: Number(realAmountReceived) || 0,
        usuario: currentUserName,
        notas: depositNotes
      });

      setSuccessMsg(`¡Depósito de ${activeModalCompany.empresa} registrado correctamente por $${Number(realAmountReceived).toFixed(2)}!`);
      setActiveModalCompany(null);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Error al registrar depósito de delivery:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* KPI Hero Banner: Total pendiente de cobrar */}
      <div className="bg-gradient-to-br from-neutral-900 to-neutral-800 text-white p-6 sm:p-8 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-6 border border-neutral-700">
        <div>
          <div className="flex items-center gap-2 text-orange-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Truck className="w-4 h-4" />
            <span>Conciliación de Pagos con Plataformas de Delivery</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Las apps te deben: <span className="text-emerald-400">${totalPendienteCobrar.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-1 max-w-xl">
            Suma neta calculada de pedidos entregados y cobrados a clientes por delivery pendiente de ser transferida a tu cuenta bancaria.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs bg-white/10 px-4 py-2.5 rounded-2xl border border-white/10 font-bold">
          <Clock className="w-4 h-4 text-amber-400" />
          <span>{filteredOrders.filter(o => !o.deliveryPaid).length} pedidos por conciliar</span>
        </div>
      </div>

      {/* Grid of Delivery Companies */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {summaries.map((item, idx) => {
          const isGreen = item.semaforo === 'verde';
          const isYellow = item.semaforo === 'amarillo';
          const isRed = item.semaforo === 'rojo';

          const brandColors: Record<string, { bg: string; badge: string; text: string }> = {
            PedidosYa: { bg: 'border-red-200 bg-red-50/20', badge: 'bg-red-500 text-white', text: 'text-red-700' },
            UberEats: { bg: 'border-emerald-200 bg-emerald-50/20', badge: 'bg-emerald-600 text-white', text: 'text-emerald-700' },
            Rappi: { bg: 'border-orange-200 bg-orange-50/20', badge: 'bg-orange-500 text-white', text: 'text-orange-700' },
          };

          const brand = brandColors[item.empresa] || brandColors.PedidosYa;

          return (
            <div 
              key={`${item.empresa}-${idx}`}
              className={`bg-white rounded-3xl p-6 border shadow-sm transition hover:shadow-md flex flex-col justify-between ${brand.bg}`}
            >
              <div>
                {/* Header with Traffic Light Badge */}
                <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
                  <div className="flex items-center gap-2.5">
                    <span className={`px-3 py-1 rounded-xl text-xs font-black ${brand.badge}`}>
                      {item.empresa}
                    </span>
                    <span className="text-xs text-neutral-500 font-bold">Comisión: {item.comisionPorcentaje}%</span>
                  </div>

                  {/* Semáforo */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border">
                    {isGreen && (
                      <span className="flex items-center gap-1 text-emerald-700 bg-emerald-100/60 border-emerald-200 px-2 py-0.5 rounded-full">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Conciliado
                      </span>
                    )}
                    {isYellow && (
                      <span className="flex items-center gap-1 text-amber-700 bg-amber-100/60 border-amber-200 px-2 py-0.5 rounded-full">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        Pendiente (&lt; 7 días)
                      </span>
                    )}
                    {isRed && (
                      <span className="flex items-center gap-1 text-red-700 bg-red-100/60 border-red-200 px-2 py-0.5 rounded-full">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                        Vencido (&gt; 7 días)
                      </span>
                    )}
                  </div>
                </div>

                {/* Metrics */}
                <div className="mt-5 space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-neutral-500">Ventas Brutas ({item.pedidosTotal} pedidos):</span>
                    <span className="text-sm font-bold text-neutral-900">${item.ventasBrutas.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-baseline text-xs text-neutral-500">
                    <span>Comisión retenida app ({item.comisionPorcentaje}%):</span>
                    <span className="text-red-600 font-bold">-${item.montoComision.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-baseline text-xs text-neutral-500">
                    <span>Neto cobrado ya liquidado:</span>
                    <span className="text-neutral-700 font-bold">${item.netoPagado.toFixed(2)}</span>
                  </div>

                  <div className="pt-3 border-t border-neutral-200 flex justify-between items-baseline">
                    <div>
                      <span className="text-xs uppercase font-extrabold text-neutral-600 block">Neto Pendiente:</span>
                      <span className="text-[11px] text-neutral-400">{item.pedidosPendientes} pedidos sin liquidar</span>
                    </div>
                    <span className="text-2xl font-black text-emerald-600">${item.netoPendiente.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-6 pt-4 border-t border-neutral-100">
                {item.netoPendiente > 0 ? (
                  <button
                    onClick={() => handleOpenMarkPaid(item)}
                    className="w-full py-3 bg-neutral-900 hover:bg-black text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Marcar depósito recibido</span>
                  </button>
                ) : (
                  <div className="w-full py-2.5 bg-neutral-100 text-neutral-500 rounded-2xl text-xs font-bold text-center flex items-center justify-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Sin saldos pendientes</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal para marcar depósito recibido y guardar diferencias/ajustes */}
      {activeModalCompany && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-neutral-100 space-y-6">
            
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900">
                    Conciliar Depósito: {activeModalCompany.empresa}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {activeModalCompany.pedidosPendientes} pedidos pendientes por liquidar
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveModalCompany(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Calculations review */}
            <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-500">Monto neto teórico calculado:</span>
                <strong className="font-mono text-neutral-900">${activeModalCompany.netoPendiente.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Comisión aplicada ({activeModalCompany.comisionPorcentaje}%):</span>
                <strong className="font-mono text-red-600">-${activeModalCompany.montoComision.toFixed(2)}</strong>
              </div>
            </div>

            {/* Form Inputs */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Fecha del depósito bancario:
                </label>
                <input
                  type="date"
                  value={depositDate}
                  onChange={(e) => setDepositDate(e.target.value)}
                  className="w-full p-3 rounded-xl border border-neutral-300 text-xs font-medium focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Monto real recibido en cuenta bancaria ($):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={realAmountReceived}
                  onChange={(e) => setRealAmountReceived(parseFloat(e.target.value) || 0)}
                  className="w-full p-3 rounded-xl border border-neutral-300 text-sm font-bold font-mono focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
                
                {/* Diferencia o ajuste */}
                {realAmountReceived !== activeModalCompany.netoPendiente && (
                  <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                    Diferencia de <strong>${(realAmountReceived - activeModalCompany.netoPendiente).toFixed(2)}</strong> respecto al cálculo teórico. Se registrará automáticamente como ajuste contable de conciliación.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Notas / Referencia bancaria (Opcional):
                </label>
                <input
                  type="text"
                  value={depositNotes}
                  onChange={(e) => setDepositNotes(e.target.value)}
                  placeholder="Ej. Transferencia #98421 Banco Continental"
                  className="w-full p-3 rounded-xl border border-neutral-300 text-xs focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveModalCompany(null)}
                className="py-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeposit}
                disabled={isProcessing || realAmountReceived <= 0}
                className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-md disabled:opacity-50"
              >
                {isProcessing ? 'Registrando...' : 'Confirmar Conciliación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
