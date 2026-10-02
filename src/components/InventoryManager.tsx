import React, { useState, useMemo } from 'react';
import {
  InventoryItem,
  MenuItem,
  Restaurant,
  Order,
  DishIngredient,
  MenuAuditLog,
  DeductedSupplyRecord
} from '../types';
import {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  quickAdjustInventoryItemStock,
  seedDefaultInventoryItemsAndLinkDishes,
  updateMenuItem,
  cambiarEstadoPedido,
  deductStockForOrderItems
} from '../services/dataService';
import { sounds } from '../utils/sound';
import {
  Boxes,
  AlertTriangle,
  PackageX,
  PackageCheck,
  Plus,
  Minus,
  Edit2,
  Trash2,
  Search,
  Sparkles,
  CheckCircle2,
  UtensilsCrossed,
  ArrowRight,
  RefreshCw,
  Loader2,
  X,
  Check,
  PlayCircle,
  ClipboardList,
  Layers,
  Info
} from 'lucide-react';

interface InventoryManagerProps {
  inventoryItems: InventoryItem[];
  menuItems: MenuItem[];
  restaurants: Restaurant[];
  orders: Order[];
  auditLogs: MenuAuditLog[];
  businessId: string;
  currentRestaurantId: string;
  userName: string;
}

const SUPPLY_CATEGORIES = [
  'Carnes y Proteínas',
  'Panadería y Harinas',
  'Lácteos y Quesos',
  'Verduras y Guarniciones',
  'Abarrotes y Salsas',
  'Bebidas',
  'Empaques y Descartables',
  'General'
];

const SUPPLY_UNITS = [
  'porciones',
  'unidades',
  'kg',
  'g',
  'litros',
  'ml',
  'paquetes',
  'latas',
  'botellas'
];

