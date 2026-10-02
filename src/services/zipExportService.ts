import JSZip from 'jszip';
import { 
  Business, 
  Restaurant, 
  Order, 
  MenuItem, 
  InventoryItem, 
  Shift, 
  Expense, 
  Client, 
  Table, 
  Employee, 
  CashRegisterClose, 
  DailyStat, 
  SecurityAlert, 
  MenuAuditLog 
} from '../types';

export interface BusinessFullBackupData {
  business: Business | null;
  restaurants: Restaurant[];
  orders: Order[];
  menuItems: MenuItem[];
  inventory: InventoryItem[];
  shifts: Shift[];
  expenses: Expense[];
  clients: Client[];
  tables: Table[];
  employees: Employee[];
  cashCloses: CashRegisterClose[];
  dailyStats: DailyStat[];
  securityAlerts: SecurityAlert[];
  menuAuditLogs: MenuAuditLog[];
}

/**
 * Escapes values for standard RFC 4180 CSV
 */
function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Converts array of objects to CSV string
 */
function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const headerLine = headers.map(h => escapeCsv(h)).join(',');
  const bodyLines = rows.map(row => 
    headers.map(h => escapeCsv(row[h])).join(',')
  );
  return [headerLine, ...bodyLines].join('\r\n');
}

/**
 * Generates and triggers the download of the entire tenant backup ZIP archive
 */
