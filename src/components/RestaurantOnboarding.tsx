import { UNIQUE_BUSINESS_ID } from '../config/business';
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createRestaurantWithTables } from '../services/dataService';
import { sounds } from '../utils/sound';
import { LogoUploader } from './LogoUploader';
import { 
  UtensilsCrossed, 
  Store, 
  MapPin, 
  Phone, 
  Grid3X3, 
  CheckCircle2, 
  ArrowRight, 
  Sparkles, 
  Users, 
  MenuSquare, 
  Building2, 
  ChefHat,
  X 
} from 'lucide-react';

interface RestaurantOnboardingProps {
  onDirectAction?: (tab: 'empleados' | 'menu') => void;
  isSecondaryModal?: boolean;
  onCloseModal?: () => void;
}

export const RestaurantOnboarding: React.FC<RestaurantOnboardingProps> = ({
  onDirectAction,
  isSecondaryModal = false,
  onCloseModal
}) => {
  const { selectRestaurant, currentUserAccount, currentBusiness, allRestaurants } = useAuth();

  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [numeroMesas, setNumeroMesas] = useState<number>(10);
  const [usaCocina, setUsaCocina] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [createdRestaurantId, setCreatedRestaurantId] = useState<string | null>(null);

  const activeBizId = currentUserAccount?.businessId || currentBusiness?.id || UNIQUE_BUSINESS_ID;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setErrorMsg('Por favor ingresa el nombre del restaurante.');
      return;
    }
    if (!numeroMesas || numeroMesas < 1) {
      setErrorMsg('El número de mesas debe ser como mínimo 1.');
      return;
    }

    if (isSecondaryModal && currentBusiness) {
      const limitSucursales = currentBusiness.suscripcion?.limiteSucursales || 
        (currentBusiness.plan === 'enterprise' ? 10 : currentBusiness.plan === 'pro' ? 3 : 1);
      if (allRestaurants.length >= limitSucursales) {
        setErrorMsg(`⚠️ Límite de sucursales alcanzado. Tu plan actual (${currentBusiness.suscripcion?.plan?.toUpperCase() || currentBusiness.plan?.toUpperCase() || 'BÁSICO'}) permite un máximo de ${limitSucursales} sucursal(es). Contacta con el Creador/SuperAdmin para actualizar tu plan.`);
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      sounds.playCashRegister();
      const newRestId = await createRestaurantWithTables({
        nombre: nombre.trim(),
        direccion: direccion.trim(),
        telefono: telefono.trim(),
        numeroMesas: Number(numeroMesas),
        usaCocina: usaCocina !== false,
        logoUrl: logoUrl.trim() || null
      }, activeBizId);
      selectRestaurant(newRestId);
      setCreatedRestaurantId(newRestId);
    } catch (err: any) {
      console.error('Error al crear restaurante:', err);
      setErrorMsg(err.message || 'Error al crear el restaurante.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Pantalla de éxito tras crear el restaurante
  if (createdRestaurantId) {
    return (
      <div className={isSecondaryModal ? "p-2 overflow-y-auto" : "min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 flex items-center justify-center p-4 sm:p-6 overflow-y-auto py-8"}>
        <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-orange-100 p-6 sm:p-8 text-center space-y-6 animate-in zoom-in-95 duration-200 max-h-[88vh] overflow-y-auto overscroll-contain">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-emerald-100 text-emerald-600 shadow-md">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-widest font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              ¡Operación Exitosa!
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-neutral-900 mt-3">
              ¡Restaurante creado!
            </h2>
            <p className="text-neutral-600 text-sm mt-2 leading-relaxed">
              Hemos generado automáticamente las <strong>{numeroMesas} mesas</strong> numeradas del 1 al {numeroMesas} en estado libre. Ya puedes registrar a tus empleados y tu carta menú.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => {
                sounds.playKeypadClick();
                if (onCloseModal) onCloseModal();
                if (onDirectAction) onDirectAction('empleados');
              }}
              className="p-4 rounded-2xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-left transition flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center font-bold shadow-sm">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-neutral-900 text-sm">Registrar Empleados</div>
                  <div className="text-[11px] text-neutral-500">Asignar PINs y roles</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-orange-600 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={() => {
                sounds.playKeypadClick();
                if (onCloseModal) onCloseModal();
                if (onDirectAction) onDirectAction('menu');
              }}
              className="p-4 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-left transition flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-sm">
                  <MenuSquare className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-neutral-900 text-sm">Configurar Menú</div>
                  <div className="text-[11px] text-neutral-500">Platos y precios</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-amber-600 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="pt-2 border-t border-neutral-100">
            <button
              onClick={() => {
                if (onCloseModal) onCloseModal();
                else window.location.reload();
              }}
              className="w-full h-11 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold transition"
            >
              Ir al Panel Principal
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={isSecondaryModal ? "p-1 overflow-y-auto" : "min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 flex items-center justify-center p-4 sm:p-6 overflow-y-auto py-8 sm:py-12"}>
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-orange-100 p-5 sm:p-8 backdrop-blur-sm relative max-h-[88vh] sm:max-h-[90vh] overflow-y-auto overscroll-contain">
        
        {isSecondaryModal && onCloseModal && (
          <button
            onClick={onCloseModal}
            className="absolute top-5 right-5 p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/20 mb-3">
            <Store className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-neutral-900">
            {isSecondaryModal ? 'Crear Nueva Sucursal' : 'Bienvenido a Gastro Smart'}
          </h1>
          <p className="text-neutral-600 text-xs sm:text-sm mt-1">
            {isSecondaryModal 
              ? 'Agrega otra sucursal independiente con su propio menú, mesas y empleados.' 
              : 'Configura tu primera sucursal para activar el sistema.'}
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-orange-500" />
              Nombre del Restaurante / Sucursal: *
            </label>
            <input
              type="text"
              required
              placeholder="Ej: Gastro Smart - Sede Centro"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-neutral-300 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-orange-500" />
                Dirección:
              </label>
              <input
                type="text"
                placeholder="Ej: Av. Principal 123"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-neutral-300 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-orange-500" />
                Teléfono:
              </label>
              <input
                type="text"
                placeholder="Ej: +1 (555) 012-3456"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-neutral-300 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
              />
            </div>
          </div>

          {/* Subir Logotipo del Restaurante */}
          <LogoUploader
            logoUrl={logoUrl}
            onChange={(url) => setLogoUrl(url)}
            restaurantName={nombre}
            label="Logotipo del Restaurante:"
            helperText="Sube el logo de la marca (PNG o JPG). Se mostrará en la barra superior, TPV, comandas y pantalla de inicio."
          />

          <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-black text-neutral-900 flex items-center gap-1.5">
                <Grid3X3 className="w-4 h-4 text-orange-600" />
                Número de Mesas: *
              </label>
              <span className="text-[11px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-md">
                Mínimo 1
              </span>
            </div>
            <p className="text-[11px] text-neutral-600 mb-2.5">
              Se crearán automáticamente numeradas del 1 al {numeroMesas || 1} en estado libre para el plano de meseros.
            </p>
            <input
              type="number"
              min={1}
              max={150}
              required
              value={numeroMesas}
              onChange={(e) => setNumeroMesas(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full h-12 px-4 rounded-xl border border-neutral-300 text-base font-black text-neutral-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition bg-white"
            />
          </div>

          {/* Selector de Modo Cocina vs Directo a Mostrador */}
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-bold text-neutral-800">
              Modo Operativo de Pedidos & Cocina:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setUsaCocina(true)}
                className={`p-3.5 rounded-2xl border text-left transition flex flex-col justify-between gap-1.5 cursor-pointer ${
                  usaCocina
                    ? 'bg-amber-50/90 border-amber-400 text-amber-950 shadow-xs ring-2 ring-amber-400/20'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5 font-extrabold text-xs text-amber-900">
                    <ChefHat className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Con Cocina (KDS)</span>
                  </div>
                  <input
                    type="radio"
                    name="onboardingUsaCocina"
                    checked={usaCocina}
                    onChange={() => setUsaCocina(true)}
                    className="text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                </div>
                <p className="text-[11px] text-neutral-600 leading-tight">
                  Ideal para restaurantes con área de cocina. Emite alertas y pedidos pasan por pantalla de cocina.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setUsaCocina(false)}
                className={`p-3.5 rounded-2xl border text-left transition flex flex-col justify-between gap-1.5 cursor-pointer ${
                  !usaCocina
                    ? 'bg-purple-50/90 border-purple-400 text-purple-950 shadow-xs ring-2 ring-purple-400/20'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5 font-extrabold text-xs text-purple-900">
                    <Store className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>Sin Cocina</span>
                  </div>
                  <input
                    type="radio"
                    name="onboardingUsaCocina"
                    checked={!usaCocina}
                    onChange={() => setUsaCocina(false)}
                    className="text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                </div>
                <p className="text-[11px] text-neutral-600 leading-tight">
                  Para cafeterías, quioscos o heladerías. Pedidos van directo a mostrador sin alertas de cocina.
                </p>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 rounded-xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-extrabold text-sm shadow-md shadow-orange-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Generando restaurante y mesas...</span>
            ) : (
              <>
                <Building2 className="w-4 h-4" />
                <span>{isSecondaryModal ? 'Crear Sucursal' : 'Guardar y Comenzar'}</span>
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
};
