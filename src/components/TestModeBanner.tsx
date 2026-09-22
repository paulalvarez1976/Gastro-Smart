import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  resetTestOperationalData, 
  getTestOperationalCounts, 
  TestOperationalSummary, 
  seedQuickTestingDishesAndOrder, 
  updateBusiness,
  simulateTableOrder,
  simulateExpressOrder,
  simulateCashShift
} from '../services/dataService';
import { UNIQUE_BUSINESS_ID } from '../config/business';
import { sounds } from '../utils/sound';
import { 
  FlaskConical, 
  RotateCcw, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2, 
  X, 
  ShieldCheck, 
  ToggleRight,
  PlayCircle,
  Utensils,
  ChefHat,
  Receipt,
  Truck,
  Wallet,
  CheckSquare,
  Square,
  ArrowRight,
  HelpCircle
} from 'lucide-react';

interface TestModeBannerProps {
  onDataReset?: () => void;
}

export const TestModeBanner: React.FC<TestModeBannerProps> = ({ onDataReset }) => {
  const { currentBusiness, currentUserAccount, currentRestaurant } = useAuth();
  
  const activeBizId = currentUserAccount?.businessId || currentBusiness?.id || UNIQUE_BUSINESS_ID;
  const isTestMode = currentBusiness?.modoPruebas !== false; // Activo por defecto en fase de pruebas

  const [showModal, setShowModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [counts, setCounts] = useState<TestOperationalSummary | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Estados de simulación interactiva
  const [simulatingAction, setSimulatingAction] = useState<string | null>(null);
  const [simulationBanner, setSimulationBanner] = useState<{ title: string; desc: string; nextStep: string } | null>(null);

  // Checklist de homologación en localStorage
  const CHECKLIST_KEY = `gastro_test_checklist_${activeBizId}`;
  const [completedSteps, setCompletedSteps] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(CHECKLIST_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleStep = (stepId: string) => {
    sounds.playKeypadClick();
    setCompletedSteps(prev => {
      const next = prev.includes(stepId) ? prev.filter(s => s !== stepId) : [...prev, stepId];
      try {
        localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  // Abrir modal y calcular datos transaccionales actuales
  const handleOpenResetModal = async () => {
    setShowModal(true);
    setLoadingCounts(true);
    setSuccessMessage(null);
    try {
      const summary = await getTestOperationalCounts(activeBizId);
      setCounts(summary);
    } catch (err) {
      console.error('Error obteniendo conteo de datos de prueba:', err);
    } finally {
      setLoadingCounts(false);
    }
  };

  // Ejecutar limpieza segura de datos de prueba
  const handleExecuteReset = async () => {
    setIsResetting(true);
    try {
      sounds.playKeypadClick();
      const res = await resetTestOperationalData(activeBizId);
      sounds.playCashRegister();
      setCounts(null);
      setSuccessMessage(`¡Limpieza completada! Se eliminaron ${res.pedidos} pedidos, ${res.gastos} gastos, ${res.turnos} turnos y se liberaron las mesas.`);
      setCompletedSteps(prev => prev.includes('step5') ? prev : [...prev, 'step5']);
      if (onDataReset) {
        onDataReset();
      }
    } catch (err: any) {
      console.error('Error al resetear datos de prueba:', err);
      alert('Error al resetear datos de prueba: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsResetting(false);
    }
  };

  // Sembrar platos de muestra rápidamente
  const handleSeedDemo = async () => {
    if (!currentRestaurant) {
      alert('Debes tener al menos una sucursal seleccionada.');
      return;
    }
    setIsSeeding(true);
    try {
      sounds.playKeypadClick();
      await seedQuickTestingDishesAndOrder(activeBizId, currentRestaurant.id);
      sounds.playNotification();
      alert('¡Platos demo de prueba añadidos al menú correctamente!');
    } catch (err: any) {
      console.error('Error sembrando platos demo:', err);
      alert('Error al agregar platos demo: ' + (err.message || 'Error'));
    } finally {
      setIsSeeding(false);
    }
  };

  // Alternar Modo de Pruebas
  const handleToggleTestMode = async () => {
    const nextState = !isTestMode;
    const confirmMsg = nextState 
      ? '¿Deseas activar el Modo de Pruebas? Se mostrarán las opciones de simulación y reseteo.'
      : '¿Deseas pasar la aplicación a Modo Producción? Se ocultarán las banderas de prueba.';
    
    if (window.confirm(confirmMsg)) {
      try {
        await updateBusiness(activeBizId, { modoPruebas: nextState });
        sounds.playNotification();
      } catch (err: any) {
        console.error('Error actualizando modo de pruebas:', err);
      }
    }
  };

  // SIMULACIONES OPERATIVAS
  const handleSimulateTable = async () => {
    if (!currentRestaurant) {
      alert('Seleccione primero una sucursal.');
      return;
    }
    setSimulatingAction('table');
    try {
      sounds.playKeypadClick();
      const res = await simulateTableOrder(activeBizId, currentRestaurant.id, 1);
      sounds.playNotification();
      setSimulationBanner({
        title: `¡Comanda creada con éxito en Mesa #${res.tableNumber}! (Total: $${res.total.toFixed(2)})`,
        desc: 'El pedido contiene notas de cocina ("Término medio, sin cebolla"). La mesa ahora figura Ocupada.',
        nextStep: 'Abre la vista de Cocina (KDS) para marcar los platos como "Listos", y luego ve a Caja para cobrar.'
      });
      toggleStep('step1');
    } catch (err: any) {
      alert('Error al simular comanda: ' + (err.message || 'Error'));
    } finally {
      setSimulatingAction(null);
    }
  };

  const handleSimulateExpress = async (tipo: 'mostrador' | 'delivery') => {
    if (!currentRestaurant) {
      alert('Seleccione primero una sucursal.');
      return;
    }
    setSimulatingAction(tipo);
    try {
      sounds.playKeypadClick();
      const res = await simulateExpressOrder(activeBizId, currentRestaurant.id, tipo);
      sounds.playNotification();
      setSimulationBanner({
        title: `¡Pedido ${res.canal} simulado! (Total: $${res.total.toFixed(2)})`,
        desc: tipo === 'delivery' ? 'Incluye recargo de delivery ($2.50) y dirección de entrega.' : 'Venta para llevar en mostrador.',
        nextStep: 'En el POS de Caja ya puedes cobrarlo directamente con efectivo, tarjeta o transferencia.'
      });
      toggleStep('step3');
    } catch (err: any) {
      alert('Error al simular pedido express: ' + (err.message || 'Error'));
    } finally {
      setSimulatingAction(null);
    }
  };

  const handleSimulateCashShift = async () => {
    if (!currentRestaurant) {
      alert('Seleccione primero una sucursal.');
      return;
    }
    setSimulatingAction('shift');
    try {
      sounds.playKeypadClick();
      const res = await simulateCashShift(activeBizId, currentRestaurant.id, currentRestaurant.nombre, 50.00);
      sounds.playCashRegister();
      setSimulationBanner({
        title: `¡Turno abierto para ${res.employeeName}!`,
        desc: `Fondo inicial registrado: $${res.fondoInicial.toFixed(2)}.`,
        nextStep: 'Al final de tus ventas de prueba, ve a "Cierre de Turno" para verificar el arqueo y cuadre de caja.'
      });
      toggleStep('step4');
    } catch (err: any) {
      alert('Error al simular turno de caja: ' + (err.message || 'Error'));
    } finally {
      setSimulatingAction(null);
    }
  };

  if (!isTestMode) {
    if (!currentUserAccount) return null;
    return (
      <div className="bg-neutral-900 text-neutral-400 px-3 py-1 text-[11px] flex items-center justify-between border-b border-neutral-800">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Modo Producción Real</span>
        </div>
        <button
          onClick={handleToggleTestMode}
          className="text-orange-400 hover:text-orange-300 font-bold underline cursor-pointer"
        >
          Activar Fase de Pruebas
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Banner Superior de Fase de Pruebas */}
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white px-3 py-1.5 shadow-md flex flex-wrap items-center justify-between gap-2 text-xs font-semibold select-none z-30">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-black/20 text-white shadow-inner">
            <FlaskConical className="w-3.5 h-3.5 animate-pulse" />
          </span>
          <div className="leading-tight">
            <span className="font-extrabold uppercase tracking-wide bg-black/30 px-1.5 py-0.5 rounded text-[10px] mr-1.5">
              Fase de Pruebas
            </span>
            <span className="hidden sm:inline opacity-95 text-[11px]">
              Transacciones simuladas sin impacto fiscal
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Botón Guía & Simulador de Pruebas */}
          <button
            type="button"
            onClick={() => {
              sounds.playKeypadClick();
              setShowGuideModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-black/25 hover:bg-black/40 text-amber-200 hover:text-white active:scale-95 transition text-[11px] font-extrabold cursor-pointer border border-amber-300/30 shadow-xs"
          >
            <PlayCircle className="w-3.5 h-3.5 text-amber-300" />
            <span>Guía de Pruebas</span>
          </button>

          {/* Botón Sembrar Demo */}
          <button
            type="button"
            disabled={isSeeding}
            onClick={handleSeedDemo}
            title="Añadir platos de muestra para probar la carta"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 active:scale-95 transition text-[11px] font-bold cursor-pointer disabled:opacity-50"
          >
            {isSeeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            <span className="hidden md:inline">Platos Demo</span>
          </button>

          {/* Botón Borrar Datos de Prueba */}
          <button
            type="button"
            onClick={handleOpenResetModal}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-700/90 hover:bg-red-700 active:scale-95 text-white font-black text-[11px] shadow-xs transition cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Borrar Datos</span>
          </button>

          {/* Toggle de Modo Pruebas si es Dueño/Admin */}
          {currentUserAccount && (
            <button
              type="button"
              onClick={handleToggleTestMode}
              title="Cambiar a Modo Producción"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/20 hover:bg-black/30 text-white/90 text-[11px] font-medium transition cursor-pointer ml-1"
            >
              <ToggleRight className="w-4 h-4 text-emerald-300" />
              <span className="hidden lg:inline">A Producción</span>
            </button>
          )}
        </div>
      </div>

      {/* MODAL 1: CENTRO & GUÍA DE PRUEBAS OPERATIVAS (SIMULADOR DE CIRCUITOS) */}
      {showGuideModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border-2 border-amber-400 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900 flex items-center gap-2">
                    Guía & Simulador de Pruebas
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Ejecuta cada escenario de prueba recomendado con 1 solo clic
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1 text-base font-bold"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Banner de resultado de la última simulación */}
            {simulationBanner && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 text-xs space-y-1 animate-in slide-in-from-top-2">
                <div className="font-bold flex items-center gap-1.5 text-emerald-950">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{simulationBanner.title}</span>
                </div>
                <p className="text-emerald-800 text-[11px]">{simulationBanner.desc}</p>
                <div className="pt-1 text-[11px] font-semibold text-emerald-900 flex items-center gap-1">
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Siguiente paso: {simulationBanner.nextStep}</span>
                </div>
              </div>
            )}

            {/* Los 4 Escenarios de Prueba Recomendados */}
            <div className="space-y-3">
              
              {/* ESCENARIO 1: Circuito Completo de Comedor */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 font-black text-xs flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div>
                      <h4 className="font-bold text-xs text-neutral-900 flex items-center gap-1.5">
                        <Utensils className="w-3.5 h-3.5 text-orange-600" />
                        Circuito de Salón: Mesero → Cocina (KDS) → Cobro
                      </h4>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Simula un pedido en Mesa 1 con 2 platos y notas especiales. Ocupa la mesa, notifica a Cocina y habilita la cuenta en Caja.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={simulatingAction === 'table'}
                    onClick={handleSimulateTable}
                    className="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shrink-0 transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    {simulatingAction === 'table' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <PlayCircle className="w-3.5 h-3.5" />
                    )}
                    <span>Simular Mesa 1</span>
                  </button>
                </div>
              </div>

              {/* ESCENARIO 2: Venta Rápida Mostrador / Delivery */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-black text-xs flex items-center justify-center shrink-0">
                      2
                    </span>
                    <div>
                      <h4 className="font-bold text-xs text-neutral-900 flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-blue-600" />
                        Venta Express y Canales de Delivery
                      </h4>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Prueba ventas sin asignar mesa (Mostrador para llevar) o pedidos de delivery con recargo y dirección.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={simulatingAction === 'mostrador'}
                      onClick={() => handleSimulateExpress('mostrador')}
                      className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition flex items-center gap-1 shadow-xs disabled:opacity-50"
                    >
                      {simulatingAction === 'mostrador' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      <span>+ Mostrador</span>
                    </button>
                    <button
                      type="button"
                      disabled={simulatingAction === 'delivery'}
                      onClick={() => handleSimulateExpress('delivery')}
                      className="px-2.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-900 text-white font-bold text-xs transition flex items-center gap-1 shadow-xs disabled:opacity-50"
                    >
                      {simulatingAction === 'delivery' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      <span>+ Delivery</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ESCENARIO 3: Turno de Caja y Arqueo */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-black text-xs flex items-center justify-center shrink-0">
                      3
                    </span>
                    <div>
                      <h4 className="font-bold text-xs text-neutral-900 flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                        Apertura y Cuadre de Turno de Caja
                      </h4>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Abre un turno con fondo inicial de $50.00 para ensayar el arqueo de efectivo y cálculo de diferencias al cierre.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={simulatingAction === 'shift'}
                    onClick={handleSimulateCashShift}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shrink-0 transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    {simulatingAction === 'shift' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wallet className="w-3.5 h-3.5" />
                    )}
                    <span>Abrir Turno $50</span>
                  </button>
                </div>
              </div>

              {/* ESCENARIO 4: Checklist de Homologación Operativa */}
              <div className="bg-amber-500/10 border border-amber-300 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-black text-xs flex items-center justify-center shrink-0">
                      4
                    </span>
                    <h4 className="font-extrabold text-xs text-amber-950">
                      Lista de Verificación de Homologación ({completedSteps.length}/5)
                    </h4>
                  </div>
                  {completedSteps.length === 5 && (
                    <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                      ¡100% Homologado!
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 pt-1">
                  {[
                    { id: 'step1', label: '1. Comanda tomada o simulada en Mesa (figura ocupada)' },
                    { id: 'step2', label: '2. Cocina KDS recibe alerta y despacha comanda a "Listo"' },
                    { id: 'step3', label: '3. Caja POS cobra la cuenta (efectivo/tarjeta) y libera mesa' },
                    { id: 'step4', label: '4. Turno de caja cerrado con arqueo y cuadre de efectivo' },
                    { id: 'step5', label: '5. Datos de prueba restablecidos a cero para entrega limpia' },
                  ].map(step => {
                    const isDone = completedSteps.includes(step.id);
                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => toggleStep(step.id)}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left text-xs transition border ${
                          isDone 
                            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900 font-semibold' 
                            : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        {isDone ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-neutral-400 shrink-0" />
                        )}
                        <span className={isDone ? 'line-through text-emerald-800' : ''}>{step.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Footer con acceso rápido a reseteo */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-neutral-100">
              <p className="text-[11px] text-neutral-500 text-center sm:text-left">
                Al terminar tus ensayos, limpia el sistema con un clic para iniciar en limpio.
              </p>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setShowGuideModal(false);
                    handleOpenResetModal();
                  }}
                  className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs transition flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Borrar Datos de Prueba</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className="px-3.5 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition"
                >
                  Cerrar
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL 2: Modal de Confirmación y Limpieza de Datos de Prueba */}
      {showModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border-2 border-orange-500 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900">
                    Limpiar Datos de la Fase de Pruebas
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Restablece el sistema a cero para una nueva sesión de prueba
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowModal(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1 text-base font-bold"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {successMessage ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>¡Datos de prueba restablecidos con éxito!</span>
                </div>
                <p className="text-xs">{successMessage}</p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition"
                  >
                    Aceptar y Continuar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200 space-y-3">
                  <div className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span>¿Qué se eliminará exactamente?</span>
                  </div>

                  {loadingCounts ? (
                    <div className="flex items-center justify-center py-4 text-xs text-neutral-500 gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
                      <span>Calculando registros de prueba actuales...</span>
                    </div>
                  ) : counts ? (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 bg-white rounded-xl border border-neutral-200">
                        <span className="text-neutral-500 block text-[10px]">Pedidos / Comandas</span>
                        <strong className="text-red-600 text-sm">{counts.pedidos}</strong>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-neutral-200">
                        <span className="text-neutral-500 block text-[10px]">Gastos Registrados</span>
                        <strong className="text-red-600 text-sm">{counts.gastos}</strong>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-neutral-200">
                        <span className="text-neutral-500 block text-[10px]">Turnos Operativos</span>
                        <strong className="text-red-600 text-sm">{counts.turnos}</strong>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-neutral-200">
                        <span className="text-neutral-500 block text-[10px]">Cierres de Caja</span>
                        <strong className="text-red-600 text-sm">{counts.arqueos}</strong>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-neutral-200">
                        <span className="text-neutral-500 block text-[10px]">Alertas de Auditoría</span>
                        <strong className="text-red-600 text-sm">{counts.alertas}</strong>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-neutral-200">
                        <span className="text-neutral-500 block text-[10px]">Mesas a Desocupar</span>
                        <strong className="text-amber-600 text-sm">{counts.mesasOcupadas}</strong>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-500">Se eliminarán todos los pedidos, turnos, comandas, gastos y se desocuparán todas las mesas.</p>
                  )}

                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-[11px] text-emerald-800 space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Lo que se MANTIENE intacto:
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 text-[10px] text-emerald-700 font-medium">
                      <li>Tus sucursales y la configuración de mesas.</li>
                      <li>Tus empleados registrados y sus PINs de acceso.</li>
                      <li>Tu carta de menú, platos, fotos y precios.</li>
                      <li>Tu cuenta de dueño y credenciales de acceso.</li>
                    </ul>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    disabled={isResetting}
                    onClick={() => setShowModal(false)}
                    className="flex-1 h-11 rounded-xl bg-neutral-100 hover:bg-neutral-200 font-bold text-xs text-neutral-700 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isResetting || loadingCounts}
                    onClick={handleExecuteReset}
                    className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 font-bold text-xs text-white shadow-md flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
                  >
                    {isResetting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Borrando datos...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4" />
                        <span>Confirmar y Limpiar</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

