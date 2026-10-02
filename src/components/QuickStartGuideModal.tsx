import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  UtensilsCrossed,
  Receipt,
  ChefHat,
  BarChart3,
  Lightbulb,
  Bell,
  Clock,
  Printer,
  Boxes,
  HelpCircle,
  Play,
  RotateCcw,
  Store,
  Layers,
  ShieldCheck,
  Zap,
  DollarSign,
  FileArchive,
  ArrowRight
} from 'lucide-react';
import { sounds } from '../utils/sound';

export type GuideRole = 'mesero' | 'caja' | 'cocina' | 'admin';

interface QuickStartGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRole?: GuideRole | string;
  onNavigateToTab?: (tab: string) => void;
}

interface GuideStep {
  stepNumber: number;
  title: string;
  badge: string;
  description: string;
  keyPoints: string[];
  proTip: string;
  icon: React.ComponentType<{ className?: string }>;
  interactiveActionLabel?: string;
  targetTab?: string;
}

const ROLE_GUIDES: Record<GuideRole, {
  roleName: string;
  roleSubtitle: string;
  badgeColor: string;
  headerGradient: string;
  icon: React.ComponentType<{ className?: string }>;
  steps: GuideStep[];
}> = {
  mesero: {
    roleName: 'Atención & Mesero (TPV)',
    roleSubtitle: 'Guía paso a paso para la toma eficiente de comandas en mesa y delivery',
    badgeColor: 'bg-orange-100 text-orange-800 border-orange-200',
    headerGradient: 'from-amber-600 via-orange-600 to-amber-700',
    icon: UtensilsCrossed,
    steps: [
      {
        stepNumber: 1,
        title: 'Selección de Mesa, Comensal o Modo Delivery',
        badge: 'Paso 1 de 4',
        description: 'Al iniciar la toma de pedido, selecciona si atenderás una Mesa en Salón, una orden Express (Mostrador) o un pedido Delivery.',
        keyPoints: [
          'Visualiza el estado de las mesas en tiempo real (Libre, Ocupada, Cuenta solicitada).',
          'Toma la orden agrupada por Comensales (#1, #2...) dentro de la misma mesa.',
          'Usa el botón "+ Tomar Nuevo Pedido" para comenzar en cualquier momento.'
        ],
        proTip: 'Tocar una mesa ocupada te permite agregar rondas adicionales de platos o imprimir la Pre-Cuenta.',
        icon: Store,
        interactiveActionLabel: 'Ir a Selección de Mesas',
        targetTab: 'pos'
      },
      {
        stepNumber: 2,
        title: 'Toma de Pedidos & Notas de Cocina',
        badge: 'Paso 2 de 4',
        description: 'Navega por las categorías del menú o usa el buscador instantáneo para añadir platos y bebidas a la orden.',
        keyPoints: [
          'Personaliza cada plato con notas especiales (ej. "Sin cebolla", "Salsa aparte").',
          'Agrega modificadores o extras con costo adicional de forma intuitiva.',
          'Ajusta cantidades rápidamente con los botones (+ / -).'
        ],
        proTip: 'Puedes cambiar el destino de preparación (Cocina KDS vs Express de barra) plato por plato.',
        icon: UtensilsCrossed,
        interactiveActionLabel: 'Ver Carta en TPV'
      },
      {
        stepNumber: 3,
        title: 'Enviado por Rondas a Cocina vs Express',
        badge: 'Paso 3 de 4',
        description: 'Presiona "Enviar a Cocina" para transmitir los platos seleccionados directamente al KDS de preparación.',
        keyPoints: [
          'El sistema admite rondas de servicio (Ronda 1: Entradas, Ronda 2: Fondos, Ronda 3: Postres).',
          'Los ítems marcados como Express (bebidas, licores) van directo a la barra.',
          'Cocina recibe una alerta sonora inmediata con la nueva comanda.'
        ],
        proTip: 'En la pestaña "Mis Pedidos" puedes hacer seguimiento al estado de cada plato en tiempo real.',
        icon: Zap
      },
      {
        stepNumber: 4,
        title: 'Pre-cuenta, Cierre & Alertas de Platos Listos',
        badge: 'Paso 4 de 4',
        description: 'Recibe notificaciones cuando Cocina termine de preparar los platos y emite la Pre-cuenta antes de pasar a la Caja.',
        keyPoints: [
          'La barra superior emitirá una señal sonora e indicará "Platos listos para recoger".',
          'Genera la Pre-cuenta dividida por comensal para entregar al cliente en mesa.',
          'El cajero podrá visualizar la cuenta lista para cobro sin necesidad de digitar todo.'
        ],
        proTip: 'Haz clic en "Ver Mis Pedidos" para consultar tu historial activo del turno.',
        icon: CheckCircle2,
        interactiveActionLabel: 'Ver Mis Pedidos Activos',
        targetTab: 'mis_pedidos'
      }
    ]
  },
  caja: {
    roleName: 'Caja & Cobros (Facturación)',
    roleSubtitle: 'Operación diaria de cobro, medios de pago, tickets y arqueo de caja',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    headerGradient: 'from-blue-700 via-indigo-700 to-blue-800',
    icon: Receipt,
    steps: [
      {
        stepNumber: 1,
        title: 'Apertura de Turno & Cola de Pedidos por Cobrar',
        badge: 'Paso 1 de 4',
        description: 'Ingresa tu fondo de caja inicial al abrir turno. Todos los pedidos enviados por los meseros aparecerán en tu cola de cobro.',
        keyPoints: [
          'Filtra comandas por número de mesa, nombre de cliente o código de orden.',
          'Diferencia entre pedidos de Salón, Llevar (Mostrador) y Delivery.',
          'Visualiza la pre-cuenta enviada por el mesero con cálculo automático de impuestos.'
        ],
        proTip: 'Puedes aperturar el turno con el fondo asignado y auditar las operaciones en cualquier momento.',
        icon: Receipt,
        interactiveActionLabel: 'Ver Cola de Cobro'
      },
      {
        stepNumber: 2,
        title: 'Procesamiento Multi-Medio de Pago',
        badge: 'Paso 2 de 4',
        description: 'Selecciona la forma de pago deseada y procesa la transacción de manera limpia y segura.',
        keyPoints: [
          'Medios soportados: Efectivo (calcula vuelto), Tarjetas (VISA/MC), Apps (Yape/Plin/MercadoPago) o Cuentas por Cobrar (Fiado).',
          'Soporta Pagos Divididos (ej. $20 en efectivo + $30 en tarjeta).',
          'Aplica descuentos autorizados o propina voluntaria al instante.'
        ],
        proTip: 'El sistema calcula el vuelto exacto para evitar errores en entregas de dinero en efectivo.',
        icon: DollarSign
      },
      {
        stepNumber: 3,
        title: 'Emisión de Tickets Térmicos & Envío por WhatsApp',
        badge: 'Paso 3 de 4',
        description: 'Imprime el comprobante en la impresora térmica Bluetooth/USB o envíalo digitalmente al cliente.',
        keyPoints: [
          'Conexión directa con impresoras de 58mm y 80mm.',
          'Opción de enviar comprobante digital directamente al WhatsApp del cliente.',
          'Desglose claro de subtotal, IVA/Impuesto y método de pago.'
        ],
        proTip: 'Usa el botón "Reimprimir Comprobante" si el cliente requiere un duplicado.',
        icon: Printer
      },
      {
        stepNumber: 4,
        title: 'Conciliación Delivery & Cierre de Caja (Arqueo Z)',
        badge: 'Paso 4 de 4',
        description: 'Al finalizar la jornada, realiza la conciliación de repartidores y efectúa el Arqueo de Caja oficial.',
        keyPoints: [
          'Liquida repartidores en la pestaña "Conciliación Delivery".',
          'Ingresa el conteo de dinero físico para detectar diferencias o descuadres.',
          'Descarga el reporte Z oficial en PDF para auditoría y contabilidad.'
        ],
        proTip: 'Cerrar el turno libera la caja y emite el balance completo de ventas del cajero.',
        icon: ShieldCheck,
        interactiveActionLabel: 'Ver Conciliación Delivery'
      }
    ]
  },
  cocina: {
    roleName: 'Cocina & Preparación (KDS)',
    roleSubtitle: 'Monitoreo de comandas en tiempo real, rondas de servicio y stock crítico',
    badgeColor: 'bg-orange-100 text-orange-900 border-orange-300',
    headerGradient: 'from-orange-700 via-amber-700 to-red-800',
    icon: ChefHat,
    steps: [
      {
        stepNumber: 1,
        title: 'Visualización de Comandas por Rondas & Mesas',
        badge: 'Paso 1 de 4',
        description: 'Las comandas enviadas por los meseros ingresan instantáneamente a la pantalla KDS ordenadas por rondas.',
        keyPoints: [
          'Tarjetas organizadas con cronómetro visible de tiempo transcurrido.',
          'Nivel de urgencia resaltado (Verde < 10 min, Naranja 10-20 min, Rojo > 20 min).',
          'Filtra comandas por estados: "Nuevos", "En Preparación" y "Para Recoger".'
        ],
        proTip: 'Las rondas permiten a la cocina enfocarse en las entradas antes de servir los platos fuertes.',
        icon: ChefHat
      },
      {
        stepNumber: 2,
        title: 'Aceptar, Preparar & Marcar Platos Listos',
        badge: 'Paso 2 de 4',
        description: 'Haz clic en "Aceptar / Empezar" para notificar el inicio de preparación y "Listo" cuando salga del pase.',
        keyPoints: [
          'Cambia el estado de la comanda completa o de platos individuales.',
          'Meseros y Mostrador reciben una notificación visual/sonora cuando marcas "Listo".',
          'Imprime comanda térmica de cocina directamente desde la tarjeta si es necesario.'
        ],
        proTip: 'Marcar platos individualmente ayuda cuando una mesa tiene preparaciones con tiempos muy diferentes.',
        icon: Clock
      },
      {
        stepNumber: 3,
        title: 'Alertas Sonoras & Mantener Pantalla Encendida (WakeLock)',
        badge: 'Paso 3 de 4',
        description: 'Ajusta el volumen y tonos de alerta de la cocina para no perder ningún pedido entrante.',
        keyPoints: [
          'Elige entre tonos de Campana, Buzzer, Chime o Sirena en el botón "Alertas Cocina".',
          'Activa el modo "Pantalla Siempre Encendida (WakeLock)" para evitar que la tablet se suspenda.',
          'Usa el botón rápido de Silencio/ON según el flujo de la cocina.'
        ],
        proTip: 'Si la cocina es ruidosa, incrementa el volumen de la alarma sonora desde los ajustes de la barra superior.',
        icon: Bell
      },
      {
        stepNumber: 4,
        title: 'Franja de Alerta Automática de Ingredientes Críticos',
        badge: 'Paso 4 de 4',
        description: 'Si un insumo del inventario alcanza su stock mínimo, la cocina verá un banner rojo de advertencia superior.',
        keyPoints: [
          'Notificación automática sin necesidad de refrescar la pantalla.',
          'Muestra qué insumos están agotados o en stock mínimo (ej. Queso Mozzarella: 1 kg).',
          'Permite a la cocina informar a los meseros antes de ofrecer un plato sin insumo.'
        ],
        proTip: 'La franja roja superior emite un sonido ligero cuando un ingrediente entra en umbral crítico.',
        icon: Boxes
      }
    ]
  },
  admin: {
    roleName: 'Administrador & Propietario',
    roleSubtitle: 'Gestión integral multi-sede, métricas P&L, menú, inventarios y respaldos .ZIP',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    headerGradient: 'from-purple-800 via-indigo-800 to-neutral-900',
    icon: BarChart3,
    steps: [
      {
        stepNumber: 1,
        title: 'Panel P&L, Tendencia de Ventas & Comparativa Multi-Sede',
        badge: 'Paso 1 de 4',
        description: 'Visualiza la salud financiera de la empresa, ventas en tiempo real, gráficas Recharts y comparativa entre locales.',
        keyPoints: [
          'Revisa ventas, costos operativos y margen neto en la pestaña "Indicadores & Finanzas".',
          'Compara el desempeño de distintas sucursales en paralelismo con gráficas de barras.',
          'Filtra informes por rangos de fecha predefinidos o personalizados.'
        ],
        proTip: 'Utiliza la vista "Comparativa de Sucursales & Consolidado" para identificar tu sede con mejor margen.',
        icon: BarChart3,
        interactiveActionLabel: 'Ver Indicadores P&L',
        targetTab: 'indicadores'
      },
      {
        stepNumber: 2,
        title: 'Gestión de Carta, Menú, Recetas & Auditoría',
        badge: 'Paso 2 de 4',
        description: 'Crea platos, define precios, asigna categorías, configura si van a Cocina o Express, e ingresa sus recetas.',
        keyPoints: [
          'Configura insumos necesarios por plato para el descuento automático de stock.',
          'Revisa la pestaña "Auditoría de Menú & Stock" para cambios de precio o ediciones no autorizadas.',
          'Imprime o exporta la carta del restaurante en formato PDF.'
        ],
        proTip: 'Asignar recetas a cada plato permite calcular el costo real de producción (Food Cost).',
        icon: UtensilsCrossed,
        interactiveActionLabel: 'Gestionar Menú',
        targetTab: 'menu'
      },
      {
        stepNumber: 3,
        title: 'Control de Inventario & Umbrales de Stock Mínimo',
        badge: 'Paso 3 de 4',
        description: 'Administra insumos, proveedores, costos de compra y establece los límites de stock crítico (`stockMinimo`).',
        keyPoints: [
          'Establece umbrales de alerta para recibir advertencias antes de que se agoten los ingredientes.',
          'Realiza ajustes de stock rápido y reabastecimiento en segundos.',
          'El sistema notifica automáticamente a la Cocina cuando un ingrediente llega a su límite.'
        ],
        proTip: 'Un ingrediente con stock en 0 o bajo el mínimo generará avisos preventivos en el panel de meseros.',
        icon: Boxes,
        interactiveActionLabel: 'Ver Inventario',
        targetTab: 'inventario'
      },
      {
        stepNumber: 4,
        title: 'Respaldo Completo .ZIP & Gestión de Empleados / PINs',
        badge: 'Paso 4 de 4',
        description: 'Descarga copias de seguridad integrales de la empresa y administra accesos y PINs de seguridad.',
        keyPoints: [
          'Usa el botón "Perfil & Respaldo .ZIP" para descargar todas las comandas, finanzas y menú en un archivo comprimido.',
          'Crea empleados con PINs individuales y asigna permisos por rol (Mesero, Caja, Cocina, Admin).',
          'Monitorea el registro de auditoría de seguridad para intentos de PIN erróneos.'
        ],
        proTip: 'Descargar el respaldo .ZIP semanalmente garantiza una copia sin conexión de toda tu operación.',
        icon: FileArchive,
        interactiveActionLabel: 'Ver Perfil y Respaldo .ZIP',
        targetTab: 'perfil'
      }
    ]
  }
};

