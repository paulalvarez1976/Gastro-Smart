import React, { useState, useRef } from 'react';
import { 
  Restaurant, 
  Expense, 
  ExpenseType, 
  PaymentMethod, 
  TransportVehicleType,
  Employee 
} from '../types';
import { createExpense } from '../services/dataService';
import { getRestaurantLocalDateString } from '../services/financialService';
import { compressImage } from '../utils/imageCompressor';
import { sounds } from '../utils/sound';
import { 
  X, 
  DollarSign, 
  Calendar, 
  Building2, 
  Truck, 
  Users, 
  Package, 
  Zap, 
  Wrench, 
  FileText, 
  Camera, 
  Upload, 
  Check, 
  AlertCircle,
  Link as LinkIcon,
  CreditCard,
  Banknote,
  Receipt
} from 'lucide-react';

interface NewExpenseModalProps {
  restaurants: Restaurant[];
  currentRestaurantId?: string;
  businessId: string;
  userDisplayName: string;
  employees?: Employee[];
  recentPurchases?: Expense[];
  onClose: () => void;
  onSuccess: () => void;
  onOpenDetailedPurchase?: () => void;
}

export const NewExpenseModal: React.FC<NewExpenseModalProps> = ({
  restaurants,
  currentRestaurantId,
  businessId,
  userDisplayName,
  employees = [],
  recentPurchases = [],
  onClose,
  onSuccess,
  onOpenDetailedPurchase
}) => {
  const defaultRestId = currentRestaurantId || restaurants[0]?.id || '';
  const currentRest = restaurants.find(r => r.id === defaultRestId);
  const defaultDate = getRestaurantLocalDateString(new Date(), currentRest?.timeZone);

  const [restaurantId, setRestaurantId] = useState<string>(defaultRestId);
  const [fecha, setFecha] = useState<string>(defaultDate);
  const [tipo, setTipo] = useState<ExpenseType>('transporte');
  const [monto, setMonto] = useState<string>('');
  const [descripcion, setDescripcion] = useState<string>('');
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('efectivo');
  const [notas, setNotas] = useState<string>('');

  // Campos específicos de Transporte
  const [vehiculo, setVehiculo] = useState<TransportVehicleType>('mototaxi');
  const [compraVinculadaId, setCompraVinculadaId] = useState<string>('');

  // Campos específicos de Sueldo
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  // Comprobante
  const [comprobanteFile, setComprobanteFile] = useState<File | Blob | null>(null);
  const [comprobantePreview, setComprobantePreview] = useState<string | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<boolean>(false);
  
  // Estado de envío
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtrar compras recientes de víveres para vincular transporte
  const groceryPurchases = recentPurchases.filter(e => 
    (e.tipo === 'viveres' || e.tipo === 'insumos') && 
    (!restaurantId || e.restaurantId === restaurantId)
  );

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingPhoto(true);
      const { blob, previewUrl } = await compressImage(file, 1200, 0.8);
      setComprobanteFile(blob);
      setComprobantePreview(previewUrl);
      sounds.playKeypadClick();
    } catch (err) {
      console.error('Error compressing receipt photo:', err);
      // Fallback
      setComprobanteFile(file);
      setComprobantePreview(URL.createObjectURL(file));
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    setComprobanteFile(null);
    setComprobantePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const numericMonto = parseFloat(monto);
    if (isNaN(numericMonto) || numericMonto <= 0) {
      setErrorMessage('Por favor ingresa un monto válido mayor a 0.');
      return;
    }

    if (!descripcion.trim() && tipo !== 'sueldo') {
      setErrorMessage('Por favor ingresa una descripción del gasto.');
      return;
    }

    if (!restaurantId) {
      setErrorMessage('Selecciona una sucursal para imputar el gasto.');
      return;
    }

    setIsSaving(true);
    try {
      let finalDescripcion = descripcion.trim();
      let empName: string | undefined = undefined;
      let empId: string | undefined = undefined;

      if (tipo === 'sueldo' && selectedEmployeeId) {
        const emp = employees.find(e => e.id === selectedEmployeeId);
        if (emp) {
          empName = emp.nombre;
          empId = emp.id;
          if (!finalDescripcion) {
            finalDescripcion = `Pago de sueldo / jornal a ${emp.nombre}`;
          }
        }
      }

      let linkedPurchaseInfo: string | undefined = undefined;
      if (tipo === 'transporte' && compraVinculadaId) {
        const p = groceryPurchases.find(gp => gp.id === compraVinculadaId);
        if (p) {
          linkedPurchaseInfo = p.proveedor || p.descripcion || 'Compra de víveres';
        }
      }

      // Si hay imagen local previsualizada, simular URL data o storage
      let comprobanteUrl: string | undefined = undefined;
      if (comprobantePreview) {
        comprobanteUrl = comprobantePreview;
      }

      const expensePayload: Omit<Expense, 'id'> = {
        businessId,
        restaurantId,
        tipo,
        monto: Math.round(numericMonto * 100) / 100,
        descripcion: finalDescripcion || (tipo === 'transporte' ? `Transporte en ${vehiculo}` : 'Gasto operativo'),
        metodoPago,
        fecha,
        registradoPor: userDisplayName,
        creadoEn: new Date().toISOString()
      };

      if (tipo === 'transporte') {
        expensePayload.vehiculo = vehiculo;
        if (compraVinculadaId) {
          expensePayload.compraVinculadaId = compraVinculadaId;
          expensePayload.compraVinculadaProveedor = linkedPurchaseInfo;
        }
      }

      if (empId) expensePayload.employeeId = empId;
      if (empName) expensePayload.employeeName = empName;
      if (notas.trim()) expensePayload.notas = notas.trim();
      if (comprobanteUrl) expensePayload.comprobanteUrl = comprobanteUrl;

      await createExpense(expensePayload);
      sounds.playCashRegister();
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving expense:', err);
      setErrorMessage(`Error al guardar el gasto: ${err.message || 'Intente nuevamente'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-neutral-100 overflow-hidden my-auto">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-neutral-900">Registrar Gasto Operativo</h3>
              <p className="text-[11px] text-neutral-500 font-medium">Imputación contable y sincronización con dailyStats</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-neutral-200/60 text-neutral-400 hover:text-neutral-700 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {errorMessage && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 font-bold animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Selector de Rubro / Tipo de Gasto */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-neutral-600 mb-2">
              Tipo de Gasto / Rubro
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              
              {/* Transporte */}
              <button
                type="button"
                onClick={() => { setTipo('transporte'); sounds.playKeypadClick(); }}
                className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition cursor-pointer ${
                  tipo === 'transporte'
                    ? 'bg-purple-50 border-purple-500 text-purple-900 ring-2 ring-purple-500/20 shadow-xs'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Truck className={`w-4 h-4 ${tipo === 'transporte' ? 'text-purple-600' : 'text-neutral-500'}`} />
                  {tipo === 'transporte' && <Check className="w-3.5 h-3.5 text-purple-600 font-bold" />}
                </div>
                <span className="text-xs font-black mt-1">Transporte</span>
                <span className="text-[10px] text-neutral-400">Logística, flete, reparto</span>
              </button>

              {/* Sueldos */}
              <button
                type="button"
                onClick={() => { setTipo('sueldo'); sounds.playKeypadClick(); }}
                className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition cursor-pointer ${
                  tipo === 'sueldo'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-900 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Users className={`w-4 h-4 ${tipo === 'sueldo' ? 'text-indigo-600' : 'text-neutral-500'}`} />
                  {tipo === 'sueldo' && <Check className="w-3.5 h-3.5 text-indigo-600 font-bold" />}
                </div>
                <span className="text-xs font-black mt-1">Sueldo / Personal</span>
                <span className="text-[10px] text-neutral-400">Jornal, adelanto, turno</span>
              </button>

              {/* Víveres */}
              <button
                type="button"
                onClick={() => { setTipo('viveres'); sounds.playKeypadClick(); }}
                className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition cursor-pointer ${
                  tipo === 'viveres'
                    ? 'bg-amber-50 border-amber-500 text-amber-900 ring-2 ring-amber-500/20 shadow-xs'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Package className={`w-4 h-4 ${tipo === 'viveres' ? 'text-amber-600' : 'text-neutral-500'}`} />
                  {tipo === 'viveres' && <Check className="w-3.5 h-3.5 text-amber-600 font-bold" />}
                </div>
                <span className="text-xs font-black mt-1">Víveres / Insumos</span>
                <span className="text-[10px] text-neutral-400">Compra de ingredientes</span>
              </button>

              {/* Servicios */}
              <button
                type="button"
                onClick={() => { setTipo('servicios'); sounds.playKeypadClick(); }}
                className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition cursor-pointer ${
                  tipo === 'servicios'
                    ? 'bg-cyan-50 border-cyan-500 text-cyan-900 ring-2 ring-cyan-500/20 shadow-xs'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Zap className={`w-4 h-4 ${tipo === 'servicios' ? 'text-cyan-600' : 'text-neutral-500'}`} />
                  {tipo === 'servicios' && <Check className="w-3.5 h-3.5 text-cyan-600 font-bold" />}
                </div>
                <span className="text-xs font-black mt-1">Servicios</span>
                <span className="text-[10px] text-neutral-400">Luz, agua, gas, internet</span>
              </button>

              {/* Mantenimiento */}
              <button
                type="button"
                onClick={() => { setTipo('mantenimiento'); sounds.playKeypadClick(); }}
                className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition cursor-pointer ${
                  tipo === 'mantenimiento'
                    ? 'bg-pink-50 border-pink-500 text-pink-900 ring-2 ring-pink-500/20 shadow-xs'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Wrench className={`w-4 h-4 ${tipo === 'mantenimiento' ? 'text-pink-600' : 'text-neutral-500'}`} />
                  {tipo === 'mantenimiento' && <Check className="w-3.5 h-3.5 text-pink-600 font-bold" />}
                </div>
                <span className="text-xs font-black mt-1">Mantenimiento</span>
                <span className="text-[10px] text-neutral-400">Reparación, equipos</span>
              </button>

              {/* Otros */}
              <button
                type="button"
                onClick={() => { setTipo('otros'); sounds.playKeypadClick(); }}
                className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition cursor-pointer ${
                  tipo === 'otros'
                    ? 'bg-neutral-900 border-neutral-900 text-white ring-2 ring-neutral-900/20 shadow-xs'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <FileText className={`w-4 h-4 ${tipo === 'otros' ? 'text-white' : 'text-neutral-500'}`} />
                  {tipo === 'otros' && <Check className="w-3.5 h-3.5 text-white font-bold" />}
                </div>
                <span className="text-xs font-black mt-1">Otros Gastos</span>
                <span className="text-[10px] opacity-70">Gastos varios</span>
              </button>

            </div>
          </div>

          {/* Banner sugerencia compra detallada para víveres */}
          {tipo === 'viveres' && onOpenDetailedPurchase && (
            <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-amber-900">
                <Receipt className="w-4 h-4 text-amber-700 shrink-0" />
                <span>¿Deseas desglosar items de insumos con cálculo por kilo/litro?</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDetailedPurchase();
                }}
                className="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] shrink-0 transition"
              >
                Abrir Compra Detallada
              </button>
            </div>
          )}

          {/* Campos Específicos para TRANSPORTE */}
          {tipo === 'transporte' && (
            <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-200/80 space-y-3">
              <div className="flex items-center gap-2 text-xs font-black text-purple-900">
                <Truck className="w-4 h-4 text-purple-600" />
                <span>Detalle de Transporte y Logística</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Vehículo */}
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                    Vehículo / Medio:
                  </label>
                  <select
                    value={vehiculo}
                    onChange={(e) => setVehiculo(e.target.value as any)}
                    className="w-full h-10 px-3 rounded-xl border border-purple-200 bg-white text-xs font-bold text-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="mototaxi">🛵 Mototaxi / Moto de carga</option>
                    <option value="moto propia">🏍️ Moto propia del local</option>
                    <option value="auto">🚗 Auto / Camioneta</option>
                    <option value="delivery tercero">📦 Delivery tercero (Uber/Mensajería)</option>
                    <option value="otro">🚚 Flete / Camión / Otro</option>
                  </select>
                </div>

                {/* Vincular a Compra de Víveres (Opcional) */}
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1 flex items-center gap-1">
                    <LinkIcon className="w-3 h-3 text-purple-600" />
                    <span>Vincular a Compra de Insumos:</span>
                  </label>
                  <select
                    value={compraVinculadaId}
                    onChange={(e) => setCompraVinculadaId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-purple-200 bg-white text-xs font-medium text-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">(Ninguna - Gasto logístico general)</option>
                    {groceryPurchases.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.fecha} - ${p.monto.toFixed(2)} ({p.proveedor || p.descripcion})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-[10px] text-purple-700 font-medium">
                💡 Nota: El importe de transporte se contabiliza de forma separada al costo de insumos para auditar con total precisión el costo logístico de la operación.
              </p>
            </div>
          )}

          {/* Campos Específicos para SUELDO */}
          {tipo === 'sueldo' && (
            <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 space-y-3">
              <div className="flex items-center gap-2 text-xs font-black text-indigo-900">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Empleado Beneficiario</span>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                  Seleccionar Empleado:
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => {
                    setSelectedEmployeeId(e.target.value);
                    const emp = employees.find(emp => emp.id === e.target.value);
                    if (emp && !descripcion) {
                      setDescripcion(`Pago de sueldo a ${emp.nombre}`);
                    }
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-indigo-200 bg-white text-xs font-bold text-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">(Seleccionar de la plantilla o escribir descripción)</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre} ({emp.puesto}) - {emp.tipoSueldo === 'fijo' ? `Fijo $${emp.sueldoMensual || 0}/mes` : `$${emp.tarifaHora || 0}/h`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Fila: Monto, Fecha, Sucursal */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            
            {/* Monto */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                Monto Total ($): <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-neutral-300 font-mono font-bold text-sm text-neutral-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-hidden"
                  required
                />
              </div>
            </div>

            {/* Fecha */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                Fecha del Gasto: <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-neutral-300 font-bold text-xs text-neutral-800 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-hidden"
                  required
                />
              </div>
            </div>

            {/* Sucursal */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                Sucursal: <span className="text-rose-500">*</span>
              </label>
              <select
                value={restaurantId}
                onChange={(e) => setRestaurantId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-neutral-300 font-bold text-xs text-neutral-800 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-hidden"
                required
              >
                {restaurants.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>

          </div>

          {/* Descripción */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-700 mb-1">
              Descripción / Concepto: <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder={tipo === 'transporte' ? 'Ej: Flete de insumos desde mercado mayorista' : 'Ej: Pago de gas mensual o servicio técnico'}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-neutral-300 text-xs font-semibold text-neutral-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-hidden"
              required
            />
          </div>

          {/* Método de Pago y Comprobante */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            
            {/* Método de pago */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                Método de Pago:
              </label>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as any)}
                className="w-full h-10 px-3 rounded-xl border border-neutral-300 font-bold text-xs text-neutral-800 focus:ring-2 focus:ring-orange-500 outline-hidden"
              >
                <option value="efectivo">💵 Efectivo (Caja chica)</option>
                <option value="transferencia">🏦 Transferencia bancaria</option>
                <option value="tarjeta">💳 Tarjeta de débito/crédito</option>
                <option value="credito">⏳ Crédito comercial</option>
                <option value="otro">🧾 Otro medio</option>
              </select>
            </div>

            {/* Subida de foto comprobante */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                Foto del Recibo / Ticket (Opcional):
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoSelect}
                className="hidden"
              />

              {comprobantePreview ? (
                <div className="h-10 px-3 rounded-xl border border-emerald-300 bg-emerald-50 flex items-center justify-between text-xs text-emerald-800">
                  <span className="truncate font-bold flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" />
                    Recibo adjunto
                  </span>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="text-rose-600 hover:text-rose-800 font-black ml-2 cursor-pointer"
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessingPhoto}
                  className="w-full h-10 px-3 rounded-xl border border-dashed border-neutral-300 hover:border-neutral-400 bg-neutral-50 hover:bg-neutral-100 text-neutral-600 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-neutral-500" />
                  <span>{isProcessingPhoto ? 'Procesando...' : 'Adjuntar ticket / recibo'}</span>
                </button>
              )}
            </div>

          </div>

          {/* Notas Opcionales */}
          <div>
            <label className="block text-[11px] font-bold text-neutral-700 mb-1">
              Notas Adicionales (Opcional):
            </label>
            <input
              type="text"
              placeholder="Detalles complementarios para auditoría contable"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs text-neutral-800 focus:ring-2 focus:ring-orange-500 outline-hidden"
            />
          </div>

          {/* Botones de Acción */}
          <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-neutral-600 hover:bg-neutral-100 text-xs font-bold transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black transition flex items-center gap-2 shadow-sm shadow-orange-600/25 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Guardando...' : 'Guardar Gasto'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
