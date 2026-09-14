export type Role = 'owner' | 'admin' | 'caja' | 'mesero' | 'cocina' | 'ayudante_cocina' | 'limpieza' | 'mostrador';
export type UserRole = 'owner' | 'admin';

export const GASTRO_SMART_APP_ID = 'gastro_smart' as const;

export interface Business {
  id: string;
  nombre: string;
  rif_o_ruc: string;
  plan: 'basico' | 'pro';
  activo: boolean;
  creadoEn: string;
  ownerUid: string;
  appId?: 'gastro_smart';
  logoUrl?: string | null;
  email?: string;
  telefono?: string;
  direccion?: string;
}

export interface UserAccount {
  uid: string;
  email: string;
  nombre: string;
  rol: UserRole;
  businessId: string;
  restaurantId?: string | null;
  appId: 'gastro_smart';
  creadoEn: string;
  ultimoAcceso?: string;
  avatarUrl?: string | null;
}

export interface Restaurant {
  id: string;
  businessId?: string;
  nombre: string;
  direccion: string;
  telefono: string;
  numeroMesas?: number;
  activo: boolean;
  timeZone?: string;
  creadoEn?: string;
}

export type EmployeeSalaryType = 'por_horas' | 'por_dia' | 'mes' | 'fijo';

export interface Employee {
  id: string;
  businessId?: string;
  restaurantId: string;
  nombre: string;
  puesto: Role;
  pin: string; // 4 dígitos
  tarifaHora?: number;
  tarifaDiaria?: number;
  sueldoMensual?: number;
  modalidadPago?: EmployeeSalaryType;
  tipoSueldo?: EmployeeSalaryType; // legacy alias
  mesesPagados?: string[]; // ej. ['2026-09', '2026-08']
  activo: boolean;
  creadoEn?: string;
}

export interface PauseRecord {
  inicio: string;
  fin?: string;
  minutos?: number;
}

export interface Shift {
  id: string;
  businessId?: string;
  employeeId: string;
  employeeName?: string;
  employeePuesto?: Role;
  restaurantId: string;
  restaurantNombre?: string;
  fecha: string; // YYYY-MM-DD
  horaInicio: string; // ISO string o formato HH:mm
  horaFin?: string;
  minutosTrabajados?: number;
  estado: 'abierto' | 'cerrado' | 'en_pausa';
  pausas?: PauseRecord[];
  pausasMinutos?: number;
  pedidosTomados: number;
  ventasGeneradas: number;
  pedidosCobrados?: number;
  montoCobrado?: number;
  reporteLabores?: string;
  alertaExceso14h?: boolean;
  pagado?: boolean;
  montoPagadoSueldo?: number;
  fechaPago?: string;
  sueldoPagado?: boolean; // legacy alias
  sueldoTotal?: number; // legacy alias
  resumenSesion?: {
    horasTrabajadas: number;
    pedidosTomados: number;
    ventasGeneradas: number;
    pedidosCobrados?: number;
    montoCobrado?: number;
    horaInicio: string;
    horaFin?: string;
  };
}

export interface MenuItem {
  id: string;
  businessId?: string;
  restaurantId: string; // o 'all' si comparte
  nombre: string;
  descripcion: string;
  precio: number;
  categoria: string;
  disponible: boolean;
  requiereCocina?: boolean; // false para productos sin preparación en cocina (bebidas, postres listos, etc.)
  fotoUrl?: string | null;
  imagenUrl?: string | null;
}

export interface Client {
  id: string;
  businessId?: string;
  nombre: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  creadoEn?: string;
}

export interface Table {
  id: string;
  businessId?: string;
  restaurantId: string;
  numero: number;
  estado: 'libre' | 'ocupada';
  capacidad?: number;
  ubicacion?: string;
  comandaActivaId?: string | null;
}

export type OrderStatus =
  | 'pendiente_cocina'
  | 'aceptado'
  | 'en_preparacion'
  | 'listo'
  | 'entregado'
  | 'cobrado'
  | 'rechazado';

export type OrderRoute = 'express' | 'cocina' | 'mixto';

export type OrderType = 'local' | 'delivery' | 'para_llevar';
export type DeliveryCompany = 'PedidosYa' | 'UberEats' | 'Rappi' | 'Propio' | 'Otro';

export type ItemStatus =
  | 'pendiente_cocina'
  | 'aceptado'
  | 'en_preparacion'
  | 'listo'
  | 'entregado'
  | 'cobrado';

export interface OrderItem {
  id?: string;
  menuItemId: string;
  nombre: string;
  cantidad: number;
  precio: number;
  requiereCocina?: boolean;
  estadoItem?: 'pendiente' | 'listo' | 'entregado';
  estado?: ItemStatus; // Estado granular del item: pendiente_cocina, en_preparacion, listo, entregado, cobrado
  ronda?: number; // Número de ronda: 1, 2, 3...
  rondaEnviadaEn?: string; // Timestamp de envío de la ronda
  comensalId?: string | null; // ID del comensal: 'c1', 'c2', 'general', etc.
  comensalNombre?: string | null; // Nombre opcional (ej: 'Rosa', 'El señor del sombrero')
  comensalNumero?: number | null; // Número de comensal: 1..12
  cobrado?: boolean; // Indica si el item ya fue pagado en cobro dividido
  cobroId?: string | null;
  notas?: string | null;
  fotoUrl?: string | null;
  imagenUrl?: string | null;
}

