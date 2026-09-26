import { Business, Order } from '../types';

export interface TaxConfig {
  porcentajeImpuesto: number;
  impuestoIncluidoEnPrecio: boolean;
}

export interface OrderFinancialBreakdown {
  subtotal: number;
  descuento: number;
  baseImponible: number;
  impuesto: number;
  porcentajeImpuesto: number;
  impuestoIncluidoEnPrecio: boolean;
  propina: number;
  total: number;
}

let cachedBusinessTaxConfig: TaxConfig = {
  porcentajeImpuesto: 0,
  impuestoIncluidoEnPrecio: true,
};

export const setGlobalBusinessTaxConfig = (business?: Partial<Business> | null) => {
  if (!business) return;
  cachedBusinessTaxConfig = {
    porcentajeImpuesto: Math.max(0, Number(business.porcentajeImpuesto) || 0),
    impuestoIncluidoEnPrecio: business.impuestoIncluidoEnPrecio !== false,
  };
};

export const getGlobalBusinessTaxConfig = (): TaxConfig => cachedBusinessTaxConfig;

/**
 * Calcula el desglose de subtotal, impuesto (IVA/ITBIS/IGV), propina y total
 * respetando exactamente cómo se calculan hoy el subtotal y la propina.
 * - Si impuestoIncluidoEnPrecio === true: el subtotal ya incluye el impuesto;
 *   se desglosa el monto de impuesto contenido y el total sigue siendo (subtotal - descuento + propina).
 * - Si impuestoIncluidoEnPrecio === false: el impuesto se calcula sobre (subtotal - descuento)
 *   y se suma aparte al total: (subtotal - descuento + impuesto + propina).
 */
export const calculateTaxBreakdown = (params: {
  subtotal: number;
  descuento?: number | null;
  propina?: number | null;
  porcentajeImpuesto?: number | null;
  impuestoIncluidoEnPrecio?: boolean | null;
  business?: Partial<Business> | null;
}): OrderFinancialBreakdown => {
  const subtotal = Math.max(0, Number(params.subtotal) || 0);
  const descuento = Math.max(0, Number(params.descuento) || 0);
  const propina = Math.max(0, Number(params.propina) || 0);

  const pct =
    typeof params.porcentajeImpuesto === 'number'
      ? Math.max(0, params.porcentajeImpuesto)
      : typeof params.business?.porcentajeImpuesto === 'number'
      ? Math.max(0, params.business.porcentajeImpuesto)
      : cachedBusinessTaxConfig.porcentajeImpuesto;

  const incluido =
    typeof params.impuestoIncluidoEnPrecio === 'boolean'
      ? params.impuestoIncluidoEnPrecio
      : typeof params.business?.impuestoIncluidoEnPrecio === 'boolean'
      ? params.business.impuestoIncluidoEnPrecio
      : cachedBusinessTaxConfig.impuestoIncluidoEnPrecio;

  const netSubtotal = Math.max(0, subtotal - descuento);

  let impuesto = 0;
  let baseImponible = netSubtotal;
  let total = netSubtotal + propina;

  if (pct > 0 && netSubtotal > 0) {
    if (incluido) {
      // El precio de carta ya incluye el impuesto: extraemos la porción de impuesto para mostrarla por separado
      baseImponible = Number((netSubtotal / (1 + pct / 100)).toFixed(2));
      impuesto = Number((netSubtotal - baseImponible).toFixed(2));
      total = Number((netSubtotal + propina).toFixed(2));
    } else {
      // El impuesto se suma aparte al subtotal
      baseImponible = netSubtotal;
      impuesto = Number(((netSubtotal * pct) / 100).toFixed(2));
      total = Number((netSubtotal + impuesto + propina).toFixed(2));
    }
  } else {
    total = Number((netSubtotal + propina).toFixed(2));
  }

  return {
    subtotal: Number(subtotal.toFixed(2)),
    descuento: Number(descuento.toFixed(2)),
    baseImponible,
    impuesto,
    porcentajeImpuesto: pct,
    impuestoIncluidoEnPrecio: incluido,
    propina: Number(propina.toFixed(2)),
    total,
  };
};

/**
 * Obtiene el desglose fiscal de una orden existente (usando los valores guardados en el pedido
 * o la configuración actual del negocio como respaldo).
 */
export const getOrderTaxBreakdown = (
  order: Pick<Order, 'items' | 'subtotal' | 'descuento' | 'propina' | 'total' | 'impuesto' | 'porcentajeImpuesto' | 'impuestoIncluidoEnPrecio'>,
  business?: Partial<Business> | null
): OrderFinancialBreakdown => {
  const computedItemsSubtotal = (order.items || []).reduce(
    (sum, item) => sum + (Number(item.precio) || 0) * (Number(item.cantidad) || 1),
    0
  );
  const rawSubtotal =
    typeof order.subtotal === 'number' && order.subtotal > 0 ? order.subtotal : computedItemsSubtotal;

  const breakdown = calculateTaxBreakdown({
    subtotal: rawSubtotal,
    descuento: order.descuento,
    propina: order.propina,
    porcentajeImpuesto: order.porcentajeImpuesto,
    impuestoIncluidoEnPrecio: order.impuestoIncluidoEnPrecio,
    business,
  });

  // Si el pedido ya tenía un monto de impuesto explícito guardado, lo respetamos
  if (typeof order.impuesto === 'number' && order.impuesto >= 0 && typeof order.porcentajeImpuesto === 'number') {
    return {
      ...breakdown,
      impuesto: Number(order.impuesto.toFixed(2)),
      total: typeof order.total === 'number' && order.total > 0 ? Number(order.total.toFixed(2)) : breakdown.total,
    };
  }

  return breakdown;
};

/**
 * Calcula cuántos puntos de fidelidad se otorgan para un monto gastado según la configuración del negocio.
 * Por defecto: 1 punto por cada $10 gastados.
 */
export const calculateLoyaltyPointsForAmount = (
  amountSpent: number,
  business?: Partial<Business> | null
): number => {
  const cleanAmount = Math.max(0, Number(amountSpent) || 0);
  const unitThreshold = Math.max(1, Number(business?.fidelidadMontoPorPunto) || 10);
  const pointsPerUnit = Math.max(0, Number(business?.fidelidadPuntosPorUnidad ?? 1));
  if (cleanAmount <= 0 || pointsPerUnit <= 0) return 0;
  return Math.floor(cleanAmount / unitThreshold) * pointsPerUnit;
};
