import { UNIQUE_BUSINESS_ID } from '../config/business';
import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { useAuth } from '../context/AuthContext';
import { MenuItem, Restaurant, Employee, Shift, Order, EmployeeSalaryType, CashRegisterClose, MenuAuditLog, MenuAuditActionType, MenuAuditLogChange, InventoryItem, Expense, DailyStat } from '../types';
import { 
  createRestaurant, 
  updateRestaurant, 
  createEmployee, 
  updateEmployee, 
  deleteEmployee,
  createMenuItem, 
  setMenuItem,
  generateMenuItemId,
  updateMenuItem, 
  updateMenuItemStock,
  quickAdjustMenuItemStock,
  deleteMenuItem,
  updateRestaurantTableCount,
  renumberTables,
  payShiftSalary,
  getRestaurantOperationalCounts,
  getRestaurantFullCounts,
  resetOperationalData,
  deleteRestaurantCascade,
  deleteAllAccountData,
  OperationalStatsSummary,
  FullRestaurantStatsSummary,
  resetTestOperationalData,
  getTestOperationalCounts,
  TestOperationalSummary,
  updateBusiness,
  seedQuickTestingDishesAndOrder,
  simulateTableOrder,
  simulateExpressOrder,
  simulateCashShift,
  subscribeToCashCloses,
  recordMenuAuditLog,
  subscribeToMenuAuditLogs,
  seedSampleMenuAuditLogsIfEmpty,
  subscribeToInventoryItems,
  quickAdjustInventoryItemStock,
  subscribeToExpenses,
  subscribeToArchivedMenuItems,
  getOperationalDateString
} from '../services/dataService';
import { getDailyStatsForRange } from '../services/financialService';
import { uploadDishPhoto, migrateBase64MenuItemsToStorage } from '../services/storageService';
import { sounds } from '../utils/sound';
import { LogoUploader } from './LogoUploader';
import { FinancialDashboard } from './FinancialDashboard';
import { DeliveryReconciliation } from './DeliveryReconciliation';
import { StaffAttendanceAdminView } from './StaffAttendanceAdminView';
import { DailySalesExpensesTrendChart } from './DailySalesExpensesTrendChart';
import { AdminRepairModal } from './AdminRepairModal';
import { DishCostProfitReport } from './DishCostProfitReport';
import { KeyIndicatorsPanel } from './KeyIndicatorsPanel';
import { OrderHistoryAdminView } from './OrderHistoryAdminView';
import { AdminMessageCenterModal } from './AdminMessageCenterModal';
import { LowStockNotificationBanner } from './LowStockNotificationBanner';
import { QuickRestockModal } from './QuickRestockModal';
import { AdminPdfReportsModal } from './AdminPdfReportsModal';
import { MenuAuditLogsTable } from './MenuAuditLogsTable';
import { InventoryManager } from './InventoryManager';
import { 
  ShieldCheck, 
  ShieldAlert,
  Store, 
  Users, 
  UtensilsCrossed, 
  Clock, 
  Plus, 
  Edit2, 
  Trash2, 
  KeyRound, 
  DollarSign, 
  Check, 
  X, 
  TrendingUp,
  AlertTriangle,
  FileSpreadsheet,
  Grid3X3,
  RefreshCw,
  Flame,
  CreditCard,
  CheckCircle2,
  Receipt,
  RotateCcw,
  Upload,
  Image as ImageIcon,
  Loader2,
  Table as TableIcon,
  LayoutGrid,
  Truck,
  ChefHat,
  Zap,
  Coffee,
  ShoppingBag,
  Wrench,
  Percent,
  Calculator,
  PieChart,
  FlaskConical,
  PlayCircle,
  Wallet,
  BarChart3,
  History,
  ReceiptText,
  Boxes,
  PackageCheck,
  PackagePlus,
  PackageX,
  FileDown,
  ClipboardList,
  Info
} from 'lucide-react';

