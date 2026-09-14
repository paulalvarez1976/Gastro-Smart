import React, { useState, useMemo, useEffect } from 'react';
import { 
  Shift, 
  Employee, 
  Restaurant, 
  Role,
  PaymentMethod,
  Expense
} from '../types';
import { 
  paySalaryBatch,
  payFixedSalaryExpense,
  subscribeToExpenses,
  getOperationalDateString,
  getOperationalMonthString
} from '../services/dataService';
import { exportPayrollToExcel, PayrollEmployeeRow } from '../services/excelService';
import { sounds } from '../utils/sound';
import { 
  Clock, 
  Users, 
  DollarSign, 
  Calendar, 
  Building2, 
  Filter, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  BarChart3, 
  Check, 
  X,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Wallet,
  Receipt,
  CreditCard,
  Download,
  CalendarCheck,
  Layers,
  PauseCircle
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
        Acceso restringido: Solo administradores y propietarios tienen acceso a la gestión de asistencia y nómina.
      </div>
    );
  }

  // Pestaña activa: Por Horas / Turnos vs Sueldo Fijo Mensual vs Reporte Días Trabajados
  const [activeTab, setActiveTab] = useState<'turnos' | 'fijos' | 'dias_trabajados'>('turnos');

  // Estado para Reporte de Días Trabajados
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [workingDaysMonthFilter, setWorkingDaysMonthFilter] = useState<string>('all');

  // Filtros
  const [dateRangePreset, setDateRangePreset] = useState<'hoy' | 'semana' | 'quincena' | 'mes' | 'todos'>('semana');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [overtimeMultiplier, setOvertimeMultiplier] = useState<number>(1.5);

  // Modal de generación de gastos de sueldos por horas
  const [showPayrollModal, setShowPayrollModal] = useState<boolean>(false);
  const [isProcessingSalary, setIsProcessingSalary] = useState<boolean>(false);
  const [salarySuccessToast, setSalarySuccessToast] = useState<string | null>(null);

  // Empleados seleccionados para pago masivo por horas
  const [selectedForPayment, setSelectedForPayment] = useState<Record<string, boolean>>({});

  // Control para Sueldo Fijo Mensual
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();
  const defaultMonthKey = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`;

  const [fixedSalaryMonthKey, setFixedSalaryMonthKey] = useState<string>(defaultMonthKey);
  const [payingFixedEmployee, setPayingFixedEmployee] = useState<Employee | null>(null);
  const [fixedPayMethod, setFixedPayMethod] = useState<PaymentMethod>('transferencia');
  const [fixedPayNotes, setFixedPayNotes] = useState<string>('');
  const [isProcessingFixedPay, setIsProcessingFixedPay] = useState<boolean>(false);
  const [fixedPayError, setFixedPayError] = useState<string | null>(null);

  // Gastos de sueldos (pagos reales registrados)
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
    const m = availableMonths.find(am => am.key === fixedSalaryMonthKey);
    if (m) return m.label;
    const [y, mm] = fixedSalaryMonthKey.split('-');
    const idx = parseInt(mm, 10) - 1;
    return `${monthNames[idx] || mm} ${y}`;
  }, [fixedSalaryMonthKey, availableMonths]);

  // Lista de empleados fijos
  const fixedEmployees = useMemo(() => {
    return employees.filter(e => {
      if (e.tipoSueldo !== 'fijo') return false;
      if (selectedBranchId !== 'all' && e.restaurantId !== selectedBranchId) return false;
      return true;
    });
  }, [employees, selectedBranchId]);

  // Calcular fechas según preset aplicando el día operativo (5:00 a.m. - 4:59 a.m.)
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
      const diff = dateObj.getDate() - day + (day === 0 ? -6 : 1); // Lunes
      dateObj.setDate(diff);
      const start = getOperationalDateString(dateObj);
      return { start, end: todayStr, label: 'Esta Semana' };
    }
    if (dateRangePreset === 'quincena') {
      const dateObj = new Date(opNow);
      dateObj.setDate(dateObj.getDate() - 15);
      const start = getOperationalDateString(dateObj);
      return { start, end: todayStr, label: 'Última Quincena (15 días)' };
    }
    if (dateRangePreset === 'mes') {
      const start = `${todayStr.slice(0, 7)}-01`;
      return { start, end: todayStr, label: 'Este Mes Operativo' };
    }
    return { start: '2020-01-01', end: '2030-12-31', label: 'Todo el Historial' };
  }, [dateRangePreset]);

  // Turnos filtrados
  const filteredShifts = useMemo(() => {
    return shifts.filter(s => {
      // Filtro de negocio
      if (s.businessId && s.businessId !== businessId) return false;
      
      // Filtro de sucursal
      if (selectedBranchId !== 'all' && s.restaurantId !== selectedBranchId) return false;

      // Filtro de empleado
      if (selectedEmployeeId !== 'all' && s.employeeId !== selectedEmployeeId) return false;

      // Filtro de puesto
      if (selectedRole !== 'all') {
        const emp = employees.find(e => e.id === s.employeeId);
        const role = s.employeePuesto || emp?.puesto;
        if (role !== selectedRole) return false;
      }

      // Filtro de fechas respetando el día operativo 5:00 a.m. - 4:59 a.m.
      const shiftDate = getOperationalDateString(s.horaInicio || s.fecha);
      if (shiftDate < dateFilter.start || shiftDate > dateFilter.end) return false;

      return true;
    });
  }, [shifts, businessId, selectedBranchId, selectedEmployeeId, selectedRole, dateFilter, employees]);

  // Mapa de empleados y tarifas
  const employeeMap = useMemo(() => {
    return new Map(employees.map(e => [e.id, e]));
  }, [employees]);

  // Mapa de restaurantes
  const restaurantMap = useMemo(() => {
    return new Map(restaurants.map(r => [r.id, r.nombre]));
  }, [restaurants]);

  // Estructura de desglose de días trabajados por empleado
  const workingDaysReport = useMemo(() => {
    const targetEmployees = employees.filter(e => {
      if (selectedBranchId !== 'all' && e.restaurantId !== selectedBranchId) return false;
      if (selectedEmployeeId !== 'all' && e.id !== selectedEmployeeId) return false;
      if (selectedRole !== 'all' && e.puesto !== selectedRole) return false;
      return true;
    });

    return targetEmployees.map(emp => {
      // Obtener todos los turnos de este empleado que caen en el rango filtrado
      const empShifts = filteredShifts.filter(s => {
        if (s.employeeId !== emp.id) return false;
        if (workingDaysMonthFilter !== 'all') {
          const shiftMonth = getOperationalMonthString(s.horaInicio || s.fecha);
          if (shiftMonth !== workingDaysMonthFilter) return false;
        }
        return true;
      });

      // Agrupar turnos por fecha operativa (5:00 a.m. - 4:59 a.m.)
      const dayMap = new Map<string, Shift[]>();
      empShifts.forEach(shift => {
        const opDate = getOperationalDateString(shift.horaInicio || shift.fecha);
        if (!dayMap.has(opDate)) {
          dayMap.set(opDate, []);
        }
        dayMap.get(opDate)!.push(shift);
      });

      // Construir detalle por día
      interface ShiftDayDetail {
        fechaOperativa: string;
        fechaLabel: string;
        minutosTotales: number;
        horasTotales: number;
        turnos: Shift[];
        pausasTotales: number;
        pausasMinutos: number;
      }

      const diasDetalle: ShiftDayDetail[] = [];
      let grandTotalMinutos = 0;

      dayMap.forEach((shiftsInDay, opDate) => {
        let minutosDia = 0;
        let pausasCount = 0;
        let pausasMin = 0;

        shiftsInDay.forEach(s => {
          const shiftPauseMin = s.pausasMinutos ?? (s.pausas || []).reduce((sum, p) => sum + (p.minutos || 0), 0);
          let shiftMin = s.minutosTrabajados;
          if (shiftMin === undefined || shiftMin === null) {
            const start = new Date(s.horaInicio).getTime();
            const end = s.horaFin ? new Date(s.horaFin).getTime() : Date.now();
            shiftMin = Math.max(0, Math.round((end - start) / 60000) - shiftPauseMin);
          }
          minutosDia += shiftMin;
          if (s.pausas && s.pausas.length > 0) {
            pausasCount += s.pausas.length;
          }
          pausasMin += shiftPauseMin;
        });

        grandTotalMinutos += minutosDia;
        const [y, m, d] = opDate.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d, 12, 0, 0);
        const fechaLabel = dateObj.toLocaleDateString('es-ES', { 
          weekday: 'short', 
          day: 'numeric', 
          month: 'short', 
          year: 'numeric' 
        });

        diasDetalle.push({
          fechaOperativa: opDate,
          fechaLabel,
          minutosTotales: minutosDia,
          horasTotales: Math.round((minutosDia / 60) * 10) / 10,
          turnos: shiftsInDay,
          pausasTotales: pausasCount,
          pausasMinutos: pausasMin
        });
      });

      // Ordenar días del más reciente al más antiguo
      diasDetalle.sort((a, b) => b.fechaOperativa.localeCompare(a.fechaOperativa));

      const diasTrabajados = diasDetalle.length;
      const horasTotales = Math.round((grandTotalMinutos / 60) * 10) / 10;
      const promedioHorasDia = diasTrabajados > 0 
        ? Math.round((horasTotales / diasTrabajados) * 10) / 10 
        : 0;

      const restName = restaurantMap.get(emp.restaurantId) || 'Sucursal';

      return {
        empleadoId: emp.id,
        nombre: emp.nombre,
        puesto: emp.puesto,
        sucursal: restName,
        avatarUrl: emp.avatarUrl,
        tipoSueldo: emp.tipoSueldo || 'por_hora',
        tarifaHora: emp.tarifaHora || 0,
        diasTrabajados,
        horasTotales,
        promedioHorasDia,
        diasDetalle
      };
    }).sort((a, b) => b.diasTrabajados - a.diasTrabajados || b.horasTotales - a.horasTotales);
  }, [employees, filteredShifts, workingDaysMonthFilter, restaurantMap, selectedBranchId, selectedEmployeeId, selectedRole]);

  // Exportar reporte de días trabajados a CSV
  const handleExportWorkingDaysCSV = () => {
    sounds.playKeypadClick();
    const headers = [
      'Empleado',
      'Puesto/Rol',
      'Sucursal',
      'Tipo Sueldo',
      'Tarifa Hora',
      'Dias Trabajados (Ciclo Operativo)',
      'Horas Totales',
      'Promedio Horas/Dia'
    ];
    const rows = workingDaysReport.map(r => [
      `"${r.nombre.replace(/"/g, '""')}"`,
      `"${r.puesto}"`,
      `"${r.sucursal}"`,
      `"${r.tipoSueldo}"`,
      `"$${r.tarifaHora.toFixed(2)}"`,
      r.diasTrabajados,
      r.horasTotales,
      r.promedioHorasDia
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + 
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Reporte_Dias_Trabajados_${dateFilter.label.replace(/[^a-zA-Z0-9]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Agrupación y cálculo basado ÚNICAMENTE en pagos reales registrados (Gastos)
  const payrollRows: PayrollEmployeeRow[] = useMemo(() => {
    // 1. Filtrar empleados aplicables por hora
    const hourlyEmployees = employees.filter(e => {
      if (e.tipoSueldo === 'fijo') return false;
      if (selectedBranchId !== 'all' && e.restaurantId !== selectedBranchId) return false;
      if (selectedEmployeeId !== 'all' && e.id !== selectedEmployeeId) return false;
      if (selectedRole !== 'all' && e.puesto !== selectedRole) return false;
      return true;
    });

    // 2. Asociar los gastos reales del periodo a cada empleado
    return hourlyEmployees.map(emp => {
      const expForEmp = salaryExpenses.filter(e => {
        if (e.employeeId !== emp.id) return false;
        const expDate = (e.fecha || '').split('T')[0];
        return expDate >= dateFilter.start && expDate <= dateFilter.end;
      });

      const totalPagado = expForEmp.reduce((sum, e) => sum + (e.monto || 0), 0);
      const horasTrab = expForEmp.reduce((sum, e) => sum + (e.horasTrabajadas || 0), 0);
      const horasExt = expForEmp.reduce((sum, e) => sum + (e.horasExtra || 0), 0);

      const estado = expForEmp.length > 0 ? 'Pagado' : 'Sin pagos registrados';
      const restName = restaurantMap.get(emp.restaurantId) || 'Sucursal';
      const rate = emp.tarifaHora || 0;

      return {
        empleadoId: emp.id,
        nombre: emp.nombre,
        puesto: emp.puesto,
        sucursal: restName,
        tarifaHora: rate,
        horasNormales: Math.max(0, horasTrab - horasExt),
        horasExtra: horasExt,
        horasTotales: horasTrab,
        totalNormal: 0, // Solo mostramos los totales pagados reales
        totalExtra: 0, 
        totalPagar: totalPagado,
        turnosContados: expForEmp.length,
        estadoPago: estado
      };
    });
  }, [salaryExpenses, employees, restaurantMap, selectedEmployeeId, selectedBranchId, selectedRole, dateFilter]);

  // Datos para la gráfica de barras: Horas por día de los turnos filtrados
  const chartData = useMemo(() => {
    const dayMap: Record<string, { fecha: string; horasNormales: number; horasExtra: number }> = {};

    filteredShifts.forEach(shift => {
      const f = shift.fecha || (shift.horaInicio || '').split('T')[0];
      if (!dayMap[f]) {
        dayMap[f] = { fecha: f, horasNormales: 0, horasExtra: 0 };
      }
      const h = (shift.minutosTrabajados || 0) / 60;
      const norm = Math.min(8, h);
      const ext = Math.max(0, h - 8);
      dayMap[f].horasNormales += Math.round(norm * 10) / 10;
      dayMap[f].horasExtra += Math.round(ext * 10) / 10;
    });

    return Object.values(dayMap).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [filteredShifts]);

  // Totales consolidados del periodo
  const grandTotalHours = useMemo(() => payrollRows.reduce((s, r) => s + r.horasTotales, 0), [payrollRows]);
  const grandTotalOvertime = useMemo(() => payrollRows.reduce((s, r) => s + r.horasExtra, 0), [payrollRows]);
  const grandTotalPayable = useMemo(() => payrollRows.reduce((s, r) => s + r.totalPagar, 0), [payrollRows]);

  // Exportar a Excel (SheetJS)
  const handleExportExcel = () => {
    sounds.playCashRegister();
    const branchName = selectedBranchId === 'all' 
      ? 'Todas las sucursales' 
      : (restaurantMap.get(selectedBranchId) || 'Sucursal');

    exportPayrollToExcel({
      businessName,
      periodLabel: dateFilter.label,
      selectedBranchName: branchName,
      rows: payrollRows
    });
  };

  // Abrir modal de generación de gastos de sueldo
  const handleOpenSalaryModal = () => {
    sounds.playKeypadClick();
    // Pre-seleccionar todos los empleados que tengan turnos pendientes
    const initialSelection: Record<string, boolean> = {};
    payrollRows.forEach(row => {
      if (row.estadoPago !== 'Pagado') {
        initialSelection[row.empleadoId] = true;
      }
    });
    setSelectedForPayment(initialSelection);
    setShowPayrollModal(true);
  };

  // Confirmar y generar gastos de sueldos
  const handleConfirmSalaryBatch = async () => {
    setIsProcessingSalary(true);
    sounds.playCashRegister();

    try {
      // Filtrar turnos no pagados de los empleados seleccionados
      const pendingShiftsToPay = filteredShifts.filter(s => {
        if (s.pagado) return false;
        return selectedForPayment[s.employeeId];
      });

      const rateMap: Record<string, number> = {};
      employees.forEach(e => {
        rateMap[e.id] = e.tarifaHora || 12;
      });

      const targetRestId = selectedBranchId === 'all' 
        ? (restaurants[0]?.id || 'central') 
        : selectedBranchId;

      await paySalaryBatch(
        businessId,
        targetRestId,
        pendingShiftsToPay,
        rateMap,
        dateFilter.label,
        currentUserName,
        overtimeMultiplier
      );

      setSalarySuccessToast(`¡Gastos de sueldo generados exitosamente! Se procesaron ${pendingShiftsToPay.length} turnos.`);
      setShowPayrollModal(false);
      setTimeout(() => setSalarySuccessToast(null), 5000);
    } catch (err: any) {
      console.error('Error procesando nóminas:', err);
    } finally {
      setIsProcessingSalary(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {salarySuccessToast && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{salarySuccessToast}</span>
        </div>
      )}

      {/* Tab Navigation: Horas/Turnos vs Sueldo Fijo vs Reporte Días Trabajados */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => { setActiveTab('turnos'); sounds.playKeypadClick(); }}
          className={`px-4 py-2 rounded-2xl text-xs font-black transition flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'turnos'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Personal por Horas / Jornadas ({filteredShifts.length} turnos)</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('fijos'); sounds.playKeypadClick(); }}
          className={`px-4 py-2 rounded-2xl text-xs font-black transition flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'fijos'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Personal con Sueldo Fijo Mensual ({fixedEmployees.length})</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('dias_trabajados'); sounds.playKeypadClick(); }}
          className={`px-4 py-2 rounded-2xl text-xs font-black transition flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'dias_trabajados'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          <CalendarCheck className="w-4 h-4" />
          <span>Reporte: Días Trabajados (Ciclo Operativo)</span>
        </button>
      </div>

      {/* TAB 1: Reporte de Días Trabajados (Ciclo Operativo 5:00 a.m. - 4:59 a.m.) */}
      {activeTab === 'dias_trabajados' && (
        <div className="space-y-6">
          {/* Header & Controls */}
          <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-1">
                  <CalendarCheck className="w-4 h-4" />
                  <span>Reporte Consolidado • Solo Lectura</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-neutral-900">
                  Horas Trabajadas Resumidas en Días Laborados
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Agrupación de horas y turnos de cada empleado bajo el <strong>Día Operativo (5:00 a.m. a 4:59 a.m.)</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportWorkingDaysCSV}
                  className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-black transition flex items-center gap-2 border border-emerald-200 cursor-pointer shadow-xs"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  <span>Exportar CSV</span>
                </button>
              </div>
            </div>

            {/* Banner Explicativo Día Operativo */}
            <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-2xl flex items-start gap-3 text-xs text-emerald-900">
              <span className="text-base">ℹ️</span>
              <div>
                <strong className="font-bold">Regla del Ciclo Operativo (5:00 a.m. - 4:59 a.m.):</strong>
                <p className="text-emerald-800 text-[11px] mt-0.5">
                  Todo turno iniciado entre las 5:00 a.m. de hoy y las 4:59 a.m. de la mañana siguiente se contabiliza dentro del mismo día operativo. Los turnos nocturnos o de madrugada no se fragmentan artificialmente, garantizando un recuento exacto de días trabajados por persona.
                </p>
              </div>
            </div>

            {/* Filtros */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-neutral-100">
              {/* Preset de Rango */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                  Rango de Fecha:
                </label>
                <select
                  value={dateRangePreset}
                  onChange={(e) => setDateRangePreset(e.target.value as any)}
                  className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 bg-white"
                >
                  <option value="hoy">Hoy (Día Operativo)</option>
                  <option value="semana">Esta Semana</option>
                  <option value="quincena">Última Quincena (15 días)</option>
                  <option value="mes">Este Mes Operativo</option>
                  <option value="todos">Todo el Historial</option>
                </select>
              </div>

              {/* Mes Operativo */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                  Mes Específico:
                </label>
                <select
                  value={workingDaysMonthFilter}
                  onChange={(e) => setWorkingDaysMonthFilter(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 bg-white"
                >
                  <option value="all">Todos los Meses</option>
                  {availableMonths.map(m => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Sucursal */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                  Sucursal:
                </label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 bg-white"
                >
                  <option value="all">Todas las Sucursales</option>
                  {restaurants.map(r => (
                    <option key={r.id} value={r.id}>{r.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Rol / Puesto */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                  Puesto / Rol:
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 bg-white"
                >
                  <option value="all">Todos los Puestos</option>
                  <option value="administrador">Administrador</option>
                  <option value="cajero">Cajero</option>
                  <option value="mesero">Mesero</option>
                  <option value="cocinero">Cocinero</option>
                  <option value="repartidor">Repartidor</option>
                </select>
              </div>

              {/* Empleado Específico */}
              <div>
                <label className="block text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                  Empleado:
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold text-neutral-800 bg-white"
                >
                  <option value="all">Todos los Empleados ({employees.length})</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.nombre} ({e.puesto})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <CalendarCheck className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Días-Hombre Totales</span>
                  <div className="text-2xl font-black text-neutral-900">
                    {workingDaysReport.reduce((acc, r) => acc + r.diasTrabajados, 0)} <span className="text-xs font-bold text-neutral-400">días</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Horas Acumuladas</span>
                  <div className="text-2xl font-black text-blue-700">
                    {workingDaysReport.reduce((acc, r) => acc + r.horasTotales, 0).toFixed(1)} <span className="text-xs font-bold text-blue-400">hrs</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Personal con Asistencia</span>
                  <div className="text-2xl font-black text-neutral-900">
                    {workingDaysReport.filter(r => r.diasTrabajados > 0).length} <span className="text-xs font-bold text-neutral-400">/ {workingDaysReport.length}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Promedio Diario</span>
                  <div className="text-2xl font-black text-amber-800">
                    {(() => {
                      const totalDias = workingDaysReport.reduce((acc, r) => acc + r.diasTrabajados, 0);
                      const totalHoras = workingDaysReport.reduce((acc, r) => acc + r.horasTotales, 0);
                      return totalDias > 0 ? (totalHoras / totalDias).toFixed(1) : '0.0';
                    })()} <span className="text-xs font-bold text-amber-500">hrs/día</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla de Empleados y Días Trabajados */}
          <div className="bg-white rounded-3xl border border-neutral-200 overflow-hidden shadow-sm">
            <div className="p-4 sm:p-5 border-b border-neutral-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-neutral-900 uppercase tracking-wider">
                  Resumen de Días Trabajados por Empleado
                </h3>
                <p className="text-xs text-neutral-400">
                  Desglose de días laborados, horas netas trabajadas y detalle de cada jornada diaria.
                </p>
              </div>
              <span className="text-xs font-bold text-neutral-500 bg-neutral-100 px-3 py-1 rounded-full">
                {workingDaysReport.length} empleados
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-neutral-500 border-b border-neutral-200 font-bold">
                    <th className="p-3.5">Empleado</th>
                    <th className="p-3.5">Puesto</th>
                    <th className="p-3.5">Sucursal</th>
                    <th className="p-3.5">Tipo Sueldo</th>
                    <th className="p-3.5 text-center">Días Trabajados</th>
                    <th className="p-3.5 text-right">Horas Totales</th>
                    <th className="p-3.5 text-right">Promedio / Día</th>
                    <th className="p-3.5 text-center">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {workingDaysReport.map(row => {
                    const isExpanded = expandedEmployeeId === row.empleadoId;

                    return (
                      <React.Fragment key={row.empleadoId}>
                        <tr className={`hover:bg-neutral-50/60 transition ${isExpanded ? 'bg-emerald-50/20' : ''}`}>
                          <td className="p-3.5 font-bold text-neutral-900">
                            <div className="flex items-center gap-2.5">
                              {row.avatarUrl ? (
                                <img src={row.avatarUrl} alt={row.nombre} className="w-8 h-8 rounded-full object-cover border border-neutral-200" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                                  {row.nombre.charAt(0)}
                                </div>
                              )}
                              <div>
                                <span className="block text-neutral-900 font-bold">{row.nombre}</span>
                                <span className="text-[10px] text-neutral-400 font-normal">ID: {row.empleadoId.slice(0, 6)}</span>
                              </div>
                            </div>
                          </td>

                          <td className="p-3.5 uppercase font-medium text-neutral-600">
                            {row.puesto}
                          </td>

                          <td className="p-3.5 text-neutral-600 font-medium">
                            {row.sucursal}
                          </td>

                          <td className="p-3.5">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              row.tipoSueldo === 'fijo' 
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}>
                              {row.tipoSueldo === 'fijo' ? 'Fijo Mensual' : `Por Hora ($${row.tarifaHora}/h)`}
                            </span>
                          </td>

                          <td className="p-3.5 text-center">
                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black ${
                              row.diasTrabajados > 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-neutral-100 text-neutral-400'
                            }`}>
                              <CalendarCheck className="w-3.5 h-3.5 text-emerald-600" />
                              {row.diasTrabajados} {row.diasTrabajados === 1 ? 'día' : 'días'}
                            </span>
                          </td>

                          <td className="p-3.5 text-right font-mono font-bold text-sm text-neutral-900">
                            {row.horasTotales.toFixed(1)} hrs
                          </td>

                          <td className="p-3.5 text-right font-mono font-bold text-neutral-600">
                            {row.promedioHorasDia.toFixed(1)} hrs/día
                          </td>

                          <td className="p-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedEmployeeId(isExpanded ? null : row.empleadoId);
                                sounds.playKeypadClick();
                              }}
                              disabled={row.diasTrabajados === 0}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 mx-auto cursor-pointer ${
                                row.diasTrabajados === 0 
                                  ? 'opacity-40 cursor-not-allowed bg-neutral-100 text-neutral-400' 
                                  : isExpanded 
                                    ? 'bg-emerald-600 text-white shadow-xs' 
                                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                              }`}
                            >
                              <span>{isExpanded ? 'Ocultar' : 'Ver Días'}</span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        </tr>

                        {/* Desglose de jornadas diarias por empleado */}
                        {isExpanded && (
                          <tr className="bg-emerald-50/15">
                            <td colSpan={8} className="p-4 sm:p-6 border-b border-neutral-200">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-emerald-700" />
                                    Jornadas Diarias de {row.nombre} ({row.diasDetalle.length} días registrados)
                                  </h4>
                                  <span className="text-[11px] text-neutral-500 font-medium">
                                    Ciclo: 5:00 a.m. a 4:59 a.m.
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {row.diasDetalle.map((dia, idx) => (
                                    <div key={idx} className="bg-white rounded-2xl border border-emerald-200 p-3.5 space-y-2 shadow-xs">
                                      <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                                        <div className="flex items-center gap-2">
                                          <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-black flex items-center justify-center">
                                            #{idx + 1}
                                          </div>
                                          <div>
                                            <strong className="text-xs font-bold text-neutral-900 capitalize block">
                                              {dia.fechaLabel}
                                            </strong>
                                            <span className="text-[10px] text-neutral-400 font-mono">
                                              {dia.fechaOperativa}
                                            </span>
                                          </div>
                                        </div>
                                        <span className="text-xs font-black text-emerald-700 font-mono bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                          {dia.horasTotales.toFixed(1)} hrs
                                        </span>
                                      </div>

                                      {/* Turnos en este día operativo */}
                                      <div className="space-y-1.5 text-[11px]">
                                        {dia.turnos.map(t => {
                                          const hInicio = t.horaInicio ? new Date(t.horaInicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                                          const hFin = t.horaFin ? new Date(t.horaFin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'En curso';
                                          const pauseMin = t.pausasMinutos ?? (t.pausas || []).reduce((sum, p) => sum + (p.minutos || 0), 0);

                                          return (
                                            <div key={t.id} className="p-2 bg-neutral-50 rounded-xl flex items-center justify-between border border-neutral-100">
                                              <div>
                                                <span className="font-bold text-neutral-800">{hInicio} - {hFin}</span>
                                                {pauseMin > 0 && (
                                                  <span className="block text-[10px] text-amber-700 font-medium">
                                                    Pausas: {pauseMin}m ({t.pausas?.length || 1} pausa)
                                                  </span>
                                                )}
                                              </div>
                                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                                t.pagado 
                                                  ? 'bg-emerald-100 text-emerald-800' 
                                                  : 'bg-amber-100 text-amber-800'
                                              }`}>
                                                {t.pagado ? 'Pagado' : 'Pendiente'}
                                              </span>
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

                  {workingDaysReport.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-neutral-400 font-medium">
                        No se encontraron registros de turnos o empleados en el rango y filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'fijos' ? (
        /* Vista de Sueldo Fijo Mensual */
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-1">
                  <Wallet className="w-4 h-4" />
                  <span>Liquidación de Sueldos Fijos Mensuales</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-neutral-900">
                  Planilla de Sueldos Fijos
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Registra los pagos mensuales de empleados con sueldo fijo. Cada pago genera un gasto contable de tipo &quot;sueldo&quot; y queda registrado para auditoría.
                </p>
              </div>

              {/* Selector de Mes */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-neutral-600">Mes a Liquidar:</label>
                <select
                  value={fixedSalaryMonthKey}
                  onChange={(e) => setFixedSalaryMonthKey(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50/50 text-xs font-black text-indigo-950 focus:ring-2 focus:ring-indigo-500"
                >
                  {availableMonths.map(m => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Cards resumen sueldos fijos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
              <span className="text-xs text-neutral-500 font-bold uppercase">Personal con Sueldo Fijo</span>
              <div className="text-2xl font-black text-neutral-900 mt-1">
                {fixedEmployees.length} empleados
              </div>
              <span className="text-[11px] text-neutral-400 mt-0.5 block">Configurados con tipoSueldo = &quot;fijo&quot;</span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
              <span className="text-xs text-neutral-500 font-bold uppercase">Pagos Reales en {selectedMonthLabel}</span>
              <div className="text-2xl font-black text-indigo-600 mt-1 font-mono">
                ${salaryExpenses
                  .filter(exp => 
                    (exp.fecha || '').startsWith(fixedSalaryMonthKey) && 
                    fixedEmployees.some(e => e.id === exp.employeeId)
                  )
                  .reduce((sum, exp) => sum + (exp.monto || 0), 0).toFixed(2)}
              </div>
              <span className="text-[11px] text-neutral-400 mt-0.5 block">Total de gastos registrados en el mes</span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
              <span className="text-xs text-neutral-500 font-bold uppercase">Estado de Pago del Mes</span>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                {fixedEmployees.filter(e => (e.mesesPagados || []).includes(fixedSalaryMonthKey)).length} / {fixedEmployees.length}
              </div>
              <span className="text-[11px] text-neutral-400 mt-0.5 block">Pagados en {selectedMonthLabel}</span>
            </div>
          </div>

          {/* Tabla de Empleados con Sueldo Fijo */}
          <div className="bg-white rounded-3xl border border-neutral-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-neutral-900">
                Personal con Sueldo Fijo — Periodo: {selectedMonthLabel}
              </h3>
              <span className="text-xs text-neutral-500">{fixedEmployees.length} miembros</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-bold uppercase">
                    <th className="p-3.5">Empleado</th>
                    <th className="p-3.5">Puesto</th>
                    <th className="p-3.5">Sucursal</th>
                    <th className="p-3.5 text-right">Sueldo Base ($)</th>
                    <th className="p-3.5 text-right text-indigo-700">Pagado Real ($)</th>
                    <th className="p-3.5 text-center">Estado {selectedMonthLabel}</th>
                    <th className="p-3.5">Historial Pagado</th>
                    <th className="p-3.5 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {fixedEmployees.map(emp => {
                    const isPaidForSelectedMonth = (emp.mesesPagados || []).includes(fixedSalaryMonthKey);
                    const restName = restaurantMap.get(emp.restaurantId) || 'Sucursal';
                    
                    const actualPaidAmount = salaryExpenses
                      .filter(e => e.employeeId === emp.id && (e.fecha || '').startsWith(fixedSalaryMonthKey))
                      .reduce((sum, e) => sum + (e.monto || 0), 0);

                    return (
                      <tr key={emp.id} className="hover:bg-neutral-50/50 transition">
                        <td className="p-3.5 font-bold text-neutral-900">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                              {emp.nombre.charAt(0)}
                            </div>
                            <div>
                              <span>{emp.nombre}</span>
                              <span className="block text-[10px] text-neutral-400 font-normal">ID: {emp.id.slice(0, 6)}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 uppercase font-medium text-neutral-600">{emp.puesto}</td>
                        <td className="p-3.5 text-neutral-500">{restName}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-sm text-neutral-500">
                          ${(emp.sueldoMensual || 0).toFixed(2)}
                        </td>
                        <td className="p-3.5 text-right font-mono font-black text-sm text-indigo-700 bg-indigo-50/30">
                          ${actualPaidAmount.toFixed(2)}
                        </td>
                        <td className="p-3.5 text-center">
                          {isPaidForSelectedMonth ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Pagado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <AlertCircle className="w-3 h-3 text-amber-600" />
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {(emp.mesesPagados || []).length > 0 ? (
                              (emp.mesesPagados || []).slice(-3).map((m, mIdx) => (
                                <span key={`${m}-${mIdx}`} className="px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-600 text-[10px] font-mono">
                                  {m}
                                </span>
                              ))
                            ) : (
                              <span className="text-neutral-400 text-[10px] italic">Sin pagos previos</span>
                            )}
                            {(emp.mesesPagados || []).length > 3 && (
                              <span className="text-[10px] text-neutral-400">+{((emp.mesesPagados || []).length - 3)} más</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3.5 text-right">
                          {isPaidForSelectedMonth ? (
                            <button
                              disabled
                              className="px-3 py-1.5 rounded-xl bg-neutral-100 text-neutral-400 text-xs font-bold flex items-center gap-1.5 ml-auto cursor-not-allowed"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Pagado</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setPayingFixedEmployee(emp);
                                setFixedPayError(null);
                                sounds.playKeypadClick();
                              }}
                              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 ml-auto shadow-xs cursor-pointer"
                            >
                              <DollarSign className="w-3.5 h-3.5 text-amber-300" />
                              <span>Pagar Sueldo</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {fixedEmployees.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-neutral-400 font-medium">
                        No hay empleados configurados con sueldo fijo en la plantilla. Para configurar un empleado con sueldo fijo, edítalo en la sección de Empleados y asigna tipo de sueldo = &quot;Fijo Mensual&quot;.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Vista de Asistencia por Horas y Turnos */
        <>
      {/* Header & Controls */}
      <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-purple-700 text-xs font-bold uppercase tracking-wider mb-1">
              <Clock className="w-4 h-4" />
              <span>Control de Asistencia, Jornadas y Sueldos</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-neutral-900">
              Horas Trabajadas y Planilla de Pago
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Monitoreo de horas ordinarias, horas extra (1.5x) y liquidación de nóminas directa a gastos operativos.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Exportar Excel */}
            <button
              onClick={handleExportExcel}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar Planilla Excel</span>
            </button>

            {/* Generar Gastos de Sueldo */}
            <button
              onClick={handleOpenSalaryModal}
              disabled={payrollRows.length === 0}
              className="px-4 py-2.5 bg-neutral-900 hover:bg-black text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs disabled:opacity-40 cursor-pointer"
            >
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span>Generar Gastos de Sueldo</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-neutral-100">
          
          {/* Preset Periodo */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-500 uppercase mb-1">Periodo</label>
            <select
              value={dateRangePreset}
              onChange={(e) => setDateRangePreset(e.target.value as any)}
              className="w-full p-2.5 rounded-xl border border-neutral-300 text-xs font-bold bg-neutral-50 focus:ring-2 focus:ring-purple-500"
            >
              <option value="hoy">Hoy</option>
              <option value="semana">Esta semana</option>
              <option value="quincena">Última quincena (15d)</option>
              <option value="mes">Este mes</option>
              <option value="todos">Todo el historial</option>
            </select>
          </div>

          {/* Sucursal */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-500 uppercase mb-1">Sucursal</label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-neutral-300 text-xs font-bold bg-neutral-50 focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">Todas las sucursales</option>
              {restaurants.map(r => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
          </div>

          {/* Empleado */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-500 uppercase mb-1">Empleado</label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-neutral-300 text-xs font-bold bg-neutral-50 focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">Todos los empleados</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.nombre} ({emp.puesto})</option>
              ))}
            </select>
          </div>

          {/* Puesto */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-500 uppercase mb-1">Puesto / Rol</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-neutral-300 text-xs font-bold bg-neutral-50 focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">Todos los puestos</option>
              <option value="mesero">Meseros</option>
              <option value="cocina">Cocina</option>
              <option value="caja">Cajeros</option>
              <option value="ayudante_cocina">Ayudantes de cocina</option>
              <option value="limpieza">Limpieza</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
          <span className="text-xs text-neutral-500 font-bold uppercase">Total Horas Trabajadas</span>
          <div className="text-2xl font-black text-neutral-900 mt-1">
            {grandTotalHours.toFixed(1)} hrs
          </div>
          <span className="text-[11px] text-neutral-400 mt-0.5 block">{filteredShifts.length} jornadas registradas</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
          <span className="text-xs text-neutral-500 font-bold uppercase">Horas Extra Acumuladas</span>
          <div className="text-2xl font-black text-red-600 mt-1">
            {grandTotalOvertime.toFixed(1)} hrs
          </div>
          <span className="text-[11px] text-red-500/80 mt-0.5 block">Calculadas con factor {overtimeMultiplier}x (&gt;8h diarias)</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-neutral-200 shadow-xs">
          <span className="text-xs text-neutral-500 font-bold uppercase">Pagos Registrados (Gastos)</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">
            ${grandTotalPayable.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-neutral-400 mt-0.5 block">Total abonado a este personal en el periodo</span>
        </div>
      </div>

      {/* Bar Chart: Horas por Día */}
      {chartData.length > 0 && (
        <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-neutral-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-600" />
              <span>Horas Trabajadas por Fecha</span>
            </h3>
            <span className="text-xs text-neutral-500 font-medium">Horas Normales vs Horas Extra</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="horasNormales" name="Horas Normales" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="horasExtra" name="Horas Extra (1.5x)" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Table of Employee Summaries */}
      <div className="bg-white rounded-3xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
          <h3 className="font-extrabold text-sm text-neutral-900">
            Resumen Consolidado por Empleado
          </h3>
          <span className="text-xs text-neutral-500">{payrollRows.length} miembros del personal</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-bold uppercase">
                <th className="p-3.5">Empleado</th>
                <th className="p-3.5">Puesto</th>
                <th className="p-3.5">Sucursal</th>
                <th className="p-3.5 text-right">Tarifa ($/h)</th>
                <th className="p-3.5 text-right">Horas Normales</th>
                <th className="p-3.5 text-right">Horas Extra</th>
                <th className="p-3.5 text-right">Horas Totales</th>
                <th className="p-3.5 text-right text-emerald-700">Pagado Real ($)</th>
                <th className="p-3.5 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {payrollRows.map(row => (
                <tr key={row.empleadoId} className="hover:bg-neutral-50/50 transition">
                  <td className="p-3.5 font-bold text-neutral-900">{row.nombre}</td>
                  <td className="p-3.5 uppercase font-medium text-neutral-600">{row.puesto}</td>
                  <td className="p-3.5 text-neutral-500">{row.sucursal}</td>
                  <td className="p-3.5 text-right font-mono">${row.tarifaHora.toFixed(2)}</td>
                  <td className="p-3.5 text-right font-mono">{row.horasNormales} h</td>
                  <td className="p-3.5 text-right font-mono font-bold text-red-600">
                    {row.horasExtra > 0 ? `${row.horasExtra} h` : '-'}
                  </td>
                  <td className="p-3.5 text-right font-mono font-bold text-neutral-900">{row.horasTotales} h</td>
                  <td className="p-3.5 text-right font-mono font-black text-emerald-600 text-sm">
                    ${row.totalPagar.toFixed(2)}
                  </td>
                  <td className="p-3.5 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      row.estadoPago === 'Pagado'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : row.estadoPago === 'Parcial'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                    }`}>
                      {row.estadoPago}
                    </span>
                  </td>
                </tr>
              ))}
              {payrollRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-neutral-400 font-medium">
                    No se encontraron registros de turnos en el rango seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Shifts Table with lock indicators and sales metrics */}
      <div className="bg-white rounded-3xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
          <h3 className="font-extrabold text-sm text-neutral-900">
            Detalle Individual de Turnos Registrados
          </h3>
          <span className="text-xs text-neutral-500">{filteredShifts.length} turnos</span>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-bold uppercase z-10">
              <tr>
                <th className="p-3.5">Fecha</th>
                <th className="p-3.5">Empleado</th>
                <th className="p-3.5">Horario</th>
                <th className="p-3.5 text-right">Horas</th>
                <th className="p-3.5 text-right">Pedidos Atendidos</th>
                <th className="p-3.5 text-right">Ventas Generadas ($)</th>
                <th className="p-3.5">Reporte de Labores</th>
                <th className="p-3.5 text-center">Estado Pago</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredShifts.map(shift => {
                const hoursWorked = Math.round(((shift.minutosTrabajados || 0) / 60) * 10) / 10;
                const isOvertime = hoursWorked > 8;
                const startTime = shift.horaInicio ? new Date(shift.horaInicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
                const endTime = shift.horaFin ? new Date(shift.horaFin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'En curso';

                return (
                  <tr key={shift.id} className="hover:bg-neutral-50/50 transition">
                    <td className="p-3.5 font-mono text-neutral-700">{shift.fecha || '-'}</td>
                    <td className="p-3.5 font-bold text-neutral-900">
                      {shift.employeeName || 'Empleado'}
                    </td>
                    <td className="p-3.5 font-mono text-neutral-500">
                      {startTime} - {endTime}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold">
                      <span className={isOvertime ? 'text-red-600' : 'text-neutral-800'}>
                        {hoursWorked} h
                      </span>
                    </td>
                    <td className="p-3.5 text-right font-mono text-neutral-700">
                      {shift.pedidosTomados || 0}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-emerald-600">
                      ${(shift.ventasGeneradas || 0).toFixed(2)}
                    </td>
                    <td className="p-3.5 text-neutral-500 max-w-xs truncate" title={shift.reporteLabores || ''}>
                      {shift.reporteLabores || <span className="text-neutral-300 italic">Sin reporte</span>}
                    </td>
                    <td className="p-3.5 text-center">
                      {shift.pagado ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                          <Lock className="w-2.5 h-2.5" />
                          Pagado
                        </span>
                      ) : (
                        <span className="inline-block text-[10px] font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-full">
                          Pendiente
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

        </>
      )}

      {/* Modal de Confirmación de Pago de Sueldos por Turnos */}
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
                    Generar Gastos de Sueldo Operativo
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Periodo: {dateFilter.label} — Registra asientos en gastos y marca turnos como pagados
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

            {/* List of employees to pay */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-neutral-700 block">
                Selecciona los empleados a liquidar:
              </span>

              <div className="border border-neutral-200 rounded-2xl divide-y divide-neutral-100 overflow-hidden max-h-60 overflow-y-auto">
                {payrollRows.filter(r => r.estadoPago !== 'Pagado').map(row => {
                  const isChecked = !!selectedForPayment[row.empleadoId];
                  return (
                    <label 
                      key={row.empleadoId}
                      className={`p-3.5 flex items-center justify-between cursor-pointer transition ${
                        isChecked ? 'bg-purple-50/50' : 'hover:bg-neutral-50'
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
                          className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                        />
                        <div>
                          <strong className="text-xs text-neutral-900 block">{row.nombre}</strong>
                          <span className="text-[10px] text-neutral-400 uppercase">{row.puesto} • {row.horasTotales} hrs ({row.horasExtra} extra)</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <strong className="text-sm font-black text-emerald-600 font-mono">${row.totalPagar.toFixed(2)}</strong>
                        <span className="text-[10px] text-neutral-400 block">${row.tarifaHora}/h</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Grand Total Summary */}
            <div className="p-4 bg-neutral-900 text-white rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[11px] text-neutral-400 uppercase font-bold block">Total a liquidar en gastos:</span>
                <span className="text-xs text-neutral-300">
                  {Object.values(selectedForPayment).filter(Boolean).length} empleados seleccionados
                </span>
              </div>
              <div className="text-2xl font-black text-emerald-400 font-mono">
                ${payrollRows
                  .filter(r => selectedForPayment[r.empleadoId])
                  .reduce((sum, r) => sum + r.totalPagar, 0)
                  .toFixed(2)}
              </div>
            </div>

            {/* Actions */}
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

      {/* Modal de Pago de Sueldo Fijo Mensual */}
      {payingFixedEmployee && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-neutral-100 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900">
                    Pagar Sueldo Fijo Mensual
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Periodo: {selectedMonthLabel} ({fixedSalaryMonthKey})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPayingFixedEmployee(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {fixedPayError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{fixedPayError}</span>
              </div>
            )}

            {/* Datos del empleado */}
            <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-indigo-950 block">{payingFixedEmployee.nombre}</span>
                  <span className="text-[11px] text-indigo-700 font-medium uppercase">{payingFixedEmployee.puesto} • {restaurantMap.get(payingFixedEmployee.restaurantId) || 'Sucursal'}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-indigo-500 uppercase font-bold block">Sueldo a Liquidar</span>
                  <span className="text-xl font-black text-indigo-950 font-mono">${(payingFixedEmployee.sueldoMensual || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Selector de Método de Pago */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                Método de Pago:
              </label>
              <select
                value={fixedPayMethod}
                onChange={(e) => setFixedPayMethod(e.target.value as any)}
                className="w-full h-10 px-3 rounded-xl border border-neutral-300 font-bold text-xs text-neutral-800 focus:ring-2 focus:ring-indigo-500 outline-hidden"
              >
                <option value="transferencia">🏦 Transferencia Bancaria</option>
                <option value="efectivo">💵 Efectivo (Caja Chica / Salón)</option>
                <option value="tarjeta">💳 Tarjeta / Depósito</option>
                <option value="otro">🧾 Cheque / Otro</option>
              </select>
            </div>

            {/* Notas opcionales */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                Notas / Glosa de Pago:
              </label>
              <input
                type="text"
                placeholder={`Liquidación sueldo ${selectedMonthLabel} transferido`}
                value={fixedPayNotes}
                onChange={(e) => setFixedPayNotes(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs text-neutral-800 focus:ring-2 focus:ring-indigo-500 outline-hidden"
              />
            </div>

            <p className="text-[10px] text-neutral-500">
              ℹ️ Al confirmar, se creará un gasto de tipo <strong className="text-neutral-800">sueldo</strong> de ${(payingFixedEmployee.sueldoMensual || 0).toFixed(2)}, se actualizará el dailyStats de hoy y el mes <strong className="text-neutral-800">{fixedSalaryMonthKey}</strong> quedará marcado como pagado.
            </p>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setPayingFixedEmployee(null)}
                className="py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessingFixedPay}
                onClick={async () => {
                  if (!payingFixedEmployee) return;
                  setIsProcessingFixedPay(true);
                  setFixedPayError(null);
                  try {
                    const res = await payFixedSalaryExpense({
                      employee: payingFixedEmployee,
                      monthKey: fixedSalaryMonthKey,
                      monthLabel: selectedMonthLabel,
                      amount: payingFixedEmployee.sueldoMensual || 0,
                      userDisplayName: currentUserName,
                      paymentMethod: fixedPayMethod,
                      notes: fixedPayNotes
                    });

                    if (!res.success) {
                      setFixedPayError(res.error || 'Error al procesar el pago');
                    } else {
                      sounds.playCashRegister();
                      setSalarySuccessToast(`¡Sueldo fijo de ${selectedMonthLabel} pagado a ${payingFixedEmployee.nombre} exitosamente!`);
                      setPayingFixedEmployee(null);
                      setFixedPayNotes('');
                      setTimeout(() => setSalarySuccessToast(null), 5000);
                    }
                  } catch (err: any) {
                    setFixedPayError(err.message || 'Error inesperado al pagar sueldo');
                  } finally {
                    setIsProcessingFixedPay(false);
                  }
                }}
                className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{isProcessingFixedPay ? 'Procesando...' : 'Confirmar y Pagar'}</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