export interface OrderDiner {
  id: string; // ej: 'c1', 'c2'
  numero: number; // 1, 2, 3...
  nombre?: string; // ej: 'Rosa', 'Carlos'
  telefono?: string; // opcional para vincular historial de cliente al cobrar
  pagado?: boolean;
  montoPagado?: number;
  total?: number;
}

export interface PartialPayment {
  id: string;
  tipo: 'comensal' | 'partes_iguales' | 'total' | 'general';
  comensalId?: string;
  comensalNombre?: string;
  comensalNumero?: number;
  items?: OrderItem[];
  monto: number;
  montoEntregado?: number;
  subtotal?: number;
  descuento?: number;
  propina?: number;
  total: number;
  metodoPago: 'efectivo' | 'tarjeta' | 'transferencia' | string;
  montoRecibido?: number;
  vuelto?: number;
  fecha: string;
  creadoEn?: string;
  cajeroNombre?: string;
  clienteNombre?: string;
  clienteTelefono?: string;
  ticketImpreso?: boolean;
  transaccionId?: string;
  numeroParte?: number;
  totalPartes?: number;
}

export interface OrderRound {
  numero: number;
  enviadoEn: string;
  meseroNombre?: string;
  estado: 'pendiente_cocina' | 'aceptado' | 'en_preparacion' | 'listo' | 'entregado';
  aceptadoEn?: string;
  enPreparacionEn?: string;
  listoEn?: string;
  entregadoEn?: string;
  itemsCount: number;
}

export interface OrderTimelineEvent {
  estado: OrderStatus;
  fecha: string;
  usuario: string;
  motivo?: string | null;
}

export interface Order {
  id: string;
  businessId?: string;
  restaurantId: string;
  meseroId: string;
  meseroNombre?: string;
  mesaId?: string | null;
  mesaNumero?: number | null;
  clienteId?: string | null;
  clienteNombre?: string;
  clienteTelefono?: string | null;
  clienteDireccion?: string | null;
  tipo: OrderType;
  empresaDelivery?: DeliveryCompany | string | null;
  items: OrderItem[];
  subtotal?: number;
  descuento?: number | null;
  propina?: number | null;
  total: number;
  estado: OrderStatus;
  ruta?: OrderRoute; // express (sin cocina), cocina (preparación estándar), mixto (ambos)
  estadoPago?: 'pendiente' | 'parcial' | 'cobrado'; // Control independiente de cobro vs entrega
  estadoEntrega?: 'pendiente' | 'entregado'; // Control de entrega en mostrador/mesa
  esVentaExpress?: boolean;
  motivoRechazo?: string | null;
  metodoPago?: 'efectivo' | 'tarjeta' | 'transferencia' | null;
  montoPagado?: number;
  vuelto?: number;
  cajeroNombre?: string;
  creadoEn: string;
  aceptadoEn?: string;
  enPreparacionEn?: string;
  listoEn?: string;
  entregadoEn?: string;
  cobradoEn?: string;
  timeline?: OrderTimelineEvent[];
  deliveryPaid?: boolean;
  deliveryPaidDate?: string;
  deliveryPayoutId?: string;
  rondaActual?: number; // Ronda más reciente (1, 2, 3...)
  rondas?: OrderRound[]; // Historial de rondas de la mesa
  comensales?: OrderDiner[]; // Comensales con nombre/código
  cobros?: PartialPayment[]; // Pagos parciales registrados
  montoCobradoAcumulado?: number; // Total pagado hasta el momento
  saldoPendiente?: number; // Cuánto falta por pagar
  fuga?: {
    motivo: string;
    usuario: string;
    fecha: string;
    montoPerdido: number;
  } | null;
}

export interface CashRegisterClose {
  id: string;
  businessId?: string;
  restaurantId: string;
  cajeroId: string;
  cajeroNombre: string;
  fecha: string;
  montoInicial: number;
  esperadoEfectivo: number;
  esperadoTarjeta: number;
  esperadoTransferencia: number;
  totalEsperado: number;
  conteoRealEfectivo: number;
  conteoRealTarjeta: number;
  conteoRealTransferencia: number;
  totalReal: number;
  diferencia: number;
  totalPedidosCobrados: number;
  notas?: string;
  creadoEn: string;
}

export type PurchaseUnit = 'kg' | 'litros' | 'unidades' | 'cajas';

export interface PurchaseItem {
  nombre: string;
  cantidad: number;
  unidad: PurchaseUnit | string;
  precioUnitario: number;
  subtotal: number;
}

