import React, { useState, useMemo } from 'react';
import { Table, Client, Order, OrderType, DeliveryCompany, MenuItem } from '../types';
import { createClient } from '../services/dataService';
import { sounds } from '../utils/sound';
import { 
  Utensils, 
  User, 
  Bike, 
  ShoppingBag, 
  Search, 
  Plus, 
  Check, 
  AlertCircle, 
  History, 
  Sparkles, 
  X, 
  MapPin, 
  Phone, 
  ChevronRight,
  Clock,
  DollarSign,
  Users,
  CheckCircle2,
  FilePlus,
  ArrowRight
} from 'lucide-react';

export interface OrderSetupData {
  orderTargetType: 'mesa' | 'cliente';
  selectedTable: Table | null;
  targetExistingOrder: Order | null;
  selectedClient: Client | null;
  orderType: OrderType;
  deliveryCompany: DeliveryCompany | string;
  deliveryAddress: string;
  recommendedItemName?: string;
}

interface WaiterOrderSetupProps {
  tables: Table[];
  orders: Order[];
  clients: Client[];
  restaurantId: string;
  initialData?: OrderSetupData | null;
  onContinue: (data: OrderSetupData) => void;
}

export const WaiterOrderSetup: React.FC<WaiterOrderSetupProps> = ({
  tables,
  orders,
  clients,
  restaurantId,
  initialData,
  onContinue
}) => {
  // Target choice: 'mesa' | 'cliente' | null
  const [targetType, setTargetType] = useState<'mesa' | 'cliente' | null>(
    initialData?.orderTargetType || null
  );

  // Mesa state
  const [selectedTableId, setSelectedTableId] = useState<string>(
    initialData?.selectedTable?.id || ''
  );
  const [targetExistingOrder, setTargetExistingOrder] = useState<Order | null>(
    initialData?.targetExistingOrder || null
  );
  const [occupiedModalTable, setOccupiedModalTable] = useState<{ table: Table; order: Order } | null>(null);

  // Cliente state
  const [subType, setSubType] = useState<'delivery' | 'para_llevar'>(
    initialData?.orderType === 'delivery' ? 'delivery' : 'para_llevar'
  );
  const [deliveryCompany, setDeliveryCompany] = useState<DeliveryCompany | string>(
    initialData?.deliveryCompany || 'Propio'
  );
  const [deliveryAddress, setDeliveryAddress] = useState<string>(
    initialData?.deliveryAddress || ''
  );
  const [selectedClient, setSelectedClient] = useState<Client | null>(
    initialData?.selectedClient || null
  );

  // Search client
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewClientModal, setShowNewClientModal] = useState(false);

  // Optional client linking for table
  const [linkClientToTable, setLinkClientToTable] = useState(false);

  // New Client Form
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [newClientError, setNewClientError] = useState('');

  // Pre-load address when client is selected
  const handleSelectClient = (client: Client) => {
    sounds.playKeypadClick();
    setSelectedClient(client);
    if (client.direccion) {
      setDeliveryAddress(client.direccion);
    }
    setSearchQuery('');
  };

  // Find active order for a given table
  const getOpenOrderForTable = (table: Table): Order | undefined => {
    return orders.find(
      o => o.restaurantId === restaurantId &&
           (o.mesaId === table.id || o.mesaNumero === table.numero) &&
           o.estado !== 'cobrado' &&
           o.estado !== 'rechazado'
    );
  };

  // Filter clients by search query (name or phone)
  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return clients.filter(c => 
      c.nombre.toLowerCase().includes(q) || 
      (c.telefono && c.telefono.toLowerCase().includes(q))
    ).slice(0, 6);
  }, [clients, searchQuery]);

  // Client's quick purchase history (last 3 orders)
  const clientHistory = useMemo(() => {
    if (!selectedClient) return [];
    return orders
      .filter(o => 
        o.clienteId === selectedClient.id || 
        (selectedClient.telefono && o.clienteTelefono === selectedClient.telefono) ||
        o.clienteNombre?.toLowerCase() === selectedClient.nombre.toLowerCase()
      )
      .sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime())
      .slice(0, 3);
  }, [selectedClient, orders]);

  // Recommended "lo de siempre" (most frequent item from previous orders)
  const favoriteItemName = useMemo(() => {
    if (!clientHistory.length) return null;
    const counts: Record<string, number> = {};
    clientHistory.forEach(ord => {
      ord.items?.forEach(it => {
        counts[it.nombre] = (counts[it.nombre] || 0) + it.cantidad;
      });
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : null;
  }, [clientHistory]);

  // Handle Table Click
  const handleTableClick = (table: Table) => {
    sounds.playKeypadClick();
    const openOrder = getOpenOrderForTable(table);

    if (openOrder) {
      // Table is occupied: prompt whether to append or open new
      setOccupiedModalTable({ table, order: openOrder });
    } else {
      // Free table
      setSelectedTableId(table.id);
      setTargetExistingOrder(null);
    }
  };

  // Create new client handler
  const handleSaveNewClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) {
      setNewClientError('El nombre del cliente es obligatorio');
      return;
    }

    setIsSavingClient(true);
    setNewClientError('');
    try {
      const created = await createClient({
        nombre: newClientName.trim(),
        telefono: newClientPhone.trim(),
        direccion: newClientAddress.trim()
      });
      sounds.playCashRegister();
      setSelectedClient(created);
      if (created.direccion) {
        setDeliveryAddress(created.direccion);
      }
      setShowNewClientModal(false);
      setNewClientName('');
      setNewClientPhone('');
      setNewClientAddress('');
    } catch (err: any) {
      setNewClientError('Error al guardar cliente: ' + err.message);
    } finally {
      setIsSavingClient(false);
    }
  };

  // Validation logic
  const selectedTableObj = tables.find(t => t.id === selectedTableId) || null;

  const isValid = useMemo(() => {
    if (!targetType) return false;

    if (targetType === 'mesa') {
      return !!selectedTableId;
    }

    if (targetType === 'cliente') {
      if (!selectedClient) return false;
      if (!selectedClient.nombre.trim()) return false;
      // If delivery, address is mandatory
      if (subType === 'delivery' && !deliveryAddress.trim()) {
        return false;
      }
      return true;
    }

    return false;
  }, [targetType, selectedTableId, selectedClient, subType, deliveryAddress]);

  // Dynamic help text for disabled Continue button
  const validationMessage = useMemo(() => {
    if (!targetType) return 'Selecciona MESA o CLIENTE para comenzar';
    if (targetType === 'mesa') {
      if (!selectedTableId) return 'Toca una mesa en el plano para seleccionarla';
      return `Mesa #${selectedTableObj?.numero} seleccionada`;
    }
    if (targetType === 'cliente') {
      if (!selectedClient) return 'Busca un cliente registrado o crea uno nuevo';
      if (subType === 'delivery' && !deliveryAddress.trim()) {
        return 'Ingresa la dirección de entrega para el delivery';
      }
      return `Cliente: ${selectedClient.nombre} (${subType === 'delivery' ? 'Delivery' : 'Para Llevar'})`;
    }
    return '';
  }, [targetType, selectedTableId, selectedTableObj, selectedClient, subType, deliveryAddress]);

  const handleContinue = () => {
    if (!isValid || !targetType) return;
    sounds.playKeypadClick();

    onContinue({
      orderTargetType: targetType,
      selectedTable: targetType === 'mesa' ? selectedTableObj : null,
      targetExistingOrder: targetType === 'mesa' ? targetExistingOrder : null,
      selectedClient: selectedClient,
      orderType: targetType === 'mesa' ? 'local' : (subType === 'delivery' ? 'delivery' : 'para_llevar'),
      deliveryCompany: subType === 'delivery' ? deliveryCompany : 'Propio',
      deliveryAddress: deliveryAddress.trim(),
      recommendedItemName: favoriteItemName || undefined
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-100 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto w-full space-y-6 pb-24">
        
        {/* Header de Paso 1 */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-neutral-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-orange-100 text-orange-800 text-[11px] font-black uppercase tracking-wider rounded-full">
                Paso 1 de 2
              </span>
              <span className="text-xs font-bold text-neutral-400">Identificación</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-neutral-900 mt-1">
              Nuevo Pedido: ¿Dónde va la comanda?
            </h2>
            <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
              Elige si el pedido es para consumo en el salón (Mesa) o para llevar/delivery (Cliente).
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-neutral-500 bg-neutral-50 px-4 py-2 rounded-2xl border border-neutral-200">
            <Clock className="w-4 h-4 text-orange-500" />
            <span>Atención táctil rápida</span>
          </div>
        </div>

        {/* == NUEVO PEDIDO — PASO 1: ELEGIR TIPO == */}
        {/* Pantalla con dos tarjetas grandes táctiles: MESA y CLIENTE */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Tarjeta 1: MESA (Salón / Local) */}
          <button
            type="button"
            onClick={() => {
              sounds.playKeypadClick();
              setTargetType('mesa');
            }}
            className={`min-h-[110px] p-5 sm:p-6 rounded-3xl border-2 transition-all duration-200 text-left flex items-start gap-4 active:scale-[0.99] select-none relative overflow-hidden shadow-xs ${
              targetType === 'mesa'
                ? 'bg-orange-50/80 border-orange-500 shadow-md shadow-orange-500/10 ring-4 ring-orange-500/15'
                : 'bg-white border-neutral-200 hover:border-orange-300 hover:bg-neutral-50/80'
            }`}
          >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
              targetType === 'mesa'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                : 'bg-neutral-100 text-neutral-700'
            }`}>
              <Utensils className="w-7 h-7" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-lg sm:text-xl font-black text-neutral-900">
                  1. MESA
                </span>
                {targetType === 'mesa' && (
                  <span className="flex items-center gap-1 bg-orange-600 text-white text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full shadow-xs">
                    <Check className="w-3.5 h-3.5" /> Elegido
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm font-semibold text-neutral-700 mt-1">
                Para pedidos en el salón (LOCAL)
              </p>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Selecciona la mesa desde el plano en vivo con estado libre u ocupado.
              </p>
            </div>
          </button>

          {/* Tarjeta 2: CLIENTE (Delivery o Para Llevar) */}
          <button
            type="button"
            onClick={() => {
              sounds.playKeypadClick();
              setTargetType('cliente');
            }}
            className={`min-h-[110px] p-5 sm:p-6 rounded-3xl border-2 transition-all duration-200 text-left flex items-start gap-4 active:scale-[0.99] select-none relative overflow-hidden shadow-xs ${
              targetType === 'cliente'
                ? 'bg-orange-50/80 border-orange-500 shadow-md shadow-orange-500/10 ring-4 ring-orange-500/15'
                : 'bg-white border-neutral-200 hover:border-orange-300 hover:bg-neutral-50/80'
            }`}
          >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
              targetType === 'cliente'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                : 'bg-neutral-100 text-neutral-700'
            }`}>
              <User className="w-7 h-7" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-lg sm:text-xl font-black text-neutral-900">
                  2. CLIENTE
                </span>
                {targetType === 'cliente' && (
                  <span className="flex items-center gap-1 bg-orange-600 text-white text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full shadow-xs">
                    <Check className="w-3.5 h-3.5" /> Elegido
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm font-semibold text-neutral-700 mt-1">
                Para delivery o para llevar
              </p>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Búsqueda, historial de últimas compras y recomendación de "lo de siempre".
              </p>
            </div>
          </button>

        </div>

        {/* ======================================================== */}
        {/* == CONTENIDO DE OPCIÓN MESA == */}
        {/* ======================================================== */}
        {targetType === 'mesa' && (
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-neutral-200 shadow-sm space-y-5 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-100">
              <div>
                <h3 className="text-base sm:text-lg font-black text-neutral-900 flex items-center gap-2">
                  <Utensils className="w-5 h-5 text-orange-500" />
                  Plano de Mesas del Salón
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Toca una mesa libre para seleccionarla. Si tocas una ocupada, podrás sumar platos a su cuenta abierta.
                </p>
              </div>

              {/* Leyenda de colores */}
              <div className="flex items-center gap-3 text-xs font-bold">
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 shadow-xs" />
                  <span className="text-emerald-900 font-semibold">Verde: Libre</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-amber-500 shadow-xs" />
                  <span className="text-amber-900 font-semibold">Ámbar: Ocupada</span>
                </div>
              </div>
            </div>

            {/* Grid de Mesas como tarjetas grandes con su número */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
              {tables.length === 0 ? (
                <div className="col-span-full py-12 text-center text-neutral-400 font-medium text-xs">
                  No hay mesas configuradas para este restaurante. Puedes crearlas en el Panel de Administrador.
                </div>
              ) : (
                [...tables].sort((a, b) => a.numero - b.numero).map(table => {
                  const openOrder = getOpenOrderForTable(table);
                  const isOccupied = !!openOrder || table.estado === 'ocupada';
                  const isSelected = selectedTableId === table.id;

                  return (
                    <div
                      key={table.id}
                      onClick={() => handleTableClick(table)}
                      className={`min-h-[125px] rounded-2xl p-3.5 border-2 transition-all duration-150 flex flex-col justify-between cursor-pointer select-none relative shadow-xs active:scale-97 ${
                        isSelected
                          ? 'ring-4 ring-orange-500/20 border-orange-500 bg-orange-50 shadow-md'
                          : isOccupied
                            ? 'bg-amber-50/70 border-amber-300 hover:border-amber-400'
                            : 'bg-emerald-50/60 border-emerald-300 hover:border-emerald-400'
                      }`}
                    >
                      {/* Top: Mesa Número & Status Badge */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-8 h-8 rounded-xl font-black text-sm flex items-center justify-center ${
                            isSelected
                              ? 'bg-orange-600 text-white'
                              : isOccupied
                                ? 'bg-amber-600 text-white'
                                : 'bg-emerald-600 text-white'
                          }`}>
                            #{table.numero}
                          </span>
                        </div>

                        {isSelected && (
                          <span className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        )}
                      </div>

                      {/* Middle: Capacidad */}
                      <div className="my-1">
                        <span className="text-[11px] font-semibold text-neutral-500 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {table.capacidad || 4} personas
                        </span>
                      </div>

                      {/* Bottom: Estado & Total Acumulado */}
                      <div className="pt-2 border-t border-black/5 flex flex-col">
                        {isOccupied ? (
                          <>
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                              Ocupada
                            </span>
                            {openOrder ? (
                              <span className="text-xs font-black text-amber-950 font-mono mt-0.5">
                                Total: ${openOrder.total.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-700">En atención</span>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Libre
                          </span>
                        )}
                      </div>

                      {/* Flag if adding to existing order */}
                      {isSelected && targetExistingOrder && (
                        <div className="absolute top-1 right-1 bg-amber-600 text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded shadow-xs">
                          + Adición
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Resumen de Mesa Seleccionada & Opción de Vincular Cliente */}
            {selectedTableObj && (
              <div className="mt-4 p-4 rounded-2xl bg-neutral-50 border border-neutral-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center font-black text-base">
                    #{selectedTableObj.numero}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-neutral-900">
                      Mesa #{selectedTableObj.numero} seleccionada
                      {targetExistingOrder && (
                        <span className="ml-2 text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          Sumando a cuenta abierta (${targetExistingOrder.total.toFixed(2)})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500">
                      Capacidad: {selectedTableObj.capacidad || 4} comensales • Consumo en salón
                    </div>
                  </div>
                </div>

                {/* Vincular cliente a la mesa (opcional) */}
                <div className="w-full md:w-auto">
                  {!selectedClient ? (
                    <button
                      type="button"
                      onClick={() => setLinkClientToTable(!linkClientToTable)}
                      className="text-xs font-bold text-orange-600 hover:text-orange-700 bg-white border border-orange-200 hover:border-orange-300 px-3 py-2 rounded-xl flex items-center gap-1.5 transition"
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>{linkClientToTable ? 'Cerrar buscador de cliente' : '＋ Vincular cliente a la mesa (opcional)'}</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs text-emerald-900 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Cliente: {selectedClient.nombre}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedClient(null)}
                        className="text-neutral-400 hover:text-red-600 p-0.5 ml-1"
                        title="Desvincular cliente"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-bloque si decide vincular cliente a la mesa */}
            {linkClientToTable && !selectedClient && (
              <div className="p-4 rounded-2xl bg-orange-50/50 border border-orange-200 space-y-3">
                <div className="text-xs font-bold text-neutral-800">
                  Vincular cliente a Mesa #{selectedTableObj?.numero} para registrar su historial:
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre o teléfono..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-10 pl-9 pr-4 rounded-xl border border-neutral-300 bg-white text-xs outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                {filteredClients.length > 0 && (
                  <div className="bg-white rounded-xl border border-neutral-200 divide-y divide-neutral-100 shadow-sm overflow-hidden">
                    {filteredClients.map(cli => (
                      <div
                        key={cli.id}
                        onClick={() => {
                          handleSelectClient(cli);
                          setLinkClientToTable(false);
                        }}
                        className="p-2.5 hover:bg-orange-50 cursor-pointer flex items-center justify-between text-xs"
                      >
                        <span className="font-bold text-neutral-900">{cli.nombre}</span>
                        <span className="font-mono text-neutral-500">{cli.telefono || 'Sin tel'}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowNewClientModal(true)}
                  className="text-xs font-bold text-orange-600 underline"
                >
                  + O crear nuevo cliente
                </button>
              </div>
            )}

          </div>
        )}

        {/* ======================================================== */}
        {/* == CONTENIDO DE OPCIÓN CLIENTE == */}
        {/* ======================================================== */}
        {targetType === 'cliente' && (
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-neutral-200 shadow-sm space-y-5 animate-in fade-in duration-200">
            
            {/* Sub-selector: Delivery vs Para Llevar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100">
              <div>
                <h3 className="text-base sm:text-lg font-black text-neutral-900 flex items-center gap-2">
                  <User className="w-5 h-5 text-orange-500" />
                  Gestión de Pedido por Cliente
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Busca al cliente por nombre o teléfono, o registra uno nuevo al instante.
                </p>
              </div>

              {/* Toggle Delivery vs Para Llevar */}
              <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-2xl shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playKeypadClick();
                    setSubType('delivery');
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                    subType === 'delivery'
                      ? 'bg-white text-neutral-900 shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <Bike className="w-3.5 h-3.5 text-orange-500" />
                  Delivery
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playKeypadClick();
                    setSubType('para_llevar');
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                    subType === 'para_llevar'
                      ? 'bg-white text-neutral-900 shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-orange-500" />
                  Para Llevar
                </button>
              </div>
            </div>

            {/* Empresa de delivery si aplica */}
            {subType === 'delivery' && (
              <div className="bg-orange-50/60 p-3.5 rounded-2xl border border-orange-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Bike className="w-4 h-4 text-orange-600 shrink-0" />
                  <span className="text-xs font-bold text-orange-950">
                    Canal o Empresa de Reparto:
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['Propio', 'PedidosYa', 'UberEats', 'Rappi', 'Otro'] as DeliveryCompany[]).map((comp) => (
                    <button
                      key={comp}
                      type="button"
                      onClick={() => {
                        sounds.playKeypadClick();
                        setDeliveryCompany(comp);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                        deliveryCompany === comp
                          ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      {comp}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Buscador de Clientes en la parte superior con Autocompletado */}
            {!selectedClient && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                    Buscar Cliente Registrado
                  </label>
                  <span className="text-[11px] text-neutral-400">
                    Autocompletado en tiempo real
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-5 h-5 text-neutral-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      placeholder="Escribe el nombre o teléfono del cliente..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-12 pl-11 pr-4 rounded-2xl border border-neutral-300 bg-white font-medium text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-orange-500 shadow-xs"
                      autoFocus
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3.5 top-3.5 text-neutral-400 hover:text-neutral-600 p-0.5"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  {/* Botón grande: ＋ Nuevo cliente */}
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playKeypadClick();
                      setShowNewClientModal(true);
                    }}
                    className="min-h-[48px] sm:h-12 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-98 transition shrink-0"
                  >
                    <Plus className="w-4 h-4 stroke-[3]" />
                    <span>＋ Nuevo cliente</span>
                  </button>
                </div>

                {/* Lista de sugerencias / autocompletado */}
                {searchQuery.trim().length > 0 && (
                  <div className="bg-white rounded-2xl border border-neutral-200 shadow-xl overflow-hidden divide-y divide-neutral-100 animate-in fade-in-50 duration-100">
                    {filteredClients.length === 0 ? (
                      <div className="p-4 text-center">
                        <p className="text-xs text-neutral-500 font-medium">
                          No se encontró ningún cliente con "{searchQuery}"
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setNewClientName(searchQuery);
                            setShowNewClientModal(true);
                          }}
                          className="mt-2 text-xs font-bold text-orange-600 hover:underline"
                        >
                          Crear cliente con este nombre →
                        </button>
                      </div>
                    ) : (
                      filteredClients.map(client => (
                        <div
                          key={client.id}
                          onClick={() => handleSelectClient(client)}
                          className="p-3.5 hover:bg-orange-50/80 cursor-pointer flex items-center justify-between transition"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-xs">
                              {client.nombre.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-xs sm:text-sm font-bold text-neutral-900">
                                {client.nombre}
                              </div>
                              <div className="text-[11px] text-neutral-500 flex items-center gap-2">
                                {client.telefono && (
                                  <span className="flex items-center gap-1 font-mono">
                                    <Phone className="w-3 h-3 text-neutral-400" />
                                    {client.telefono}
                                  </span>
                                )}
                                {client.direccion && (
                                  <span className="hidden sm:flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-neutral-400" />
                                    {client.direccion}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 text-xs font-bold text-orange-600">
                            <span>Seleccionar</span>
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TARJETA DE CLIENTE SELECCIONADO */}
            {selectedClient && (
              <div className="p-5 rounded-3xl bg-neutral-50 border border-neutral-200 space-y-4">
                
                {/* Header cliente seleccionado */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center font-black text-lg shadow-sm">
                      {selectedClient.nombre.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base sm:text-lg font-black text-neutral-900">
                          {selectedClient.nombre}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                          Cliente Registrado
                        </span>
                      </div>
                      <div className="text-xs text-neutral-500 flex items-center gap-3 mt-0.5">
                        {selectedClient.telefono ? (
                          <span className="flex items-center gap-1 font-mono">
                            <Phone className="w-3.5 h-3.5 text-neutral-400" />
                            {selectedClient.telefono}
                          </span>
                        ) : (
                          <span className="italic text-neutral-400">Sin teléfono</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      sounds.playKeypadClick();
                      setSelectedClient(null);
                    }}
                    className="text-xs font-bold text-neutral-500 hover:text-neutral-800 bg-white border border-neutral-200 hover:bg-neutral-100 px-3 py-1.5 rounded-xl transition"
                  >
                    Cambiar cliente
                  </button>
                </div>

                {/* Input de Dirección (Obligatorio en Delivery) */}
                <div className="space-y-1.5 pt-2 border-t border-neutral-200">
                  <label className="block text-xs font-bold text-neutral-700 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-orange-500" />
                      Dirección de entrega {subType === 'delivery' ? '(Obligatoria para delivery)' : '(Opcional)'}:
                    </span>
                    {subType === 'delivery' && !deliveryAddress.trim() && (
                      <span className="text-[11px] text-red-600 font-bold">
                        * Requerida para continuar
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Av. Las Flores 340, Dpto 4B"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className={`w-full h-11 px-3.5 rounded-xl border text-xs font-medium outline-none bg-white transition ${
                      subType === 'delivery' && !deliveryAddress.trim()
                        ? 'border-red-400 focus:ring-2 focus:ring-red-400'
                        : 'border-neutral-300 focus:ring-2 focus:ring-orange-500'
                    }`}
                  />
                </div>

                {/* HISTORIAL RÁPIDO: Últimas 3 compras con fecha y monto */}
                <div className="pt-3 border-t border-neutral-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-orange-500" />
                      Historial Rápido de Compras
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      Últimas 3 compras registradas
                    </span>
                  </div>

                  {clientHistory.length === 0 ? (
                    <div className="p-3 rounded-xl bg-white border border-neutral-200 text-center text-xs text-neutral-400">
                      Este cliente aún no registra compras anteriores en el sistema.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {clientHistory.map((order, idx) => {
                        const dateFormatted = new Date(order.creadoEn).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        });
                        const itemsCount = order.items?.reduce((acc, it) => acc + it.cantidad, 0) || 0;
                        const sampleDish = order.items?.[0]?.nombre || 'Varios platos';

                        return (
                          <div
                            key={order.id || idx}
                            className="p-2.5 rounded-xl bg-white border border-neutral-200 text-xs flex flex-col justify-between shadow-2xs"
                          >
                            <div>
                              <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-1">
                                <span className="font-mono">{dateFormatted}</span>
                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 bg-neutral-100 rounded">
                                  {order.tipo}
                                </span>
                              </div>
                              <p className="font-semibold text-neutral-800 line-clamp-1">
                                {sampleDish} {order.items?.length > 1 ? `(+${order.items.length - 1})` : ''}
                              </p>
                              <p className="text-[10px] text-neutral-400 mt-0.5">
                                {itemsCount} {itemsCount === 1 ? 'ítem' : 'ítems'}
                              </p>
                            </div>
                            <div className="mt-2 pt-1.5 border-t border-neutral-100 flex items-center justify-between">
                              <span className="text-[10px] text-neutral-500">Monto:</span>
                              <span className="font-mono font-black text-neutral-900 text-xs">
                                ${order.total.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Recomendación: "Lo de siempre" y saludo por nombre */}
                  {favoriteItemName && (
                    <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                        <div>
                          <span className="font-bold text-amber-950">
                            Sugerir "Lo de siempre": {favoriteItemName}
                          </span>
                          <span className="block text-[11px] text-amber-800">
                            Saluda a {selectedClient.nombre} por su nombre y ofrécele su plato favorito.
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                </div>

              </div>
            )}

          </div>
        )}

        {/* ======================================================== */}
        {/* == BARRA FIJA INFERIOR: BOTÓN CONTINUAR == */}
        {/* ======================================================== */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-neutral-200 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm">
            <span className={`w-3 h-3 rounded-full shrink-0 ${isValid ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
            <span className="font-semibold text-neutral-700">
              {validationMessage}
            </span>
          </div>

          <button
            type="button"
            disabled={!isValid}
            onClick={handleContinue}
            className="w-full sm:w-auto min-h-[56px] px-8 rounded-2xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-extrabold text-base shadow-lg shadow-orange-600/30 flex items-center justify-center gap-3 transition disabled:opacity-40 disabled:pointer-events-none active:scale-98"
          >
            <span>Continuar al Menú</span>
            <ArrowRight className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

      </div>

      {/* ======================================================== */}
      {/* MODAL: MESA OCUPADA (Agregar platos o abrir nueva cuenta) */}
      {/* ======================================================== */}
      {occupiedModalTable && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-neutral-100 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-black text-sm">
                  #{occupiedModalTable.table.numero}
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-neutral-900">
                    Mesa #{occupiedModalTable.table.numero} Ocupada
                  </h3>
                  <span className="text-xs text-amber-700 font-medium">
                    Tiene un pedido abierto en preparación
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setOccupiedModalTable(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Info del pedido actual */}
            <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 text-xs space-y-2">
              <div className="flex items-center justify-between font-bold">
                <span className="text-neutral-500">Cuenta Acumulada:</span>
                <span className="font-mono text-base font-black text-neutral-900">
                  ${occupiedModalTable.order.total.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-neutral-600">
                <span>Platos en mesa:</span>
                <span className="font-semibold">{occupiedModalTable.order.items?.length || 0} ítems</span>
              </div>
              <div className="flex items-center justify-between text-neutral-600">
                <span>Mesero inicial:</span>
                <span className="font-semibold">{occupiedModalTable.order.meseroNombre || 'Desconocido'}</span>
              </div>
            </div>

            <p className="text-xs text-neutral-600">
              ¿Qué acción deseas realizar con esta mesa?
            </p>

            {/* Dos opciones táctiles */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  sounds.playKeypadClick();
                  setSelectedTableId(occupiedModalTable.table.id);
                  setTargetExistingOrder(occupiedModalTable.order);
                  setOccupiedModalTable(null);
                }}
                className="w-full min-h-[52px] rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-orange-600/20 transition"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Agregar platos al pedido abierto (${occupiedModalTable.order.total.toFixed(2)})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sounds.playKeypadClick();
                  setSelectedTableId(occupiedModalTable.table.id);
                  setTargetExistingOrder(null);
                  setOccupiedModalTable(null);
                }}
                className="w-full min-h-[48px] rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition"
              >
                <FilePlus className="w-4 h-4" />
                <span>Abrir cuenta nueva independiente</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOccupiedModalTable(null)}
              className="w-full py-2.5 text-xs text-neutral-400 hover:text-neutral-600 font-bold"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL COMPACTO: ＋ NUEVO CLIENTE                         */}
      {/* ======================================================== */}
      {showNewClientModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-neutral-900">
                    Nuevo Cliente
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Formulario compacto de registro rápido
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowNewClientModal(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewClient} className="space-y-3.5">
              
              {newClientError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{newClientError}</span>
                </div>
              )}

              {/* Nombre (obligatorio) */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Nombre del Cliente <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Juan Pérez"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-neutral-300 text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  autoFocus
                />
              </div>

              {/* Teléfono (opcional) */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Teléfono <span className="text-neutral-400 font-normal">(Opcional)</span>
                </label>
                <input
                  type="tel"
                  placeholder="Ej: +1 555-0199"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-neutral-300 text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
                />
              </div>

              {/* Dirección (opcional, sugerido si es delivery) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-neutral-700">
                    Dirección
                  </label>
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    Sugerido si es delivery
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="Ej: Av. Principal 123, Depto 5"
                  value={newClientAddress}
                  onChange={(e) => setNewClientAddress(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-neutral-300 text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                />
              </div>

              {/* Botones de acción */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewClientModal(false)}
                  className="flex-1 h-12 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingClient}
                  className="flex-2 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition disabled:opacity-50"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{isSavingClient ? 'Guardando...' : 'Guardar y Seleccionar'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