export const InventoryManager: React.FC<InventoryManagerProps> = ({
  inventoryItems,
  menuItems,
  restaurants,
  orders,
  auditLogs,
  businessId,
  currentRestaurantId,
  userName
}) => {
  const [subTab, setSubTab] = useState<'insumos' | 'recetas' | 'movimientos'>('insumos');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'critical' | 'depleted' | 'healthy'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSimulatingDelivery, setIsSimulatingDelivery] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'warning' | 'danger';
    title: string;
    message: string;
    details?: DeductedSupplyRecord[];
  } | null>(null);

  // Modal Crear / Editar Insumo
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [editingSupply, setEditingSupply] = useState<InventoryItem | null>(null);
  const [supplyForm, setSupplyForm] = useState({
    nombre: '',
    categoria: 'Carnes y Proteínas',
    stockActual: 20,
    stockMinimo: 8,
    unidadMedida: 'porciones',
    costoUnitario: 1.0,
    proveedor: '',
    restaurantId: 'all'
  });

  // Modal Configurar Receta de Insumos de un Plato
  const [recipeModalDish, setRecipeModalDish] = useState<MenuItem | null>(null);
  const [recipeDraft, setRecipeDraft] = useState<DishIngredient[]>([]);
  const [selectedSupplyToAdd, setSelectedSupplyToAdd] = useState<string>('');
  const [qtyToAdd, setQtyToAdd] = useState<number>(1);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

  // Inputs manuales de stock rápido
  const [manualStockInputs, setManualStockInputs] = useState<Record<string, string>>({});

  // Métricas e indicadores de umbral crítico
  const depletedSupplies = useMemo(
    () => inventoryItems.filter(i => (Number(i.stockActual) || 0) <= 0),
    [inventoryItems]
  );

  const criticalSupplies = useMemo(
    () =>
      inventoryItems.filter(
        i => (Number(i.stockActual) || 0) > 0 && (Number(i.stockActual) || 0) <= (Number(i.stockMinimo) || 5)
      ),
    [inventoryItems]
  );

  const allAlertSupplies = useMemo(
    () => [...depletedSupplies, ...criticalSupplies],
    [depletedSupplies, criticalSupplies]
  );

  const totalInventoryValue = useMemo(
    () =>
      inventoryItems.reduce(
        (acc, item) => acc + (Number(item.stockActual) || 0) * (Number(item.costoUnitario) || 0),
        0
      ),
    [inventoryItems]
  );

  const dishesWithRecipeCount = useMemo(
    () => menuItems.filter(m => (m.insumosReceta && m.insumosReceta.length > 0) || m.controlaStock).length,
    [menuItems]
  );

  // Filtrado de lista de insumos
  const filteredSupplies = useMemo(() => {
    return inventoryItems
      .filter(item => {
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase().trim();
          const matchName = item.nombre.toLowerCase().includes(q);
          const matchCat = (item.categoria || '').toLowerCase().includes(q);
          const matchProv = (item.proveedor || '').toLowerCase().includes(q);
          if (!matchName && !matchCat && !matchProv) return false;
        }
        if (categoryFilter !== 'all' && item.categoria !== categoryFilter) {
          return false;
        }
        const stock = Number(item.stockActual) || 0;
        const min = Number(item.stockMinimo) || 5;
        if (statusFilter === 'depleted') return stock <= 0;
        if (statusFilter === 'critical') return stock <= min;
        if (statusFilter === 'healthy') return stock > min;
        return true;
      })
      .sort((a, b) => {
        const aStock = Number(a.stockActual) || 0;
        const bStock = Number(b.stockActual) || 0;
        const aMin = Number(a.stockMinimo) || 5;
        const bMin = Number(b.stockMinimo) || 5;
        const aCrit = aStock <= aMin;
        const bCrit = bStock <= bMin;
        if (aCrit && !bCrit) return -1;
        if (!aCrit && bCrit) return 1;
        if (aStock <= 0 && bStock > 0) return -1;
        if (aStock > 0 && bStock <= 0) return 1;
        return a.nombre.localeCompare(b.nombre);
      });
  }, [inventoryItems, searchTerm, categoryFilter, statusFilter]);

  // Movimientos de descuento automático en entregas
  const deliveryDeductionLogs = useMemo(
    () =>
      auditLogs.filter(
        l =>
          l.tipoAccion === 'descuento_automatico_entrega' ||
          l.tipoAccion === 'ajuste_insumo' ||
          l.tipoAccion === 'ajuste_stock'
      ),
    [auditLogs]
  );

  // Abrir modal para nuevo insumo
  const handleOpenNewSupply = () => {
    sounds.playKeypadClick();
    setEditingSupply(null);
    setSupplyForm({
      nombre: '',
      categoria: 'Carnes y Proteínas',
      stockActual: 20,
      stockMinimo: 8,
      unidadMedida: 'porciones',
      costoUnitario: 1.2,
      proveedor: '',
      restaurantId: currentRestaurantId || 'all'
    });
    setShowSupplyModal(true);
  };

  // Abrir modal para editar insumo
  const handleOpenEditSupply = (item: InventoryItem) => {
    sounds.playKeypadClick();
    setEditingSupply(item);
    setSupplyForm({
      nombre: item.nombre,
      categoria: item.categoria || 'General',
      stockActual: Number(item.stockActual) || 0,
      stockMinimo: Number(item.stockMinimo) || 5,
      unidadMedida: item.unidadMedida || 'unidades',
      costoUnitario: Number(item.costoUnitario) || 0,
      proveedor: item.proveedor || '',
      restaurantId: item.restaurantId || 'all'
    });
    setShowSupplyModal(true);
  };

  // Guardar insumo
  const handleSaveSupply = async () => {
    if (!supplyForm.nombre.trim()) return;
    setBusyId('saving_modal');
    try {
      sounds.playKeypadClick();
      if (editingSupply) {
        await updateInventoryItem(editingSupply.id, {
          nombre: supplyForm.nombre.trim(),
          categoria: supplyForm.categoria,
          stockActual: Math.max(0, Number(supplyForm.stockActual) || 0),
          stockMinimo: Math.max(1, Number(supplyForm.stockMinimo) || 1),
          unidadMedida: supplyForm.unidadMedida,
          costoUnitario: Math.max(0, Number(supplyForm.costoUnitario) || 0),
          proveedor: supplyForm.proveedor.trim(),
          restaurantId: supplyForm.restaurantId
        });
        setFeedbackBanner({
          type: 'success',
          title: 'Insumo actualizado',
          message: `Se guardaron los cambios para "${supplyForm.nombre.trim()}".`
        });
      } else {
        await createInventoryItem({
          businessId,
          restaurantId: supplyForm.restaurantId || 'all',
          nombre: supplyForm.nombre.trim(),
          categoria: supplyForm.categoria,
          stockActual: Math.max(0, Number(supplyForm.stockActual) || 0),
          stockMinimo: Math.max(1, Number(supplyForm.stockMinimo) || 1),
          unidadMedida: supplyForm.unidadMedida,
          costoUnitario: Math.max(0, Number(supplyForm.costoUnitario) || 0),
          proveedor: supplyForm.proveedor.trim()
        });
        setFeedbackBanner({
          type: 'success',
          title: 'Nuevo insumo registrado',
          message: `"${supplyForm.nombre.trim()}" fue agregado al inventario con umbral crítico de ${supplyForm.stockMinimo} ${supplyForm.unidadMedida}.`
        });
      }
      sounds.playNotification();
      setShowSupplyModal(false);
      setEditingSupply(null);
    } catch (err: any) {
      console.error('Error guardando insumo:', err);
    } finally {
      setBusyId(null);
    }
  };

  // Ajuste rápido de stock de un insumo
  const handleQuickAdjust = async (item: InventoryItem, delta: number) => {
    setBusyId(item.id);
    try {
      sounds.playKeypadClick();
      const newStock = await quickAdjustInventoryItemStock(item.id, delta, userName, businessId);
      if (newStock <= (item.stockMinimo || 5)) {
        sounds.playAlertWarning();
      } else {
        sounds.playNotification();
      }
    } catch (err) {
      console.error('Error ajustando insumo:', err);
    } finally {
      setBusyId(null);
    }
  };

  // Fijar stock manual directo
  const handleSetExactStock = async (item: InventoryItem) => {
    const raw = manualStockInputs[item.id];
    if (raw === undefined || raw === '') return;
    const val = parseFloat(raw);
    if (isNaN(val) || val < 0) return;

    setBusyId(item.id);
    try {
      sounds.playKeypadClick();
      await updateInventoryItem(item.id, { stockActual: val });
      setManualStockInputs(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      sounds.playNotification();
    } catch (err) {
      console.error('Error fijando stock:', err);
    } finally {
      setBusyId(null);
    }
  };

  // Sembrar insumos base y vincular recetas automáticamente
  const handleSeedInventory = async () => {
    setIsSeeding(true);
    try {
      sounds.playKeypadClick();
      const res = await seedDefaultInventoryItemsAndLinkDishes(
        businessId,
        currentRestaurantId || 'all',
        menuItems
      );
      sounds.playCashRegister();
      setFeedbackBanner({
        type: 'success',
        title: '¡Inventario e Insumos Configurados!',
        message: `Se crearon ${res.createdCount} insumos base y se vincularon recetas de descuento automático a ${res.linkedDishesCount} platos de tu carta.`
      });
    } catch (err: any) {
      console.error('Error sembrando insumos:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  // Probar descuento automático al marcar un pedido como 'entregado'
  const handleSimulateOrderDelivery = async () => {
    setIsSimulatingDelivery(true);
    setFeedbackBanner(null);
    try {
      sounds.playKeypadClick();
      // Si aún no hay insumos, sembrarlos primero automáticamente para que la prueba sea completa
      if (inventoryItems.length === 0) {
        await seedDefaultInventoryItemsAndLinkDishes(businessId, currentRestaurantId || 'all', menuItems);
      }

      // Buscar si existe un pedido pendiente/listo que aún no haya sido entregado
      const candidateOrder = orders.find(
        o =>
          ['listo', 'en_preparacion', 'aceptado', 'pendiente_cocina'].includes(o.estado) &&
          !o.insumosDescontados
      );

      if (candidateOrder) {
        // Marcar ese pedido real como 'entregado'
        await cambiarEstadoPedido(candidateOrder.id, 'entregado', userName, {
          esAdmin: true,
          timeline: candidateOrder.timeline || []
        });

        sounds.playOrderReady();
        setFeedbackBanner({
          type: 'warning',
          title: `Pedido ${candidateOrder.mesaNumero ? `Mesa #${candidateOrder.mesaNumero}` : `#${candidateOrder.id.slice(-4)}`} marcado como ENTREGADO`,
          message: `Se descontaron automáticamente del inventario todos los insumos correspondientes a los ${candidateOrder.items.length} producto(s) del pedido.`
        });
      } else {
        // Simular la entrega de un pedido con los primeros platos de la carta
        const sampleDishes = menuItems.slice(0, 2);
        if (sampleDishes.length === 0) {
          setFeedbackBanner({
            type: 'warning',
            title: 'Carta sin platos',
            message: 'Agrega al menos un plato en la pestaña Menú para simular el descuento por entrega.'
          });
          return;
        }

        const simulatedItems = sampleDishes.map((d, idx) => ({
          id: `sim_${idx}`,
          menuItemId: d.id,
          nombre: d.nombre,
          cantidad: 2,
          precio: d.precio,
          estado: 'entregado' as const,
          estadoItem: 'entregado' as const
        }));

        const { deductedRecords, criticalAlerts } = await deductStockForOrderItems(
          simulatedItems,
          businessId,
          currentRestaurantId || 'all',
          {
            orderId: `sim_entregado_${Date.now()}`,
            mesaNumero: 1,
            tipo: 'local',
            usuario: `${userName} (Simulación Entrega)`
          }
        );

        if (criticalAlerts.length > 0) {
          sounds.playAlertWarning();
        } else {
          sounds.playOrderReady();
        }

        setFeedbackBanner({
          type: criticalAlerts.length > 0 ? 'danger' : 'success',
          title:
            criticalAlerts.length > 0
              ? `¡Entrega Procesada con ${criticalAlerts.length} Alerta(s) de Stock Crítico!`
              : '¡Entrega Procesada y Stock Descontado Automáticamente!',
          message: `Al marcar el pedido como 'entregado' (${simulatedItems.map(i => `${i.cantidad}x ${i.nombre}`).join(', ')}), se descontaron ${deductedRecords.length} insumo(s) en tiempo real.`,
          details: deductedRecords
        });
      }
    } catch (err: any) {
      console.error('Error simulando entrega:', err);
    } finally {
      setIsSimulatingDelivery(false);
    }
  };

  // Abrir configurador de receta para un plato
  const handleOpenRecipeModal = (dish: MenuItem) => {
    sounds.playKeypadClick();
    setRecipeModalDish(dish);
    setRecipeDraft(dish.insumosReceta ? [...dish.insumosReceta] : []);
    setSelectedSupplyToAdd(inventoryItems[0]?.id || '');
    setQtyToAdd(1);
  };

  const handleAddIngredientToDraft = () => {
    if (!selectedSupplyToAdd || qtyToAdd <= 0) return;
    const supply = inventoryItems.find(i => i.id === selectedSupplyToAdd);
    if (!supply) return;

    sounds.playKeypadClick();
    setRecipeDraft(prev => {
      const existingIdx = prev.findIndex(r => r.insumoId === supply.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          cantidadPorUnidad: Math.round((updated[existingIdx].cantidadPorUnidad + qtyToAdd) * 1000) / 1000
        };
        return updated;
      }
      return [
        ...prev,
        {
          insumoId: supply.id,
          insumoNombre: supply.nombre,
          cantidadPorUnidad: qtyToAdd,
          unidadMedida: supply.unidadMedida
        }
      ];
    });
  };

  const handleSaveDishRecipe = async () => {
    if (!recipeModalDish) return;
    setIsSavingRecipe(true);
    try {
      sounds.playKeypadClick();
      await updateMenuItem(recipeModalDish.id, {
        insumosReceta: recipeDraft
      });
      sounds.playNotification();
      setFeedbackBanner({
        type: 'success',
        title: `Receta guardada para "${recipeModalDish.nombre}"`,
        message: `Cada vez que un pedido con "${recipeModalDish.nombre}" se marque como 'entregado', se descontarán automáticamente ${recipeDraft.length} insumo(s).`
      });
      setRecipeModalDish(null);
    } catch (err) {
      console.error('Error guardando receta:', err);
    } finally {
      setIsSavingRecipe(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Cabecera Principal */}
      <div className="bg-white rounded-3xl border border-neutral-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-neutral-900">
                Gestión de Inventario e Insumos (Descuento Automático en Entrega)
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                Activo al marcar &apos;Entregado&apos;
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Los insumos vinculados a cada plato y el stock controlado se descuentan automáticamente cuando el mesero, cajero o cocina marca un pedido como <strong>&apos;entregado&apos;</strong>, emitiendo alertas al bajar del umbral crítico.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isSeeding}
            onClick={handleSeedInventory}
            className="h-10 px-3.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            title="Crea insumos base y los vincula automáticamente a los platos de tu carta"
          >
            {isSeeding ? <Loader2 className="w-4 h-4 animate-spin text-amber-700" /> : <Sparkles className="w-4 h-4 text-amber-600" />}
            <span>{inventoryItems.length === 0 ? 'Inicializar Insumos y Recetas (1 Clic)' : 'Vincular Recetas Automáticas'}</span>
          </button>

          <button
            type="button"
            disabled={isSimulatingDelivery}
            onClick={handleSimulateOrderDelivery}
            className="h-10 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
            title="Marca un pedido como entregado para verificar el descuento automático de insumos y las alertas de stock crítico"
          >
            {isSimulatingDelivery ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            <span>Probar Descuento (&apos;Entregado&apos;)</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNewSupply}
            className="h-10 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Insumo</span>
          </button>
        </div>
      </div>

      {/* Feedback de Operaciones / Descuento Automático */}
      {feedbackBanner && (
        <div
          className={`p-4 rounded-2xl border-2 flex flex-col gap-2.5 shadow-sm animate-in fade-in duration-200 ${
            feedbackBanner.type === 'danger'
              ? 'bg-red-50 border-red-400 text-red-950'
              : feedbackBanner.type === 'warning'
              ? 'bg-amber-50 border-amber-400 text-amber-950'
              : 'bg-emerald-50 border-emerald-400 text-emerald-950'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              {feedbackBanner.type === 'danger' || feedbackBanner.type === 'warning' ? (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-black text-xs sm:text-sm">{feedbackBanner.title}</div>
                <div className="text-xs opacity-90 mt-0.5">{feedbackBanner.message}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="p-1 rounded-lg hover:bg-black/5 text-neutral-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {feedbackBanner.details && feedbackBanner.details.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-2 border-t border-black/10">
              {feedbackBanner.details.map((det, idx) => (
                <div
                  key={`${det.insumoId}_${idx}`}
                  className={`p-2.5 rounded-xl bg-white border flex items-center justify-between text-xs ${
                    det.agotado
                      ? 'border-red-400 ring-1 ring-red-400/30'
                      : det.alertaCritica
                      ? 'border-amber-400 ring-1 ring-amber-400/30'
                      : 'border-neutral-200'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-bold text-neutral-900 truncate">{det.nombre}</div>
                    <div className="text-[11px] text-neutral-500">
                      Stock: {det.stockAnterior} → <strong>{det.stockRestante} {det.unidad}</strong> (Mín: {det.stockMinimo})
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-800 font-black text-[11px]">
                      -{det.cantidadDescontada} {det.unidad}
                    </span>
                    {det.alertaCritica && (
                      <div className="text-[10px] font-black text-amber-700 uppercase mt-0.5">
                        {det.agotado ? '🚨 Agotado' : '⚠️ Stock Crítico'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tarjetas de Resumen KPI de Inventario */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-500">
            <span>Total Insumos</span>
            <Boxes className="w-4 h-4 text-orange-600" />
          </div>
          <div className="text-2xl font-black text-neutral-900 mt-1">{inventoryItems.length}</div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            Valor estimado: <strong className="text-neutral-700">${totalInventoryValue.toFixed(2)}</strong>
          </div>
        </div>

        <div
          onClick={() => {
            setSubTab('insumos');
            setStatusFilter('critical');
          }}
          className={`rounded-2xl border p-4 shadow-2xs cursor-pointer transition ${
            criticalSupplies.length > 0
              ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/20'
              : 'bg-white border-neutral-200'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-amber-800">
            <span>Bajo Umbral Crítico</span>
            <AlertTriangle className={`w-4 h-4 ${criticalSupplies.length > 0 ? 'text-amber-600 animate-bounce' : 'text-neutral-400'}`} />
          </div>
          <div className="text-2xl font-black text-amber-900 mt-1">{criticalSupplies.length}</div>
          <div className="text-[11px] text-amber-700 font-medium mt-0.5">
            Stock ≤ Umbral mínimo configurado
          </div>
        </div>

        <div
          onClick={() => {
            setSubTab('insumos');
            setStatusFilter('depleted');
          }}
          className={`rounded-2xl border p-4 shadow-2xs cursor-pointer transition ${
            depletedSupplies.length > 0
              ? 'bg-red-50/90 border-red-300 ring-2 ring-red-400/20'
              : 'bg-white border-neutral-200'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-red-800">
            <span>Insumos Agotados (0)</span>
            <PackageX className={`w-4 h-4 ${depletedSupplies.length > 0 ? 'text-red-600 animate-pulse' : 'text-neutral-400'}`} />
          </div>
          <div className="text-2xl font-black text-red-900 mt-1">{depletedSupplies.length}</div>
          <div className="text-[11px] text-red-700 font-medium mt-0.5">
            Requieren reposición inmediata
          </div>
        </div>

        <div
          onClick={() => setSubTab('recetas')}
          className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-2xs cursor-pointer hover:border-orange-300 transition"
        >
          <div className="flex items-center justify-between text-xs font-bold text-neutral-500">
            <span>Platos con Descuento Auto.</span>
            <UtensilsCrossed className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-neutral-900 mt-1">
            {dishesWithRecipeCount} <span className="text-sm font-bold text-neutral-400">/ {menuItems.length}</span>
          </div>
          <div className="text-[11px] text-emerald-700 font-bold mt-0.5 flex items-center gap-1">
            <span>Configurar insumos por plato</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>

      {/* Sub-navegación del Módulo de Inventario */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-neutral-200">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              sounds.playKeypadClick();
              setSubTab('insumos');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer ${
              subTab === 'insumos'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Insumos y Materias Primas ({inventoryItems.length})</span>
            {allAlertSupplies.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-red-600 text-white text-[10px]">
                {allAlertSupplies.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playKeypadClick();
              setSubTab('recetas');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer ${
              subTab === 'recetas'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Recetas por Plato (Descuento al Entregar) ({dishesWithRecipeCount}/{menuItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playKeypadClick();
              setSubTab('movimientos');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer ${
              subTab === 'movimientos'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Kardex / Descuentos por Entrega ({deliveryDeductionLogs.length})</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: LISTA DE INSUMOS Y MATERIAS PRIMAS */}
      {subTab === 'insumos' && (
        <div className="space-y-4">
          {/* Barra de búsqueda y filtros */}
          <div className="bg-white p-3.5 rounded-2xl border border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar insumo, categoría o proveedor..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-neutral-100 focus:bg-white border border-transparent focus:border-orange-500 text-xs font-medium outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="h-9 px-3 rounded-xl border border-neutral-200 bg-neutral-50 text-xs font-bold text-neutral-700"
              >
                <option value="all">Todas las categorías</option>
                {SUPPLY_CATEGORIES.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <div className="flex items-center bg-neutral-100 p-1 rounded-xl border border-neutral-200 text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    statusFilter === 'all' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-500'
                  }`}
                >
                  Todos ({inventoryItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('critical')}
                  className={`px-2.5 py-1 rounded-lg font-black transition flex items-center gap-1 ${
                    statusFilter === 'critical'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-amber-800 hover:bg-amber-50'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  <span>Críticos ({allAlertSupplies.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('depleted')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    statusFilter === 'depleted'
                      ? 'bg-red-600 text-white shadow-2xs'
                      : 'text-red-700 hover:bg-red-50'
                  }`}
                >
                  Agotados ({depletedSupplies.length})
                </button>
              </div>
            </div>
          </div>

          {inventoryItems.length === 0 ? (
            <div className="bg-white rounded-3xl border-2 border-dashed border-amber-300 p-10 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                <Boxes className="w-7 h-7" />
              </div>
              <h4 className="text-base font-black text-neutral-900">
                Aún no hay insumos registrados en el inventario
              </h4>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                Puedes crear tus insumos manualmente o inicializar con 1 clic el catálogo base de insumos gastronómicos (Carnes, Panes, Quesos, Papas, Vegetales, Bebidas y Empaques) vinculados automáticamente a los platos de tu carta.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSeeding}
                  onClick={handleSeedInventory}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>Sembrar Insumos Base y Vincular Platos Ahora</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenNewSupply}
                  className="px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-black text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear Insumo Manual</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase text-[10px] border-b">
                  <tr>
                    <th className="p-3.5">Insumo / Materia Prima</th>
                    <th className="p-3.5">Categoría</th>
                    <th className="p-3.5">Nivel de Stock Actual vs Crítico</th>
                    <th className="p-3.5 text-center">Estado</th>
                    <th className="p-3.5">Ajuste / Reabastecimiento Rápido</th>
                    <th className="p-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-neutral-700">
                  {filteredSupplies.map(item => {
                    const stock = Number(item.stockActual) || 0;
                    const min = Number(item.stockMinimo) || 5;
                    const unit = item.unidadMedida || 'unidades';
                    const isDepleted = stock <= 0;
                    const isCritical = stock > 0 && stock <= min;
                    const ratio = Math.min(100, Math.round((stock / Math.max(1, min * 2)) * 100));
                    const isBusy = busyId === item.id;
                    const manualVal = manualStockInputs[item.id] ?? '';

                    // Contar en cuántos platos se usa este insumo
                    const usedInDishes = menuItems.filter(m =>
                      (m.insumosReceta || []).some(
                        r => r.insumoId === item.id || r.insumoNombre.toLowerCase() === item.nombre.toLowerCase()
                      )
                    );

                    return (
                      <tr
                        key={item.id}
                        className={`transition ${
                          isDepleted
                            ? 'bg-red-50/40 hover:bg-red-50/70'
                            : isCritical
                            ? 'bg-amber-50/40 hover:bg-amber-50/70'
                            : 'hover:bg-neutral-50/60'
                        }`}
                      >
                        <td className="p-3.5">
                          <div className="font-black text-neutral-900 text-sm flex items-center gap-1.5">
                            <span>{item.nombre}</span>
                          </div>
                          <div className="text-[11px] text-neutral-500 flex flex-wrap items-center gap-2 mt-0.5">
                            {item.proveedor && <span>Proveedor: {item.proveedor}</span>}
                            {typeof item.costoUnitario === 'number' && item.costoUnitario > 0 && (
                              <span>• Costo: ${item.costoUnitario.toFixed(2)}/{unit}</span>
                            )}
                            <span className="text-emerald-700 font-bold">
                              • Vinculado a {usedInDishes.length} plato(s)
                            </span>
                          </div>
                        </td>

                        <td className="p-3.5">
                          <span className="px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-700 font-bold text-[10px] uppercase">
                            {item.categoria}
                          </span>
                        </td>

                        <td className="p-3.5 min-w-[210px]">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-black text-neutral-900">
                              {stock} {unit}
                            </span>
                            <span className="text-[11px] text-neutral-500">
                              Umbral crítico: <strong className="text-neutral-800">{min} {unit}</strong>
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isDepleted
                                  ? 'bg-red-600'
                                  : isCritical
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${isDepleted ? 5 : Math.max(8, ratio)}%` }}
                            />
                          </div>
                        </td>

                        <td className="p-3.5 text-center">
                          {isDepleted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-red-600 text-white shadow-2xs animate-pulse">
                              <PackageX className="w-3 h-3" />
                              Agotado (0)
                            </span>
                          ) : isCritical ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-500 text-white shadow-2xs">
                              <AlertTriangle className="w-3 h-3" />
                              Stock Crítico
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                              <PackageCheck className="w-3 h-3" />
                              Óptimo
                            </span>
                          )}
                        </td>

                        <td className="p-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy || stock <= 0}
                              onClick={() => handleQuickAdjust(item, -1)}
                              className="w-7 h-7 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-black text-xs flex items-center justify-center border border-neutral-200 disabled:opacity-40 cursor-pointer"
                              title="Descontar 1 unidad"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleQuickAdjust(item, 1)}
                              className="px-2 h-7 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-black text-xs border border-neutral-200 disabled:opacity-40 cursor-pointer"
                            >
                              +1
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleQuickAdjust(item, 5)}
                              className="px-2 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-black text-xs border border-emerald-300 disabled:opacity-40 cursor-pointer"
                            >
                              +5
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleQuickAdjust(item, 10)}
                              className="px-2 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs disabled:opacity-40 cursor-pointer"
                            >
                              +10
                            </button>

                            <div className="flex items-center gap-1 ml-1">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                placeholder="Fijar..."
                                value={manualVal}
                                onChange={e =>
                                  setManualStockInputs(prev => ({ ...prev, [item.id]: e.target.value }))
                                }
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSetExactStock(item);
                                }}
                                className="w-16 h-7 px-2 rounded-lg border border-neutral-300 text-xs font-bold text-center"
                              />
                              {manualVal !== '' && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleSetExactStock(item)}
                                  className="px-2 h-7 rounded-lg bg-neutral-900 text-white font-bold text-[11px] flex items-center gap-0.5"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="p-3.5 text-right space-x-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditSupply(item)}
                            className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition cursor-pointer"
                            title="Editar Insumo y Umbral Crítico"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteInventoryItem(item.id);
                            }}
                            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition cursor-pointer"
                            title="Eliminar Insumo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: RECETAS POR PLATO (QUÉ INSUMOS SE DESCUENTAN AL ENTREGAR CADA PLATO) */}
      {subTab === 'recetas' && (
        <div className="space-y-4">
          <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs text-amber-950">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>¿Cómo funciona el descuento automático al marcar &apos;Entregado&apos;?</strong>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Cada plato puede tener insumos asignados (ej. 1 Hamburguesa = 1 Porción Carne + 1 Pan Brioche + 1 Queso + 1 Porción Papas). Cuando un pedido se marca como <strong>&apos;entregado&apos;</strong>, el sistema multiplica la cantidad vendida por los insumos de su receta y los descuenta automáticamente del inventario.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={isSeeding}
              onClick={handleSeedInventory}
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Autovincular Todos los Platos</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {menuItems.map(dish => {
              const recipe = dish.insumosReceta || [];
              const photo = dish.fotoUrl || dish.imagenUrl;

              return (
                <div
                  key={dish.id}
                  className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-2xs flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-3 pb-3 border-b border-neutral-100">
                      <div className="w-11 h-11 rounded-xl bg-neutral-100 overflow-hidden shrink-0 flex items-center justify-center border border-neutral-200">
                        {photo ? (
                          <img src={photo} alt={dish.nombre} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        ) : (
                          <UtensilsCrossed className="w-5 h-5 text-neutral-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-black text-neutral-900 text-sm truncate">{dish.nombre}</div>
                        <div className="text-[11px] text-neutral-500 flex items-center gap-2">
                          <span>{dish.categoria}</span>
                          <span>•</span>
                          <span className="font-bold text-orange-600">${dish.precio.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 flex items-center justify-between">
                        <span>Insumos a descontar por unidad:</span>
                        <span className="text-neutral-600 font-black">{recipe.length} insumo(s)</span>
                      </div>

                      {recipe.length === 0 ? (
                        <div className="p-2.5 rounded-xl bg-neutral-50 border border-dashed border-neutral-200 text-[11px] text-neutral-400 italic">
                          Sin insumos específicos asignados. Haz clic en &quot;Configurar Insumos&quot; o usa &quot;Autovincular&quot;.
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {recipe.map((ing, i) => {
                            const liveInv = inventoryItems.find(
                              inv => inv.id === ing.insumoId || inv.nombre.toLowerCase() === ing.insumoNombre.toLowerCase()
                            );
                            const isLow =
                              liveInv && (Number(liveInv.stockActual) || 0) <= (Number(liveInv.stockMinimo) || 5);

                            return (
                              <div
                                key={`${ing.insumoId}_${i}`}
                                className="px-2.5 py-1.5 rounded-lg bg-neutral-50 border border-neutral-200/80 flex items-center justify-between text-xs"
                              >
                                <span className="font-semibold text-neutral-800 truncate pr-2">
                                  {ing.insumoNombre}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="font-mono font-black text-orange-700 bg-orange-50 px-1.5 py-0.2 rounded border border-orange-200 text-[11px]">
                                    -{ing.cantidadPorUnidad} {ing.unidadMedida}
                                  </span>
                                  {isLow && (
                                    <span title="Este insumo está en stock crítico" className="text-amber-600">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenRecipeModal(dish)}
                    className="w-full py-2 rounded-xl bg-neutral-900 hover:bg-black text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Configurar Insumos del Plato</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: KARDEX / HISTORIAL DE DESCUENTOS AUTOMÁTICOS AL ENTREGAR */}
      {subTab === 'movimientos' && (
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
            <div>
              <h4 className="font-black text-neutral-900 text-sm">
                Historial de Descuentos Automáticos y Movimientos de Stock
              </h4>
              <p className="text-xs text-neutral-500">
                Registro automático cada vez que un pedido pasa al estado &apos;entregado&apos; o se reabastece un insumo.
              </p>
            </div>
          </div>

          {deliveryDeductionLogs.length === 0 ? (
            <div className="p-10 text-center text-neutral-400 text-xs">
              Aún no hay movimientos registrados. Marca un pedido como &apos;entregado&apos; o pulsa &quot;Probar Descuento (&apos;Entregado&apos;)&quot; arriba.
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {deliveryDeductionLogs.slice(0, 50).map(log => {
                const isAutoDelivery = log.tipoAccion === 'descuento_automatico_entrega';
                return (
                  <div key={log.id} className="p-3.5 hover:bg-neutral-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            isAutoDelivery
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {isAutoDelivery ? 'Descuento Automático (Pedido Entregado)' : 'Ajuste / Reposición'}
                        </span>
                        <span className="font-black text-neutral-900">{log.platoNombre}</span>
                      </div>
                      <p className="text-neutral-600 text-xs">{log.detalles}</p>
                    </div>
                    <div className="text-right text-[11px] text-neutral-400 shrink-0">
                      <div className="font-bold text-neutral-700">{log.empleadoNombre}</div>
                      <div>{new Date(log.fecha).toLocaleString('es-ES')}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREAR / EDITAR INSUMO */}
      {showSupplyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-neutral-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  <Boxes className="w-4 h-4" />
                </div>
                <h3 className="font-black text-base text-neutral-900">
                  {editingSupply ? 'Editar Insumo' : 'Nuevo Insumo de Inventario'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSupplyModal(false)}
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Nombre del Insumo *
                </label>
                <input
                  type="text"
                  placeholder="Ej: Carne de Res Molida, Pan Brioche, Queso Cheddar..."
                  value={supplyForm.nombre}
                  onChange={e => setSupplyForm({ ...supplyForm, nombre: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-bold outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Categoría</label>
                  <select
                    value={supplyForm.categoria}
                    onChange={e => setSupplyForm({ ...supplyForm, categoria: e.target.value })}
                    className="w-full h-10 px-2.5 rounded-xl border border-neutral-300 text-xs font-bold bg-white"
                  >
                    {SUPPLY_CATEGORIES.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Unidad de Medida</label>
                  <select
                    value={supplyForm.unidadMedida}
                    onChange={e => setSupplyForm({ ...supplyForm, unidadMedida: e.target.value })}
                    className="w-full h-10 px-2.5 rounded-xl border border-neutral-300 text-xs font-bold bg-white"
                  >
                    {SUPPLY_UNITS.map(u => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 p-3 bg-amber-50/70 rounded-2xl border border-amber-200">
                <div>
                  <label className="block text-xs font-black text-neutral-900 mb-1">
                    Stock Disponible Actual *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={supplyForm.stockActual}
                    onChange={e =>
                      setSupplyForm({ ...supplyForm, stockActual: Math.max(0, parseFloat(e.target.value) || 0) })
                    }
                    className="w-full h-10 px-3 rounded-xl border border-amber-300 bg-white text-sm font-black text-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-amber-900 mb-1">
                    Umbral Crítico (Alerta) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    value={supplyForm.stockMinimo}
                    onChange={e =>
                      setSupplyForm({ ...supplyForm, stockMinimo: Math.max(1, parseFloat(e.target.value) || 1) })
                    }
                    className="w-full h-10 px-3 rounded-xl border border-amber-400 bg-white text-sm font-black text-amber-900"
                  />
                </div>
                <div className="col-span-2 text-[11px] text-amber-800">
                  ⚠️ Cuando el stock baje a <strong>{supplyForm.stockMinimo} {supplyForm.unidadMedida}</strong> o menos tras entregar un pedido, se activará una alerta crítica inmediata.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Costo Unitario ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={supplyForm.costoUnitario}
                    onChange={e =>
                      setSupplyForm({ ...supplyForm, costoUnitario: Math.max(0, parseFloat(e.target.value) || 0) })
                    }
                    className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Proveedor (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej: Mercado Central"
                    value={supplyForm.proveedor}
                    onChange={e => setSupplyForm({ ...supplyForm, proveedor: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSupplyModal(false)}
                className="flex-1 h-11 rounded-xl bg-neutral-100 hover:bg-neutral-200 font-bold text-xs text-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!supplyForm.nombre.trim() || busyId === 'saving_modal'}
                onClick={handleSaveSupply}
                className="flex-1 h-11 rounded-xl bg-orange-600 hover:bg-orange-700 font-black text-xs text-white shadow-sm disabled:opacity-50"
              >
                {editingSupply ? 'Guardar Cambios' : 'Registrar Insumo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURAR RECETA DE INSUMOS DE UN PLATO */}
      {recipeModalDish && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-neutral-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div>
                <h3 className="font-black text-base text-neutral-900">
                  Insumos por Unidad: {recipeModalDish.nombre}
                </h3>
                <p className="text-xs text-neutral-500">
                  Define qué insumos se descuentan automáticamente cuando este plato es marcado como &apos;entregado&apos;.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRecipeModalDish(null)}
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selector para agregar insumo a la receta */}
            <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-2.5">
              <label className="block text-xs font-bold text-neutral-700">
                Agregar insumo que consume este plato:
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={selectedSupplyToAdd}
                  onChange={e => setSelectedSupplyToAdd(e.target.value)}
                  className="flex-1 h-10 px-3 rounded-xl border border-neutral-300 bg-white text-xs font-bold"
                >
                  <option value="">Seleccionar insumo...</option>
                  {inventoryItems.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.nombre} (Stock: {inv.stockActual} {inv.unidadMedida})
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0.01"
                    step="0.25"
                    value={qtyToAdd}
                    onChange={e => setQtyToAdd(Math.max(0.01, parseFloat(e.target.value) || 1))}
                    className="w-24 h-10 px-2.5 rounded-xl border border-neutral-300 bg-white text-xs font-black text-center"
                    placeholder="Cant."
                  />
                  <button
                    type="button"
                    disabled={!selectedSupplyToAdd}
                    onClick={handleAddIngredientToDraft}
                    className="h-10 px-3.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs flex items-center gap-1 shrink-0 disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Añadir</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Lista de insumos actuales del plato */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {recipeDraft.length === 0 ? (
                <div className="p-6 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-2xl">
                  No hay insumos asignados todavía. Selecciona un insumo arriba y pulsa &quot;Añadir&quot;.
                </div>
              ) : (
                recipeDraft.map((ing, idx) => (
                  <div
                    key={`${ing.insumoId}_${idx}`}
                    className="p-3 rounded-xl bg-white border border-neutral-200 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="font-bold text-neutral-900">{ing.insumoNombre}</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0.01"
                        step="0.25"
                        value={ing.cantidadPorUnidad}
                        onChange={e => {
                          const val = Math.max(0.01, parseFloat(e.target.value) || 0.01);
                          setRecipeDraft(prev =>
                            prev.map((item, i) => (i === idx ? { ...item, cantidadPorUnidad: val } : item))
                          );
                        }}
                        className="w-20 h-8 px-2 rounded-lg border border-neutral-300 text-center font-black"
                      />
                      <span className="text-neutral-500 font-medium">{ing.unidadMedida}</span>
                      <button
                        type="button"
                        onClick={() => setRecipeDraft(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setRecipeModalDish(null)}
                className="flex-1 h-11 rounded-xl bg-neutral-100 hover:bg-neutral-200 font-bold text-xs text-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingRecipe}
                onClick={handleSaveDishRecipe}
                className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-black text-xs text-white shadow-sm disabled:opacity-50"
              >
                {isSavingRecipe ? 'Guardando...' : 'Guardar Receta de Descuento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
