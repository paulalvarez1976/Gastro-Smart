import React, { useState, useMemo } from 'react';
import { 
  MenuAuditLog, 
  MenuAuditActionType, 
  Employee, 
  Restaurant, 
  MenuItem 
} from '../types';
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  Download, 
  Calendar, 
  Clock, 
  User, 
  Boxes, 
  Edit3, 
  ToggleLeft, 
  PlusCircle, 
  Trash2, 
  FileSpreadsheet, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  ArrowRight,
  Eye
} from 'lucide-react';

interface MenuAuditLogsTableProps {
  logs: MenuAuditLog[];
  employees: Employee[];
  restaurants: Restaurant[];
  menuItems: MenuItem[];
  onSeedDemoLogs?: () => void;
  isLoading?: boolean;
}

export const MenuAuditLogsTable: React.FC<MenuAuditLogsTableProps> = ({
  logs,
  employees,
  restaurants,
  menuItems,
  onSeedDemoLogs,
  isLoading = false
}) => {
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<'all' | 'today' | '7days' | '30days' | 'custom'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>('all');
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);

  // Modal de detalles extendidos
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<MenuAuditLog | null>(null);

  // Formateadores de fecha y hora
  const formatExactDateTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch {
      return isoString;
    }
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const diffMs = Date.now() - d.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      if (diffMinutes < 1) return 'Hace un momento';
      if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `Hace ${diffHours} h`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'Ayer';
      if (diffDays < 7) return `Hace ${diffDays} días`;
      return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  // Filtrado de logs
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

    return logs.filter(log => {
      // Filtro de búsqueda por texto libre
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchDish = log.platoNombre?.toLowerCase().includes(query);
        const matchEmp = log.empleadoNombre?.toLowerCase().includes(query);
        const matchDetails = log.detalles?.toLowerCase().includes(query);
        const matchRole = log.empleadoRol?.toLowerCase().includes(query);
        if (!matchDish && !matchEmp && !matchDetails && !matchRole) return false;
      }

      // Filtro de empleado
      if (selectedEmployee !== 'all') {
        if (log.empleadoNombre !== selectedEmployee && log.empleadoId !== selectedEmployee) {
          return false;
        }
      }

      // Filtro de acción
      if (selectedAction !== 'all') {
        if (log.tipoAccion !== selectedAction) return false;
      }

      // Filtro de restaurante / sede
      if (selectedRestaurant !== 'all') {
        if (log.restaurantId && log.restaurantId !== 'all' && log.restaurantId !== selectedRestaurant) {
          return false;
        }
      }

      // Filtro de rango de fecha
      if (selectedDateRange !== 'all') {
        const logTime = new Date(log.fecha).getTime();
        if (selectedDateRange === 'today' && logTime < startOfToday) return false;
        if (selectedDateRange === '7days' && logTime < sevenDaysAgo) return false;
        if (selectedDateRange === '30days' && logTime < thirtyDaysAgo) return false;
        if (selectedDateRange === 'custom') {
          if (startDate) {
            const startMs = new Date(startDate + 'T00:00:00').getTime();
            if (logTime < startMs) return false;
          }
          if (endDate) {
            const endMs = new Date(endDate + 'T23:59:59').getTime();
            if (logTime > endMs) return false;
          }
        }
      }

      return true;
    });
  }, [logs, searchTerm, selectedEmployee, selectedAction, selectedDateRange, selectedRestaurant]);

  // Paginación
  const totalPages = Math.ceil(filteredLogs.length / rowsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredLogs.slice(start, start + rowsPerPage);
  }, [filteredLogs, currentPage, rowsPerPage]);

  // Lista única de empleados que aparecen en los registros
  const auditEmployees = useMemo(() => {
    const names = new Set<string>();
    logs.forEach(l => {
      if (l.empleadoNombre) names.add(l.empleadoNombre);
    });
    employees.forEach(e => {
      if (e.nombre) names.add(e.nombre);
    });
    return Array.from(names).sort();
  }, [logs, employees]);

  // Métricas rápidas
  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const logsToday = logs.filter(l => new Date(l.fecha).toDateString() === today);
    const stockAdjustments = logs.filter(l => l.tipoAccion === 'ajuste_stock');
    const dishEdits = logs.filter(l => l.tipoAccion === 'modificacion_plato');
    const uniqueStaff = new Set(logs.map(l => l.empleadoNombre)).size;

    return {
      total: logs.length,
      todayCount: logsToday.length,
      stockCount: stockAdjustments.length,
      editsCount: dishEdits.length,
      staffCount: uniqueStaff
    };
  }, [logs]);

  // Exportar a CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      alert('No hay registros de auditoría para exportar con los filtros actuales.');
      return;
    }

    const headers = [
      'Fecha y Hora Exacta',
      'Empleado Responsable',
      'Puesto / Rol',
      'Plato / Producto',
      'Tipo de Acción',
      'Detalle del Cambio',
      'Sede / Local'
    ];

    const escapeCsv = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;

    const rows = filteredLogs.map(log => [
      escapeCsv(formatExactDateTime(log.fecha)),
      escapeCsv(log.empleadoNombre || 'Sin especificar'),
      escapeCsv(log.empleadoRol || 'Personal'),
      escapeCsv(log.platoNombre || 'Plato'),
      escapeCsv(getActionLabel(log.tipoAccion)),
      escapeCsv(log.detalles || ''),
      escapeCsv(log.restaurantNombre || 'Todas las sedes')
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [
      headers.join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\r\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `auditoria_menu_stock_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper visual para tipos de acción
  function getActionBadge(action: MenuAuditActionType) {
    switch (action) {
      case 'ajuste_stock':
        return {
          label: 'Ajuste de Stock',
          icon: Boxes,
          badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          dotColor: 'bg-emerald-500'
        };
      case 'modificacion_plato':
        return {
          label: 'Edición de Plato',
          icon: Edit3,
          badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
          dotColor: 'bg-blue-500'
        };
      case 'cambio_disponibilidad':
        return {
          label: 'Disponibilidad',
          icon: ToggleLeft,
          badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
          dotColor: 'bg-purple-500'
        };
      case 'creacion_plato':
        return {
          label: 'Plato Creado',
          icon: PlusCircle,
          badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          dotColor: 'bg-emerald-600'
        };
      case 'eliminacion_plato':
        return {
          label: 'Plato Eliminado',
          icon: Trash2,
          badgeClass: 'bg-red-50 text-red-800 border-red-200',
          dotColor: 'bg-red-500'
        };
      default:
        return {
          label: 'Cambio en Menú',
          icon: ShieldCheck,
          badgeClass: 'bg-neutral-100 text-neutral-800 border-neutral-200',
          dotColor: 'bg-neutral-500'
        };
    }
  }

  function getActionLabel(action: MenuAuditActionType) {
    switch (action) {
      case 'ajuste_stock': return 'Ajuste de Stock';
      case 'modificacion_plato': return 'Modificación de Plato';
      case 'cambio_disponibilidad': return 'Cambio de Disponibilidad';
      case 'creacion_plato': return 'Creación de Plato';
      case 'eliminacion_plato': return 'Eliminación de Plato';
      default: return 'Cambio en Menú';
    }
  }

  function getRoleBadge(role?: string) {
    const r = (role || '').toLowerCase();
    if (r.includes('admin') || r.includes('owner') || r.includes('dueño')) {
      return 'bg-purple-100 text-purple-800 border-purple-200';
    }
    if (r.includes('caj')) {
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
    if (r.includes('cocin')) {
      return 'bg-orange-100 text-orange-800 border-orange-200';
    }
    if (r.includes('meser')) {
      return 'bg-amber-100 text-amber-800 border-amber-200';
    }
    return 'bg-neutral-100 text-neutral-700 border-neutral-200';
  }

  return (
    <div className="space-y-4">
      {/* TARJETAS DE INDICADORES DE AUDITORÍA */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white rounded-2xl border border-neutral-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-neutral-900 leading-tight">{stats.total}</div>
            <div className="text-[11px] font-bold text-neutral-500">Total Operaciones Auditadas</div>
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-neutral-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-neutral-900 leading-tight">{stats.stockCount}</div>
            <div className="text-[11px] font-bold text-neutral-500">Ajustes de Stock Realizados</div>
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-neutral-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <Edit3 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-neutral-900 leading-tight">{stats.editsCount}</div>
            <div className="text-[11px] font-bold text-neutral-500">Ediciones de Datos / Precios</div>
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-neutral-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-neutral-900 leading-tight">{stats.staffCount}</div>
            <div className="text-[11px] font-bold text-neutral-500">Colaboradores con Registros</div>
          </div>
        </div>
      </div>

      {/* BARRA DE ACCIONES Y FILTROS */}
      <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-800 flex items-center justify-center shrink-0">
              <Filter className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-neutral-900 uppercase tracking-wider">
                Filtros de Auditoría
              </h4>
              <p className="text-[11px] text-neutral-500">
                Visualizando {filteredLogs.length} de {logs.length} registros registrados
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onSeedDemoLogs && logs.length === 0 && (
              <button
                type="button"
                onClick={onSeedDemoLogs}
                className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition flex items-center gap-1.5"
                title="Cargar registros iniciales de demostración"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Generar Registros de Muestra</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Descargar tabla en formato CSV para Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Inputs de filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2 border-t border-neutral-100">
          {/* 1. Búsqueda por texto */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Buscar por plato, empleado o cambio..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-9 pl-9 pr-3 rounded-xl border border-neutral-300 bg-neutral-50 text-xs focus:bg-white focus:outline-orange-500"
            />
          </div>

          {/* 2. Filtro de Empleado */}
          <div>
            <select
              value={selectedEmployee}
              onChange={(e) => {
                setSelectedEmployee(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-9 px-2.5 rounded-xl border border-neutral-300 bg-neutral-50 text-xs font-bold text-neutral-700 focus:bg-white"
            >
              <option value="all">👤 Todos los Empleados ({auditEmployees.length})</option>
              {auditEmployees.map(emp => (
                <option key={emp} value={emp}>
                  {emp}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Filtro de Acción */}
          <div>
            <select
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-9 px-2.5 rounded-xl border border-neutral-300 bg-neutral-50 text-xs font-bold text-neutral-700 focus:bg-white"
            >
              <option value="all">🏷️ Todos los Tipos de Acción</option>
              <option value="ajuste_stock">📦 Ajuste de Stock</option>
              <option value="modificacion_plato">✏️ Modificación de Datos</option>
              <option value="cambio_disponibilidad">🔘 Cambio de Disponibilidad</option>
              <option value="creacion_plato">➕ Alta de Plato</option>
              <option value="eliminacion_plato">🗑️ Eliminación de Plato</option>
            </select>
          </div>

          {/* 4. Filtro de Fecha */}
          <div>
            <select
              value={selectedDateRange}
              onChange={(e) => {
                setSelectedDateRange(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full h-9 px-2.5 rounded-xl border border-neutral-300 bg-neutral-50 text-xs font-bold text-neutral-700 focus:bg-white"
            >
              <option value="all">📅 Todas las Fechas</option>
              <option value="today">📅 Solo Hoy</option>
              <option value="7days">📅 Últimos 7 Días</option>
              <option value="30days">📅 Últimos 30 Días</option>
              <option value="custom">📅 Rango Personalizado...</option>
            </select>
          </div>

          {/* 5. Filtro de Sede */}
          <div>
            <select
              value={selectedRestaurant}
              onChange={(e) => {
                setSelectedRestaurant(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-9 px-2.5 rounded-xl border border-neutral-300 bg-neutral-50 text-xs font-bold text-neutral-700 focus:bg-white"
            >
              <option value="all">🏢 Todas las Sedes</option>
              {restaurants.map(rest => (
                <option key={rest.id} value={rest.id}>
                  {rest.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selector de Rango Personalizado de Fechas */}
        {selectedDateRange === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2.5 px-3 text-xs text-neutral-600 bg-neutral-50 rounded-xl border border-neutral-200 mt-2">
            <span className="font-bold flex items-center gap-1.5 text-neutral-800">
              <Calendar className="w-4 h-4 text-orange-600" />
              Filtrar por Periodo Específico:
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-500 font-medium">Desde:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-8 px-2.5 rounded-lg border border-neutral-300 bg-white text-xs font-mono font-bold text-neutral-800"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-500 font-medium">Hasta:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-8 px-2.5 rounded-lg border border-neutral-300 bg-white text-xs font-mono font-bold text-neutral-800"
              />
            </div>
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-orange-600 hover:text-orange-800 font-bold text-[11px] underline cursor-pointer ml-auto"
              >
                Limpiar fechas
              </button>
            )}
          </div>
        )}

        {/* Limpiar filtros rápidos si hay filtros activos */}
        {(searchTerm || selectedEmployee !== 'all' || selectedAction !== 'all' || selectedDateRange !== 'all' || selectedRestaurant !== 'all') && (
          <div className="flex items-center justify-between text-xs pt-1 text-neutral-500">
            <span>Filtros activos aplicados</span>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedEmployee('all');
                setSelectedAction('all');
                setSelectedDateRange('all');
                setSelectedRestaurant('all');
                setCurrentPage(1);
              }}
              className="text-orange-600 hover:text-orange-700 font-bold underline"
            >
              Limpiar todos los filtros
            </button>
          </div>
        )}
      </div>

      {/* TABLA PRINCIPAL DE AUDITORÍA */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 min-w-[170px]">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Fecha y Hora Exacta</span>
                  </div>
                </th>
                <th className="py-3 px-4 min-w-[180px]">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Empleado Responsable</span>
                  </div>
                </th>
                <th className="py-3 px-4 min-w-[160px]">Plato / Producto</th>
                <th className="py-3 px-4 min-w-[150px]">Acción Realizada</th>
                <th className="py-3 px-4 min-w-[260px]">Detalles y Valores Modificados</th>
                <th className="py-3 px-4 text-center w-16">Ver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-orange-500" />
                    <span>Cargando registros de auditoría en tiempo real...</span>
                  </td>
                </tr>
              ) : paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-500">
                    <div className="max-w-md mx-auto space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div className="font-bold text-neutral-800 text-sm">
                        No se encontraron registros de auditoría
                      </div>
                      <p className="text-xs text-neutral-400">
                        {logs.length === 0 
                          ? 'Aún no hay cambios registrados en el menú o inventario. Cualquier modificación de platos o ajuste de stock que realice un empleado aparecerá aquí automáticamente.'
                          : 'No hay registros que coincidan con los filtros seleccionados.'}
                      </p>
                      {onSeedDemoLogs && logs.length === 0 && (
                        <button
                          type="button"
                          onClick={onSeedDemoLogs}
                          className="mt-3 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition shadow-xs inline-flex items-center gap-2"
                        >
                          <Sparkles className="w-4 h-4" />
                          <span>Cargar Registros de Demostración</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => {
                  const actionMeta = getActionBadge(log.tipoAccion);
                  const ActionIcon = actionMeta.icon;
                  const employeeInitials = (log.empleadoNombre || 'U')
                    .split(' ')
                    .map(p => p[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <tr 
                      key={log.id} 
                      className="hover:bg-neutral-50/80 transition-colors duration-150"
                    >
                      {/* 1. FECHA Y HORA EXACTA */}
                      <td className="py-3 px-4 align-top">
                        <div className="font-black text-neutral-900 tracking-tight text-xs flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span>{formatExactDateTime(log.fecha)}</span>
                        </div>
                        <div className="text-[10px] font-semibold text-neutral-400 ml-5">
                          {formatRelativeTime(log.fecha)}
                        </div>
                      </td>

                      {/* 2. EMPLEADO RESPONSABLE */}
                      <td className="py-3 px-4 align-top">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-neutral-200 text-neutral-700 font-black text-xs flex items-center justify-center shrink-0 border border-neutral-300">
                            {employeeInitials}
                          </div>
                          <div>
                            <div className="font-black text-neutral-900 text-xs">
                              {log.empleadoNombre || 'Personal del Sistema'}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider ${getRoleBadge(log.empleadoRol)}`}>
                                {log.empleadoRol || 'Empleado'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 3. PLATO / PRODUCTO */}
                      <td className="py-3 px-4 align-top">
                        <div className="font-black text-neutral-900 text-xs">
                          {log.platoNombre || 'Plato del Menú'}
                        </div>
                        {log.restaurantNombre && (
                          <div className="text-[10px] text-neutral-500 font-medium mt-0.5">
                            📍 {log.restaurantNombre}
                          </div>
                        )}
                      </td>

                      {/* 4. TIPO DE ACCIÓN */}
                      <td className="py-3 px-4 align-top">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${actionMeta.badgeClass}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${actionMeta.dotColor}`} />
                          <ActionIcon className="w-3.5 h-3.5" />
                          <span>{actionMeta.label}</span>
                        </span>
                      </td>

                      {/* 5. DETALLES Y VALORES MODIFICADOS */}
                      <td className="py-3 px-4 align-top">
                        <div className="text-neutral-700 leading-relaxed font-medium">
                          {log.detalles}
                        </div>

                        {/* Chips con valores previos y nuevos si existen */}
                        {log.cambios && log.cambios.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {log.cambios.map((c, idx) => (
                              <div 
                                key={idx}
                                className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-md text-[10px] font-mono border border-neutral-200"
                              >
                                <span className="font-bold text-neutral-900">{c.campo}:</span>
                                <span className="text-red-700 line-through">
                                  {String(c.valorAnterior ?? 'N/A')}
                                </span>
                                <ArrowRight className="w-2.5 h-2.5 text-neutral-400" />
                                <span className="text-emerald-700 font-bold">
                                  {String(c.valorNuevo ?? 'N/A')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* 6. BOTÓN VER DETALLE */}
                      <td className="py-3 px-4 align-top text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedLogForDetails(log)}
                          className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition"
                          title="Ver detalle completo de este registro"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINACIÓN Y CONTROL DE FILAS */}
        {filteredLogs.length > 0 && (
          <div className="p-3 bg-neutral-50 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-600">
            <div className="flex items-center gap-2">
              <span>Filas por página:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-8 px-2 rounded-lg border border-neutral-300 bg-white font-bold"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>
                Mostrando {Math.min(filteredLogs.length, (currentPage - 1) * rowsPerPage + 1)} - {Math.min(filteredLogs.length, currentPage * rowsPerPage)} de {filteredLogs.length}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="p-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 disabled:opacity-40 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 font-bold text-neutral-900">
                Página {currentPage} de {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="p-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 disabled:opacity-40 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DETALLE EXTENDIDO DE AUDITORÍA */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-neutral-900">Ficha Técnica de Auditoría</h3>
                  <p className="text-xs text-neutral-400 font-mono">ID: {selectedLogForDetails.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLogForDetails(null)}
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 font-bold flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-neutral-50 rounded-2xl border border-neutral-200">
                <div>
                  <span className="text-neutral-400 font-bold block text-[10px] uppercase">Fecha y Hora Exacta</span>
                  <span className="font-black text-neutral-900 text-xs">
                    {formatExactDateTime(selectedLogForDetails.fecha)}
                  </span>
                  <span className="text-neutral-400 block text-[10px]">
                    ({selectedLogForDetails.fecha})
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 font-bold block text-[10px] uppercase">Empleado Responsable</span>
                  <span className="font-black text-neutral-900 text-xs">
                    {selectedLogForDetails.empleadoNombre}
                  </span>
                  <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase mt-0.5 ${getRoleBadge(selectedLogForDetails.empleadoRol)}`}>
                    {selectedLogForDetails.empleadoRol || 'Personal'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400 font-bold text-[10px] uppercase">Plato del Menú</span>
                  <span className="text-neutral-500 font-bold text-[10px]">
                    Sede: {selectedLogForDetails.restaurantNombre || 'Todas las sedes'}
                  </span>
                </div>
                <div className="font-black text-neutral-900 text-sm">
                  {selectedLogForDetails.platoNombre}
                </div>
                <div className="text-neutral-400 font-mono text-[10px]">
                  Plato ID: {selectedLogForDetails.platoId}
                </div>
              </div>

              <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-1.5">
                <span className="text-neutral-400 font-bold text-[10px] uppercase block">Descripción del Evento</span>
                <p className="text-neutral-800 text-xs leading-relaxed font-medium">
                  {selectedLogForDetails.detalles}
                </p>
              </div>

              {selectedLogForDetails.cambios && selectedLogForDetails.cambios.length > 0 && (
                <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-2">
                  <span className="text-neutral-400 font-bold text-[10px] uppercase block">
                    Matriz de Campos Modificados ({selectedLogForDetails.cambios.length})
                  </span>
                  <div className="space-y-1.5">
                    {selectedLogForDetails.cambios.map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-white rounded-xl border border-neutral-200">
                        <span className="font-bold text-neutral-800">{c.campo}</span>
                        <div className="flex items-center gap-2 font-mono text-xs">
                          <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded">
                            {String(c.valorAnterior ?? 'N/A')}
                          </span>
                          <ArrowRight className="w-3 h-3 text-neutral-400" />
                          <span className="text-emerald-700 bg-emerald-50 font-black px-2 py-0.5 rounded">
                            {String(c.valorNuevo ?? 'N/A')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSelectedLogForDetails(null)}
                className="w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl font-bold text-xs transition"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