export interface Supplier {
  id: string;
  businessId?: string;
  nombre: string;
  telefono?: string;
  contacto?: string;
  notas?: string;
  appId?: string;
  creadoEn?: string;
}

export type ExpenseType = 'sueldo' | 'insumos' | 'viveres' | 'transporte' | 'servicios' | 'mantenimiento' | 'otro' | 'otros';
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'transferencia' | 'credito' | 'otro';
export type TransportVehicleType = 'mototaxi' | 'moto propia' | 'auto' | 'delivery tercero' | 'otro' | string;

export interface Expense {
  id: string;
  businessId?: string;
  restaurantId: string;
  tipo: ExpenseType;
  monto: number;
  descripcion: string;
  vehiculo?: TransportVehicleType;
  compraVinculadaId?: string;
  compraVinculadaProveedor?: string;
  proveedor?: string;
  proveedorId?: string;
  proveedorTelefono?: string;
  metodoPago?: PaymentMethod;
  comprobanteUrl?: string;
  notas?: string;
  itemsCompra?: PurchaseItem[];
  registradoPor?: string;
  employeeId?: string;
  employeeName?: string;
  shiftId?: string;
  horasTrabajadas?: number;
  horasExtra?: number;
  tarifaHora?: number;
  fecha: string;
  creadoEn: string;
}

export interface LoginAttempt {
  id?: string;
  businessId?: string;
  restaurantId?: string;
  pinIntentado: string;
  fecha: string;
  resultado: 'fallido' | 'exitoso';
  motivo?: string;
  origen?: string;
}

export interface SecurityAlert {
  id: string;
  businessId: string;
  restaurantId?: string;
  restaurantNombre?: string;
  tipo: 'fuerza_bruta_pin' | 'cambio_seguridad' | 'intruso' | 'pago_delivery_conciliado' | 'pago_sueldos_generado';
  mensaje: string;
  fecha: string;
  leido: boolean;
  severidad?: 'baja' | 'media' | 'alta' | 'info';
  origen?: string;
  resuelta?: boolean;
}

export interface DailyChannelSales {
  local: number;
  pedidosYa: number;
  uberEats: number;
  rappi: number;
  propio: number;
  otro: number;
}

export interface DailyExpenseBreakdown {
  sueldos: number;
  viveres: number; // insumos / materias primas
  transporte: number; // logística y transporte
  servicios: number;
  mantenimiento: number;
  otros: number;
}

export interface DailyDishSale {
  nombre: string;
  cantidad: number;
  total: number;
}

export interface DailyStat {
  id: string; // `${businessId}_${restaurantId}_${fecha}`
  businessId: string;
  restaurantId: string;
  fecha: string; // YYYY-MM-DD
  ventasTotales: number;
  gastosTotales: number;
  gananciaNeta: number;
  pedidosCobrados: number;
  ticketPromedio: number;
  ventasPorCanal: DailyChannelSales;
  pedidosPorCanal: {
    local: number;
    pedidosYa: number;
    uberEats: number;
    rappi: number;
    propio: number;
    otro: number;
  };
  gastosPorTipo: DailyExpenseBreakdown;
  ventasPorHora: Record<string, { ventas: number; gastos: number; pedidos: number }>;
  topPlatos: DailyDishSale[];
  horasTrabajadasTotal: number;
  costoSueldosTurnos: number;
  appId: 'gastro_smart';
  creadoEn?: string;
  actualizadoEn?: string;
}

export type FinancialTimeframe = 'dia' | 'semana' | 'mes';

export interface FinancialKPI {
  actual: number;
  anterior: number;
  variacionPorcentaje: number; // e.g. +12.5% or -4.2%
}

export interface FinancialSummaryData {
  ventasTotales: FinancialKPI;
  gastosOperativos: FinancialKPI;
  gananciaNeta: FinancialKPI;
  margenPorcentaje: FinancialKPI;
  pedidosTotales: FinancialKPI;
  ticketPromedio: FinancialKPI;
  ventasPorCanal: {
    canal: string;
    nombre: string;
    monto: number;
    porcentaje: number;
    pedidos: number;
    color: string;
  }[];
  gastosPorTipo: {
    tipo: string;
    nombre: string;
    monto: number;
    porcentaje: number;
    color: string;
  }[];
  topPlatos: DailyDishSale[];
  horasTrabajadas: number;
  costoLaboral: number;
  ratioCostoLaboral: number; // (costoLaboral / ventas) * 100
  chartData: {
    label: string; // e.g. "12h", "Lun", "Semana 1"
    ventas: number;
    gastos: number;
    ganancia: number;
    pedidos?: number;
  }[];
  alertas: {
    id: string;
    tipo: 'warning' | 'info' | 'danger' | 'success';
    titulo: string;
    mensaje: string;
  }[];
  comparativaSucursales: {
    restaurantId: string;
    nombre: string;
    ventas: number;
    gastos: number;
    ganancia: number;
    pedidos: number;
    ticketPromedio: number;
    margen: number;
  }[];
}