interface AdminDashboardProps {
  restaurants: Restaurant[];
  employees: Employee[];
  menuItems: MenuItem[];
  shifts: Shift[];
  orders: Order[];
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  restaurants,
  employees,
  menuItems,
  shifts,
  orders
}) => {
  const { 
    resetEmployeePin, 
    updateEmployeeHourlyRate, 
    currentRestaurant, 
    selectRestaurant, 
    currentUserAccount, 
    currentEmployee,
    currentBusiness,
    securityAlerts,
    markAlertRead,
    deleteAlert,
    dismissAndClearAlert,
    clearReadAlerts,
    clearAllAlerts
  } = useAuth();
  
  const activeBizId = currentUserAccount?.businessId || currentBusiness?.id || UNIQUE_BUSINESS_ID;
  
  // Navigation tabs (Indicadores unificados, historial, finanzas, asistencia, gestión, inventario y pruebas)
  const [activeTab, setActiveTab] = useState<'indicadores' | 'inventario' | 'historial_pedidos' | 'financiero' | 'conciliacion' | 'asistencia' | 'restaurantes' | 'empleados' | 'menu' | 'auditoria_menu' | 'turnos' | 'peligro'>('indicadores');

  // Registros de Auditoría de Menú y Stock
  const [menuAuditLogs, setMenuAuditLogs] = useState<MenuAuditLog[]>([]);
  const [isAuditLogsLoading, setIsAuditLogsLoading] = useState(true);

  // Inventario de Insumos y Materias Primas
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [archivedMenuItems, setArchivedMenuItems] = useState<MenuItem[]>([]);

  // Modal de confirmación para borrar plato del menú sin afectar historial de ventas
  const [dishToDeleteModal, setDishToDeleteModal] = useState<MenuItem | null>(null);
  const [isDeletingDish, setIsDeletingDish] = useState(false);
  const [dishDeletedToast, setDishDeletedToast] = useState<string | null>(null);

  // Estados para Gráfico de Líneas Dinámico de Evolución Diaria de Ventas (Recharts)
  const [adminExpenses, setAdminExpenses] = useState<Expense[]>([]);
  const [adminDailyStats, setAdminDailyStats] = useState<DailyStat[]>([]);
  const [salesChartDaysRange, setSalesChartDaysRange] = useState<'7d' | '14d' | '30d'>('14d');
  const [salesChartBranchFilter, setSalesChartBranchFilter] = useState<string>('all');
  const [showAdminSalesLine, setShowAdminSalesLine] = useState<boolean>(true);
  const [showAdminProfitLine, setShowAdminProfitLine] = useState<boolean>(true);
  const [showAdminExpensesLine, setShowAdminExpensesLine] = useState<boolean>(true);
  const [showAdminTicketLine, setShowAdminTicketLine] = useState<boolean>(false);

  // Suscripción en tiempo real a auditoría de menú y stock + insumos de inventario + estadísticas diarias
  useEffect(() => {
    if (!activeBizId) return;
    setIsAuditLogsLoading(true);
    const unsub = subscribeToMenuAuditLogs(activeBizId, (data) => {
      setMenuAuditLogs(data);
      setIsAuditLogsLoading(false);
    });
    const unsubInv = subscribeToInventoryItems(
      currentRestaurant?.id || 'all',
      (items) => {
        setInventoryItems(items);
      },
      activeBizId
    );
    const unsubArchived = subscribeToArchivedMenuItems(activeBizId, setArchivedMenuItems);
    const unsubExp = subscribeToExpenses('all', setAdminExpenses, activeBizId);
    const now = new Date();
    const start30 = new Date(now);
    start30.setDate(now.getDate() - 31);
    getDailyStatsForRange('all', getOperationalDateString(start30), getOperationalDateString(now), activeBizId)
      .then(setAdminDailyStats)
      .catch(() => {});
    return () => {
      if (unsub) unsub();
      if (unsubInv) unsubInv();
      if (unsubArchived) unsubArchived();
      if (unsubExp) unsubExp();
    };
  }, [activeBizId, currentRestaurant?.id]);

  // Evolución diaria de las ventas calculada dinámicamente para Recharts LineChart
  const dailySalesEvolutionData = useMemo(() => {
    const daysCount = salesChartDaysRange === '7d' ? 7 : salesChartDaysRange === '14d' ? 14 : 30;
    const now = new Date();
    const effectiveBranch = salesChartBranchFilter !== 'all' ? salesChartBranchFilter : (currentRestaurant?.id || 'all');

    const branchOrders = effectiveBranch === 'all'
      ? orders
      : orders.filter(o => o.restaurantId === effectiveBranch);
    const branchExpenses = effectiveBranch === 'all'
      ? adminExpenses
      : adminExpenses.filter(e => e.restaurantId === effectiveBranch);
    const branchStats = effectiveBranch === 'all'
      ? adminDailyStats
      : adminDailyStats.filter(s => s.restaurantId === effectiveBranch);

    const points: {
      fecha: string;
      label: string;
      ventas: number;
      gastos: number;
      ganancia: number;
      pedidos: number;
      ticketPromedio: number;
    }[] = [];

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = getOperationalDateString(d);

      const dayOrders = branchOrders.filter(o => {
        const isPaid = o.estado === 'cobrado' || o.estadoPago === 'cobrado';
        if (!isPaid) return false;
        const refDate = o.pagadoEn || o.creadoEn;
        return refDate && getOperationalDateString(new Date(refDate)) === dateStr;
      });
      const liveSales = dayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      const liveCount = dayOrders.length;

      const statDocs = branchStats.filter(s => s.fecha === dateStr);
      const statSales = statDocs.reduce((sum, s) => sum + (Number(s.ventasTotales) || 0), 0);
      const statCount = statDocs.reduce((sum, s) => sum + (Number(s.pedidosCobrados) || 0), 0);

      const dSales = Math.max(liveSales, statSales);
      const dCount = Math.max(liveCount, statCount);

      const dExp = branchExpenses
        .filter(e => e.fecha && getOperationalDateString(new Date(e.fecha)) === dateStr)
        .reduce((sum, e) => sum + (Number(e.monto) || 0), 0);

      const labelStr = d.toLocaleDateString('es-ES', {
        weekday: daysCount <= 14 ? 'short' : undefined,
        day: '2-digit',
        month: 'short'
      });

      points.push({
        fecha: dateStr,
        label: labelStr,
        ventas: Math.round(dSales * 100) / 100,
        gastos: Math.round(dExp * 100) / 100,
        ganancia: Math.round((dSales - dExp) * 100) / 100,
        pedidos: dCount,
        ticketPromedio: dCount > 0 ? Math.round((dSales / dCount) * 100) / 100 : 0
      });
    }

    return points;
  }, [orders, adminExpenses, adminDailyStats, salesChartDaysRange, salesChartBranchFilter, currentRestaurant?.id]);

  const dailySalesEvolutionStats = useMemo(() => {
    if (dailySalesEvolutionData.length === 0) {
      return { totalSales: 0, avgDailySales: 0, bestDay: null as null | typeof dailySalesEvolutionData[0], totalOrders: 0 };
    }
    const totalSales = dailySalesEvolutionData.reduce((acc, p) => acc + p.ventas, 0);
    const totalOrders = dailySalesEvolutionData.reduce((acc, p) => acc + p.pedidos, 0);
    const avgDailySales = totalSales / dailySalesEvolutionData.length;
    const bestDay = dailySalesEvolutionData.reduce(
      (best, curr) => (curr.ventas > (best?.ventas ?? -1) ? curr : best),
      dailySalesEvolutionData[0]
    );
    return { totalSales, avgDailySales, bestDay, totalOrders };
  }, [dailySalesEvolutionData]);

  // Modal Centro de Mensajes & Avisos de Seguridad
  const [showMessageCenterModal, setShowMessageCenterModal] = useState(false);

  // Modal Reparar Pedidos Atascados
  const [showRepairModal, setShowRepairModal] = useState(false);

  // Modal Exportación PDF (Inventario y Cierres de Caja)
  const [showPdfExportModal, setShowPdfExportModal] = useState(false);
  const [pdfModalInitialTab, setPdfModalInitialTab] = useState<'inventario' | 'cierres'>('inventario');
  const [cashCloses, setCashCloses] = useState<CashRegisterClose[]>([]);

  // Suscripción a cierres de caja en tiempo real para reportes de auditoría
  useEffect(() => {
    const unsub = subscribeToCashCloses(activeBizId, null, (data) => {
      setCashCloses(data);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [activeBizId]);

  // Restaurant Modal State
  const [showRestModal, setShowRestModal] = useState(false);
  const [editingRest, setEditingRest] = useState<Restaurant | null>(null);
  const [restFormError, setRestFormError] = useState<string | null>(null);
  const [restForm, setRestForm] = useState<{
    nombre: string;
    direccion: string;
    telefono: string;
    codigoSede: string;
    activo: boolean;
    numeroMesas: number;
    usaCocina: boolean;
    logoUrl?: string | null;
  }>({ nombre: '', direccion: '', telefono: '', codigoSede: '', activo: true, numeroMesas: 10, usaCocina: true, logoUrl: '' });

  const generateUniqueCodigoSedeForBusiness = (excludeId?: string): string => {
    const used = new Set(
      restaurants
        .filter(r => r.id !== excludeId && r.codigoSede)
        .map(r => (r.codigoSede || '').trim())
    );
    for (let i = 0; i < 200; i++) {
      const candidate = String(Math.floor(1000 + Math.random() * 9000));
      if (!used.has(candidate)) return candidate;
    }
    return String(Math.floor(1000 + Math.random() * 9000));
  };

  // Modal Gestión de Mesas
  const [tableModalRest, setTableModalRest] = useState<Restaurant | null>(null);
  const [tableCountInput, setTableCountInput] = useState<number>(10);
  const [tableOperationMsg, setTableOperationMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isProcessingTables, setIsProcessingTables] = useState(false);

  // Modal Zona de Peligro & Cascade Deletion & Reset de Pruebas
  const [dangerModal, setDangerModal] = useState<{
    type: 'reset_operational' | 'delete_restaurant' | 'delete_account' | 'reset_test_data';
    restaurant?: Restaurant;
    summary?: OperationalStatsSummary | FullRestaurantStatsSummary | TestOperationalSummary;
  } | null>(null);
  const [isProcessingDanger, setIsProcessingDanger] = useState(false);
  const [dangerConfirmationText, setDangerConfirmationText] = useState('');

  // Payment of Shift Salary state
  const [payingShiftId, setPayingShiftId] = useState<string | null>(null);
  const [paySuccessToast, setPaySuccessToast] = useState<string | null>(null);

  // Simulación de pruebas operativas en 1 clic
  const [simulatingAction, setSimulatingAction] = useState<string | null>(null);
  const [simFeedback, setSimFeedback] = useState<string | null>(null);

  // Diagnóstico de Procesos y Seguridad
  const [runningDiagnostic, setRunningDiagnostic] = useState(false);
  const [diagnosticResults, setDiagnosticResults] = useState<{
    firestore: boolean;
    multiTenant: boolean;
    branchesAndTables: { branches: number; tables: number; ok: boolean };
    staff: { total: number; validPin: number; ok: boolean };
    menu: { total: number; withPrices: number; ok: boolean };
    warnings: string[];
    timestamp: Date;
  } | null>(null);

  const handleRunDiagnostic = () => {
    setRunningDiagnostic(true);
    setTimeout(() => {
      const warnings: string[] = [];
      const branchOk = restaurants.length > 0;
      if (!branchOk) warnings.push('No hay ninguna sucursal creada todavía.');
      
      const totalTables = restaurants.reduce((acc, r) => acc + (r.numeroMesas || 10), 0);
      if (totalTables === 0) warnings.push('No se han configurado mesas en los locales.');

      const staffOk = employees.length > 0;
      if (!staffOk) warnings.push('No hay personal operativo creado. Cree al menos un Mesero, Cocinero y Cajero.');
      const staffWithoutPin = employees.filter(e => !e.pin || e.pin.length !== 4);
      if (staffWithoutPin.length > 0) warnings.push(`Hay ${staffWithoutPin.length} colaboradores con PIN inválido.`);

      const menuOk = menuItems.length > 0;
      if (!menuOk) warnings.push('La carta está vacía. Agregue platos o use la opción Sembrar Platos Demo.');
      const itemsZeroPrice = menuItems.filter(m => !m.precio || m.precio <= 0);
      if (itemsZeroPrice.length > 0) warnings.push(`Hay ${itemsZeroPrice.length} platos con precio 0.`);

      setDiagnosticResults({
        firestore: true,
        multiTenant: Boolean(activeBizId),
        branchesAndTables: { branches: restaurants.length, tables: totalTables, ok: branchOk && totalTables > 0 },
        staff: { total: employees.length, validPin: employees.length - staffWithoutPin.length, ok: staffOk && staffWithoutPin.length === 0 },
        menu: { total: menuItems.length, withPrices: menuItems.length - itemsZeroPrice.length, ok: menuOk && itemsZeroPrice.length === 0 },
        warnings,
        timestamp: new Date()
      });
      sounds.playNotification();
      setRunningDiagnostic(false);
    }, 400);
  };

  // Employee Modal State
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({
    nombre: '',
    puesto: 'mesero' as any,
    pin: '',
    modalidadPago: 'por_dia' as EmployeeSalaryType,
    tarifaHora: 12.0,
    tarifaDiaria: 50.0,
    sueldoMensual: 1200.0,
    restaurantId: '',
    activo: true,
  });

  // PIN Reset Quick Prompt
  const [pinResetModal, setPinResetModal] = useState<{ empId: string; empName: string; newPin: string } | null>(null);

  // Menu Item Modal State
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState<MenuItem | null>(null);
  const [menuViewMode, setMenuViewMode] = useState<'tabla' | 'tarjetas'>('tabla');
  const [menuPrepFilter, setMenuPrepFilter] = useState<'all' | 'cocina' | 'express' | 'stock_bajo' | 'control_stock'>('all');
  const [isManualCocinaTouched, setIsManualCocinaTouched] = useState(false);
  const [menuForm, setMenuForm] = useState({
    nombre: '',
    descripcion: '',
    precio: 10.0,
    costoElaboracion: 4.0,
    categoria: 'Platos Fuertes',
    requiereCocina: true,
    disponible: true,
    controlaStock: false,
    stockActual: 20,
    stockMinimo: 5,
    unidadMedida: 'unidades',
    restaurantId: 'all',
    fotoUrl: '',
    imagenUrl: ''
  });
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isMigratingPhotos, setIsMigratingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper para sugerir si la categoría no requiere cocina
  const isCategoryNoKitchen = (cat: string) => {
    const c = cat.toLowerCase().trim();
    return c.includes('bebida') || c.includes('postre') || c.includes('panader') || 
           c.includes('cafe') || c.includes('café') || c.includes('snack') || 
           c.includes('dulce') || c.includes('helado') || c.includes('gaseosa') || 
           c.includes('cerveza') || c.includes('trago') || c.includes('jugo') || 
           c.includes('refresco') || c.includes('licor') || c.includes('vino');
  };

  // Métricas generales
  const totalSales = orders
    .filter(o => o.estado === 'cobrado')
    .reduce((sum, o) => sum + (o.total || 0), 0);

  const completedOrdersCount = orders.filter(o => o.estado === 'cobrado').length;
  const activeEmployeesCount = employees.filter(e => e.activo).length;

  // Handlers para Restaurantes
  const handleSaveRestaurant = async () => {
    setRestFormError(null);
    if (!restForm.nombre.trim()) {
      setRestFormError('Por favor ingresá el nombre del restaurante o sucursal.');
      return;
    }

    const rawCodigo = (restForm.codigoSede || '').trim() || generateUniqueCodigoSedeForBusiness(editingRest?.id);
    if (!/^\d{4}$/.test(rawCodigo)) {
      setRestFormError('El código de sede debe contener exactamente 4 dígitos numéricos (ej: 2481).');
      return;
    }

    const duplicateRest = restaurants.find(
      r => r.id !== editingRest?.id && (r.codigoSede || '').trim() === rawCodigo
    );
    if (duplicateRest) {
      setRestFormError(`El código de sede ${rawCodigo} ya está asignado a "${duplicateRest.nombre}". Ingresá otro código único de 4 dígitos.`);
      return;
    }

    const payload = {
      ...restForm,
      codigoSede: rawCodigo
    };

    if (editingRest) {
      await updateRestaurant(editingRest.id, payload);
    } else {
      // Verificar límite de sucursales según plan de suscripción
      const limitSucursales = currentBusiness?.suscripcion?.limiteSucursales || 
        (currentBusiness?.plan === 'enterprise' ? 10 : currentBusiness?.plan === 'pro' ? 3 : 1);

      if (restaurants.length >= limitSucursales) {
        alert(`⚠️ Límite de sucursales alcanzado.\n\nTu plan (${currentBusiness?.suscripcion?.plan?.toUpperCase() || currentBusiness?.plan?.toUpperCase() || 'BÁSICO'}) permite un máximo de ${limitSucursales} sucursal(es).\n\nContacta con el Creador/SuperAdmin para actualizar tu suscripción a un plan superior.`);
        return;
      }

      await createRestaurant(payload, activeBizId);
    }
    setShowRestModal(false);
    setEditingRest(null);
    setRestFormError(null);
  };

  // Handler para guardar cambio de número de mesas
  const handleUpdateTableCount = async () => {
    if (!tableModalRest) return;
    setIsProcessingTables(true);
    setTableOperationMsg(null);
    try {
      const res = await updateRestaurantTableCount(tableModalRest.id, tableCountInput);
      if (res.success) {
        setTableOperationMsg({ type: 'success', text: `¡Mesas actualizadas correctamente a ${tableCountInput}!` });
        sounds.playCashRegister();
      } else {
        setTableOperationMsg({ type: 'error', text: res.error || 'Error al actualizar mesas.' });
      }
    } catch (err: any) {
      setTableOperationMsg({ type: 'error', text: err.message || 'Error inesperado.' });
    } finally {
      setIsProcessingTables(false);
    }
  };

  // Handler para renumerar mesas
  const handleRenumberTables = async () => {
    if (!tableModalRest) return;
    setIsProcessingTables(true);
    setTableOperationMsg(null);
    try {
      await renumberTables(tableModalRest.id);
      setTableOperationMsg({ type: 'success', text: '¡Mesas renumeradas correlativamente del 1 al N con éxito!' });
      sounds.playKeypadClick();
    } catch (err: any) {
      setTableOperationMsg({ type: 'error', text: err.message || 'Error al renumerar mesas.' });
    } finally {
      setIsProcessingTables(false);
    }
  };

  // Handler para pagar sueldo de turno
  const handlePayShift = async (shift: Shift) => {
    const employee = employees.find(e => e.id === shift.employeeId);
    if (!employee) {
      alert('No se encontró el empleado asociado a este turno.');
      return;
    }
    setPayingShiftId(shift.id);
    try {
      sounds.playCashRegister();
      const res = await payShiftSalary(shift, employee);
      setPaySuccessToast(`¡Pago de $${res.amount.toFixed(2)} registrado como gasto para ${employee.nombre}!`);
      setTimeout(() => setPaySuccessToast(null), 5000);
    } catch (err: any) {
      alert('Error al procesar el pago: ' + err.message);
    } finally {
      setPayingShiftId(null);
    }
  };

  // Abrir modal de Zona de Peligro previa carga del resumen
  const handleOpenDangerModal = async (type: 'reset_operational' | 'delete_restaurant' | 'delete_account' | 'reset_test_data', rest?: Restaurant) => {
    setIsProcessingDanger(true);
    setDangerConfirmationText('');
    try {
      if (type === 'reset_test_data') {
        const summary = await getTestOperationalCounts(activeBizId);
        setDangerModal({ type, summary });
      } else if (type === 'reset_operational' && rest) {
        const summary = await getRestaurantOperationalCounts(rest.id);
        setDangerModal({ type, restaurant: rest, summary });
      } else if (type === 'delete_restaurant' && rest) {
        const summary = await getRestaurantFullCounts(rest.id);
        setDangerModal({ type, restaurant: rest, summary });
      } else if (type === 'delete_account') {
        setDangerModal({ type });
      }
    } catch (err: any) {
      alert('Error al calcular datos: ' + err.message);
    } finally {
      setIsProcessingDanger(false);
    }
  };

  // Ejecutar acción de zona de peligro tras confirmación
  const handleExecuteDangerAction = async () => {
    if (!dangerModal) return;
    setIsProcessingDanger(true);
    try {
      if (dangerModal.type === 'reset_test_data') {
        const res = await resetTestOperationalData(activeBizId);
        sounds.playCashRegister();
        alert(`¡Fase de pruebas restablecida con éxito! Se eliminaron ${res.pedidos} pedidos, ${res.gastos} gastos, ${res.turnos} turnos y se liberaron las mesas.`);
      } else if (dangerModal.type === 'reset_operational' && dangerModal.restaurant) {
        await resetOperationalData(dangerModal.restaurant.id);
        alert(`Datos operativos de ${dangerModal.restaurant.nombre} restablecidos.`);
      } else if (dangerModal.type === 'delete_restaurant' && dangerModal.restaurant) {
        await deleteRestaurantCascade(dangerModal.restaurant.id);
        alert(`Restaurante ${dangerModal.restaurant.nombre} eliminado completamente.`);
        // Si borró el seleccionado, cambiar al primero restante
        const remaining = restaurants.filter(r => r.id !== dangerModal.restaurant?.id);
        if (remaining.length > 0) {
          selectRestaurant(remaining[0].id);
        }
      } else if (dangerModal.type === 'delete_account') {
        await deleteAllAccountData(activeBizId);
        alert('Toda la cuenta ha sido eliminada. Redirigiendo...');
        window.location.reload();
      }
      setDangerModal(null);
    } catch (err: any) {
      alert('Error en la operación: ' + err.message);
    } finally {
      setIsProcessingDanger(false);
    }
  };

  // Handlers para Empleados (sin tarifa por hora: modalidad por día o sueldo mensual)
  const handleSaveEmployee = async () => {
    if (!empForm.nombre.trim() || empForm.pin.length !== 4) {
      alert('Por favor ingrese el nombre y un PIN de exactamente 4 dígitos.');
      return;
    }
    const rawMod = empForm.modalidadPago || 'por_dia';
    const mod: 'por_dia' | 'mes' = (rawMod === 'mes' || rawMod === 'fijo') ? 'mes' : 'por_dia';

    if (mod === 'por_dia' && (!empForm.tarifaDiaria || empForm.tarifaDiaria <= 0)) {
      alert('El sueldo por día debe ser un número mayor que cero.');
      return;
    }
    if (mod === 'mes' && (!empForm.sueldoMensual || empForm.sueldoMensual <= 0)) {
      alert('El sueldo mensual debe ser un número mayor que cero.');
      return;
    }

    const targetRestId = empForm.restaurantId || restaurants[0]?.id;
    const payload = {
      ...empForm,
      modalidadPago: mod,
      tipoSueldo: (mod === 'mes' ? 'fijo' : 'por_dia') as EmployeeSalaryType,
      restaurantId: targetRestId
    };

    if (editingEmp) {
      await updateEmployee(editingEmp.id, payload);
    } else {
      await createEmployee({ ...payload, businessId: activeBizId });
    }
    setShowEmpModal(false);
    setEditingEmp(null);
  };

  const handleConfirmResetPin = async () => {
    if (!pinResetModal || pinResetModal.newPin.length !== 4) {
      alert('El PIN debe tener exactamente 4 dígitos.');
      return;
    }
    await resetEmployeePin(pinResetModal.empId, pinResetModal.newPin);
    alert(`PIN actualizado exitosamente para ${pinResetModal.empName}`);
    setPinResetModal(null);
  };

  // Handlers para Menú y Subida de Fotos
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Selector de archivos que acepta JPG, PNG, WEBP
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Por favor selecciona una foto válida en formato JPG, PNG o WEBP.');
      return;
    }

    setSelectedPhotoFile(file);
    // 2. Vista previa de la foto inmediatamente al seleccionarla
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreviewUrl(previewUrl);
  };

  const handleRemovePhoto = () => {
    setSelectedPhotoFile(null);
    setPhotoPreviewUrl(null);
    setMenuForm(prev => ({ ...prev, fotoUrl: '', imagenUrl: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleMigratePhotos = async () => {
    if (!window.confirm('¿Desea migrar todas las fotos de platos guardadas en formato Base64 a Firebase Storage? Esto mejorará la velocidad y sincronización en todos los dispositivos.')) {
      return;
    }
    setIsMigratingPhotos(true);
    try {
      const { migratedCount, errorsCount } = await migrateBase64MenuItemsToStorage();
      alert(`Migración completada:\n- Platos migrados a Storage: ${migratedCount}\n- Errores: ${errorsCount}`);
    } catch (err: any) {
      alert('Error en la migración: ' + (err.message || err));
    } finally {
      setIsMigratingPhotos(false);
    }
  };

  const handleOpenNewDish = () => {
    setEditingMenu(null);
    setSelectedPhotoFile(null);
    setPhotoPreviewUrl(null);
    setIsUploadingPhoto(false);
    setIsManualCocinaTouched(false);
    setMenuForm({
      nombre: '',
      descripcion: '',
      precio: 12.0,
      costoElaboracion: 4.0,
      categoria: 'Platos Fuertes',
      requiereCocina: true,
      disponible: true,
      controlaStock: false,
      stockActual: 20,
      stockMinimo: 5,
      unidadMedida: 'unidades',
      restaurantId: 'all',
      fotoUrl: '',
      imagenUrl: ''
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowMenuModal(true);
  };

  const handleOpenEditDish = (item: MenuItem) => {
    setEditingMenu(item);
    setSelectedPhotoFile(null);
    const existingPhoto = item.fotoUrl || item.imagenUrl || null;
    setPhotoPreviewUrl(existingPhoto);
    setIsUploadingPhoto(false);
    setIsManualCocinaTouched(true);
    setMenuForm({
      nombre: item.nombre,
      descripcion: item.descripcion || '',
      precio: item.precio,
      costoElaboracion: item.costoElaboracion || 0,
      categoria: item.categoria,
      requiereCocina: item.requiereCocina === true,
      disponible: item.disponible !== false,
      controlaStock: item.controlaStock === true,
      stockActual: typeof item.stockActual === 'number' ? item.stockActual : 20,
      stockMinimo: typeof item.stockMinimo === 'number' ? item.stockMinimo : 5,
      unidadMedida: item.unidadMedida || 'unidades',
      restaurantId: item.restaurantId || 'all',
      fotoUrl: item.fotoUrl || item.imagenUrl || '',
      imagenUrl: item.imagenUrl || item.fotoUrl || ''
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowMenuModal(true);
  };

  // Helper para identificar al empleado / usuario responsable del cambio para la auditoría
  const getAuditActor = () => {
    if (currentEmployee) {
      return {
        id: currentEmployee.id,
        nombre: currentEmployee.nombre,
        rol: currentEmployee.puesto || 'Empleado'
      };
    }
    if (currentUserAccount) {
      return {
        id: currentUserAccount.uid,
        nombre: currentUserAccount.nombre || currentUserAccount.email || 'Administrador',
        rol: currentUserAccount.rol === 'owner' ? 'Propietario / Dueño' : 'Administrador'
      };
    }
    return {
      id: 'admin',
      nombre: 'Administrador General',
      rol: 'Administrador'
    };
  };

  // Ajuste rápido de stock auditado
  const handleQuickStockAdjustWithAudit = async (item: MenuItem, delta: number) => {
    sounds.playKeypadClick();
    const actor = getAuditActor();
    const currentStock = typeof item.stockActual === 'number' ? item.stockActual : 0;
    const newStock = Math.max(0, currentStock + delta);
    const unit = item.unidadMedida || 'unidades';
    const rest = restaurants.find(r => r.id === item.restaurantId);

    await quickAdjustMenuItemStock(item.id, delta);

    await recordMenuAuditLog({
      businessId: activeBizId,
      restaurantId: item.restaurantId,
      restaurantNombre: rest?.nombre || 'Todas las sedes',
      platoId: item.id,
      platoNombre: item.nombre,
      tipoAccion: 'ajuste_stock',
      detalles: `Ajuste de inventario: ${delta > 0 ? `+${delta}` : delta} ${unit} (Existencias: ${currentStock} → ${newStock} ${unit})`,
      cambios: [
        { campo: 'stockActual', valorAnterior: currentStock, valorNuevo: newStock }
      ],
      empleadoId: actor.id,
      empleadoNombre: actor.nombre,
      empleadoRol: actor.rol,
      fecha: new Date().toISOString()
    });

    sounds.playNotification();
  };

  // Cambio de disponibilidad de plato auditado
  const handleToggleAvailabilityWithAudit = async (item: MenuItem) => {
    const newDisp = !item.disponible;
    const actor = getAuditActor();
    const rest = restaurants.find(r => r.id === item.restaurantId);

    await updateMenuItem(item.id, { disponible: newDisp });

    await recordMenuAuditLog({
      businessId: activeBizId,
      restaurantId: item.restaurantId,
      restaurantNombre: rest?.nombre || 'Todas las sedes',
      platoId: item.id,
      platoNombre: item.nombre,
      tipoAccion: 'cambio_disponibilidad',
      detalles: newDisp 
        ? `Plato habilitado para venta en carta.` 
        : `Plato marcado como pausado / agotado fuera de carta.`,
      cambios: [
        { campo: 'disponible', valorAnterior: item.disponible, valorNuevo: newDisp }
      ],
      empleadoId: actor.id,
      empleadoNombre: actor.nombre,
      empleadoRol: actor.rol,
      fecha: new Date().toISOString()
    });
  };

  // Cambio de ruta de preparación (Cocina vs Xpress) auditado con 1 clic
  const handleTogglePreparationRouteWithAudit = async (item: MenuItem) => {
    sounds.playKeypadClick();
    const newKitchen = !(item.requiereCocina === true);
    const actor = getAuditActor();
    const rest = restaurants.find(r => r.id === item.restaurantId);

    await updateMenuItem(item.id, { 
      requiereCocina: newKitchen,
      tipoPreparacion: newKitchen ? 'cocina' : 'express'
    });

    await recordMenuAuditLog({
      businessId: activeBizId,
      restaurantId: item.restaurantId,
      restaurantNombre: rest?.nombre || 'Todas las sedes',
      platoId: item.id,
      platoNombre: item.nombre,
      tipoAccion: 'modificacion_plato',
      detalles: newKitchen 
        ? `Ruta de preparación actualizada a "Preparación en Cocina" (envío a pantalla KDS).` 
        : `Ruta de preparación actualizada a "Preparación Xpress" (despacho directo en mostrador).`,
      cambios: [
        { campo: 'requiereCocina', valorAnterior: item.requiereCocina ? 'Cocina' : 'Xpress', valorNuevo: newKitchen ? 'Cocina' : 'Xpress' }
      ],
      empleadoId: actor.id,
      empleadoNombre: actor.nombre,
      empleadoRol: actor.rol,
      fecha: new Date().toISOString()
    });

    sounds.playNotification();
  };

  // Abrir modal de confirmación para borrar plato del menú activo sin afectar su historial de ventas
  const handleConfirmDeleteMenuItemWithAudit = (item: MenuItem) => {
    sounds.playKeypadClick();
    setDishToDeleteModal(item);
  };

  // Ejecutar borrado del plato de la carta activa preservando su historial de ventas
  const handleExecuteDeleteDish = async () => {
    if (!dishToDeleteModal) return;
    setIsDeletingDish(true);
    const item = dishToDeleteModal;
    try {
      const actor = getAuditActor();
      const rest = restaurants.find(r => r.id === item.restaurantId);

      await deleteMenuItem(item.id);

      await recordMenuAuditLog({
        businessId: activeBizId,
        restaurantId: item.restaurantId,
        restaurantNombre: rest?.nombre || 'Todas las sedes',
        platoId: item.id,
        platoNombre: item.nombre,
        tipoAccion: 'eliminacion_plato',
        detalles: `Plato "${item.nombre}" (${item.categoria || 'General'}, precio $${item.precio}) retirado del menú activo (historial de ventas conservado).`,
        empleadoId: actor.id,
        empleadoNombre: actor.nombre,
        empleadoRol: actor.rol,
        fecha: new Date().toISOString()
      });

      sounds.playNotification();
      setDishToDeleteModal(null);
      setShowMenuModal(false);
      setEditingMenu(null);
      setDishDeletedToast(`Plato "${item.nombre}" borrado del menú activo. Su historial de ventas e ingresos se conserva intacto.`);
      setTimeout(() => setDishDeletedToast(null), 6000);
    } catch (err) {
      console.error('Error al borrar plato del menú:', err);
    } finally {
      setIsDeletingDish(false);
    }
  };

  const handleSaveMenuItem = async () => {
    if (!menuForm.nombre.trim()) return;
    setIsUploadingPhoto(true);

    try {
      const targetRestaurantId = menuForm.restaurantId && menuForm.restaurantId !== 'all'
        ? menuForm.restaurantId
        : (currentRestaurant?.id || (restaurants.length > 0 ? restaurants[0].id : 'central'));

      const dishId = editingMenu ? editingMenu.id : generateMenuItemId();
      let finalFotoUrl: string | null = menuForm.fotoUrl || menuForm.imagenUrl || null;

      if (selectedPhotoFile) {
        finalFotoUrl = await uploadDishPhoto(targetRestaurantId, dishId, selectedPhotoFile);
      } else if (!photoPreviewUrl) {
        finalFotoUrl = null;
      }

      const isStockControlled = menuForm.controlaStock === true;
      const parsedStock = Number(menuForm.stockActual) || 0;
      const parsedMin = Number(menuForm.stockMinimo) || 5;

      // Si se controla stock y está en 0 o menos, forzamos disponible en falso; de lo contrario respetamos la selección manual
      const finalDisponible = isStockControlled && parsedStock <= 0 ? false : (menuForm.disponible !== false);

      const dishPayload: Record<string, any> = {
        businessId: activeBizId,
        nombre: menuForm.nombre.trim(),
        descripcion: menuForm.descripcion.trim(),
        precio: Number(menuForm.precio) || 0,
        costoElaboracion: Number(menuForm.costoElaboracion) || 0,
        categoria: menuForm.categoria.trim() || 'General',
        requiereCocina: menuForm.requiereCocina === true,
        tipoPreparacion: menuForm.requiereCocina === true ? 'cocina' : 'express',
        disponible: finalDisponible,
        controlaStock: isStockControlled,
        restaurantId: menuForm.restaurantId || 'all',
        fotoUrl: finalFotoUrl,
        imagenUrl: finalFotoUrl
      };

      if (isStockControlled) {
        dishPayload.stockActual = parsedStock;
        dishPayload.stockMinimo = parsedMin;
        dishPayload.unidadMedida = menuForm.unidadMedida || 'unidades';
      }

      if (editingMenu) {
        await updateMenuItem(editingMenu.id, dishPayload);

        // Registro de auditoría para modificación de plato
        try {
          const actor = getAuditActor();
          const targetRest = restaurants.find(r => r.id === targetRestaurantId);
          const cambios: MenuAuditLogChange[] = [];

          if (editingMenu.nombre !== menuForm.nombre.trim()) {
            cambios.push({ campo: 'nombre', valorAnterior: editingMenu.nombre, valorNuevo: menuForm.nombre.trim() });
          }
          if (Number(editingMenu.precio) !== (Number(menuForm.precio) || 0)) {
            cambios.push({ campo: 'precio', valorAnterior: editingMenu.precio, valorNuevo: Number(menuForm.precio) || 0 });
          }
          if (Number(editingMenu.costoElaboracion || 0) !== (Number(menuForm.costoElaboracion) || 0)) {
            cambios.push({ campo: 'costoElaboracion', valorAnterior: editingMenu.costoElaboracion || 0, valorNuevo: Number(menuForm.costoElaboracion) || 0 });
          }
          if (editingMenu.categoria !== (menuForm.categoria.trim() || 'General')) {
            cambios.push({ campo: 'categoria', valorAnterior: editingMenu.categoria, valorNuevo: menuForm.categoria.trim() || 'General' });
          }
          if (editingMenu.disponible !== finalDisponible) {
            cambios.push({ campo: 'disponible', valorAnterior: editingMenu.disponible, valorNuevo: finalDisponible });
          }
          if ((editingMenu.requiereCocina === true) !== (menuForm.requiereCocina === true)) {
            cambios.push({ 
              campo: 'requiereCocina', 
              valorAnterior: editingMenu.requiereCocina ? 'Cocina' : 'Xpress', 
              valorNuevo: menuForm.requiereCocina === true ? 'Cocina' : 'Xpress' 
            });
          }
          if (editingMenu.controlaStock !== isStockControlled) {
            cambios.push({ campo: 'controlaStock', valorAnterior: editingMenu.controlaStock, valorNuevo: isStockControlled });
          }
          if (isStockControlled && Number(editingMenu.stockActual ?? 0) !== parsedStock) {
            cambios.push({ campo: 'stockActual', valorAnterior: editingMenu.stockActual ?? 0, valorNuevo: parsedStock });
          }
          if (isStockControlled && Number(editingMenu.stockMinimo ?? 5) !== parsedMin) {
            cambios.push({ campo: 'stockMinimo', valorAnterior: editingMenu.stockMinimo ?? 5, valorNuevo: parsedMin });
          }

          let tipoAccion: MenuAuditActionType = 'modificacion_plato';
          if (cambios.length === 1 && cambios[0].campo === 'stockActual') {
            tipoAccion = 'ajuste_stock';
          } else if (cambios.length === 1 && cambios[0].campo === 'disponible') {
            tipoAccion = 'cambio_disponibilidad';
          }

          const detalles = cambios.length > 0
            ? `Modificaciones en "${menuForm.nombre.trim()}": ${cambios.map(c => `${c.campo} (${c.valorAnterior} → ${c.valorNuevo})`).join(', ')}`
            : `Actualización general de datos del plato "${menuForm.nombre.trim()}"`;

          await recordMenuAuditLog({
            businessId: activeBizId,
            restaurantId: targetRestaurantId,
            restaurantNombre: targetRest?.nombre || 'Todas las sedes',
            platoId: dishId,
            platoNombre: menuForm.nombre.trim(),
            tipoAccion,
            detalles,
            cambios,
            empleadoId: actor.id,
            empleadoNombre: actor.nombre,
            empleadoRol: actor.rol,
            fecha: new Date().toISOString()
          });
        } catch (auditErr) {
          console.warn('Advertencia registrando auditoría de edición:', auditErr);
        }
      } else {
        await setMenuItem(dishId, dishPayload as any);

        // Registro de auditoría para creación de nuevo plato
        try {
          const actor = getAuditActor();
          const targetRest = restaurants.find(r => r.id === targetRestaurantId);

          await recordMenuAuditLog({
            businessId: activeBizId,
            restaurantId: targetRestaurantId,
            restaurantNombre: targetRest?.nombre || 'Todas las sedes',
            platoId: dishId,
            platoNombre: menuForm.nombre.trim(),
            tipoAccion: 'creacion_plato',
            detalles: `Alta de nuevo plato "${menuForm.nombre.trim()}" en categoría "${menuForm.categoria.trim() || 'General'}" con precio $${Number(menuForm.precio) || 0}` +
              (isStockControlled ? ` y stock inicial de ${parsedStock} ${menuForm.unidadMedida || 'unidades'}` : ' (Sin control de inventario)'),
            empleadoId: actor.id,
            empleadoNombre: actor.nombre,
            empleadoRol: actor.rol,
            fecha: new Date().toISOString()
          });
        } catch (auditErr) {
          console.warn('Advertencia registrando auditoría de alta:', auditErr);
        }
      }

      sounds.playCashRegister();
      setShowMenuModal(false);
      setEditingMenu(null);
      setSelectedPhotoFile(null);
      setPhotoPreviewUrl(null);
    } catch (err: any) {
      console.error('Error guardando plato:', err);
      alert(err.message || 'No se pudo guardar el plato, verificá los datos e intentá de nuevo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Escuchar evento disparado desde TopNav cuando se selecciona "+ Crear otro restaurante..."
  React.useEffect(() => {
    const handleOpenNewRest = () => {
      setEditingRest(null);
      setRestFormError(null);
      setRestForm({
        nombre: '',
        direccion: '',
        telefono: '',
        codigoSede: generateUniqueCodigoSedeForBusiness(),
        activo: true,
        numeroMesas: 10,
        usaCocina: true
      });
      setShowRestModal(true);
    };

    window.addEventListener('open-new-restaurant-modal', handleOpenNewRest);
    return () => window.removeEventListener('open-new-restaurant-modal', handleOpenNewRest);
  }, [restaurants]);

  return (
    <div className="flex-1 flex flex-col h-[calc(100dvh-65px)] min-h-0 bg-neutral-100 overflow-hidden">
      
      {/* Admin Subheader & Tab Controls */}
      <div className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-black text-neutral-900 text-base sm:text-lg">Panel de Administración Global</h2>
            <p className="text-xs text-neutral-500">Gestión de locales, personal, cartas y turnos</p>
          </div>
        </div>

        {/* Tab Buttons (Unificados: Indicadores & Finanzas P&L en un solo panel, Asistencia & Planilla sin duplicar Turnos) */}
        <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-xl border border-neutral-200 overflow-x-auto">
          {[
            { id: 'indicadores', label: 'Indicadores & Finanzas (P&L)', icon: BarChart3 },
            { id: 'asistencia', label: 'Asistencia & Planilla', icon: Users },
            { id: 'inventario', label: 'Inventario & Insumos', icon: Boxes },
            { id: 'historial_pedidos', label: 'Historial de Pedidos', icon: ReceiptText },
            { id: 'conciliacion', label: 'Conciliación Delivery', icon: Truck },
            { id: 'restaurantes', label: 'Locales & Mesas', icon: Store },
            { id: 'empleados', label: 'Empleados & PINs', icon: Users },
            { id: 'menu', label: 'Menú & Platos', icon: UtensilsCrossed },
            { id: 'auditoria_menu', label: 'Auditoría de Menú & Stock', icon: ShieldCheck },
            { id: 'peligro', label: 'Seguridad & Mantenimiento', icon: ShieldCheck },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isDanger = tab.id === 'peligro';
            const isFinancial = tab.id === 'financiero' || tab.id === 'conciliacion' || tab.id === 'asistencia';
            const isIndicator = tab.id === 'indicadores' || tab.id === 'historial_pedidos';
            const isInventory = tab.id === 'inventario';
            const isAudit = tab.id === 'auditoria_menu';
            const criticalSupplyCount = isInventory
              ? inventoryItems.filter(i => (Number(i.stockActual) || 0) <= (Number(i.stockMinimo) || 5)).length +
                menuItems.filter(m => m.controlaStock && (m.stockActual ?? 0) <= (m.stockMinimo ?? 5)).length
              : 0;
            return (
              <button
                key={tab.id}
                id={`admin-tab-btn-${tab.id}`}
                onClick={() => { sounds.playKeypadClick(); setActiveTab(tab.id as any); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                  isActive 
                    ? isIndicator
                      ? 'bg-orange-600 text-white shadow-xs'
                      : isInventory
                        ? 'bg-amber-600 text-white shadow-xs'
                        : isDanger 
                          ? 'bg-red-600 text-white shadow-xs' 
                          : isFinancial 
                            ? 'bg-blue-600 text-white shadow-xs' 
                            : isAudit
                              ? 'bg-purple-700 text-white shadow-xs'
                              : 'bg-white text-neutral-900 shadow-xs' 
                    : isIndicator
                      ? 'text-orange-700 hover:bg-orange-50 font-black'
                      : isInventory
                        ? 'text-amber-800 hover:bg-amber-50 font-black'
                        : isDanger 
                          ? 'text-red-600 hover:bg-red-50' 
                          : isFinancial
                            ? 'text-blue-700 hover:bg-blue-50 font-black'
                            : isAudit
                              ? 'text-purple-700 hover:bg-purple-50 font-bold'
                              : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${
                  isActive 
                    ? 'text-white' 
                    : isIndicator
                      ? 'text-orange-600'
                      : isInventory
                        ? 'text-amber-600'
                        : isDanger 
                          ? 'text-red-500' 
                          : isFinancial 
                            ? 'text-blue-600' 
                            : isAudit
                              ? 'text-purple-600'
                              : 'text-neutral-400'
                }`} />
                <span>{tab.label}</span>
                {isInventory && criticalSupplyCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-red-600 text-white text-[10px] font-black animate-pulse">
                    {criticalSupplyCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {/* Botón Exportar Reportes PDF */}
          <button
            id="admin-export-pdf-btn"
            type="button"
            onClick={() => { sounds.playKeypadClick(); setShowPdfExportModal(true); }}
            className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
            title="Descargar reportes oficiales en PDF (Inventario y Cierres de Caja)"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Exportar Reportes PDF</span>
          </button>

          {/* Botón Centro de Mensajes & Avisos */}
          <button
            id="admin-messages-btn"
            type="button"
            onClick={() => { sounds.playKeypadClick(); setShowMessageCenterModal(true); }}
            className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 shadow-xs shrink-0 ${
              securityAlerts.filter(a => !a.leido).length > 0
                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 ring-2 ring-rose-500/20'
                : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
            }`}
            title="Centro de mensajes, avisos y alertas operacionales"
          >
            <ShieldAlert className={`w-3.5 h-3.5 ${securityAlerts.filter(a => !a.leido).length > 0 ? 'text-rose-600' : 'text-neutral-500'}`} />
            <span>Centro de Mensajes</span>
            {securityAlerts.filter(a => !a.leido).length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-black animate-pulse">
                {securityAlerts.filter(a => !a.leido).length}
              </span>
            )}
          </button>

          {/* Botón Reparar Pedidos Atascados */}
          <button
            type="button"
            onClick={() => { sounds.playKeypadClick(); setShowRepairModal(true); }}
            className="px-3.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold transition flex items-center gap-1.5 shadow-xs shrink-0"
            title="Herramienta de Administrador para reparar pedidos con estados inconsistentes"
          >
            <Wrench className="w-3.5 h-3.5 text-purple-600" />
            <span>Reparar pedidos atascados</span>
          </button>
        </div>
      </div>

      {/* Main Admin Content Container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        
        {/* Banner Global de Notificaciones de Stock Bajo y Productos Agotados */}
        <div className="max-w-7xl mx-auto">
          <LowStockNotificationBanner
            menuItems={menuItems}
            inventoryItems={inventoryItems}
            restaurants={restaurants}
            onOpenRestockModal={() => setShowRestockModal(true)}
            onNavigateToMenu={() => {
              setActiveTab('menu');
              setMenuPrepFilter('stock_bajo');
            }}
            onNavigateToInventory={() => {
              setActiveTab('inventario');
            }}
            onQuickRestock={async (item, amount) => {
              await quickAdjustMenuItemStock(item.id, amount);
            }}
            onQuickRestockInventory={async (item, amount) => {
              await quickAdjustInventoryItemStock(
                item.id,
                amount,
                currentUserAccount?.nombre || currentEmployee?.nombre || 'Administrador',
                activeBizId
              );
            }}
          />
        </div>

        {/* VIEW INVENTARIO E INSUMOS: Descuento automático al marcar pedido como entregado y alertas críticas */}
        {activeTab === 'inventario' && (
          <InventoryManager
            inventoryItems={inventoryItems}
            menuItems={menuItems}
            restaurants={restaurants}
            orders={orders}
            auditLogs={menuAuditLogs}
            businessId={activeBizId}
            currentRestaurantId={currentRestaurant?.id || 'all'}
            userName={currentUserAccount?.nombre || currentEmployee?.nombre || 'Administrador'}
          />
        )}

        {/* VIEW UNIFICADO: Indicadores Operativos + Finanzas & P&L (Sin reportes repetidos) */}
        {(activeTab === 'indicadores' || activeTab === 'financiero') && (
          <div className="max-w-7xl mx-auto space-y-6">
            <FinancialDashboard 
              restaurants={restaurants}
              orders={orders}
              shifts={shifts}
              menuItems={menuItems}
              archivedMenuItems={archivedMenuItems}
              onEditDish={handleOpenEditDish}
              onDeleteDish={handleConfirmDeleteMenuItemWithAudit}
              customDailySalesChart={
                <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-2xs flex flex-col justify-between">
                  <div>
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-neutral-900">
                            Evolución Diaria de las Ventas
                          </h3>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase">
                            Gráfico Dinámico
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500">
                          Tendencia día a día de ingresos cobrados, utilidad neta y ticket promedio en tiempo real
                        </p>
                      </div>

                      {/* Controles de Rango Diario y Sucursal */}
                      <div className="flex flex-wrap items-center gap-2">
                        {restaurants.length > 1 && (
                          <select
                            value={salesChartBranchFilter}
                            onChange={(e) => setSalesChartBranchFilter(e.target.value)}
                            className="h-7 px-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-[11px] font-bold text-neutral-700 outline-none focus:border-neutral-900"
                          >
                            <option value="all">Todas las sucursales</option>
                            {restaurants.map(r => (
                              <option key={r.id} value={r.id}>{r.nombre}</option>
                            ))}
                          </select>
                        )}
                        <div className="flex items-center bg-neutral-100 p-1 rounded-xl border border-neutral-200">
                          {([
                            { id: '7d', label: '7 Días' },
                            { id: '14d', label: '14 Días' },
                            { id: '30d', label: '30 Días' }
                          ] as const).map(opt => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                sounds.playClick();
                                setSalesChartDaysRange(opt.id);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                                salesChartDaysRange === opt.id
                                  ? 'bg-neutral-900 text-white shadow-2xs'
                                  : 'text-neutral-600 hover:text-neutral-900'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Resumen rápido del periodo diario y toggles de series */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-neutral-100">
                      <div className="flex flex-wrap items-center gap-4 text-xs">
                        <div>
                          <span className="text-neutral-400 font-bold uppercase text-[10px] block">Acumulado Periodo</span>
                          <span className="font-mono font-black text-emerald-700 text-sm">
                            ${dailySalesEvolutionStats.totalSales.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="h-6 w-px bg-neutral-200" />
                        <div>
                          <span className="text-neutral-400 font-bold uppercase text-[10px] block">Promedio Diario</span>
                          <span className="font-mono font-black text-neutral-800 text-sm">
                            ${dailySalesEvolutionStats.avgDailySales.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="h-6 w-px bg-neutral-200" />
                        <div>
                          <span className="text-neutral-400 font-bold uppercase text-[10px] block">Mejor Día</span>
                          <span className="font-mono font-bold text-indigo-700 text-xs">
                            {dailySalesEvolutionStats.bestDay && dailySalesEvolutionStats.bestDay.ventas > 0
                              ? `${dailySalesEvolutionStats.bestDay.label} ($${dailySalesEvolutionStats.bestDay.ventas.toFixed(0)})`
                              : 'Sin ventas'}
                          </span>
                        </div>
                      </div>

                      {/* Toggles interactivos de líneas */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowAdminSalesLine(v => !v)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                            showAdminSalesLine
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Ventas Diarias
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAdminProfitLine(v => !v)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                            showAdminProfitLine
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                              : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-indigo-600" />
                          Ganancia Neta
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAdminExpensesLine(v => !v)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                            showAdminExpensesLine
                              ? 'bg-red-50 border-red-300 text-red-800'
                              : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          Gastos
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAdminTicketLine(v => !v)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                            showAdminTicketLine
                              ? 'bg-amber-50 border-amber-300 text-amber-800'
                              : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          Ticket Prom.
                        </button>
                      </div>
                    </div>

                    {/* Lienzo Recharts LineChart */}
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dailySalesEvolutionData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: '#737373', fontWeight: 600 }}
                            axisLine={{ stroke: '#e5e5e5' }}
                            tickLine={false}
                          />
                          <YAxis
                            yAxisId="left"
                            tick={{ fontSize: 11, fill: '#737373' }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(val) => `$${val}`}
                          />
                          {showAdminTicketLine && (
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              tick={{ fontSize: 10, fill: '#d97706' }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(val) => `$${val}`}
                            />
                          )}
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#171717',
                              border: 'none',
                              borderRadius: '12px',
                              color: '#fff',
                              fontSize: '12px',
                              fontWeight: 600,
                              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
                            }}
                            formatter={(value: any, name: string) => [
                              `$${Number(value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                              name
                            ]}
                            labelFormatter={(label, payload) => {
                              const item = payload?.[0]?.payload;
                              return item
                                ? `${label} (${item.fecha}) · ${item.pedidos} pedido(s)`
                                : label;
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                          {dailySalesEvolutionStats.avgDailySales > 0 && showAdminSalesLine && (
                            <ReferenceLine
                              yAxisId="left"
                              y={dailySalesEvolutionStats.avgDailySales}
                              stroke="#10b981"
                              strokeDasharray="4 4"
                              strokeOpacity={0.5}
                            />
                          )}
                          {showAdminSalesLine && (
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="ventas"
                              name="Ventas Diarias"
                              stroke="#10b981"
                              strokeWidth={3}
                              dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#ffffff' }}
                              activeDot={{ r: 6, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }}
                            />
                          )}
                          {showAdminProfitLine && (
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="ganancia"
                              name="Ganancia Neta"
                              stroke="#4f46e5"
                              strokeWidth={2.5}
                              dot={{ r: 3.5, fill: '#4f46e5', strokeWidth: 1.5, stroke: '#ffffff' }}
                              activeDot={{ r: 5 }}
                            />
                          )}
                          {showAdminExpensesLine && (
                            <Line
                              yAxisId="left"
                              type="monotone"
                              dataKey="gastos"
                              name="Gastos Operativos"
                              stroke="#ef4444"
                              strokeWidth={2}
                              strokeDasharray="4 4"
                              dot={{ r: 3, fill: '#ef4444' }}
                              activeDot={{ r: 5 }}
                            />
                          )}
                          {showAdminTicketLine && (
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="ticketPromedio"
                              name="Ticket Promedio"
                              stroke="#f59e0b"
                              strokeWidth={2}
                              dot={{ r: 3, fill: '#f59e0b' }}
                              activeDot={{ r: 5 }}
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              }
            />
          </div>
        )}

        {/* VIEW HISTORIAL DE PEDIDOS: Filtros por fecha, sucursal, método de pago, trazabilidad y recibos */}
        {activeTab === 'historial_pedidos' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <OrderHistoryAdminView
              restaurants={restaurants}
              employees={employees}
              initialOrders={orders}
              businessId={activeBizId}
            />
          </div>
        )}

        {/* VIEW CONCILIACION: Conciliación de Delivery (PedidosYa, UberEats, Rappi) */}
        {activeTab === 'conciliacion' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <DeliveryReconciliation
              orders={orders}
              restaurants={restaurants}
              businessId={activeBizId}
              selectedBranchId="all"
              currentUserName={currentUserAccount?.nombre || 'Administrador'}
              userRole={currentUserAccount?.rol === 'owner' ? 'owner' : 'admin'}
            />
          </div>
        )}

        {/* VIEW ASISTENCIA: Control de Asistencia, Horas Extra y Planilla Masiva */}
        {activeTab === 'asistencia' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <StaffAttendanceAdminView
              shifts={shifts}
              employees={employees}
              restaurants={restaurants}
              businessId={activeBizId}
              businessName={currentBusiness?.nombre || 'Mi Negocio'}
              currentUserName={currentUserAccount?.nombre || 'Administrador'}
              userRole={currentUserAccount?.rol === 'owner' ? 'owner' : 'admin'}
            />
          </div>
        )}

        {/* VIEW 2: Restaurantes (Multisede) */}
        {activeTab === 'restaurantes' && (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-neutral-800 text-sm uppercase tracking-wider">
                Restaurantes / Sucursales Registradas ({restaurants.length})
              </h3>
              <button
                onClick={() => {
                  setEditingRest(null);
                  setRestFormError(null);
                  setRestForm({
                    nombre: '',
                    direccion: '',
                    telefono: '',
                    codigoSede: generateUniqueCodigoSedeForBusiness(),
                    activo: true,
                    numeroMesas: 10,
                    usaCocina: true,
                    logoUrl: ''
                  });
                  setShowRestModal(true);
                }}
                className="h-10 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Nuevo Local
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {restaurants.map(rest => (
                <div key={rest.id} className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        {rest.logoUrl ? (
                          <div className="w-10 h-10 rounded-xl border border-neutral-200 bg-neutral-50 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                            <img
                              src={rest.logoUrl}
                              alt={rest.nombre}
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                            <Store className="w-5 h-5" />
                          </div>
                        )}
                        <div>
                          <h4 className="font-extrabold text-neutral-900 text-base leading-tight">{rest.nombre}</h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-neutral-400 font-mono">ID: {rest.id.slice(0, 8)}</span>
                            {rest.codigoSede && (
                              <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-900 font-mono font-black text-[10px] border border-orange-200 flex items-center gap-1">
                                <KeyRound className="w-2.5 h-2.5 text-orange-600" />
                                Código Sede: {rest.codigoSede}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {rest.usaCocina === false ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                            <Store className="w-3 h-3" /> Sin Cocina (Mostrador)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <ChefHat className="w-3 h-3" /> Cocina (KDS)
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          rest.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-700'
                        }`}>
                          {rest.activo ? 'Operando' : 'Inactivo'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-neutral-600 space-y-1">
                      <p>📍 {rest.direccion || 'Sin dirección registrada'}</p>
                      <p>📞 {rest.telefono || 'Sin teléfono'}</p>
                      <p className="flex items-center gap-1 font-semibold text-neutral-700">
                        <Grid3X3 className="w-3.5 h-3.5 text-orange-600" />
                        Capacidad: <span className="font-bold text-orange-600">{rest.numeroMesas || 10} mesas</span> configuradas
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setTableModalRest(rest);
                          setTableCountInput(rest.numeroMesas || 10);
                          setTableOperationMsg(null);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                        title="Gestionar mesas de este local"
                      >
                        <Grid3X3 className="w-3.5 h-3.5" />
                        Mesas ({rest.numeroMesas || 10})
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRest(rest);
                          setRestFormError(null);
                          setRestForm({
                            nombre: rest.nombre,
                            direccion: rest.direccion,
                            telefono: rest.telefono,
                            codigoSede: rest.codigoSede && /^\d{4}$/.test(rest.codigoSede)
                              ? rest.codigoSede
                              : generateUniqueCodigoSedeForBusiness(rest.id),
                            activo: rest.activo,
                            numeroMesas: rest.numeroMesas || 10,
                            usaCocina: rest.usaCocina !== false,
                            logoUrl: rest.logoUrl || ''
                          });
                          setShowRestModal(true);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenDangerModal('reset_operational', rest)}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs flex items-center gap-1 transition"
                        title="Limpiar pedidos, gastos y turnos del restaurante"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset Operativo
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenDangerModal('delete_restaurant', rest)}
                        className="px-2 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs flex items-center gap-1 transition"
                        title="Eliminar restaurante y todos sus datos en cascada"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 3: Empleados con PIN, Días Trabajados y Sueldo (Sin valores por hora) */}
        {activeTab === 'empleados' && (
          <div className="max-w-6xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-neutral-800 text-sm uppercase tracking-wider">
                  Plantilla de Empleados, Días de Trabajo y Sueldos ({employees.length})
                </h3>
                <p className="text-xs text-neutral-500">
                  Asigna roles, gestiona el sueldo por día o mensual (sin tarifas por hora), consulta días trabajados y resetea PINs.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingEmp(null);
                  setEmpForm({
                    nombre: '',
                    puesto: 'mesero',
                    pin: '',
                    modalidadPago: 'por_dia',
                    tarifaHora: 12.0,
                    tarifaDiaria: 50.0,
                    sueldoMensual: 1200.0,
                    restaurantId: restaurants[0]?.id || '',
                    activo: true,
                  });
                  setShowEmpModal(true);
                }}
                className="h-10 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Registrar Empleado
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase text-[10px] border-b">
                  <tr>
                    <th className="p-3">Nombre</th>
                    <th className="p-3">Rol / Puesto</th>
                    <th className="p-3">Sede Asignada</th>
                    <th className="p-3">PIN Actual</th>
                    <th className="p-3 text-center">Modalidad</th>
                    <th className="p-3 text-right">Sueldo Base</th>
                    <th className="p-3 text-center">Días Trabajados</th>
                    <th className="p-3 text-right">Sueldo Generado</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-neutral-700">
                  {employees.map(emp => {
                    const rawMod = emp.modalidadPago || emp.tipoSueldo || 'por_dia';
                    const isMonthly = rawMod === 'mes' || rawMod === 'fijo';
                    const dailySalary = isMonthly
                      ? (Number(emp.sueldoMensual) || 1200) / 30
                      : (Number(emp.tarifaDiaria) > 0 ? Number(emp.tarifaDiaria) : Math.max(30, (Number(emp.tarifaHora) || 12) * 8));
                    const baseSalary = isMonthly ? (Number(emp.sueldoMensual) || 1200) : dailySalary;

                    const empShifts = shifts.filter(s => s.employeeId === emp.id);
                    const uniqueWorkedDates = new Set(
                      empShifts.map(s => (s.fecha || s.horaInicio || '').split('T')[0]).filter(Boolean)
                    );
                    const workedDaysCount = uniqueWorkedDates.size;
                    const generatedSalary = isMonthly
                      ? (workedDaysCount > 0 ? Math.min(baseSalary, (baseSalary / 30) * workedDaysCount) : 0)
                      : (workedDaysCount * dailySalary);

                    return (
                    <tr key={emp.id} className="hover:bg-neutral-50/50">
                      <td className="p-3 font-bold text-neutral-900">{emp.nombre}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                          emp.puesto === 'admin' ? 'bg-purple-100 text-purple-800' :
                          emp.puesto === 'caja' ? 'bg-blue-100 text-blue-800' :
                          emp.puesto === 'mostrador' ? 'bg-fuchsia-100 text-fuchsia-800' :
                          emp.puesto === 'mesero' ? 'bg-amber-100 text-amber-800' :
                          emp.puesto === 'cocina' ? 'bg-emerald-100 text-emerald-800' :
                          emp.puesto === 'ayudante_cocina' ? 'bg-teal-100 text-teal-800' :
                          'bg-indigo-100 text-indigo-800'
                        }`}>
                          {emp.puesto === 'ayudante_cocina' ? 'Ayudante Cocina' :
                           emp.puesto === 'mostrador' ? 'Mostrador / Despacho' :
                           emp.puesto === 'limpieza' ? 'Limpieza' : emp.puesto}
                        </span>
                      </td>
                      <td className="p-3 text-neutral-600">
                        {restaurants.find(r => r.id === emp.restaurantId)?.nombre || 'Todas'}
                      </td>
                      <td className="p-3 font-mono font-bold text-orange-600">
                        <div>•••• ({emp.pin})</div>
                        {restaurants.find(r => r.id === emp.restaurantId)?.codigoSede && (
                          <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                            Acceso 8 díg: <strong className="text-neutral-900">{restaurants.find(r => r.id === emp.restaurantId)?.codigoSede}{emp.pin}</strong>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isMonthly ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {isMonthly ? 'Mensual' : 'Por Día'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-neutral-800">
                        {isMonthly
                          ? `$${baseSalary.toFixed(2)} / mes`
                          : `$${dailySalary.toFixed(2)} / día`}
                      </td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 font-black font-mono text-xs border border-indigo-200">
                          {workedDaysCount} {workedDaysCount === 1 ? 'día' : 'días'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-black text-emerald-700">
                        ${generatedSalary.toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          emp.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {emp.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-1">
                        <button
                          onClick={() => setPinResetModal({ empId: emp.id, empName: emp.nombre, newPin: '' })}
                          className="px-2.5 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-[11px] border border-orange-200 transition"
                          title="Resetear PIN"
                        >
                          Reset PIN
                        </button>
                        <button
                          onClick={() => {
                            const normalizedMod: EmployeeSalaryType = isMonthly ? 'mes' : 'por_dia';
                            setEditingEmp(emp);
                            setEmpForm({
                              nombre: emp.nombre,
                              puesto: emp.puesto,
                              pin: emp.pin,
                              modalidadPago: normalizedMod,
                              tarifaHora: emp.tarifaHora || 12.0,
                              tarifaDiaria: dailySalary || 50.0,
                              sueldoMensual: emp.sueldoMensual || 1200.0,
                              restaurantId: emp.restaurantId,
                              activo: emp.activo
                            });
                            setShowEmpModal(true);
                          }}
                          className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW 4: Menú y Platos */}
        {activeTab === 'menu' && (
          <div className="max-w-6xl mx-auto space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-neutral-800 text-sm uppercase tracking-wider">
                  Carta y Menú ({menuItems.length} Platos)
                </h3>
                <p className="text-xs text-neutral-500">
                  Controla fotos, precios, disponibilidad y si los productos requieren elaboración en cocina o son de entrega inmediata (Express).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => { sounds.playKeypadClick(); setActiveTab('auditoria_menu'); }}
                  className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-bold flex items-center gap-1.5 transition"
                  title="Ver registros de auditoría de cambios en platos y stock"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                  <span>Auditoría de Menú & Stock ({menuAuditLogs.length})</span>
                </button>

                <button
                  type="button"
                  disabled={isMigratingPhotos}
                  onClick={handleMigratePhotos}
                  className="px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                  title="Migrar fotos en Base64 a Storage"
                >
                  {isMigratingPhotos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>Migrar Fotos a Storage</span>
                </button>

                {/* Filtro Tipo de Preparación & Stock */}
                <div className="flex flex-wrap items-center bg-neutral-150 p-0.5 rounded-xl border border-neutral-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setMenuPrepFilter('all')}
                    className={`px-2.5 py-1.5 rounded-lg font-bold transition ${
                      menuPrepFilter === 'all' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    Todos ({menuItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuPrepFilter('cocina')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold transition ${
                      menuPrepFilter === 'cocina' ? 'bg-white text-orange-700 shadow-xs' : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    <ChefHat className="w-3.5 h-3.5" />
                    Cocina ({menuItems.filter(i => i.requiereCocina === true).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuPrepFilter('express')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold transition ${
                      menuPrepFilter === 'express' ? 'bg-white text-emerald-700 shadow-xs' : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Express ({menuItems.filter(i => i.requiereCocina !== true).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuPrepFilter('stock_bajo')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-black transition ${
                      menuPrepFilter === 'stock_bajo' 
                        ? 'bg-red-600 text-white shadow-xs' 
                        : menuItems.filter(i => i.controlaStock && (i.stockActual ?? 0) <= (i.stockMinimo ?? 5)).length > 0
                        ? 'text-red-700 bg-red-50 hover:bg-red-100'
                        : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Stock Crítico ({menuItems.filter(i => i.controlaStock && (i.stockActual ?? 0) <= (i.stockMinimo ?? 5)).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuPrepFilter('control_stock')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold transition ${
                      menuPrepFilter === 'control_stock' ? 'bg-white text-amber-700 shadow-xs' : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    <Boxes className="w-3.5 h-3.5" />
                    Con Stock ({menuItems.filter(i => i.controlaStock === true).length})
                  </button>
                </div>

                {/* Selector Vista Tabla / Cuadrícula */}
                <div className="flex bg-neutral-150 p-0.5 rounded-xl border border-neutral-200">
                  <button
                    type="button"
                    onClick={() => setMenuViewMode('tabla')}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      menuViewMode === 'tabla' ? 'bg-white text-orange-700 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    Tabla
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenuViewMode('tarjetas')}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      menuViewMode === 'tarjetas' ? 'bg-white text-orange-700 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    Tarjetas
                  </button>
                </div>

                {/* Botón Reabastecer Rápido */}
                <button
                  type="button"
                  onClick={() => { sounds.playKeypadClick(); setShowRestockModal(true); }}
                  className="h-10 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs flex items-center gap-1.5 shadow-xs active:scale-95 transition cursor-pointer"
                  title="Abrir centro de reabastecimiento rápido de existencias"
                >
                  <Zap className="w-4 h-4" />
                  <span>Reabastecer Stock</span>
                </button>

                {/* Botón Reemplazado: Exportar Reportes PDF (Inventario & Cierres de Caja) */}
                <button
                  type="button"
                  onClick={() => { 
                    sounds.playKeypadClick(); 
                    setPdfModalInitialTab('inventario');
                    setShowPdfExportModal(true); 
                  }}
                  className="h-10 px-3.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                  title="Exportar reportes oficiales a PDF (Inventario, Existencias y Cierres de Caja)"
                >
                  <FileDown className="w-4 h-4 text-purple-700" />
                  <span>Reportes PDF (Inventario & Cierres)</span>
                </button>

                <button
                  onClick={handleOpenNewDish}
                  className="h-10 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Nuevo Plato
                </button>
              </div>
            </div>

            {(() => {
              const filteredMenu = menuItems.filter(item => {
                if (menuPrepFilter === 'cocina') return item.requiereCocina === true;
                if (menuPrepFilter === 'express') return item.requiereCocina !== true;
                if (menuPrepFilter === 'stock_bajo') {
                  return item.controlaStock === true && (item.stockActual ?? 0) <= (item.stockMinimo ?? 5);
                }
                if (menuPrepFilter === 'control_stock') {
                  return item.controlaStock === true;
                }
                return true;
              });

              if (menuViewMode === 'tabla') {
                return (
                  <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase text-[10px] border-b">
                        <tr>
                          <th className="p-3">Plato</th>
                          <th className="p-3">Categoría</th>
                          <th className="p-3">Preparación</th>
                          <th className="p-3">Inventario / Stock</th>
                          <th className="p-3 text-right">PVP Venta</th>
                          <th className="p-3 text-right">Costo Elab.</th>
                          <th className="p-3 text-right">Margen Bruto</th>
                          <th className="p-3">Sede</th>
                          <th className="p-3 text-center">Disponibilidad</th>
                          <th className="p-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 text-neutral-700">
                        {filteredMenu.map(item => {
                          const photoSrc = item.fotoUrl || item.imagenUrl;
                          const restName = item.restaurantId === 'all' 
                            ? 'Todas' 
                            : (restaurants.find(r => r.id === item.restaurantId)?.nombre || 'Sede');
                          const isKitchen = item.requiereCocina === true;
                          const cost = item.costoElaboracion || 0;
                          const hasCost = typeof item.costoElaboracion === 'number' && item.costoElaboracion > 0;
                          const margin$ = item.precio - cost;
                          const marginPct = item.precio > 0 ? (margin$ / item.precio) * 100 : 0;
                          const isControlled = item.controlaStock === true;
                          const stock = item.stockActual ?? 0;
                          const minStock = item.stockMinimo ?? 5;
                          const unit = item.unidadMedida || 'unid.';
                          const isDepleted = isControlled && stock <= 0;
                          const isLow = isControlled && stock > 0 && stock <= minStock;

                          return (
                            <tr key={item.id} className="hover:bg-neutral-50/50">
                              <td className="p-3">
                                <div className="flex items-center gap-3">
                                  {/* Miniatura 48px */}
                                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200/80 shrink-0 flex items-center justify-center shadow-xs">
                                    {photoSrc ? (
                                      <img
                                        src={photoSrc}
                                        alt={item.nombre}
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <UtensilsCrossed className="w-5 h-5 text-neutral-400" />
                                    )}
                                  </div>
                                  <div>
                                    <div className="font-bold text-neutral-900 text-sm">{item.nombre}</div>
                                    <div className="text-[11px] text-neutral-500 line-clamp-1 max-w-xs">{item.descripcion}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded font-bold uppercase text-[10px] bg-neutral-100 text-neutral-600">
                                  {item.categoria}
                                </span>
                              </td>
                              <td className="p-3">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePreparationRouteWithAudit(item)}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer border ${
                                    isKitchen 
                                      ? 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100 hover:border-orange-300' 
                                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
                                  }`}
                                  title="Clic para cambiar entre Cocina y Preparación Xpress"
                                >
                                  {isKitchen ? <ChefHat className="w-3.5 h-3.5 text-orange-600" /> : <Zap className="w-3.5 h-3.5 text-emerald-600" />}
                                  <span>{isKitchen ? 'Cocina' : 'Xpress'}</span>
                                </button>
                              </td>
                              <td className="p-3">
                                {isControlled ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black uppercase ${
                                      isDepleted 
                                        ? 'bg-red-600 text-white' 
                                        : isLow 
                                        ? 'bg-amber-500 text-white' 
                                        : 'bg-emerald-100 text-emerald-800'
                                    }`}>
                                      {isDepleted ? '0 ' + unit + ' (AGOTADO)' : `${stock} ${unit}`}
                                    </span>
                                    <div className="flex items-center gap-0.5">
                                      <button
                                        type="button"
                                        onClick={() => handleQuickStockAdjustWithAudit(item, 5)}
                                        className="px-1.5 py-0.5 bg-neutral-100 hover:bg-emerald-100 hover:text-emerald-800 rounded font-black text-[10px] text-neutral-600 border border-neutral-200 transition"
                                        title="Sumar +5 unidades"
                                      >
                                        +5
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleQuickStockAdjustWithAudit(item, 10)}
                                        className="px-1.5 py-0.5 bg-neutral-100 hover:bg-emerald-100 hover:text-emerald-800 rounded font-black text-[10px] text-neutral-600 border border-neutral-200 transition"
                                        title="Sumar +10 unidades"
                                      >
                                        +10
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-neutral-400 italic">
                                    Sin control
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-neutral-900 text-sm">
                                ${item.precio.toFixed(2)}
                              </td>
                              <td className="p-3 text-right font-mono text-xs">
                                {hasCost ? (
                                  <span className="font-bold text-amber-700">${cost.toFixed(2)}</span>
                                ) : (
                                  <span className="text-neutral-400 italic text-[11px]">Sin fijar</span>
                                )}
                              </td>
                              <td className="p-3 text-right font-mono text-xs">
                                {hasCost ? (
                                  <div className="flex flex-col items-end">
                                    <span className={`font-black ${margin$ < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                      ${margin$.toFixed(2)}
                                    </span>
                                    <span className="text-[10px] font-bold text-neutral-500">
                                      ({marginPct.toFixed(0)}%)
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-neutral-400">-</span>
                                )}
                              </td>
                              <td className="p-3 text-neutral-600">
                                {restName}
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleToggleAvailabilityWithAudit(item)}
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition border ${
                                    item.disponible 
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200' 
                                      : 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200'
                                  }`}
                                >
                                  {item.disponible ? 'Disponible' : 'Agotado'}
                                </button>
                              </td>
                              <td className="p-3 text-right">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditDish(item)}
                                    className="px-2.5 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                                    title="Editar Plato"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                    <span>Editar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmDeleteMenuItemWithAudit(item)}
                                    className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer shadow-2xs"
                                    title="Borrar plato del menú sin afectar el historial de ventas"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Borrar</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              }

              return (
                /* VISTA TARJETAS */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMenu.map(item => {
                    const photoSrc = item.fotoUrl || item.imagenUrl;
                    const isKitchen = item.requiereCocina === true;
                    const isControlled = item.controlaStock === true;
                    const stock = item.stockActual ?? 0;
                    const minStock = item.stockMinimo ?? 5;
                    const unit = item.unidadMedida || 'unid.';
                    const isDepleted = isControlled && stock <= 0;
                    const isLow = isControlled && stock > 0 && stock <= minStock;

                    return (
                      <div key={item.id} className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs flex flex-col justify-between">
                        <div>
                          <div className="w-full h-36 rounded-xl bg-neutral-100 overflow-hidden mb-3 relative">
                            {photoSrc ? (
                              <img src={photoSrc} alt={item.nombre} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-neutral-300">
                                <UtensilsCrossed className="w-8 h-8" />
                              </div>
                            )}
                            <div className="absolute top-2 left-2 flex flex-col gap-1">
                              <button
                                type="button"
                                onClick={() => handleTogglePreparationRouteWithAudit(item)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-black uppercase text-[10px] shadow-xs cursor-pointer transition active:scale-95 ${
                                  isKitchen 
                                    ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                }`}
                                title="Clic para alternar entre Cocina y Preparación Xpress"
                              >
                                {isKitchen ? <ChefHat className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                                {isKitchen ? 'Cocina' : 'Xpress'}
                              </button>

                              {isControlled && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-black uppercase text-[10px] shadow-xs ${
                                  isDepleted 
                                    ? 'bg-red-600 text-white' 
                                    : isLow 
                                    ? 'bg-amber-500 text-white' 
                                    : 'bg-emerald-700 text-white'
                                }`}>
                                  {isDepleted ? 'Agotado (0)' : `${stock} ${unit}`}
                                </span>
                              )}
                            </div>
                            <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase shadow-xs ${
                              item.disponible ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                            }`}>
                              {item.disponible ? 'Disponible' : 'Agotado'}
                            </span>
                          </div>

                          <div className="flex justify-between items-start gap-2">
                            <h4 className="font-bold text-neutral-900 text-sm">{item.nombre}</h4>
                            <span className="font-black text-orange-600 text-base">${item.precio.toFixed(2)}</span>
                          </div>

                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] uppercase font-bold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded">
                              {item.categoria}
                            </span>
                            {typeof item.costoElaboracion === 'number' && item.costoElaboracion > 0 ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                                Margen: ${(item.precio - item.costoElaboracion).toFixed(2)} ({(((item.precio - item.costoElaboracion) / item.precio) * 100).toFixed(0)}%)
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-neutral-500 mt-2 line-clamp-2">{item.descripcion}</p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            {isControlled && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleQuickStockAdjustWithAudit(item, 5)}
                                  className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded font-black text-xs border border-emerald-200"
                                  title="Sumar +5 unidades de stock"
                                >
                                  +5
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickStockAdjustWithAudit(item, 10)}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-black text-xs"
                                  title="Sumar +10 unidades de stock"
                                >
                                  +10
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleToggleAvailabilityWithAudit(item)}
                              className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition ${
                                item.disponible ? 'bg-neutral-50 text-neutral-700 hover:bg-neutral-100' : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              }`}
                            >
                              {item.disponible ? 'Agotado' : 'Habilitar'}
                            </button>
                          </div>

                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditDish(item)}
                              className="px-2.5 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                              title="Editar Plato"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Editar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConfirmDeleteMenuItemWithAudit(item)}
                              className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                              title="Borrar plato del menú sin afectar el historial de ventas"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Borrar</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* VIEW: Auditoría de Menú & Stock */}
        {activeTab === 'auditoria_menu' && (
          <div className="max-w-6xl mx-auto space-y-4">
            <MenuAuditLogsTable
              logs={menuAuditLogs}
              employees={employees}
              restaurants={restaurants}
              menuItems={menuItems}
              isLoading={isAuditLogsLoading}
              onSeedDemoLogs={async () => {
                await seedSampleMenuAuditLogsIfEmpty(activeBizId, employees, menuItems);
              }}
            />
          </div>
        )}

        {/* VIEW 6: Fase de Pruebas, Diagnóstico y Zona de Mantenimiento */}
        {activeTab === 'peligro' && (
          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* SECCIÓN 1: Centro de Mantenimiento Operativo */}
            <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-md border border-slate-800">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center font-bold shadow-xs">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-white">Mantenimiento & Reseteo Operativo</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Modo Producción
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Herramientas de mantenimiento para limpiar historial operativo o reiniciar transacciones sin borrar locales ni menú.
                    </p>
                  </div>
                </div>
              </div>

              {/* Botón Principal de Borrado de Transacciones */}
              <div className="mt-5 bg-slate-800/80 rounded-2xl p-5 border border-slate-700/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-extrabold text-white text-sm flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-orange-400" />
                    Restablecer Transacciones e Historial Operativo
                  </h4>
                  <p className="text-xs text-slate-300 mt-1 max-w-xl">
                    Elimina todos los pedidos, gastos, turnos y cierres de caja en todas las sucursales. Libera todas las mesas ocupadas.
                    <strong className="text-emerald-400 block mt-0.5">
                      ✓ Mantiene intactos tus locales, mesas configuradas, platos del menú, empleados y PINs.
                    </strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenDangerModal('reset_test_data')}
                  className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs shrink-0 transition flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Limpiar Transacciones</span>
                </button>
              </div>

              {/* Banner de resultado */}
              {simFeedback && (
                <div className="mt-3 p-3 bg-slate-800 rounded-2xl border border-slate-700 flex items-center justify-between text-xs text-slate-200 shadow-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{simFeedback}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSimFeedback(null)}
                    className="text-slate-400 hover:text-white text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* SECCIÓN 2: Diagnóstico Integral de Seguridad & Procesos */}
            <div className="bg-white rounded-3xl border border-neutral-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100">
                <div>
                  <h3 className="text-base font-extrabold text-neutral-900 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    Diagnóstico de Seguridad & Procesos Operativos
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Verifica la integridad de datos, aislamiento multi-sucursal, estado de Firestore y consistencia de credenciales.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={runningDiagnostic}
                  onClick={handleRunDiagnostic}
                  className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold transition flex items-center gap-2 shrink-0 disabled:opacity-50 shadow-xs"
                >
                  {runningDiagnostic ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Verificando...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Ejecutar Diagnóstico</span>
                    </>
                  )}
                </button>
              </div>

              {/* Resultados del Diagnóstico */}
              {diagnosticResults ? (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    
                    {/* Item 1: Conectividad Firestore */}
                    <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4 font-black" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-neutral-900">Base de Datos Cloud Firestore</div>
                        <div className="text-[11px] text-emerald-700 font-medium">Conexión activa con sincronización en tiempo real</div>
                      </div>
                    </div>

                    {/* Item 2: Aislamiento Multi-Tenant */}
                    <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4 font-black" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-neutral-900">Seguridad & Aislamiento Empresarial</div>
                        <div className="text-[11px] text-emerald-700 font-medium truncate">ID Único: {activeBizId}</div>
                      </div>
                    </div>

                    {/* Item 3: Sucursales y Mesas */}
                    <div className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
                      diagnosticResults.branchesAndTables.ok ? 'bg-neutral-50 border-neutral-200' : 'bg-amber-50 border-amber-200'
                    }`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        diagnosticResults.branchesAndTables.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {diagnosticResults.branchesAndTables.ok ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-neutral-900">Sedes y Mesas Físicas</div>
                        <div className="text-[11px] text-neutral-600">
                          {diagnosticResults.branchesAndTables.branches} sedes creadas, {diagnosticResults.branchesAndTables.tables} mesas configuradas
                        </div>
                      </div>
                    </div>

                    {/* Item 4: Personal y PINs */}
                    <div className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
                      diagnosticResults.staff.ok ? 'bg-neutral-50 border-neutral-200' : 'bg-amber-50 border-amber-200'
                    }`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        diagnosticResults.staff.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {diagnosticResults.staff.ok ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-neutral-900">Personal & PINs de Seguridad</div>
                        <div className="text-[11px] text-neutral-600">
                          {diagnosticResults.staff.validPin} de {diagnosticResults.staff.total} empleados con PIN de 4 dígitos activo
                        </div>
                      </div>
                    </div>

                    {/* Item 5: Menú y Platos */}
                    <div className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
                      diagnosticResults.menu.ok ? 'bg-neutral-50 border-neutral-200' : 'bg-amber-50 border-amber-200'
                    }`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        diagnosticResults.menu.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {diagnosticResults.menu.ok ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-neutral-900">Carta & Menú</div>
                        <div className="text-[11px] text-neutral-600">
                          {diagnosticResults.menu.total} platos ({diagnosticResults.menu.withPrices} con precios válidos)
                        </div>
                      </div>
                    </div>

                    {/* Item 6: Reglas de Seguridad & Roles */}
                    <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-neutral-900">Reglas Firestore & RBAC</div>
                        <div className="text-[11px] text-emerald-700 font-medium">Protección multi-sede con permisos validados</div>
                      </div>
                    </div>
                  </div>

                  {/* Advertencias o Sugerencias */}
                  {diagnosticResults.warnings.length > 0 ? (
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                      <div className="font-bold flex items-center gap-1.5 text-amber-950">
                        <AlertTriangle className="w-4 h-4 text-amber-700" />
                        <span>Sugerencias para optimizar tu fase de pruebas:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                        {diagnosticResults.warnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Todos los procesos, colecciones y reglas de seguridad se encuentran en estado óptimo.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-neutral-400">
                  Haz clic en "Ejecutar Diagnóstico" para comprobar el estado de los componentes y seguridad de la aplicación.
                </div>
              )}
            </div>

            {/* SECCIÓN 3: Mantenimiento Crítico & Zona de Peligro */}
            <div className="bg-red-50 border-2 border-red-200 rounded-3xl p-6 shadow-xs">
              <div className="flex items-center gap-3 text-red-700 mb-2">
                <Flame className="w-6 h-6 shrink-0" />
                <div>
                  <h3 className="text-base font-black text-red-950">Zona de Mantenimiento Avanzado</h3>
                  <p className="text-xs text-red-700">
                    Operaciones irreversibles con confirmación explícita.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {/* Reset Operativo de una sola sede */}
                <div className="bg-white rounded-2xl p-4 border border-red-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <h4 className="font-bold text-neutral-900">Restablecer Datos de la Sede Activa ({currentRestaurant?.nombre || 'Ninguna'})</h4>
                    <p className="text-neutral-500 mt-0.5">Borra pedidos y turnos únicamente de esta sucursal.</p>
                  </div>
                  <button
                    type="button"
                    disabled={!currentRestaurant}
                    onClick={() => currentRestaurant && handleOpenDangerModal('reset_operational', currentRestaurant)}
                    className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shrink-0 transition disabled:opacity-40"
                  >
                    Reset Sede
                  </button>
                </div>

                {/* Eliminar una sede completa */}
                <div className="bg-white rounded-2xl p-4 border border-red-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <h4 className="font-bold text-neutral-900">Eliminar Sede Completa en Cascada</h4>
                    <p className="text-neutral-500 mt-0.5">Elimina el local <strong>{currentRestaurant?.nombre}</strong> y todas sus mesas y pedidos.</p>
                  </div>
                  <button
                    type="button"
                    disabled={!currentRestaurant}
                    onClick={() => currentRestaurant && handleOpenDangerModal('delete_restaurant', currentRestaurant)}
                    className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shrink-0 transition disabled:opacity-40"
                  >
                    Eliminar Sede
                  </button>
                </div>

                {/* Borrar toda la cuenta */}
                <div className="bg-red-950 text-white rounded-2xl p-4 border border-red-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <h4 className="font-bold text-white">Restablecer Todo a Estado de Fábrica</h4>
                    <p className="text-neutral-300 mt-0.5">Borra absolutamente todo para volver al Onboarding inicial.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenDangerModal('delete_account')}
                    className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold shrink-0 transition"
                  >
                    Borrar Toda la Cuenta
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* MODAL: Crear/Editar Restaurante */}
      {showRestModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-neutral-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-extrabold text-base text-neutral-900">
              {editingRest ? 'Editar Local' : 'Nuevo Local / Restaurante'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Nombre del Local:</label>
                <input
                  type="text"
                  value={restForm.nombre}
                  onChange={(e) => setRestForm({ ...restForm, nombre: e.target.value })}
                  placeholder="Ej: Sede Norte / Cafetería Centro"
                  className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Dirección:</label>
                <input
                  type="text"
                  value={restForm.direccion}
                  onChange={(e) => setRestForm({ ...restForm, direccion: e.target.value })}
                  placeholder="Ej: Av. Principal #123"
                  className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Teléfono:</label>
                <input
                  type="text"
                  value={restForm.telefono}
                  onChange={(e) => setRestForm({ ...restForm, telefono: e.target.value })}
                  placeholder="Ej: +58 412 0000000"
                  className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Código de Sede (4 dígitos numéricos):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={restForm.codigoSede}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setRestForm({ ...restForm, codigoSede: digitsOnly });
                      setRestFormError(null);
                    }}
                    placeholder="Ej: 2481"
                    className="flex-1 h-10 px-3 rounded-xl border border-neutral-300 font-mono font-black text-sm tracking-widest text-neutral-900 outline-none focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setRestForm({ ...restForm, codigoSede: generateUniqueCodigoSedeForBusiness(editingRest?.id) });
                      setRestFormError(null);
                    }}
                    className="h-10 px-3 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0"
                    title="Generar código único de 4 dígitos"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Generar</span>
                  </button>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Los primeros 4 dígitos del código de 8 dígitos que ingresan los empleados de esta sucursal.
                </p>
              </div>

              {restFormError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{restFormError}</span>
                </div>
              )}

              {/* Subida y Preview de Logo del Local */}
              <LogoUploader
                logoUrl={restForm.logoUrl}
                onChange={(url) => setRestForm({ ...restForm, logoUrl: url })}
                restaurantName={restForm.nombre}
                label="Logotipo de la Sucursal / Restaurante:"
                helperText="Sube el logo o isotipo en formato PNG o JPG."
              />

              {/* Modo de Cocina y Despacho */}
              <div className="pt-2 border-t border-neutral-100 space-y-2">
                <label className="block text-xs font-bold text-neutral-800">
                  Modo Operativo de Pedidos & Cocina:
                </label>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRestForm({ ...restForm, usaCocina: true })}
                    className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between gap-1.5 cursor-pointer ${
                      restForm.usaCocina !== false
                        ? 'bg-amber-50/80 border-amber-400 text-amber-950 shadow-xs ring-2 ring-amber-400/20'
                        : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-1.5 font-extrabold text-xs text-amber-900">
                        <ChefHat className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Con Cocina (KDS)</span>
                      </div>
                      <input
                        type="radio"
                        name="usaCocinaOption"
                        checked={restForm.usaCocina !== false}
                        onChange={() => setRestForm({ ...restForm, usaCocina: true })}
                        className="text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                    </div>
                    <p className="text-[11px] text-neutral-600 leading-tight">
                      Para locales con cocina y preparación. Los pedidos activan alertas y pasan por KDS.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRestForm({ ...restForm, usaCocina: false })}
                    className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between gap-1.5 cursor-pointer ${
                      restForm.usaCocina === false
                        ? 'bg-purple-50/80 border-purple-400 text-purple-950 shadow-xs ring-2 ring-purple-400/20'
                        : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-1.5 font-extrabold text-xs text-purple-900">
                        <Store className="w-4 h-4 text-purple-600 shrink-0" />
                        <span>Sin Cocina</span>
                      </div>
                      <input
                        type="radio"
                        name="usaCocinaOption"
                        checked={restForm.usaCocina === false}
                        onChange={() => setRestForm({ ...restForm, usaCocina: false })}
                        className="text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                    </div>
                    <p className="text-[11px] text-neutral-600 leading-tight">
                      Para cafeterías, quioscos o heladerías. Los pedidos van directo al mostrador sin alerta de cocina.
                    </p>
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowRestModal(false)}
                className="flex-1 h-11 rounded-xl bg-neutral-100 font-bold text-xs text-neutral-700 hover:bg-neutral-200 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveRestaurant}
                className="flex-1 h-11 rounded-xl bg-orange-600 hover:bg-orange-700 font-bold text-xs text-white transition shadow-sm"
              >
                Guardar Local
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Crear/Editar Empleado */}
      {showEmpModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
            <h3 className="font-extrabold text-base text-neutral-900">
              {editingEmp ? 'Editar Empleado' : 'Nuevo Empleado'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Nombre y Apellido:</label>
                <input
                  type="text"
                  value={empForm.nombre}
                  onChange={(e) => setEmpForm({ ...empForm, nombre: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-orange-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Puesto / Rol:</label>
                  <select
                    value={empForm.puesto}
                    onChange={(e) => setEmpForm({ ...empForm, puesto: e.target.value as any })}
                    className="w-full h-10 px-2 rounded-xl border border-neutral-300 text-xs font-bold"
                  >
                    <option value="admin">Administrador</option>
                    <option value="caja">Cajero / Caja</option>
                    <option value="mostrador">Personal de Mostrador / Despacho</option>
                    <option value="mesero">Mesero / POS</option>
                    <option value="cocina">Cocinero / KDS</option>
                    <option value="ayudante_cocina">Ayudante de Cocina</option>
                    <option value="limpieza">Personal de Limpieza</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">PIN (4 dígitos):</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={empForm.pin}
                    onChange={(e) => setEmpForm({ ...empForm, pin: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-mono font-bold"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Modalidad de Sueldo:</label>
                  <select
                    value={empForm.modalidadPago === 'mes' || empForm.modalidadPago === 'fijo' ? 'mes' : 'por_dia'}
                    onChange={(e) => setEmpForm({ ...empForm, modalidadPago: e.target.value as any })}
                    className="w-full h-10 px-2 rounded-xl border border-neutral-300 text-xs font-bold"
                  >
                    <option value="por_dia">Pago por Día Trabajado</option>
                    <option value="mes">Sueldo Mensual Fijo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Sede / Local:</label>
                  <select
                    value={empForm.restaurantId}
                    onChange={(e) => setEmpForm({ ...empForm, restaurantId: e.target.value })}
                    className="w-full h-10 px-2 rounded-xl border border-neutral-300 text-xs font-bold"
                  >
                    {restaurants.map(r => (
                      <option key={r.id} value={r.id}>{r.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                {(empForm.modalidadPago !== 'mes' && empForm.modalidadPago !== 'fijo') ? (
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">Sueldo por Día Trabajado ($):</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={empForm.tarifaDiaria}
                      onChange={(e) => setEmpForm({ ...empForm, tarifaDiaria: parseFloat(e.target.value) || 0 })}
                      className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-bold"
                    />
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Se multiplica por cada día trabajado registrado en Asistencia & Planilla.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">Sueldo Mensual ($):</label>
                    <input
                      type="number"
                      step="10"
                      min="1"
                      value={empForm.sueldoMensual}
                      onChange={(e) => setEmpForm({ ...empForm, sueldoMensual: parseFloat(e.target.value) || 0 })}
                      className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-bold"
                    />
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Equivalente diario: ${((empForm.sueldoMensual || 0) / 30).toFixed(2)} / día (base 30 días).
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowEmpModal(false)}
                className="flex-1 h-11 rounded-xl bg-neutral-100 font-bold text-xs text-neutral-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEmployee}
                className="flex-1 h-11 rounded-xl bg-orange-600 font-bold text-xs text-white"
              >
                Guardar Empleado
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Reset de PIN rápido */}
      {pinResetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-neutral-100 space-y-3">
            <h4 className="font-black text-neutral-900 text-sm flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-orange-600" />
              Resetear PIN para {pinResetModal.empName}
            </h4>
            <p className="text-xs text-neutral-500">Ingresa el nuevo PIN de 4 números:</p>
            <input
              type="text"
              maxLength={4}
              autoFocus
              placeholder="Ej: 9988"
              value={pinResetModal.newPin}
              onChange={(e) => setPinResetModal({ ...pinResetModal, newPin: e.target.value })}
              className="w-full h-12 text-center font-mono font-black text-xl rounded-xl border border-neutral-300 tracking-widest focus:border-orange-500 outline-none"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setPinResetModal(null)}
                className="flex-1 h-10 rounded-xl bg-neutral-100 font-bold text-xs text-neutral-700"
              >
                Cancelar
              </button>
              <button
                disabled={pinResetModal.newPin.length !== 4}
                onClick={handleConfirmResetPin}
                className="flex-1 h-10 rounded-xl bg-orange-600 font-bold text-xs text-white disabled:opacity-40"
              >
                Guardar PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Crear/Editar Plato del Menú con Subida de Foto a Firebase Storage */}
      {showMenuModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-neutral-100 space-y-4 max-h-[calc(100vh-2rem)] sm:max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  <UtensilsCrossed className="w-4 h-4" />
                </div>
                <h3 className="font-extrabold text-base text-neutral-900">
                  {editingMenu ? 'Editar Plato' : 'Nuevo Plato del Menú'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMenuModal(false)}
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-500 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 overflow-y-auto pr-1 flex-1 min-h-0">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Nombre del Plato *</label>
                <input
                  type="text"
                  placeholder="Ej: Hamburguesa Suprema Especial"
                  value={menuForm.nombre}
                  onChange={(e) => setMenuForm({ ...menuForm, nombre: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Descripción e Ingredientes</label>
                <textarea
                  rows={2}
                  placeholder="Carne 200g, queso cheddar, cebolla caramelizada, pan brioche..."
                  value={menuForm.descripcion}
                  onChange={(e) => setMenuForm({ ...menuForm, descripcion: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 text-xs outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Precio de Venta ($) *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={menuForm.precio}
                    onChange={(e) => setMenuForm({ ...menuForm, precio: parseFloat(e.target.value) || 0 })}
                    className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Costo de Elaboración ($)</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    placeholder="0.00"
                    value={menuForm.costoElaboracion}
                    onChange={(e) => setMenuForm({ ...menuForm, costoElaboracion: parseFloat(e.target.value) || 0 })}
                    className="w-full h-10 px-3 rounded-xl border border-amber-300 bg-amber-50/40 text-xs font-bold text-amber-900"
                  />
                  <div className="text-[10px] text-neutral-500 mt-0.5">Materia prima e insumos</div>
                </div>
              </div>

              {/* Indicador de Rentabilidad en Tiempo Real */}
              {(() => {
                const p = Number(menuForm.precio) || 0;
                const c = Number(menuForm.costoElaboracion) || 0;
                const margin$ = p - c;
                const marginPct = p > 0 ? (margin$ / p) * 100 : 0;
                const foodCostPct = p > 0 ? (c / p) * 100 : 0;
                const isLoss = margin$ < 0;

                return (
                  <div className={`p-3 rounded-2xl border text-xs ${
                    isLoss ? 'bg-red-50 border-red-200 text-red-900' : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                  }`}>
                    <div className="flex items-center justify-between font-bold pb-1.5 border-b border-neutral-200/60">
                      <span className="flex items-center gap-1">
                        <Percent className="w-3.5 h-3.5 text-emerald-700" />
                        Análisis de Rentabilidad por Plato
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        isLoss ? 'bg-red-200 text-red-800' : marginPct >= 65 ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'
                      }`}>
                        {isLoss ? 'Alerta: Pérdida' : marginPct >= 65 ? 'Margen Óptimo (>65%)' : 'Margen Saludable'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                      <div>
                        <div className="text-[10px] text-neutral-500 font-medium">Ganancia Bruta</div>
                        <div className={`font-mono font-black text-sm ${isLoss ? 'text-red-700' : 'text-emerald-800'}`}>
                          ${margin$.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-neutral-500 font-medium">Margen Utilidad</div>
                        <div className="font-mono font-black text-sm text-emerald-700">
                          {marginPct.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-neutral-500 font-medium">Food Cost</div>
                        <div className="font-mono font-black text-sm text-amber-800">
                          {foodCostPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Categoría</label>
                <input
                  type="text"
                  value={menuForm.categoria}
                  onChange={(e) => {
                    const newCat = e.target.value;
                    setMenuForm(prev => ({
                      ...prev,
                      categoria: newCat
                    }));
                  }}
                  placeholder="Ej: Platos Fuertes, Bebidas, Postres..."
                  className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-bold"
                />
              </div>

              {/* RUTA / DESTINO: Opción de Preparación: Cocina vs Preparación Xpress */}
              <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-black text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                      <span>Opción de Preparación del Producto</span>
                    </label>
                    <p className="text-[11px] text-neutral-500">
                      Define si se envía a la pantalla KDS de Cocina o si es despacho directo en mostrador/barra.
                    </p>
                  </div>
                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase shrink-0 border ${
                    menuForm.requiereCocina 
                      ? 'bg-orange-100 text-orange-800 border-orange-200' 
                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  }`}>
                    {menuForm.requiereCocina ? '👨‍🍳 Ruta: Cocina' : '⚡ Ruta: Xpress'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsManualCocinaTouched(true);
                      setMenuForm(prev => ({ ...prev, requiereCocina: true }));
                    }}
                    className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex items-start gap-3 ${
                      menuForm.requiereCocina 
                        ? 'bg-orange-50/90 border-orange-500 shadow-xs ring-2 ring-orange-400/20' 
                        : 'bg-white border-neutral-200 hover:border-neutral-300 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      menuForm.requiereCocina ? 'bg-orange-500 text-white' : 'bg-neutral-100 text-neutral-500'
                    }`}>
                      <ChefHat className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-neutral-900 flex items-center gap-1">
                        <span>Preparación en Cocina</span>
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
                        Se envía a la comanda y pantalla KDS de Cocina para su elaboración y comande.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsManualCocinaTouched(true);
                      setMenuForm(prev => ({ ...prev, requiereCocina: false }));
                    }}
                    className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex items-start gap-3 ${
                      !menuForm.requiereCocina 
                        ? 'bg-emerald-50/90 border-emerald-500 shadow-xs ring-2 ring-emerald-400/20' 
                        : 'bg-white border-neutral-200 hover:border-neutral-300 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      !menuForm.requiereCocina ? 'bg-emerald-600 text-white' : 'bg-neutral-100 text-neutral-500'
                    }`}>
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-neutral-900 flex items-center gap-1">
                        <span>Preparación Xpress</span>
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
                        Despacho inmediato en mostrador o barra sin ocupar la pantalla de cocina.
                      </p>
                    </div>
                  </button>
                </div>

                <div className="p-2.5 bg-neutral-100/80 rounded-xl text-[11px] text-neutral-600 flex items-center gap-2">
                  <Info className="w-4 h-4 text-orange-600 shrink-0" />
                  <span>
                    Todos los productos tienen ambas opciones. Además, los meseros y cajeros pueden cambiar entre Cocina y Xpress al tomar pedidos.
                  </span>
                </div>
              </div>

              {/* ESTADO DE DISPONIBILIDAD EN CARTA */}
              <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      menuForm.disponible ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-neutral-900 flex items-center gap-1.5">
                        {menuForm.disponible ? 'Disponible para Venta' : 'Pausado / Fuera de Carta'}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          menuForm.disponible ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {menuForm.disponible ? 'Disponible' : 'Agotado'}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-500 leading-tight mt-0.5">
                        {menuForm.disponible 
                          ? 'Habilitado en el punto de venta y cartas digitales para recibir pedidos' 
                          : 'Pausado temporalmente (no se podrá seleccionar en comandas)'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMenuForm(prev => ({ ...prev, disponible: !prev.disponible }))}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      menuForm.disponible ? 'bg-emerald-600' : 'bg-neutral-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        menuForm.disponible ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* CONTROL DE INVENTARIO Y STOCK (OPCIONAL) */}
              <div className="p-3.5 bg-amber-50/50 rounded-2xl border border-amber-200/80">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                      <Boxes className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-neutral-900 flex items-center gap-1.5">
                        Control de Inventario & Stock
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-bold uppercase bg-amber-100 text-amber-800">
                          Opcional
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-500">Descuenta automáticamente al ordenar y emite alertas de agotamiento</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMenuForm(prev => ({ ...prev, controlaStock: !prev.controlaStock }))}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      menuForm.controlaStock ? 'bg-amber-600' : 'bg-neutral-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        menuForm.controlaStock ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {!menuForm.controlaStock ? (
                  <div className="mt-2.5 text-[11px] text-neutral-600 bg-white/80 p-2.5 rounded-xl border border-amber-200/50 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span><strong>Sin control de inventario:</strong> Podés guardar y modificar este plato libremente sin necesidad de marcar stock ni unidades.</span>
                    </div>
                    <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md shrink-0">
                      Venta Libre
                    </span>
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-amber-200/60 space-y-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700 mb-1">Stock Actual *</label>
                        <input
                          type="number"
                          min="0"
                          value={menuForm.stockActual}
                          onChange={(e) => setMenuForm(prev => ({ ...prev, stockActual: Math.max(0, parseInt(e.target.value) || 0) }))}
                          className="w-full h-9 px-2.5 rounded-xl border border-amber-300 bg-white text-xs font-black text-neutral-900"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700 mb-1">Stock Mínimo (Alerta) *</label>
                        <input
                          type="number"
                          min="1"
                          value={menuForm.stockMinimo}
                          onChange={(e) => setMenuForm(prev => ({ ...prev, stockMinimo: Math.max(1, parseInt(e.target.value) || 1) }))}
                          className="w-full h-9 px-2.5 rounded-xl border border-amber-300 bg-white text-xs font-bold text-neutral-900"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-neutral-700 mb-1">Unidad de Medida</label>
                        <input
                          type="text"
                          value={menuForm.unidadMedida}
                          onChange={(e) => setMenuForm(prev => ({ ...prev, unidadMedida: e.target.value }))}
                          placeholder="unidades, porciones..."
                          className="w-full h-9 px-2.5 rounded-xl border border-neutral-300 bg-white text-xs font-bold text-neutral-800"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-xl bg-white border border-amber-200">
                      <span className="text-neutral-600">Estado según stock:</span>
                      <span className={`font-black uppercase text-[10px] px-2 py-0.5 rounded-full ${
                        Number(menuForm.stockActual) <= 0 
                          ? 'bg-red-100 text-red-800' 
                          : Number(menuForm.stockActual) <= Number(menuForm.stockMinimo) 
                          ? 'bg-amber-100 text-amber-800' 
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {Number(menuForm.stockActual) <= 0 
                          ? 'Agotado (0)' 
                          : Number(menuForm.stockActual) <= Number(menuForm.stockMinimo) 
                          ? 'Alerta de Stock Bajo' 
                          : 'Stock Saludable'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Sede / Disponibilidad de Menú</label>
                <select
                  value={menuForm.restaurantId}
                  onChange={(e) => setMenuForm({ ...menuForm, restaurantId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-bold bg-white"
                >
                  <option value="all">Todas las Sedes</option>
                  {restaurants.map(r => (
                    <option key={r.id} value={r.id}>{r.nombre}</option>
                  ))}
                </select>
              </div>

              {/* SECCIÓN DE SUBIDA DE FOTO DEL PLATO */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1 flex items-center justify-between">
                  <span>Foto del Plato:</span>
                  <span className="text-[10px] text-neutral-400 font-normal">JPG, PNG, WEBP (Auto-comprimida a 800px)</span>
                </label>

                {/* Input oculto de archivos nativo */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoSelect}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />

                {photoPreviewUrl ? (
                  /* Vista previa de la foto con botón Quitar */
                  <div className="relative rounded-2xl overflow-hidden border-2 border-orange-300 bg-neutral-900 group shadow-xs">
                    <img
                      src={photoPreviewUrl}
                      alt="Vista previa plato"
                      referrerPolicy="no-referrer"
                      className="w-full h-40 object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 flex items-end justify-between p-3">
                      <span className="text-white text-[11px] font-bold truncate max-w-[200px]">
                        {selectedPhotoFile ? selectedPhotoFile.name : 'Foto actual del plato'}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1 rounded-lg bg-white/95 hover:bg-white text-neutral-900 font-bold text-[11px] shadow-sm transition active:scale-95"
                        >
                          Cambiar
                        </button>
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] shadow-sm flex items-center gap-1 transition active:scale-95"
                        >
                          <Trash2 className="w-3 h-3" />
                          Quitar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Botón Subir Foto */
                  <div className="border-2 border-dashed border-neutral-300 hover:border-orange-400 rounded-2xl p-4 text-center bg-neutral-50/50 transition">
                    <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-neutral-700">Sin foto seleccionada</p>
                    <p className="text-[11px] text-neutral-400 mb-3">Se mostrará en la carta del mesero y comandas de cocina</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-xs active:scale-95 transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Subir foto
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-3 border-t border-neutral-100">
              {editingMenu && (
                <button
                  type="button"
                  disabled={isUploadingPhoto}
                  onClick={() => handleConfirmDeleteMenuItemWithAudit(editingMenu)}
                  className="px-3.5 h-11 rounded-xl bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  title="Borrar plato del menú sin afectar su historial de ventas"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Borrar Plato</span>
                </button>
              )}
              <button
                type="button"
                disabled={isUploadingPhoto}
                onClick={() => setShowMenuModal(false)}
                className="flex-1 h-11 rounded-xl bg-neutral-100 hover:bg-neutral-200 font-bold text-xs text-neutral-700 transition disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isUploadingPhoto || !menuForm.nombre.trim()}
                onClick={handleSaveMenuItem}
                className="flex-1 h-11 rounded-xl bg-orange-600 hover:bg-orange-700 font-bold text-xs text-white shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
              >
                {isUploadingPhoto ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Guardando foto...</span>
                  </>
                ) : (
                  <span>Guardar Plato</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirmación para Borrar Plato del Menú Conservando Historial de Ventas */}
      {dishToDeleteModal && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-neutral-900">
                    ¿Borrar plato del menú activo?
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {dishToDeleteModal.nombre} · ${dishToDeleteModal.precio.toFixed(2)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDishToDeleteModal(null)}
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
              <div className="font-black flex items-center gap-1.5 text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Historial de ventas 100% protegido</span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Este plato se retirará de la carta activa (Meseros, Caja y Menú), pero <strong>todas sus ventas históricas, ingresos cobrados, unidades vendidas y reportes financieros P&L se conservarán intactos</strong>.
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingDish}
                onClick={() => setDishToDeleteModal(null)}
                className="flex-1 h-11 rounded-xl bg-neutral-100 hover:bg-neutral-200 font-bold text-xs text-neutral-700 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingDish}
                onClick={handleExecuteDeleteDish}
                className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 font-black text-xs text-white shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingDish ? 'Borrando del menú...' : 'Sí, Borrar del Menú'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast flotante de confirmación de borrado de plato */}
      {dishDeletedToast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md bg-neutral-900 text-white px-4 py-3.5 rounded-2xl shadow-2xl border border-emerald-500/40 flex items-center gap-3 text-xs font-bold animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="flex-1 leading-snug">{dishDeletedToast}</span>
          <button
            type="button"
            onClick={() => setDishDeletedToast(null)}
            className="text-neutral-400 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* MODAL: Gestión de Mesas del Restaurante */}
      {tableModalRest && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  <Grid3X3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900">
                    Gestión de Mesas
                  </h3>
                  <p className="text-xs text-neutral-500">{tableModalRest.nombre}</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setTableModalRest(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1 text-base font-bold"
              >
                ✕
              </button>
            </div>

            {tableOperationMsg && (
              <div className={`p-3 rounded-xl text-xs font-semibold ${
                tableOperationMsg.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {tableOperationMsg.text}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Número Total de Mesas (1 al N):
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={tableCountInput}
                    onChange={(e) => setTableCountInput(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-28 h-11 px-3 rounded-xl border-2 border-neutral-300 text-base font-black text-center outline-none focus:border-orange-500"
                  />
                  <div className="text-xs text-neutral-500">
                    Mesas actuales: <strong className="text-neutral-800">{tableModalRest.numeroMesas || 10}</strong>.
                    Si aumentas, se crearán mesas libres. Si reduces, no debe haber mesas ocupadas en el rango a eliminar.
                  </div>
                </div>
              </div>

              <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-2">
                <div className="text-xs font-bold text-neutral-700 flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-neutral-500" />
                  Renumerar Mesas Correlativamente
                </div>
                <p className="text-[11px] text-neutral-500">
                  Asegura que todas las mesas del local queden numeradas secuencialmente del 1 al {tableModalRest.numeroMesas || 10} sin huecos numéricos.
                </p>
                <button
                  type="button"
                  disabled={isProcessingTables}
                  onClick={handleRenumberTables}
                  className="px-3 py-1.5 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 text-xs font-bold transition disabled:opacity-50"
                >
                  Renumerar del 1 al N
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setTableModalRest(null)}
                className="flex-1 h-11 rounded-xl bg-neutral-100 font-bold text-xs text-neutral-700"
              >
                Cerrar
              </button>
              <button
                type="button"
                disabled={isProcessingTables}
                onClick={handleUpdateTableCount}
                className="flex-1 h-11 rounded-xl bg-orange-600 hover:bg-orange-700 font-bold text-xs text-white shadow-md transition disabled:opacity-50"
              >
                {isProcessingTables ? 'Guardando...' : 'Aplicar Mesas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirmación Zona de Peligro con Resumen Previo */}
      {dangerModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border-2 border-red-500 space-y-4">
            <div className="flex items-center gap-3 text-red-600 pb-2 border-b border-red-100">
              <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-black text-base text-neutral-900">
                  {dangerModal.type === 'reset_test_data' && 'Confirmar Reset Transaccional / Operativo'}
                  {dangerModal.type === 'reset_operational' && 'Confirmar Reset Operativo de Sucursal'}
                  {dangerModal.type === 'delete_restaurant' && 'Confirmar Eliminación en Cascada'}
                  {dangerModal.type === 'delete_account' && 'Confirmar Eliminación de Toda la Cuenta'}
                </h3>
                <p className="text-xs text-red-600 font-semibold">Esta acción es irreversible y destruye datos de Firestore.</p>
              </div>
            </div>

            {/* Resumen de impacto previo */}
            {dangerModal.summary && (
              <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200 text-xs space-y-2">
                <div className="font-bold text-neutral-800 uppercase text-[11px] tracking-wider mb-1">
                  Resumen de lo que se eliminará:
                </div>
                <div className="grid grid-cols-2 gap-2 text-neutral-700 font-medium">
                  {'pedidos' in dangerModal.summary && (
                    <div className="p-2 bg-white rounded-lg border border-neutral-200">
                      📦 Pedidos: <strong className="text-red-600">{dangerModal.summary.pedidos}</strong>
                    </div>
                  )}
                  {'gastos' in dangerModal.summary && (
                    <div className="p-2 bg-white rounded-lg border border-neutral-200">
                      💸 Gastos: <strong className="text-red-600">{dangerModal.summary.gastos}</strong>
                    </div>
                  )}
                  {'turnos' in dangerModal.summary && (
                    <div className="p-2 bg-white rounded-lg border border-neutral-200">
                      ⏱️ Turnos: <strong className="text-red-600">{dangerModal.summary.turnos}</strong>
                    </div>
                  )}
                  {'mesas' in dangerModal.summary && (
                    <div className="p-2 bg-white rounded-lg border border-neutral-200">
                      🪑 Mesas: <strong className="text-red-600">{(dangerModal.summary as any).mesas}</strong>
                    </div>
                  )}
                  {'empleados' in dangerModal.summary && (
                    <div className="p-2 bg-white rounded-lg border border-neutral-200">
                      👥 Empleados: <strong className="text-red-600">{(dangerModal.summary as any).empleados}</strong>
                    </div>
                  )}
                </div>
                {(dangerModal.type === 'reset_operational' || dangerModal.type === 'reset_test_data') && (
                  <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                    ✓ Las sucursales, mesas, menú y empleados NO serán eliminados.
                  </p>
                )}
              </div>
            )}

            {dangerModal.type === 'delete_account' && (
              <div className="bg-red-50 p-3 rounded-2xl border border-red-200 text-xs text-red-900 font-medium space-y-1">
                <p>Se borrarán todos los locales, mesas, empleados, cartas, turnos y pedidos de toda la aplicación.</p>
                <p>La aplicación regresará a la pantalla de bienvenida y Onboarding inicial.</p>
              </div>
            )}

            {/* Confirmación textual de seguridad */}
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Escribe <span className="font-mono bg-red-100 text-red-700 px-1 py-0.5 rounded font-bold">CONFIRMAR</span> para proceder:
              </label>
              <input
                type="text"
                placeholder="CONFIRMAR"
                value={dangerConfirmationText}
                onChange={(e) => setDangerConfirmationText(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-neutral-300 font-mono text-xs font-bold uppercase outline-none focus:border-red-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDangerModal(null)}
                className="flex-1 h-11 rounded-xl bg-neutral-100 font-bold text-xs text-neutral-700 hover:bg-neutral-200 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={dangerConfirmationText.trim().toUpperCase() !== 'CONFIRMAR' || isProcessingDanger}
                onClick={handleExecuteDangerAction}
                className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 font-bold text-xs text-white shadow-md transition disabled:opacity-40"
              >
                {isProcessingDanger ? 'Eliminando...' : 'Ejecutar Eliminación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Reparar Pedidos Atascados */}
      <AdminRepairModal
        orders={orders}
        isOpen={showRepairModal}
        onClose={() => setShowRepairModal(false)}
        adminName={currentUserAccount?.nombre || 'Administrador'}
      />

      {/* Modal Centro de Mensajes, Avisos y Alertas de Seguridad */}
      <AdminMessageCenterModal
        isOpen={showMessageCenterModal}
        onClose={() => setShowMessageCenterModal(false)}
        alerts={securityAlerts}
        onDismissAndClearAlert={dismissAndClearAlert}
        onMarkRead={markAlertRead}
        onDeleteAlert={deleteAlert}
        onClearReadAlerts={clearReadAlerts}
        onClearAllAlerts={clearAllAlerts}
      />

      {/* Modal de Reabastecimiento Rápido de Inventario / Stock */}
      <QuickRestockModal
        isOpen={showRestockModal}
        onClose={() => setShowRestockModal(false)}
        menuItems={menuItems}
        restaurants={restaurants}
        onUpdateStock={async (itemId, newStock, newMin) => {
          const item = menuItems.find(i => i.id === itemId);
          if (item) {
            try {
              const actor = getAuditActor();
              const rest = restaurants.find(r => r.id === item.restaurantId);
              await recordMenuAuditLog({
                businessId: activeBizId,
                restaurantId: item.restaurantId,
                restaurantNombre: rest?.nombre || 'Todas las sedes',
                platoId: item.id,
                platoNombre: item.nombre,
                tipoAccion: 'ajuste_stock',
                detalles: `Reabastecimiento de inventario: Stock ${item.stockActual ?? 0} → ${newStock} ${item.unidadMedida || 'unidades'}, Mínimo ${item.stockMinimo ?? 5} → ${newMin}`,
                cambios: [
                  { campo: 'stockActual', valorAnterior: item.stockActual ?? 0, valorNuevo: newStock },
                  { campo: 'stockMinimo', valorAnterior: item.stockMinimo ?? 5, valorNuevo: newMin }
                ],
                empleadoId: actor.id,
                empleadoNombre: actor.nombre,
                empleadoRol: actor.rol,
                fecha: new Date().toISOString()
              });
            } catch (auditErr) {
              console.warn('Error en auditoría de reabastecimiento:', auditErr);
            }
          }
          await updateMenuItemStock(itemId, newStock, newMin);
        }}
        onQuickAdjust={async (itemId, delta) => {
          const item = menuItems.find(i => i.id === itemId);
          if (item) {
            await handleQuickStockAdjustWithAudit(item, delta);
          } else {
            await quickAdjustMenuItemStock(itemId, delta);
          }
        }}
      />

      {/* Modal Exportación de Reportes PDF Oficiales (Inventario & Cierres de Caja) */}
      <AdminPdfReportsModal
        isOpen={showPdfExportModal}
        onClose={() => setShowPdfExportModal(false)}
        initialTab={pdfModalInitialTab}
        menuItems={menuItems}
        cashCloses={cashCloses}
        restaurants={restaurants}
        businessName={currentBusiness?.nombre || 'Gastro Smart'}
        currentUserName={currentUserAccount?.nombre || 'Administrador'}
      />

    </div>
  );
};
