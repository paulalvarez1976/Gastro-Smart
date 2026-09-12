export type Role = 'owner' | 'admin' | 'caja' | 'mesero' | 'cocina' | 'ayudante_cocina' | 'limpieza';
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
  creadoEn?: string;
}

export interface Employee {
  id: string;
  businessId?: string;
  restaurantId: string;
  nombre: string;
  puesto: Role;
  pin: string; // 4 dígitos
  tarifaHora: number;
  activo: boolean;
  creadoEn?: string;
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
  estado: 'abierto' | 'cerrado';
  pedidosTomados: number;
  ventasGeneradas: number;
  reporteLabores?: string;
  alertaExceso14h?: boolean;
  pagado?: boolean;
  montoPagadoSueldo?: number;
  fechaPago?: string;
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
}

export type OrderStatus =
  | 'pendiente_cocina'
  | 'aceptado'
  | 'en_preparacion'
  | 'listo'
  | 'entregado'
  | 'cobrado'
  | 'rechazado';

export type OrderType = 'local' | 'delivery' | 'para_llevar';
export type DeliveryCompany = 'PedidosYa' | 'UberEats' | 'Rappi' | 'Propio' | 'Otro';

export interface OrderItem {
  menuItemId: string;
  nombre: string;
  cantidad: number;
  precio: number;
  notas?: string | null;
  fotoUrl?: string | null;
  imagenUrl?: string | null;
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
  motivoRechazo?: string | null;
  metodoPago?: 'efectivo' | 'tarjeta' | 'transferencia' | null;
  montoPagado?: number;
  vuelto?: number;
  cajeroNombre?: string;
  creadoEn: string;
  aceptadoEn?: string;
  listoEn?: string;
  entregadoEn?: string;
  cobradoEn?: string;
  timeline?: OrderTimelineEvent[];
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

export interface Expense {
  id: string;
  businessId?: string;
  restaurantId: string;
  tipo: 'sueldo' | 'insumos' | 'servicios' | 'mantenimiento' | 'otro';
  monto: number;
  descripcion: string;
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
  tipo: 'fuerza_bruta_pin' | 'cambio_seguridad' | 'intruso';
  mensaje: string;
  fecha: string;
  leido: boolean;
}
