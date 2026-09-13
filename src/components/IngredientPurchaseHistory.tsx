import React, { useState, useMemo } from 'react';
import { Expense, Restaurant, PurchaseItem } from '../types';
import { 
  TrendingUp, 
  TrendingDown, 
  Store, 
  Calendar, 
  DollarSign, 
  Receipt, 
  Search, 
  Eye, 
  X, 
  Award, 
  Scale, 
  Sparkles,
  ArrowUpDown,
  Filter,
  Package
} from 'lucide-react';

interface IngredientPurchaseHistoryProps {
  expenses: Expense[];
  restaurants: Restaurant[];
  selectedBranchId?: string;
  onClose?: () => void;
}

interface FlattenedPurchase {
  id: string;
  gastoId: string;
  insumo: string;
  insumoNormalizado: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  subtotal: number;
  fecha: string;
  proveedor: string;
  proveedorTelefono?: string;
  restaurantId: string;
  metodoPago?: string;
  comprobanteUrl?: string;
  notas?: string;
}

export const IngredientPurchaseHistory: React.FC<IngredientPurchaseHistoryProps> = ({
  expenses,
  restaurants,
  selectedBranchId,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedIngredient, setSelectedIngredient] = useState<string>('');
  const [groupBy, setGroupBy] = useState<'semana' | 'mes' | 'detalle'>('semana');
  const [activeReceiptPhoto, setActiveReceiptPhoto] = useState<string | null>(null);

  const restMap = useMemo(() => new Map(restaurants.map(r => [r.id, r.nombre])), [restaurants]);

  // Aplanar todos los items comprados registrados en expenses
  const allPurchases = useMemo(() => {
    const list: FlattenedPurchase[] = [];

    expenses.forEach(exp => {
      // Filtrar por sucursal si está seleccionada
      if (selectedBranchId && selectedBranchId !== 'all' && exp.restaurantId !== selectedBranchId) {
        return;
      }

      const fechaStr = (exp.fecha || exp.creadoEn || '').split('T')[0];
      const prov = exp.proveedor || 'Proveedor no especificado';

      // 1. Si tiene itemsCompra estructurados (nuevo formato)
      if (exp.itemsCompra && exp.itemsCompra.length > 0) {
        exp.itemsCompra.forEach((it, idx) => {
          if (!it.nombre) return;
          const cleanName = it.nombre.trim();
          list.push({
            id: `${exp.id}_${idx}`,
            gastoId: exp.id,
            insumo: cleanName,
            insumoNormalizado: cleanName.toLowerCase(),
            cantidad: Number(it.cantidad) || 0,
            unidad: it.unidad || 'unidades',
            precioUnitario: Number(it.precioUnitario) || 0,
            subtotal: Number(it.subtotal) || 0,
            fecha: fechaStr,
            proveedor: prov,
            proveedorTelefono: exp.proveedorTelefono,
            restaurantId: exp.restaurantId,
            metodoPago: exp.metodoPago,
            comprobanteUrl: exp.comprobanteUrl,
            notas: exp.notas
          });
        });
      } else if (exp.tipo === 'viveres' || exp.tipo === 'insumos') {
        // Fallback para gastos anteriores de víveres sin desglose de items
        const cleanName = exp.descripcion || 'Víveres Generales';
        list.push({
          id: `${exp.id}_gen`,
          gastoId: exp.id,
          insumo: cleanName,
          insumoNormalizado: cleanName.toLowerCase(),
          cantidad: 1,
          unidad: 'compra',
          precioUnitario: exp.monto,
          subtotal: exp.monto,
          fecha: fechaStr,
          proveedor: prov,
          restaurantId: exp.restaurantId,
          metodoPago: exp.metodoPago,
          comprobanteUrl: exp.comprobanteUrl,
          notas: exp.notas
        });
      }
    });

    return list;
  }, [expenses, selectedBranchId]);

  // Lista única de insumos con estadísticas rápidas
  const uniqueIngredients = useMemo(() => {
    const map = new Map<string, { displayName: string; count: number; totalGastado: number; unidades: Set<string> }>();

    allPurchases.forEach(p => {
      const key = p.insumoNormalizado;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.totalGastado += p.subtotal;
        existing.unidades.add(p.unidad);
      } else {
        map.set(key, {
          displayName: p.insumo,
          count: 1,
          totalGastado: p.subtotal,
          unidades: new Set([p.unidad])
        });
      }
    });

    return Array.from(map.entries())
      .map(([key, data]) => ({
        key,
        name: data.displayName,
        count: data.count,
        totalGastado: Math.round(data.totalGastado * 100) / 100,
        unidades: Array.from(data.unidades).join(', ')
      }))
      .sort((a, b) => b.totalGastado - a.totalGastado);
  }, [allPurchases]);

  // Seleccionar automáticamente el insumo más comprado si no hay uno seleccionado
  React.useEffect(() => {
    if (!selectedIngredient && uniqueIngredients.length > 0) {
      setSelectedIngredient(uniqueIngredients[0].key);
    }
  }, [uniqueIngredients, selectedIngredient]);

  // Filtrar insumos disponibles según el término de búsqueda
  const filteredIngredientList = useMemo(() => {
    if (!searchTerm.trim()) return uniqueIngredients;
    const q = searchTerm.toLowerCase();
    return uniqueIngredients.filter(i => i.name.toLowerCase().includes(q));
  }, [uniqueIngredients, searchTerm]);

  // Compras del insumo seleccionado
  const selectedPurchases = useMemo(() => {
    if (!selectedIngredient) return [];
    return allPurchases
      .filter(p => p.insumoNormalizado === selectedIngredient)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [allPurchases, selectedIngredient]);

  // Métricas avanzadas del insumo seleccionado para negociar precios
  const stats = useMemo(() => {
    if (selectedPurchases.length === 0) return null;

    const totalGastado = selectedPurchases.reduce((acc, p) => acc + p.subtotal, 0);
    const totalCantidad = selectedPurchases.reduce((acc, p) => acc + p.cantidad, 0);
    const primaryUnit = selectedPurchases[0]?.unidad || 'kg';

    const prices = selectedPurchases.map(p => p.precioUnitario).filter(pr => pr > 0);
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const avgPrice = totalCantidad > 0 ? totalGastado / totalCantidad : 0;

    // Ahorro potencial al comprar siempre al mejor precio vs promedio
    const ahorroPotencial = totalCantidad * (avgPrice - minPrice);

    // Desglose por Proveedor
    const supplierMap = new Map<string, {
      proveedor: string;
      telefono?: string;
      compras: number;
      cantidadTotal: number;
      montoTotal: number;
      precios: number[];
      ultimaFecha: string;
      ultimoPrecio: number;
    }>();

    selectedPurchases.forEach(p => {
      const suppKey = p.proveedor;
      const ex = supplierMap.get(suppKey);
      if (ex) {
        ex.compras += 1;
        ex.cantidadTotal += p.cantidad;
        ex.montoTotal += p.subtotal;
        ex.precios.push(p.precioUnitario);
        if (new Date(p.fecha).getTime() > new Date(ex.ultimaFecha).getTime()) {
          ex.ultimaFecha = p.fecha;
          ex.ultimoPrecio = p.precioUnitario;
        }
      } else {
        supplierMap.set(suppKey, {
          proveedor: p.proveedor,
          telefono: p.proveedorTelefono,
          compras: 1,
          cantidadTotal: p.cantidad,
          montoTotal: p.subtotal,
          precios: [p.precioUnitario],
          ultimaFecha: p.fecha,
          ultimoPrecio: p.precioUnitario
        });
      }
    });

    const supplierRanking = Array.from(supplierMap.values()).map(s => {
      const avg = s.cantidadTotal > 0 ? s.montoTotal / s.cantidadTotal : 0;
      return {
        ...s,
        precioPromedio: Math.round(avg * 100) / 100,
        esMejorPrecio: avg <= minPrice + 0.001
      };
    }).sort((a, b) => a.precioPromedio - b.precioPromedio);

    return {
      totalGastado: Math.round(totalGastado * 100) / 100,
      totalCantidad: Math.round(totalCantidad * 10) / 10,
      primaryUnit,
      avgPrice: Math.round(avgPrice * 100) / 100,
      minPrice,
      maxPrice,
      spreadPrice: Math.round((maxPrice - minPrice) * 100) / 100,
      ahorroPotencial: Math.round(ahorroPotencial * 100) / 100,
      supplierRanking
    };
  }, [selectedPurchases]);

  // Agrupación por semana o mes
  const groupedPurchases = useMemo(() => {
    if (selectedPurchases.length === 0) return [];

    const map = new Map<string, {
      periodo: string;
      startDate: string;
      comprasCount: number;
      cantidadTotal: number;
      montoTotal: number;
      proveedores: Set<string>;
      items: FlattenedPurchase[];
    }>();

    selectedPurchases.forEach(p => {
      const date = new Date(p.fecha);
      let key = '';

      if (groupBy === 'mes') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (groupBy === 'semana') {
        // Calcular número de semana
        const onejan = new Date(date.getFullYear(), 0, 1);
        const weekNum = Math.ceil((((date.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
        key = `${date.getFullYear()}-S${String(weekNum).padStart(2, '0')}`;
      } else {
        key = p.fecha;
      }

      const ex = map.get(key);
      if (ex) {
        ex.comprasCount += 1;
        ex.cantidadTotal += p.cantidad;
        ex.montoTotal += p.subtotal;
        ex.proveedores.add(p.proveedor);
        ex.items.push(p);
      } else {
        map.set(key, {
          periodo: key,
          startDate: p.fecha,
          comprasCount: 1,
          cantidadTotal: p.cantidad,
          montoTotal: p.subtotal,
          proveedores: new Set([p.proveedor]),
          items: [p]
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [selectedPurchases, groupBy]);

  return (
    <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden animate-in fade-in duration-150">
      
      {/* HEADER DE LA SECCIÓN */}
      <div className="px-6 py-5 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shadow-inner">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black tracking-tight">
              Historial de Compras por Insumo
            </h2>
            <p className="text-xs text-emerald-100 font-medium">
              Analiza evolución de precios por semana/mes y compara proveedores para negociar
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* PANEL IZQUIERDO: SELECTOR / BUSCADOR DE INSUMOS (COL-4) */}
        <div className="lg:col-span-4 space-y-3">
          
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-emerald-600" />
              <span>Elegir Insumo ({uniqueIngredients.length})</span>
            </label>
          </div>

          {/* Barra de búsqueda de insumo */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Buscar insumo (ej. Pescado fresco)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-neutral-300 bg-neutral-50 text-xs font-bold text-neutral-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
            />
          </div>

          {/* Lista de insumos registrados */}
          <div className="max-h-[500px] overflow-y-auto space-y-1.5 pr-1">
            {filteredIngredientList.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-500 bg-neutral-50 rounded-2xl border border-neutral-200">
                No se encontraron insumos con compras registradas.
              </div>
            ) : (
              filteredIngredientList.map((item) => {
                const isSelected = selectedIngredient === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedIngredient(item.key)}
                    className={`w-full p-3 rounded-2xl text-left transition flex items-center justify-between cursor-pointer border ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-300 shadow-xs'
                        : 'bg-white hover:bg-neutral-50 border-neutral-200/80'
                    }`}
                  >
                    <div>
                      <div className={`text-xs font-black capitalize ${isSelected ? 'text-emerald-950' : 'text-neutral-800'}`}>
                        {item.name}
                      </div>
                      <div className="text-[10px] text-neutral-500 mt-0.5 font-medium">
                        {item.count} {item.count === 1 ? 'compra' : 'compras'} ({item.unidades})
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs font-black font-mono ${isSelected ? 'text-emerald-800' : 'text-neutral-900'}`}>
                        ${item.totalGastado.toFixed(2)}
                      </div>
                      <span className={`text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded ${
                        isSelected ? 'bg-emerald-600 text-white' : 'bg-neutral-100 text-neutral-600'
                      }`}>
                        {isSelected ? 'Activo' : 'Ver'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* PANEL DERECHO: ANÁLISIS, PROVEEDORES Y EVOLUCIÓN TEMPORAL (COL-8) */}
        <div className="lg:col-span-8 space-y-6">
          
          {stats ? (
            <>
              {/* 1. HEADER DEL INSUMO SELECCIONADO CON KPIs CLAVE */}
              <div className="bg-neutral-50 rounded-2xl border border-neutral-200 p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-4 border-b border-neutral-200/80">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                      Insumo en análisis
                    </span>
                    <h3 className="text-xl font-black capitalize text-neutral-900 mt-1">
                      {selectedPurchases[0]?.insumo}
                    </h3>
                  </div>

                  {/* Selector de agrupación temporal */}
                  <div className="inline-flex p-1 bg-white rounded-xl border border-neutral-200 shadow-xs">
                    {(['semana', 'mes', 'detalle'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setGroupBy(mode)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition capitalize cursor-pointer ${
                          groupBy === mode
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-neutral-600 hover:text-neutral-900'
                        }`}
                      >
                        {mode === 'detalle' ? 'Cada Compra' : `Por ${mode}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* TARJETAS DE KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
                  
                  {/* Total gastado */}
                  <div className="bg-white p-3 rounded-xl border border-neutral-200/80 shadow-xs">
                    <div className="text-[10px] font-extrabold uppercase text-neutral-500">Inversión Total</div>
                    <div className="text-base sm:text-lg font-black font-mono text-neutral-900 mt-0.5">
                      ${stats.totalGastado.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-neutral-500 font-semibold mt-0.5">
                      {stats.totalCantidad} {stats.primaryUnit} comprados
                    </div>
                  </div>

                  {/* Precio promedio ponderado */}
                  <div className="bg-white p-3 rounded-xl border border-neutral-200/80 shadow-xs">
                    <div className="text-[10px] font-extrabold uppercase text-neutral-500">Precio Promedio</div>
                    <div className="text-base sm:text-lg font-black font-mono text-blue-700 mt-0.5">
                      ${stats.avgPrice.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-neutral-500 font-semibold mt-0.5">
                      por {stats.primaryUnit}
                    </div>
                  </div>

                  {/* Mejor precio conseguido */}
                  <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-xs bg-emerald-50/40">
                    <div className="text-[10px] font-extrabold uppercase text-emerald-700 flex items-center gap-1">
                      <Award className="w-3 h-3" />
                      <span>Mejor Precio</span>
                    </div>
                    <div className="text-base sm:text-lg font-black font-mono text-emerald-800 mt-0.5">
                      ${stats.minPrice.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                      mínimo registrado
                    </div>
                  </div>

                  {/* Rango de dispersión / Oportunidad de negociación */}
                  <div className="bg-white p-3 rounded-xl border border-neutral-200/80 shadow-xs">
                    <div className="text-[10px] font-extrabold uppercase text-neutral-500">Precio Máximo</div>
                    <div className="text-base sm:text-lg font-black font-mono text-rose-700 mt-0.5">
                      ${stats.maxPrice.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
                      Margen: +${stats.spreadPrice.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Banner de recomendación para negociación */}
                {stats.supplierRanking.length > 1 && stats.spreadPrice > 0 && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Clave para negociar precios: </span>
                      Comprando exclusivamente al proveedor más económico (
                      <span className="font-extrabold text-amber-950">{stats.supplierRanking[0]?.proveedor}</span> a ${stats.minPrice.toFixed(2)}/{stats.primaryUnit}
                      ), el negocio ahorraría hasta <span className="font-extrabold font-mono text-emerald-700">${stats.ahorroPotencial.toFixed(2)}</span> en este insumo.
                    </div>
                  </div>
                )}
              </div>

              {/* 2. COMPARATIVA DE PROVEEDORES */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Comparativa por Proveedor</span>
                  </label>
                  <span className="text-xs text-neutral-500 font-medium">
                    {stats.supplierRanking.length} {stats.supplierRanking.length === 1 ? 'proveedor' : 'proveedores'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {stats.supplierRanking.map((supp, sIdx) => (
                    <div
                      key={sIdx}
                      className={`p-4 rounded-2xl border transition relative ${
                        supp.esMejorPrecio
                          ? 'bg-emerald-50/70 border-emerald-300 shadow-xs'
                          : 'bg-white border-neutral-200'
                      }`}
                    >
                      {supp.esMejorPrecio && (
                        <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 bg-emerald-600 text-white rounded-full text-[9px] font-extrabold uppercase">
                          <Award className="w-3 h-3" />
                          <span>Mejor Precio</span>
                        </div>
                      )}

                      <div className="text-xs font-black text-neutral-900 truncate pr-20">
                        {supp.proveedor}
                      </div>

                      {supp.telefono && (
                        <div className="text-[11px] text-neutral-500 font-medium mt-0.5">
                          📞 {supp.telefono}
                        </div>
                      )}

                      <div className="mt-3 grid grid-cols-2 gap-2 pt-2 border-t border-neutral-200/60">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-neutral-500">Precio Promedio</div>
                          <div className="text-sm font-black font-mono text-neutral-900">
                            ${supp.precioPromedio.toFixed(2)}
                            <span className="text-[10px] text-neutral-500 font-normal">/{stats.primaryUnit}</span>
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase font-bold text-neutral-500">Último Precio</div>
                          <div className="text-sm font-black font-mono text-neutral-900">
                            ${supp.ultimoPrecio.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 text-[10px] text-neutral-500 flex items-center justify-between">
                        <span>{supp.compras} compras ({supp.cantidadTotal} {stats.primaryUnit})</span>
                        <span className="font-mono font-bold">${supp.montoTotal.toFixed(2)} total</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. EVOLUCIÓN TEMPORAL / HISTORIAL CRONOLÓGICO */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>Evolución de Compras {groupBy === 'detalle' ? 'Detallada' : `por ${groupBy}`}</span>
                  </label>
                </div>

                {groupBy === 'detalle' ? (
                  // Vista de cada compra individual
                  <div className="overflow-x-auto rounded-2xl border border-neutral-200">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-neutral-100 text-[10px] font-extrabold uppercase tracking-wider text-neutral-600 border-b border-neutral-200">
                          <th className="p-3">Fecha</th>
                          <th className="p-3">Sucursal</th>
                          <th className="p-3">Proveedor</th>
                          <th className="p-3 text-right">Cantidad</th>
                          <th className="p-3 text-right">Precio Unit.</th>
                          <th className="p-3 text-right">Subtotal</th>
                          <th className="p-3 text-center">Ticket</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200/80 bg-white">
                        {selectedPurchases.map((pur) => (
                          <tr key={pur.id} className="hover:bg-neutral-50 transition">
                            <td className="p-3 font-mono font-bold text-neutral-700">{pur.fecha}</td>
                            <td className="p-3 text-neutral-800">{restMap.get(pur.restaurantId) || 'General'}</td>
                            <td className="p-3 font-semibold text-neutral-900">{pur.proveedor}</td>
                            <td className="p-3 text-right font-mono">
                              {pur.cantidad} {pur.unidad}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-neutral-800">
                              ${pur.precioUnitario.toFixed(2)}
                            </td>
                            <td className="p-3 text-right font-mono font-black text-emerald-800">
                              ${pur.subtotal.toFixed(2)}
                            </td>
                            <td className="p-3 text-center">
                              {pur.comprobanteUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setActiveReceiptPhoto(pur.comprobanteUrl!)}
                                  className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                                  title="Ver foto del ticket"
                                >
                                  <Eye className="w-4 h-4 inline" />
                                </button>
                              ) : (
                                <span className="text-neutral-300">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  // Vista agrupada por semana o mes
                  <div className="space-y-2">
                    {groupedPurchases.map((grp) => {
                      const avgPeriodPrice = grp.cantidadTotal > 0 ? grp.montoTotal / grp.cantidadTotal : 0;
                      return (
                        <div
                          key={grp.periodo}
                          className="bg-white p-3.5 rounded-2xl border border-neutral-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-neutral-900 uppercase">
                                {groupBy === 'semana' ? `Semana ${grp.periodo}` : `Mes ${grp.periodo}`}
                              </span>
                              <span className="text-[10px] text-neutral-500 font-medium">
                                ({grp.comprasCount} {grp.comprasCount === 1 ? 'compra' : 'compras'})
                              </span>
                            </div>
                            <div className="text-[11px] text-neutral-600 mt-0.5">
                              Proveedores: <span className="font-semibold">{Array.from(grp.proveedores).join(', ')}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-neutral-100">
                            <div className="text-left sm:text-right">
                              <div className="text-[10px] text-neutral-500 uppercase font-bold">Cantidad</div>
                              <div className="text-xs font-mono font-bold text-neutral-800">
                                {grp.cantidadTotal} {stats.primaryUnit}
                              </div>
                            </div>

                            <div className="text-left sm:text-right">
                              <div className="text-[10px] text-neutral-500 uppercase font-bold">Precio Promedio</div>
                              <div className="text-xs font-mono font-bold text-blue-700">
                                ${avgPeriodPrice.toFixed(2)}/{stats.primaryUnit}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-[10px] text-neutral-500 uppercase font-bold">Gasto Total</div>
                              <div className="text-sm font-mono font-black text-emerald-800">
                                ${grp.montoTotal.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </>
          ) : (
            <div className="p-12 text-center text-xs text-neutral-500 bg-neutral-50 rounded-3xl border border-neutral-200">
              Selecciona un insumo en la lista izquierda para visualizar su historial de compras y análisis de precios.
            </div>
          )}

        </div>

      </div>

      {/* MODAL DE VISTA PREVIA DE FOTO DEL TICKET/COMPROBANTE */}
      {activeReceiptPhoto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
              <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <span>Comprobante de Compra</span>
              </h4>
              <button
                onClick={() => setActiveReceiptPhoto(null)}
                className="text-neutral-400 hover:text-neutral-700 p-1"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto rounded-xl bg-neutral-100 flex items-center justify-center">
              <img
                src={activeReceiptPhoto}
                alt="Ticket de compra"
                className="max-w-full h-auto object-contain rounded-lg"
              />
            </div>

            <button
              type="button"
              onClick={() => setActiveReceiptPhoto(null)}
              className="w-full h-10 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold transition"
            >
              Cerrar Comprobante
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
