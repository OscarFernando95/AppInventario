import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axios';
import { PackageOpen, Users, Plus, ShoppingCart, Trash2, Tag, Search, CheckCircle, Truck, UserPlus, X, Box, Wallet, Eye, Receipt } from 'lucide-react';
import { formatCOP } from '../../utils/format';

const Compras = () => {
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [viewDetalle, setViewDetalle] = useState(null);
  
  const [activeTab, setActiveTab] = useState('P'); // 'P': Productos, 'G': Gastos
  const [provSearch, setProvSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [showNewProv, setShowNewProv] = useState(false);
  const [newProvData, setNewProvData] = useState({ nombre: '', nit: '', contacto: '', telefono: '', email: '', direccion: '' });
  const [showNewProd, setShowNewProd] = useState(false);
  const [newProdData, setNewProdData] = useState({ codigo: '', nombre_producto: '', precio_unitario: '' });
  
  const [formData, setFormData] = useState({ proveedorId: '', detalles: [] });
  const [gastoForm, setGastoForm] = useState({ descripcion: '', cantidad: 1, costo_unitario: '' });

  const fetchData = async () => {
    try {
      const [provRes, prodRes, compRes] = await Promise.all([
        api.get('/proveedores'),
        api.get('/productos'),
        api.get('/compras')
      ]);
      setProveedores(provRes.data);
      setProductos(prodRes.data);
      setCompras(compRes.data);
    } catch (err) { console.error(err); }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial; pendiente migrar a TanStack Query (ver INFORME_REFACTOR Fase 3)
  useEffect(() => { fetchData(); }, []);

  const freq = useMemo(() => {
    const pFreq = {}; const prodFreq = {};
    compras.forEach(c => {
      if (c.proveedorId) pFreq[c.proveedorId] = (pFreq[c.proveedorId] || 0) + 1;
      c.CompraDetalles?.forEach(d => {
        if (d.productoId) prodFreq[d.productoId] = (prodFreq[d.productoId] || 0) + 1;
      });
    });
    return { pFreq, prodFreq };
  }, [compras]);

  const topProveedores = useMemo(() => {
    return [...proveedores].filter(p => freq.pFreq[p.id]).sort((a,b) => freq.pFreq[b.id] - freq.pFreq[a.id]).slice(0, 5);
  }, [proveedores, freq]);

  const matchedProveedores = useMemo(() => {
    if (provSearch.length < 3) return [];
    const low = provSearch.toLowerCase();
    return proveedores.filter(p => (p.nombre || p.razon_social || '').toLowerCase().includes(low) || (p.nit || '').toLowerCase().includes(low)).slice(0, 8);
  }, [proveedores, provSearch]);

  const displayList = useMemo(() => {
    const lower = itemSearch.toLowerCase();
    if (activeTab === 'P') {
      let filtered = productos.filter(p => (p.nombre_producto || '').toLowerCase().includes(lower) || (p.codigo || '').toLowerCase().includes(lower));
      return filtered.sort((a,b) => (freq.prodFreq[b.id] || 0) - (freq.prodFreq[a.id] || 0));
    }
    return [];
  }, [activeTab, itemSearch, productos, freq]);

  const handleCreateProv = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/proveedores', newProvData);
      setProveedores([...proveedores, res.data]);
      setFormData(prev => ({ ...prev, proveedorId: res.data.id }));
      setShowNewProv(false);
      setProvSearch('');
      setNewProvData({ nombre: '', nit: '', contacto: '', telefono: '', email: '', direccion: '' });
    } catch { alert('Sucedió un problema al crear.'); }
  };

  const handleCreateProd = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/productos', newProdData);
      setProductos([...productos, res.data]);
      addItemToCart(res.data, 'P');
      setShowNewProd(false);
      setItemSearch('');
      setNewProdData({ codigo: '', nombre_producto: '', precio_unitario: '' });
    } catch { alert('Sucedió un problema al crear el producto.'); }
  };

  const addItemToCart = (item, type) => {
    const isP = type === 'P';
    if (isP) {
      const existingIdx = formData.detalles.findIndex(d => d.productoId === item.id);
      if (existingIdx >= 0) {
        const newDet = [...formData.detalles];
        newDet[existingIdx].cantidad += 1;
        setFormData(prev => ({ ...prev, detalles: newDet }));
      } else {
        setFormData(prev => ({
          ...prev, detalles: [...prev.detalles, {
            productoId: item.id,
            descripcion_gasto: null,
            nombre: item.nombre_producto,
            cantidad: 1,
            costo_unitario: item.precio_unitario || 0,
            tipo: 'P'
          }]
        }));
      }
    } else {
      if (!gastoForm.descripcion.trim() || gastoForm.cantidad < 1 || Number(gastoForm.costo_unitario) <= 0) {
        return alert("Datos inválidos para el registro del gasto.");
      }
      setFormData(prev => ({
        ...prev, detalles: [...prev.detalles, {
          productoId: null,
          descripcion_gasto: gastoForm.descripcion,
          nombre: `(Gasto) ${gastoForm.descripcion}`,
          cantidad: Number(gastoForm.cantidad),
          costo_unitario: Number(gastoForm.costo_unitario),
          tipo: 'G'
        }]
      }));
      setGastoForm({ descripcion: '', cantidad: 1, costo_unitario: '' });
    }
  };

  const removeFromCart = (idx) => {
    setFormData(prev => {
      const arr = [...prev.detalles];
      arr.splice(idx, 1);
      return { ...prev, detalles: arr };
    });
  };

  const updateCartItem = (idx, field, value) => {
    const newDet = [...formData.detalles];
    newDet[idx][field] = Number(value);
    setFormData(prev => ({ ...prev, detalles: newDet }));
  };

  const getTotal = () => formData.detalles.reduce((acc, curr) => acc + (curr.cantidad * curr.costo_unitario), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.detalles.length === 0) return alert('La cesta está vacía.');
    try {
      await api.post('/compras', { 
        proveedorId: formData.proveedorId ? parseInt(formData.proveedorId) : null,
        total: getTotal(),
        detalles: formData.detalles.map(d => ({ 
          productoId: d.productoId || null, 
          descripcion_gasto: d.descripcion_gasto || null, 
          cantidad: Number(d.cantidad), 
          costo_unitario: Number(d.costo_unitario) 
        }))
      });
      setShowModal(false);
      setFormData({ proveedorId: '', detalles: [] });
      setProvSearch('');
      setItemSearch('');
      fetchData();
    } catch (err) { 
      const errMsg = err.response?.data?.error || err.message || 'Desconocido';
      alert(`Sucedió un problema al registrar ingreso: ${errMsg}`); 
    }
  };

  const selectedProv = proveedores.find(p => p.id === parseInt(formData.proveedorId));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Registro de Ingresos (Compras)</h2>
          <p className="text-slate-500 mt-1">Abastece tu inventario o registra gastos operacionales y salidas.</p>
        </div>
        <button className="btn-primary flex items-center gap-2 shadow-sm" onClick={() => { setFormData({ proveedorId: '', detalles: [] }); setShowNewProv(false); setProvSearch(''); setItemSearch(''); setShowModal(true); setShowNewProd(false); }}>
          <ShoppingCart className="w-5 h-5" /> Iniciar Compra
        </button>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden mt-6">
        <table className="w-full text-left">
          <thead className="bg-slate-50/50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase">Referencia</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase">Proveedor / Beneficiario</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase text-center">Items (Qty)</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase">Fecha Ingreso</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase text-right">Monto Facturado</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase text-center">Acción</th>
            </tr>
          </thead>
          <tbody>
            {compras.length === 0 ? (
              <tr><td colSpan="5" className="text-center py-12 text-slate-400 font-bold">Sin transacciones registradas.</td></tr>
            ) : compras.map(c => (
              <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 font-mono text-xs font-bold text-slate-400">#COMP-{c.id.toString().padStart(4, '0')}</td>
                <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-brand-400"/>
                  {c.Proveedor?.nombre || c.Proveedor?.razon_social || 'Gasto Anónimo / Sin Clasificar'}
                </td>
                <td className="px-6 py-4 font-bold text-slate-500 text-center">{c.CompraDetalles?.length || 0}</td>
                <td className="px-6 py-4 font-medium text-slate-500">{new Date(c.fecha).toLocaleString('es-CO')}</td>
                <td className="px-6 py-4 text-right font-black text-brand-600">
                  {formatCOP(c.total)}
                </td>
                <td className="px-6 py-4 text-center">
                  <button onClick={() => setViewDetalle(c)} className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="Ver Detalle de Compra">
                     <Eye className="w-5 h-5"/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center z-[9999] animate-fade-in xl:p-4 overflow-y-auto">
          <div className="bg-slate-100 xl:rounded-[2rem] w-full min-h-screen xl:min-h-0 xl:max-w-7xl shadow-2xl xl:my-auto flex flex-col xl:flex-row overflow-hidden border border-slate-200">
            
            <div className="flex-1 bg-white p-6 xl:p-8 xl:border-r border-slate-200 flex flex-col relative h-[600px] xl:h-[800px]">
               <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                 <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2"><ShoppingCart className="text-brand-600" /> Terminal Ingresos</h3>
                 <button className="xl:hidden p-2 bg-slate-100 rounded-full" onClick={()=>setShowModal(false)}><X className="w-5 h-5"/></button>
               </div>

               {/* ZONA PROVEEDOR */}
               <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl mb-6">
                 <div className="flex justify-between items-end mb-3">
                   <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><Truck className="w-4 h-4"/> 1. Identificar Proveedor (Opcional)</label>
                   {!showNewProv && <button className="text-xs font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1" onClick={()=>setShowNewProv(true)}><UserPlus className="w-3.5 h-3.5"/> Alta rápida</button>}
                 </div>

                 {showNewProv ? (
                   <form onSubmit={handleCreateProv} className="bg-white p-4 rounded-xl border border-brand-100 shadow-sm animate-fade-in">
                     <div className="flex items-center justify-between mb-3"><h4 className="font-bold text-brand-700 text-sm">Nuevo Proveedor Rápido</h4><button type="button" onClick={()=>setShowNewProv(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button></div>
                     <div className="grid grid-cols-2 gap-3 mb-3">
                       <input required placeholder="Razón Social / Nombre" className="input-field text-sm rounded-lg" value={newProvData.nombre} onChange={e=>setNewProvData({...newProvData, nombre: e.target.value})}/>
                       <input required placeholder="NIT o Documento" className="input-field text-sm rounded-lg" value={newProvData.nit} onChange={e=>setNewProvData({...newProvData, nit: e.target.value})}/>
                     </div>
                     <button type="submit" className="w-full bg-brand-600 text-white font-bold text-sm py-2 rounded-lg hover:bg-brand-700">Guardar y Seleccionar</button>
                   </form>
                 ) : (
                    <>
                      {formData.proveedorId ? (
                        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                          <div>
                            <div className="font-bold text-emerald-800">{selectedProv?.nombre || selectedProv?.razon_social}</div>
                            <div className="text-xs font-bold text-emerald-600">NIT: {selectedProv?.nit || 'N/A'}</div>
                          </div>
                          <button onClick={() => setFormData({...formData, proveedorId: ''})} className="p-1.5 hover:bg-emerald-100 rounded-lg text-emerald-600"><X className="w-4 h-4"/></button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                          <input type="text" placeholder="Buscar proveedor por nombre o documento (min 3 letras)..." className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-brand-500 font-medium placeholder:text-slate-400 outline-none" value={provSearch} onChange={e => setProvSearch(e.target.value)} />
                          
                          {provSearch.length >= 3 && matchedProveedores.length > 0 && (
                             <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                               {matchedProveedores.map(p => (
                                 <button key={p.id} onClick={(e)=>{ e.preventDefault(); setFormData({...formData, proveedorId: p.id}); setProvSearch(''); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex justify-between items-center group">
                                   <div>
                                     <div className="font-bold text-slate-700 text-sm group-hover:text-brand-600">{p.nombre || p.razon_social}</div>
                                     <div className="text-xs text-slate-400 font-mono mt-0.5">{p.nit || 'N/A'}</div>
                                   </div>
                                   <Plus className="w-4 h-4 text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity"/>
                                 </button>
                               ))}
                             </div>
                          )}
                          {provSearch.length === 0 && topProveedores.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center mr-1">Frecuentes:</span>
                              {topProveedores.map(p => (
                                <button key={p.id} onClick={()=>setFormData({...formData, proveedorId: p.id})} className="text-xs font-bold bg-white text-slate-600 px-2.5 py-1 rounded-full border border-slate-200 hover:border-brand-300 hover:text-brand-600 shadow-sm transition-colors">{p.nombre || p.razon_social}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                 )}
               </div>

               {/* ZONA ITEMS */}
               <div className="flex-1 flex flex-col overflow-hidden">
                 <div className="flex border-b border-slate-200 mb-4">
                   <button className={`flex-1 py-3 font-bold text-sm flex items-center justify-center gap-2 transition-colors ${activeTab === 'P' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500 hover:bg-slate-50'}`} onClick={()=>setActiveTab('P')}>
                     <Box className="w-4 h-4"/> Productos a Bodega
                   </button>
                   <button className={`flex-1 py-3 font-bold text-sm flex items-center justify-center gap-2 transition-colors ${activeTab === 'G' ? 'border-b-2 border-brand-500 text-brand-600' : 'text-slate-500 hover:bg-slate-50'}`} onClick={()=>setActiveTab('G')}>
                     <Wallet className="w-4 h-4"/> Gastos / Insumos Ad-Hoc
                   </button>
                 </div>

                 {activeTab === 'P' && (
                   <div className="relative mb-4">
                     <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                     <input type="text" placeholder="Filtrar catálogo..." className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-brand-500 font-medium outline-none transition-shadow" value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
                   </div>
                 )}

                 <div className="flex-1 overflow-y-auto pr-2 pb-12 custom-scrollbar">
                   {activeTab === 'P' ? (
                     !showNewProd ? (
                       <>
                         <div className="flex justify-end mb-4 pr-1">
                           <button onClick={() => setShowNewProd(true)} className="text-sm font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1.5 bg-brand-50 px-3 py-1.5 rounded-lg"><Plus className="w-4 h-4"/> Nuevo Artículo</button>
                         </div>
                         <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pb-8">
                           {displayList.map(item => (
                             <div key={item.id} onClick={() => addItemToCart(item, activeTab)} className="group bg-white border border-slate-200 p-3 rounded-2xl cursor-pointer hover:border-brand-400 hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between min-h-[100px]">
                               <div className="absolute top-0 right-0 w-16 h-16 bg-brand-50 rounded-bl-[100px] -z-0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                               <h5 className="font-bold text-slate-800 text-sm leading-tight z-10 relative pr-4">{item.nombre_producto}</h5>
                               <div className="flex justify-between items-end mt-2 z-10 relative">
                                 <div className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md self-start">{formatCOP(item.precio_unitario)}</div>
                                 <div className="text-[10px] font-bold text-slate-400 text-right">Stock: {item.stock_actual} ud</div>
                               </div>
                             </div>
                           ))}
                         </div>
                       </>
                     ) : (
                       <form onSubmit={handleCreateProd} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                         <h5 className="font-bold text-slate-700 text-sm flex items-center gap-2"><Box className="w-4 h-4 text-brand-500"/> Registro Rápido de Artículo</h5>
                         <div className="grid grid-cols-2 gap-3">
                            <input required type="text" value={newProdData.codigo} onChange={e => setNewProdData({...newProdData, codigo: e.target.value})} placeholder="Código o Referencia" className="col-span-2 px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-brand-500 outline-none font-medium text-sm" />
                            <input required type="text" value={newProdData.nombre_producto} onChange={e => setNewProdData({...newProdData, nombre_producto: e.target.value})} placeholder="Nombre completo del producto" className="col-span-2 px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-brand-500 outline-none font-medium text-sm" />
                            <input required type="number" value={newProdData.precio_unitario} onChange={e => setNewProdData({...newProdData, precio_unitario: e.target.value})} placeholder="Costo Unitario Base" className="col-span-2 px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-brand-500 outline-none font-medium text-sm" />
                         </div>
                         <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                           <button type="button" onClick={() => setShowNewProd(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                           <button type="submit" className="px-4 py-2 text-sm font-bold bg-brand-600 text-white rounded-lg shadow-md hover:bg-brand-700 transition-colors">Crear y Añadir</button>
                         </div>
                       </form>
                     )
                   ) : (
                     <div className="p-4 border border-brand-100 bg-brand-50/30 rounded-2xl flex flex-col gap-4">
                       <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2">Registrar Nuevo Gasto</h4>
                       <input type="text" placeholder="Descripción del gasto (Ej: Pago Nómina, Transporte)" className="input-field rounded-xl bg-white" value={gastoForm.descripcion} onChange={e => setGastoForm({...gastoForm, descripcion: e.target.value})}/>
                       <div className="grid grid-cols-2 gap-3">
                         <div>
                            <label className="text-xs font-bold text-slate-500 ml-1">Cantidad</label>
                            <input type="number" min="1" className="input-field rounded-xl bg-white mt-1" value={gastoForm.cantidad} onChange={e => setGastoForm({...gastoForm, cantidad: e.target.value})}/>
                         </div>
                         <div>
                            <label className="text-xs font-bold text-slate-500 ml-1">Costo Unitario ($)</label>
                            <input type="number" step="0.01" className="input-field rounded-xl bg-white mt-1" placeholder="$ 0.00" value={gastoForm.costo_unitario} onChange={e => setGastoForm({...gastoForm, costo_unitario: e.target.value})}/>
                         </div>
                       </div>
                       <button type="button" onClick={() => addItemToCart(null, 'G')} className="btn-primary py-3 rounded-xl shadow-sm mt-2 flex justify-center items-center gap-2"><Plus className="w-5 h-5"/> Agregar a la Cesta</button>
                     </div>
                   )}
                 </div>
               </div>
            </div>

            {/* CARRITO */}
            <div className="w-full xl:w-[420px] bg-slate-50 xl:border-l border-slate-200 flex flex-col h-[600px] xl:h-[800px]">
              <div className="p-6 bg-slate-800 text-white shadow-md z-10 hidden xl:block">
                <h3 className="text-lg font-black uppercase tracking-widest flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-brand-400"/> Cesta Actual</h3>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3 relative custom-scrollbar">
                {formData.detalles.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                    <PackageOpen className="w-16 h-16 mb-4 opacity-20" />
                    <span className="text-sm font-semibold">Agrega ítems cliqueando la grilla.</span>
                  </div>
                ) : formData.detalles.map((d, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)] flex flex-col gap-3 relative animate-fade-in z-10">
                    <button type="button" onClick={() => removeFromCart(idx)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4"/>
                    </button>
                    <div>
                      <div className="font-bold text-slate-800 text-sm pr-6 leading-tight flex items-center gap-1.5">
                        {d.tipo === 'G' && <Wallet className="w-3.5 h-3.5 text-orange-500 translate-y-[-1px]"/>}
                        {d.nombre}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">{d.tipo === 'P' ? 'PRODUCTO INVENTARIABLE' : 'MOVIMIENTO OPERACIONAL'}</div>
                    </div>
                    
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 overflow-hidden w-24 shrink-0">
                        <button type="button" className="px-2.5 py-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 font-bold" onClick={()=>updateCartItem(idx, 'cantidad', Math.max(1, d.cantidad - 1))}>−</button>
                        <input type="number" min="1" className="w-full text-center font-bold text-sm bg-transparent outline-none p-0" value={d.cantidad} onChange={e=>updateCartItem(idx, 'cantidad', e.target.value)} />
                        <button type="button" className="px-2.5 py-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 font-bold" onClick={()=>updateCartItem(idx, 'cantidad', d.cantidad + 1)}>+</button>
                      </div>
                      <div className="flex flex-1 items-center gap-2">
                        <div className="relative flex-1">
                           <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                           <input type="number" step="0.01" className="w-full pl-6 pr-2 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-xs text-emerald-700 focus:ring-emerald-500 focus:border-emerald-500 outline-none" value={d.costo_unitario} onChange={e=>updateCartItem(idx, 'costo_unitario', e.target.value)} title="Costo Unitario Facturado" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-6 bg-white border-t border-slate-200 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)] z-10">
                <div className="flex flex-col gap-1 mb-4">
                     <span className="text-sm font-bold text-slate-500 uppercase tracking-widest text-right">Egresos Totales</span>
                     <span className="text-4xl font-black text-emerald-600 tracking-tight leading-none drop-shadow-sm text-right">{formatCOP(getTotal())}</span>
                </div>
                <div className="flex flex-col gap-3 font-sans">
                  <button type="button" onClick={handleSubmit} className="btn-primary bg-emerald-600 hover:bg-emerald-700 ring-emerald-500 flex items-center justify-center gap-2 rounded-xl h-12 text-lg shadow-lg shadow-emerald-500/30">
                    <CheckCircle className="w-5 h-5"/> Procesar e Ingresar
                  </button>
                  <button type="button" className="btn-secondary rounded-xl font-bold h-12" onClick={() => setShowModal(false)}>Cancelar Operación</button>
                </div>
              </div>

            </div>
          </div>
        </div>,
        document.body
      )}

      {viewDetalle && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fade-in p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><Receipt className="text-brand-600" /> Detalle de Compra</h3>
                <p className="text-xs font-bold text-slate-400 font-mono mt-1">#COMP-{viewDetalle.id.toString().padStart(4, '0')} - {new Date(viewDetalle.fecha).toLocaleString('es-CO')}</p>
              </div>
              <button className="p-2 bg-white hover:bg-slate-200 rounded-full transition-colors" onClick={() => setViewDetalle(null)}><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6">
              <div className="mb-6 flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-600 flex items-center gap-2"><Truck className="w-4 h-4"/> Proveedor:</span>
                <span className="font-black text-slate-800">{viewDetalle.Proveedor?.nombre || viewDetalle.Proveedor?.razon_social || 'Gasto Anónimo / Sin Clasificar'}</span>
              </div>
              <h4 className="font-bold text-sm text-slate-400 uppercase tracking-widest mb-3">Ítems Ingresados</h4>
              <div className="space-y-3 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2">
                 {viewDetalle.CompraDetalles?.map(d => (
                   <div key={d.id} className="flex justify-between items-center p-3 border border-slate-100 rounded-xl bg-white shadow-sm">
                      <div>
                        <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                          {d.descripcion_gasto ? <Wallet className="w-3.5 h-3.5 text-orange-500"/> : <Box className="w-3.5 h-3.5 text-brand-500"/>}
                          {d.Producto?.nombre_producto || `(Gasto) ${d.descripcion_gasto}`}
                        </div>
                        <div className="text-xs font-bold text-slate-500 mt-0.5">{d.cantidad} ud x {formatCOP(d.costo_unitario)}</div>
                      </div>
                      <div className="font-black text-brand-600 text-sm">{formatCOP(d.cantidad * d.costo_unitario)}</div>
                   </div>
                 ))}
                 {(!viewDetalle.CompraDetalles || viewDetalle.CompraDetalles.length === 0) && (
                   <p className="text-center text-slate-400 py-4 font-bold text-sm">Este ingreso no tiene detalles registrados.</p>
                 )}
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <span className="font-black text-slate-500 uppercase tracking-widest text-sm">Total Facturado</span>
              <span className="font-black text-2xl text-emerald-600">{formatCOP(viewDetalle.total)}</span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Compras;