export const QuickStartGuideModal: React.FC<QuickStartGuideModalProps> = ({
  isOpen,
  onClose,
  initialRole = 'mesero',
  onNavigateToTab
}) => {
  // Mapear rol a clave interna
  const normalizedRole: GuideRole = (() => {
    const r = (initialRole || 'mesero').toString().toLowerCase();
    if (r === 'caja' || r === 'cajero' || r === 'mostrador') return 'caja';
    if (r === 'cocina' || r === 'ayudante_cocina' || r === 'kds') return 'cocina';
    if (r === 'admin' || r === 'owner' || r === 'superadmin' || r === 'propietario') return 'admin';
    return 'mesero';
  })();

  const [activeRole, setActiveRole] = useState<GuideRole>(normalizedRole);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(false);

  // Sincronizar rol si cambia prop
  useEffect(() => {
    setActiveRole(normalizedRole);
    setCurrentStepIndex(0);
  }, [initialRole, isOpen]);

  if (!isOpen) return null;

  const currentRoleData = ROLE_GUIDES[activeRole] || ROLE_GUIDES.mesero;
  const currentStep = currentRoleData.steps[currentStepIndex] || currentRoleData.steps[0];
  const totalSteps = currentRoleData.steps.length;

  const HeaderIcon = currentRoleData.icon;
  const StepIcon = currentStep.icon;

  const handleNextStep = () => {
    sounds.playKeypadClick();
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevStep = () => {
    sounds.playKeypadClick();
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const handleSelectRoleTab = (roleKey: GuideRole) => {
    sounds.playKeypadClick();
    setActiveRole(roleKey);
    setCurrentStepIndex(0);
  };

  const handleComplete = () => {
    sounds.playSuccess();
    if (dontShowAgain) {
      try {
        localStorage.setItem(`gastro_guide_seen_${activeRole}`, 'true');
        localStorage.setItem('gastro_guide_seen_global', 'true');
      } catch (e) {}
    }
    onClose();
  };

  const handleActionClick = () => {
    sounds.playKeypadClick();
    handleComplete();
    if (currentStep.targetTab && onNavigateToTab) {
      onNavigateToTab(currentStep.targetTab);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh]">
        
        {/* ======================================================== */}
        {/* HEADER MODAL DE GUÍA                                     */}
        {/* ======================================================== */}
        <div className={`px-5 py-4 bg-gradient-to-r ${currentRoleData.headerGradient} text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 shrink-0`}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-white shadow-inner shrink-0">
              <HeaderIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-base sm:text-lg tracking-tight text-white flex items-center gap-1.5">
                  <span>Guía de Inicio Rápido</span>
                  <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                </h2>
              </div>
              <p className="text-xs text-white/80 line-clamp-1 mt-0.5">
                {currentRoleData.roleSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-black/20 hover:bg-black/40 text-white/80 hover:text-white flex items-center justify-center transition cursor-pointer"
              title="Cerrar Guía"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* SELECTOR DE ROLES EN GUÍA (MESERO, CAJA, COCINA, ADMIN) */}
        {/* ======================================================== */}
        <div className="px-4 py-2.5 bg-neutral-100 border-b border-neutral-200 flex items-center gap-1.5 overflow-x-auto shrink-0">
          <span className="text-[11px] font-black uppercase text-neutral-500 tracking-wider mr-1 hidden md:inline">
            Seleccionar Rol:
          </span>
          {(['mesero', 'caja', 'cocina', 'admin'] as GuideRole[]).map(roleKey => {
            const isActive = activeRole === roleKey;
            const roleMeta = ROLE_GUIDES[roleKey];
            const Icon = roleMeta.icon;
            return (
              <button
                key={roleKey}
                type="button"
                onClick={() => handleSelectRoleTab(roleKey)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-neutral-900 text-white shadow-xs font-black'
                    : 'bg-white text-neutral-700 hover:bg-neutral-200 border border-neutral-200/80'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-neutral-500'}`} />
                <span className="capitalize">{roleKey === 'admin' ? 'Administrador' : roleKey}</span>
              </button>
            );
          })}
        </div>

        {/* ======================================================== */}
        {/* BARRA DE PROGRESO DE PASOS (PASO X DE 4)                */}
        {/* ======================================================== */}
        <div className="px-6 py-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold uppercase tracking-wider">
              {currentStep.badge}
            </span>
            <span className="text-xs font-black text-neutral-800 hidden sm:inline">
              {currentStep.title}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {currentRoleData.steps.map((s, idx) => (
              <button
                key={s.stepNumber}
                type="button"
                onClick={() => { sounds.playKeypadClick(); setCurrentStepIndex(idx); }}
                className={`w-3 h-3 rounded-full transition cursor-pointer ${
                  idx === currentStepIndex
                    ? 'bg-orange-600 ring-2 ring-orange-300 scale-125'
                    : idx < currentStepIndex
                      ? 'bg-emerald-500'
                      : 'bg-neutral-300 hover:bg-neutral-400'
                }`}
                title={`Ir al Paso ${s.stepNumber}: ${s.title}`}
              />
            ))}
          </div>
        </div>

        {/* ======================================================== */}
        {/* CONTENIDO DEL PASO SELECCIONADO                          */}
        {/* ======================================================== */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Card Encabezado del Paso */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-neutral-50 to-orange-50/40 border border-neutral-200 flex items-start gap-3.5 shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-orange-600 text-white flex items-center justify-center font-black shadow-sm shrink-0 mt-0.5">
              <StepIcon className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-black text-neutral-900 tracking-tight">
                {currentStep.stepNumber}. {currentStep.title}
              </h3>
              <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                {currentStep.description}
              </p>
            </div>
          </div>

          {/* Lista de Puntos Clave */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-black uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Funcionalidades Clave de la Interfaz:</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {currentStep.keyPoints.map((point, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-white border border-neutral-200/90 text-xs font-semibold text-neutral-800 flex items-start gap-2.5 shadow-2xs hover:border-orange-200 transition"
                >
                  <span className="w-5 h-5 rounded-lg bg-orange-100 text-orange-700 font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="leading-snug">{point}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ProTip Destacado */}
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs flex items-start gap-3 shadow-2xs">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0 font-black">
              <Lightbulb className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <span className="font-black uppercase tracking-wider text-[10px] text-amber-800 block mb-0.5">
                💡 Consejo Profesional de Productividad:
              </span>
              <p className="font-semibold text-amber-900 leading-snug">
                {currentStep.proTip}
              </p>
            </div>
          </div>

          {/* Botón Acción Interactiva si existe */}
          {currentStep.interactiveActionLabel && (
            <div className="p-3 rounded-2xl bg-neutral-900 text-white flex items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-2 text-xs font-bold text-neutral-300">
                <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                <span>¿Deseas probar esta sección directamente?</span>
              </div>
              <button
                type="button"
                onClick={handleActionClick}
                className="px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-black transition flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
              >
                <span>{currentStep.interactiveActionLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

        </div>

        {/* ======================================================== */}
        {/* FOOTER NAVEGACIÓN ENTRE PASOS                           */}
        {/* ======================================================== */}
        <div className="px-5 py-3.5 bg-neutral-100 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <label className="flex items-center gap-2 text-xs text-neutral-600 font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={e => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-neutral-300 cursor-pointer"
            />
            <span>No mostrar esta guía automáticamente al iniciar sesión</span>
          </label>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {currentStepIndex > 0 && (
              <button
                type="button"
                onClick={handlePrevStep}
                className="px-4 py-2 rounded-xl bg-white hover:bg-neutral-200 text-neutral-800 border border-neutral-300 text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>
            )}

            {currentStepIndex < totalSteps - 1 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-orange-600/20 cursor-pointer"
              >
                <span>Siguiente Paso</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleComplete}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Entendido, ¡Comenzar!</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
