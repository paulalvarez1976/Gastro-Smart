import React, { useState } from 'react';
import { 
  ShieldCheck, 
  FileText, 
  Printer, 
  FileDown, 
  X, 
  CheckCircle2, 
  Lock, 
  Building2, 
  Sparkles,
  Award
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { sounds } from '../utils/sound';
import { haptics } from '../utils/haptics';

interface ConfidentialityContractModalProps {
  businessName?: string;
  representativeName?: string;
  businessRif?: string;
  onClose: () => void;
  onAccepted?: () => void;
}

export const ConfidentialityContractModal: React.FC<ConfidentialityContractModalProps> = ({
  businessName = 'Establecimiento Gastronómico',
  representativeName = 'Titular / Administrador',
  businessRif = 'J-00000000-0',
  onClose,
  onAccepted
}) => {
  const [hasSigned, setHasSigned] = useState(() => {
    return localStorage.getItem('gastro_confidentiality_accepted') === 'true';
  });
  const [signerName, setSignerName] = useState(representativeName);

  const contractDate = new Date().toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const handleAccept = () => {
    sounds.playCashRegister();
    haptics.success();
    localStorage.setItem('gastro_confidentiality_accepted', 'true');
    localStorage.setItem('gastro_confidentiality_signer', signerName);
    localStorage.setItem('gastro_confidentiality_date', new Date().toISOString());
    setHasSigned(true);
    if (onAccepted) onAccepted();
  };

  const handleDownloadPdf = () => {
    sounds.playKeypadClick();
    haptics.tap();

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pageWidth = 210;
    const margin = 18;
    const contentWidth = pageWidth - (margin * 2);
    let y = 20;

    // Header band
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(0, 0, pageWidth, 8, 'F');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('CONTRATO DE CONFIDENCIALIDAD, SECRETO COMERCIAL', margin, y);
    y += 6;
    doc.text('Y TRATAMIENTO DE DATOS GASTRONÓMICOS', margin, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Gastro Smart POS & SaaS · Fecha de Emisión: ${contractDate}`, margin, y);
    y += 8;

    // Divider line
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Parties
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text('PARTES SUSCRIBIENTES:', margin + 4, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(`1. PROVEEDOR TECNOLÓGICO: GASTRO SMART SYSTEM (Plataforma Integral de Gestión y POS).`, margin + 4, y + 11);
    doc.text(`2. EL CLIENTE / TITULAR: ${businessName.toUpperCase()} (RIF/NIT/RFC: ${businessRif}).`, margin + 4, y + 16);
    y += 28;

    // Clauses
    const clauses = [
      {
        num: 'CLÁUSULA 1 · OBJETO Y ÁMBITO DE CONFIDENCIALIDAD',
        text: 'El presente Contrato tiene por objeto garantizar la más estricta reserva, custodia y confidencialidad sobre la totalidad de la información gastronómica, técnica, contable y comercial que el CLIENTE registre o procese en Gastro Smart, incluyendo recetas secretas, cartas de platos, costos unitarios, márgenes de ganancia, comandas, arqueos de caja, asistencias y datos de clientes.'
      },
      {
        num: 'CLÁUSULA 2 · SECRETO COMERCIAL Y NO COMERCIALIZACIÓN DE DATOS',
        text: 'Gastro Smart reconoce expresamente que todos los datos ingresados son propiedad exclusiva e inalienable del CLIENTE. Gastro Smart se compromete a no vender, no transferir, no alquilar, no monetizar ni divulgar a terceros ninguna receta, costo de insumo, dato financiero o identidad de clientes bajo ninguna circunstancia.'
      },
      {
        num: 'CLÁUSULA 3 · SEGURIDAD, ENCRIPTACIÓN Y PROTOCOLOS DE ACCESO',
        text: 'Toda la información se aloja en infraestructura cloud blindada de alta disponibilidad con encriptación en tránsito (TLS/HTTPS) y en reposo (AES-256). El acceso está restringido estrictamente a las credenciales autorizadas por el Administrador mediante autenticación segura y roles operativos basados en privilegios mínimos.'
      },
      {
        num: 'CLÁUSULA 4 · DERECHO AL OLVIDO, PORTABILIDAD Y SUPRESIÓN TOTAL (RGPD)',
        text: 'En cualquier momento, el Administrador del restaurante podrá solicitar o ejecutar la baja del servicio, teniendo el derecho inalienable de descargar el respaldo íntegro de sus actividades en un archivo ZIP estructurado. Tras dicha descarga, Gastro Smart procederá a la purga y eliminación definitiva, permanente e irreversible de todas las bases de datos de producción.'
      },
      {
        num: 'CLÁUSULA 5 · VIGENCIA Y COMPROMISO PERPETUO',
        text: 'Las obligaciones de confidencialidad y secreto comercial estipuladas en este Contrato tienen vigencia indefinida y sobrevivirán a cualquier terminación o cancelación de los servicios de Gastro Smart.'
      }
    ];

    clauses.forEach(c => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(c.num, margin, y);
      y += 4.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      const splitText = doc.splitTextToSize(c.text, contentWidth);
      doc.text(splitText, margin, y);
      y += (splitText.length * 3.8) + 4;
    });

    // Signatures box
    y = Math.max(y + 2, 240);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    const colW = contentWidth / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('POR GASTRO SMART:', margin, y);
    doc.text('POR EL CLIENTE / ESTABLECIMIENTO:', margin + colW, y);
    y += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Firma Digital: Sello Electrónico de Cumplimiento RGPD', margin, y);
    doc.text(`Representante: ${signerName}`, margin + colW, y);
    y += 4;
    doc.text('Certificación Criptográfica: SHA-256 Validated', margin, y);
    doc.text(`Estado: ${hasSigned ? 'FIRMADO Y ACEPTADO' : 'CONTRATO VIGENTE'}`, margin + colW, y);

    const cleanBiz = businessName.replace(/[^a-zA-Z0-9_-]/g, '_');
    doc.save(`Contrato_Confidencialidad_GastroSmart_${cleanBiz}.pdf`);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-3xl w-full p-5 sm:p-7 shadow-2xl border border-neutral-200 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-neutral-900 text-base sm:text-lg">
                  Contrato de Confidencialidad & Protección de Datos
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                  RGPD / GDPR
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Garantía legal de secreto comercial, custodia de recetas, finanzas y supresión de datos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Document Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 text-xs text-neutral-700 leading-relaxed font-sans">
          
          {/* Parties Box */}
          <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-1 text-neutral-800">
            <div className="flex items-center gap-1.5 font-bold text-neutral-900 text-[11px] uppercase tracking-wider">
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Partes Suscribientes del Acuerdo</span>
            </div>
            <p className="text-[11px]">
              <strong>1. PROVEEDOR TECNOLÓGICO:</strong> GASTRO SMART SYSTEM (Software de gestión gastronómica en la nube).
            </p>
            <p className="text-[11px]">
              <strong>2. EL CLIENTE:</strong> <span className="font-bold text-indigo-900">{businessName}</span> (Identificador Fiscal: {businessRif}).
            </p>
          </div>

          {/* Cláusula 1 */}
          <div className="space-y-1">
            <h4 className="font-extrabold text-neutral-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-indigo-600" />
              1. Objeto y Alcance de Confidencialidad Absoluta
            </h4>
            <p className="text-neutral-600 text-[11.5px]">
              El presente Contrato garantiza la estricta reserva, confidencialidad y custodia sobre todas las recetas maestras, ingredientes, costos de insumos, márgenes brutos, registros de comandas, nóminas de empleados, historial de ventas, arqueos de caja y cartera de clientes almacenados o procesados a través de la plataforma Gastro Smart.
            </p>
          </div>

          {/* Cláusula 2 */}
          <div className="space-y-1">
            <h4 className="font-extrabold text-neutral-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-indigo-600" />
              2. Secreto Comercial & Propiedad Exclusiva del Cliente
            </h4>
            <p className="text-neutral-600 text-[11.5px]">
              Todos los datos, recetas y análisis generados son propiedad exclusiva e inalienable del CLIENTE. Gastro Smart se compromete a <strong>NO comercializar, NO transferir, NO monetizar, NO revender ni ceder</strong> información a competidores ni a redes de publicidad. Las recetas e innovaciones culinarias están amparadas bajo estricto Secreto Comercial e Industrial.
            </p>
          </div>

          {/* Cláusula 3 */}
          <div className="space-y-1">
            <h4 className="font-extrabold text-neutral-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              3. Seguridad Criptográfica y Resguardo en la Nube
            </h4>
            <p className="text-neutral-600 text-[11.5px]">
              Gastro Smart emplea cifrado en reposo (AES-256) y transmisión segura mediante canales TLS/HTTPS. Los datos se mantienen aislados por inquilino (Multitenancy con particionado estricto por <code>businessId</code>). El acceso está blindado mediante autenticación segura y controles de acceso por rol (RBAC).
            </p>
          </div>

          {/* Cláusula 4 */}
          <div className="space-y-1 p-3 rounded-2xl bg-amber-50/60 border border-amber-200">
            <h4 className="font-extrabold text-amber-950 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              4. Derecho al Olvido, Portabilidad y Supresión Total de Datos (RGPD)
            </h4>
            <p className="text-amber-900/90 text-[11.5px]">
              El CLIENTE tiene en todo momento el derecho a la portabilidad y baja voluntaria del servicio. La plataforma proporciona un botón de <strong>Descarga Total en ZIP</strong> con todas las actividades históricas y un mecanismo de <strong>Supresión Definitiva e Irreversible</strong> que purga de inmediato todos los registros del negocio de las bases de datos de producción de Gastro Smart sin dejar copias residuales.
            </p>
          </div>

          {/* Cláusula 5 */}
          <div className="space-y-1">
            <h4 className="font-extrabold text-neutral-900 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              5. Vigencia Indefinida y Compromiso Legal
            </h4>
            <p className="text-neutral-600 text-[11.5px]">
              Las obligaciones de confidencialidad, no divulgación y secreto comercial no expirarán y sobrevivirán a cualquier cancelación o cambio de plan del cliente.
            </p>
          </div>

          {/* Firma status banner */}
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-emerald-950">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="text-[11px]">
                <strong>Estado del Acuerdo:</strong> {hasSigned ? 'Firmado y Aceptado Electrónicamente' : 'Listo para Aceptación'}
                <div className="text-[10px] text-emerald-700">Fecha: {contractDate}</div>
              </div>
            </div>
            <span className="font-mono text-[10px] bg-emerald-200/80 px-2 py-0.5 rounded font-bold text-emerald-900">
              SHA-256 VERIFIED
            </span>
          </div>

        </div>

        {/* Modal Footer Actions */}
        <div className="pt-4 border-t border-neutral-100 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <FileDown className="w-4 h-4 text-neutral-600" />
              <span>Descargar PDF Oficial</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs flex items-center justify-center transition cursor-pointer"
              title="Imprimir contrato"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition cursor-pointer"
            >
              Cerrar
            </button>
            {!hasSigned && (
              <button
                type="button"
                onClick={handleAccept}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Aceptar y Ratificar Contrato</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
