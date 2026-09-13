import React, { useRef } from 'react';
import { 
  FinancialSummaryData, 
  DailyStat, 
  Restaurant 
} from '../types';
import { 
  Printer, 
  X, 
  Building2, 
  Calendar, 
  User, 
  TrendingUp, 
  TrendingDown, 
  FileText,
  DollarSign
} from 'lucide-react';

interface ExecutivePdfReportProps {
  businessName: string;
  selectedBranchName: string;
  periodLabel: string;
  generatedBy: string;
  summary: FinancialSummaryData;
  dailyStats: DailyStat[];
  onClose: () => void;
}

export const ExecutivePdfReport: React.FC<ExecutivePdfReportProps> = ({
  businessName,
  selectedBranchName,
  periodLabel,
  generatedBy,
  summary,
  dailyStats,
  onClose
}) => {
  const printContentRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const sortedStats = [...dailyStats].sort((a, b) => a.fecha.localeCompare(b.fecha));

  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto flex flex-col items-center justify-start p-4 sm:p-8 backdrop-blur-sm print:p-0 print:bg-white print:fixed print:inset-0">
      
      {/* Top Bar with Print & Close controls (hidden during print) */}
      <div className="w-full max-w-4xl bg-neutral-900 text-white rounded-2xl p-4 flex items-center justify-between mb-6 shadow-2xl print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center font-black">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Vista Previa del Reporte Ejecutivo</h3>
            <p className="text-xs text-neutral-400">Formato A4 en blanco y negro para exportación a PDF o impresión</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition shadow-md"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir / Guardar como PDF</span>
          </button>
          <button
            onClick={onClose}
            className="p-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Printable Paper Document (Clean Black & White Design) */}
      <div 
        ref={printContentRef}
        className="w-full max-w-4xl bg-white text-black font-sans shadow-2xl rounded-xl p-8 sm:p-12 print:shadow-none print:p-6 print:max-w-none print:w-full space-y-12"
      >
        {/* ==================== PORTADA (COVER PAGE) ==================== */}
        <section className="min-h-[420px] flex flex-col justify-between border-b-2 border-black pb-8 page-break-after">
          <div>
            <div className="flex items-center justify-between border-b border-black/20 pb-4">
              <div>
                <span className="text-xs font-mono tracking-widest uppercase text-neutral-600">Gastro Smart Suite</span>
                <h1 className="text-3xl font-black tracking-tight text-black mt-1 uppercase">{businessName}</h1>
              </div>
              <div className="text-right">
                <span className="inline-block border border-black px-3 py-1 text-xs font-bold uppercase tracking-wider">
                  Informe Financiero Confidencial
                </span>
              </div>
            </div>

            <div className="mt-12 space-y-3">
              <h2 className="text-4xl font-extrabold tracking-tight">Reporte Ejecutivo de Rendimiento & P&L</h2>
              <p className="text-base text-neutral-700 max-w-2xl leading-relaxed">
                Auditoría consolidada de ventas brutas, estructura de costos operativos, márgenes de contribución neta 
                y rendimiento comercial por sucursal y canales de venta.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-8 border-t border-black/10 text-xs">
            <div>
              <span className="text-neutral-500 block uppercase font-mono text-[10px]">Sucursal</span>
              <strong className="text-sm font-bold text-black">{selectedBranchName}</strong>
            </div>
            <div>
              <span className="text-neutral-500 block uppercase font-mono text-[10px]">Periodo de Análisis</span>
              <strong className="text-sm font-bold text-black">{periodLabel}</strong>
            </div>
            <div>
              <span className="text-neutral-500 block uppercase font-mono text-[10px]">Fecha de Emisión</span>
              <strong className="text-sm font-bold text-black">{new Date().toLocaleDateString()}</strong>
            </div>
            <div>
              <span className="text-neutral-500 block uppercase font-mono text-[10px]">Generado Por</span>
              <strong className="text-sm font-bold text-black">{generatedBy}</strong>
            </div>
          </div>
        </section>

        {/* ==================== PÁGINA 1: TABLA RESUMEN DE KPIs ==================== */}
        <section className="space-y-6 pt-4 page-break-after">
          <div className="flex items-center justify-between border-b border-black pb-2">
            <h3 className="text-lg font-black uppercase tracking-wider">1. Resumen Ejecutivo de Indicadores Clave (KPIs)</h3>
            <span className="text-xs font-mono text-neutral-500">Pág. 1</span>
          </div>

          <table className="w-full text-left text-sm border-collapse border border-black">
            <thead>
              <tr className="bg-neutral-100 border-b border-black">
                <th className="p-3 font-bold border-r border-black uppercase text-xs">Métrica Financiera</th>
                <th className="p-3 font-bold border-r border-black uppercase text-xs text-right">Periodo Actual</th>
                <th className="p-3 font-bold border-r border-black uppercase text-xs text-right">Periodo Anterior</th>
                <th className="p-3 font-bold uppercase text-xs text-right">Variación %</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-black/30">
                <td className="p-3 font-bold border-r border-black">Ventas Totales</td>
                <td className="p-3 text-right font-black border-r border-black">${summary.ventasTotales.actual.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td className="p-3 text-right border-r border-black">${summary.ventasTotales.anterior.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td className="p-3 text-right font-bold">
                  {summary.ventasTotales.variacionPorcentaje > 0 ? '+' : ''}{summary.ventasTotales.variacionPorcentaje}%
                </td>
              </tr>
              <tr className="border-b border-black/30">
                <td className="p-3 font-bold border-r border-black">Gastos Operativos</td>
                <td className="p-3 text-right font-black border-r border-black">${summary.gastosOperativos.actual.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td className="p-3 text-right border-r border-black">${summary.gastosOperativos.anterior.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td className="p-3 text-right font-bold">
                  {summary.gastosOperativos.variacionPorcentaje > 0 ? '+' : ''}{summary.gastosOperativos.variacionPorcentaje}%
                </td>
              </tr>
              <tr className="border-b border-black/30 bg-neutral-50">
                <td className="p-3 font-black border-r border-black">Ganancia Neta (EBITDA Operativo)</td>
                <td className="p-3 text-right font-black border-r border-black text-base">${summary.gananciaNeta.actual.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td className="p-3 text-right border-r border-black">${summary.gananciaNeta.anterior.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td className="p-3 text-right font-bold">
                  {summary.gananciaNeta.variacionPorcentaje > 0 ? '+' : ''}{summary.gananciaNeta.variacionPorcentaje}%
                </td>
              </tr>
              <tr className="border-b border-black/30">
                <td className="p-3 font-bold border-r border-black">Margen de Rentabilidad</td>
                <td className="p-3 text-right font-bold border-r border-black">{summary.margenPorcentaje.actual}%</td>
                <td className="p-3 text-right border-r border-black">{summary.margenPorcentaje.anterior}%</td>
                <td className="p-3 text-right font-bold">
                  {summary.margenPorcentaje.variacionPorcentaje > 0 ? '+' : ''}{summary.margenPorcentaje.variacionPorcentaje}%
                </td>
              </tr>
              <tr className="border-b border-black/30">
                <td className="p-3 font-bold border-r border-black">Pedidos Totales Cobrados</td>
                <td className="p-3 text-right font-bold border-r border-black">{summary.pedidosTotales.actual}</td>
                <td className="p-3 text-right border-r border-black">{summary.pedidosTotales.anterior}</td>
                <td className="p-3 text-right font-bold">
                  {summary.pedidosTotales.variacionPorcentaje > 0 ? '+' : ''}{summary.pedidosTotales.variacionPorcentaje}%
                </td>
              </tr>
              <tr>
                <td className="p-3 font-bold border-r border-black">Ticket Promedio por Comanda</td>
                <td className="p-3 text-right font-bold border-r border-black">${summary.ticketPromedio.actual.toFixed(2)}</td>
                <td className="p-3 text-right border-r border-black">${summary.ticketPromedio.anterior.toFixed(2)}</td>
                <td className="p-3 text-right font-bold">
                  {summary.ticketPromedio.variacionPorcentaje > 0 ? '+' : ''}{summary.ticketPromedio.variacionPorcentaje}%
                </td>
              </tr>
            </tbody>
          </table>

          {/* Efficiency notes */}
          <div className="border border-black p-4 text-xs space-y-2">
            <h4 className="font-bold uppercase tracking-wider text-[11px]">Resumen de Eficiencia Operativa</h4>
            <div className="grid grid-cols-3 gap-4 text-neutral-800">
              <div>
                <span className="text-neutral-500 block">Horas Laborales:</span>
                <strong>{summary.horasTrabajadas.toFixed(1)} hrs</strong>
              </div>
              <div>
                <span className="text-neutral-500 block">Costo Laboral Estimado:</span>
                <strong>${summary.costoLaboral.toFixed(2)}</strong>
              </div>
              <div>
                <span className="text-neutral-500 block">Ratio Costo Laboral / Ventas:</span>
                <strong>{summary.ratioCostoLaboral.toFixed(1)}%</strong>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== PÁGINA 2: VENTAS VS GASTOS ==================== */}
        <section className="space-y-6 pt-4 page-break-after">
          <div className="flex items-center justify-between border-b border-black pb-2">
            <h3 className="text-lg font-black uppercase tracking-wider">2. Comportamiento Temporal: Ventas vs. Gastos</h3>
            <span className="text-xs font-mono text-neutral-500">Pág. 2</span>
          </div>

          <div className="border border-black p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-4">Evolución en el Periodo ({periodLabel})</h4>
            
            {/* Visual printable ascii / bar representations for maximum cross-print fidelity */}
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-black bg-neutral-100">
                  <th className="p-2 font-bold uppercase">Fecha / Punto</th>
                  <th className="p-2 font-bold uppercase text-right">Ventas ($)</th>
                  <th className="p-2 font-bold uppercase text-right">Gastos ($)</th>
                  <th className="p-2 font-bold uppercase text-right">Ganancia Neta ($)</th>
                  <th className="p-2 font-bold uppercase text-right">Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {sortedStats.slice(0, 14).map((st, idx) => (
                  <tr key={idx} className="border-b border-neutral-200">
                    <td className="p-2 font-mono">{st.fecha}</td>
                    <td className="p-2 text-right font-bold">${st.ventasTotales.toFixed(2)}</td>
                    <td className="p-2 text-right">${st.gastosTotales.toFixed(2)}</td>
                    <td className="p-2 text-right font-bold">${st.gananciaNeta.toFixed(2)}</td>
                    <td className="p-2 text-right">{st.pedidosCobrados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ==================== PÁGINA 3: GASTOS POR TIPO, TOP PLATOS, CANALES ==================== */}
        <section className="space-y-6 pt-4">
          <div className="flex items-center justify-between border-b border-black pb-2">
            <h3 className="text-lg font-black uppercase tracking-wider">3. Composición de Costos, Canales y Platos Estrella</h3>
            <span className="text-xs font-mono text-neutral-500">Pág. 3</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            {/* Gastos por Tipo */}
            <div className="border border-black p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider border-b border-black pb-1">Distribución de Gastos</h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-neutral-500 border-b border-neutral-200">
                    <th className="pb-1 text-left font-normal">Categoría</th>
                    <th className="pb-1 text-right font-normal">Monto</th>
                    <th className="pb-1 text-right font-normal">% Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.gastosPorTipo.map((g, idx) => (
                    <tr key={idx} className="border-b border-neutral-100">
                      <td className="py-1 font-medium">{g.nombre}</td>
                      <td className="py-1 text-right font-mono">${g.monto.toFixed(2)}</td>
                      <td className="py-1 text-right font-mono">{g.porcentaje}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Ventas por Canal */}
            <div className="border border-black p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider border-b border-black pb-1">Ventas por Canal Comercial</h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-neutral-500 border-b border-neutral-200">
                    <th className="pb-1 text-left font-normal">Canal</th>
                    <th className="pb-1 text-right font-normal">Venta</th>
                    <th className="pb-1 text-right font-normal">% Total</th>
                    <th className="pb-1 text-right font-normal">Pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.ventasPorCanal.map((c, idx) => (
                    <tr key={idx} className="border-b border-neutral-100">
                      <td className="py-1 font-medium">{c.nombre}</td>
                      <td className="py-1 text-right font-mono">${c.monto.toFixed(2)}</td>
                      <td className="py-1 text-right font-mono">{c.porcentaje}%</td>
                      <td className="py-1 text-right font-mono">{c.pedidos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top 5 Platos */}
          <div className="border border-black p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider border-b border-black pb-1">Top 5 Platos con Mayor Rendimiento</h4>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-neutral-500 border-b border-neutral-200">
                  <th className="pb-1 text-left font-normal">#</th>
                  <th className="pb-1 text-left font-normal">Nombre del Plato</th>
                  <th className="pb-1 text-right font-normal">Unidades Vendidas</th>
                  <th className="pb-1 text-right font-normal">Monto Facturado</th>
                </tr>
              </thead>
              <tbody>
                {(summary.topPlatos || []).slice(0, 5).map((plato, idx) => (
                  <tr key={idx} className="border-b border-neutral-100">
                    <td className="py-1.5 font-bold font-mono">{idx + 1}</td>
                    <td className="py-1.5 font-medium">{plato.nombre}</td>
                    <td className="py-1.5 text-right font-mono">{plato.cantidad} un.</td>
                    <td className="py-1.5 text-right font-mono font-bold">${plato.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Signatures / Footer */}
          <div className="pt-12 grid grid-cols-2 gap-12 text-center text-xs">
            <div className="border-t border-black pt-2">
              <span className="font-bold block">Firma de Auditoría / Gerencia</span>
              <span className="text-[10px] text-neutral-500">{businessName}</span>
            </div>
            <div className="border-t border-black pt-2">
              <span className="font-bold block">Firma de Administración</span>
              <span className="text-[10px] text-neutral-500">Emitido electrónicamente por {generatedBy}</span>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};
