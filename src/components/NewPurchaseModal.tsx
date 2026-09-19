import React, { useState, useEffect, useRef } from 'react';
import { Restaurant, Supplier, PurchaseItem, PurchaseUnit, PaymentMethod, Expense } from '../types';
import { createExpense, subscribeToSuppliers, createSupplier } from '../services/dataService';
import { uploadReceiptPhoto } from '../services/storageService';
import { sounds } from '../utils/sound';
import { 
  X, 
  Plus, 
  Trash2, 
  Camera, 
  Upload, 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Receipt, 
  DollarSign, 
  Calendar, 
  Store, 
  CreditCard, 
  Phone, 
  FileText,
  RefreshCw,
  Eye,
  Check
} from 'lucide-react';

interface NewPurchaseModalProps {
  restaurants: Restaurant[];
  currentRestaurantId?: string;
  businessId: string;
  userDisplayName: string;
  onClose: () => void;
  onSuccess?: (createdExpense: Expense) => void;
}

const COMMON_UNITS: PurchaseUnit[] = ['kg', 'litros', 'unidades', 'cajas'];
const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'credito', label: 'Crédito' },
];

export const NewPurchaseModal: React.FC<NewPurchaseModalProps> = ({
  restaurants,
  currentRestaurantId,
  businessId,
  userDisplayName,
  onClose,
  onSuccess,
}) => {
  // 1. Campos del formulario
  const [fecha, setFecha] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [restaurantId, setRestaurantId] = useState<string>(() => {
    if (currentRestaurantId && currentRestaurantId !== 'all') return currentRestaurantId;
    return restaurants[0]?.id || '';
  });

  // 2. Proveedores
  const [registeredSuppliers, setRegisteredSuppliers] = useState<Supplier[]>([]);
  const [supplierInput, setSupplierInput] = useState<string>('');
  const [supplierPhone, setSupplierPhone] = useState<string>('');
  const [isNewSupplierMode, setIsNewSupplierMode] = useState<boolean>(false);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState<boolean>(false);

  // 3. Items dinámicos
  const [items, setItems] = useState<PurchaseItem[]>([
    { nombre: '', cantidad: 1, unidad: 'kg', precioUnitario: 0, subtotal: 0 }
  ]);

  // 4. Método de pago y notas
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('efectivo');
  const [notas, setNotas] = useState<string>('');

  // 5. Foto / Recibo y Escaneo Inteligente con IA
  const [receiptImageFile, setReceiptImageFile] = useState<File | Blob | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [isScanningAI, setIsScanningAI] = useState<boolean>(false);
  const [scanMessage, setScanMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 6. Cámara en vivo
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 7. Estado de guardado
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Cargar lista de proveedores en tiempo real
  useEffect(() => {
    if (!businessId) return;
    const unsub = subscribeToSuppliers(businessId, (list) => {
      setRegisteredSuppliers(list);
    });
    return () => unsub();
  }, [businessId]);

  // Apagar la cámara al desmontar
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const startCamera = async () => {
    setScanMessage(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('La cámara no está disponible en este navegador o contexto.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(console.warn);
        }
      }, 100);
    } catch (err: any) {
      console.warn('No se pudo acceder a la cámara en vivo:', err);
      // Abrir selector de archivo con captura de cámara del sistema como fallback
      if (fileInputRef.current) {
        fileInputRef.current.click();
      } else {
        setScanMessage({
          type: 'error',
          text: 'No se pudo iniciar la cámara en vivo. Puedes subir una foto del ticket con el botón de archivo.'
        });
      }
    }
  };

  const capturePhotoFromCamera = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopCameraStream();

    canvas.toBlob((blob) => {
      if (blob) {
        setReceiptImageFile(blob);
        const preview = URL.createObjectURL(blob);
        setReceiptPreviewUrl(preview);
        // Procesar automáticamente con IA
        processTicketWithAI(blob);
      }
    }, 'image/jpeg', 0.88);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptImageFile(file);
    const preview = URL.createObjectURL(file);
    setReceiptPreviewUrl(preview);
    setScanMessage(null);
    processTicketWithAI(file);
  };

  // Enviar imagen a Gemini backend para escaneo inteligente
  const processTicketWithAI = async (imageSource: File | Blob) => {
    setIsScanningAI(true);
    setScanMessage(null);
    sounds.playKeypadClick();

    try {
      // Convertir a base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageSource);
      });

      const base64Data = await base64Promise;

      const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
      const endpointUrl = `${apiBaseUrl}/api/scan-receipt`;

      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Data,
          mimeType: imageSource.type || 'image/jpeg'
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || 'No se pudo extraer la información del ticket.');
      }

      const scanned = result.data;

      // 1. Proveedor
      if (scanned.proveedor) {
        setSupplierInput(scanned.proveedor);
      }
      if (scanned.telefono) {
        setSupplierPhone(scanned.telefono);
      }

      // 2. Fecha
      if (scanned.fecha) {
        setFecha(scanned.fecha);
      }

      // 3. Método de pago
      if (scanned.metodoPago && ['efectivo', 'tarjeta', 'transferencia', 'credito'].includes(scanned.metodoPago)) {
        setMetodoPago(scanned.metodoPago as PaymentMethod);
      }

      // 4. Notas
      if (scanned.notas) {
        setNotas((prev) => (prev ? `${prev} | ${scanned.notas}` : scanned.notas));
      }

      // 5. Items detectados
      if (Array.isArray(scanned.items) && scanned.items.length > 0) {
        const parsedItems: PurchaseItem[] = scanned.items.map((it: any) => {
          const qty = Number(it.cantidad) || 1;
          const price = Number(it.precioUnitario) || 0;
          const sub = it.subtotal ? Number(it.subtotal) : Math.round(qty * price * 100) / 100;
          return {
            nombre: it.nombre || 'Insumo',
            cantidad: qty,
            unidad: it.unidad || 'kg',
            precioUnitario: price,
            subtotal: sub
          };
        });
        setItems(parsedItems);
      }

      sounds.playCashRegister();
      setScanMessage({
        type: 'success',
        text: `¡Ticket escaneado con éxito! Se extrajeron ${scanned.items?.length || 0} items y datos del proveedor.`
      });
    } catch (err: any) {
      console.warn('Error en escaneo IA:', err);
      setScanMessage({
        type: 'error',
        text: err.message || 'No se pudo leer automáticamente el ticket. Puedes completar los campos manualmente.'
      });
    } finally {
      setIsScanningAI(false);
    }
  };

  // Manejo de filas de items
  const handleItemChange = (index: number, field: keyof PurchaseItem, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      if (field === 'cantidad' || field === 'precioUnitario') {
        const qty = field === 'cantidad' ? Number(value) || 0 : item.cantidad;
        const price = field === 'precioUnitario' ? Number(value) || 0 : item.precioUnitario;
        item.subtotal = Math.round(qty * price * 100) / 100;
      }

      updated[index] = item;
      return updated;
    });
  };

  const handleAddItem = () => {
    sounds.playKeypadClick();
    setItems((prev) => [
      ...prev,
      { nombre: '', cantidad: 1, unidad: 'kg', precioUnitario: 0, subtotal: 0 }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    sounds.playKeypadClick();
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Cálculo del total en vivo
  const totalCompra = items.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0);

  // Manejo de autocompletado de proveedor
  const filteredSuppliers = registeredSuppliers.filter(s =>
    s.nombre.toLowerCase().includes(supplierInput.toLowerCase())
  );

  const selectSupplier = (supplier: Supplier) => {
    setSupplierInput(supplier.nombre);
    if (supplier.telefono) setSupplierPhone(supplier.telefono);
    setShowSupplierDropdown(false);
    setIsNewSupplierMode(false);
  };

  // Guardar compra
  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    // Validaciones
    if (!restaurantId) {
      setSaveError('Por favor selecciona la sucursal correspondiente.');
      return;
    }

    const cleanSupplier = supplierInput.trim();
    if (!cleanSupplier) {
      setSaveError('Por favor indica el nombre del proveedor.');
      return;
    }

    const validItems = items.filter(it => it.nombre.trim() !== '');
    if (validItems.length === 0) {
      setSaveError('Debes agregar al menos un insumo con nombre.');
      return;
    }

    if (totalCompra <= 0) {
      setSaveError('El total de la compra debe ser mayor a 0.');
      return;
    }

    setIsSaving(true);
    sounds.playKeypadClick();

    try {
      // 1. Si es un nuevo proveedor o tiene teléfono nuevo, asegurar registro en directorio
      if (cleanSupplier) {
        try {
          await createSupplier({
            nombre: cleanSupplier,
            telefono: supplierPhone.trim(),
            businessId,
            creadoEn: new Date().toISOString()
          });
        } catch (suppErr) {
          console.warn('Aviso proveedor:', suppErr);
        }
      }

      // 2. Subir foto a Firebase Storage si existe
      let comprobanteUrl: string | undefined = undefined;
      if (receiptImageFile) {
        const tempExpenseId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        try {
          comprobanteUrl = await uploadReceiptPhoto(restaurantId, tempExpenseId, receiptImageFile);
        } catch (uploadErr) {
          console.warn('No se pudo subir foto a Firebase Storage, continuando sin comprobante:', uploadErr);
        }
      }

      // 3. Crear documento de gasto de víveres/insumos
      const itemsResumen = validItems.length === 1 
        ? `1 item (${validItems[0].nombre})` 
        : `${validItems.length} items`;
      const descripcion = `${itemsResumen} - Proveedor ${cleanSupplier}`;

      const expensePayload: Omit<Expense, 'id'> = {
        businessId,
        restaurantId,
        tipo: 'viveres',
        monto: Math.round(totalCompra * 100) / 100,
        descripcion,
        fecha: `${fecha}T12:00:00.000Z`,
        proveedor: cleanSupplier,
        proveedorTelefono: supplierPhone.trim() || undefined,
        metodoPago,
        comprobanteUrl,
        notas: notas.trim() || undefined,
        itemsCompra: validItems.map(it => ({
          nombre: it.nombre.trim(),
          cantidad: Number(it.cantidad) || 0,
          unidad: it.unidad || 'kg',
          precioUnitario: Number(it.precioUnitario) || 0,
          subtotal: Number(it.subtotal) || 0
        })),
        registradoPor: userDisplayName,
        creadoEn: new Date().toISOString()
      };

      const docRef = await createExpense(expensePayload);
      sounds.playCashRegister();

      if (onSuccess) {
        onSuccess({ id: docRef.id, ...expensePayload });
      }

      onClose();
    } catch (err: any) {
      console.error('Error al registrar compra de insumos:', err);
      setSaveError(err.message || 'Error al guardar la compra en el sistema.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-neutral-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        
        {/* Header del Modal */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shadow-inner">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">
                Nueva Compra de Insumos / Víveres
              </h2>
              <p className="text-xs text-emerald-100 font-medium">
                Registro detallado con auditoría de proveedores y comprobante
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo del Formulario con scroll */}
        <form onSubmit={handleSavePurchase} className="p-5 sm:p-6 overflow-y-auto space-y-5 grow">
          
          {/* BANNER DE ESCANEO INTELIGENTE CON CÁMARA */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-4 shadow-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-extrabold text-neutral-900">
                    Escaneo inteligente de ticket con IA
                  </h3>
                  <p className="text-[11px] text-neutral-600">
                    Toma una foto al ticket y Gemini completará automáticamente proveedor, items y precios.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={startCamera}
                  disabled={isScanningAI || isCameraActive}
                  className="flex-1 sm:flex-initial h-9 px-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Usar Cámara</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isScanningAI}
                  className="flex-1 sm:flex-initial h-9 px-3.5 rounded-xl bg-white hover:bg-amber-100/50 text-amber-800 border border-amber-300 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Subir Foto</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </div>
            </div>

            {/* VISTA EN VIVO DE LA CÁMARA */}
            {isCameraActive && (
              <div className="mt-3 relative rounded-2xl overflow-hidden bg-black border-2 border-amber-400 aspect-video max-h-64 flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={capturePhotoFromCamera}
                    className="h-11 px-5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs shadow-lg flex items-center gap-2 cursor-pointer transition transform active:scale-95"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Tomar Foto del Ticket</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopCameraStream}
                    className="h-11 px-4 rounded-full bg-neutral-900/80 hover:bg-neutral-900 text-white font-bold text-xs shadow cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* INDICADOR DE CARGA IA */}
            {isScanningAI && (
              <div className="mt-3 p-3 bg-white/90 rounded-xl border border-amber-300 flex items-center gap-3 animate-pulse">
                <Loader2 className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
                <div className="text-xs text-amber-900 font-semibold">
                  Analizando recibo con Gemini 3.8 Flash... Extrayendo proveedor, items, cantidades y totales.
                </div>
              </div>
            )}

            {/* MENSAJES DE ESTADO DE ESCANEO */}
            {scanMessage && (
              <div
                className={`mt-2.5 p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  scanMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {scanMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{scanMessage.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setScanMessage(null)}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  ✕
                </button>
              </div>
            )}

            {/* MINIATURA DEL COMPROBANTE CARGADO */}
            {receiptPreviewUrl && !isCameraActive && (
              <div className="mt-3 flex items-center gap-3 bg-white p-2.5 rounded-xl border border-neutral-200">
                <img
                  src={receiptPreviewUrl}
                  alt="Ticket escaneado"
                  className="w-14 h-14 object-cover rounded-lg border border-neutral-300 shadow-xs"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-neutral-800 truncate">
                    Foto del comprobante vinculada
                  </div>
                  <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                    <Check className="w-3 h-3" /> Se guardará en Firebase Storage
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => receiptImageFile && processTicketWithAI(receiptImageFile)}
                    disabled={isScanningAI}
                    title="Volver a escanear con IA"
                    className="p-1.5 text-neutral-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptImageFile(null);
                      setReceiptPreviewUrl(null);
                    }}
                    title="Quitar foto"
                    className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* CAMPOS SUPERIORES: FECHA Y SUCURSAL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* 1. Fecha */}
            <div>
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-600 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                <span>Fecha de Compra</span>
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                required
                className="w-full h-10 px-3.5 rounded-xl border border-neutral-300 bg-white text-xs font-bold text-neutral-800 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
            </div>

            {/* 2. Sucursal */}
            <div>
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-600 mb-1.5 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-orange-600" />
                <span>Sucursal de Destino</span>
              </label>
              <select
                value={restaurantId}
                onChange={(e) => setRestaurantId(e.target.value)}
                required
                className="w-full h-10 px-3.5 rounded-xl border border-neutral-300 bg-white text-xs font-bold text-neutral-800 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden cursor-pointer"
              >
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    📍 {r.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. PROVEEDOR (SELECTOR CON AUTOCOMPLETADO + NUEVO PROVEEDOR) */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-blue-600" />
                <span>Proveedor</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsNewSupplierMode(!isNewSupplierMode);
                  setShowSupplierDropdown(false);
                }}
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer flex items-center gap-1"
              >
                <span>{isNewSupplierMode ? 'Buscar en registrados' : '＋ Nuevo proveedor'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Nombre del Proveedor con Autocompletado */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Ej. Distribuidora Mar S.A., La Vega Mayorista"
                  value={supplierInput}
                  onChange={(e) => {
                    setSupplierInput(e.target.value);
                    setShowSupplierDropdown(true);
                  }}
                  onFocus={() => setShowSupplierDropdown(true)}
                  required
                  className="w-full h-10 px-3.5 rounded-xl border border-neutral-300 bg-white text-xs font-bold text-neutral-800 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />

                {/* Dropdown de autocompletado */}
                {showSupplierDropdown && !isNewSupplierMode && filteredSuppliers.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-xl border border-neutral-200 shadow-xl max-h-48 overflow-y-auto">
                    {filteredSuppliers.map((supp) => (
                      <button
                        key={supp.id}
                        type="button"
                        onClick={() => selectSupplier(supp)}
                        className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 flex items-center justify-between border-b border-neutral-100 last:border-b-0 cursor-pointer"
                      >
                        <div>
                          <div className="text-xs font-bold text-neutral-800">{supp.nombre}</div>
                          {supp.telefono && (
                            <div className="text-[10px] text-neutral-500">Tel: {supp.telefono}</div>
                          )}
                        </div>
                        <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                          Elegir
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Teléfono opcional del Proveedor */}
              <div>
                <input
                  type="text"
                  placeholder="Teléfono del proveedor (opcional)"
                  value={supplierPhone}
                  onChange={(e) => setSupplierPhone(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl border border-neutral-300 bg-white text-xs font-medium text-neutral-800 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* 4. ITEMS COMPRADOS (LISTA DINÁMICA) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                <span>Items Comprados ({items.length})</span>
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar item</span>
              </button>
            </div>

            {/* Cabecera de la tabla de items en pantallas medianas */}
            <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-2 text-[10px] font-extrabold uppercase tracking-wider text-neutral-500">
              <div className="col-span-5">Nombre del Insumo</div>
              <div className="col-span-2">Cantidad</div>
              <div className="col-span-2">Unidad</div>
              <div className="col-span-2">Precio Unit. ($)</div>
              <div className="col-span-1 text-right">Subtotal</div>
            </div>

            {/* Filas dinámicas */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2.5 sm:p-2 bg-neutral-50 rounded-xl border border-neutral-200/80 flex flex-col sm:grid sm:grid-cols-12 gap-2 items-start sm:items-center"
                >
                  {/* Nombre del insumo */}
                  <div className="w-full sm:col-span-5">
                    <input
                      type="text"
                      placeholder="Ej. Pescado fresco, Limón, Aceite"
                      value={item.nombre}
                      onChange={(e) => handleItemChange(idx, 'nombre', e.target.value)}
                      required
                      className="w-full h-8 px-2.5 rounded-lg border border-neutral-300 bg-white text-xs font-bold text-neutral-800 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Cantidad y Unidad en móviles */}
                  <div className="w-full sm:w-auto sm:col-span-4 grid grid-cols-2 gap-2">
                    <div>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        placeholder="Cant."
                        value={item.cantidad || ''}
                        onChange={(e) => handleItemChange(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                        required
                        className="w-full h-8 px-2 rounded-lg border border-neutral-300 bg-white text-xs font-bold text-neutral-800 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden text-center"
                      />
                    </div>
                    <div>
                      <select
                        value={item.unidad}
                        onChange={(e) => handleItemChange(idx, 'unidad', e.target.value)}
                        className="w-full h-8 px-1.5 rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-neutral-800 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden cursor-pointer"
                      >
                        {COMMON_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Precio Unitario */}
                  <div className="w-full sm:w-auto sm:col-span-2">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 text-xs font-bold">$</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0.00"
                        value={item.precioUnitario || ''}
                        onChange={(e) => handleItemChange(idx, 'precioUnitario', parseFloat(e.target.value) || 0)}
                        required
                        className="w-full h-8 pl-5 pr-2 rounded-lg border border-neutral-300 bg-white text-xs font-mono font-bold text-neutral-800 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  {/* Subtotal y Botón eliminar */}
                  <div className="w-full sm:col-span-1 flex items-center justify-between sm:justify-end gap-2">
                    <span className="text-xs font-mono font-extrabold text-neutral-900">
                      ${(Number(item.subtotal) || 0).toFixed(2)}
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                        title="Eliminar fila"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* BARRA DE TOTAL EN VIVO */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
              <div className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider">
                Total de la Compra:
              </div>
              <div className="text-lg font-black font-mono text-emerald-800">
                ${totalCompra.toFixed(2)}
              </div>
            </div>
          </div>

          {/* 5. MÉTODO DE PAGO Y NOTAS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Método de pago */}
            <div>
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-600 mb-1.5 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-neutral-600" />
                <span>Método de Pago</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((pm) => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setMetodoPago(pm.id)}
                    className={`h-9 rounded-xl text-xs font-bold transition flex items-center justify-center border cursor-pointer ${
                      metodoPago === pm.id
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    <span>{pm.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Notas opcionales */}
            <div>
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-600 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-neutral-600" />
                <span>Notas u Observaciones</span>
              </label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Número de factura, condición de entrega, lote..."
                rows={2}
                className="w-full p-2.5 rounded-xl border border-neutral-300 bg-white text-xs text-neutral-800 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* MENSAJE DE ERROR AL GUARDAR */}
          {saveError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* BOTONES DE ACCIÓN INFERIORES */}
          <div className="pt-3 border-t border-neutral-200 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="h-11 px-5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || totalCompra <= 0}
              className="h-11 px-7 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando Compra...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Guardar Compra (${totalCompra.toFixed(2)})</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
