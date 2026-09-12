import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { MenuItem, Restaurant, Employee, Shift, Order } from '../types';
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
  FullRestaurantStatsSummary
} from '../services/dataService';
import { uploadDishPhoto } from '../services/storageService';
import { sounds } from '../utils/sound';
import { 
  ShieldCheck, 
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
  LayoutGrid
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
    currentBusiness 
  } = useAuth();
  
  const activeBizId = currentUserAccount?.businessId || currentBusiness?.id || 'biz_default';
  
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'metricas' | 'restaurantes' | 'empleados' | 'menu' | 'turnos' | 'peligro'>('metricas');

  // Restaurant Modal State
  const [showRestModal, setShowRestModal] = useState(false);
  const [editingRest, setEditingRest] = useState<Restaurant | null>(null);
  const [restForm, setRestForm] = useState({ nombre: '', direccion: '', telefono: '', activo: true, numeroMesas: 10 });

  // Modal Gestión de Mesas
  const [tableModalRest, setTableModalRest] = useState<Restaurant | null>(null);
  const [tableCountInput, setTableCountInput] = useState<number>(10);
  const [tableOperationMsg, setTableOperationMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isProcessingTables, setIsProcessingTables] = useState(false);

  // Modal Zona de Peligro & Cascade Deletion
  const [dangerModal, setDangerModal] = useState<{
    type: 'reset_operational' | 'delete_restaurant' | 'delete_account';
    restaurant?: Restaurant;
    summary?: OperationalStatsSummary | FullRestaurantStatsSummary;
  } | null>(null);
  const [isProcessingDanger, setIsProcessingDanger] = useState(false);
  const [dangerConfirmationText, setDangerConfirmationText] = useState('');

  // Payment of Shift Salary state
  const [payingShiftId, setPayingShiftId] = useState<string | null>(null);
  const [paySuccessToast, setPaySuccessToast] = useState<string | null>(null);

  // Employee Modal State
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({
    nombre: '',
    puesto: 'mesero' as any,
    pin: '',
    tarifaHora: 12.0,
    restaurantId: '',
    activo: true,
  });

  // PIN Reset Quick Prompt
  const [pinResetModal, setPinResetModal] = useState<{ empId: string; empName: string; newPin: string } | null>(null);

  // Menu Item Modal State
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState<MenuItem | null>(null);
  const [menuViewMode, setMenuViewMode] = useState<'tabla' | 'tarjetas'>('tabla');
  const [menuForm, setMenuForm] = useState({
    nombre: '',
    descripcion: '',
    precio: 10.0,
    categoria: 'Platos Fuertes',
    disponible: true,
    restaurantId: 'all',
    fotoUrl: '',
    imagenUrl: ''
  });
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Métricas generales
  const totalSales = orders
    .filter(o => o.estado === 'cobrado')
    .reduce((sum, o) => sum + (o.total || 0), 0);

  const completedOrdersCount = orders.filter(o => o.estado === 'cobrado').length;
  const activeEmployeesCount = employees.filter(e => e.activo).length;

  // Handlers para Restaurantes
  const handleSaveRestaurant = async () => {
    if (!restForm.nombre.trim()) return;
    if (editingRest) {
      await updateRestaurant(editingRest.id, restForm);
    } else {
      await createRestaurant(restForm, activeBizId);
    }
    setShowRestModal(false);
    setEditingRest(null);
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
  const handleOpenDangerModal = async (type: 'reset_operational' | 'delete_restaurant' | 'delete_account', rest?: Restaurant) => {
    setIsProcessingDanger(true);
    setDangerConfirmationText('');
    try {
      if (type === 'reset_operational' && rest) {
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
      if (dangerModal.type === 'reset_operational' && dangerModal.restaurant) {
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

  // Handlers para Empleados
  const handleSaveEmployee = async () => {
    if (!empForm.nombre.trim() || empForm.pin.length !== 4) {
      alert('El PIN debe tener exactamente 4 dígitos.');
      return;
    }
    const targetRestId = empForm.restaurantId || restaurants[0]?.id;

    if (editingEmp) {
      await updateEmployee(editingEmp.id, { ...empForm, restaurantId: targetRestId });
    } else {
      await createEmployee({ ...empForm, restaurantId: targetRestId, businessId: activeBizId });
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

  const handleOpenNewDish = () => {
    setEditingMenu(null);
    setSelectedPhotoFile(null);
    setPhotoPreviewUrl(null);
    setIsUploadingPhoto(false);
    setMenuForm({
      nombre: '',
      descripcion: '',
      precio: 12.0,
      categoria: 'Platos Fuertes',
      disponible: true,
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
    setMenuForm({
      nombre: item.nombre,
      descripcion: item.descripcion,
      precio: item.precio,
      categoria: item.categoria,
      disponible: item.disponible,
      restaurantId: item.restaurantId,
      fotoUrl: item.fotoUrl || item.imagenUrl || '',
      imagenUrl: item.imagenUrl || item.fotoUrl || ''
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowMenuModal(true);
  };

  const handleSaveMenuItem = async () => {
    if (!menuForm.nombre.trim()) return;
    setIsUploadingPhoto(true);

    try {
      const targetRestaurantId = menuForm.restaurantId && menuForm.restaurantId !== 'all'
        ? menuForm.restaurantId
        : (currentRestaurant?.id || 'central');

      const dishId = editingMenu ? editingMenu.id : generateMenuItemId();
      let finalFotoUrl: string | null = menuForm.fotoUrl || menuForm.imagenUrl || null;

      // 3. Al guardar el plato, la imagen se sube a Firebase Storage en la ruta:
      //    /restaurants/{restaurantId}/menu/{menuItemId}.jpg
      // 4. Se comprime/redimensiona antes de subir (máx 800px ancho, 80% calidad)
      // 5. En Firestore solo se guarda la URL de descarga del campo "fotoUrl"
      if (selectedPhotoFile) {
        finalFotoUrl = await uploadDishPhoto(targetRestaurantId, dishId, selectedPhotoFile);
      } else if (!photoPreviewUrl) {
        finalFotoUrl = null;
      }

      const dishPayload = {
        businessId: activeBizId,
        nombre: menuForm.nombre.trim(),
        descripcion: menuForm.descripcion.trim(),
        precio: Number(menuForm.precio) || 0,
        categoria: menuForm.categoria.trim() || 'General',
        disponible: menuForm.disponible,
        restaurantId: menuForm.restaurantId,
        fotoUrl: finalFotoUrl,
        imagenUrl: finalFotoUrl
      };

      if (editingMenu) {
        await updateMenuItem(editingMenu.id, dishPayload);
      } else {
        await setMenuItem(dishId, dishPayload);
      }

      setShowMenuModal(false);
      setEditingMenu(null);
      setSelectedPhotoFile(null);
      setPhotoPreviewUrl(null);
    } catch (err: any) {
      console.error('Error guardando plato:', err);
      alert('Ocurrió un error al procesar la foto o guardar el plato.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Escuchar evento disparado desde TopNav cuando se selecciona "+ Crear otro restaurante..."
  React.useEffect(() => {
    const handleOpenNewRest = () => {
      setEditingRest(null);
      setRestForm({
        nombre: '',
        direccion: '',
        telefono: '',
        activo: true,
        numeroMesas: 10
      });
      setShowRestModal(true);
    };

    window.addEventListener('open-new-restaurant-modal', handleOpenNewRest);
    return () => window.removeEventListener('open-new-restaurant-modal', handleOpenNewRest);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-65px)] bg-neutral-100 overflow-hidden">
      
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

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-xl border border-neutral-200 overflow-x-auto">
          {[
            { id: 'metricas', label: 'Dashboard', icon: TrendingUp },
            { id: 'restaurantes', label: 'Locales & Mesas', icon: Store },
            { id: 'empleados', label: 'Empleados & PINs', icon: Users },
            { id: 'menu', label: 'Menú & Platos', icon: UtensilsCrossed },
            { id: 'turnos', label: 'Turnos & Sueldos', icon: Clock },
            { id: 'peligro', label: 'Zona de Peligro', icon: Flame },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isDanger = tab.id === 'peligro';
            return (
              <button
                key={tab.id}
                onClick={() => { sounds.playKeypadClick(); setActiveTab(tab.id as any); }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                  isActive 
                    ? isDanger ? 'bg-red-600 text-white shadow-xs' : 'bg-white text-neutral-900 shadow-xs' 
                    : isDanger ? 'text-red-600 hover:bg-red-50' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? (isDanger ? 'text-white' : 'text-purple-600') : (isDanger ? 'text-red-500' : 'text-neutral-400')}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Admin Content Container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        
        {/* VIEW 1: Métricas & KPIs */}
        {activeTab === 'metricas' && (
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
                <div className="flex items-center justify-between text-neutral-500 text-xs font-bold uppercase">
                  <span>Ventas Totales</span>
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-black text-neutral-900 mt-2">
                  ${totalSales.toFixed(2)}
                </div>
                <div className="text-[11px] text-emerald-600 font-semibold mt-1">
                  En todos los locales
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
                <div className="flex items-center justify-between text-neutral-500 text-xs font-bold uppercase">
                  <span>Comandas Cobradas</span>
                  <UtensilsCrossed className="w-4 h-4 text-orange-600" />
                </div>
                <div className="text-2xl font-black text-neutral-900 mt-2">
                  {completedOrdersCount}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">
                  Pedidos finalizados
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
                <div className="flex items-center justify-between text-neutral-500 text-xs font-bold uppercase">
                  <span>Locales Activos</span>
                  <Store className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-2xl font-black text-neutral-900 mt-2">
                  {restaurants.length}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">
                  Sedes conectadas
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-xs">
                <div className="flex items-center justify-between text-neutral-500 text-xs font-bold uppercase">
                  <span>Plantilla Empleados</span>
                  <Users className="w-4 h-4 text-purple-600" />
                </div>
                <div className="text-2xl font-black text-neutral-900 mt-2">
                  {activeEmployeesCount}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">
                  Con PIN táctil activo
                </div>
              </div>
            </div>

            {/* Recent Orders Overview */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs">
              <h3 className="font-extrabold text-sm text-neutral-900 uppercase tracking-wider mb-3">
                Últimas Comandas del Sistema
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase text-[10px] border-b">
                    <tr>
                      <th className="p-2.5">Hora</th>
                      <th className="p-2.5">Sede</th>
                      <th className="p-2.5">Destino</th>
                      <th className="p-2.5">Mesero</th>
                      <th className="p-2.5">Estado</th>
                      <th className="p-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {orders.slice(0, 8).map(o => (
                      <tr key={o.id} className="hover:bg-neutral-50/50">
                        <td className="p-2.5 font-mono">
                          {new Date(o.creadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-2.5 font-semibold text-neutral-700">
                          {restaurants.find(r => r.id === o.restaurantId)?.nombre || 'Sede'}
                        </td>
                        <td className="p-2.5">
                          {o.tipo === 'local' ? `Mesa #${o.mesaNumero}` : `Delivery (${o.empresaDelivery || 'General'})`}
                        </td>
                        <td className="p-2.5">{o.meseroNombre}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                            o.estado === 'cobrado' ? 'bg-neutral-100 text-neutral-800' :
                            o.estado === 'listo' ? 'bg-emerald-100 text-emerald-800' :
                            o.estado === 'en_preparacion' ? 'bg-blue-100 text-blue-800' :
                            o.estado === 'rechazado' ? 'bg-red-100 text-red-800' :
                            'bg-orange-100 text-orange-800'
                          }`}>
                            {o.estado.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-black font-mono">
                          ${o.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

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
                  setRestForm({ nombre: '', direccion: '', telefono: '', activo: true });
                  setShowRestModal(true);
                }}
                className="h-10 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Nuevo Local
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {restaurants.map(rest => (
                <div key={rest.id} className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Store className="w-5 h-5 text-orange-600" />
                        <h4 className="font-extrabold text-neutral-900 text-base">{rest.nombre}</h4>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        rest.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-700'
                      }`}>
                        {rest.activo ? 'Operando' : 'Inactivo'}
                      </span>
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
                        className="px-2.5 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-xs flex items-center gap-1 transition"
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
                          setRestForm({
                            nombre: rest.nombre,
                            direccion: rest.direccion,
                            telefono: rest.telefono,
                            activo: rest.activo,
                            numeroMesas: rest.numeroMesas || 10
                          });
                          setShowRestModal(true);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs flex items-center gap-1 transition"
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

        {/* VIEW 3: Empleados con PIN y tarifa por hora */}
        {activeTab === 'empleados' && (
          <div className="max-w-6xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-neutral-800 text-sm uppercase tracking-wider">
                  Plantilla de Empleados y Control de PINs ({employees.length})
                </h3>
                <p className="text-xs text-neutral-500">
                  Asigna roles, gestiona la tarifa por hora y resetea PINs de acceso táctil.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingEmp(null);
                  setEmpForm({
                    nombre: '',
                    puesto: 'mesero',
                    pin: '',
                    tarifaHora: 12.0,
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
                    <th className="p-3 text-right">Tarifa / Hora</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-neutral-700">
                  {employees.map(emp => (
                    <tr key={emp.id} className="hover:bg-neutral-50/50">
                      <td className="p-3 font-bold text-neutral-900">{emp.nombre}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                          emp.puesto === 'admin' ? 'bg-purple-100 text-purple-800' :
                          emp.puesto === 'caja' ? 'bg-blue-100 text-blue-800' :
                          emp.puesto === 'mesero' ? 'bg-amber-100 text-amber-800' :
                          emp.puesto === 'cocina' ? 'bg-emerald-100 text-emerald-800' :
                          emp.puesto === 'ayudante_cocina' ? 'bg-teal-100 text-teal-800' :
                          'bg-indigo-100 text-indigo-800'
                        }`}>
                          {emp.puesto === 'ayudante_cocina' ? 'Ayudante Cocina' :
                           emp.puesto === 'limpieza' ? 'Limpieza' : emp.puesto}
                        </span>
                      </td>
                      <td className="p-3 text-neutral-600">
                        {restaurants.find(r => r.id === emp.restaurantId)?.nombre || 'Todas'}
                      </td>
                      <td className="p-3 font-mono font-bold text-orange-600">
                        •••• ({emp.pin})
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        ${(emp.tarifaHora || 0).toFixed(2)} / h
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
                            setEditingEmp(emp);
                            setEmpForm({
                              nombre: emp.nombre,
                              puesto: emp.puesto,
                              pin: emp.pin,
                              tarifaHora: emp.tarifaHora,
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
                  ))}
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
                  Controla las fotos de los platos, disponibilidad en cocina y precios de venta.
                </p>
              </div>
              <div className="flex items-center gap-2">
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

                <button
                  onClick={handleOpenNewDish}
                  className="h-10 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition"
                >
                  <Plus className="w-4 h-4" />
                  Nuevo Plato
                </button>
              </div>
            </div>

            {menuViewMode === 'tabla' ? (
              /* VISTA TABLA: Miniatura de la foto (48px) requerida por el usuario con fallback */
              <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase text-[10px] border-b">
                    <tr>
                      <th className="p-3">Plato</th>
                      <th className="p-3">Categoría</th>
                      <th className="p-3 text-right">Precio</th>
                      <th className="p-3">Sede</th>
                      <th className="p-3 text-center">Disponibilidad</th>
                      <th className="p-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 text-neutral-700">
                    {menuItems.map(item => {
                      const photoSrc = item.fotoUrl || item.imagenUrl;
                      const restName = item.restaurantId === 'all' 
                        ? 'Todas' 
                        : (restaurants.find(r => r.id === item.restaurantId)?.nombre || 'Sede');

                      return (
                        <tr key={item.id} className="hover:bg-neutral-50/50">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              {/* Miniatura 48px (w-12 h-12) con fallback si no tiene */}
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
                          <td className="p-3 text-right font-mono font-bold text-orange-600 text-sm">
                            ${item.precio.toFixed(2)}
                          </td>
                          <td className="p-3 text-neutral-600">
                            {restName}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => updateMenuItem(item.id, { disponible: !item.disponible })}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition border ${
                                item.disponible 
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200' 
                                  : 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200'
                              }`}
                            >
                              {item.disponible ? 'Disponible' : 'Agotado'}
                            </button>
                          </td>
                          <td className="p-3 text-right space-x-1">
                            <button
                              onClick={() => handleOpenEditDish(item)}
                              className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition"
                              title="Editar Plato"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`¿Eliminar plato ${item.nombre}?`)) {
                                  deleteMenuItem(item.id);
                                }
                              }}
                              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition"
                              title="Eliminar Plato"
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
            ) : (
              /* VISTA TARJETAS */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {menuItems.map(item => {
                  const photoSrc = item.fotoUrl || item.imagenUrl;
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
                          <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            item.disponible ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                          }`}>
                            {item.disponible ? 'Disponible' : 'Agotado'}
                          </span>
                        </div>

                        <div className="flex justify-between items-start gap-2">
                          <h4 className="font-bold text-neutral-900 text-sm">{item.nombre}</h4>
                          <span className="font-black text-orange-600 text-base">${item.precio.toFixed(2)}</span>
                        </div>

                        <span className="text-[10px] uppercase font-bold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded">
                          {item.categoria}
                        </span>
                        <p className="text-xs text-neutral-500 mt-2 line-clamp-2">{item.descripcion}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between">
                        <button
                          onClick={() => updateMenuItem(item.id, { disponible: !item.disponible })}
                          className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition ${
                            item.disponible ? 'bg-neutral-50 text-neutral-700 hover:bg-neutral-100' : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          }`}
                        >
                          {item.disponible ? 'Marcar Agotado' : 'Habilitar Plato'}
                        </button>

                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleOpenEditDish(item)}
                            className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`¿Eliminar ${item.nombre}?`)) {
                                deleteMenuItem(item.id);
                              }
                            }}
                            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW 5: Auditoría de Turnos & Pago de Sueldos */}
        {activeTab === 'turnos' && (
          <div className="max-w-6xl mx-auto space-y-4">
            {paySuccessToast && (
              <div className="p-3 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center justify-between shadow-md animate-in slide-in-from-top duration-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{paySuccessToast}</span>
                </div>
                <button onClick={() => setPaySuccessToast(null)} className="text-white/80 hover:text-white">✕</button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-neutral-800 text-sm uppercase tracking-wider">
                  Historial y Liquidación de Turnos ({shifts.length})
                </h3>
                <p className="text-xs text-neutral-500">
                  Calcula horas ordinarias, horas extra (1.5x), ventas y liquida el pago registrando el gasto automáticamente.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-500 font-bold uppercase text-[10px] border-b">
                  <tr>
                    <th className="p-3">Empleado</th>
                    <th className="p-3">Sede</th>
                    <th className="p-3">Horario</th>
                    <th className="p-3 text-center">Horas</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-right">Tarifa / h</th>
                    <th className="p-3 text-right">Sueldo Calc.</th>
                    <th className="p-3 text-right">Ventas</th>
                    <th className="p-3 text-center">Liquidación / Pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-neutral-700">
                  {shifts.map(sh => {
                    const emp = employees.find(e => e.id === sh.employeeId);
                    const rate = emp?.tarifaHora || 12;
                    const durationHours = sh.horaFin 
                      ? Math.max(0.1, (new Date(sh.horaFin).getTime() - new Date(sh.horaInicio).getTime()) / (1000 * 60 * 60))
                      : (new Date().getTime() - new Date(sh.horaInicio).getTime()) / (1000 * 60 * 60);
                    
                    const regularHours = Math.min(8, durationHours);
                    const overtimeHours = Math.max(0, durationHours - 8);
                    const calculatedSalary = (regularHours * rate) + (overtimeHours * rate * 1.5);
                    const isClosed = sh.estado === 'cerrado';
                    const isPaid = sh.sueldoPagado;

                    return (
                      <tr key={sh.id} className="hover:bg-neutral-50/50">
                        <td className="p-3">
                          <div className="font-bold text-neutral-900">{sh.employeeName || sh.employeeId}</div>
                          <div className="text-[10px] text-neutral-400 capitalize">{emp?.puesto || 'personal'}</div>
                        </td>
                        <td className="p-3 text-neutral-600">{sh.restaurantNombre || 'Central'}</td>
                        <td className="p-3 font-mono text-[11px]">
                          <div>In: {new Date(sh.horaInicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          {sh.horaFin ? (
                            <div>Out: {new Date(sh.horaFin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          ) : (
                            <div className="text-emerald-600 font-bold">En curso</div>
                          )}
                        </td>
                        <td className="p-3 text-center font-mono font-bold">
                          {durationHours.toFixed(1)}h
                          {overtimeHours > 0 && (
                            <span className="block text-[10px] text-orange-600 font-normal">+{overtimeHours.toFixed(1)}h extra</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            sh.estado === 'abierto' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'
                          }`}>
                            {sh.estado}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-neutral-600">
                          ${rate.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-neutral-900">
                          ${calculatedSalary.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-700">
                          ${(sh.ventasGeneradas || 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Pagado (${sh.sueldoTotal?.toFixed(2) || calculatedSalary.toFixed(2)})
                            </span>
                          ) : isClosed ? (
                            <button
                              type="button"
                              disabled={payingShiftId === sh.id}
                              onClick={() => handlePayShift(sh)}
                              className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs active:scale-95 transition disabled:opacity-50"
                            >
                              {payingShiftId === sh.id ? 'Pagando...' : `Pagar $${calculatedSalary.toFixed(2)}`}
                            </button>
                          ) : (
                            <span className="text-[10px] text-neutral-400 font-medium">Turno activo</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW 6: Zona de Peligro (Danger Zone) */}
        {activeTab === 'peligro' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-red-50 border-2 border-red-200 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center gap-3 text-red-700 mb-2">
                <Flame className="w-7 h-7 shrink-0" />
                <div>
                  <h3 className="text-lg font-black text-red-950">Zona de Peligro & Mantenimiento Crítico</h3>
                  <p className="text-xs text-red-700">
                    Operaciones irreversibles con eliminación en cascada. Siempre se presenta un resumen de impacto antes de confirmar.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {/* Opción 1: Reset de datos operativos por restaurante */}
                <div className="bg-white rounded-2xl p-5 border border-red-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-neutral-900 text-sm flex items-center gap-2">
                      <RotateCcw className="w-4 h-4 text-amber-600" />
                      Restablecer Datos Operativos del Restaurante Activo
                    </h4>
                    <p className="text-xs text-neutral-500 mt-1 max-w-xl">
                      Elimina todos los pedidos, gastos y turnos del restaurante seleccionado ({currentRestaurant?.nombre || 'Ninguno'}).
                      <strong> Mantiene intactos el menú, los empleados y las mesas.</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!currentRestaurant}
                    onClick={() => currentRestaurant && handleOpenDangerModal('reset_operational', currentRestaurant)}
                    className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 transition disabled:opacity-40"
                  >
                    Reset Operativo
                  </button>
                </div>

                {/* Opción 2: Eliminar un Restaurante con cascada completa */}
                <div className="bg-white rounded-2xl p-5 border border-red-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-neutral-900 text-sm flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-red-600" />
                      Eliminar Restaurante Seleccionado en Cascada
                    </h4>
                    <p className="text-xs text-neutral-500 mt-1 max-w-xl">
                      Elimina el local <strong>{currentRestaurant?.nombre}</strong> junto con todas sus mesas, empleados asociados, pedidos, gastos y turnos en Firestore.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!currentRestaurant}
                    onClick={() => currentRestaurant && handleOpenDangerModal('delete_restaurant', currentRestaurant)}
                    className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shrink-0 transition disabled:opacity-40"
                  >
                    Eliminar Sede Completa
                  </button>
                </div>

                {/* Opción 3: Limpiar Toda la Cuenta */}
                <div className="bg-red-950 text-white rounded-2xl p-5 border border-red-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-white text-sm flex items-center gap-2">
                      <Flame className="w-4 h-4 text-red-400" />
                      Eliminar Todos los Datos de la Cuenta (Empresarial)
                    </h4>
                    <p className="text-xs text-neutral-300 mt-1 max-w-xl">
                      Borra absolutamente todos los restaurantes, mesas, empleados, turnos, pedidos, menú y gastos. Devuelve la cuenta a estado virgen para volver al Onboarding inicial.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenDangerModal('delete_account')}
                    className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shrink-0 transition"
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
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
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
                  className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Dirección:</label>
                <input
                  type="text"
                  value={restForm.direccion}
                  onChange={(e) => setRestForm({ ...restForm, direccion: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Teléfono:</label>
                <input
                  type="text"
                  value={restForm.telefono}
                  onChange={(e) => setRestForm({ ...restForm, telefono: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-orange-500"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowRestModal(false)}
                className="flex-1 h-11 rounded-xl bg-neutral-100 font-bold text-xs text-neutral-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveRestaurant}
                className="flex-1 h-11 rounded-xl bg-orange-600 font-bold text-xs text-white"
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
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Tarifa por Hora ($):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={empForm.tarifaHora}
                    onChange={(e) => setEmpForm({ ...empForm, tarifaHora: parseFloat(e.target.value) || 0 })}
                    className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-bold"
                  />
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-neutral-100 space-y-4 my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
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

            <div className="space-y-3.5 max-h-[70vh] overflow-y-auto pr-1">
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
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Precio ($) *</label>
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
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Categoría</label>
                  <input
                    type="text"
                    value={menuForm.categoria}
                    onChange={(e) => setMenuForm({ ...menuForm, categoria: e.target.value })}
                    placeholder="Ej: Platos Fuertes, Bebidas..."
                    className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-bold"
                  />
                </div>
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
              <button
                type="button"
                disabled={isUploadingPhoto}
                onClick={() => setShowMenuModal(false)}
                className="flex-1 h-11 rounded-xl bg-neutral-100 hover:bg-neutral-200 font-bold text-xs text-neutral-700 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isUploadingPhoto || !menuForm.nombre.trim()}
                onClick={handleSaveMenuItem}
                className="flex-1 h-11 rounded-xl bg-orange-600 hover:bg-orange-700 font-bold text-xs text-white shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
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
                  {dangerModal.type === 'reset_operational' && 'Confirmar Reset Operativo'}
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
                {dangerModal.type === 'reset_operational' && (
                  <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                    ✓ Las mesas, menú y empleados NO serán eliminados.
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

    </div>
  );
};
