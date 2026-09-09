import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { ShoppingCart, Trash2, Search, CheckCircle, Tag, Users, UserPlus, X, Percent, Eye, Receipt, Box, Briefcase, Minus, Plus, PackageOpen, FileDown } from 'lucide-react';
import { formatCOP, formatDocumento, formatCantidad } from '../../utils/format';
import { generateInvoicePDF } from '../../utils/generateInvoicePDF';
import { useAuthStore } from '../../store/authStore';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

const Ventas = () => {
  const { activeEmpresa } = useAuthStore();
  const queryClient = useQueryClient();
  const modulos = activeEmpresa?.modulos || [];

  const {
    data: ventas = [], isLoading: cargandoVentas, isError: errorVentas,
    error: errVentas, refetch: recargarVentas,
  } = useEmpresaQuery(['ventas'], '/ventas');
  const { data: productos = [] } = useEmpresaQuery(['productos'], '/productos');
  const { data: clientes = [] } = useEmpresaQuery(['clientes'], '/clientes', { enabled: modulos.includes('Clientes') });
  const { data: servicios = [] } = useEmpresaQuery(['servicios'], '/servicios', { enabled: modulos.includes('Servicios') });
  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['empresa'] });

  const [showModal, setShowModal] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [activeTab, setActiveTab] = useState('P'); // 'P' or 'S'
  const [viewDetalle, setViewDetalle] = useState(null);
  const [formError, setFormError] = useState(null);

  const [formData, setFormData] = useState({ clienteId: '', detalles: [], forma_pago: '1', medio_pago: '10' });
  const [activeDiscountIdx, setActiveDiscountIdx] = useState(null);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [newClientData, setNewClientData] = useState({ nombre: '', documento: '', telefono: '', email: '', direccion: '' });
  const [showNewClient, setShowNewClient] = useState(false);

  // Compute Frequencies to sort components
  const freq = useMemo(() => {
    const cFreq = {}; const pFreq = {}; const sFreq = {};
    ventas.forEach(v => {
      if (v.clienteId) cFreq[v.clienteId] = (cFreq[v.clienteId] || 0) + 1;
      v.VentaDetalles?.forEach(det => {
        if (det.productoId) pFreq[det.productoId] = (pFreq[det.productoId] || 0) + det.cantidad;
        if (det.servicioId) sFreq[det.servicioId] = (sFreq[det.servicioId] || 0) + det.cantidad;
      });
    });
    return { cFreq, pFreq, sFreq };
  }, [ventas]);

  const topClientes = useMemo(() => {
    return [...clientes].sort((a,b) => (freq.cFreq[b.id] || 0) - (freq.cFreq[a.id] || 0)).slice(0, 5);
  }, [clientes, freq.cFreq]);

  const filteredClientes = useMemo(() => {
    if (clientSearch.trim().length < 3) return [];
    const lower = clientSearch.toLowerCase();
    return clientes.filter(c => (c.nombre || '').toLowerCase().includes(lower) || (c.documento || '').includes(lower));
  }, [clientSearch, clientes]);

  const displayList = useMemo(() => {
    const lower = itemSearch.toLowerCase();
    if (activeTab === 'P') {
      let filtered = productos.filter(p => Number(p.stock_actual) > 0 && ((p.nombre_producto || '').toLowerCase().includes(lower) || (p.codigo || '').toLowerCase().includes(lower)));
      return filtered.sort((a,b) => (freq.pFreq[b.id] || 0) - (freq.pFreq[a.id] || 0));
    } else {
      let filtered = servicios.filter(s => (s.nombre || '').toLowerCase().includes(lower));
      return filtered.sort((a,b) => (freq.sFreq[b.id] || 0) - (freq.sFreq[a.id] || 0));
    }
  }, [activeTab, itemSearch, productos, servicios, freq]);

  const crearCliente = useMutation({
    mutationFn: (data) => api.post('/clientes', data),
    onSuccess: (res) => {
      invalidar();
      setFormData(prev => ({ ...prev, clienteId: res.data.id }));
      setShowNewClient(false);
      setNewClientData({ nombre: '', documento: '', telefono: '', email: '', direccion: '' });
      setClientSearch('');
      setFormError(null);
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo crear el cliente')),
  });

  const handleCreateClient = (e) => {
    e.preventDefault();
    if (!newClientData.nombre || !newClientData.documento) {
      return setFormError('Nombre y documento son obligatorios');
    }
    crearCliente.mutate(newClientData);
  };

  const addItemToCart = (item, type) => {
    const isP = type === 'P';
    
    // Check if already in cart
    const existingIdx = formData.detalles.findIndex(d => isP ? d.productoId === item.id : d.servicioId === item.id);
    
    const stock = Number(item.stock_actual);
    const precio = Number(isP ? item.precio_unitario : item.precio);
    if (existingIdx >= 0) {
      if (isP && formData.detalles[existingIdx].cantidad + 1 > stock) {
        return setFormError(`Stock insuficiente de ${item.nombre_producto}. Solo quedan ${formatCantidad(stock)} ud.`);
      }
      const newDet = [...formData.detalles];
      newDet[existingIdx].cantidad += 1;
      setFormData(prev => ({ ...prev, detalles: newDet }));
    } else {
      setFormData(prev => ({
        ...prev,
        detalles: [...prev.detalles, {
          productoId: isP ? item.id : null,
          servicioId: !isP ? item.id : null,
          nombre: isP ? item.nombre_producto : `(Serv.) ${item.nombre}`,
          cantidad: 1,
          precio_base: precio, // precio de lista
          precio_unitario: precio,
          tipo: type,
          maxStock: isP ? stock : null
        }]
      }));
    }
  };

  const updateCartItemQuantity = (idx, delta) => {
    const newDet = [...formData.detalles];
    const item = newDet[idx];
    const newQ = item.cantidad + delta;
    if (newQ <= 0) {
      removeFromCart(idx);
      return;
    }
    if (item.tipo === 'P' && newQ > item.maxStock) {
       return setFormError(`Límite físico de stock alcanzado (${formatCantidad(item.maxStock)} ud).`);
    }
    item.cantidad = newQ;
    setFormData(prev => ({ ...prev, detalles: newDet }));
  };

  const updateCartItemPrice = (idx, newPrice) => {
    const newDet = [...formData.detalles];
    newDet[idx].precio_unitario = Number(newPrice);
    setFormData(prev => ({ ...prev, detalles: newDet }));
  };
  
  const applyCartItemDiscount = (idx, percent) => {
    const newDet = [...formData.detalles];
    const item = newDet[idx];
    const discountAmount = item.precio_base * (percent / 100);
    item.precio_unitario = item.precio_base - discountAmount;
    setFormData(prev => ({ ...prev, detalles: newDet }));
    setActiveDiscountIdx(null);
  };

  const removeFromCart = (idx) => {
    setFormData(prev => {
      const arr = [...prev.detalles];
      arr.splice(idx, 1);
      return { ...prev, detalles: arr };
    });
    setActiveDiscountIdx(null);
  };

  const getSubtotal = () => formData.detalles.reduce((acc, curr) => acc + (curr.cantidad * curr.precio_unitario), 0);
  const getTotal = () => {
    const sub = getSubtotal();
    return sub - (sub * (globalDiscount / 100));
  };

  const descargarPDF = async (ventaId) => {
    try {
      const { data } = await api.get(`/ventas/${ventaId}`); // incluye Empresa
      generateInvoicePDF(data, data.Empresa || activeEmpresa);
    } catch (err) {
      setFormError(apiError(err, 'No se pudo generar el PDF'));
    }
  };

  const emitirVenta = useMutation({
    mutationFn: (payload) => api.post('/ventas', payload),
    onSuccess: async (res) => {
      invalidar();
      setShowModal(false);
      setFormData({ clienteId: '', detalles: [], forma_pago: '1', medio_pago: '10' });
      setClientSearch('');
      setItemSearch('');
      setGlobalDiscount(0);
      setActiveDiscountIdx(null);
      setFormError(null);
      await descargarPDF(res.data.id); // factura automática
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo facturar la venta')),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.clienteId) return setFormError('Debes seleccionar un cliente para registrar la venta.');
    if (formData.detalles.length === 0) return setFormError('El carrito está vacío.');
    emitirVenta.mutate({
      clienteId: parseInt(formData.clienteId),
      descuento_global: globalDiscount || 0,
      forma_pago: formData.forma_pago,
      medio_pago: formData.medio_pago,
      detalles: formData.detalles.map(d => ({
        productoId: d.productoId,
        servicioId: d.servicioId,
        cantidad: Number(d.cantidad),
        precio_unitario: Number(d.precio_unitario),
        precio_base: Number(d.precio_base || d.precio_unitario),
      })),
    });
  };

  const selectedClient = clientes.find(c => c.id === parseInt(formData.clienteId));

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Registro POS de Ventas"
        description="Caja registradora. Factura rápido filtrando productos o escaneando clientes."
        action={
          <button className="btn-primary gap-2" onClick={() => { setFormData({ clienteId: '', detalles: [], forma_pago: '1', medio_pago: '10' }); setGlobalDiscount(0); setShowNewClient(false); setClientSearch(''); setItemSearch(''); setFormError(null); setShowModal(true); }}>
            <Tag className="w-5 h-5" aria-hidden="true" /> Iniciar POS (Caja)
          </button>
        }
      />

      <TableCard>
        <THead>
          <Th>Ref Caja</Th>
          <Th>Identificación Cliente</Th>
          <Th align="center">Items (Qty)</Th>
          <Th>Fecha Emisión</Th>
          <Th align="right">Monto Facturado</Th>
          <Th align="center">Acción</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={6}
            isLoading={cargandoVentas}
            isError={errorVentas}
            error={errVentas}
            onRetry={recargarVentas}
            isEmpty={ventas.length === 0}
            emptyIcon={Receipt}
            emptyTitle="Sin transacciones en caja"
            emptyHint="Abre la caja con «Iniciar POS»."
          />
          {ventas.map(v => (
            <Tr key={v.id}>
              <Td className="font-mono text-xs text-slate-600 whitespace-nowrap">#FACT-{v.id.toString().padStart(4, '0')}</Td>
              <Td className="font-medium text-slate-800">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true"/>
                  {v.Cliente ? `${v.Cliente.nombre} — ${formatDocumento(v.Cliente.documento)}` : 'Cliente Casual (Sin Identidad)'}
                </div>
              </Td>
              <Td align="center" className="text-slate-600">{v.VentaDetalles?.length || 0}</Td>
              <Td className="text-slate-500 whitespace-nowrap">{new Date(v.fecha).toLocaleString('es-CO')}</Td>
              <Td align="right" className="font-semibold text-slate-800 whitespace-nowrap">{formatCOP(v.total)}</Td>
              <Td align="center">
                <button onClick={() => setViewDetalle(v)} className="btn-icon" aria-label={`Ver detalle de la factura ${v.id}`}>
                  <Eye className="w-5 h-5"/>
                </button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>

      <Modal open={showModal} onClose={() => setShowModal(false)} variant="bare" title="Terminal de venta">
        <div className="xl:p-4">
          <div className="bg-slate-100 xl:rounded-3xl w-full min-h-screen xl:min-h-0 xl:max-w-7xl mx-auto shadow-2xl flex flex-col xl:flex-row overflow-hidden border border-slate-200">
            
            <div className="flex-1 bg-white p-6 xl:p-8 xl:border-r border-slate-200 flex flex-col relative h-[600px] xl:h-[800px]">
               <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                 <h3 className="text-2xl font-semibold text-slate-800 flex items-center gap-2"><ShoppingCart className="text-brand-700" /> Terminal Registradora</h3>
                 <button aria-label="Cerrar terminal de venta" className="xl:hidden p-2 bg-slate-100 rounded-full" onClick={()=>setShowModal(false)}><X className="w-5 h-5"/></button>
               </div>

               <div className="mb-4"><FormError message={formError} onDismiss={() => setFormError(null)} /></div>

               {/* ZONA CLIENTE */}
               <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl mb-6">
                 <div className="flex justify-between items-end mb-3">
                   <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><Users className="w-4 h-4"/> 1. Identificar Cliente <span className="text-red-700">*</span></label>
                   {!showNewClient && <button className="text-xs font-bold text-brand-700 hover:text-brand-800 flex items-center gap-1" onClick={()=>setShowNewClient(true)}><UserPlus className="w-3.5 h-3.5"/> Alta rápida</button>}
                 </div>

                 {showNewClient ? (
                   <form onSubmit={handleCreateClient} className="bg-white p-4 rounded-xl border border-brand-200 shadow-inner mb-2 animate-fade-in relative">
                     <button type="button" aria-label="Cancelar alta rápida" className="absolute top-2 right-2 text-slate-500 hover:text-red-700" onClick={()=>setShowNewClient(false)}><X className="w-4 h-4"/></button>
                     <h4 className="text-xs font-semibold text-brand-700 uppercase mb-3">Creación de Perfil Exprés</h4>
                     <div className="grid grid-cols-2 gap-3 mb-3">
                       <Field label="Razón Social / Nombre" required>
                         <input className="input-field text-sm bg-slate-50" value={newClientData.nombre} onChange={e=>setNewClientData({...newClientData,nombre:e.target.value})} />
                       </Field>
                       <Field label="NIT / Documento" required>
                         <input className="input-field text-sm bg-slate-50" value={newClientData.documento} onChange={e=>setNewClientData({...newClientData,documento:e.target.value})} />
                       </Field>
                     </div>
                     <button type="submit" disabled={crearCliente.isPending} className="btn-primary w-full rounded-lg text-sm py-2">
                       {crearCliente.isPending ? 'Registrando…' : 'Registrar y Seleccionar'}
                     </button>
                   </form>
                 ) : (
                   <div className="relative">
                     {selectedClient ? (
                       <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-3 rounded-xl mb-3">
                         <div className="flex flex-col">
                           <span className="font-bold text-emerald-800 text-sm">{selectedClient.nombre}</span>
                           <span className="text-xs font-semibold text-emerald-700">ID: {formatDocumento(selectedClient.documento)}</span>
                         </div>
                         <button className="p-1.5 bg-white rounded-lg text-emerald-700 hover:bg-red-50 hover:text-red-700 transition-colors shadow-sm" onClick={() => {setFormData({...formData, clienteId:''}); setClientSearch('');}}>
                           <X className="w-4 h-4"/>
                         </button>
                       </div>
                     ) : (
                       <div className="relative mb-3">
                         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-4 w-4 text-slate-500"/></div>
                         <input type="text" className="input-field pl-10" placeholder="Digita 3 letras del nombre o documento..." value={clientSearch} onChange={e => setClientSearch(e.target.value)}/>
                         
                         {filteredClientes.length > 0 && (
                           <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                             {filteredClientes.map(c => (
                               <div key={c.id} className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0" onClick={() => {setFormData({...formData, clienteId: c.id}); setClientSearch('');}}>
                                 <div className="font-bold text-sm text-slate-800">{c.nombre}</div>
                                 <div className="text-xs text-slate-500">Doc: {formatDocumento(c.documento)}</div>
                               </div>
                             ))}
                           </div>
                         )}
                       </div>
                     )}

                     {!selectedClient && topClientes.length > 0 && (
                       <div className="flex flex-wrap gap-2 items-center">
                         <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500">Top Frecuentes:</span>
                         {topClientes.map(c => (
                           <button key={c.id} onClick={() => setFormData({...formData, clienteId: c.id})} className="px-2.5 py-1 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-600 hover:border-brand-400 hover:text-brand-700 transition-colors shadow-sm">{c.nombre}</button>
                         ))}
                       </div>
                     )}
                   </div>
                 )}
               </div>

               {/* ZONA ITEMS (TABS) */}
               <div className="flex-1 flex flex-col min-h-0 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                 <div className="flex border-b border-slate-200 bg-white">
                   <button className={`flex-1 py-3 font-bold text-sm flex items-center justify-center gap-2 transition-colors ${activeTab === 'P' ? 'border-b-2 border-brand-500 text-brand-700' : 'text-slate-500 hover:bg-slate-50'}`} onClick={()=>setActiveTab('P')}>
                     <Box className="w-4 h-4"/> Productos Físicos
                   </button>
                   {modulos.includes('Servicios') && (
                     <button className={`flex-1 py-3 font-bold text-sm flex items-center justify-center gap-2 transition-colors ${activeTab === 'S' ? 'border-b-2 border-brand-500 text-brand-700' : 'text-slate-500 hover:bg-slate-50'}`} onClick={()=>setActiveTab('S')}>
                       <Briefcase className="w-4 h-4"/> Servicios (Asesorías)
                     </button>
                   )}
                 </div>
                 <div className="p-4 border-b border-slate-100 bg-white">
                   <div className="relative">
                     <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-4 w-4 text-slate-500"/></div>
                     <input type="text" className="input-field pl-10 bg-slate-50" placeholder="Localizar ítem en el catálogo..." value={itemSearch} onChange={e=>setItemSearch(e.target.value)}/>
                   </div>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 gap-3 content-start">
                   {displayList.length === 0 ? (
                     <div className="col-span-full py-8 text-center text-slate-500 font-bold text-sm">Sin coincidencias o stock agotado.</div>
                   ) : displayList.map(item => (
                     <div key={item.id} onClick={() => addItemToCart(item, activeTab)} className="bg-white border border-slate-200 rounded-xl p-3 cursor-pointer hover:border-brand-400 hover:shadow-md transition-all active:scale-95 group flex flex-col justify-between">
                       <div>
                         <div className="text-xs font-semibold text-slate-500 mb-1">{activeTab==='P'?item.codigo:'SVC'}</div>
                         <div className="font-bold text-slate-800 text-sm leading-tight mb-2 group-hover:text-brand-700">{activeTab==='P'?item.nombre_producto:item.nombre}</div>
                       </div>
                       <div>
                         <div className="font-semibold text-brand-700">{formatCOP(activeTab==='P'?item.precio_unitario:item.precio)}</div>
                         {activeTab === 'P' && <div className="text-[10px] font-bold text-slate-500 mt-1">Disp: {formatCantidad(item.stock_actual)} ud</div>}
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
            </div>

            {/* PANEL DERECHO: CARRITO */}
            <div className="w-full xl:w-[480px] p-6 xl:p-8 flex flex-col bg-slate-50 h-[600px] xl:h-[800px]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-slate-800 uppercase tracking-wider">Cesta Actual</h3>
                <span className="bg-slate-800 text-white font-bold text-xs px-2 py-1 rounded-lg">{formData.detalles.length} LÍNEAS</span>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-2 custom-scrollbar">
                {formData.detalles.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500">
                    <PackageOpen className="w-16 h-16 mb-4 opacity-20" />
                    <span className="text-sm font-semibold">Agrega ítems cliqueando la grilla.</span>
                  </div>
                ) : formData.detalles.map((d, idx) => (
                  <div key={idx} className={`bg-white p-4 rounded-2xl border border-slate-200 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)] flex flex-col gap-3 relative animate-fade-in ${activeDiscountIdx === idx ? 'z-50 ring-2 ring-brand-300' : 'z-10'}`}>
                    <button type="button" aria-label={`Quitar ${d.nombre} del carrito`} onClick={() => removeFromCart(idx)} className="absolute top-4 right-4 text-slate-500 hover:text-red-700 transition-colors">
                      <Trash2 className="w-4 h-4"/>
                    </button>
                    
                    <div className="pr-6">
                      <div className="font-bold text-slate-800 text-sm mb-1 leading-tight flex items-start gap-1.5">
                        {d.tipo === 'S' && <Briefcase className="w-3.5 h-3.5 mt-0.5 text-brand-500 shrink-0" />} 
                        {d.nombre}
                      </div>
                      <div className="text-xs font-bold text-slate-500">Precio Base: {formatCOP(d.precio_base)}</div>
                    </div>

                    <div className="flex items-center justify-between gap-4 mt-1">
                      {/* Control Qty */}
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-1">
                        <button type="button" aria-label={`Disminuir cantidad de ${d.nombre}`} className="p-1 hover:bg-white rounded text-slate-500 shadow-sm transition-colors" onClick={()=>updateCartItemQuantity(idx, -1)}><Minus className="w-3 h-3"/></button>
                        <span className="w-8 text-center font-bold text-sm text-slate-700">{d.cantidad}</span>
                        <button type="button" aria-label={`Aumentar cantidad de ${d.nombre}`} className="p-1 hover:bg-white rounded text-slate-500 shadow-sm transition-colors" onClick={()=>updateCartItemQuantity(idx, 1)}><Plus className="w-3 h-3"/></button>
                      </div>

                      {/* Control Price / Discount */}
                      <div className="flex flex-1 items-center gap-2">
                        <div className="relative flex-1">
                           <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">$</span>
                           <input type="number" step="0.01" className="w-full pl-6 pr-2 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-xs text-brand-700 focus:ring-brand-500 focus:border-brand-500 outline-none" value={d.precio_unitario} onChange={e=>updateCartItemPrice(idx, e.target.value)} title="Precio Final de Venta" />
                        </div>
                        <div className="relative w-10">
                           <button onClick={() => setActiveDiscountIdx(activeDiscountIdx === idx ? null : idx)} className="flex items-center justify-center w-full h-8 bg-brand-50 text-brand-700 rounded-lg border border-brand-200 hover:bg-brand-100 transition-colors"><Percent className="w-3.5 h-3.5"/></button>
                           
                           {/* Click-based Popover */}
                           {activeDiscountIdx === idx && (
                             <>
                               <div className="fixed inset-0 z-10" onClick={() => setActiveDiscountIdx(null)}></div>
                               <div className="absolute right-0 top-10 bg-slate-800 text-white p-2 rounded-xl text-xs z-20 w-36 shadow-xl animate-fade-in border border-slate-700">
                                 <div className="font-bold mb-2 pt-1 px-1 text-slate-300">Descuento (%)</div>
                                 <div className="grid grid-cols-3 gap-1.5">
                                   {[5,10,15,20,25,50].map(pct => (
                                     <button key={pct} type="button" className="bg-slate-700/80 hover:bg-brand-500 rounded p-1.5 font-bold transition-colors shadow-sm" onClick={()=>applyCartItemDiscount(idx, pct)}>{pct}%</button>
                                   ))}
                                 </div>
                               </div>
                             </>
                           )}
                        </div>
                      </div>
                    </div>
                    {d.precio_unitario !== d.precio_base && (
                      <div className="flex items-center justify-between bg-amber-50 text-amber-800 px-3 py-1.5 rounded-lg text-[10px] font-bold border border-amber-200/50 mt-1">
                        <span className="flex items-center gap-1.5"><Tag className="w-3 h-3"/> Promoción Aplicada</span>
                        <button onClick={()=>updateCartItemPrice(idx, d.precio_base)} className="underline hover:text-amber-900 bg-amber-100 px-2 py-0.5 rounded transition-colors">Restaurar Base</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-6 border-t font-mono border-slate-200">
                <div className="flex flex-col gap-4 mb-4 bg-slate-100 p-4 rounded-xl border border-slate-200">
                  <div className="flex justify-between items-center border-b border-slate-200/60 pb-3">
                     <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">Subtotal:</span>
                     <span className="text-xl font-semibold text-slate-800 tracking-tight">{formatCOP(getSubtotal())}</span>
                  </div>

                  <div className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
                     <div className="flex items-center gap-2">
                       <span className="text-xs font-bold text-brand-700 uppercase flex items-center gap-1.5"><Tag className="w-3.5 h-3.5"/> % Dcto Global</span>
                       <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded p-1">
                         <input type="number" min="0" max="100" className="w-10 text-center text-sm font-semibold text-slate-800 bg-transparent rounded outline-none focus-visible:ring-2 focus-visible:ring-brand-600" value={globalDiscount} onChange={e=>setGlobalDiscount(Number(e.target.value))} />
                         <span className="text-slate-500 font-bold pr-1 text-xs">%</span>
                       </div>
                     </div>
                     <div className="flex gap-1.5">
                       {[5,10,15].map(pct => (
                         <button key={pct} type="button" className={`px-2 py-1 text-xs font-semibold rounded border transition-colors ${globalDiscount === pct ? 'bg-brand-500 text-white border-brand-600' : 'bg-brand-50 border-brand-200 text-brand-700 hover:bg-brand-100'}`} onClick={() => setGlobalDiscount(pct)}>{pct}%</button>
                       ))}
                     </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-slate-200/60 font-sans">
                     <div className="grid grid-cols-2 gap-2">
                       <div>
                         <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Forma de Pago</label>
                         <select className="input-field text-xs font-bold bg-white" value={formData.forma_pago} onChange={e=>setFormData({...formData, forma_pago: e.target.value})}>
                           <option value="1">Contado</option>
                           <option value="2">Crédito</option>
                         </select>
                       </div>
                       <div>
                         <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Medio (DIAN)</label>
                         <select className="input-field text-xs font-bold bg-white" value={formData.medio_pago} onChange={e=>setFormData({...formData, medio_pago: e.target.value})}>
                           <option value="10">Efectivo</option>
                           <option value="42">Consignación Bancaria</option>
                           <option value="48">Tarjeta Crédito</option>
                           <option value="49">Tarjeta Débito</option>
                           <option value="47">Transferencia Débito</option>
                         </select>
                       </div>
                     </div>
                  </div>

                  <div className="flex justify-between items-end pt-2">
                     <span className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1">Pago Total</span>
                     <span className="text-5xl font-semibold text-emerald-700 tracking-tight leading-none drop-shadow-sm">{formatCOP(getTotal())}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-3 font-sans">
                  <button type="button" onClick={handleSubmit} disabled={emitirVenta.isPending} className="btn-primary flex items-center justify-center gap-2 rounded-xl h-14 text-lg shadow-lg shadow-brand-500/30 disabled:opacity-50">
                    <CheckCircle className="w-6 h-6"/> {emitirVenta.isPending ? 'Emitiendo…' : 'Emitir Factura'}
                  </button>
                  <button type="button" className="btn-secondary rounded-xl font-bold h-12" onClick={() => setShowModal(false)}>Cancelar Operación</button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </Modal>

      {/* Ojo: los hijos de <Modal> se evalúan SIEMPRE (son solo argumentos de
          React.createElement), incluso si Modal luego decide no renderizarlos.
          Con `open={!!viewDetalle}` pero el JSX de dentro leyendo
          `viewDetalle.id` sin más, la primera vez que este componente monta
          (viewDetalle === null) React intentaba construir ese árbol y
          reventaba con un TypeError antes de que Modal llegara a ejecutar su
          `if (!open) return null` — la pantalla completa se quedaba en blanco.
          El `{viewDetalle && (...)}` de fuera reproduce el corto-circuito que
          tenía el `createPortal` original: si no hay venta seleccionada, el
          JSX de dentro ni se construye. */}
      {viewDetalle && (
        <Modal open onClose={() => setViewDetalle(null)} variant="bare" title="Detalle de venta">
          <div className="p-4 flex items-center justify-center">
            <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200">
              <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-semibold text-slate-800 flex items-center gap-2"><Receipt className="text-brand-700" /> Detalle de Venta</h3>
                  <p className="text-xs font-bold text-slate-500 font-mono mt-1">#FACT-{viewDetalle.id.toString().padStart(4, '0')} - {new Date(viewDetalle.fecha).toLocaleString('es-CO')}</p>
                </div>
                <button className="p-2 bg-white hover:bg-slate-200 rounded-full transition-colors" onClick={() => setViewDetalle(null)}><X className="w-5 h-5"/></button>
              </div>
              <div className="p-6">
                <div className="mb-6 flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-600 flex items-center gap-2"><Users className="w-4 h-4"/> Cliente:</span>
                  <span className="font-semibold text-slate-800">{viewDetalle.Cliente ? `${viewDetalle.Cliente.nombre} — ${formatDocumento(viewDetalle.Cliente.documento)}` : 'Cliente Casual / Sin Registrar'}</span>
                </div>
                <h4 className="font-bold text-sm text-slate-500 uppercase tracking-widest mb-3">Ítems Facturados</h4>
                <div className="space-y-3 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2">
                   {viewDetalle.VentaDetalles?.map(d => (
                     <div key={d.id} className="flex justify-between items-center p-3 border border-slate-100 rounded-xl bg-white shadow-sm">
                        <div>
                          <div className="font-bold text-sm text-slate-800">{d.Producto?.nombre_producto || d.Servicio?.nombre || 'Ítem Desconocido'}</div>
                          <div className="text-xs font-bold text-slate-500 mt-0.5">{formatCantidad(d.cantidad)} ud x {formatCOP(d.precio_unitario)}</div>
                        </div>
                        <div className="font-semibold text-brand-700 text-sm">{formatCOP(Number(d.cantidad) * Number(d.precio_unitario))}</div>
                     </div>
                   ))}
                   {(!viewDetalle.VentaDetalles || viewDetalle.VentaDetalles.length === 0) && (
                     <p className="text-center text-slate-500 py-4 font-bold text-sm">Esta factura no tiene detalles registrados.</p>
                   )}
                </div>
              </div>
              <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-500 uppercase tracking-widest text-sm">Total Cobrado</span>
                  <span className="font-semibold text-2xl text-emerald-700">{formatCOP(viewDetalle.total)}</span>
                </div>
                <button
                  onClick={() => descargarPDF(viewDetalle.id)}
                  className="btn-primary flex items-center gap-2 rounded-xl px-5 py-3 shadow-lg shadow-brand-500/30 text-sm"
                >
                  <FileDown className="w-5 h-5" /> Descargar Factura PDF
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Ventas;