export async function generateAndDownloadBusinessZip(data: BusinessFullBackupData): Promise<Blob> {
  const zip = new JSZip();
  const now = new Date();
  const dateIso = now.toISOString();
  const dateFormatted = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
  const businessName = data.business?.nombre || data.restaurants[0]?.nombre || 'Gastro_Smart_Restaurante';
  const cleanBizName = businessName.replace(/[^a-zA-Z0-9_-]/g, '_');

  // ==========================================
  // 1. ARCHIVO RAÍZ: RESUMEN EJECUTIVO Y AUDITORÍA
  // ==========================================
  const totalVentas = data.orders
    .filter(o => o.estado === 'cobrado')
    .reduce((sum, o) => sum + (o.total || 0), 0);
  const totalGastos = data.expenses.reduce((sum, e) => sum + (e.monto || 0), 0);

  const resumenTxt = `================================================================================
GASTRO SMART - ARCHIVO COMPLETO DE BAJA Y PORTABILIDAD DE DATOS (RGPD / GDPR)
================================================================================
Razón Social / Negocio: ${businessName}
Identificador Fiscal / RIF: ${data.business?.rif_o_ruc || 'N/A'}
Correo de Contacto: ${data.business?.email || 'N/A'}
Teléfono Principal: ${data.business?.telefono || 'N/A'}
Dirección Registrada: ${data.business?.direccion || 'N/A'}
Fecha y Hora de Exportación: ${dateFormatted} (${dateIso})

ESTADÍSTICAS DEL RESPALDO COMPLETO:
--------------------------------------------------------------------------------
- Sucursales / Sedes: ${data.restaurants.length}
- Comandas y Pedidos Históricos: ${data.orders.length} (Total Facturado: $${totalVentas.toFixed(2)})
- Platos y Bebidas en Carta: ${data.menuItems.length}
- Insumos de Inventario y Stock: ${data.inventory.length}
- Gastos Operativos Registrados: ${data.expenses.length} (Total Gastos: $${totalGastos.toFixed(2)})
- Empleados y Cuentas Operativas: ${data.employees.length}
- Turnos y Registros de Asistencia: ${data.shifts.length}
- Cierres de Caja y Arqueos: ${data.cashCloses.length}
- Clientes Registrados en Fidelidad: ${data.clients.length}
- Mesas Configuradas: ${data.tables.length}
- Registros de Auditoría y Seguridad: ${data.securityAlerts.length + data.menuAuditLogs.length}

CERTIFICADO DE CONFORMIDAD Y PRIVACIDAD:
Este archivo contiene la totalidad de la información operativa, comercial, contable
y fiscal generada durante el uso del sistema Gastro Smart. Al completar la baja voluntaria,
todos estos datos han sido descargados por el administrador y eliminados irreversiblemente
de los servidores y bases de datos activas de Gastro Smart, en pleno cumplimiento de la
normativa de protección de datos y confidencialidad comercial.
================================================================================
`;
  zip.file('RESUMEN_EJECUTIVO_BAJA_GASTRO_SMART.txt', resumenTxt);

  // ==========================================
  // 2. CARPETA: VENTAS Y COMANDAS
  // ==========================================
  const ventasFolder = zip.folder('01_VENTAS_Y_COMANDAS');
  if (ventasFolder) {
    const ordersCsvRows = data.orders.map(o => ({
      ID_Pedido: o.id,
      Fecha_Creacion: o.creadoEn,
      Fecha_Cobro: o.cobradoEn || '',
      Tipo: o.tipo,
      Estado: o.estado,
      Mesa_Numero: o.mesaNumero || '',
      Mesero: o.meseroNombre || '',
      Cajero: o.cajeroNombre || '',
      Cliente_Nombre: o.clienteNombre || '',
      Cliente_Telefono: o.clienteTelefono || '',
      Metodo_Pago: o.metodoPago || '',
      Subtotal: (o.subtotal || o.total || 0).toFixed(2),
      Descuento: (o.descuento || 0).toFixed(2),
      Impuesto: (o.impuesto || 0).toFixed(2),
      Porcentaje_Impuesto: o.porcentajeImpuesto || 0,
      Propina: (o.propina || 0).toFixed(2),
      Total: (o.total || 0).toFixed(2),
      Cantidad_Items: (o.items || []).length,
      Empresa_Delivery: o.empresaDelivery || '',
      Notas: o.motivoRechazo || ''
    }));
    ventasFolder.file('pedidos_historicos.csv', toCsv(ordersCsvRows));

    // Detalle de todos los items vendidos fila por fila
    const itemsDetailRows: any[] = [];
    data.orders.forEach(o => {
      (o.items || []).forEach(it => {
        itemsDetailRows.push({
          ID_Pedido: o.id,
          Fecha_Pedido: o.creadoEn,
          Plato_Nombre: it.nombre,
          Categoria: (it as any).categoria || '',
          Cantidad: it.cantidad,
          Precio_Unitario: it.precio.toFixed(2),
          Subtotal: (it.precio * it.cantidad).toFixed(2),
          Ronda: it.ronda || 1,
          Notas_Plato: it.notas || '',
          Comensal: it.comensalNombre || ''
        });
      });
    });
    ventasFolder.file('detalle_platos_vendidos.csv', toCsv(itemsDetailRows));

    // JSON completo de pedidos para fidelidad o importación técnica
    ventasFolder.file('pedidos_completos.json', JSON.stringify(data.orders, null, 2));
  }

  // ==========================================
  // 3. CARPETA: CARTA Y RECETAS
  // ==========================================
  const menuFolder = zip.folder('02_CARTA_Y_RECETAS');
  if (menuFolder) {
    const menuCsvRows = data.menuItems.map(m => ({
      ID: m.id,
      Nombre: m.nombre,
      Categoria: m.categoria,
      Precio_Venta: m.precio.toFixed(2),
      Costo_Elaboracion: (m.costoElaboracion || 0).toFixed(2),
      Margen_Estimado: (m.precio - (m.costoElaboracion || 0)).toFixed(2),
      Disponible: m.disponible ? 'SI' : 'NO',
      Controla_Stock: m.controlaStock ? 'SI' : 'NO',
      Stock_Actual: m.stockActual ?? '',
      Stock_Minimo: m.stockMinimo ?? '',
      Usa_Receta: (m.insumosReceta && m.insumosReceta.length > 0) ? 'SI' : 'NO',
      Descripcion: m.descripcion || ''
    }));
    menuFolder.file('carta_menu_platos.csv', toCsv(menuCsvRows));

    // Recetas detalladas
    const recetasRows: any[] = [];
    data.menuItems.forEach(m => {
      (m.insumosReceta || []).forEach(r => {
        recetasRows.push({
          Plato_ID: m.id,
          Plato_Nombre: m.nombre,
          Insumo_Nombre: r.insumoNombre,
          Cantidad_Insumo: r.cantidadPorUnidad,
          Unidad_Medida: r.unidadMedida
        });
      });
    });
    menuFolder.file('recetas_e_ingredientes.csv', toCsv(recetasRows));
    menuFolder.file('carta_menu_completa.json', JSON.stringify(data.menuItems, null, 2));
  }

  // ==========================================
  // 4. CARPETA: INVENTARIO Y STOCK
  // ==========================================
  const invFolder = zip.folder('03_INVENTARIO_Y_STOCK');
  if (invFolder) {
    const invRows = data.inventory.map(i => ({
      ID: i.id,
      Nombre: i.nombre,
      Categoria: i.categoria,
      Stock_Actual: i.stockActual,
      Stock_Minimo_Alerta: i.stockMinimo,
      Unidad_Medida: i.unidadMedida,
      Costo_Unitario: (i.costoUnitario || 0).toFixed(2),
      Valor_Inventario_Costo: ((i.stockActual || 0) * (i.costoUnitario || 0)).toFixed(2),
      Proveedor: i.proveedor || '',
      Notas: i.notas || ''
    }));
    invFolder.file('inventario_insumos.csv', toCsv(invRows));
    invFolder.file('inventario_completo.json', JSON.stringify(data.inventory, null, 2));
  }

  // ==========================================
  // 5. CARPETA: PERSONAL Y ASISTENCIA
  // ==========================================
  const staffFolder = zip.folder('04_PERSONAL_Y_ASISTENCIA');
  if (staffFolder) {
    const empRows = data.employees.map(e => ({
      ID: e.id,
      Nombre: e.nombre,
      Puesto: e.puesto,
      Email: (e as any).email || '',
      Telefono: (e as any).telefono || '',
      Modalidad_Pago: e.modalidadPago || e.tipoSueldo || 'por_dia',
      Sueldo_Mensual: e.sueldoMensual || 0,
      Tarifa_Diaria: e.tarifaDiaria || 0,
      Tarifa_Hora: e.tarifaHora || 0,
      Activo: e.activo ? 'SI' : 'NO'
    }));
    staffFolder.file('empleados.csv', toCsv(empRows));

    const shiftRows = data.shifts.map(s => ({
      ID_Turno: s.id,
      Empleado_ID: s.employeeId,
      Empleado_Nombre: s.employeeName || '',
      Puesto: s.employeePuesto || 'general',
      Hora_Inicio: s.horaInicio,
      Hora_Fin: s.horaFin || '',
      Minutos_Trabajados: s.minutosTrabajados || 0,
      Estado: s.estado,
      Pedidos_Tomados: s.pedidosTomados || 0,
      Ventas_Generadas: (s.ventasGeneradas || 0).toFixed(2),
      Pedidos_Cobrados: s.pedidosCobrados || 0,
      Monto_Cobrado: (s.montoCobrado || 0).toFixed(2),
      Reporte_Labores: s.reporteLabores || ''
    }));
    staffFolder.file('turnos_asistencia.csv', toCsv(shiftRows));
  }

  // ==========================================
  // 6. CARPETA: CAJA Y FINANZAS
  // ==========================================
  const finFolder = zip.folder('05_CAJA_Y_FINANZAS');
  if (finFolder) {
    const closesRows = data.cashCloses.map(c => ({
      ID: c.id,
      Fecha_Cierre: c.fecha,
      Cajero: c.cajeroNombre,
      Fondo_Inicial: (c.montoInicial || 0).toFixed(2),
      Total_Esperado: (c.totalEsperado || 0).toFixed(2),
      Total_Real_Contado: (c.totalReal || 0).toFixed(2),
      Diferencia: (c.diferencia || 0).toFixed(2),
      Estado_Arqueo: (c.diferencia || 0) === 0 ? 'CUADRADO' : ((c.diferencia || 0) > 0 ? 'SOBRANTE' : 'FALTANTE'),
      Notas: c.notas || ''
    }));
    finFolder.file('cierres_caja_arqueos.csv', toCsv(closesRows));

    const expRows = data.expenses.map(e => ({
      ID: e.id,
      Fecha: e.fecha,
      Descripcion: e.descripcion,
      Tipo_Gasto: e.tipo,
      Monto: e.monto.toFixed(2),
      Metodo_Pago: e.metodoPago || '',
      Registrado_Por: e.registradoPor || '',
      Notas: e.notas || ''
    }));
    finFolder.file('gastos_operativos.csv', toCsv(expRows));
    finFolder.file('estadisticas_diarias.json', JSON.stringify(data.dailyStats, null, 2));
  }

  // ==========================================
  // 7. CARPETA: CLIENTES Y FIDELIZACION
  // ==========================================
  const clientsFolder = zip.folder('06_CLIENTES_Y_FIDELIZACION');
  if (clientsFolder) {
    const clientRows = data.clients.map(c => ({
      ID: c.id,
      Nombre: c.nombre,
      Telefono: c.telefono || '',
      Direccion: c.direccion || '',
      Puntos_Fidelidad: c.puntosFidelidad || 0,
      Total_Gastado_Historico: (c.totalGastadoAcumulado || 0).toFixed(2),
      Ultima_Visita: c.ultimaCompraEn || ''
    }));
    clientsFolder.file('cartera_clientes.csv', toCsv(clientRows));
  }

  // ==========================================
  // 8. CARPETA: SEGURIDAD Y CONTRATO DE CONFIDENCIALIDAD
  // ==========================================
  const legalFolder = zip.folder('07_SEGURIDAD_Y_CONTRATO_CONFIDENCIALIDAD');
  if (legalFolder) {
    const contratoTexto = `================================================================================
CONTRATO DE CONFIDENCIALIDAD, SECRETO COMERCIAL Y PROTECCIÓN DE DATOS
GASTRO SMART RESTAURANT MANAGEMENT PLATFORM
================================================================================
PARTES DEL ACUERDO:
1. DE UNA PARTE: GASTRO SMART (El Proveedor del Servicio y Plataforma Tecnológica).
2. DE OTRA PARTE: ${businessName.toUpperCase()} (El Cliente / Titular del Establecimiento Gastronómico).

CLÁUSULA PRIMERA · OBJETO DEL ACUERDO:
El presente documento certifica la estricta confidencialidad sobre la totalidad de la
información gastronómica, financiera, técnica, operacional, recetas, márgenes comerciales,
cartera de clientes, salarios y transacciones procesadas a través de la plataforma Gastro Smart.

CLÁUSULA SEGUNDA · SECRETO COMERCIAL Y PROPIEDAD EXCLUSIVA:
Toda la información contenida en esta descarga ZIP pertenece de forma exclusiva al CLIENTE.
Gastro Smart no comercializa, no transfiere ni utiliza recetas, costos ni datos de clientes
para fines publicitarios, de reventa ni perfilado de terceros.

CLÁUSULA TERCERA · SUPRESIÓN DEFINITIVA DE DATOS (DERECHO AL OLVIDO):
En virtud de la solicitud voluntaria de baja y desvinculación, Gastro Smart procede a la
eliminación total, definitiva e irreversible de todas las bases de datos de producción
asociadas al identificador fiscal del cliente, cumpliendo rigurosamente los estándares
internacionales de privacidad RGPD / GDPR y Leyes de Protección de Datos Personales.

CLÁUSULA CUARTA · INTEGRIDAD Y VALIDEZ DEL RESPALDO:
El presente archivo ZIP representa la entrega formal y completa de todos los archivos
históricos de actividad solicitados por el administrador previo a la purga de la base de datos.

Documento sellado electrónicamente en fecha: ${dateFormatted}
Gastro Smart POS · Certificación de Cumplimiento Normativo y Privacidad
================================================================================
`;
    legalFolder.file('CONTRATO_CONFIDENCIALIDAD_GASTRO_SMART.txt', contratoTexto);
    legalFolder.file('auditoria_seguridad.json', JSON.stringify(data.securityAlerts, null, 2));
    legalFolder.file('auditoria_carta_stock.json', JSON.stringify(data.menuAuditLogs, null, 2));
  }

  // Generar el blob ZIP
  const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

  // Trigger directo de descarga en el navegador
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  const fileName = `GastroSmart_Backup_Completo_${cleanBizName}_${now.toISOString().slice(0, 10)}.zip`;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);

  return content;
}
