import { UNIQUE_BUSINESS_ID } from './config/business';
import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PinLogin } from './components/PinLogin';
import { TopNav } from './components/TopNav';
import { WaiterPOS } from './components/WaiterPOS';
import { KitchenDisplay } from './components/KitchenDisplay';
import { CashierView } from './components/CashierView';
import { AdminDashboard } from './components/AdminDashboard';
import { CreatorDashboard } from './components/CreatorDashboard';
import { RestaurantOnboarding } from './components/RestaurantOnboarding';
import { StaffAttendanceView } from './components/StaffAttendanceView';
import { 
  subscribeToOrders, 
  subscribeToMenuItems, 
  subscribeToTables, 
  subscribeToShifts, 
  subscribeToClients, 
  subscribeToInventoryItems,
  updateOrderStatus 
} from './services/dataService';
import { Order, MenuItem, Table, Shift, Client, InventoryItem } from './types';
import { UtensilsCrossed, ShieldAlert, Loader2 } from 'lucide-react';
import { sounds } from './utils/sound';
import { OfflineIndicator } from './components/OfflineIndicator';
import { TestModeBanner } from './components/TestModeBanner';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { ConfidentialityContractModal } from './components/ConfidentialityContractModal';

const MainAppContent: React.FC = () => {
  const { 
    currentUserAccount,
    currentBusiness,
    allBusinesses,
    currentEmployee, 
    currentRestaurant, 
    allRestaurants, 
    allEmployees,
    selectRestaurant,
    isLoadingAuth 
  } = useAuth();
  
  // App-wide Real-Time State (Firestore onSnapshot)
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // Vista SaaS (Panel Creador vs Panel Restaurante)
  const [saasView, setSaasView] = useState<'restaurant' | 'superadmin'>('restaurant');

  // Modal global para Contrato de Confidencialidad
  const [showGlobalContractModal, setShowGlobalContractModal] = useState(false);

  useEffect(() => {
    const handleOpenContract = () => setShowGlobalContractModal(true);
    window.addEventListener('open-confidentiality-contract', handleOpenContract);
    return () => window.removeEventListener('open-confidentiality-contract', handleOpenContract);
  }, []);

  useEffect(() => {
    if (currentUserAccount?.rol === 'superadmin') {
      setSaasView('superadmin');
    } else {
      setSaasView('restaurant');
    }
  }, [currentUserAccount]);

  // Modal para ver detalle de pedido seleccionado desde notificaciones
  const [activeOrderModal, setActiveOrderModal] = useState<Order | null>(null);

  // Modal secundario para crear nueva sucursal si se solicita desde TopNav
  const [showNewBranchModal, setShowNewBranchModal] = useState(false);

  // Escuchar evento personalizado para abrir modal de sucursal
  useEffect(() => {
    const handleOpenModal = () => setShowNewBranchModal(true);
    window.addEventListener('open-new-restaurant-modal', handleOpenModal);
    return () => window.removeEventListener('open-new-restaurant-modal', handleOpenModal);
  }, []);

  // Subscriptions to Firestore collections
  const activeUser = currentUserAccount || currentEmployee;
  const isSuperAdmin = currentUserAccount?.rol === 'superadmin';
  const activeBizId = isSuperAdmin
    ? (currentRestaurant?.businessId || allRestaurants[0]?.businessId || currentUserAccount?.businessId || UNIQUE_BUSINESS_ID)
    : (currentUserAccount?.businessId || currentEmployee?.businessId || currentRestaurant?.businessId || allRestaurants[0]?.businessId || UNIQUE_BUSINESS_ID);

  useEffect(() => {
    if (!activeUser) return;

    const currentRestId = currentRestaurant?.id || null;

    const unsubOrders = subscribeToOrders(currentRestId, (data) => {
      setOrders(data);
    }, activeBizId);

    const unsubMenu = subscribeToMenuItems(currentRestId, (data) => {
      setMenuItems(data);
    }, activeBizId);

    const unsubTables = currentRestaurant 
      ? subscribeToTables(currentRestaurant.id, (data) => setTables(data), activeBizId)
      : () => {};

    const unsubShifts = subscribeToShifts(currentRestId, (data) => {
      setShifts(data);
    }, activeBizId);

    const unsubClients = subscribeToClients((data) => {
      setClients(data);
    }, activeBizId);

    const unsubInventory = subscribeToInventoryItems(currentRestId, (data) => {
      setInventoryItems(data);
    }, activeBizId);

    return () => {
      unsubOrders();
      unsubMenu();
      unsubTables();
      unsubShifts();
      unsubClients();
      unsubInventory();
    };
  }, [activeUser, currentRestaurant, activeBizId]);

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-amber-50/50 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-lg animate-pulse mb-3">
          <UtensilsCrossed className="w-8 h-8" />
        </div>
        <div className="flex items-center gap-2 text-neutral-600 font-bold text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
          <span>Cargando Gastro Smart...</span>
        </div>
      </div>
    );
  }

  // Si no hay usuario (ni admin por Firebase Auth ni operativo por PIN) -> Pantalla de Autenticación
  if (!currentUserAccount && !currentEmployee) {
    return <PinLogin />;
  }

  // Si el usuario es Dueño o Administrador (Firebase Auth):
  if (currentUserAccount) {
    // La pantalla de Creador (CreatorDashboard) es EXCLUSIVA para el Creador (superadmin)
    const isSuperAdminView = currentUserAccount.rol === 'superadmin' && saasView === 'superadmin';

    // Si no tiene ningún restaurante creado aún y no es superadmin -> Onboarding inicial de bienvenida
    if (allRestaurants.length === 0 && !isSuperAdminView) {
      return <RestaurantOnboarding />;
    }

    return (
      <div className="h-full h-dvh max-h-dvh flex flex-col bg-neutral-100 antialiased selection:bg-orange-500 selection:text-white overflow-hidden">
        <TestModeBanner />
        <TopNav 
          orders={orders} 
          onOrderClick={(ord) => setActiveOrderModal(ord)}
          onOpenNewRestaurantModal={() => setShowNewBranchModal(true)}
          saasView={saasView}
          onToggleSaasView={(v) => setSaasView(v)}
        />

        {isSuperAdminView ? (
          <CreatorDashboard 
            businesses={allBusinesses}
            allRestaurants={allRestaurants}
            allEmployees={allEmployees}
            onInspectRestaurant={(rest) => {
              selectRestaurant(rest.id);
              setSaasView('restaurant');
            }}
          />
        ) : (
          <AdminDashboard 
            restaurants={allRestaurants}
            employees={allEmployees}
            menuItems={menuItems}
            shifts={shifts}
            orders={orders}
          />
        )}

        {/* Modal Secundario de Onboarding para nueva sucursal */}
        {showNewBranchModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-lg w-full p-2 relative shadow-2xl max-h-[92vh] overflow-y-auto overscroll-contain">
              <RestaurantOnboarding 
                isSecondaryModal={true} 
                onCloseModal={() => setShowNewBranchModal(false)} 
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Si el usuario es Personal Operativo con PIN:
  if (currentEmployee) {
    // Si no hay restaurantes y es admin operativo -> Onboarding
    if (currentEmployee.puesto === 'admin' && allRestaurants.length === 0) {
      return <RestaurantOnboarding />;
    }

    // Personal operativo sin acceso a TPV ni pedidos (Ayudante de cocina y Limpieza):
    if (currentEmployee.puesto === 'ayudante_cocina' || currentEmployee.puesto === 'limpieza') {
      return <StaffAttendanceView />;
    }

    return (
      <div className="h-full h-dvh max-h-dvh flex flex-col bg-neutral-100 antialiased selection:bg-orange-500 selection:text-white overflow-hidden">
        <TestModeBanner />
        <TopNav 
          orders={orders} 
          onOrderClick={(ord) => setActiveOrderModal(ord)} 
        />

        {currentEmployee.puesto === 'cocina' && (
          <KitchenDisplay orders={orders} inventoryItems={inventoryItems} menuItems={menuItems} />
        )}

        {currentEmployee.puesto === 'mesero' && (
          <WaiterPOS 
            menuItems={menuItems} 
            tables={tables} 
            orders={orders} 
            clients={clients}
          />
        )}

        {(currentEmployee.puesto === 'caja' || currentEmployee.puesto === 'mostrador') && (
          <CashierView 
            orders={orders} 
            menuItems={menuItems}
            tables={tables}
            clients={clients}
            initialTab={currentEmployee.puesto === 'mostrador' ? 'mostrador' : 'pos'}
          />
        )}

        {currentEmployee.puesto === 'admin' && (
          <AdminDashboard 
            restaurants={allRestaurants}
            employees={allEmployees}
            menuItems={menuItems}
            shifts={shifts}
            orders={orders}
          />
        )}

        {/* Modal de detalle de pedido desde notificación de campana */}
        {activeOrderModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900">
                    {activeOrderModal.tipo === 'local' ? `Mesa #${activeOrderModal.mesaNumero}` : `Delivery (${activeOrderModal.empresaDelivery || 'General'})`}
                  </h3>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    activeOrderModal.estado === 'listo' 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {activeOrderModal.estado.replace('_', ' ')}
                  </span>
                </div>
                <button 
                  onClick={() => setActiveOrderModal(null)}
                  className="text-neutral-400 hover:text-neutral-600 p-1"
                >
                  ✕
                </button>
              </div>

              {/* Platos */}
              <div className="space-y-1.5 text-xs">
                {activeOrderModal.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between py-1 border-b border-neutral-100">
                    <span><strong>{it.cantidad}x</strong> {it.nombre}</span>
                    <span className="font-mono font-bold">${(it.precio * it.cantidad).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {activeOrderModal.motivoRechazo && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                  <strong>Motivo de rechazo por Cocina:</strong> {activeOrderModal.motivoRechazo}
                </div>
              )}

              {/* Si está listo y el usuario es mesero o admin: opción de marcar entregado */}
              {activeOrderModal.estado === 'listo' && (
                <button
                  type="button"
                  onClick={async () => {
                    sounds.stopRepeatingAlarm('ord-ready-' + activeOrderModal.id);
                    sounds.stopRepeatingAlarm('ord-rej-' + activeOrderModal.id);
                    await updateOrderStatus(
                      activeOrderModal.id, 
                      'entregado', 
                      currentEmployee.nombre, 
                      { timeline: activeOrderModal.timeline || [] }
                    );
                    setActiveOrderModal(null);
                  }}
                  className="w-full min-h-[52px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-md shadow-emerald-600/20"
                >
                  Marcar como Entregado a la Mesa
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  sounds.stopRepeatingAlarm('ord-ready-' + activeOrderModal.id);
                  sounds.stopRepeatingAlarm('ord-rej-' + activeOrderModal.id);
                  setActiveOrderModal(null);
                }}
                className="w-full h-11 rounded-xl bg-neutral-100 hover:bg-neutral-200 font-bold text-xs text-neutral-700"
              >
                Cerrar Detalle y Silenciar
              </button>
            </div>
          </div>
        )}

        {/* Modal Global de Contrato de Confidencialidad */}
        {showGlobalContractModal && (
          <ConfidentialityContractModal
            businessName={currentBusiness?.nombre || currentRestaurant?.nombre || 'Mi Restaurante'}
            businessRif={currentBusiness?.rif_o_ruc || 'J-00000000-0'}
            representativeName={currentUserAccount?.nombre || currentEmployee?.nombre || 'Administrador'}
            onClose={() => setShowGlobalContractModal(false)}
          />
        )}

        {/* Banner de Autorización de Cookies & Privacidad */}
        <CookieConsentBanner 
          onOpenContract={() => setShowGlobalContractModal(true)} 
        />

      </div>
    );
  }

  return (
    <>
      <PinLogin />
      {showGlobalContractModal && (
        <ConfidentialityContractModal
          businessName={currentBusiness?.nombre || 'Mi Restaurante'}
          businessRif={currentBusiness?.rif_o_ruc || 'J-00000000-0'}
          representativeName="Administrador"
          onClose={() => setShowGlobalContractModal(false)}
        />
      )}
      <CookieConsentBanner 
        onOpenContract={() => setShowGlobalContractModal(true)} 
      />
    </>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
      <OfflineIndicator />
    </AuthProvider>
  );
}
