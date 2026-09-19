import React, { useState, useMemo } from 'react';
import { MenuItem, Order, Restaurant } from '../types';
import { 
  TrendingUp, 
  DollarSign, 
  Percent, 
  AlertTriangle, 
  ChefHat, 
  Search, 
  ArrowUpDown, 
  Download, 
  CheckCircle2, 
  HelpCircle,
  Edit2,
  UtensilsCrossed,
  Filter
} from 'lucide-react';

interface DishCostProfitReportProps {
  menuItems: MenuItem[];
  orders: Order[];
  restaurants: Restaurant[];
  currentRestaurant?: Restaurant | null;
  onEditDish?: (item: MenuItem) => void;
}

export const DishCostProfitReport: React.FC<DishCostProfitReportProps> = ({
  menuItems,
  orders,
  restaurants,
  currentRestaurant,
  onEditDish
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMarginFilter, setSelectedMarginFilter] = useState<'all' | 'high' | 'medium' | 'low' | 'loss' | 'nocost'>('all');
  const [sortBy, setSortBy] = useState<'marginDesc' | 'marginAsc' | 'costDesc' | 'priceDesc' | 'salesDesc' | 'profitDesc'>('marginDesc');

  // Categories present in the menu
  const categories = useMemo(() => {
    const cats = new Set<string>();
    menuItems.forEach(item => {
      if (item.categoria) cats.add(item.categoria);
    });
    return Array.from(cats);
  }, [menuItems]);

  // Aggregate real sales counts per menuItem across completed orders
  const salesMap = useMemo(() => {
    const map = new Map<string, { unitsSold: number; revenue: number }>();
    const paidOrders = orders.filter(o => o.estado === 'cobrado');

    paidOrders.forEach(order => {
      order.items?.forEach(item => {
        const key = item.menuItemId || item.nombre;
        const current = map.get(key) || { unitsSold: 0, revenue: 0 };
        map.set(key, {
          unitsSold: current.unitsSold + (item.cantidad || 1),
          revenue: current.revenue + (item.subtotal || ((item.cantidad || 1) * item.precio))
        });
      });
    });

    return map;
  }, [orders]);

  // Compute metrics for each dish
  const enrichedDishes = useMemo(() => {
    return menuItems.map(item => {
      const price = item.precio || 0;
      const cost = item.costoElaboracion || 0;
      const hasCost = typeof item.costoElaboracion === 'number' && item.costoElaboracion > 0;
      
      const profitMargin$ = price - cost;
      const profitMarginPercent = price > 0 ? (profitMargin$ / price) * 100 : 0;
      const foodCostPercent = price > 0 ? (cost / price) * 100 : 0;

      // Real sales data
      const sales = salesMap.get(item.id) || salesMap.get(item.nombre) || { unitsSold: 0, revenue: 0 };
      const totalUnitsSold = sales.unitsSold;
      const totalRevenue = totalUnitsSold * price;
      const totalCost = totalUnitsSold * cost;
      const totalNetProfit = totalRevenue - totalCost;

      // Status classification
      let marginStatus: 'high' | 'medium' | 'low' | 'loss' | 'nocost' = 'nocost';
      if (!hasCost) {
        marginStatus = 'nocost';
      } else if (profitMargin$ < 0) {
        marginStatus = 'loss';
      } else if (profitMarginPercent >= 65) {
        marginStatus = 'high';
      } else if (profitMarginPercent >= 40) {
        marginStatus = 'medium';
      } else {
        marginStatus = 'low';
      }

      return {
        ...item,
        price,
        cost,
        hasCost,
        profitMargin$,
        profitMarginPercent,
        foodCostPercent,
        totalUnitsSold,
        totalRevenue,
        totalCost,
        totalNetProfit,
        marginStatus
      };
    });
  }, [menuItems, salesMap]);

  // Filter & Sort
  const filteredDishes = useMemo(() => {
    return enrichedDishes.filter(dish => {
      // Search
      const matchSearch = 
        dish.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dish.descripcion.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchSearch) return false;

      // Category
      if (selectedCategory !== 'all' && dish.categoria !== selectedCategory) return false;

      // Margin filter
      if (selectedMarginFilter !== 'all') {
        if (selectedMarginFilter === 'nocost' && dish.hasCost) return false;
        if (selectedMarginFilter !== 'nocost' && dish.marginStatus !== selectedMarginFilter) return false;
      }

      return true;
    }).sort((a, b) => {
      switch (sortBy) {
        case 'marginDesc':
          return b.profitMarginPercent - a.profitMarginPercent;
        case 'marginAsc':
          return a.profitMarginPercent - b.profitMarginPercent;
        case 'costDesc':
          return b.cost - a.cost;
        case 'priceDesc':
          return b.price - a.price;
        case 'salesDesc':
          return b.totalUnitsSold - a.totalUnitsSold;
        case 'profitDesc':
          return b.totalNetProfit - a.totalNetProfit;
        default:
          return 0;
      }
    });
  }, [enrichedDishes, searchTerm, selectedCategory, selectedMarginFilter, sortBy]);

  // Global KPIs
  const kpis = useMemo(() => {
    const dishesWithCost = enrichedDishes.filter(d => d.hasCost);
    const totalDishes = enrichedDishes.length;
    const countWithCost = dishesWithCost.length;

    const avgMarginPercent = countWithCost > 0
      ? dishesWithCost.reduce((acc, d) => acc + d.profitMarginPercent, 0) / countWithCost
      : 0;

    const avgFoodCostPercent = countWithCost > 0
      ? dishesWithCost.reduce((acc, d) => acc + d.foodCostPercent, 0) / countWithCost
      : 0;

    const totalRealizedRevenue = enrichedDishes.reduce((acc, d) => acc + d.totalRevenue, 0);
    const totalRealizedCost = enrichedDishes.reduce((acc, d) => acc + d.totalCost, 0);
    const totalRealizedProfit = totalRealizedRevenue - totalRealizedCost;

    const lowMarginDishes = enrichedDishes.filter(d => d.marginStatus === 'low' || d.marginStatus === 'loss').length;

    return {
      totalDishes,
      countWithCost,
      countMissingCost: totalDishes - countWithCost,
      avgMarginPercent,
      avgFoodCostPercent,
      totalRealizedRevenue,
      totalRealizedCost,
      totalRealizedProfit,
      lowMarginDishes
    };
  }, [enrichedDishes]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Plato',
      'Categoria',
      'Precio Venta ($)',
      'Costo Elaboracion ($)',
      'Margen Bruto ($)',
      'Margen Utilidad (%)',
      'Food Cost (%)',
      'Unidades Vendidas',
      'Ingreso Total ($)',
      'Costo Total Incurrido ($)',
      'Ganancia Neta Real ($)'
    ];

    const rows = filteredDishes.map(d => [
      `"${d.nombre.replace(/"/g, '""')}"`,
      `"${(d.categoria || '').replace(/"/g, '""')}"`,
      d.price.toFixed(2),
      d.cost.toFixed(2),
      d.profitMargin$.toFixed(2),
      d.profitMarginPercent.toFixed(1) + '%',
      d.foodCostPercent.toFixed(1) + '%',
      d.totalUnitsSold,
      d.totalRevenue.toFixed(2),
      d.totalCost.toFixed(2),
      d.totalNetProfit.toFixed(2)
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_costos_menu_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-neutral-200">
        <div>
          <h2 className="text-lg font-black text-neutral-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-600" />
            Reporte de Costo de Elaboración y Margen de Utilidad
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Análisis de rentabilidad gastronómica (Food Cost) comparando el costo de preparación frente al precio de venta.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Promedio Margen de Utilidad */}
        <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-1">
            <span className="text-xs font-bold">Margen Bruto Promedio</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600">
            {kpis.avgMarginPercent.toFixed(1)}%
          </div>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Sobre {kpis.countWithCost} platos con costo
          </p>
        </div>

        {/* Food Cost Promedio */}
        <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-1">
            <span className="text-xs font-bold">Food Cost Promedio</span>
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <ChefHat className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-600">
            {kpis.avgFoodCostPercent.toFixed(1)}%
          </div>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Meta recomendada: 28% - 35%
          </p>
        </div>

        {/* Utilidad Neta Real Acumulada */}
        <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-1">
            <span className="text-xs font-bold">Ganancia Neta Real</span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-blue-600">
            ${kpis.totalRealizedProfit.toFixed(2)}
          </div>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            En base a ventas cobradas
          </p>
        </div>

        {/* Platos en Riesgo / Sin Costo */}
        <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 mb-1">
            <span className="text-xs font-bold">Alertas y Auditoría</span>
            <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-neutral-900 flex items-baseline gap-1.5">
            <span className={kpis.lowMarginDishes > 0 ? 'text-rose-600' : 'text-neutral-700'}>
              {kpis.lowMarginDishes}
            </span>
            <span className="text-xs font-medium text-neutral-400">bajos /</span>
            <span className="text-sm font-bold text-amber-600">{kpis.countMissingCost} sin costo</span>
          </div>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            {kpis.countMissingCost > 0 ? 'Edita los platos para fijar costo' : 'Todos los platos tienen costo'}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Buscar por nombre o ingrediente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-neutral-200 text-xs font-medium outline-none focus:border-orange-500"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-neutral-200 text-xs font-bold outline-none focus:border-orange-500 bg-white"
            >
              <option value="all">Todas las Categorías ({categories.length})</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Margin Status Filter */}
          <div>
            <select
              value={selectedMarginFilter}
              onChange={(e) => setSelectedMarginFilter(e.target.value as any)}
              className="w-full h-10 px-3 rounded-xl border border-neutral-200 text-xs font-bold outline-none focus:border-orange-500 bg-white"
            >
              <option value="all">Todos los Márgenes</option>
              <option value="high">🟢 Margen Alto (&gt;= 65%)</option>
              <option value="medium">🟡 Margen Saludable (40% - 64%)</option>
              <option value="low">🟠 Margen Bajo (&lt; 40%)</option>
              <option value="loss">🔴 En Pérdida (Costo &gt; Precio)</option>
              <option value="nocost">⚪ Sin Costo Registrado</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full h-10 px-3 rounded-xl border border-neutral-200 text-xs font-bold outline-none focus:border-orange-500 bg-white"
            >
              <option value="marginDesc">Ordenar: Mayor Margen (%)</option>
              <option value="marginAsc">Ordenar: Menor Margen (%)</option>
              <option value="costDesc">Ordenar: Mayor Costo Elaboración ($)</option>
              <option value="priceDesc">Ordenar: Mayor Precio Venta ($)</option>
              <option value="salesDesc">Ordenar: Más Vendidos (Unidades)</option>
              <option value="profitDesc">Ordenar: Mayor Ganancia Neta ($)</option>
            </select>
          </div>
        </div>

        {/* Quick summary line */}
        <div className="flex items-center justify-between text-xs text-neutral-500 pt-1">
          <span>Mostrando <strong>{filteredDishes.length}</strong> de {menuItems.length} platillos</span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> &gt;65% Óptimo</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> 40-64% Saludable</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span> &lt;40% Alerta</span>
          </div>
        </div>
      </div>

      {/* Main Dishes Table */}
      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase text-[10px] border-b border-neutral-200">
              <tr>
                <th className="p-3">Platillo & Categoría</th>
                <th className="p-3 text-right">PVP (Venta)</th>
                <th className="p-3 text-right">Costo Elaboración</th>
                <th className="p-3 text-right">Ganancia Bruta</th>
                <th className="p-3 text-center">Margen (%)</th>
                <th className="p-3 text-center">Food Cost (%)</th>
                <th className="p-3 text-right">Vendidos</th>
                <th className="p-3 text-right">Utilidad Total</th>
                <th className="p-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-neutral-700">
              {filteredDishes.map(dish => {
                const isLoss = dish.profitMargin$ < 0;
                const isHealthy = dish.profitMarginPercent >= 40;
                const isHigh = dish.profitMarginPercent >= 65;

                return (
                  <tr key={dish.id} className="hover:bg-neutral-50/70 transition">
                    {/* Name & category */}
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-neutral-100 border border-neutral-200 overflow-hidden shrink-0 flex items-center justify-center">
                          {dish.fotoUrl || dish.imagenUrl ? (
                            <img
                              src={dish.fotoUrl || dish.imagenUrl!}
                              alt={dish.nombre}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <UtensilsCrossed className="w-4 h-4 text-neutral-400" />
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-neutral-900">{dish.nombre}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-neutral-100 text-neutral-600 uppercase">
                              {dish.categoria}
                            </span>
                            {dish.requiereCocina ? (
                              <span className="text-[10px] text-orange-600 font-semibold">Cocina</span>
                            ) : (
                              <span className="text-[10px] text-emerald-600 font-semibold">Express</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Precio Venta */}
                    <td className="p-3 text-right font-mono font-bold text-neutral-900 text-sm">
                      ${dish.price.toFixed(2)}
                    </td>

                    {/* Costo de Elaboración */}
                    <td className="p-3 text-right">
                      {dish.hasCost ? (
                        <div className="font-mono font-bold text-amber-700">
                          ${dish.cost.toFixed(2)}
                        </div>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-500">
                          Sin registrar
                        </span>
                      )}
                    </td>

                    {/* Ganancia Bruta ($) */}
                    <td className="p-3 text-right">
                      {dish.hasCost ? (
                        <div className={`font-mono font-black ${isLoss ? 'text-rose-600' : 'text-emerald-700'}`}>
                          ${dish.profitMargin$.toFixed(2)}
                        </div>
                      ) : (
                        <span className="text-neutral-400 font-mono">-</span>
                      )}
                    </td>

                    {/* Margen de Utilidad (%) */}
                    <td className="p-3 text-center">
                      {dish.hasCost ? (
                        <div className="flex flex-col items-center">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                            isLoss
                              ? 'bg-rose-100 text-rose-800'
                              : isHigh
                              ? 'bg-emerald-100 text-emerald-800'
                              : isHealthy
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {dish.profitMarginPercent.toFixed(1)}%
                          </span>
                          {/* Mini Progress Bar */}
                          <div className="w-16 h-1.5 bg-neutral-100 rounded-full mt-1 overflow-hidden">
                            <div
                              className={`h-full ${
                                isLoss ? 'bg-rose-500' : isHigh ? 'bg-emerald-500' : isHealthy ? 'bg-amber-500' : 'bg-orange-500'
                              }`}
                              style={{ width: `${Math.max(0, Math.min(100, dish.profitMarginPercent))}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-neutral-400 text-xs">-</span>
                      )}
                    </td>

                    {/* Food Cost % */}
                    <td className="p-3 text-center">
                      {dish.hasCost ? (
                        <span className="font-mono text-xs font-bold text-neutral-600">
                          {dish.foodCostPercent.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                    </td>

                    {/* Unidades Vendidas */}
                    <td className="p-3 text-right font-mono text-xs">
                      <span className="font-bold text-neutral-800">{dish.totalUnitsSold}</span>
                      <span className="text-neutral-400 text-[10px] ml-1">uds</span>
                    </td>

                    {/* Utilidad Real Acumulada */}
                    <td className="p-3 text-right">
                      {dish.hasCost && dish.totalUnitsSold > 0 ? (
                        <div className="font-mono font-black text-emerald-700">
                          +${dish.totalNetProfit.toFixed(2)}
                        </div>
                      ) : (
                        <span className="text-neutral-400 font-mono">$0.00</span>
                      )}
                    </td>

                    {/* Acción / Editar */}
                    <td className="p-3 text-center">
                      {onEditDish && (
                        <button
                          type="button"
                          onClick={() => onEditDish(dish)}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-100 hover:bg-orange-50 hover:text-orange-700 text-neutral-600 text-xs font-bold flex items-center justify-center gap-1 mx-auto transition cursor-pointer"
                          title="Ajustar precio o costo de elaboración"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Editar</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredDishes.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-neutral-400">
                    No se encontraron platillos con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
