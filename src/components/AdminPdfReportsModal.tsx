import React, { useState, useMemo } from 'react';
import { 
  X, 
  FileDown, 
  Printer, 
  Boxes, 
  ReceiptText, 
  Filter, 
  Building2, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowDownCircle, 
  DollarSign, 
  Layers,
  Sparkles,
  Search
} from 'lucide-react';
import { MenuItem, CashRegisterClose, Restaurant } from '../types';
import { downloadInventoryPdf, downloadCashClosuresPdf } from '../utils/adminReportsPdf';
import { sounds } from '../utils/sound';

interface AdminPdfReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'inventario' | 'cierres';
  menuItems: MenuItem[];
  cashCloses: CashRegisterClose[];
  restaurants: Restaurant[];
  businessName: string;
  currentUserName: string;
}

export const AdminPdfReportsModal: React.FC<AdminPdfReportsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'inventario',
  menuItems,
  cashCloses,
  restaurants,
  businessName,
  currentUserName
}) => {
  const [activeReportTab, setActiveReportTab] = useState<'inventario' | 'cierres'>(initialTab);

  // Common filters
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');

  // Inventory filters
  const [stockFilterMode, setStockFilterMode] = useState<'all' | 'controlled' | 'low_depleted'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [inventorySearch, setInventorySearch] = useState<string>('');

  // Cash Closures filters
  const [closuresPeriod, setClosuresPeriod] = useState<'today' | '7days' | '30days' | 'this_month' | 'all'>('7days');
  const [cashierFilter, setCashierFilter] = useState<string>('all');

  // Unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    menuItems.forEach(i => {
      if (i.categoria) set.add(i.categoria);
    });
    return Array.from(set).sort();
  }, [menuItems]);

  // Unique cashiers
  const uniqueCashiers = useMemo(() => {
    const set = new Set<string>();
    cashCloses.forEach(c => {
      if (c.cajeroNombre) set.add(c.cajeroNombre);
    });
    return Array.from(set).sort();
  }, [cashCloses]);

  // Selected Branch Name
  const selectedBranchName = useMemo(() => {
    if (selectedBranchId === 'all') return 'Todas las Sedes / Consolidado Global';
    const r = restaurants.find(rest => rest.id === selectedBranchId);
    return r?.nombre || 'Sede Seleccionada';
  }, [selectedBranchId, restaurants]);

  // Filtered Menu Items
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter(item => {
      // Branch filter
      if (selectedBranchId !== 'all') {
        if (item.restaurantId && item.restaurantId !== selectedBranchId) return false;
      }

      // Stock status filter
      if (stockFilterMode === 'controlled' && !item.controlaStock) return false;
      if (stockFilterMode === 'low_depleted') {
        if (!item.controlaStock) return false;
        const stock = item.stockActual ?? 0;
        const min = item.stockMinimo ?? 5;
        if (stock > min) return false;
      }

      // Category filter
      if (categoryFilter !== 'all' && item.categoria !== categoryFilter) return false;

      // Text search
      if (inventorySearch.trim()) {
        const query = inventorySearch.toLowerCase();
        const matchName = item.nombre.toLowerCase().includes(query);
        const matchCat = (item.categoria || '').toLowerCase().includes(query);
        if (!matchName && !matchCat) return false;
      }

      return true;
    });
  }, [menuItems, selectedBranchId, stockFilterMode, categoryFilter, inventorySearch]);

  // Inventory KPIs
  const inventoryKpis = useMemo(() => {
    const controlled = filteredMenuItems.filter(i => i.controlaStock === true);
    const depleted = controlled.filter(i => (i.stockActual ?? 0) <= 0);
    const critical = controlled.filter(i => (i.stockActual ?? 0) > 0 && (i.stockActual ?? 0) <= (i.stockMinimo ?? 5));
    const healthy = controlled.filter(i => (i.stockActual ?? 0) > (i.stockMinimo ?? 5));
    
    const valCost = controlled.reduce((sum, i) => sum + ((i.stockActual ?? 0) * (i.costoElaboracion || 0)), 0);
    const valPrice = controlled.reduce((sum, i) => sum + ((i.stockActual ?? 0) * i.precio), 0);

    return {
      total: filteredMenuItems.length,
      controlledCount: controlled.length,
      depletedCount: depleted.length,
      criticalCount: critical.length,
      healthyCount: healthy.length,
      valCost,
      valPrice
    };
  }, [filteredMenuItems]);

  // Filtered Cash Closures
  const filteredCashCloses = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(startOfToday.getTime() - (7 * 24 * 60 * 60 * 1000));
    const thirtyDaysAgo = new Date(startOfToday.getTime() - (30 * 24 * 60 * 60 * 1000));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return cashCloses.filter(close => {
      // Branch
      if (selectedBranchId !== 'all' && close.restaurantId !== selectedBranchId) return false;

      // Cashier
      if (cashierFilter !== 'all' && close.cajeroNombre !== cashierFilter) return false;

      // Period
      if (closuresPeriod !== 'all') {
        const closeDate = new Date(close.fecha || close.creadoEn);
        if (closuresPeriod === 'today' && closeDate < startOfToday) return false;
        if (closuresPeriod === '7days' && closeDate < sevenDaysAgo) return false;
        if (closuresPeriod === '30days' && closeDate < thirtyDaysAgo) return false;
        if (closuresPeriod === 'this_month' && closeDate < startOfMonth) return false;
      }

      return true;
    });
  }, [cashCloses, selectedBranchId, cashierFilter, closuresPeriod]);

  // Closures KPIs
  const closuresKpis = useMemo(() => {
    const totalCloses = filteredCashCloses.length;
    const totalOrders = filteredCashCloses.reduce((sum, c) => sum + (c.totalPedidosCobrados || 0), 0);
    const totalExpected = filteredCashCloses.reduce((sum, c) => sum + (c.totalEsperado || 0), 0);
    const totalReal = filteredCashCloses.reduce((sum, c) => sum + (c.totalReal || 0), 0);
    const netDiff = filteredCashCloses.reduce((sum, c) => sum + (c.diferencia || 0), 0);
    const totalCash = filteredCashCloses.reduce((sum, c) => sum + (c.conteoRealEfectivo || 0), 0);
    const totalCard = filteredCashCloses.reduce((sum, c) => sum + (c.conteoRealTarjeta || 0), 0);
    const totalTransf = filteredCashCloses.reduce((sum, c) => sum + (c.conteoRealTransferencia || 0), 0);

    return {
      totalCloses,
      totalOrders,
      totalExpected,
      totalReal,
      netDiff,
      totalCash,
      totalCard,
      totalTransf
    };
  }, [filteredCashCloses]);

  // Handle direct PDF download
  const handleDownloadPdf = () => {
    sounds.playCashRegister();

    if (activeReportTab === 'inventario') {
      const filterStockLabel = stockFilterMode === 'all' 
        ? 'Todos los platos' 
        : stockFilterMode === 'controlled' 
        ? 'Solo con control de stock' 
        : 'Solo stock crítico / agotado';

      const filterCatLabel = categoryFilter === 'all' ? 'Todas las categorías' : categoryFilter;

      downloadInventoryPdf({
        businessName,
        selectedBranchName,
        generatedBy: currentUserName,
        items: filteredMenuItems,
        filterStockLabel,
        filterCategoryLabel: filterCatLabel
      });
    } else {
      const periodLabelMap: Record<string, string> = {
        today: 'Hoy',
        '7days': 'Últimos 7 días',
        '30days': 'Últimos 30 días',
        this_month: 'Este Mes',
        all: 'Historial Completo'
      };

      downloadCashClosuresPdf({
        businessName,
        selectedBranchName,
        generatedBy: currentUserName,
        periodLabel: periodLabelMap[closuresPeriod] || 'Periodo seleccionado',
        closes: filteredCashCloses,
        restaurants
      });
    }
  };

  const handlePrint = () => {
    sounds.playKeypadClick();
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:fixed print:inset-0">
      <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-0 print:rounded-none">
        
        {/* MODAL HEADER (Hidden on print) */}
        <div className="bg-neutral-900 text-white px-5 py-4 flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-600/30 border border-purple-400/40 text-purple-300 flex items-center justify-center font-black">
              <FileDown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                Exportación de Reportes PDF Oficiales
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-400/30 uppercase font-black">
                  A4 Landscape Vector
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Descarga o imprime informes contables de existencias e historial de arqueos de caja
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="h-9 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-xs flex items-center gap-2 shadow-md hover:shadow-purple-500/20 transition active:scale-95 cursor-pointer"
              title="Descargar archivo PDF directamente a tu dispositivo"
            >
              <FileDown className="w-4 h-4" />
              <span>Descargar PDF</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="h-9 px-3.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer border border-neutral-700"
              title="Imprimir o guardar como PDF en alta resolución con el navegador"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimir A4</span>
            </button>

            <button
              type="button"
              onClick={() => { sounds.playKeypadClick(); onClose(); }}
              className="w-9 h-9 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition ml-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* REPORT SELECTOR TABS & FILTERS BAR (Hidden on print) */}
        <div className="bg-neutral-50 border-b border-neutral-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          {/* Sub-tab selection */}
          <div className="flex bg-neutral-200/70 p-1 rounded-2xl gap-1">
            <button
              type="button"
              onClick={() => { sounds.playKeypadClick(); setActiveReportTab('inventario'); }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                activeReportTab === 'inventario'
                  ? 'bg-white text-purple-950 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Boxes className="w-4 h-4 text-purple-600" />
              <span>Reporte de Inventario & Stock ({filteredMenuItems.length})</span>
            </button>

            <button
              type="button"
              onClick={() => { sounds.playKeypadClick(); setActiveReportTab('cierres'); }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                activeReportTab === 'cierres'
                  ? 'bg-white text-emerald-950 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <ReceiptText className="w-4 h-4 text-emerald-600" />
              <span>Reporte Cierres de Caja ({filteredCashCloses.length})</span>
            </button>
          </div>

          {/* Sede selector */}
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-neutral-400" />
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="h-8 px-2.5 rounded-xl border border-neutral-200 bg-white text-xs font-bold text-neutral-800 shadow-2xs focus:ring-2 focus:ring-purple-500/20"
            >
              <option value="all">Todas las Sedes / Consolidado</option>
              {restaurants.map(r => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        {/* CONTEXTUAL FILTERS ROW (Hidden on print) */}
        <div className="bg-white px-5 py-2.5 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 print:hidden">
          {activeReportTab === 'inventario' ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-neutral-500 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" />
                  Filtrar Estado:
                </span>
                <div className="flex bg-neutral-100 p-0.5 rounded-xl border border-neutral-200">
                  <button
                    type="button"
                    onClick={() => setStockFilterMode('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition ${
                      stockFilterMode === 'all' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockFilterMode('controlled')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition ${
                      stockFilterMode === 'controlled' ? 'bg-white text-purple-700 shadow-xs' : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    Con Stock ({inventoryKpis.controlledCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockFilterMode('low_depleted')}
                    className={`px-2.5 py-1 rounded-lg font-black transition ${
                      stockFilterMode === 'low_depleted' ? 'bg-red-600 text-white shadow-xs' : 'text-red-700 hover:bg-red-50'
                    }`}
                  >
                    Crítico / Agotado ({inventoryKpis.depletedCount + inventoryKpis.criticalCount})
                  </button>
                </div>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-7 px-2 rounded-lg border border-neutral-200 bg-white font-bold text-neutral-700"
                >
                  <option value="all">Todas las Categorías</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar plato..."
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className="w-full h-7 pl-8 pr-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-xs text-neutral-800 placeholder:text-neutral-400"
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-neutral-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Periodo:
                </span>
                <div className="flex bg-neutral-100 p-0.5 rounded-xl border border-neutral-200">
                  <button
                    type="button"
                    onClick={() => setClosuresPeriod('today')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition ${
                      closuresPeriod === 'today' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    onClick={() => setClosuresPeriod('7days')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition ${
                      closuresPeriod === '7days' ? 'bg-white text-emerald-800 shadow-xs' : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    Últimos 7 Días
                  </button>
                  <button
                    type="button"
                    onClick={() => setClosuresPeriod('30days')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition ${
                      closuresPeriod === '30days' ? 'bg-white text-emerald-800 shadow-xs' : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    Últimos 30 Días
                  </button>
                  <button
                    type="button"
                    onClick={() => setClosuresPeriod('this_month')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition ${
                      closuresPeriod === 'this_month' ? 'bg-white text-emerald-800 shadow-xs' : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    Este Mes
                  </button>
                  <button
                    type="button"
                    onClick={() => setClosuresPeriod('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition ${
                      closuresPeriod === 'all' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    Todos
                  </button>
                </div>

                <select
                  value={cashierFilter}
                  onChange={(e) => setCashierFilter(e.target.value)}
                  className="h-7 px-2 rounded-lg border border-neutral-200 bg-white font-bold text-neutral-700"
                >
                  <option value="all">Todos los Cajeros</option>
                  {uniqueCashiers.map(cashier => (
                    <option key={cashier} value={cashier}>{cashier}</option>
                  ))}
                </select>
              </div>

              <div className="text-xs font-bold text-neutral-500">
                {filteredCashCloses.length} cierres registrados en el periodo
              </div>
            </>
          )}
        </div>

        {/* REPORT CONTENT BODY (Scrollable & Printable) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 print:overflow-visible print:p-8">
          
          {/* PRINT-ONLY HEADER */}
          <div className="hidden print:block border-b border-neutral-300 pb-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight text-neutral-900">
                  {businessName || 'GASTRO SMART'}
                </h1>
                <p className="text-xs text-neutral-600">Sede: {selectedBranchName}</p>
              </div>
              <div className="text-right">
                <h2 className="text-sm font-black text-purple-800 uppercase">
                  {activeReportTab === 'inventario' ? 'REPORTE OFICIAL DE INVENTARIO Y STOCK' : 'REPORTE OFICIAL DE CIERRES DE CAJA Y ARQUEOS'}
                </h2>
                <p className="text-[10px] text-neutral-500">
                  Fecha: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-[10px] text-neutral-500">Generado por: {currentUserName}</p>
              </div>
            </div>
          </div>

          {/* TAB 1: REPORTE DE INVENTARIO */}
          {activeReportTab === 'inventario' && (
            <div className="space-y-4">
              
              {/* Executive KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="bg-neutral-50 border border-neutral-200 p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Total Carta</div>
                  <div className="text-lg font-black text-neutral-900">{inventoryKpis.total}</div>
                  <div className="text-[10px] text-neutral-400">Platos listados</div>
                </div>

                <div className="bg-purple-50 border border-purple-200 p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">Con Control Stock</div>
                  <div className="text-lg font-black text-purple-900">{inventoryKpis.controlledCount}</div>
                  <div className="text-[10px] text-purple-600">Monitoreados</div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Stock Saludable</div>
                  <div className="text-lg font-black text-emerald-900">{inventoryKpis.healthyCount}</div>
                  <div className="text-[10px] text-emerald-600">&gt; Stock mínimo</div>
                </div>

                <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Stock Crítico</div>
                  <div className="text-lg font-black text-amber-900">{inventoryKpis.criticalCount}</div>
                  <div className="text-[10px] text-amber-600">Alerta reposición</div>
                </div>

                <div className="bg-red-50 border border-red-200 p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Agotados (0)</div>
                  <div className="text-lg font-black text-red-900">{inventoryKpis.depletedCount}</div>
                  <div className="text-[10px] text-red-600">Sin existencias</div>
                </div>

                <div className="bg-neutral-900 text-white p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Valor Inventario</div>
                  <div className="text-lg font-black text-emerald-400">${inventoryKpis.valCost.toFixed(2)}</div>
                  <div className="text-[10px] text-neutral-400">PVP: ${inventoryKpis.valPrice.toFixed(2)}</div>
                </div>
              </div>

              {/* Inventory Table */}
              <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-900 text-white uppercase text-[10px] font-black">
                      <tr>
                        <th className="p-3 text-center">#</th>
                        <th className="p-3">Plato / Producto</th>
                        <th className="p-3">Categoría</th>
                        <th className="p-3 text-center">Área</th>
                        <th className="p-3 text-right">Stock Actual</th>
                        <th className="p-3 text-right">Stock Mín.</th>
                        <th className="p-3 text-center">Estado</th>
                        <th className="p-3 text-right">Costo Elab.</th>
                        <th className="p-3 text-right">PVP Venta</th>
                        <th className="p-3 text-right">Valor Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-neutral-700 font-medium">
                      {filteredMenuItems.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-8 text-center text-neutral-400 italic">
                            No se encontraron platos que coincidan con los filtros aplicados.
                          </td>
                        </tr>
                      ) : (
                        filteredMenuItems.map((item, index) => {
                          const isControlled = item.controlaStock === true;
                          const stock = item.stockActual ?? 0;
                          const minStock = item.stockMinimo ?? 5;
                          const unit = item.unidadMedida || 'unid.';
                          const cost = item.costoElaboracion || 0;
                          const totalVal = isControlled ? stock * cost : 0;
                          
                          const isDepleted = isControlled && stock <= 0;
                          const isLow = isControlled && stock > 0 && stock <= minStock;

                          return (
                            <tr key={item.id} className="hover:bg-neutral-50/60 transition">
                              <td className="p-3 text-center text-neutral-400 font-mono text-[11px]">{index + 1}</td>
                              <td className="p-3 font-bold text-neutral-900">
                                <div>{item.nombre}</div>
                                {item.disponible === false && (
                                  <span className="text-[10px] font-bold text-red-600">(No disponible)</span>
                                )}
                              </td>
                              <td className="p-3 text-neutral-600">{item.categoria || 'General'}</td>
                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                  item.requiereCocina ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {item.requiereCocina ? 'Cocina' : 'Express'}
                                </span>
                              </td>
                              <td className="p-3 text-right font-bold">
                                {isControlled ? (
                                  <span className={isDepleted ? 'text-red-600 font-black' : isLow ? 'text-amber-600 font-black' : 'text-neutral-900'}>
                                    {stock} {unit}
                                  </span>
                                ) : (
                                  <span className="text-neutral-400 italic">Sin control</span>
                                )}
                              </td>
                              <td className="p-3 text-right text-neutral-500 font-mono">
                                {isControlled ? minStock : '-'}
                              </td>
                              <td className="p-3 text-center">
                                {isControlled ? (
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                    isDepleted 
                                      ? 'bg-red-600 text-white' 
                                      : isLow 
                                      ? 'bg-amber-500 text-white' 
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}>
                                    {isDepleted ? 'Agotado' : isLow ? 'Crítico' : 'Saludable'}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-neutral-400 italic">Libre</span>
                                )}
                              </td>
                              <td className="p-3 text-right font-mono text-neutral-600">
                                {cost > 0 ? `$${cost.toFixed(2)}` : '-'}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-neutral-900">
                                ${item.precio.toFixed(2)}
                              </td>
                              <td className="p-3 text-right font-mono font-black text-purple-900">
                                ${totalVal.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot className="bg-purple-50 border-t-2 border-purple-200 font-black text-xs text-purple-950">
                      <tr>
                        <td colSpan={7} className="p-3 text-right uppercase tracking-wider">
                          Totales de Inventario ({inventoryKpis.controlledCount} monitoreados):
                        </td>
                        <td colSpan={3} className="p-3 text-right font-mono text-sm">
                          Valor al Costo: ${inventoryKpis.valCost.toFixed(2)} | PVP: ${inventoryKpis.valPrice.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: REPORTE DE CIERRES DE CAJA */}
          {activeReportTab === 'cierres' && (
            <div className="space-y-4">
              
              {/* Closures KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="bg-neutral-50 border border-neutral-200 p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Cierres Totales</div>
                  <div className="text-lg font-black text-neutral-900">{closuresKpis.totalCloses}</div>
                  <div className="text-[10px] text-neutral-400">{closuresKpis.totalOrders} pedidos</div>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Total Esperado</div>
                  <div className="text-lg font-black text-blue-900">${closuresKpis.totalExpected.toFixed(2)}</div>
                  <div className="text-[10px] text-blue-600">Sistema / Comandas</div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Total Real Contado</div>
                  <div className="text-lg font-black text-emerald-900">${closuresKpis.totalReal.toFixed(2)}</div>
                  <div className="text-[10px] text-emerald-600">Arqueo físico</div>
                </div>

                <div className={`p-3 rounded-2xl border ${
                  Math.abs(closuresKpis.netDiff) < 0.01 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                    : closuresKpis.netDiff > 0 
                    ? 'bg-amber-50 border-amber-200 text-amber-900' 
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}>
                  <div className="text-[10px] font-bold uppercase tracking-wider">Descuadre Neto</div>
                  <div className="text-lg font-black">
                    {closuresKpis.netDiff >= 0 ? `+$${closuresKpis.netDiff.toFixed(2)}` : `-$${Math.abs(closuresKpis.netDiff).toFixed(2)}`}
                  </div>
                  <div className="text-[10px]">
                    {Math.abs(closuresKpis.netDiff) < 0.01 ? 'Cajas cuadradas' : closuresKpis.netDiff > 0 ? 'Sobrante global' : 'Faltante global'}
                  </div>
                </div>

                <div className="bg-neutral-50 border border-neutral-200 p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider">Efectivo Real</div>
                  <div className="text-lg font-black text-neutral-900">${closuresKpis.totalCash.toFixed(2)}</div>
                  <div className="text-[10px] text-neutral-400">Caja física</div>
                </div>

                <div className="bg-neutral-900 text-white p-3 rounded-2xl">
                  <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Tarjetas & Transf.</div>
                  <div className="text-lg font-black text-emerald-400">
                    ${(closuresKpis.totalCard + closuresKpis.totalTransf).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    Tarj: ${closuresKpis.totalCard.toFixed(0)} | Trans: ${closuresKpis.totalTransf.toFixed(0)}
                  </div>
                </div>
              </div>

              {/* Closures Table */}
              <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-900 text-white uppercase text-[10px] font-black">
                      <tr>
                        <th className="p-3 text-center">#</th>
                        <th className="p-3">Fecha y Hora</th>
                        <th className="p-3">Cajero</th>
                        <th className="p-3">Sede</th>
                        <th className="p-3 text-right">Fondo Inicial</th>
                        <th className="p-3 text-right">Esperado</th>
                        <th className="p-3 text-right">Real Efectivo</th>
                        <th className="p-3 text-right">Real Digital</th>
                        <th className="p-3 text-right">Total Real</th>
                        <th className="p-3 text-right">Diferencia</th>
                        <th className="p-3 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-neutral-700 font-medium">
                      {filteredCashCloses.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="p-8 text-center text-neutral-400 italic">
                            No se encontraron cierres de caja en el rango seleccionado.
                          </td>
                        </tr>
                      ) : (
                        filteredCashCloses.map((close, index) => {
                          const rest = restaurants.find(r => r.id === close.restaurantId);
                          const digitalReal = (close.conteoRealTarjeta || 0) + (close.conteoRealTransferencia || 0);
                          const diff = close.diferencia || 0;
                          const isSquare = Math.abs(diff) < 0.01;
                          const isSurplus = diff > 0.01;

                          return (
                            <tr key={close.id} className="hover:bg-neutral-50/60 transition">
                              <td className="p-3 text-center text-neutral-400 font-mono text-[11px]">{index + 1}</td>
                              <td className="p-3 font-bold text-neutral-900 whitespace-nowrap">
                                <div>{new Date(close.fecha || close.creadoEn).toLocaleDateString()}</div>
                                <div className="text-[10px] text-neutral-400 font-normal">
                                  {new Date(close.fecha || close.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </td>
                              <td className="p-3 font-bold text-neutral-800">{close.cajeroNombre}</td>
                              <td className="p-3 text-neutral-600">{rest?.nombre || 'Sede Principal'}</td>
                              <td className="p-3 text-right font-mono text-neutral-600">
                                ${(close.montoInicial || 0).toFixed(2)}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-neutral-900">
                                ${(close.totalEsperado || 0).toFixed(2)}
                              </td>
                              <td className="p-3 text-right font-mono text-neutral-700">
                                ${(close.conteoRealEfectivo || 0).toFixed(2)}
                              </td>
                              <td className="p-3 text-right font-mono text-neutral-700">
                                ${digitalReal.toFixed(2)}
                              </td>
                              <td className="p-3 text-right font-mono font-black text-emerald-800">
                                ${(close.totalReal || 0).toFixed(2)}
                              </td>
                              <td className={`p-3 text-right font-mono font-black ${
                                isSquare ? 'text-emerald-700' : isSurplus ? 'text-amber-600' : 'text-red-600'
                              }`}>
                                {diff >= 0 ? `+$${diff.toFixed(2)}` : `-$${Math.abs(diff).toFixed(2)}`}
                              </td>
                              <td className="p-3 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                  isSquare 
                                    ? 'bg-emerald-100 text-emerald-800' 
                                    : isSurplus 
                                    ? 'bg-amber-100 text-amber-800' 
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {isSquare ? 'Cuadrada' : isSurplus ? 'Sobrante' : 'Faltante'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot className="bg-emerald-50 border-t-2 border-emerald-200 font-black text-xs text-emerald-950">
                      <tr>
                        <td colSpan={5} className="p-3 text-right uppercase tracking-wider">
                          Totales de Cierre ({filteredCashCloses.length} turnos):
                        </td>
                        <td className="p-3 text-right font-mono">
                          ${closuresKpis.totalExpected.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono">
                          ${closuresKpis.totalCash.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono">
                          ${(closuresKpis.totalCard + closuresKpis.totalTransf).toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono text-sm font-black text-emerald-900">
                          ${closuresKpis.totalReal.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono font-black">
                          {closuresKpis.netDiff >= 0 ? `+$${closuresKpis.netDiff.toFixed(2)}` : `-$${Math.abs(closuresKpis.netDiff).toFixed(2)}`}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* MODAL FOOTER (Hidden on print) */}
        <div className="bg-neutral-50 px-5 py-3 border-t border-neutral-200 flex items-center justify-between shrink-0 print:hidden">
          <div className="text-xs text-neutral-500">
            Formato oficial A4 horizontal (Landscape) con validación contable y encabezado corporativo.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { sounds.playKeypadClick(); onClose(); }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-600 hover:bg-neutral-200/60 transition cursor-pointer"
            >
              Cerrar
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-xs flex items-center gap-2 shadow-md transition active:scale-95 cursor-pointer"
            >
              <FileDown className="w-4 h-4" />
              <span>Descargar PDF Ahora</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
