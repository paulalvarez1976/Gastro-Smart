import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Business, BusinessSubscription, Restaurant, Employee } from '../types';
import { LogoUploader } from './LogoUploader';
import { 
  createBusiness, 
  updateBusiness, 
  bootstrapNewBusinessDefaults, 
  createUserAccount, 
  updateUserAccount,
  deleteBusinessCascade,
  resetTestOperationalData,
  setAllBusinessesToTrialMode,
  assignOrCreateBranchCodeForBusiness,
  generateUniqueBranchCode
} from '../services/dataService';
import { 
  Building2, 
  ShieldCheck, 
  Sparkles, 
  Search, 
  Filter, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  DollarSign, 
  Plus, 
  Edit3, 
  Store, 
  Users, 
  Key, 
  Lock, 
  Shield, 
  UserCheck, 
  Layers, 
  Activity, 
  Check, 
  X,
  CreditCard,
  RefreshCw,
  Info,
  Trash2,
  RotateCcw,
  Eraser,
  AlertOctagon,
  Wand2,
  MapPin,
  Phone,
  Hash,
  ExternalLink
} from 'lucide-react';
import { sounds } from '../utils/sound';

interface CreatorDashboardProps {
  businesses: Business[];
  allRestaurants: Restaurant[];
  allEmployees?: Employee[];
  onSelectBusinessContext?: (businessId: string) => void;
  onInspectRestaurant?: (restaurant: Restaurant) => void;
}

