import React, { useState, useMemo } from 'react';
import { 
  Order, 
  Restaurant,
  DeliveryCompanyConfig
} from '../types';
import { 
  markOrdersDeliveryPaid,
  getRestaurantDeliveryCompanies,
  updateRestaurantDeliveryCompanies,
  DEFAULT_DELIVERY_COMPANIES
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
  Building2,
  Receipt,
  Settings,
  Plus,
  Edit2,
  Trash2,
  List,
  Save,
  ChevronRight,
  Eye,
  RefreshCw,
  Info,
  Sparkles,
  Bike
} from 'lucide-react';

interface DeliveryReconciliationProps {
  orders: Order[];
  restaurants: Restaurant[];
  businessId: string;
  selectedBranchId: string;
  currentUserName: string;
  userRole?: string;
}

export interface DynamicCompanySummary {
  id: string;
  empresa: string;
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
  color?: string;
  orders: Order[];
}

const AVAILABLE_COLORS = [
  { id: 'red', name: 'Rojo', badge: 'bg-red-500 text-white', border: 'border-red-200 bg-red-50/25', ring: 'focus:ring-red-500' },
  { id: 'emerald', name: 'Esmeralda / Verde', badge: 'bg-emerald-600 text-white', border: 'border-emerald-200 bg-emerald-50/25', ring: 'focus:ring-emerald-500' },
  { id: 'orange', name: 'Naranja', badge: 'bg-orange-500 text-white', border: 'border-orange-200 bg-orange-50/25', ring: 'focus:ring-orange-500' },
  { id: 'blue', name: 'Azul', badge: 'bg-blue-600 text-white', border: 'border-blue-200 bg-blue-50/25', ring: 'focus:ring-blue-500' },
  { id: 'purple', name: 'Púrpura / Morado', badge: 'bg-purple-600 text-white', border: 'border-purple-200 bg-purple-50/25', ring: 'focus:ring-purple-500' },
  { id: 'amber', name: 'Ámbar / Amarillo', badge: 'bg-amber-500 text-white', border: 'border-amber-200 bg-amber-50/25', ring: 'focus:ring-amber-500' },
  { id: 'cyan', name: 'Turquesa / Celeste', badge: 'bg-cyan-600 text-white', border: 'border-cyan-200 bg-cyan-50/25', ring: 'focus:ring-cyan-500' },
  { id: 'neutral', name: 'Gris / Grafito', badge: 'bg-neutral-800 text-white', border: 'border-neutral-200 bg-neutral-50/40', ring: 'focus:ring-neutral-500' },
];

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
      <div className="p-8 text-center text-neutral-500 font-bold bg-white rounded-3xl border border-neutral-200 shadow-sm">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <p>Acceso restringido: Solo administradores y propietarios pueden conciliar comisiones de delivery.</p>
      </div>
    );
  }

  // Modales y estados
  const [activeModalCompany, setActiveModalCompany] = useState<DynamicCompanySummary | null>(null);
  const [viewOrdersCompany, setViewOrdersCompany] = useState<DynamicCompanySummary | null>(null);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [quickEditCompany, setQuickEditCompany] = useState<{ id: string; name: string; percentage: number } | null>(null);
  
  // Formulario de depósito
  const [depositDate, setDepositDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [realAmountReceived, setRealAmountReceived] = useState<number>(0);
  const [depositNotes, setDepositNotes] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Formulario para crear o editar empresa
  const [editingCompany, setEditingCompany] = useState<DeliveryCompanyConfig | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [newCompanyForm, setNewCompanyForm] = useState<{
    nombre: string;
    comisionPorcentaje: number;
    color: string;
    tiempoPagoDias: number;
    notas: string;
  }>({
    nombre: '',
    comisionPorcentaje: 18,
    color: 'orange',
    tiempoPagoDias: 7,
    notas: ''
  });

  // Restaurante activo
  const activeRest = restaurants.find(r => r.id === selectedBranchId) || restaurants[0];
  
  // Lista de empresas configuradas
  const configuredCompanies: DeliveryCompanyConfig[] = useMemo(() => {
    return getRestaurantDeliveryCompanies(activeRest);
  }, [activeRest]);

  // Filtrar comandas de delivery cobradas
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.tipo !== 'delivery' || o.estado !== 'cobrado') return false;
      if (selectedBranchId !== 'all' && o.restaurantId !== selectedBranchId) return false;
      return true;
    });
  }, [orders, selectedBranchId]);

  // Generar resúmenes por empresa dinámicamente
  const summaries: DynamicCompanySummary[] = useMemo(() => {
    const nowTime = Date.now();
    
    // Unir empresas configuradas con cualquier otra que aparezca en órdenes históricas
    const companiesMap = new Map<string, { id: string; name: string; rate: number; color?: string; dias: number }>();

    configuredCompanies.forEach(c => {
      companiesMap.set(c.nombre.toLowerCase().trim(), {
        id: c.id,
        name: c.nombre,
        rate: Number(c.comisionPorcentaje) || 0,
        color: c.color,
        dias: c.tiempoPagoDias || 7
      });
    });

    // Detectar empresas de pedidos que no estén en la lista
    filteredOrders.forEach(o => {
      const rawName = (o.empresaDelivery || 'General').trim();
      const lower = rawName.toLowerCase();
      if (!companiesMap.has(lower)) {
        // Encontrar si coincide parcialmente
        let matched = false;
        for (const [key, val] of companiesMap.entries()) {
          if (lower.includes(key) || key.includes(lower)) {
            matched = true;
            break;
          }
        }
        if (!matched) {
          companiesMap.set(lower, {
            id: `legacy_${lower.replace(/\s+/g, '_')}`,
            name: rawName,
            rate: 0,
            color: 'neutral',
            dias: 7
          });
        }
      }
    });

    const results: DynamicCompanySummary[] = [];

    companiesMap.forEach(({ id, name, rate, color, dias }) => {
      const targetLower = name.toLowerCase().trim();

      const compOrders = filteredOrders.filter(o => {
        const orderComp = (o.empresaDelivery || '').toLowerCase().trim();
        if (targetLower === 'general' && (!orderComp || orderComp === '')) return true;
        if (orderComp === targetLower) return true;
        if (targetLower.includes('pedidos') && (orderComp.includes('pedidos') || orderComp.includes('ya'))) return true;
        if (targetLower.includes('uber') && orderComp.includes('uber')) return true;
        if (targetLower.includes('rappi') && orderComp.includes('rappi')) return true;
        if (targetLower.includes('propio') && (orderComp.includes('propio') || orderComp.includes('directo'))) return true;
        return orderComp.includes(targetLower) || targetLower.includes(orderComp);
      });

      let ventasBrutas = 0;
      let pedidosPendientes = 0;
      let pedidosPagados = 0;
      let netoPendiente = 0;
      let netoPagado = 0;
      let oldestPendingDays = 0;

      compOrders.forEach(ord => {
        const t = ord.total || 0;
        ventasBrutas += t;
        const ordNeto = t - (t * rate) / 100;

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

      const montoComision = (ventasBrutas * rate) / 100;
      const netoTotal = ventasBrutas - montoComision;

      // Semáforo dinámico
      let semaforo: 'verde' | 'amarillo' | 'rojo' = 'verde';
      if (pedidosPendientes > 0) {
        semaforo = oldestPendingDays > (dias || 7) ? 'rojo' : 'amarillo';
      }

      // Solo mostramos empresas activas o que tengan ventas
      results.push({
        id,
        empresa: name,
        pedidosTotal: compOrders.length,
        pedidosPendientes,
        pedidosPagados,
        ventasBrutas: Math.round(ventasBrutas * 100) / 100,
        comisionPorcentaje: rate,
        montoComision: Math.round(montoComision * 100) / 100,
        netoTotal: Math.round(netoTotal * 100) / 100,
        netoPendiente: Math.round(netoPendiente * 100) / 100,
        netoPagado: Math.round(netoPagado * 100) / 100,
        oldestPendingDays,
        semaforo,
        color: color || 'orange',
        orders: compOrders
      });
    });

    return results;
  }, [filteredOrders, configuredCompanies]);

  // Total acumulado que deben las aplicaciones
  const totalPendienteCobrar = useMemo(() => {
    return summaries.reduce((sum, s) => sum + s.netoPendiente, 0);
  }, [summaries]);

  const totalVentasDelivery = useMemo(() => {
    return summaries.reduce((sum, s) => sum + s.ventasBrutas, 0);
  }, [summaries]);

  const totalComisionesRetenidas = useMemo(() => {
    return summaries.reduce((sum, s) => sum + s.montoComision, 0);
  }, [summaries]);

  // Guardar cambio rápido de porcentaje
  const handleSaveQuickCommission = async () => {
    if (!quickEditCompany || !activeRest) return;
    try {
      const currentList = [...configuredCompanies];
      const foundIdx = currentList.findIndex(c => c.id === quickEditCompany.id || c.nombre.toLowerCase() === quickEditCompany.name.toLowerCase());
      
      if (foundIdx >= 0) {
        currentList[foundIdx] = {
          ...currentList[foundIdx],
          comisionPorcentaje: Number(quickEditCompany.percentage) || 0
        };
      } else {
        currentList.push({
          id: quickEditCompany.id || `custom_${Date.now()}`,
          nombre: quickEditCompany.name,
          comisionPorcentaje: Number(quickEditCompany.percentage) || 0,
          activo: true,
          color: 'orange',
          tiempoPagoDias: 7
        });
      }

      await updateRestaurantDeliveryCompanies(activeRest.id, currentList);
      sounds.playSuccess();
      setSuccessMsg(`¡Comisión de ${quickEditCompany.name} actualizada al ${quickEditCompany.percentage}%!`);
      setQuickEditCompany(null);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      console.error('Error al actualizar comisión:', err);
    }
  };

  // Guardar nueva empresa o editar empresa completa
  const handleSaveCompanyConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRest) return;

    if (!newCompanyForm.nombre.trim()) {
      alert('Por favor indica el nombre de la empresa de delivery.');
      return;
    }

    try {
      const currentList = [...configuredCompanies];

      if (editingCompany) {
        // Editando existente
        const idx = currentList.findIndex(c => c.id === editingCompany.id);
        if (idx >= 0) {
          currentList[idx] = {
            ...currentList[idx],
            nombre: newCompanyForm.nombre.trim(),
            comisionPorcentaje: Number(newCompanyForm.comisionPorcentaje) || 0,
            color: newCompanyForm.color,
            tiempoPagoDias: Number(newCompanyForm.tiempoPagoDias) || 7,
            notas: newCompanyForm.notas.trim()
          };
        }
      } else {
        // Creando nueva
        const newId = newCompanyForm.nombre.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);
        currentList.push({
          id: newId,
          nombre: newCompanyForm.nombre.trim(),
          comisionPorcentaje: Number(newCompanyForm.comisionPorcentaje) || 0,
          color: newCompanyForm.color,
          activo: true,
          tiempoPagoDias: Number(newCompanyForm.tiempoPagoDias) || 7,
          notas: newCompanyForm.notas.trim()
        });
      }

      await updateRestaurantDeliveryCompanies(activeRest.id, currentList);
      sounds.playSuccess();
      setSuccessMsg(`¡Empresa "${newCompanyForm.nombre}" guardada correctamente con ${newCompanyForm.comisionPorcentaje}% de comisión!`);
      setIsCreatingNew(false);
      setEditingCompany(null);
      setNewCompanyForm({
        nombre: '',
        comisionPorcentaje: 18,
        color: 'orange',
        tiempoPagoDias: 7,
        notas: ''
      });
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      console.error('Error al guardar configuración de delivery:', err);
      alert('Error al guardar la empresa de delivery.');
    }
  };

  // Eliminar o desactivar empresa
  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    if (!activeRest) return;

    try {
      const updated = configuredCompanies.filter(c => c.id !== companyId);
      await updateRestaurantDeliveryCompanies(activeRest.id, updated);
      sounds.playKeypadClick();
      setSuccessMsg(`¡Empresa "${companyName}" eliminada de la configuración!`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      console.error('Error al eliminar empresa:', err);
    }
  };

  // Abrir modal de depósito
  const handleOpenMarkPaid = (summary: DynamicCompanySummary) => {
    sounds.playKeypadClick();
    setActiveModalCompany(summary);
    setDepositDate(new Date().toISOString().split('T')[0]);
    setRealAmountReceived(summary.netoPendiente);
    setDepositNotes('');
  };

  // Confirmar depósito bancario y conciliación
  const handleConfirmDeposit = async () => {
    if (!activeModalCompany) return;
    setIsProcessing(true);
    sounds.playCashRegister();

    try {
      const pendingOrders = activeModalCompany.orders.filter(o => !o.deliveryPaid);
      const pendingOrderIds = pendingOrders.map(o => o.id);

      await markOrdersDeliveryPaid(pendingOrderIds, {
        businessId,
        restaurantId: selectedBranchId === 'all' ? (pendingOrders[0]?.restaurantId || activeRest?.id || 'central') : selectedBranchId,
        fecha: depositDate,
        empresa: activeModalCompany.empresa,
        montoCalculado: activeModalCompany.netoPendiente,
        montoReal: Number(realAmountReceived) || 0,
        usuario: currentUserName,
        notas: depositNotes
      });

      setSuccessMsg(`¡Depósito de ${activeModalCompany.empresa} registrado correctamente por $${Number(realAmountReceived).toFixed(2)} (${pendingOrderIds.length} comandas conciliadas)!`);
      setActiveModalCompany(null);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Error al registrar depósito de delivery:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const getColorClasses = (colorName?: string) => {
    const found = AVAILABLE_COLORS.find(c => c.id === colorName);
    return found || AVAILABLE_COLORS[2]; // Default orange
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 text-xs sm:text-sm font-bold flex items-center justify-between gap-3 animate-in fade-in shadow-md">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Hero Banner */}
      <div className="bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-800 text-white p-6 sm:p-8 rounded-3xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6 border border-neutral-700 relative overflow-hidden">
        <div className="relative z-10 space-y-2">
          <div className="flex items-center gap-2 text-orange-400 text-xs font-black uppercase tracking-wider">
            <Truck className="w-4 h-4" />
            <span>Conciliación Financiera y Comisiones de Delivery</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
            Las apps te deben: <span className="text-emerald-400 font-mono">${totalPendienteCobrar.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </h2>
          <p className="text-xs sm:text-sm text-neutral-300 max-w-2xl leading-relaxed">
            Monto neto calculado de pedidos cobrados por plataformas de reparto pendiente de liquidar en tu cuenta bancaria (descontando comisiones pactadas).
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2 text-xs">
            <span className="bg-neutral-800/80 px-3 py-1.5 rounded-xl border border-neutral-700 text-neutral-300">
              Ventas Brutas Delivery: <strong className="text-white font-mono">${totalVentasDelivery.toFixed(2)}</strong>
            </span>
            <span className="bg-neutral-800/80 px-3 py-1.5 rounded-xl border border-neutral-700 text-neutral-300">
              Comisiones Retenidas: <strong className="text-red-400 font-mono">-${totalComisionesRetenidas.toFixed(2)}</strong>
            </span>
            <span className="bg-neutral-800/80 px-3 py-1.5 rounded-xl border border-neutral-700 text-amber-300 font-bold">
              ⏳ {filteredOrders.filter(o => !o.deliveryPaid).length} pedidos por conciliar
            </span>
          </div>
        </div>

        {/* Action Controls in Hero */}
        <div className="relative z-10 flex flex-wrap lg:flex-col items-stretch gap-3">
          <button
            onClick={() => {
              sounds.playKeypadClick();
              setIsCreatingNew(false);
              setEditingCompany(null);
              setShowConfigModal(true);
            }}
            className="flex-1 lg:flex-initial px-5 py-3 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-orange-600/30 transition active:scale-98 cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            <span>Gestionar Empresas & Comisiones</span>
          </button>

          <button
            onClick={() => {
              sounds.playKeypadClick();
              setEditingCompany(null);
              setNewCompanyForm({
                nombre: '',
                comisionPorcentaje: 18,
                color: 'purple',
                tiempoPagoDias: 7,
                notas: ''
              });
              setIsCreatingNew(true);
              setShowConfigModal(true);
            }}
            className="flex-1 lg:flex-initial px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border border-white/20 transition active:scale-98 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>Crear Nueva Empresa</span>
          </button>
        </div>
      </div>

      {/* Grid of Delivery Companies */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {summaries.map((item) => {
          const isGreen = item.semaforo === 'verde';
          const isYellow = item.semaforo === 'amarillo';
          const isRed = item.semaforo === 'rojo';
          const colorCfg = getColorClasses(item.color);

          return (
            <div 
              key={item.id}
              className={`bg-white rounded-3xl p-6 border shadow-sm transition-all hover:shadow-md flex flex-col justify-between ${colorCfg.border}`}
            >
              <div>
                {/* Header with Traffic Light Badge & Quick Edit */}
                <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
                  <div className="flex items-center gap-2.5">
                    <span className={`px-3 py-1 rounded-xl text-xs font-black shadow-xs ${colorCfg.badge}`}>
                      {item.empresa}
                    </span>
                    
                    {/* Botón para editar comisión rápido */}
                    <button
                      onClick={() => {
                        sounds.playKeypadClick();
                        setQuickEditCompany({
                          id: item.id,
                          name: item.empresa,
                          percentage: item.comisionPorcentaje
                        });
                      }}
                      className="inline-flex items-center gap-1 text-xs text-neutral-600 hover:text-orange-600 bg-neutral-100 hover:bg-orange-50 px-2 py-0.5 rounded-lg border border-neutral-200 transition font-bold"
                      title="Haz clic para modificar el porcentaje de comisión"
                    >
                      <Percent className="w-3 h-3 text-orange-500" />
                      <span>{item.comisionPorcentaje}%</span>
                      <Edit2 className="w-2.5 h-2.5 text-neutral-400" />
                    </button>
                  </div>

                  {/* Semáforo de estado de pago */}
                  <div className="flex items-center gap-1.5">
                    {isGreen && (
                      <span className="flex items-center gap-1 text-emerald-700 bg-emerald-100/80 border border-emerald-300 px-2.5 py-1 rounded-full text-[11px] font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Al día
                      </span>
                    )}
                    {isYellow && (
                      <span className="flex items-center gap-1 text-amber-800 bg-amber-100/80 border border-amber-300 px-2.5 py-1 rounded-full text-[11px] font-bold">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        Pendiente ({item.oldestPendingDays}d)
                      </span>
                    )}
                    {isRed && (
                      <span className="flex items-center gap-1 text-red-800 bg-red-100/90 border border-red-300 px-2.5 py-1 rounded-full text-[11px] font-black">
                        <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
                        Vencido ({item.oldestPendingDays}d)
                      </span>
                    )}
                  </div>
                </div>

                {/* Metrics */}
                <div className="mt-5 space-y-2.5 text-xs">
                  <div className="flex justify-between items-baseline">
                    <span className="text-neutral-500">Ventas Brutas ({item.pedidosTotal} pedidos):</span>
                    <span className="text-sm font-bold text-neutral-900 font-mono">${item.ventasBrutas.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-baseline text-neutral-500">
                    <span className="flex items-center gap-1">
                      Comisión retenida ({item.comisionPorcentaje}%):
                    </span>
                    <span className="text-red-600 font-bold font-mono">-${item.montoComision.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-baseline text-neutral-500">
                    <span>Neto ya liquidado / depositado:</span>
                    <span className="text-neutral-700 font-bold font-mono">${item.netoPagado.toFixed(2)}</span>
                  </div>

                  <div className="pt-3 border-t border-neutral-200/80 flex justify-between items-baseline bg-white/60 -mx-2 px-2 py-1 rounded-xl">
                    <div>
                      <span className="text-[11px] uppercase font-black tracking-wider text-neutral-700 block">
                        Neto Pendiente por Cobrar:
                      </span>
                      <span className="text-[11px] text-neutral-500 font-medium">
                        {item.pedidosPendientes} pedidos sin liquidar
                      </span>
                    </div>
                    <span className="text-2xl font-black text-emerald-600 font-mono tracking-tight">
                      ${item.netoPendiente.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 pt-4 border-t border-neutral-100 flex flex-col gap-2">
                {item.netoPendiente > 0 ? (
                  <button
                    onClick={() => handleOpenMarkPaid(item)}
                    className="w-full py-2.5 bg-neutral-950 hover:bg-black text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm active:scale-98 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Marcar depósito recibido</span>
                  </button>
                ) : (
                  <div className="w-full py-2 bg-neutral-100 text-neutral-500 rounded-2xl text-xs font-bold text-center flex items-center justify-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Sin saldos pendientes</span>
                  </div>
                )}

                {item.orders.length > 0 && (
                  <button
                    onClick={() => {
                      sounds.playKeypadClick();
                      setViewOrdersCompany(item);
                    }}
                    className="w-full py-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Ver {item.orders.length} pedidos de {item.empresa}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL: CONFIGURAR EMPRESAS & COMISIONES */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-neutral-200 space-y-6 max-h-[90vh] overflow-y-auto overscroll-contain">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-black">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-lg sm:text-xl text-neutral-900">
                    Empresas de Delivery & Comisiones
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Sucursal: <strong>{activeRest?.nombre || 'General'}</strong> · Modifica porcentajes o agrega nuevos canales de reparto
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowConfigModal(false);
                  setIsCreatingNew(false);
                  setEditingCompany(null);
                }}
                className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Subformulario: Crear o Editar Empresa */}
            {isCreatingNew || editingCompany ? (
              <form onSubmit={handleSaveCompanyConfig} className="bg-orange-50/50 p-5 rounded-3xl border border-orange-200/80 space-y-4 animate-in zoom-in-95">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-orange-950 flex items-center gap-2">
                    <Bike className="w-4 h-4 text-orange-600" />
                    <span>{editingCompany ? 'Editar Empresa de Delivery' : 'Alta de Nueva Empresa de Delivery'}</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingNew(false);
                      setEditingCompany(null);
                    }}
                    className="text-xs font-bold text-neutral-500 hover:text-neutral-800"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Nombre de la Empresa / Canal:
                    </label>
                    <input
                      type="text"
                      required
                      value={newCompanyForm.nombre}
                      onChange={(e) => setNewCompanyForm({ ...newCompanyForm, nombre: e.target.value })}
                      placeholder="Ej: Didi Food, Yummy, Ridery, Reparto Propio"
                      className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-bold bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      % Comisión Retenida por la Plataforma:
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        required
                        value={newCompanyForm.comisionPorcentaje}
                        onChange={(e) => setNewCompanyForm({ ...newCompanyForm, comisionPorcentaje: parseFloat(e.target.value) || 0 })}
                        placeholder="Ej: 18.5"
                        className="w-full h-10 px-3 pr-8 rounded-xl border border-neutral-300 text-xs font-bold bg-white font-mono focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-xs">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Color de Insignia / Tarjeta:
                    </label>
                    <select
                      value={newCompanyForm.color}
                      onChange={(e) => setNewCompanyForm({ ...newCompanyForm, color: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-semibold bg-white cursor-pointer"
                    >
                      {AVAILABLE_COLORS.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Días promedio para liquidación bancaria:
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={newCompanyForm.tiempoPagoDias}
                      onChange={(e) => setNewCompanyForm({ ...newCompanyForm, tiempoPagoDias: parseInt(e.target.value) || 7 })}
                      className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-bold bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    Notas o condiciones (Opcional):
                  </label>
                  <input
                    type="text"
                    value={newCompanyForm.notas}
                    onChange={(e) => setNewCompanyForm({ ...newCompanyForm, notas: e.target.value })}
                    placeholder="Ej: Pago semanal los miércoles vía transferencia"
                    className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs bg-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingNew(false);
                      setEditingCompany(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-xs font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-md flex items-center gap-1.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>{editingCompany ? 'Actualizar Empresa' : 'Guardar y Agregar'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex justify-between items-center">
                <span className="text-xs font-extrabold text-neutral-600 uppercase tracking-wider">
                  Empresas Activas Configuras ({configuredCompanies.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playKeypadClick();
                    setIsCreatingNew(true);
                    setEditingCompany(null);
                    setNewCompanyForm({
                      nombre: '',
                      comisionPorcentaje: 18,
                      color: 'purple',
                      tiempoPagoDias: 7,
                      notas: ''
                    });
                  }}
                  className="px-3.5 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold border border-orange-200 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-orange-600" />
                  <span>Crear otra empresa</span>
                </button>
              </div>
            )}

            {/* Listado de empresas configuradas */}
            <div className="space-y-3">
              {configuredCompanies.map((comp) => {
                const colorCfg = getColorClasses(comp.color);
                return (
                  <div
                    key={comp.id}
                    className="p-4 rounded-2xl border border-neutral-200 bg-white hover:border-neutral-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1.5 rounded-xl text-xs font-black shadow-xs ${colorCfg.badge}`}>
                        {comp.nombre}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-neutral-900">
                            Comisión: {comp.comisionPorcentaje}%
                          </span>
                          <span className="text-[11px] text-neutral-400">
                            · Liquidación en {comp.tiempoPagoDias || 7} días
                          </span>
                        </div>
                        {comp.notas && (
                          <p className="text-[11px] text-neutral-500 mt-0.5">{comp.notas}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => {
                          sounds.playKeypadClick();
                          setEditingCompany(comp);
                          setIsCreatingNew(false);
                          setNewCompanyForm({
                            nombre: comp.nombre,
                            comisionPorcentaje: comp.comisionPorcentaje,
                            color: comp.color || 'orange',
                            tiempoPagoDias: comp.tiempoPagoDias || 7,
                            notas: comp.notas || ''
                          });
                        }}
                        className="p-2 text-neutral-500 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition"
                        title="Editar porcentaje o datos de esta empresa"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {configuredCompanies.length > 1 && (
                        <button
                          onClick={() => handleDeleteCompany(comp.id, comp.nombre)}
                          className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                          title="Eliminar empresa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-neutral-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowConfigModal(false);
                  setIsCreatingNew(false);
                  setEditingCompany(null);
                }}
                className="px-6 py-2.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold transition shadow-sm"
              >
                Cerrar Configuración
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CAMBIO RÁPIDO DE PORCENTAJE DE COMISIÓN */}
      {quickEditCompany && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <h4 className="font-black text-sm text-neutral-900 flex items-center gap-2">
                <Percent className="w-4 h-4 text-orange-600" />
                <span>Modificar Comisión: {quickEditCompany.name}</span>
              </h4>
              <button onClick={() => setQuickEditCompany(null)} className="text-neutral-400 hover:text-neutral-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-500">
              Ajusta el porcentaje de comisión pactado con <strong>{quickEditCompany.name}</strong> para el cálculo de conciliación y liquidaciones netas.
            </p>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-neutral-700">
                Nuevo Porcentaje de Comisión (%):
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  autoFocus
                  value={quickEditCompany.percentage}
                  onChange={(e) => setQuickEditCompany({ ...quickEditCompany, percentage: parseFloat(e.target.value) || 0 })}
                  className="w-full h-11 px-3.5 pr-8 rounded-xl border border-neutral-300 text-sm font-black font-mono focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-sm">%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuickEditCompany(null)}
                className="py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveQuickCommission}
                className="py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shadow-md"
              >
                Guardar %
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VER COMANDAS ASOCIADAS */}
      {viewOrdersCompany && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-neutral-200 space-y-5 max-h-[90vh] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div>
                <h3 className="font-black text-base sm:text-lg text-neutral-900">
                  Comandas de Delivery: {viewOrdersCompany.empresa}
                </h3>
                <p className="text-xs text-neutral-500">
                  {viewOrdersCompany.orders.length} pedidos registrados ({viewOrdersCompany.pedidosPendientes} pendientes de liquidar)
                </p>
              </div>
              <button
                onClick={() => setViewOrdersCompany(null)}
                className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {viewOrdersCompany.orders.map((ord) => {
                const sub = ord.total || 0;
                const comm = (sub * viewOrdersCompany.comisionPorcentaje) / 100;
                const net = sub - comm;

                return (
                  <div
                    key={ord.id}
                    className={`p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                      ord.deliveryPaid ? 'bg-neutral-50/60 border-neutral-200' : 'bg-amber-50/30 border-amber-200'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <strong className="text-neutral-900 font-mono">#{ord.id.slice(-5)}</strong>
                        <span className="text-neutral-500">
                          {new Date(ord.creadoEn || ord.cobradoEn || '').toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                        {ord.deliveryPaid ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            Liquidado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold">
                            Por liquidar
                          </span>
                        )}
                      </div>
                      <p className="text-neutral-600 font-medium">
                        Cliente: <strong>{ord.clienteNombre || 'Cliente Delivery'}</strong>
                        {ord.clienteDireccion && ` · 📍 ${ord.clienteDireccion}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <span className="text-[11px] text-neutral-400 block">Total Bruto:</span>
                        <strong className="font-mono text-neutral-800">${sub.toFixed(2)}</strong>
                      </div>
                      <div>
                        <span className="text-[11px] text-red-500 block">Comisión:</span>
                        <span className="font-mono text-red-600 font-bold">-${comm.toFixed(2)}</span>
                      </div>
                      <div className="pl-2 border-l border-neutral-200">
                        <span className="text-[11px] text-emerald-600 font-bold block">Neto:</span>
                        <strong className="font-mono text-emerald-700 text-sm">${net.toFixed(2)}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-neutral-100 flex justify-end">
              <button
                onClick={() => setViewOrdersCompany(null)}
                className="px-5 py-2 bg-neutral-900 text-white rounded-xl text-xs font-bold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MARCAR DEPÓSITO RECIBIDO Y GUARDAR DIFERENCIAS / AJUSTES */}
      {activeModalCompany && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-neutral-100 space-y-6 max-h-[90vh] overflow-y-auto overscroll-contain">
            
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
