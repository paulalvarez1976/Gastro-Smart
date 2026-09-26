import React, { useState, useMemo, useEffect } from 'react';
import { 
  Shift, 
  Employee, 
  Restaurant, 
  PaymentMethod,
  Expense
} from '../types';
import { 
  paySalaryBatch,
  payFixedSalaryExpense,
  payShiftSalary,
  createExpense,
  subscribeToExpenses,
  getOperationalDateString,
  getOperationalMonthString
} from '../services/dataService';
import { exportPayrollToExcel, PayrollEmployeeRow } from '../services/excelService';
import { sounds } from '../utils/sound';
import { 
  Users, 
  DollarSign, 
  Calendar, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  BarChart3, 
  X,
  ChevronDown,
  ChevronUp,
  Wallet,
  Download,
  CalendarCheck,
  TrendingUp
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';

interface StaffAttendanceAdminViewProps {
  shifts: Shift[];
  employees: Employee[];
  restaurants: Restaurant[];
  businessId: string;
  businessName: string;
  currentUserName: string;
  userRole: 'owner' | 'admin';
}

interface EmployeeDayWorkedDetail {
  fechaOperativa: string;
  fechaLabel: string;
  turnos: Shift[];
  ventasDia: number;
  pedidosDia: number;
  pagadoDia: boolean;
  reportes: string[];
}

interface UnifiedEmployeePayrollItem extends PayrollEmployeeRow {
  avatarUrl?: string;
  isMonthlyFixed: boolean;
  sueldoMensual: number;
  diasDetalle: EmployeeDayWorkedDetail[];
  isPaidFixedMonth: boolean;
  employeeObj: Employee;
}

export const StaffAttendanceAdminView: React.FC<StaffAttendanceAdminViewProps> = ({
  shifts,
  employees,
  restaurants,
  businessId,
  businessName,
  currentUserName,
  userRole
}) => {
  if (userRole !== 'owner' && userRole !== 'admin') {
    return (
      <div className="p-8 text-center text-neutral-500 font-bold bg-white rounded-2xl border border-neutral-200">
        Acceso restringido: Solo administradores y propietarios tienen acceso a la gestión de asistencia y planilla.
      </div>
    );
  }

  // Filtros unificados (sin pestañas redundantes)
  const [dateRangePreset, setDateRangePreset] = useState<'hoy' | 'semana' | 'quincena' | 'mes' | 'todos'>('mes');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [modalityFilter, setModalityFilter] = useState<'all' | 'por_dia' | 'mes'>('all');

  // Fila expandida para ver el detalle de días trabajados y jornadas de un empleado
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  // Modal de liquidación masiva de planilla
  const [showPayrollModal, setShowPayrollModal] = useState<boolean>(false);
  const [isProcessingSalary, setIsProcessingSalary] = useState<boolean>(false);
  const [salarySuccessToast, setSalarySuccessToast] = useState<string | null>(null);
  const [selectedForPayment, setSelectedForPayment] = useState<Record<string, boolean>>({});

  // Modal de liquidación individual de empleado (Diario o Mensual)
  const [payingSingleRow, setPayingSingleRow] = useState<UnifiedEmployeePayrollItem | null>(null);
  const [singlePayMethod, setSinglePayMethod] = useState<PaymentMethod>('transferencia');
  const [singlePayNotes, setSinglePayNotes] = useState<string>('');
  const [isProcessingSinglePay, setIsProcessingSinglePay] = useState<boolean>(false);
  const [singlePayError, setSinglePayError] = useState<string | null>(null);
  const [payingShiftId, setPayingShiftId] = useState<string | null>(null);

  // Control de mes operativo para liquidación mensual
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();
  const defaultMonthKey = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`;
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(defaultMonthKey);

  // Gastos de sueldos registrados en tiempo real
  const [salaryExpenses, setSalaryExpenses] = useState<Expense[]>([]);

  useEffect(() => {
    const targetRestId = selectedBranchId === 'all' ? null : selectedBranchId;
    const unsub = subscribeToExpenses(businessId, targetRestId, (data) => {
      setSalaryExpenses(data.filter(e => e.tipo === 'sueldo'));
    });
    return () => unsub();
  }, [businessId, selectedBranchId]);

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const availableMonths = useMemo(() => {
    const list = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(currentYear, currentMonthIdx - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      list.push({ key, label });
    }
    return list;
  }, [currentYear, currentMonthIdx]);

  const selectedMonthLabel = useMemo(() => {
    const m = availableMonths.find(am => am.key === selectedMonthKey);
    if (m) return m.label;
    const [y, mm] = selectedMonthKey.split('-');
    const idx = parseInt(mm, 10) - 1;
    return `${monthNames[idx] || mm} ${y}`;
  }, [selectedMonthKey, availableMonths]);

  // Calcular rango de fechas operativo (5:00 a.m. - 4:59 a.m.)
  const dateFilter = useMemo(() => {
    const now = new Date();
    const todayStr = getOperationalDateString(now);
    const [y, m, d] = todayStr.split('-').map(Number);
    const opNow = new Date(y, m - 1, d, 12, 0, 0);

    if (dateRangePreset === 'hoy') {
      return { start: todayStr, end: todayStr, label: 'Hoy (Día Operativo)' };
    }
    if (dateRangePreset === 'semana') {
      const dateObj = new Date(opNow);
      const day = dateObj.getDay();
      const diff = dateObj.getDate() - day + (day === 0 ? -6 : 1);
      dateObj.setDate(diff);
      const start = getOperationalDateString(dateObj);
      return { start, end: todayStr, label: 'Esta Semana' };
    }
    if (dateRangePreset === 'quincena') {
      const dateObj = new Date(opNow);
      dateObj.setDate(dateObj.getDate() - 14);
      const start = getOperationalDateString(dateObj);
      return { start, end: todayStr, label: 'Última Quincena (15 días)' };
    }
    if (dateRangePreset === 'mes') {
      const start = `${selectedMonthKey}-01`;
      const [selY, selM] = selectedMonthKey.split('-').map(Number);
      const lastDay = new Date(selY, selM, 0).getDate();
      const end = `${selectedMonthKey}-${String(lastDay).padStart(2, '0')}`;
      return { start, end, label: `Mes ${selectedMonthLabel}` };
    }
    return { start: '2020-01-01', end: '2030-12-31', label: 'Todo el Historial' };
  }, [dateRangePreset, selectedMonthKey, selectedMonthLabel]);

  const restaurantMap = useMemo(() => {
    return new Map(restaurants.map(r => [r.id, r.nombre]));
  }, [restaurants]);

  // Turnos filtrados por negocio, sede, empleado, puesto y fecha operativa
  const filteredShifts = useMemo(() => {
    return shifts.filter(s => {
      if (s.businessId && s.businessId !== businessId) return false;
      if (selectedBranchId !== 'all' && s.restaurantId !== selectedBranchId) return false;
      if (selectedEmployeeId !== 'all' && s.employeeId !== selectedEmployeeId) return false;
      if (selectedRole !== 'all') {
        const emp = employees.find(e => e.id === s.employeeId);
        const role = s.employeePuesto || emp?.puesto;
        if (role !== selectedRole) return false;
      }
      const shiftDate = getOperationalDateString(s.horaInicio || s.fecha);
      if (shiftDate < dateFilter.start || shiftDate > dateFilter.end) return false;
      return true;
    });
  }, [shifts, businessId, selectedBranchId, selectedEmployeeId, selectedRole, dateFilter, employees]);

  // PLANILLA UNIFICADA: Días trabajados por empleado y cálculo mejorado de sueldo (SIN valores por hora)
  const unifiedPayrollRows: UnifiedEmployeePayrollItem[] = useMemo(() => {
    const applicableEmployees = employees.filter(e => {
      if (selectedBranchId !== 'all' && e.restaurantId !== selectedBranchId) return false;
      if (selectedEmployeeId !== 'all' && e.id !== selectedEmployeeId) return false;
      if (selectedRole !== 'all' && e.puesto !== selectedRole) return false;

      const isMonthly = e.modalidadPago === 'mes' || e.tipoSueldo === 'fijo';
      if (modalityFilter === 'mes' && !isMonthly) return false;
      if (modalityFilter === 'por_dia' && isMonthly) return false;
      return true;
    });

    return applicableEmployees.map(emp => {
      const empShifts = filteredShifts.filter(s => s.employeeId === emp.id);
      const restName = restaurantMap.get(emp.restaurantId) || 'Sucursal Principal';

      // Agrupar turnos por Día Operativo (5:00 a.m. - 4:59 a.m.) para contar días reales de trabajo
      const dayMap = new Map<string, Shift[]>();
      empShifts.forEach(sh => {
        const opDate = getOperationalDateString(sh.horaInicio || sh.fecha);
        if (!dayMap.has(opDate)) {
          dayMap.set(opDate, []);
        }
        dayMap.get(opDate)!.push(sh);
      });

      const diasDetalle: EmployeeDayWorkedDetail[] = [];
      let totalVentasEmp = 0;

      dayMap.forEach((shiftsInDay, opDate) => {
        const [y, m, d] = opDate.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d, 12, 0, 0);
        const fechaLabel = dateObj.toLocaleDateString('es-ES', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });

        let ventasDia = 0;
        let pedidosDia = 0;
        const reportes: string[] = [];

        shiftsInDay.forEach(s => {
          ventasDia += Number(s.ventasGeneradas || 0);
          pedidosDia += Number(s.pedidosTomados || 0);
          if (s.reporteLabores && s.reporteLabores.trim()) {
            reportes.push(s.reporteLabores.trim());
          }
        });

        totalVentasEmp += ventasDia;
        const pagadoDia = shiftsInDay.every(s => Boolean(s.pagado || s.sueldoPagado));

        diasDetalle.push({
          fechaOperativa: opDate,
          fechaLabel,
          turnos: shiftsInDay,
          ventasDia: Math.round(ventasDia * 100) / 100,
          pedidosDia,
          pagadoDia,
          reportes
        });
      });

      diasDetalle.sort((a, b) => b.fechaOperativa.localeCompare(a.fechaOperativa));

      // Gastos / Abonos de sueldo registrados en el periodo para este empleado
      const expForEmp = salaryExpenses.filter(e => {
        if (e.employeeId !== emp.id) return false;
        const expDate = getOperationalDateString(e.fecha || e.creadoEn);
        return expDate >= dateFilter.start && expDate <= dateFilter.end;
      });

      const totalAbonado = Math.round(expForEmp.reduce((sum, e) => sum + (Number(e.monto) || 0), 0) * 100) / 100;

      // Determinar modalidad sin valores por hora: 'mes' (Sueldo Mensual) o 'por_dia' (Sueldo por Día)
      const isMonthlyFixed = emp.modalidadPago === 'mes' || emp.tipoSueldo === 'fijo';
      const modalidadPago: 'por_dia' | 'mes' = isMonthlyFixed ? 'mes' : 'por_dia';

      // Calcular Valor Diario y Sueldo Base limpios
      const sueldoMensual = (emp.sueldoMensual && emp.sueldoMensual > 0)
        ? emp.sueldoMensual
        : (emp.tarifaDiaria && emp.tarifaDiaria > 0)
          ? Math.round(emp.tarifaDiaria * 30 * 100) / 100
          : (emp.tarifaHora && emp.tarifaHora > 0)
            ? Math.round(emp.tarifaHora * 8 * 30 * 100) / 100
            : 1200;

      const valorDiario = isMonthlyFixed
        ? Math.round((sueldoMensual / 30) * 100) / 100
        : (emp.tarifaDiaria && emp.tarifaDiaria > 0)
          ? emp.tarifaDiaria
          : (emp.tarifaHora && emp.tarifaHora > 0)
            ? Math.round(emp.tarifaHora * 8 * 100) / 100
            : 50;

      const sueldoBase = isMonthlyFixed ? sueldoMensual : valorDiario;
      const modalidadLabel = isMonthlyFixed
        ? `Mensual ($${sueldoMensual.toFixed(2)}/mes)`
        : `Por Día ($${valorDiario.toFixed(2)}/día)`;

      // Días trabajados efectivos
      const recordedDaysFromExpenses = expForEmp.reduce((sum, e) => sum + (Number(e.diasTrabajados) || 0), 0);
      const diasTrabajados = diasDetalle.length > 0 ? diasDetalle.length : recordedDaysFromExpenses;

      // Cálculo de Sueldo Correspondiente según modalidad y días trabajados
      let sueldoCalculado = 0;
      const isPaidFixedMonth = isMonthlyFixed && (emp.mesesPagados || []).includes(selectedMonthKey);

      if (isMonthlyFixed) {
        // En modalidad mensual: si el filtro es mensual o todos, corresponde el sueldo mensual base;
        // si el filtro es hoy/semana/quincena, muestra el proporcional por días trabajados (o base si no tiene turnos pero es mes)
        if (dateRangePreset === 'mes' || dateRangePreset === 'todos') {
          sueldoCalculado = sueldoMensual;
        } else {
          sueldoCalculado = diasTrabajados > 0
            ? Math.round(diasTrabajados * valorDiario * 100) / 100
            : sueldoMensual;
        }
      } else {
        // En modalidad por día: Días Trabajados × Valor Diario
        if (diasTrabajados > 0) {
          sueldoCalculado = Math.round(diasTrabajados * valorDiario * 100) / 100;
        } else if (totalAbonado > 0) {
          sueldoCalculado = totalAbonado;
        }
      }

      // Si todos los turnos del empleado en el periodo ya están marcados como pagados en shifts
      const paidShiftsAmount = empShifts
        .filter(s => s.pagado || s.sueldoPagado)
        .reduce((sum, s) => sum + (Number(s.montoPagadoSueldo ?? s.sueldoTotal) || 0), 0);

      const effectiveAbonado = Math.max(totalAbonado, Math.round(paidShiftsAmount * 100) / 100);
      const totalPagar = isPaidFixedMonth && (dateRangePreset === 'mes')
        ? 0
        : Math.max(0, Math.round((sueldoCalculado - effectiveAbonado) * 100) / 100);

      let estadoPago = 'Sin actividad';
      if (isPaidFixedMonth && dateRangePreset === 'mes') {
        estadoPago = 'Pagado';
      } else if (sueldoCalculado > 0 || diasTrabajados > 0) {
        if (totalPagar <= 0 && (effectiveAbonado > 0 || isPaidFixedMonth)) {
          estadoPago = 'Pagado';
        } else if (effectiveAbonado > 0 && totalPagar > 0) {
          estadoPago = 'Abonado';
        } else {
          estadoPago = 'Pendiente';
        }
      } else if (effectiveAbonado > 0) {
        estadoPago = 'Pagado';
      }

      return {
        empleadoId: emp.id,
        nombre: emp.nombre,
        puesto: emp.puesto,
        sucursal: restName,
        avatarUrl: emp.avatarUrl,
        modalidadPago,
        modalidadLabel,
        isMonthlyFixed,
        sueldoBase,
        sueldoMensual,
        valorDiario,
        diasTrabajados,
        sueldoCalculado,
        totalAbonado: effectiveAbonado,
        totalPagar,
        turnosContados: empShifts.length,
        ventasGeneradas: Math.round(totalVentasEmp * 100) / 100,
        estadoPago,
        diasDetalle,
        isPaidFixedMonth,
        employeeObj: emp
      };
    }).sort((a, b) => b.diasTrabajados - a.diasTrabajados || b.sueldoCalculado - a.sueldoCalculado);
  }, [
    employees,
    filteredShifts,
    salaryExpenses,
    restaurantMap,
    selectedBranchId,
    selectedEmployeeId,
    selectedRole,
    modalityFilter,
    dateFilter,
    dateRangePreset,
    selectedMonthKey
  ]);

  // Totales globales de la planilla
  const kpiTotals = useMemo(() => {
    const totalDiasHombre = unifiedPayrollRows.reduce((s, r) => s + r.diasTrabajados, 0);
    const empleadosActivos = unifiedPayrollRows.filter(r => r.diasTrabajados > 0 || r.sueldoCalculado > 0).length;
    const totalSueldoGenerado = unifiedPayrollRows.reduce((s, r) => s + r.sueldoCalculado, 0);
    const totalAbonado = unifiedPayrollRows.reduce((s, r) => s + r.totalAbonado, 0);
    const totalPendiente = unifiedPayrollRows.reduce((s, r) => s + r.totalPagar, 0);
    return {
      totalDiasHombre,
      empleadosActivos,
      totalSueldoGenerado: Math.round(totalSueldoGenerado * 100) / 100,
      totalAbonado: Math.round(totalAbonado * 100) / 100,
      totalPendiente: Math.round(totalPendiente * 100) / 100
    };
  }, [unifiedPayrollRows]);

  // Datos para gráfico comparativo de Días Trabajados y Sueldo por Empleado
  const employeeChartData = useMemo(() => {
    return unifiedPayrollRows
      .filter(r => r.diasTrabajados > 0 || r.sueldoCalculado > 0)
      .slice(0, 10)
      .map(r => ({
        nombre: r.nombre.length > 14 ? r.nombre.slice(0, 12) + '…' : r.nombre,
        fullName: r.nombre,
        diasTrabajados: r.diasTrabajados,
        sueldo: r.sueldoCalculado,
        pagado: r.totalAbonado,
        pendiente: r.totalPagar
      }));
  }, [unifiedPayrollRows]);

  // Exportar a Excel
  const handleExportExcel = () => {
    sounds.playCashRegister();
    const branchName = selectedBranchId === 'all'
      ? 'Todas las sucursales'
      : (restaurantMap.get(selectedBranchId) || 'Sucursal');

    exportPayrollToExcel({
      businessName,
      periodLabel: dateFilter.label,
      selectedBranchName: branchName,
      rows: unifiedPayrollRows
    });
  };

  // Exportar a CSV
  const handleExportCSV = () => {
    sounds.playKeypadClick();
    const headers = [
      'Empleado',
      'Puesto',
      'Sucursal',
      'Modalidad',
      'Sueldo Base ($)',
      'Valor Diario ($)',
      'Dias Trabajados',
      'Sueldo Correspondiente ($)',
      'Abonos Registrados ($)',
      'Saldo Neto a Pagar ($)',
      'Estado'
    ];
    const rows = unifiedPayrollRows.map(r => [
      `"${r.nombre.replace(/"/g, '""')}"`,
      `"${r.puesto}"`,
      `"${r.sucursal}"`,
      `"${r.modalidadLabel}"`,
      r.sueldoBase.toFixed(2),
      r.valorDiario.toFixed(2),
      r.diasTrabajados,
      r.sueldoCalculado.toFixed(2),
      r.totalAbonado.toFixed(2),
      r.totalPagar.toFixed(2),
      `"${r.estadoPago}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Planilla_Dias_y_Sueldos_${dateFilter.label.replace(/[^a-zA-Z0-9]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Abrir modal de pago masivo
  const handleOpenBatchSalaryModal = () => {
    sounds.playKeypadClick();
    const initialSelection: Record<string, boolean> = {};
    unifiedPayrollRows.forEach(row => {
      if (row.totalPagar > 0 && row.estadoPago !== 'Pagado') {
        initialSelection[row.empleadoId] = true;
      }
    });
    setSelectedForPayment(initialSelection);
    setShowPayrollModal(true);
  };

  // Confirmar liquidación masiva de sueldos
  const handleConfirmSalaryBatch = async () => {
    setIsProcessingSalary(true);
    sounds.playCashRegister();

    try {
      const pendingShiftsToPay = filteredShifts.filter(s => {
        if (s.pagado || s.sueldoPagado) return false;
        return selectedForPayment[s.employeeId];
      });

      const rateMap: Record<string, number> = {};
      const empDataMap: Record<string, { modalidad?: string; tarifaDiaria?: number; sueldoMensual?: number }> = {};

      unifiedPayrollRows.forEach(r => {
        rateMap[r.empleadoId] = r.valorDiario;
        empDataMap[r.empleadoId] = {
          modalidad: r.modalidadPago,
          tarifaDiaria: r.valorDiario,
          sueldoMensual: r.sueldoMensual
        };
      });

      const targetRestId = selectedBranchId === 'all'
        ? (restaurants[0]?.id || 'central')
        : selectedBranchId;

      const abonosMap: Record<string, number> = {};
      unifiedPayrollRows.forEach(r => {
        abonosMap[r.empleadoId] = r.totalAbonado;
      });

      if (pendingShiftsToPay.length > 0) {
        await paySalaryBatch(
          businessId,
          targetRestId,
          pendingShiftsToPay,
          rateMap,
          dateFilter.label,
          currentUserName,
          1,
          empDataMap,
          abonosMap
        );
      }

      // También liquidar empleados seleccionados que no tenían turnos pendientes pero sí saldo a pagar (ej. sueldo mensual fijo)
      const employeesWithShiftsHandled = new Set(pendingShiftsToPay.map(s => s.employeeId));
      const remainingSelectedRows = unifiedPayrollRows.filter(
        r => selectedForPayment[r.empleadoId] && r.totalPagar > 0 && !employeesWithShiftsHandled.has(r.empleadoId)
      );

      const todayStr = new Date().toISOString().split('T')[0];
      for (const row of remainingSelectedRows) {
        if (row.isMonthlyFixed && dateRangePreset === 'mes') {
          await payFixedSalaryExpense({
            employee: row.employeeObj,
            monthKey: selectedMonthKey,
            monthLabel: selectedMonthLabel,
            amount: row.sueldoCalculado,
            abonoPrevio: row.totalAbonado,
            userDisplayName: currentUserName,
            paymentMethod: 'transferencia',
            notes: `Liquidación de planilla mensual (${selectedMonthLabel} • ${row.diasTrabajados} días trabajados)`
          });
        } else {
          await createExpense({
            businessId,
            restaurantId: row.employeeObj.restaurantId || targetRestId,
            tipo: 'sueldo',
            monto: row.totalPagar,
            descripcion: `Liquidación de sueldo ${dateFilter.label} - ${row.nombre} (${row.diasTrabajados} días trabajados • ${row.modalidadLabel})`,
            employeeId: row.empleadoId,
            employeeName: row.nombre,
            diasTrabajados: row.diasTrabajados,
            modalidadPago: row.modalidadPago,
            tarifaDiaria: row.valorDiario,
            fecha: todayStr,
            appId: 'gastro_smart',
            creadoEn: new Date().toISOString()
          });
        }
      }

      setSalarySuccessToast(`¡Planilla liquidada exitosamente! Los pagos de sueldo se registraron en Gastos Operativos (P&L).`);
      setShowPayrollModal(false);
      setTimeout(() => setSalarySuccessToast(null), 5000);
    } catch (err: any) {
      console.error('Error procesando planilla:', err);
      alert('Error al liquidar planilla: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsProcessingSalary(false);
    }
  };

  // Liquidar individualmente a un empleado desde su fila
  const handleConfirmSingleEmployeePay = async () => {
    if (!payingSingleRow) return;
    setIsProcessingSinglePay(true);
    setSinglePayError(null);

    try {
      const targetRestId = payingSingleRow.employeeObj.restaurantId || restaurants[0]?.id || 'central';

      if (payingSingleRow.isMonthlyFixed && dateRangePreset === 'mes') {
        const res = await payFixedSalaryExpense({
          employee: payingSingleRow.employeeObj,
          monthKey: selectedMonthKey,
          monthLabel: selectedMonthLabel,
          amount: payingSingleRow.sueldoCalculado,
          abonoPrevio: payingSingleRow.totalAbonado,
          userDisplayName: currentUserName,
          paymentMethod: singlePayMethod,
          notes: singlePayNotes.trim() || undefined
        });

        if (!res.success) {
          setSinglePayError(res.error || 'No se pudo procesar el pago');
          setIsProcessingSinglePay(false);
          return;
        }
      } else {
        // Liquidar sus turnos pendientes del periodo por días trabajados
        const empPendingShifts = filteredShifts.filter(
          s => s.employeeId === payingSingleRow.empleadoId && !s.pagado && !s.sueldoPagado
        );

        if (empPendingShifts.length > 0) {
          await paySalaryBatch(
            businessId,
            targetRestId,
            empPendingShifts,
            { [payingSingleRow.empleadoId]: payingSingleRow.valorDiario },
            dateFilter.label,
            currentUserName,
            1,
            {
              [payingSingleRow.empleadoId]: {
                modalidad: payingSingleRow.modalidadPago,
                tarifaDiaria: payingSingleRow.valorDiario,
                sueldoMensual: payingSingleRow.sueldoMensual
              }
            },
            { [payingSingleRow.empleadoId]: payingSingleRow.totalAbonado }
          );
        } else if (payingSingleRow.totalPagar > 0) {
          const todayStr = new Date().toISOString().split('T')[0];
          await createExpense({
            businessId,
            restaurantId: targetRestId,
            tipo: 'sueldo',
            monto: payingSingleRow.totalPagar,
            descripcion: `Liquidación de sueldo (${dateFilter.label}) - ${payingSingleRow.nombre} (${payingSingleRow.diasTrabajados} días trabajados a $${payingSingleRow.valorDiario.toFixed(2)}/día)`,
            employeeId: payingSingleRow.empleadoId,
            employeeName: payingSingleRow.nombre,
            diasTrabajados: payingSingleRow.diasTrabajados,
            modalidadPago: payingSingleRow.modalidadPago,
            tarifaDiaria: payingSingleRow.valorDiario,
            metodoPago: singlePayMethod,
            notas: singlePayNotes.trim() || undefined,
            fecha: todayStr,
            appId: 'gastro_smart',
            creadoEn: new Date().toISOString()
          });
        }
      }

      sounds.playCashRegister();
      setSalarySuccessToast(`¡Sueldo de ${payingSingleRow.nombre} ($${payingSingleRow.totalPagar.toFixed(2)}) liquidado y registrado en Gastos!`);
      setPayingSingleRow(null);
      setSinglePayNotes('');
      setTimeout(() => setSalarySuccessToast(null), 5000);
    } catch (err: any) {
      setSinglePayError(err.message || 'Error al registrar el pago');
    } finally {
      setIsProcessingSinglePay(false);
    }
  };

  // Liquidar un día/turno individual desde el desplegable
  const handlePaySingleShift = async (shift: Shift, emp: Employee) => {
    setPayingShiftId(shift.id);
    try {
      const res = await payShiftSalary(shift, emp);
      sounds.playCashRegister();
      setSalarySuccessToast(`Jornada pagada a ${emp.nombre}: $${res.amount.toFixed(2)} registrados en Gastos.`);
      setTimeout(() => setSalarySuccessToast(null), 4500);
    } catch (err: any) {
      alert(err.message || 'No se pudo pagar la jornada');
    } finally {
      setPayingShiftId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Toast de Confirmación */}
      {salarySuccessToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{salarySuccessToast}</span>
          </div>
          <button onClick={() => setSalarySuccessToast(null)} className="text-emerald-700 hover:text-emerald-950 font-black">✕</button>
        </div>
      )}

      {/* 1. CABECERA Y CONTROLES UNIFICADOS DE ASISTENCIA & PLANILLA */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-neutral-200 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black shrink-0">
              <CalendarCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-neutral-900 tracking-tight">
                Control de Asistencia, Días Trabajados y Planilla de Sueldos
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Cálculo automático por <strong>días trabajados</strong> (Ciclo Operativo 5:00 a.m. – 4:59 a.m.) y <strong>sueldo diario o mensual</strong>, con descuento de abonos y liquidación directa a Gastos (P&amp;L).
              </p>
            </div>
          </div>

          {/* Botones de Acción Principal */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-neutral-600" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Exportar Excel</span>
            </button>

            <button
              type="button"
              onClick={handleOpenBatchSalaryModal}
              disabled={unifiedPayrollRows.length === 0}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-xs disabled:opacity-40 cursor-pointer"
            >
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span>Liquidar Planilla ({unifiedPayrollRows.filter(r => r.totalPagar > 0).length})</span>
            </button>
          </div>
        </div>

        {/* Barra Unificada de Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-4 border-t border-neutral-100">
          {/* Periodo */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
              Periodo de Cálculo
            </label>
            <select
              value={dateRangePreset}
              onChange={(e) => setDateRangePreset(e.target.value as any)}
              className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 bg-neutral-50 focus:bg-white"
            >
              <option value="hoy">Hoy (Día Operativo)</option>
              <option value="semana">Esta Semana</option>
              <option value="quincena">Última Quincena (15 días)</option>
              <option value="mes">Mes Específico</option>
              <option value="todos">Todo el Historial</option>
            </select>
          </div>

          {/* Mes Operativo (activo cuando se elige 'mes') */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
              Mes de Planilla
            </label>
            <select
              value={selectedMonthKey}
              onChange={(e) => {
                setSelectedMonthKey(e.target.value);
                setDateRangePreset('mes');
              }}
              className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 bg-neutral-50 focus:bg-white"
            >
              {availableMonths.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Sucursal */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
              Sucursal / Sede
            </label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 bg-neutral-50 focus:bg-white"
            >
              <option value="all">Todas las Sucursales</option>
              {restaurants.map(r => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
          </div>

          {/* Modalidad de Sueldo */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
              Modalidad de Sueldo
            </label>
            <select
              value={modalityFilter}
              onChange={(e) => setModalityFilter(e.target.value as any)}
              className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 bg-neutral-50 focus:bg-white"
            >
              <option value="all">Todas (Diario y Mensual)</option>
              <option value="por_dia">Pago por Día ($/día)</option>
              <option value="mes">Sueldo Fijo Mensual ($/mes)</option>
            </select>
          </div>

          {/* Puesto */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
              Puesto / Rol
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 bg-neutral-50 focus:bg-white"
            >
              <option value="all">Todos los Puestos</option>
              <option value="admin">Administrador</option>
              <option value="caja">Cajero</option>
              <option value="mostrador">Mostrador</option>
              <option value="mesero">Mesero</option>
              <option value="cocina">Cocina</option>
              <option value="ayudante_cocina">Ayudante Cocina</option>
              <option value="limpieza">Limpieza</option>
            </select>
          </div>

          {/* Empleado */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
              Empleado
            </label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 bg-neutral-50 focus:bg-white"
            >
              <option value="all">Todos ({employees.length})</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.nombre} ({emp.puesto})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. TARJETAS KPI RESUMEN DE ASISTENCIA Y SUELDOS (Sin repeticiones) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-500 uppercase">
            <span>Días Trabajados (Total)</span>
            <CalendarCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-neutral-900 mt-1.5 font-mono">
            {kpiTotals.totalDiasHombre} <span className="text-xs font-bold text-neutral-500">días</span>
          </div>
          <span className="text-[11px] text-neutral-400 mt-1 block">
            {kpiTotals.empleadosActivos} de {unifiedPayrollRows.length} empleados activos en {dateFilter.label}
          </span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-500 uppercase">
            <span>Sueldo Total Correspondiente</span>
            <Wallet className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-indigo-700 mt-1.5 font-mono">
            ${kpiTotals.totalSueldoGenerado.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-neutral-400 mt-1 block">
            Calculado según días laborados y sueldo asignado
          </span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-500 uppercase">
            <span>Abonos y Sueldos Pagados</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600 mt-1.5 font-mono">
            ${kpiTotals.totalAbonado.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-emerald-600/80 mt-1 block">
            Registrados en Gastos Operativos (P&amp;L)
          </span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-500 uppercase">
            <span>Saldo Neto por Pagar</span>
            <DollarSign className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-600 mt-1.5 font-mono">
            ${kpiTotals.totalPendiente.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-amber-700/80 mt-1 block">
            Pendiente de liquidación en el periodo
          </span>
        </div>
      </div>

      {/* 3. GRÁFICO VISUAL: DÍAS TRABAJADOS Y SUELDO POR EMPLEADO */}
      {employeeChartData.length > 0 && (
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-neutral-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-neutral-100">
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-neutral-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                <span>Días de Trabajo y Sueldo por Empleado ({dateFilter.label})</span>
              </h3>
              <p className="text-xs text-neutral-500">
                Comparativa de días laborados, monto ya abonado/pagado y saldo pendiente por empleado
              </p>
            </div>
            <div className="text-xs text-neutral-500 font-medium">
              Ciclo Operativo: 5:00 a.m. – 4:59 a.m.
            </div>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={employeeChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="nombre" tick={{ fontSize: 11, fontWeight: 600, fill: '#334155' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `$${v}`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#059669' }} tickFormatter={(v) => `${v}d`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    color: '#fff',
                    borderRadius: '12px',
                    border: 'none',
                    fontSize: '12px'
                  }}
                  formatter={(val: any, name: any) => {
                    if (name === 'Días Trabajados') return [`${val} días`, name];
                    return [`$${Number(val).toFixed(2)}`, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                <Bar yAxisId="right" dataKey="diasTrabajados" name="Días Trabajados" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar yAxisId="left" dataKey="sueldo" name="Sueldo Correspondiente ($)" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar yAxisId="left" dataKey="pagado" name="Abonado / Pagado ($)" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 4. TABLA CONSOLIDADA ÚNICA: DÍAS DE TRABAJO POR EMPLEADO Y SUELDO */}
      <div className="bg-white rounded-3xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-black text-sm sm:text-base text-neutral-900">
              Planilla Consolidada: Días de Trabajo por Empleado y Sueldo
            </h3>
            <p className="text-xs text-neutral-500">
              Haz clic en <strong>&quot;Ver Días&quot;</strong> en cualquier empleado para inspeccionar las fechas exactas trabajadas, horarios de entrada/salida y liquidar jornadas individuales.
            </p>
          </div>
          <span className="text-xs font-bold text-neutral-600 bg-neutral-100 px-3 py-1 rounded-full self-start sm:self-auto">
            {unifiedPayrollRows.length} empleados en planilla
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-bold uppercase text-[10px] tracking-wider">
                <th className="p-3.5">Empleado</th>
                <th className="p-3.5">Puesto / Sede</th>
                <th className="p-3.5">Modalidad &amp; Sueldo Base</th>
                <th className="p-3.5 text-center">Días de Trabajo</th>
                <th className="p-3.5 text-right text-indigo-900">Sueldo Correspondiente ($)</th>
                <th className="p-3.5 text-right text-emerald-700">Abonos / Pagado ($)</th>
                <th className="p-3.5 text-right text-amber-700">Saldo a Pagar ($)</th>
                <th className="p-3.5 text-center">Estado</th>
                <th className="p-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {unifiedPayrollRows.map(row => {
                const isExpanded = expandedEmployeeId === row.empleadoId;

                return (
                  <React.Fragment key={row.empleadoId}>
                    <tr className={`hover:bg-neutral-50/70 transition ${isExpanded ? 'bg-indigo-50/20' : ''}`}>
                      {/* Empleado */}
                      <td className="p-3.5 font-bold text-neutral-900">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs shrink-0">
                            {row.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="block text-neutral-900 font-extrabold text-xs">{row.nombre}</span>
                            <span className="text-[10px] text-neutral-400 font-mono">ID: {row.empleadoId.slice(0, 6)}</span>
                          </div>
                        </div>
                      </td>

                      {/* Puesto / Sede */}
                      <td className="p-3.5">
                        <span className="font-bold uppercase text-[10px] text-neutral-700 block">
                          {row.puesto === 'ayudante_cocina' ? 'Ayudante Cocina' : row.puesto}
                        </span>
                        <span className="text-[11px] text-neutral-400">{row.sucursal}</span>
                      </td>

                      {/* Modalidad & Sueldo Base (Sin valores por hora) */}
                      <td className="p-3.5">
                        <div className="font-bold text-neutral-800">
                          {row.isMonthlyFixed ? (
                            <span className="text-indigo-700">
                              Mensual: <strong className="font-mono">${row.sueldoMensual.toFixed(2)}/mes</strong>
                            </span>
                          ) : (
                            <span className="text-emerald-700">
                              Diario: <strong className="font-mono">${row.valorDiario.toFixed(2)}/día</strong>
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-neutral-400 font-mono block">
                          Equiv. diario: ${row.valorDiario.toFixed(2)} / día
                        </span>
                      </td>

                      {/* Días de Trabajo */}
                      <td className="p-3.5 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black font-mono ${
                            row.diasTrabajados > 0
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-neutral-100 text-neutral-400'
                          }`}>
                            <CalendarCheck className="w-3.5 h-3.5 text-emerald-600" />
                            {row.diasTrabajados} {row.diasTrabajados === 1 ? 'día' : 'días'}
                          </span>
                          {row.turnosContados > 0 && (
                            <span className="text-[10px] text-neutral-400 mt-0.5">
                              {row.turnosContados} {row.turnosContados === 1 ? 'jornada' : 'jornadas'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Sueldo Correspondiente */}
                      <td className="p-3.5 text-right font-mono font-black text-sm text-indigo-950">
                        ${row.sueldoCalculado.toFixed(2)}
                        <span className="block text-[10px] font-normal text-neutral-400">
                          {row.isMonthlyFixed && (dateRangePreset === 'mes' || dateRangePreset === 'todos')
                            ? 'Sueldo fijo mensual'
                            : `${row.diasTrabajados}d × $${row.valorDiario.toFixed(2)}`}
                        </span>
                      </td>

                      {/* Abonos / Pagado */}
                      <td className="p-3.5 text-right font-mono font-bold text-sm text-emerald-600">
                        {row.totalAbonado > 0 ? `$${row.totalAbonado.toFixed(2)}` : '—'}
                      </td>

                      {/* Saldo Neto a Pagar */}
                      <td className="p-3.5 text-right font-mono font-black text-sm text-amber-600 bg-amber-50/30">
                        ${row.totalPagar.toFixed(2)}
                      </td>

                      {/* Estado */}
                      <td className="p-3.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                          row.estadoPago === 'Pagado'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : row.estadoPago === 'Abonado'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : row.estadoPago === 'Pendiente'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-neutral-100 text-neutral-500 border-neutral-200'
                        }`}>
                          {row.estadoPago === 'Pagado' && <Lock className="w-2.5 h-2.5" />}
                          <span>{row.estadoPago}</span>
                        </span>
                      </td>

                      {/* Acciones: Liquidar y Ver Días */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {row.totalPagar > 0 && row.estadoPago !== 'Pagado' && (
                            <button
                              type="button"
                              onClick={() => {
                                sounds.playKeypadClick();
                                setPayingSingleRow(row);
                                setSinglePayError(null);
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                              title="Liquidar y registrar pago de sueldo en Gastos"
                            >
                              <DollarSign className="w-3 h-3 text-amber-300" />
                              <span>Pagar</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              sounds.playKeypadClick();
                              setExpandedEmployeeId(isExpanded ? null : row.empleadoId);
                            }}
                            disabled={row.diasDetalle.length === 0}
                            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                              row.diasDetalle.length === 0
                                ? 'opacity-40 cursor-not-allowed bg-neutral-100 text-neutral-400'
                                : isExpanded
                                  ? 'bg-neutral-900 text-white'
                                  : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                            }`}
                          >
                            <span>{isExpanded ? 'Ocultar' : 'Ver Días'}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Desglose desplegable de los Días Trabajados y Turnos del Empleado */}
                    {isExpanded && (
                      <tr className="bg-neutral-50/80">
                        <td colSpan={9} className="p-4 sm:p-5 border-b border-neutral-200">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="text-xs font-black uppercase tracking-wider text-neutral-800 flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-emerald-600" />
                                <span>
                                  Detalle de Días Trabajados de {row.nombre} ({row.diasDetalle.length} {row.diasDetalle.length === 1 ? 'día laborado' : 'días laborados'})
                                </span>
                              </h4>
                              <div className="text-xs text-neutral-500 font-mono">
                                Valor diario: <strong>${row.valorDiario.toFixed(2)}/día</strong> • Ventas generadas en turnos: <strong className="text-emerald-700">${row.ventasGeneradas.toFixed(2)}</strong>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {row.diasDetalle.map((dia, idx) => (
                                <div key={dia.fechaOperativa} className="bg-white rounded-2xl border border-neutral-200 p-3.5 space-y-2.5 shadow-2xs">
                                  <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                                    <div className="flex items-center gap-2">
                                      <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-black flex items-center justify-center">
                                        D{row.diasDetalle.length - idx}
                                      </span>
                                      <div>
                                        <strong className="text-xs font-bold text-neutral-900 capitalize block">
                                          {dia.fechaLabel}
                                        </strong>
                                        <span className="text-[10px] text-neutral-400 font-mono">
                                          Día Operativo: {dia.fechaOperativa}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-xs font-black text-indigo-700 font-mono block">
                                        ${row.valorDiario.toFixed(2)}
                                      </span>
                                      <span className="text-[10px] text-neutral-400">1 día trabajado</span>
                                    </div>
                                  </div>

                                  {/* Jornadas dentro de este día operativo */}
                                  <div className="space-y-1.5 text-[11px]">
                                    {dia.turnos.map(t => {
                                      const hInicio = t.horaInicio ? new Date(t.horaInicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                                      const hFin = t.horaFin ? new Date(t.horaFin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'En curso';
                                      const isShiftPaid = Boolean(t.pagado || t.sueldoPagado);
                                      const isShiftClosed = t.estado === 'cerrado';

                                      return (
                                        <div key={t.id} className="p-2 bg-neutral-50 rounded-xl flex items-center justify-between border border-neutral-100 gap-2">
                                          <div>
                                            <span className="font-bold text-neutral-800 font-mono">
                                              Entrada: {hInicio} → Salida: {hFin}
                                            </span>
                                            {(t.ventasGeneradas || 0) > 0 && (
                                              <span className="block text-[10px] text-emerald-700 font-semibold">
                                                Ventas atendidas: ${(t.ventasGeneradas || 0).toFixed(2)} ({t.pedidosTomados || 0} ped.)
                                              </span>
                                            )}
                                            {t.reporteLabores && (
                                              <span className="block text-[10px] text-neutral-500 italic truncate max-w-[210px]" title={t.reporteLabores}>
                                                &ldquo;{t.reporteLabores}&rdquo;
                                              </span>
                                            )}
                                          </div>

                                          <div className="shrink-0">
                                            {isShiftPaid || row.estadoPago === 'Pagado' ? (
                                              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                                Pagado
                                              </span>
                                            ) : !row.isMonthlyFixed && isShiftClosed ? (
                                              <button
                                                type="button"
                                                disabled={payingShiftId === t.id}
                                                onClick={() => handlePaySingleShift(t, row.employeeObj)}
                                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] cursor-pointer disabled:opacity-50"
                                              >
                                                {payingShiftId === t.id ? '...' : `Pagar $${row.valorDiario.toFixed(0)}`}
                                              </button>
                                            ) : (
                                              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                                                {isShiftClosed ? 'Pendiente' : 'En turno'}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {unifiedPayrollRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-neutral-400 font-medium">
                    No se encontraron empleados ni registros de asistencia con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Liquidación Individual de Empleado */}
      {payingSingleRow && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-neutral-100 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900">
                    Liquidar Sueldo de {payingSingleRow.nombre}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Periodo: {dateFilter.label} • {payingSingleRow.diasTrabajados} {payingSingleRow.diasTrabajados === 1 ? 'día trabajado' : 'días trabajados'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPayingSingleRow(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {singlePayError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{singlePayError}</span>
              </div>
            )}

            <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 font-semibold">Modalidad de Sueldo:</span>
                <span className="font-bold text-indigo-950">{payingSingleRow.modalidadLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 font-semibold">Días Trabajados en el Periodo:</span>
                <span className="font-mono font-bold text-emerald-800">{payingSingleRow.diasTrabajados} días</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-600 font-semibold">Sueldo Correspondiente:</span>
                <span className="font-mono font-bold text-neutral-900">${payingSingleRow.sueldoCalculado.toFixed(2)}</span>
              </div>
              {payingSingleRow.totalAbonado > 0 && (
                <div className="flex items-center justify-between text-emerald-700 font-bold">
                  <span>Abonos / Adelantos Previos:</span>
                  <span className="font-mono">-${payingSingleRow.totalAbonado.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-indigo-200 text-sm font-black">
                <span className="text-indigo-950">Saldo Neto a Pagar:</span>
                <span className="font-mono text-indigo-700 text-lg">${payingSingleRow.totalPagar.toFixed(2)}</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                Método de Pago:
              </label>
              <select
                value={singlePayMethod}
                onChange={(e) => setSinglePayMethod(e.target.value as PaymentMethod)}
                className="w-full h-10 px-3 rounded-xl border border-neutral-300 font-bold text-xs text-neutral-800"
              >
                <option value="transferencia">🏦 Transferencia Bancaria</option>
                <option value="efectivo">💵 Efectivo (Caja)</option>
                <option value="yape">📱 Yape / Plin / Pago Móvil</option>
                <option value="tarjeta">💳 Tarjeta</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                Notas / Observaciones (Opcional):
              </label>
              <input
                type="text"
                value={singlePayNotes}
                onChange={(e) => setSinglePayNotes(e.target.value)}
                placeholder="Ej: Pago de quincena / liquidación de días trabajados"
                className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPayingSingleRow(null)}
                className="py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessingSinglePay}
                onClick={handleConfirmSingleEmployeePay}
                className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isProcessingSinglePay ? 'Procesando...' : `Confirmar Pago ($${payingSingleRow.totalPagar.toFixed(2)})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Liquidación Masiva de Planilla */}
      {showPayrollModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-neutral-100 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-black">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900">
                    Liquidar Planilla de Sueldos ({dateFilter.label})
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Registra el pago en Gastos Operativos (P&amp;L) según los días trabajados y sueldo de cada empleado
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPayrollModal(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-bold text-neutral-700 block">
                Selecciona los empleados a liquidar:
              </span>

              <div className="border border-neutral-200 rounded-2xl divide-y divide-neutral-100 overflow-hidden max-h-64 overflow-y-auto">
                {unifiedPayrollRows.filter(r => r.totalPagar > 0 && r.estadoPago !== 'Pagado').length === 0 ? (
                  <div className="p-6 text-center space-y-2 bg-emerald-50/50">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                    <p className="text-xs font-bold text-emerald-900">
                      ¡Todos los sueldos y días trabajados de este periodo ({dateFilter.label}) ya fueron pagados!
                    </p>
                  </div>
                ) : (
                  unifiedPayrollRows.filter(r => r.totalPagar > 0 && r.estadoPago !== 'Pagado').map(row => {
                    const isChecked = !!selectedForPayment[row.empleadoId];
                    return (
                      <label
                        key={row.empleadoId}
                        className={`p-3.5 flex items-center justify-between cursor-pointer transition ${
                          isChecked ? 'bg-indigo-50/50' : 'hover:bg-neutral-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              setSelectedForPayment(prev => ({
                                ...prev,
                                [row.empleadoId]: e.target.checked
                              }));
                            }}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <div>
                            <strong className="text-xs text-neutral-900 block">{row.nombre}</strong>
                            <span className="text-[10px] text-neutral-500 uppercase">
                              {row.puesto} • {row.diasTrabajados} {row.diasTrabajados === 1 ? 'día trabajado' : 'días trabajados'} • {row.modalidadLabel}
                            </span>
                            {row.totalAbonado > 0 && (
                              <span className="block text-[10px] font-medium text-emerald-700">
                                Sueldo: ${row.sueldoCalculado.toFixed(2)} | Abonos previos: -${row.totalAbonado.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <strong className="text-sm font-black text-emerald-600 font-mono">${row.totalPagar.toFixed(2)}</strong>
                          <span className="text-[10px] text-neutral-400 block font-medium">Neto a liquidar</span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="p-4 bg-neutral-900 text-white rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[11px] text-neutral-400 uppercase font-bold block">Total a registrar en Gastos (P&amp;L):</span>
                <span className="text-xs text-neutral-300">
                  {Object.values(selectedForPayment).filter(Boolean).length} empleados seleccionados
                </span>
              </div>
              <div className="text-2xl font-black text-emerald-400 font-mono">
                ${unifiedPayrollRows
                  .filter(r => selectedForPayment[r.empleadoId])
                  .reduce((sum, r) => sum + r.totalPagar, 0)
                  .toFixed(2)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPayrollModal(false)}
                className="py-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSalaryBatch}
                disabled={isProcessingSalary || Object.values(selectedForPayment).filter(Boolean).length === 0}
                className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isProcessingSalary ? 'Procesando pagos...' : 'Confirmar y Generar Gastos'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