export const CreatorDashboard: React.FC<CreatorDashboardProps> = ({
  businesses,
  allRestaurants,
  allEmployees = [],
  onSelectBusinessContext,
  onInspectRestaurant
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'activo' | 'suspendido' | 'vencido' | 'prueba'>('all');
  const [planFilter, setPlanFilter] = useState<'all' | 'basico' | 'pro' | 'enterprise'>('all');
  const [viewMode, setViewMode] = useState<'all_unified' | 'restaurants_db'>('all_unified');

  // Modal para editar suscripción y credenciales
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [subForm, setSubForm] = useState<{
    plan: 'basico' | 'pro' | 'enterprise';
    estado: 'activo' | 'suspendido' | 'vencido' | 'prueba';
    fechaVencimiento: string;
    limiteSucursales: number;
    limiteMesasPorSucursal: number;
    limiteUsuarios: number;
    precioMensualUSD: number;
    notasSuscripcion: string;
    ownerEmail: string;
    ownerClave: string;
    ownerNombre: string;
    codigoSede: string;
    logoUrl?: string;
  }>({
    plan: 'pro',
    estado: 'activo',
    fechaVencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    limiteSucursales: 3,
    limiteMesasPorSucursal: 20,
    limiteUsuarios: 10,
    precioMensualUSD: 49,
    notasSuscripcion: '',
    ownerEmail: '',
    ownerClave: '',
    ownerNombre: '',
    codigoSede: '',
    logoUrl: ''
  });

  // Modal para registrar nuevo restaurante
  const [showNewTenantModal, setShowNewTenantModal] = useState(false);
  const [createdCredsModal, setCreatedCredsModal] = useState<{ businessName: string; email: string; clave: string; codigoSede: string } | null>(null);
  const [tenantForm, setTenantForm] = useState({
    nombre: '',
    rif_o_ruc: '',
    ownerName: '',
    email: '',
    clave: 'Gastro' + Math.floor(1000 + Math.random() * 9000),
    codigoSede: Math.floor(1000 + Math.random() * 9000).toString(),
    plan: 'pro' as 'basico' | 'pro' | 'enterprise',
    diasValidez: 30,
    limiteSucursales: 3,
    precioUSD: 49,
    logoUrl: ''
  });
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modales de eliminación, reset y clave
  const [deleteConfirmBiz, setDeleteConfirmBiz] = useState<Business | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [resetDataBiz, setResetDataBiz] = useState<Business | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isSettingAllTrial, setIsSettingAllTrial] = useState(false);

  // Modal dedicado para cambiar/generar clave de restaurante
  const [passwordModalBiz, setPasswordModalBiz] = useState<Business | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState<string>('');
  const [isUpdatingPass, setIsUpdatingPass] = useState(false);

  // Modal dedicado para asignar o crear el Código de 4 Dígitos (Empresa / Sede)
  const [branchCodeModal, setBranchCodeModal] = useState<{
    biz: Business;
    restaurantId?: string;
    restaurantName?: string;
  } | null>(null);
  const [newBranchCodeValue, setNewBranchCodeValue] = useState<string>('');
  const [isUpdatingBranchCode, setIsUpdatingBranchCode] = useState(false);

  const handleOpenBranchCodeModal = (biz: Business, rest?: Restaurant) => {
    sounds.playKeypadClick();
    const bizRests = allRestaurants.filter(r => r.businessId === biz.id);
    const targetRest = rest || bizRests[0];
    const existingCode = targetRest?.codigoSede || biz.codigoSede || '';
    const existingCodesSet = new Set(allRestaurants.map(r => r.codigoSede).filter(Boolean) as string[]);
    setBranchCodeModal({
      biz,
      restaurantId: targetRest?.id,
      restaurantName: targetRest?.nombre || `${biz.nombre} - Sede Principal`
    });
    setNewBranchCodeValue(existingCode || generateUniqueBranchCode(existingCodesSet));
  };

  const handleGenerateRandomBranchCode = () => {
    sounds.playKeypadClick();
    const existingCodesSet = new Set(allRestaurants.map(r => r.codigoSede).filter(Boolean) as string[]);
    if (newBranchCodeValue) existingCodesSet.add(newBranchCodeValue);
    setNewBranchCodeValue(generateUniqueBranchCode(existingCodesSet));
  };

  const handleSaveBranchCode = async () => {
    if (!branchCodeModal) return;
    const cleanCode = newBranchCodeValue.replace(/\D/g, '').slice(0, 4);
    if (cleanCode.length !== 4) {
      alert('El código de la empresa / sede debe tener exactamente 4 dígitos numéricos (ej: 3592).');
      return;
    }
    try {
      setIsUpdatingBranchCode(true);
      sounds.playKeypadClick();
      await assignOrCreateBranchCodeForBusiness({
        businessId: branchCodeModal.biz.id,
        businessName: branchCodeModal.biz.nombre,
        codigoSede: cleanCode,
        restaurantId: branchCodeModal.restaurantId,
        logoUrl: branchCodeModal.biz.logoUrl || null
      });
      sounds.playCashRegister();
      setSuccessMsg(`¡Código de 4 dígitos (${cleanCode}) asignado exitosamente a "${branchCodeModal.biz.nombre}"!`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setBranchCodeModal(null);
    } catch (err: any) {
      alert('Error asignando el código de 4 dígitos: ' + err.message);
    } finally {
      setIsUpdatingBranchCode(false);
    }
  };

  const handleOpenPasswordModal = (biz: Business) => {
    sounds.playKeypadClick();
    setPasswordModalBiz(biz);
    setNewPasswordValue(biz.ownerClave || ('Gastro' + Math.floor(1000 + Math.random() * 9000)));
  };

  const handleGenerateRandomPassword = () => {
    sounds.playKeypadClick();
    setNewPasswordValue('Gastro' + Math.floor(1000 + Math.random() * 9000));
  };

  const handleSaveNewPassword = async () => {
    if (!passwordModalBiz) return;
    const cleanPass = newPasswordValue.trim();
    if (!cleanPass) {
      alert('Ingresa una clave válida');
      return;
    }
    try {
      setIsUpdatingPass(true);
      sounds.playKeypadClick();

      const ownerEmail = (passwordModalBiz.ownerEmail || passwordModalBiz.email || '').trim();
      const ownerNombre = (passwordModalBiz.ownerNombre || 'Administrador').trim();
      const ownerUid = passwordModalBiz.ownerUid || ('owner_' + passwordModalBiz.id);

      // Actualizar en documento de negocio
      await updateBusiness(passwordModalBiz.id, {
        ownerClave: cleanPass,
        ownerEmail,
        email: ownerEmail
      });

      // Actualizar o crear en colección users
      await updateUserAccount(ownerUid, {
        claveAsignada: cleanPass,
        email: ownerEmail,
        nombre: ownerNombre
      }).catch(() => {
        return createUserAccount({
          uid: ownerUid,
          email: ownerEmail,
          nombre: ownerNombre,
          rol: 'owner',
          businessId: passwordModalBiz.id,
          restaurantId: null,
          appId: 'gastro_smart',
          creadoEn: new Date().toISOString(),
          claveAsignada: cleanPass
        });
      });

      sounds.playCashRegister();
      setSuccessMsg(`¡Clave de acceso para "${passwordModalBiz.nombre}" actualizada a: ${cleanPass}!`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setPasswordModalBiz(null);
    } catch (err: any) {
      alert('Error actualizando la clave: ' + err.message);
    } finally {
      setIsUpdatingPass(false);
    }
  };

  // Mapear sucursales por negocio (conteo y lista detallada)
  const restaurantsByBiz = useMemo(() => {
    const map = new Map<string, Restaurant[]>();
    allRestaurants.forEach(r => {
      const bizId = r.businessId || ('biz_' + r.id);
      const list = map.get(bizId) || [];
      list.push(r);
      map.set(bizId, list);
    });
    return map;
  }, [allRestaurants]);

  const branchesByBiz = useMemo(() => {
    const map = new Map<string, number>();
    restaurantsByBiz.forEach((list, bizId) => {
      map.set(bizId, list.length);
    });
    return map;
  }, [restaurantsByBiz]);

  // Unificar negocios registrados en 'businesses' con cualquier restaurante creado en 'restaurants' que aún no tenga documento en 'businesses'
  const effectiveBusinesses = useMemo(() => {
    const bizMap = new Map<string, Business>();
    businesses.forEach(b => {
      bizMap.set(b.id, b);
    });

    allRestaurants.forEach(r => {
      const bizId = r.businessId || ('biz_' + r.id);
      if (!bizMap.has(bizId)) {
        const cleanName = r.nombre.replace(/\s*-\s*Sede Principal$/i, '').trim() || r.nombre;
        const fechaInicio = r.creadoEn || new Date().toISOString();
        const fechaVenc = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
        bizMap.set(bizId, {
          id: bizId,
          nombre: cleanName,
          rif_o_ruc: 'J-00000000-0',
          plan: 'pro',
          activo: r.activo !== false,
          creadoEn: fechaInicio,
          ownerUid: 'owner_' + bizId,
          ownerEmail: 'admin@gastrosmart.com',
          ownerNombre: 'Administrador (' + cleanName + ')',
          ownerClave: 'Gastro1234',
          email: 'admin@gastrosmart.com',
          codigoSede: r.codigoSede || '',
          logoUrl: r.logoUrl || null,
          appId: 'gastro_smart',
          suscripcion: {
            plan: 'pro',
            estado: r.activo !== false ? 'activo' : 'suspendido',
            fechaInicio,
            fechaVencimiento: fechaVenc,
            limiteSucursales: 3,
            limiteMesasPorSucursal: Math.max(20, r.numeroMesas || 10),
            limiteUsuarios: 10,
            precioMensualUSD: 49,
            notasSuscripcion: 'Sincronizado automáticamente desde restaurante en BD'
          }
        });
      } else {
        const current = bizMap.get(bizId)!;
        if (!current.codigoSede && r.codigoSede) {
          bizMap.set(bizId, { ...current, codigoSede: r.codigoSede });
        }
      }
    });

    return Array.from(bizMap.values());
  }, [businesses, allRestaurants]);

  // Auto-sincronizar en Firestore cualquier restaurante huérfano que no tenga su documento en 'businesses'
  const syncedOrphanBizIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const existingIds = new Set(businesses.map(b => b.id));
    effectiveBusinesses.forEach(eb => {
      if (!existingIds.has(eb.id) && !syncedOrphanBizIdsRef.current.has(eb.id)) {
        syncedOrphanBizIdsRef.current.add(eb.id);
        const { id, ...restData } = eb;
        createBusiness(restData, id).catch(() => {});
      }
    });
  }, [businesses, effectiveBusinesses]);

  // Lista de Negocios Filtrada
  const filteredBusinesses = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return effectiveBusinesses.filter(b => {
      const bizRests = restaurantsByBiz.get(b.id) || [];
      const matchRest = bizRests.some(r =>
        r.nombre.toLowerCase().includes(q) ||
        (r.direccion || '').toLowerCase().includes(q) ||
        (r.telefono || '').toLowerCase().includes(q) ||
        (r.codigoSede || '').toLowerCase().includes(q)
      );

      const matchSearch = !q || 
        b.nombre.toLowerCase().includes(q) ||
        (b.rif_o_ruc || '').toLowerCase().includes(q) ||
        (b.email || '').toLowerCase().includes(q) ||
        (b.ownerEmail || '').toLowerCase().includes(q) ||
        matchRest;

      const subState = b.suscripcion?.estado || (b.activo ? 'activo' : 'suspendido');
      const matchStatus = statusFilter === 'all' || subState === statusFilter;

      const currentPlan = b.suscripcion?.plan || b.plan || 'basico';
      const matchPlan = planFilter === 'all' || currentPlan === planFilter;

      return matchSearch && matchStatus && matchPlan;
    });
  }, [effectiveBusinesses, restaurantsByBiz, searchTerm, statusFilter, planFilter]);

  // Lista de Todos los Restaurantes (Sucursales en BD) Filtrada
  const filteredAllRestaurants = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allRestaurants.filter(r => {
      const parentBiz = effectiveBusinesses.find(b => b.id === r.businessId);
      const matchSearch = !q ||
        r.nombre.toLowerCase().includes(q) ||
        (r.direccion || '').toLowerCase().includes(q) ||
        (r.telefono || '').toLowerCase().includes(q) ||
        (r.codigoSede || '').toLowerCase().includes(q) ||
        (r.id || '').toLowerCase().includes(q) ||
        (parentBiz?.nombre || '').toLowerCase().includes(q) ||
        (parentBiz?.ownerEmail || '').toLowerCase().includes(q);

      if (!matchSearch) return false;
      if (parentBiz) {
        const subState = parentBiz.suscripcion?.estado || (parentBiz.activo ? 'activo' : 'suspendido');
        if (statusFilter !== 'all' && subState !== statusFilter) return false;
        const currentPlan = parentBiz.suscripcion?.plan || parentBiz.plan || 'basico';
        if (planFilter !== 'all' && currentPlan !== planFilter) return false;
      }
      return true;
    });
  }, [allRestaurants, effectiveBusinesses, searchTerm, statusFilter, planFilter]);

  // Estadísticas globales del SaaS
  const stats = useMemo(() => {
    let activas = 0;
    let suspendidas = 0;
    let vencidas = 0;
    let pruebas = 0;
    let mrrEstimado = 0;

    effectiveBusinesses.forEach(b => {
      const st = b.suscripcion?.estado || (b.activo ? 'activo' : 'suspendido');
      if (st === 'activo') activas++;
      else if (st === 'suspendido') suspendidas++;
      else if (st === 'vencido') vencidas++;
      else if (st === 'prueba') pruebas++;

      if (st === 'activo' || st === 'prueba') {
        const precio = b.suscripcion?.precioMensualUSD || (b.plan === 'enterprise' ? 99 : b.plan === 'pro' ? 49 : 29);
        mrrEstimado += precio;
      }
    });

    return {
      total: effectiveBusinesses.length,
      totalRestaurantsDb: allRestaurants.length,
      activas,
      suspendidas,
      vencidas,
      pruebas,
      mrrEstimado
    };
  }, [effectiveBusinesses, allRestaurants.length]);

  // Abrir modal de edición de suscripción
  const handleOpenEditSub = (biz: Business) => {
    sounds.playKeypadClick();
    setEditingBusiness(biz);
    const sub = biz.suscripcion;
    const bizRests = restaurantsByBiz.get(biz.id) || [];
    const primaryCode = bizRests[0]?.codigoSede || biz.codigoSede || '';
    setSubForm({
      plan: sub?.plan || biz.plan || 'pro',
      estado: sub?.estado || (biz.activo ? 'activo' : 'suspendido'),
      fechaVencimiento: sub?.fechaVencimiento 
        ? sub.fechaVencimiento.slice(0, 10) 
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      limiteSucursales: sub?.limiteSucursales || (biz.plan === 'enterprise' ? 10 : biz.plan === 'pro' ? 3 : 1),
      limiteMesasPorSucursal: sub?.limiteMesasPorSucursal || 25,
      limiteUsuarios: sub?.limiteUsuarios || 10,
      precioMensualUSD: sub?.precioMensualUSD || (biz.plan === 'enterprise' ? 99 : biz.plan === 'pro' ? 49 : 29),
      notasSuscripcion: sub?.notasSuscripcion || '',
      ownerEmail: biz.email || biz.ownerEmail || '',
      ownerClave: biz.ownerClave || 'Gastro1234',
      ownerNombre: biz.ownerNombre || 'Administrador',
      codigoSede: primaryCode,
      logoUrl: biz.logoUrl || ''
    });
  };

  // Guardar cambios de suscripción
  const handleSaveSub = async () => {
    if (!editingBusiness) return;
    const cleanCode = (subForm.codigoSede || '').replace(/\D/g, '').slice(0, 4);
    if (subForm.codigoSede.trim() && cleanCode.length !== 4) {
      alert('El código de sede debe tener exactamente 4 dígitos numéricos.');
      return;
    }
    try {
      sounds.playKeypadClick();
      const updatedSub: BusinessSubscription = {
        plan: subForm.plan,
        estado: subForm.estado,
        fechaInicio: editingBusiness.suscripcion?.fechaInicio || new Date().toISOString(),
        fechaVencimiento: subForm.fechaVencimiento + 'T23:59:59.000Z',
        limiteSucursales: Number(subForm.limiteSucursales),
        limiteMesasPorSucursal: Number(subForm.limiteMesasPorSucursal),
        limiteUsuarios: Number(subForm.limiteUsuarios),
        precioMensualUSD: Number(subForm.precioMensualUSD),
        notasSuscripcion: subForm.notasSuscripcion
      };

      const isActivo = subForm.estado === 'activo' || subForm.estado === 'prueba';

      await updateBusiness(editingBusiness.id, {
        plan: subForm.plan,
        activo: isActivo,
        suscripcion: updatedSub,
        ownerClave: subForm.ownerClave.trim(),
        ownerEmail: subForm.ownerEmail.trim(),
        ownerNombre: subForm.ownerNombre.trim(),
        email: subForm.ownerEmail.trim(),
        ...(cleanCode.length === 4 ? { codigoSede: cleanCode } : {}),
        logoUrl: subForm.logoUrl ? subForm.logoUrl.trim() : null
      });

      if (cleanCode.length === 4) {
        await assignOrCreateBranchCodeForBusiness({
          businessId: editingBusiness.id,
          businessName: editingBusiness.nombre,
          codigoSede: cleanCode,
          logoUrl: subForm.logoUrl ? subForm.logoUrl.trim() : editingBusiness.logoUrl
        });
      }

      // También actualizar la cuenta en la colección users si existe
      const ownerUid = editingBusiness.ownerUid || ('owner_' + editingBusiness.id);
      await updateUserAccount(ownerUid, {
        email: subForm.ownerEmail.trim(),
        nombre: subForm.ownerNombre.trim(),
        claveAsignada: subForm.ownerClave.trim()
      }).catch(() => {
        // Si no existía, la creamos
        return createUserAccount({
          uid: ownerUid,
          email: subForm.ownerEmail.trim(),
          nombre: subForm.ownerNombre.trim(),
          rol: 'owner',
          businessId: editingBusiness.id,
          restaurantId: null,
          appId: 'gastro_smart',
          creadoEn: new Date().toISOString(),
          claveAsignada: subForm.ownerClave.trim()
        });
      });

      setSuccessMsg(`Suscripción y credenciales de "${editingBusiness.nombre}" actualizadas correctamente.`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setEditingBusiness(null);
    } catch (err: any) {
      alert('Error guardando suscripción: ' + err.message);
    }
  };

  // Alternar rápidamente Activo / Suspendido
  const handleToggleActiveFast = async (biz: Business) => {
    try {
      sounds.playKeypadClick();
      const nextActive = !biz.activo;
      const nextEstado = nextActive ? 'activo' : 'suspendido';

      const updatedSub: BusinessSubscription = {
        plan: biz.suscripcion?.plan || biz.plan || 'basico',
        estado: nextEstado,
        fechaInicio: biz.suscripcion?.fechaInicio || new Date().toISOString(),
        fechaVencimiento: biz.suscripcion?.fechaVencimiento || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        limiteSucursales: biz.suscripcion?.limiteSucursales || 3,
        limiteMesasPorSucursal: biz.suscripcion?.limiteMesasPorSucursal || 20,
        limiteUsuarios: biz.suscripcion?.limiteUsuarios || 10,
        precioMensualUSD: biz.suscripcion?.precioMensualUSD || 49,
        notasSuscripcion: biz.suscripcion?.notasSuscripcion || ''
      };

      await updateBusiness(biz.id, {
        activo: nextActive,
        suscripcion: updatedSub
      });

      setSuccessMsg(`Negocio ${biz.nombre} ${nextActive ? 'activado' : 'suspendido'} exitosamente.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert('Error al modificar estado: ' + err.message);
    }
  };

  // Poner todas las suscripciones en Modo Prueba Global
  const handleSetAllToTrial = async () => {
    try {
      sounds.playKeypadClick();
      setIsSettingAllTrial(true);
      const updatedCount = await setAllBusinessesToTrialMode();
      sounds.playCashRegister();
      setSuccessMsg(`¡${updatedCount} restaurante(s) colocados en Versión de Prueba / Testing (90 días de prueba sin restricciones)!`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      alert('Error activando modo prueba global: ' + err.message);
    } finally {
      setIsSettingAllTrial(false);
    }
  };

  // Eliminar Negocio por Completo (Borrado en Cascada)
  const handleConfirmDeleteBusiness = async () => {
    if (!deleteConfirmBiz) return;
    try {
      sounds.playAlertWarning();
      setIsDeleting(true);
      await deleteBusinessCascade(deleteConfirmBiz.id);
      sounds.playAlertWarning();
      setSuccessMsg(`¡El restaurante "${deleteConfirmBiz.nombre}" y toda su información fueron eliminados permanentemente!`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setDeleteConfirmBiz(null);
    } catch (err: any) {
      alert('Error al eliminar el restaurante: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Limpiar / Vaciar Datos de Prueba (Pedidos y Gastos) Mantenimiento de Carta/Mesas
  const handleConfirmResetData = async () => {
    if (!resetDataBiz) return;
    try {
      sounds.playKeypadClick();
      setIsResetting(true);
      const summary = await resetTestOperationalData(resetDataBiz.id);
      sounds.playCashRegister();
      setSuccessMsg(`¡Datos de prueba vaciados para "${resetDataBiz.nombre}"! Se eliminaron ${summary.pedidos} pedidos, ${summary.gastos} gastos y se liberaron ${summary.mesasOcupadas} mesas.`);
      setTimeout(() => setSuccessMsg(null), 5000);
      setResetDataBiz(null);
    } catch (err: any) {
      alert('Error al vaciar datos de prueba: ' + err.message);
    } finally {
      setIsResetting(false);
    }
  };

  // Crear un nuevo Cliente / Restaurante Tenant
  const handleCreateNewTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantForm.nombre.trim()) {
      alert('Ingresa el nombre del restaurante');
      return;
    }
    try {
      setIsSubmittingNew(true);
      sounds.playKeypadClick();

      const newBizId = 'biz_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      const fechaInicio = new Date().toISOString();
      const fechaVenc = new Date(Date.now() + tenantForm.diasValidez * 24 * 60 * 60 * 1000).toISOString();

      const newSub: BusinessSubscription = {
        plan: tenantForm.plan,
        estado: 'activo',
        fechaInicio,
        fechaVencimiento: fechaVenc,
        limiteSucursales: tenantForm.limiteSucursales,
        limiteMesasPorSucursal: tenantForm.plan === 'enterprise' ? 50 : 20,
        limiteUsuarios: tenantForm.plan === 'enterprise' ? 30 : 10,
        precioMensualUSD: tenantForm.precioUSD,
        notasSuscripcion: 'Creado desde el Panel Creador SaaS'
      };

      const assignedClave = tenantForm.clave.trim() || ('Gastro' + Math.floor(1000 + Math.random() * 9000));
      const cleanCustomCode = (tenantForm.codigoSede || '').replace(/\D/g, '').slice(0, 4);
      const existingCodesSet = new Set(allRestaurants.map(r => r.codigoSede).filter(Boolean) as string[]);
      const assignedCodigoSede = cleanCustomCode.length === 4 ? cleanCustomCode : generateUniqueBranchCode(existingCodesSet);

      const newBizData: Omit<Business, 'id'> = {
        nombre: tenantForm.nombre.trim(),
        rif_o_ruc: tenantForm.rif_o_ruc.trim() || 'J-00000000-0',
        plan: tenantForm.plan,
        activo: true,
        suscripcion: newSub,
        creadoEn: fechaInicio,
        ownerUid: 'owner_' + newBizId,
        ownerEmail: tenantForm.email.trim(),
        ownerNombre: tenantForm.ownerName.trim() || 'Administrador',
        ownerClave: assignedClave,
        email: tenantForm.email.trim(),
        codigoSede: assignedCodigoSede,
        logoUrl: tenantForm.logoUrl ? tenantForm.logoUrl.trim() : null,
        appId: 'gastro_smart'
      };

      await createBusiness(newBizData, newBizId);
      const bootResult = await bootstrapNewBusinessDefaults(
        newBizId,
        tenantForm.nombre.trim(),
        tenantForm.logoUrl ? tenantForm.logoUrl.trim() : null,
        assignedCodigoSede
      );

      // Crear cuenta de usuario Administrador en colección users
      if (tenantForm.email.trim()) {
        await createUserAccount({
          uid: 'owner_' + newBizId,
          email: tenantForm.email.trim(),
          nombre: tenantForm.ownerName.trim() || 'Administrador (' + tenantForm.nombre.trim() + ')',
          rol: 'owner',
          businessId: newBizId,
          restaurantId: null,
          appId: 'gastro_smart',
          creadoEn: fechaInicio,
          claveAsignada: assignedClave
        });
      }

      setCreatedCredsModal({
        businessName: tenantForm.nombre.trim(),
        email: tenantForm.email.trim(),
        clave: assignedClave,
        codigoSede: bootResult.codigoSede || assignedCodigoSede
      });

      setShowNewTenantModal(false);
      setTenantForm({
        nombre: '',
        rif_o_ruc: '',
        ownerName: '',
        email: '',
        clave: 'Gastro' + Math.floor(1000 + Math.random() * 9000),
        codigoSede: Math.floor(1000 + Math.random() * 9000).toString(),
        plan: 'pro',
        diasValidez: 30,
        limiteSucursales: 3,
        precioUSD: 49,
        logoUrl: ''
      });
    } catch (err: any) {
      alert('Error creando nuevo restaurante: ' + err.message);
    } finally {
      setIsSubmittingNew(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-900 text-neutral-100 p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* MENSAJE DE ÉXITO FLASH */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 font-bold text-sm flex items-center justify-between shadow-lg animate-in fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ENCABEZADO PANEL CREADOR SUPERADMIN */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30">
              <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-700/60">
                Plataforma SaaS Multi-Tenant
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Panel Creador & Subscripciones
              </h1>
            </div>
          </div>
          <p className="text-xs text-neutral-400 max-w-2xl leading-relaxed mt-1">
            Gestión global de licencias, activación de locales, vencimientos y límites de plan. 
            <strong className="text-purple-300 font-semibold ml-1">🔒 Estricta Privacidad Operativa:</strong> Sin acceso a datos privados de ventas o inventario de los restaurantes.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <button
            type="button"
            disabled={isSettingAllTrial}
            onClick={handleSetAllToTrial}
            className="h-12 px-4 rounded-2xl bg-blue-950/80 hover:bg-blue-900 text-blue-200 border border-blue-600/80 font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
            title="Convierte todas las suscripciones al modo Prueba de 90 días con acceso libre"
          >
            <Wand2 className="w-4 h-4 text-blue-400" />
            <span>{isSettingAllTrial ? 'Procesando...' : '🚀 Poner Todo en Versión Prueba'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playKeypadClick();
              setShowNewTenantModal(true);
            }}
            className="h-12 px-5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm flex items-center justify-center gap-2.5 shadow-xl shadow-purple-600/30 transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-5 h-5 stroke-[3]" />
            <span>Nuevo Restaurante (SaaS Tenant)</span>
          </button>
        </div>
      </div>

      {/* RANGO DE PRIVACIDAD & SEGURIDAD SAAS */}
      <div className="p-3.5 rounded-2xl bg-neutral-950/80 border border-purple-900/40 text-neutral-300 text-xs flex items-center gap-3">
        <Lock className="w-5 h-5 text-purple-400 shrink-0" />
        <div className="leading-snug">
          <strong className="text-purple-300">Aislamiento de Seguridad Activado:</strong> Como SuperAdmin del sistema SaaS, tu panel gestiona exclusivamente los planes y vigencias. Toda la información financiera y operativa interna de cada restaurante permanece aislada y encriptada por su correspondiente <code className="text-purple-300 bg-purple-950 px-1 py-0.5 rounded border border-purple-800">businessId</code>.
        </div>
      </div>

      {/* METRICAS DE SUSCRIPCIONES Y MRR */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        
        {/* Total Registrados */}
        <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-1">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-bold uppercase tracking-wider">Restaurantes en BD</span>
            <Store className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white flex items-baseline gap-2">
            <span>{stats.totalRestaurantsDb}</span>
            <span className="text-xs font-bold text-purple-400">({stats.total} negocios)</span>
          </div>
          <div className="text-[10px] text-neutral-500">Todos los locales creados en Firestore</div>
        </div>

        {/* Activos */}
        <div className="p-4 rounded-2xl bg-neutral-950 border border-emerald-900/40 space-y-1">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-bold uppercase tracking-wider">Suscripciones Activas</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-emerald-400">{stats.activas}</div>
          <div className="text-[10px] text-emerald-500/80">Operando normalmente</div>
        </div>

        {/* Suspendidas / Vencidas */}
        <div className="p-4 rounded-2xl bg-neutral-950 border border-red-900/40 space-y-1">
          <div className="flex items-center justify-between text-red-400">
            <span className="text-xs font-bold uppercase tracking-wider">Suspendidos / Vencidos</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-red-400">{stats.suspendidas + stats.vencidas}</div>
          <div className="text-[10px] text-red-500/80">{stats.vencidas} vencidos • {stats.suspendidas} suspendidos</div>
        </div>

        {/* En Prueba */}
        <div className="p-4 rounded-2xl bg-neutral-950 border border-blue-900/40 space-y-1">
          <div className="flex items-center justify-between text-blue-400">
            <span className="text-xs font-bold uppercase tracking-wider">Período de Prueba</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-blue-400">{stats.pruebas}</div>
          <div className="text-[10px] text-blue-500/80">Evaluando la plataforma</div>
        </div>

        {/* MRR Estimado */}
        <div className="p-4 rounded-2xl bg-neutral-950 border border-purple-800/60 space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-purple-400">
            <span className="text-xs font-bold uppercase tracking-wider">Ingreso Mensual (MRR)</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">${stats.mrrEstimado.toFixed(2)}</div>
          <div className="text-[10px] text-purple-300">USD recurrente / mes</div>
        </div>

      </div>

      {/* FILTROS Y BÚSQUEDA */}
      <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        
        {/* Buscador */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por restaurante, RIF/RUC, email de dueño..."
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-neutral-900 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition"
          />
        </div>

        {/* Filtro por Estado */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 shrink-0">
          <span className="text-xs font-bold text-neutral-400 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Estado:
          </span>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'activo', label: 'Activos' },
            { id: 'prueba', label: 'Prueba' },
            { id: 'vencido', label: 'Vencidos' },
            { id: 'suspendido', label: 'Suspendidos' }
          ].map(st => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                statusFilter === st.id
                  ? 'bg-purple-600 text-white'
                  : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400 border border-neutral-800'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        {/* Filtro por Plan */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-bold text-neutral-400 mr-1">Plan:</span>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'basico', label: 'Básico' },
            { id: 'pro', label: 'Pro' },
            { id: 'enterprise', label: 'Enterprise' }
          ].map(pl => (
            <button
              key={pl.id}
              onClick={() => setPlanFilter(pl.id as any)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                planFilter === pl.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400 border border-neutral-800'
              }`}
            >
              {pl.label}
            </button>
          ))}
        </div>

      </div>

      {/* SELECTOR DE VISTA: SUSCRIPCIONES UNIFICADAS vs DIRECTORIO DE RESTAURANTES EN BD */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-950 p-2.5 rounded-2xl border border-neutral-800">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              sounds.playKeypadClick();
              setViewMode('all_unified');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
              viewMode === 'all_unified'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/25'
                : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400 border border-neutral-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Negocios & Suscripciones ({filteredBusinesses.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playKeypadClick();
              setViewMode('restaurants_db');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
              viewMode === 'restaurants_db'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/25'
                : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400 border border-neutral-800'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Todos los Restaurantes / Sedes en Base de Datos ({filteredAllRestaurants.length})</span>
          </button>
        </div>

        <div className="text-[11px] text-neutral-400 px-2">
          Sincronización en tiempo real con colección <code className="text-purple-300 font-mono">restaurants</code> y <code className="text-purple-300 font-mono">businesses</code>
        </div>
      </div>

      {/* VISTA 1: DIRECTORIO DIRECTO DE TODOS LOS RESTAURANTES CREADOS EN LA BASE DE DATOS */}
      {viewMode === 'restaurants_db' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-400 px-1">
            <span>Mostrando {filteredAllRestaurants.length} restaurante(s) creados en la base de datos</span>
            <span>Colección Firestore: restaurants</span>
          </div>

          {filteredAllRestaurants.length === 0 ? (
            <div className="p-12 rounded-3xl bg-neutral-950 border border-neutral-800 text-center space-y-3">
              <Store className="w-12 h-12 text-neutral-700 mx-auto" />
              <h3 className="font-bold text-neutral-300">No se encontraron restaurantes en la base de datos</h3>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                Intenta limpiar el buscador o crea un nuevo restaurante desde el botón superior.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAllRestaurants.map(rest => {
                const parentBiz = effectiveBusinesses.find(b => b.id === rest.businessId);
                const restEmployees = allEmployees.filter(emp => emp.restaurantId === rest.id && emp.activo !== false);
                const sedeCode = rest.codigoSede || '----';

                return (
                  <div
                    key={rest.id}
                    className="p-5 rounded-3xl bg-neutral-950 border border-neutral-800 hover:border-purple-700/70 transition shadow-xl space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      {/* Cabecera del Restaurante */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          {(rest.logoUrl || parentBiz?.logoUrl) ? (
                            <div className="w-11 h-11 rounded-2xl bg-neutral-900 border border-neutral-800 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-md">
                              <img
                                src={(rest.logoUrl || parentBiz?.logoUrl)!}
                                alt={rest.nombre}
                                className="w-full h-full object-contain"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          ) : (
                            <div className="w-11 h-11 rounded-2xl bg-purple-950/80 border border-purple-800/80 text-purple-300 flex items-center justify-center shrink-0">
                              <Store className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h3 className="font-extrabold text-base text-white truncate">
                              {rest.nombre}
                            </h3>
                            <div className="text-[11px] font-mono text-purple-400 truncate">
                              ID Sede: {rest.id}
                            </div>
                          </div>
                        </div>

                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shrink-0 ${
                          rest.activo !== false
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                            : 'bg-red-950/80 text-red-300 border-red-700'
                        }`}>
                          {rest.activo !== false ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>

                      {/* Código de Sede de 4 dígitos y Datos Operativos */}
                      <div className="p-3 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-neutral-400 font-semibold flex items-center gap-1.5">
                            <Hash className="w-3.5 h-3.5 text-amber-400" />
                            Código 4 Dígitos:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-black text-sm tracking-widest">
                              {sedeCode}
                            </span>
                            {parentBiz && (
                              <button
                                type="button"
                                onClick={() => handleOpenBranchCodeModal(parentBiz, rest)}
                                className="px-2 py-1 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-700/70 text-amber-200 font-bold text-[10px] flex items-center gap-1 transition cursor-pointer"
                                title="Asignar o crear nuevo código de 4 dígitos"
                              >
                                <Edit3 className="w-3 h-3 text-amber-400" />
                                <span>Asignar</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-neutral-300 text-[11px]">
                          <span className="flex items-center gap-1 text-neutral-400 truncate">
                            <MapPin className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                            <span className="truncate">{rest.direccion || 'Sin dirección'}</span>
                          </span>
                          <span className="flex items-center gap-1 text-neutral-400 shrink-0 ml-2">
                            <Phone className="w-3 h-3 text-purple-400" />
                            <span>{rest.telefono || 'S/N'}</span>
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-800 text-[11px]">
                          <div>
                            <span className="text-neutral-500 block text-[10px] uppercase font-bold">Mesas</span>
                            <span className="font-extrabold text-white">{rest.numeroMesas || 10} mesas</span>
                          </div>
                          <div>
                            <span className="text-neutral-500 block text-[10px] uppercase font-bold">Modo KDS</span>
                            <span className="font-extrabold text-purple-300">
                              {rest.usaCocina !== false ? '🔥 Con Cocina' : '⚡ Sin Cocina'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Negocio / Dueño Vinculado */}
                      {parentBiz && (
                        <div className="p-2.5 rounded-xl bg-neutral-900/70 border border-neutral-800/90 text-[11px] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-400 font-semibold">Negocio / Suscripción:</span>
                            <span className="font-bold text-white truncate ml-2">{parentBiz.nombre}</span>
                          </div>
                          <div className="flex items-center justify-between text-neutral-400 font-mono text-[10px]">
                            <span className="truncate">{parentBiz.email || parentBiz.ownerEmail || 'Sin correo'}</span>
                            <span className="text-emerald-400 font-bold ml-2 shrink-0">🔑 {parentBiz.ownerClave || 'Gastro1234'}</span>
                          </div>
                        </div>
                      )}

                      {/* Empleados de la sede y sus códigos de 8 dígitos */}
                      <div className="p-2.5 rounded-xl bg-neutral-900/50 border border-neutral-800/80 text-[11px] space-y-1.5">
                        <div className="flex items-center justify-between text-neutral-400 font-bold text-[10px] uppercase">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3 text-purple-400" />
                            Personal ({restEmployees.length})
                          </span>
                          <span>Código 8 Dígitos</span>
                        </div>
                        {restEmployees.length === 0 ? (
                          <div className="text-[11px] text-neutral-500 italic">Sin empleados registrados</div>
                        ) : (
                          <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                            {restEmployees.map(emp => (
                              <div key={emp.id} className="flex items-center justify-between bg-neutral-950 px-2 py-1 rounded-lg border border-neutral-800">
                                <div className="truncate pr-2">
                                  <span className="font-bold text-neutral-200">{emp.nombre}</span>
                                  <span className="text-[10px] text-neutral-500 ml-1 uppercase">({emp.puesto})</span>
                                </div>
                                <span className="font-mono font-black text-emerald-400 text-xs shrink-0">
                                  {sedeCode}{emp.pin}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Acciones Rápidas del Restaurante */}
                    <div className="pt-3 border-t border-neutral-800/80 grid grid-cols-2 gap-2">
                      {onInspectRestaurant && (
                        <button
                          type="button"
                          onClick={() => {
                            sounds.playKeypadClick();
                            onInspectRestaurant(rest);
                          }}
                          className="py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md shadow-purple-600/20"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Abrir Panel Sede</span>
                        </button>
                      )}
                      {parentBiz && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditSub(parentBiz)}
                          className="py-2 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-purple-200 border border-purple-700/70 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-purple-300" />
                          <span>Suscripción</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* LISTADO DE SUSCRIPCIONES Y CLIENTES SAAS (UNIFICADO CON TODOS LOS RESTAURANTES EN BD) */}
      {viewMode === 'all_unified' && (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-neutral-400 px-1">
          <span>Mostrando {filteredBusinesses.length} negocios ({allRestaurants.length} restaurantes en BD)</span>
          <span>SaaS Tenant ID Isolation Level: Strict</span>
        </div>

        {filteredBusinesses.length === 0 ? (
          <div className="p-12 rounded-3xl bg-neutral-950 border border-neutral-800 text-center space-y-3">
            <Building2 className="w-12 h-12 text-neutral-700 mx-auto" />
            <h3 className="font-bold text-neutral-300">No se encontraron suscripciones de restaurantes</h3>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              Intenta cambiar los filtros de búsqueda o registra una nueva suscripción de cliente desde el botón superior.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBusinesses.map(biz => {
              const sub = biz.suscripcion;
              const subState = sub?.estado || (biz.activo ? 'activo' : 'suspendido');
              const planName = sub?.plan || biz.plan || 'basico';
              const bizRestaurants = restaurantsByBiz.get(biz.id) || [];
              const branchCount = bizRestaurants.length || branchesByBiz.get(biz.id) || 1;
              const maxBranches = sub?.limiteSucursales || (planName === 'enterprise' ? 10 : planName === 'pro' ? 3 : 1);

              // Días para vencimiento
              let daysLeft = 30;
              if (sub?.fechaVencimiento) {
                const diff = new Date(sub.fechaVencimiento).getTime() - Date.now();
                daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
              }

              return (
                <div 
                  key={biz.id}
                  className="p-5 rounded-3xl bg-neutral-950 border border-neutral-800 hover:border-purple-800/60 transition shadow-xl space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    
                    {/* Fila Superior: Nombre + Logo + Badge Estado */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        {biz.logoUrl ? (
                          <div className="w-11 h-11 rounded-2xl bg-neutral-900 border border-neutral-800 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-md">
                            <img
                              src={biz.logoUrl}
                              alt={biz.nombre}
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ) : (
                          <div className="w-11 h-11 rounded-2xl bg-purple-950/80 border border-purple-800/80 text-purple-300 flex items-center justify-center shrink-0">
                            <Store className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="font-extrabold text-base text-white truncate">
                            {biz.nombre}
                          </h3>
                          <div className="text-xs font-mono text-purple-400">RIF/RUC: {biz.rif_o_ruc || 'N/A'}</div>
                        </div>
                      </div>

                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shrink-0 ${
                        subState === 'activo'
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                          : subState === 'prueba'
                          ? 'bg-blue-950/80 text-blue-300 border-blue-700'
                          : subState === 'vencido'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-700'
                          : 'bg-red-950/80 text-red-300 border-red-700'
                      }`}>
                        {subState}
                      </span>
                    </div>

                    {/* Datos de la Empresa: Dueño, Código de 4 Dígitos y Clave Otorgada */}
                    {(() => {
                      const primaryBranchCode = bizRestaurants[0]?.codigoSede || biz.codigoSede || '';
                      return (
                        <div className="p-3 rounded-2xl bg-neutral-900 border border-neutral-800 text-xs space-y-2">
                          <div className="flex items-center justify-between text-neutral-400">
                            <span className="font-semibold text-neutral-300">Administrador / Dueño:</span>
                            <span className="font-bold text-white">{biz.ownerNombre || 'No asignado'}</span>
                          </div>
                          <div className="text-neutral-400 font-mono text-[11px] truncate flex items-center justify-between">
                            <span className="truncate">{biz.email || biz.ownerEmail || 'Sin email'}</span>
                            <span className="text-emerald-400 font-bold ml-2 shrink-0">🔑 {biz.ownerClave || 'Gastro1234'}</span>
                          </div>

                          {/* Fila destacada: Los 4 dígitos de la empresa / sede */}
                          <div className="pt-2 border-t border-neutral-800 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Hash className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="font-bold text-amber-200 text-[11px]">Código 4 Dígitos (Sede):</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 font-mono font-black text-sm tracking-widest shadow-xs">
                                {primaryBranchCode || 'SIN CÓD.'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenBranchCodeModal(biz, bizRestaurants[0])}
                                className="py-1 px-2 rounded-lg bg-amber-950/90 hover:bg-amber-800/80 border border-amber-700/80 text-amber-200 font-bold text-[10px] transition flex items-center gap-1 cursor-pointer"
                                title="Asignar o crear el código de 4 dígitos de esta empresa"
                              >
                                <Edit3 className="w-3 h-3 text-amber-400" />
                                <span>{primaryBranchCode ? 'Cambiar' : 'Crear 4 Díg.'}</span>
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                sounds.playKeypadClick();
                                const email = biz.email || biz.ownerEmail || '';
                                const clave = biz.ownerClave || 'Gastro1234';
                                const codeText = primaryBranchCode || 'Pendiente';
                                const textToCopy = `🔑 CREDENCIALES DE ACCESO GASTRO SMART\n\nRestaurante / Empresa: ${biz.nombre}\nCódigo de Empresa / Sede (4 dígitos): ${codeText}\nUsuario / Email: ${email}\nClave Asignada: ${clave}\n\nIngresa desde: ${window.location.origin}`;
                                navigator.clipboard.writeText(textToCopy);
                                setSuccessMsg(`Credenciales y código (${codeText}) de "${biz.nombre}" copiados al portapapeles.`);
                                setTimeout(() => setSuccessMsg(null), 3000);
                              }}
                              className="py-1.5 px-2 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-purple-300 font-bold text-[10px] transition flex items-center justify-center gap-1 cursor-pointer"
                              title="Copiar correo, clave y código de 4 dígitos"
                            >
                              <Key className="w-3 h-3 text-purple-400" />
                              <span>Copiar Todo</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenBranchCodeModal(biz, bizRestaurants[0])}
                              className="py-1.5 px-2 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-800/80 text-amber-300 font-bold text-[10px] transition flex items-center justify-center gap-1 cursor-pointer"
                              title="Asignar o generar código de 4 dígitos para la empresa"
                            >
                              <Hash className="w-3 h-3 text-amber-400" />
                              <span>4 Dígitos</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenPasswordModal(biz)}
                              className="py-1.5 px-2 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/80 text-emerald-300 font-bold text-[10px] transition flex items-center justify-center gap-1 cursor-pointer"
                              title="Cambiar o generar una nueva clave de acceso para el administrador"
                            >
                              <RefreshCw className="w-3 h-3 text-emerald-400" />
                              <span>Nueva Clave</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Ficha Técnica de Suscripción */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800">
                        <span className="text-[10px] text-neutral-500 font-bold uppercase">Plan SaaS</span>
                        <div className="font-extrabold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{planName}</span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800">
                        <span className="text-[10px] text-neutral-500 font-bold uppercase">Sucursales Usadas</span>
                        <div className="font-extrabold text-purple-300 flex items-center gap-1.5 mt-0.5">
                          <Store className="w-3.5 h-3.5 text-purple-400" />
                          <span>{branchCount} / {maxBranches}</span>
                        </div>
                      </div>
                    </div>

                    {/* Vencimiento */}
                    <div className="flex items-center justify-between text-xs text-neutral-400 pt-1">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                        <span>Vence: {sub?.fechaVencimiento ? new Date(sub.fechaVencimiento).toLocaleDateString() : 'Sin fecha'}</span>
                      </div>
                      <span className={`font-bold ${daysLeft <= 5 ? 'text-amber-400' : 'text-neutral-400'}`}>
                        {daysLeft > 0 ? `${daysLeft} días restantes` : 'Expirado'}
                      </span>
                    </div>

                    {/* Restaurantes / Sucursales Creados en BD para este Negocio */}
                    {bizRestaurants.length > 0 && (
                      <div className="p-3 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-purple-300">
                          <span className="flex items-center gap-1">
                            <Store className="w-3 h-3 text-purple-400" />
                            Restaurantes en BD ({bizRestaurants.length})
                          </span>
                          <span>Cód. Sede</span>
                        </div>
                        <div className="space-y-1.5">
                          {bizRestaurants.map(rest => (
                            <div
                              key={rest.id}
                              className="p-2 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-white truncate flex items-center gap-1.5">
                                  <span className="truncate">{rest.nombre}</span>
                                </div>
                                <div className="text-[10px] text-neutral-400 truncate">
                                  {rest.direccion || 'Sin dirección'} • {rest.numeroMesas || 10} mesas
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleOpenBranchCodeModal(biz, rest)}
                                  className="px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-mono font-black text-xs flex items-center gap-1 transition cursor-pointer"
                                  title="Clic para cambiar o asignar los 4 dígitos de esta sede"
                                >
                                  <span>{rest.codigoSede || '----'}</span>
                                  <Edit3 className="w-2.5 h-2.5 text-amber-400" />
                                </button>
                                {onInspectRestaurant && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      sounds.playKeypadClick();
                                      onInspectRestaurant(rest);
                                    }}
                                    className="p-1.5 rounded-lg bg-purple-900/70 hover:bg-purple-700 text-purple-200 border border-purple-700/60 transition cursor-pointer"
                                    title={`Abrir panel de ${rest.nombre}`}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>

                  {/* Acciones de Gestión Creador */}
                  <div className="pt-3 border-t border-neutral-800/80 space-y-2">
                    
                    <div className="grid grid-cols-2 gap-2">
                      {/* Botón Activar / Suspender */}
                      <button
                        type="button"
                        onClick={() => handleToggleActiveFast(biz)}
                        className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                          biz.activo 
                            ? 'bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border-amber-800/80' 
                            : 'bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border-emerald-800/80'
                        }`}
                        title={biz.activo ? 'Suspender acceso temporalmente' : 'Activar suscripción'}
                      >
                        {biz.activo ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>{biz.activo ? 'Suspender' : 'Activar'}</span>
                      </button>

                      {/* Botón Editar Plan & Límites */}
                      <button
                        type="button"
                        onClick={() => handleOpenEditSub(biz)}
                        className="py-2 px-3 rounded-xl bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700/80 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-purple-300" />
                        <span>Editar Plan</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {/* Botón Vaciar Datos de Prueba */}
                      <button
                        type="button"
                        onClick={() => {
                          sounds.playKeypadClick();
                          setResetDataBiz(biz);
                        }}
                        className="py-2 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-blue-300 border border-neutral-750 font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer"
                        title="Elimina pedidos, gastos y turnos de prueba manteniendo el menú y las mesas"
                      >
                        <Eraser className="w-3.5 h-3.5 text-blue-400" />
                        <span>Vaciar Datos Prueba</span>
                      </button>

                      {/* Botón Eliminar Restaurante Completo */}
                      <button
                        type="button"
                        onClick={() => {
                          sounds.playAlertWarning();
                          setDeleteConfirmBiz(biz);
                        }}
                        className="py-2 px-3 rounded-xl bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800/80 font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer"
                        title="Eliminar este restaurante permanentemente de la base de datos"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        <span>Eliminar Restaurante</span>
                      </button>
                    </div>

                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* MODAL EDITAR SUSCRIPCIÓN Y LÍMITES */}
      {editingBusiness && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-neutral-100 max-h-[90vh] overflow-y-auto overscroll-contain">
            
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-900/80 text-purple-300 border border-purple-700">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-white">Editar Suscripción SaaS</h3>
                  <p className="text-xs text-neutral-400">{editingBusiness.nombre} ({editingBusiness.rif_o_ruc})</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingBusiness(null)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              
              {/* Plan y Estado */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Plan de Suscripción</label>
                  <select
                    value={subForm.plan}
                    onChange={(e) => {
                      const pl = e.target.value as any;
                      setSubForm({
                        ...subForm,
                        plan: pl,
                        limiteSucursales: pl === 'enterprise' ? 10 : pl === 'pro' ? 3 : 1,
                        precioMensualUSD: pl === 'enterprise' ? 99 : pl === 'pro' ? 49 : 29
                      });
                    }}
                    className="w-full h-11 px-3 rounded-xl bg-neutral-950 border border-neutral-800 font-bold text-purple-300 focus:outline-none focus:border-purple-500"
                  >
                    <option value="basico">Plan Básico (1 Sucursal)</option>
                    <option value="pro">Plan Pro (3 Sucursales)</option>
                    <option value="enterprise">Plan Enterprise (10 Sucursales)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Estado de Acceso</label>
                  <select
                    value={subForm.estado}
                    onChange={(e) => setSubForm({ ...subForm, estado: e.target.value as any })}
                    className="w-full h-11 px-3 rounded-xl bg-neutral-950 border border-neutral-800 font-bold text-emerald-300 focus:outline-none focus:border-purple-500"
                  >
                    <option value="activo">Activo (Acceso Completo)</option>
                    <option value="prueba">En Prueba (Trial)</option>
                    <option value="vencido">Vencido (Aviso de Pago)</option>
                    <option value="suspendido">Suspendido (Bloqueado)</option>
                  </select>
                </div>
              </div>

              {/* Credenciales del Administrador */}
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-purple-900/50 space-y-3">
                <span className="font-bold text-purple-300 uppercase tracking-wider text-[11px] flex items-center justify-between">
                  <span>🔑 Credenciales de Acceso Asignadas</span>
                  <span className="text-[10px] text-purple-400 font-normal">Gestionadas por Creador</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-neutral-400 font-bold mb-1">Correo de Acceso</label>
                    <input
                      type="email"
                      value={subForm.ownerEmail}
                      onChange={(e) => setSubForm({ ...subForm, ownerEmail: e.target.value })}
                      placeholder="admin@restaurante.com"
                      className="w-full h-10 px-3 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] text-neutral-400 font-bold">Clave Asignada</label>
                      <button
                        type="button"
                        onClick={() => setSubForm({ ...subForm, ownerClave: 'Gastro' + Math.floor(1000 + Math.random() * 9000) })}
                        className="text-[9px] font-bold text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-2.5 h-2.5" /> Generar
                      </button>
                    </div>
                    <input
                      type="text"
                      value={subForm.ownerClave}
                      onChange={(e) => setSubForm({ ...subForm, ownerClave: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl bg-neutral-900 border border-neutral-800 font-mono text-xs text-emerald-400 font-bold focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] text-amber-300 font-bold">Código 4 Dígitos</label>
                      <button
                        type="button"
                        onClick={() => {
                          const existingCodes = new Set(allRestaurants.map(r => r.codigoSede).filter(Boolean) as string[]);
                          setSubForm({ ...subForm, codigoSede: generateUniqueBranchCode(existingCodes) });
                        }}
                        className="text-[9px] font-bold text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-2.5 h-2.5" /> Crear 4 Díg.
                      </button>
                    </div>
                    <input
                      type="text"
                      maxLength={4}
                      value={subForm.codigoSede}
                      onChange={(e) => setSubForm({ ...subForm, codigoSede: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      placeholder="Ej: 3592"
                      className="w-full h-10 px-3 rounded-xl bg-neutral-900 border border-amber-700/60 font-mono text-sm text-amber-300 font-black tracking-widest text-center focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Límites de Plan */}
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3">
                <span className="font-bold text-purple-300 uppercase tracking-wider text-[11px] block">
                  ⚙️ Límites Operativos del Plan
                </span>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-neutral-400 font-bold mb-1">Máx. Sucursales</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={subForm.limiteSucursales}
                      onChange={(e) => setSubForm({ ...subForm, limiteSucursales: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full h-10 px-2.5 rounded-xl bg-neutral-900 border border-neutral-800 font-extrabold text-white text-center focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-neutral-400 font-bold mb-1">Mesas / Sucursal</label>
                    <input
                      type="number"
                      min="1"
                      max="200"
                      value={subForm.limiteMesasPorSucursal}
                      onChange={(e) => setSubForm({ ...subForm, limiteMesasPorSucursal: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full h-10 px-2.5 rounded-xl bg-neutral-900 border border-neutral-800 font-extrabold text-white text-center focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-neutral-400 font-bold mb-1">Máx. Usuarios</label>
                    <input
                      type="number"
                      min="1"
                      max="200"
                      value={subForm.limiteUsuarios}
                      onChange={(e) => setSubForm({ ...subForm, limiteUsuarios: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full h-10 px-2.5 rounded-xl bg-neutral-900 border border-neutral-800 font-extrabold text-white text-center focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Fecha Vencimiento y Precio */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Fecha de Vencimiento</label>
                  <input
                    type="date"
                    value={subForm.fechaVencimiento}
                    onChange={(e) => setSubForm({ ...subForm, fechaVencimiento: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Tarifa Mensual ($ USD)</label>
                  <input
                    type="number"
                    min="0"
                    value={subForm.precioMensualUSD}
                    onChange={(e) => setSubForm({ ...subForm, precioMensualUSD: parseFloat(e.target.value) || 0 })}
                    className="w-full h-11 px-3 rounded-xl bg-neutral-950 border border-neutral-800 font-bold text-emerald-400 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Subir y Editar Logotipo de la Marca */}
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800">
                <LogoUploader
                  logoUrl={subForm.logoUrl}
                  onChange={(url) => setSubForm({ ...subForm, logoUrl: url })}
                  restaurantName={editingBusiness.nombre}
                  theme="dark"
                  label="Logotipo del Restaurante / Marca:"
                  helperText="Actualiza el logo de la marca (PNG o JPG). Se mostrará en todas las interfaces del restaurante."
                />
              </div>

              {/* Notas de Suscripción */}
              <div>
                <label className="block font-bold text-neutral-300 mb-1">Notas Internas de Suscripción</label>
                <textarea
                  rows={2}
                  value={subForm.notasSuscripcion}
                  onChange={(e) => setSubForm({ ...subForm, notasSuscripcion: e.target.value })}
                  placeholder="Ej: Pago realizado por transferencia bancaria. Cliente VIP con descuento especial."
                  className="w-full p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 text-xs focus:outline-none focus:border-purple-500 placeholder-neutral-600"
                />
              </div>

            </div>

            {/* Botones del Modal */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setEditingBusiness(null)}
                className="h-11 px-5 rounded-xl bg-neutral-800 hover:bg-neutral-700 font-bold text-xs text-neutral-300 transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleSaveSub}
                className="h-11 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 font-black text-xs text-white shadow-lg shadow-purple-600/30 transition cursor-pointer flex items-center gap-2"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Guardar Cambios</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL REGISTRAR NUEVO TENANT / RESTAURANTE SAAS */}
      {showNewTenantModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-neutral-100 max-h-[90vh] overflow-y-auto overscroll-contain">
            
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-900/80 text-purple-300 border border-purple-700">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-white">Alta de Restaurante (SaaS Tenant)</h3>
                  <p className="text-xs text-neutral-400">Crea la suscripción e inicializa el tenant automáticamente</p>
                </div>
              </div>
              <button 
                onClick={() => setShowNewTenantModal(false)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewTenant} className="space-y-4 text-xs">
              
              <div>
                <label className="block font-bold text-neutral-300 mb-1">Nombre Comercial del Restaurante *</label>
                <input
                  type="text"
                  required
                  value={tenantForm.nombre}
                  onChange={(e) => setTenantForm({ ...tenantForm, nombre: e.target.value })}
                  placeholder="Ej: La Trattoria Gourmet"
                  className="w-full h-11 px-3.5 rounded-xl bg-neutral-950 border border-neutral-800 font-bold text-white focus:outline-none focus:border-purple-500 placeholder-neutral-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-300 mb-1">RIF / RUC / Identificación Fiscal</label>
                  <input
                    type="text"
                    value={tenantForm.rif_o_ruc}
                    onChange={(e) => setTenantForm({ ...tenantForm, rif_o_ruc: e.target.value })}
                    placeholder="Ej: J-12345678-9"
                    className="w-full h-11 px-3.5 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-neutral-200 focus:outline-none focus:border-purple-500 placeholder-neutral-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Email del Administrador / Dueño</label>
                  <input
                    type="email"
                    required
                    value={tenantForm.email}
                    onChange={(e) => setTenantForm({ ...tenantForm, email: e.target.value })}
                    placeholder="dueño@restaurante.com"
                    className="w-full h-11 px-3.5 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 focus:outline-none focus:border-purple-500 placeholder-neutral-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Nombre Completo del Dueño</label>
                  <input
                    type="text"
                    value={tenantForm.ownerName}
                    onChange={(e) => setTenantForm({ ...tenantForm, ownerName: e.target.value })}
                    placeholder="Ej: Carlos Mendoza"
                    className="w-full h-11 px-3.5 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 focus:outline-none focus:border-purple-500 placeholder-neutral-600"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-neutral-300">Clave de Acceso *</label>
                    <button
                      type="button"
                      onClick={() => setTenantForm({ ...tenantForm, clave: 'Gastro' + Math.floor(1000 + Math.random() * 9000) })}
                      className="text-[10px] font-bold text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Generar</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={tenantForm.clave}
                    onChange={(e) => setTenantForm({ ...tenantForm, clave: e.target.value })}
                    placeholder="Ej: Gastro9824"
                    className="w-full h-11 px-3.5 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-purple-300 font-bold focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-amber-300">Código 4 Dígitos *</label>
                    <button
                      type="button"
                      onClick={() => {
                        const existingCodes = new Set(allRestaurants.map(r => r.codigoSede).filter(Boolean) as string[]);
                        setTenantForm({ ...tenantForm, codigoSede: generateUniqueBranchCode(existingCodes) });
                      }}
                      className="text-[10px] font-bold text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Crear 4 Díg.</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={tenantForm.codigoSede}
                    onChange={(e) => setTenantForm({ ...tenantForm, codigoSede: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    placeholder="Ej: 3592"
                    className="w-full h-11 px-3.5 rounded-xl bg-neutral-950 border border-amber-600/70 font-mono text-base text-amber-300 font-black tracking-widest text-center focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Plan Inicial</label>
                  <select
                    value={tenantForm.plan}
                    onChange={(e) => {
                      const pl = e.target.value as any;
                      setTenantForm({
                        ...tenantForm,
                        plan: pl,
                        limiteSucursales: pl === 'enterprise' ? 10 : pl === 'pro' ? 3 : 1,
                        precioUSD: pl === 'enterprise' ? 99 : pl === 'pro' ? 49 : 29
                      });
                    }}
                    className="w-full h-11 px-2.5 rounded-xl bg-neutral-950 border border-neutral-800 font-bold text-purple-300 focus:outline-none focus:border-purple-500"
                  >
                    <option value="basico">Básico (1 Sucursal)</option>
                    <option value="pro">Pro (3 Sucursales)</option>
                    <option value="enterprise">Enterprise (10)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Días de Prueba / Vigencia</label>
                  <input
                    type="number"
                    min="1"
                    value={tenantForm.diasValidez}
                    onChange={(e) => setTenantForm({ ...tenantForm, diasValidez: parseInt(e.target.value) || 30 })}
                    className="w-full h-11 px-3 rounded-xl bg-neutral-950 border border-neutral-800 font-bold text-white text-center focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-neutral-300 mb-1">Precio ($ USD)</label>
                  <input
                    type="number"
                    min="0"
                    value={tenantForm.precioUSD}
                    onChange={(e) => setTenantForm({ ...tenantForm, precioUSD: parseFloat(e.target.value) || 0 })}
                    className="w-full h-11 px-3 rounded-xl bg-neutral-950 border border-neutral-800 font-bold text-emerald-400 text-center focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Subir Logotipo del Nuevo Restaurante */}
              <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800">
                <LogoUploader
                  logoUrl={tenantForm.logoUrl}
                  onChange={(url) => setTenantForm({ ...tenantForm, logoUrl: url })}
                  restaurantName={tenantForm.nombre}
                  theme="dark"
                  label="Logotipo del Restaurante / Marca:"
                  helperText="Sube el logo o isotipo de la marca (PNG o JPG). Se configurará en el tenant y sucursal principal."
                />
              </div>

              <div className="p-3 rounded-xl bg-purple-950/60 border border-purple-800/80 text-[11px] text-purple-200">
                🚀 Al crear el restaurante, el sistema generará automáticamente la primera sucursal principal, catálogo inicial de muestra y mesa #1 para pruebas operativas.
              </div>

              {/* Botones del Formulario */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowNewTenantModal(false)}
                  className="h-11 px-5 rounded-xl bg-neutral-800 hover:bg-neutral-700 font-bold text-xs text-neutral-300 transition cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingNew}
                  className="h-11 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 font-black text-xs text-white shadow-lg shadow-purple-600/30 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingNew ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[3]" />}
                  <span>Crear Restaurante SaaS</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* MODAL MOSTRAR Y COPIAR CREDENCIALES GENERADAS PARA EL CLIENTE */}
      {createdCredsModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-neutral-900 border border-purple-500/50 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-neutral-100 text-center">
            
            <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/40 text-purple-400 flex items-center justify-center mx-auto">
              <Key className="w-7 h-7" />
            </div>

            <div>
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-purple-900/80 text-purple-300 border border-purple-700">
                Credenciales Otorgadas al Administrador
              </span>
              <h3 className="text-xl font-black text-white mt-2">
                {createdCredsModal.businessName}
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                Comparte estas credenciales con el dueño del restaurante para que pueda iniciar sesión.
              </p>
            </div>

            <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 text-left space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/40">
                <div>
                  <span className="text-amber-300/80 font-sans block text-[10px] uppercase font-bold">Código de Empresa / Sede (4 Dígitos):</span>
                  <span className="text-[10px] font-sans text-neutral-400">Prefijo para terminales de personal</span>
                </div>
                <span className="text-amber-300 font-black text-xl tracking-widest px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40">
                  {createdCredsModal.codigoSede}
                </span>
              </div>
              <div className="pt-1">
                <span className="text-neutral-500 font-sans block text-[10px] uppercase font-bold">Correo de Acceso:</span>
                <span className="text-purple-300 font-bold">{createdCredsModal.email || 'No especificado'}</span>
              </div>
              <div className="pt-2 border-t border-neutral-900">
                <span className="text-neutral-500 font-sans block text-[10px] uppercase font-bold">Clave de Acceso Otorgada:</span>
                <span className="text-emerald-400 font-extrabold text-sm">{createdCredsModal.clave}</span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  sounds.playKeypadClick();
                  const textToCopy = `🔑 CREDENCIALES ACREDITADAS POR EL CREADOR (GASTRO SMART)\n\nRestaurante / Empresa: ${createdCredsModal.businessName}\nCódigo de Empresa / Sede (4 dígitos): ${createdCredsModal.codigoSede}\nUsuario / Email Acreditado: ${createdCredsModal.email}\nClave de Acceso Asignada: ${createdCredsModal.clave}\n\nAcceso a la Plataforma: ${window.location.origin}`;
                  navigator.clipboard.writeText(textToCopy);
                  setSuccessMsg('¡Credenciales y código de 4 dígitos copiados al portapapeles! Listo para enviar por WhatsApp / Email.');
                  setTimeout(() => setSuccessMsg(null), 4000);
                }}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 font-black text-xs text-white shadow-lg shadow-purple-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Key className="w-4 h-4" />
                <span>📋 Copiar Credenciales Acreditadas al Administrador</span>
              </button>

              <button
                type="button"
                onClick={() => setCreatedCredsModal(null)}
                className="w-full h-11 rounded-xl bg-neutral-800 hover:bg-neutral-700 font-bold text-xs text-neutral-300 transition cursor-pointer"
              >
                Entendido / Cerrar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR ELIMINACIÓN TOTAL DE RESTAURANTE */}
      {deleteConfirmBiz && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-neutral-900 border border-red-500/50 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-neutral-100 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-600/20 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto">
              <AlertOctagon className="w-8 h-8" />
            </div>

            <div>
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800">
                ⚠️ Acción Irreversible
              </span>
              <h3 className="text-xl font-black text-white mt-2">
                ¿Eliminar {deleteConfirmBiz.nombre}?
              </h3>
              <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                Esta acción eliminará de forma permanente el negocio, sus sucursales, usuarios, cartas, mesas, comandas e historial de ventas de la base de datos Firestore.
              </p>
            </div>

            <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800 text-left font-mono text-xs space-y-1 text-red-300">
              <div className="font-bold text-white text-sm">{deleteConfirmBiz.nombre}</div>
              <div className="text-neutral-500 text-[11px]">ID: {deleteConfirmBiz.id}</div>
              <div className="text-neutral-400 text-[11px]">RUC/RIF: {deleteConfirmBiz.rif_o_ruc || 'N/A'}</div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteBusiness}
                className="w-full h-12 rounded-xl bg-red-600 hover:bg-red-700 font-extrabold text-xs text-white shadow-lg shadow-red-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Eliminando de la Base de Datos...' : 'Sí, Eliminar Restaurante Completo'}</span>
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmBiz(null)}
                className="w-full h-11 rounded-xl bg-neutral-800 hover:bg-neutral-700 font-bold text-xs text-neutral-300 transition cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VACIAR DATOS DE PRUEBA */}
      {resetDataBiz && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-neutral-900 border border-blue-500/50 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-neutral-100 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center mx-auto">
              <Eraser className="w-7 h-7" />
            </div>

            <div>
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800">
                Limpieza de Datos Operativos
              </span>
              <h3 className="text-xl font-black text-white mt-2">
                Vaciar Pruebas de {resetDataBiz.nombre}
              </h3>
              <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                Esta acción eliminará todos los <strong className="text-white">pedidos, comandas, gastos, turnos y cierres de caja</strong> de prueba, y liberará todas las mesas.
              </p>
              <div className="mt-2 text-[11px] text-emerald-400 font-semibold bg-emerald-950/40 p-2 rounded-xl border border-emerald-900/50">
                ✅ Mantiene intactos los Platillos del Menú, las Mesas y la Configuración del Restaurante.
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                disabled={isResetting}
                onClick={handleConfirmResetData}
                className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 font-extrabold text-xs text-white shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Eraser className="w-4 h-4" />
                <span>{isResetting ? 'Limpiando Base de Datos...' : 'Vaciar Todos los Datos de Prueba'}</span>
              </button>

              <button
                type="button"
                disabled={isResetting}
                onClick={() => setResetDataBiz(null)}
                className="w-full h-11 rounded-xl bg-neutral-800 hover:bg-neutral-700 font-bold text-xs text-neutral-300 transition cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CAMBIAR O GENERAR NUEVA CLAVE */}
      {passwordModalBiz && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-neutral-900 border border-emerald-500/50 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-neutral-100">
            
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-emerald-900/80 text-emerald-300 border border-emerald-700">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-white">Gestión de Clave de Acceso</h3>
                  <p className="text-xs text-neutral-400">{passwordModalBiz.nombre}</p>
                </div>
              </div>
              <button 
                onClick={() => setPasswordModalBiz(null)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-1">
                <span className="text-[10px] text-neutral-500 font-bold uppercase block">Correo / Usuario Administrador</span>
                <div className="font-mono text-sm font-bold text-purple-300 truncate">
                  {passwordModalBiz.email || passwordModalBiz.ownerEmail || 'admin@gastrosmart.com'}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-neutral-300">Nueva Clave Asignada</label>
                  <button
                    type="button"
                    onClick={handleGenerateRandomPassword}
                    className="text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Wand2 className="w-3.5 h-3.5" /> Generar Clave Aleatoria
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={newPasswordValue}
                    onChange={(e) => setNewPasswordValue(e.target.value)}
                    placeholder="Ej: Gastro9821"
                    className="w-full h-12 px-4 rounded-xl bg-neutral-950 border border-emerald-800/80 font-mono text-base text-emerald-400 font-extrabold focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playKeypadClick();
                      navigator.clipboard.writeText(newPasswordValue);
                      setSuccessMsg(`Clave "${newPasswordValue}" copiada al portapapeles.`);
                      setTimeout(() => setSuccessMsg(null), 3000);
                    }}
                    className="absolute right-2 top-2 h-8 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <span>Copiar</span>
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/50 text-purple-200 text-[11px] leading-relaxed">
                ℹ️ Al guardar la nueva clave, se actualizará en la base de datos de Firestore. El administrador del restaurante podrá ingresar inmediatamente con su correo y esta clave.
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                disabled={isUpdatingPass}
                onClick={handleSaveNewPassword}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 font-black text-xs text-white shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{isUpdatingPass ? 'Guardando en Base de Datos...' : 'Guardar y Actualizar Clave'}</span>
              </button>

              <button
                type="button"
                disabled={isUpdatingPass}
                onClick={() => setPasswordModalBiz(null)}
                className="w-full h-11 rounded-xl bg-neutral-800 hover:bg-neutral-700 font-bold text-xs text-neutral-300 transition cursor-pointer"
              >
                Cancelar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL DEDICADO: ASIGNAR O CREAR CÓDIGO DE 4 DÍGITOS DE LA EMPRESA / SEDE */}
      {branchCodeModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-neutral-900 border border-amber-500/50 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 text-neutral-100">
            
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-amber-900/80 text-amber-300 border border-amber-700">
                  <Hash className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-white">Código de 4 Dígitos de Empresa</h3>
                  <p className="text-xs text-neutral-400">{branchCodeModal.biz.nombre}</p>
                </div>
              </div>
              <button 
                onClick={() => setBranchCodeModal(null)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-1">
                <span className="text-[10px] text-neutral-500 font-bold uppercase block">Empresa / Sucursal Objetivo</span>
                <div className="font-bold text-sm text-white truncate">
                  {branchCodeModal.restaurantName || branchCodeModal.biz.nombre}
                </div>
                <div className="text-[11px] text-neutral-400 font-mono">
                  ID Empresa: {branchCodeModal.biz.id}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-bold text-amber-300">Asignar o Crear Código (4 Dígitos) *</label>
                  <button
                    type="button"
                    onClick={handleGenerateRandomBranchCode}
                    className="text-xs font-bold text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Wand2 className="w-3.5 h-3.5" /> Generar 4 Dígitos Aleatorios
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={4}
                    value={newBranchCodeValue}
                    onChange={(e) => setNewBranchCodeValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Ej: 3592"
                    className="w-full h-14 px-4 rounded-xl bg-neutral-950 border-2 border-amber-600/80 font-mono text-2xl text-amber-300 font-black tracking-[0.35em] text-center focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playKeypadClick();
                      navigator.clipboard.writeText(newBranchCodeValue);
                      setSuccessMsg(`Código de 4 dígitos "${newBranchCodeValue}" copiado al portapapeles.`);
                      setTimeout(() => setSuccessMsg(null), 3000);
                    }}
                    className="absolute right-2.5 top-3 h-8 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <span>Copiar</span>
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 text-amber-200/90 text-[11px] space-y-1 leading-relaxed">
                <div className="font-bold text-amber-300">🔢 ¿Cómo funciona este código de 4 dígitos?</div>
                <p>
                  Identifica de forma única a esta empresa/sede. Los empleados ingresan al terminal marcando <strong>8 dígitos</strong>:
                </p>
                <div className="font-mono text-xs bg-neutral-950 px-2.5 py-1.5 rounded-lg border border-amber-900/60 text-center text-white mt-1">
                  <span className="text-amber-400 font-black">{newBranchCodeValue.padEnd(4, '•')}</span> (Empresa) + <span className="text-emerald-400 font-black">1234</span> (PIN Empleado) = <span className="font-black text-purple-300">{newBranchCodeValue.padEnd(4, '•')}1234</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                disabled={isUpdatingBranchCode || newBranchCodeValue.replace(/\D/g, '').length !== 4}
                onClick={handleSaveBranchCode}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 font-black text-xs text-white shadow-lg shadow-amber-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>{isUpdatingBranchCode ? 'Guardando Código en BD...' : 'Guardar y Asignar Código de 4 Dígitos'}</span>
              </button>

              <button
                type="button"
                disabled={isUpdatingBranchCode}
                onClick={() => setBranchCodeModal(null)}
                className="w-full h-11 rounded-xl bg-neutral-800 hover:bg-neutral-700 font-bold text-xs text-neutral-300 transition cursor-pointer"
              >
                Cancelar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
