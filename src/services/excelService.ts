import * as XLSX from 'xlsx';
import { 
  FinancialSummaryData, 
  DailyStat, 
  Expense, 
  Order, 
  Restaurant 
} from '../types';

export interface PayrollEmployeeRow {
  empleadoId: string;
  nombre: string;
  puesto: string;
  sucursal: string;
  tarifaHora: number;
  horasNormales: number;
  horasExtra: number;
  horasTotales: number;
  totalNormal: number;
  totalExtra: number;
  totalPagar: number;
  turnosContados: number;
  estadoPago: string;
}

/**
 * Exporta el reporte financiero completo a Excel con 4 hojas:
 * 1. Resumen
 * 2. Ventas por día
 * 3. Gastos detallados
 * 4. Delivery
 */
export function exportFinancialReportToExcel(params: {
  businessName: string;
  periodLabel: string;
  summary: FinancialSummaryData;
  dailyStats: DailyStat[];
  expenses: Expense[];
  orders: Order[];
  restaurants: Restaurant[];
  selectedBranchName: string;
}): void {
  const {
    businessName,
    periodLabel,
    summary,
    dailyStats,
    expenses,
    orders,
    restaurants,
    selectedBranchName
  } = params;

  const wb = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // HOJA 1: RESUMEN
  // -------------------------------------------------------------
  const resumenRows = [
    ['GASTRO SMART - REPORTE FINANCIERO EJECUTIVO'],
    ['Negocio:', businessName],
    ['Sucursal:', selectedBranchName],
    ['Periodo:', periodLabel],
    ['Fecha de Generación:', new Date().toLocaleString()],
    [],
    ['KPI', 'Periodo Actual', 'Periodo Anterior', 'Variación %'],
    [
      'Ventas Totales',
      summary.ventasTotales.actual,
      summary.ventasTotales.anterior,
      `${summary.ventasTotales.variacionPorcentaje > 0 ? '+' : ''}${summary.ventasTotales.variacionPorcentaje}%`
    ],
    [
      'Gastos Operativos',
      summary.gastosOperativos.actual,
      summary.gastosOperativos.anterior,
      `${summary.gastosOperativos.variacionPorcentaje > 0 ? '+' : ''}${summary.gastosOperativos.variacionPorcentaje}%`
    ],
    [
      'Ganancia Neta',
      summary.gananciaNeta.actual,
      summary.gananciaNeta.anterior,
      `${summary.gananciaNeta.variacionPorcentaje > 0 ? '+' : ''}${summary.gananciaNeta.variacionPorcentaje}%`
    ],
    [
      'Margen %',
      `${summary.margenPorcentaje.actual}%`,
      `${summary.margenPorcentaje.anterior}%`,
      `${summary.margenPorcentaje.variacionPorcentaje > 0 ? '+' : ''}${summary.margenPorcentaje.variacionPorcentaje}%`
    ],
    [
      'Pedidos Totales',
      summary.pedidosTotales.actual,
      summary.pedidosTotales.anterior,
      `${summary.pedidosTotales.variacionPorcentaje > 0 ? '+' : ''}${summary.pedidosTotales.variacionPorcentaje}%`
    ],
    [
      'Ticket Promedio',
      summary.ticketPromedio.actual,
      summary.ticketPromedio.anterior,
      `${summary.ticketPromedio.variacionPorcentaje > 0 ? '+' : ''}${summary.ticketPromedio.variacionPorcentaje}%`
    ],
    [],
    ['DESGLOSE DE GASTOS POR TIPO'],
    ['Tipo', 'Monto', '% del Total'],
    ...summary.gastosPorTipo.map(g => [g.nombre, g.monto, `${g.porcentaje}%`]),
    [],
    ['VENTAS POR CANAL'],
    ['Canal', 'Monto', '% del Total', 'Pedidos'],
    ...summary.ventasPorCanal.map(c => [c.nombre, c.monto, `${c.porcentaje}%`, c.pedidos]),
    [],
    ['TOP 5 PLATOS MÁS VENDIDOS'],
    ['Plato', 'Unidades Vendidas', 'Monto Total'],
    ...(summary.topPlatos || []).slice(0, 5).map(p => [p.nombre, p.cantidad, p.total])
  ];

  const wsResumen = XLSX.utils.aoa_to_sheet(resumenRows);
  wsResumen['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  // -------------------------------------------------------------
  // HOJA 2: VENTAS POR DÍA
  // -------------------------------------------------------------
  const restMap = new Map(restaurants.map(r => [r.id, r.nombre]));
  const sortedStats = [...dailyStats].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const ventasDiaHeaders = ['Fecha', 'Sucursal', 'Ventas ($)', 'Gastos ($)', 'Ganancia ($)', 'Pedidos', 'Ticket Promedio ($)'];
  const ventasDiaRows = sortedStats.map(st => [
    st.fecha,
    restMap.get(st.restaurantId) || st.restaurantId,
    st.ventasTotales,
    st.gastosTotales,
    st.gananciaNeta,
    st.pedidosCobrados,
    st.ticketPromedio
  ]);

  const wsVentasDia = XLSX.utils.aoa_to_sheet([
    ['REPORTE DE VENTAS POR DÍA'],
    [`Generado: ${new Date().toLocaleDateString()}`],
    [],
    ventasDiaHeaders,
    ...ventasDiaRows
  ]);
  wsVentasDia['!cols'] = [{ wch: 14 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsVentasDia, 'Ventas por día');

  // -------------------------------------------------------------
  // HOJA 3: GASTOS DETALLADOS
  // -------------------------------------------------------------
  const gastosHeaders = ['Fecha', 'Sucursal', 'Tipo', 'Descripción / Insumo', 'Proveedor / Empleado', 'Método Pago', 'Cantidad', 'Unidad', 'Precio Unit ($)', 'Monto ($)'];
  const sortedExpenses = [...expenses].sort((a, b) => new Date(b.fecha || b.creadoEn).getTime() - new Date(a.fecha || a.creadoEn).getTime());
  
  const gastosRows: any[][] = [];

  sortedExpenses.forEach(exp => {
    const fechaStr = (exp.fecha || exp.creadoEn || '').split('T')[0];
    const sucursalStr = restMap.get(exp.restaurantId) || exp.restaurantId || 'General';
    const proveedorOEmpleado = exp.proveedor || exp.employeeName || 'No especificado';
    const metodoPagoStr = exp.metodoPago ? exp.metodoPago.toUpperCase() : '-';

    // Fila principal de la compra o gasto
    gastosRows.push([
      fechaStr,
      sucursalStr,
      (exp.tipo === 'viveres' || exp.tipo === 'insumos') ? 'COMPRA VÍVERES' : exp.tipo.toUpperCase(),
      exp.descripcion,
      proveedorOEmpleado,
      metodoPagoStr,
      '-',
      '-',
      '-',
      exp.monto
    ]);

    // Si tiene itemsCompra desglosados (compra de víveres/insumos detallada), listar cada item en filas separadas
    if (exp.itemsCompra && exp.itemsCompra.length > 0) {
      exp.itemsCompra.forEach(item => {
        gastosRows.push([
          '',
          '',
          '   ↳ Item compra',
          `• ${item.nombre}`,
          exp.proveedor || '',
          '',
          item.cantidad,
          item.unidad,
          item.precioUnitario,
          item.subtotal
        ]);
      });
    }
  });

  const wsGastos = XLSX.utils.aoa_to_sheet([
    ['DETALLE DE GASTOS OPERATIVOS Y COMPRAS DE INSUMOS'],
    [`Total registros: ${expenses.length} | Exportado el: ${new Date().toLocaleDateString()}`],
    [],
    gastosHeaders,
    ...gastosRows
  ]);
  wsGastos['!cols'] = [
    { wch: 14 }, 
    { wch: 22 }, 
    { wch: 18 }, 
    { wch: 35 }, 
    { wch: 24 }, 
    { wch: 14 }, 
    { wch: 10 }, 
    { wch: 10 }, 
    { wch: 14 }, 
    { wch: 14 }
  ];
  XLSX.utils.book_append_sheet(wb, wsGastos, 'Gastos detallados');

  // -------------------------------------------------------------
  // HOJA 4: DELIVERY
  // -------------------------------------------------------------
  const deliveryOrders = orders.filter(o => o.tipo === 'delivery' && o.estado === 'cobrado');
  
  // Agrupar por empresa
  const deliveryCompanies = ['PedidosYa', 'UberEats', 'Rappi', 'Propio', 'Otro'];
  const defaultCommissions: Record<string, number> = {
    PedidosYa: 18,
    UberEats: 20,
    Rappi: 22,
    Propio: 0,
    Otro: 10
  };

  const deliveryData = deliveryCompanies.map(comp => {
    const compOrders = deliveryOrders.filter(o => {
      const c = (o.empresaDelivery || '').toLowerCase();
      if (comp === 'PedidosYa') return c.includes('pedidos') || c.includes('ya');
      if (comp === 'UberEats') return c.includes('uber');
      if (comp === 'Rappi') return c.includes('rappi');
      if (comp === 'Propio') return c.includes('propio');
      return !c.includes('pedidos') && !c.includes('ya') && !c.includes('uber') && !c.includes('rappi') && !c.includes('propio');
    });

    const pedidosCount = compOrders.length;
    const ventasBrutas = compOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const commRate = defaultCommissions[comp] || 0;
    const montoComision = (ventasBrutas * commRate) / 100;
    const netoRecibir = ventasBrutas - montoComision;

    return {
      empresa: comp,
      pedidos: pedidosCount,
      ventasBrutas: Math.round(ventasBrutas * 100) / 100,
      comisionPorcentaje: `${commRate}%`,
      montoComision: Math.round(montoComision * 100) / 100,
      netoRecibir: Math.round(netoRecibir * 100) / 100
    };
  });

  const deliveryHeaders = ['Empresa Delivery', 'Pedidos Cobrados', 'Ventas Brutas ($)', '% Comisión', 'Monto Comisión ($)', 'Neto a Recibir ($)'];
  const deliveryRows = deliveryData.map(d => [
    d.empresa,
    d.pedidos,
    d.ventasBrutas,
    d.comisionPorcentaje,
    d.montoComision,
    d.netoRecibir
  ]);

  const totalBrutas = deliveryData.reduce((s, d) => s + d.ventasBrutas, 0);
  const totalComision = deliveryData.reduce((s, d) => s + d.montoComision, 0);
  const totalNeto = deliveryData.reduce((s, d) => s + d.netoRecibir, 0);

  const wsDelivery = XLSX.utils.aoa_to_sheet([
    ['LIQUIDACIÓN Y CONCILIACIÓN DE DELIVERY'],
    [`Periodo: ${periodLabel}`],
    [],
    deliveryHeaders,
    ...deliveryRows,
    [],
    ['TOTALES', deliveryOrders.length, totalBrutas, '', totalComision, totalNeto]
  ]);
  wsDelivery['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsDelivery, 'Delivery');

  // Guardar archivo
  const safeBusinessName = businessName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safePeriod = periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `GastroSmart_${safeBusinessName}_${safePeriod}.xlsx`;

  XLSX.writeFile(wb, fileName);
}

/**
 * Exporta la planilla de horas y asistencia a Excel
 */
export function exportPayrollToExcel(params: {
  businessName: string;
  periodLabel: string;
  selectedBranchName: string;
  rows: PayrollEmployeeRow[];
}): void {
  const { businessName, periodLabel, selectedBranchName, rows } = params;
  const wb = XLSX.utils.book_new();

  const headers = [
    'Empleado',
    'Puesto',
    'Sucursal',
    'Tarifa Hora ($)',
    'Horas Normales',
    'Horas Extra (1.5x)',
    'Horas Totales',
    'Total Normal ($)',
    'Total Extra ($)',
    'Total a Pagar ($)',
    'Turnos Registrados',
    'Estado'
  ];

  const dataRows = rows.map(r => [
    r.nombre,
    r.puesto.toUpperCase(),
    r.sucursal,
    r.tarifaHora,
    r.horasNormales,
    r.horasExtra,
    r.horasTotales,
    r.totalNormal,
    r.totalExtra,
    r.totalPagar,
    r.turnosContados,
    r.estadoPago
  ]);

  const totalHorasNormales = rows.reduce((s, r) => s + r.horasNormales, 0);
  const totalHorasExtra = rows.reduce((s, r) => s + r.horasExtra, 0);
  const totalHoras = rows.reduce((s, r) => s + r.horasTotales, 0);
  const totalPagar = rows.reduce((s, r) => s + r.totalPagar, 0);

  const ws = XLSX.utils.aoa_to_sheet([
    ['GASTRO SMART - PLANILLA DE HORAS Y ASISTENCIA'],
    ['Negocio:', businessName],
    ['Sucursal:', selectedBranchName],
    ['Periodo:', periodLabel],
    ['Fecha de Generación:', new Date().toLocaleString()],
    [],
    headers,
    ...dataRows,
    [],
    ['TOTALES', '', '', '', totalHorasNormales, totalHorasExtra, totalHoras, '', '', totalPagar, '', '']
  ]);

  ws['!cols'] = [
    { wch: 22 },
    { wch: 15 },
    { wch: 22 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
    { wch: 18 },
    { wch: 15 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Planilla de Sueldos');

  const safeBiz = businessName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safePeriod = periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `Planilla_Sueldos_${safeBiz}_${safePeriod}.xlsx`);
}
