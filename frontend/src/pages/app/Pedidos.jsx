import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axios';
import { PackageOpen, Users, Plus, ShoppingCart, Trash2, Search, CheckCircle, Truck, UserPlus, X, Box, Printer, FileText, Download } from 'lucide-react';
import { formatCOP } from '../../utils/format';

const Pedidos = () => {
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  
  const [showModal, setShowModal] = useState(false); // Modal para Crear Pedido
  const [viewDetalle, setViewDetalle] = useState(null); // Modal Ver PDF / Completado
  const [checkInPedido, setCheckInPedido] = useState(null); // Modal para Recibir (Check-in)
  
  const [provSearch, setProvSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [showNewProv, setShowNewProv] = useState(false);
  const [showNewProd, setShowNewProd] = useState(false);
  
  const [formData, setFormData] = useState({ proveedorId: '', detalles: [] });
  const [newProvData, setNewProvData] = useState({ nombre: '', nit: '', contacto: '', telefono: '', email: '', direccion: '' });
  const [newProdData, setNewProdData] = useState({ codigo: '', nombre_producto: '', precio_unitario: '' });
  
  const [checkInDetalles, setCheckInDetalles] = useState([]);

  const fetchData = async () => {
    try {
      const [provRes, prodRes, pedRes] = await Promise.all([
        api.get('/proveedores'),
        api.get('/productos'),
        api.get('/pedidos')
      ]);
      setProveedores(provRes.data);
      setProductos(prodRes.data);
      setPedidos(pedRes.data);
    } catch (err) { console.error(err); }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial; pendiente migrar a TanStack Query (ver INFORME_REFACTOR Fase 3)
  useEffect(() => { fetchData(); }, []);

  // Compute Frequencies
  const freq = useMemo(() => {
    const provFreq = {}; const prodFreq = {};
    pedidos.forEach(p => {
      if (p.proveedorId) provFreq[p.proveedorId] = (provFreq[p.proveedorId] || 0) + 1;
      p.PedidoDetalles?.forEach(det => {
        if (det.productoId) prodFreq[det.productoId] = (prodFreq[det.productoId] || 0) + det.cantidad_pedida;
      });
    });
    return { provFreq, prodFreq };
  }, [pedidos]);

  const topProveedores = useMemo(() => {
    return [...proveedores].sort((a,b) => (freq.provFreq[b.id] || 0) - (freq.provFreq[a.id] || 0)).slice(0, 5);
  }, [proveedores, freq.provFreq]);

  const matchedProveedores = useMemo(() => {
    if (provSearch.trim().length < 3) return [];
    const lower = provSearch.toLowerCase();
    return proveedores.filter(p => (p.nombre || '').toLowerCase().includes(lower) || (p.nit || '').toLowerCase().includes(lower) || (p.razon_social || '').toLowerCase().includes(lower));
  }, [provSearch, proveedores]);

  const displayList = useMemo(() => {
    const lower = itemSearch.toLowerCase();
    let filtered = productos.filter(p => (p.nombre_producto || '').toLowerCase().includes(lower) || (p.codigo || '').toLowerCase().includes(lower));
    return filtered.sort((a,b) => (freq.prodFreq[b.id] || 0) - (freq.prodFreq[a.id] || 0));
  }, [itemSearch, productos, freq]);

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
      addItemToCart(res.data);
      setShowNewProd(false);
      setItemSearch('');
      setNewProdData({ codigo: '', nombre_producto: '', precio_unitario: '' });
    } catch { alert('Sucedió un problema al crear el producto.'); }
  };

  const addItemToCart = (item) => {
    const existingIdx = formData.detalles.findIndex(d => d.productoId === item.id);
    if (existingIdx >= 0) {
      const newDet = [...formData.detalles];
      newDet[existingIdx].cantidad_pedida += 1;
      setFormData(prev => ({ ...prev, detalles: newDet }));
    } else {
      setFormData(prev => ({
        ...prev, detalles: [...prev.detalles, {
          productoId: item.id,
          nombre: item.nombre_producto,
          cantidad_pedida: 1,
          costo_estimado: item.precio_unitario || 0
        }]
      }));
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

  const getTotal = () => formData.detalles.reduce((acc, curr) => acc + (curr.cantidad_pedida * curr.costo_estimado), 0);

  const handleSubmitPedido = async (e) => {
    e.preventDefault();
    if (!formData.proveedorId) return alert('Debes seleccionar un proveedor.');
    if (formData.detalles.length === 0) return alert('El pedido está vacío.');
    try {
      await api.post('/pedidos', { 
        proveedorId: parseInt(formData.proveedorId),
        detalles: formData.detalles.map(d => ({ 
          productoId: d.productoId,
          cantidad_pedida: d.cantidad_pedida, 
          costo_estimado: d.costo_estimado 
        }))
      });
      setShowModal(false);
      setFormData({ proveedorId: '', detalles: [] });
      setProvSearch('');
      setItemSearch('');
      fetchData();
    } catch {
      alert("Sucedió un problema al generar el pedido.");
    }
  };

  // CHECK IN LOGIC
  const openCheckIn = (pedido) => {
    setCheckInDetalles(pedido.PedidoDetalles.map(d => ({
      id: d.id,
      productoId: d.productoId,
      nombre: d.Producto?.nombre_producto,
      cantidad_pedida: d.cantidad_pedida,
      cantidad_llegada: d.cantidad_pedida,
      costo_estimado: d.costo_estimado
    })));
    setCheckInPedido(pedido);
  };

  const updateCheckInItem = (idx, field, value) => {
    const newDet = [...checkInDetalles];
    newDet[idx][field] = Number(value);
    setCheckInDetalles(newDet);
  };

  const submitCheckIn = async () => {
    try {
      await api.post(`/pedidos/${checkInPedido.id}/checkin`, {
        detalles_recibidos: checkInDetalles.map(d => ({
          productoId: d.productoId,
          cantidad: d.cantidad_llegada,
          costo_unitario: d.costo_estimado
        }))
      });
      setCheckInPedido(null);
      fetchData();
      alert('¡Recepción completada! El pedido se transformó en una compra y el stock fue sumado a la bodega.');
    } catch {
      alert("Error en la recepción del pedido.");
    }
  };

  const selectedProv = proveedores.find(p => p.id === parseInt(formData.proveedorId));

  return (
    <div className="space-y-6 animate-fade-in print:hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Registro de Órdenes de Pedido</h2>
          <p className="text-slate-500 mt-1">Genera PDFs, solicita productos a proveedores y valídalos al recibirlos.</p>
        </div>
        <button className="btn-primary flex items-center gap-2 shadow-sm" onClick={() => { setFormData({ proveedorId: '', detalles: [] }); setShowNewProv(false); setProvSearch(''); setItemSearch(''); setShowModal(true); }}>
          <FileText className="w-5 h-5" /> Nueva Orden
        </button>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden mt-6">
        <table className="w-full text-left">
          <thead className="bg-slate-50/50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase">Orden #</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase">Proveedor</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase">Fecha y Estado</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase text-right">Monto Estimado</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 tracking-wider uppercase text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.length === 0 ? (
              <tr><td colSpan="5" className="text-center py-12 text-slate-400 font-bold">Sin órdenes registradas.</td></tr>
            ) : pedidos.map(p => (
              <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 font-mono text-xs font-bold text-slate-400">#ORD-{p.id.toString().padStart(4, '0')}</td>
                <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-brand-400"/>
                  {p.Proveedor?.nombre || p.Proveedor?.razon_social || 'Proveedor Desconocido'}
                </td>
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-500 mb-1">{new Date(p.fecha_pedido).toLocaleDateString()}</div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase ${p.estado === 'PENDIENTE' ? 'bg-amber-100 text-amber-700' : p.estado === 'COMPLETADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {p.estado}
                  </span>
                </td>
                <td className="px-6 py-4 text-right font-black text-brand-600">
                  {formatCOP(p.total_estimado)}
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => setViewDetalle(p)} className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="Ver / Imprimir Orden">
                       <Printer className="w-5 h-5"/>
                    </button>
                    {p.estado === 'PENDIENTE' && (
                      <button onClick={() => openCheckIn(p)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Recibir Mercancía (Check-in)">
                         <Download className="w-5 h-5"/>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal CREAR PEDIDO */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-end z-[9999] animate-fade-in print:hidden">
          <div className="bg-slate-50 w-full max-w-5xl h-full shadow-2xl flex flex-col animate-slide-in-right overflow-hidden">
            <div className="px-8 py-6 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
              <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                <FileText className="text-brand-600 w-7 h-7" /> Nueva Orden de Compra
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-2 rounded-full transition-colors"><X className="w-6 h-6"/></button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              <div className="w-1/2 p-6 overflow-y-auto custom-scrollbar border-r border-slate-200">
                <div className="mb-6">
                  <h4 className="font-bold text-sm text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Truck className="w-4 h-4"/> 1. Selección de Proveedor</h4>
                  {!showNewProv ? (
                    <div className="space-y-4">
                      {topProveedores.length > 0 && <div className="flex flex-wrap gap-2 mb-2"><span className="text-xs font-bold text-slate-400 py-1">Frecuentes:</span>{topProveedores.map(p => (<button key={p.id} onClick={() => setFormData({ ...formData, proveedorId: p.id })} className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${formData.proveedorId === p.id ? 'bg-brand-600 text-white shadow-md' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>{p.nombre || p.razon_social}</button>))}</div>}
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <input type="text" placeholder="Buscar proveedor (Mínimo 3 letras)..." value={provSearch} onChange={(e) => setProvSearch(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-200 rounded-2xl focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 font-medium text-slate-700 transition-all outline-none placeholder:text-slate-400" />
                      </div>
                      {matchedProveedores.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
                          {matchedProveedores.map(p => (
                            <button key={p.id} onClick={() => { setFormData(prev => ({ ...prev, proveedorId: p.id })); setProvSearch(''); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 font-bold text-slate-700 flex flex-col gap-1 transition-colors">
                              <span>{p.nombre || p.razon_social}</span><span className="text-xs text-slate-400 font-mono">NIT: {p.nit || 'N/A'}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-start">
                        <button onClick={() => setShowNewProv(true)} className="text-sm font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1.5 bg-brand-50 px-3 py-1.5 rounded-lg"><UserPlus className="w-4 h-4"/> Nuevo Proveedor</button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleCreateProv} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                         <input required type="text" value={newProvData.nombre} onChange={e => setNewProvData({...newProvData, nombre: e.target.value})} placeholder="Nombre Comercial/Razón Social" className="col-span-2 px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-brand-500 outline-none font-medium" />
                         <input required type="text" value={newProvData.nit} onChange={e => setNewProvData({...newProvData, nit: e.target.value})} placeholder="NIT/Documento" className="col-span-2 px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-brand-500 outline-none font-medium" />
                      </div>
                      <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                        <button type="button" onClick={() => setShowNewProv(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Cancelar</button>
                        <button type="submit" className="px-4 py-2 text-sm font-bold bg-brand-600 text-white rounded-lg shadow-md hover:bg-brand-700">Crear y Seleccionar</button>
                      </div>
                    </form>
                  )}
                </div>

                <div>
                  <h4 className="font-bold text-sm text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Box className="w-4 h-4"/> 2. Catálogo de Artículos</h4>
                  <div className="relative mb-4">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <input type="text" placeholder="Buscar producto a pedir..." value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-200 rounded-2xl focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 font-medium text-slate-700 transition-all outline-none placeholder:text-slate-400" />
                  </div>
                  
                  {!showNewProd ? (
                    <>
                      <div className="flex justify-end mb-4">
                        <button onClick={() => setShowNewProd(true)} className="text-sm font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1.5 bg-brand-50 px-3 py-1.5 rounded-lg"><Plus className="w-4 h-4"/> Nuevo Artículo</button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {displayList.map(p => (
                          <button key={p.id} onClick={() => addItemToCart(p)} className="text-left bg-white p-4 rounded-2xl border-2 border-slate-100 hover:border-brand-300 hover:shadow-md transition-all group flex flex-col justify-between h-28">
                            <div>
                              <p className="font-black text-slate-800 text-sm leading-tight group-hover:text-brand-700 transition-colors line-clamp-2">{p.nombre_producto}</p>
                              <p className="text-xs font-mono text-slate-400 mt-1">{p.codigo}</p>
                            </div>
                            <div className="font-black text-brand-600 text-sm self-end">{formatCOP(p.precio_unitario)}</div>
                          </button>
                        ))}
                        {displayList.length === 0 && <div className="col-span-2 py-8 text-center text-slate-400 font-bold bg-white rounded-2xl border-2 border-dashed border-slate-200">No hay productos locales.</div>}
                      </div>
                    </>
                  ) : (
                    <form onSubmit={handleCreateProd} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                      <h5 className="font-bold text-slate-700 text-sm flex items-center gap-2"><Box className="w-4 h-4 text-brand-500"/> Registro Rápido de Artículo</h5>
                      <div className="grid grid-cols-2 gap-3">
                         <input required type="text" value={newProdData.codigo} onChange={e => setNewProdData({...newProdData, codigo: e.target.value})} placeholder="Código o Referencia" className="col-span-2 px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-brand-500 outline-none font-medium text-sm" />
                         <input required type="text" value={newProdData.nombre_producto} onChange={e => setNewProdData({...newProdData, nombre_producto: e.target.value})} placeholder="Nombre completo del producto" className="col-span-2 px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-brand-500 outline-none font-medium text-sm" />
                         <input required type="number" value={newProdData.precio_unitario} onChange={e => setNewProdData({...newProdData, precio_unitario: e.target.value})} placeholder="Costo Estimado" className="col-span-2 px-4 py-2 border-2 border-slate-200 rounded-xl focus:border-brand-500 outline-none font-medium text-sm" />
                      </div>
                      <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                        <button type="button" onClick={() => setShowNewProd(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                        <button type="submit" className="px-4 py-2 text-sm font-bold bg-brand-600 text-white rounded-lg shadow-md hover:bg-brand-700 transition-colors">Crear y Añadir</button>
                      </div>
                    </form>
                  )}
                </div>
              </div>

              <div className="w-1/2 bg-slate-50 flex flex-col">
                <div className="p-6 bg-slate-100 border-b border-slate-200 text-center">
                   <h4 className="font-black text-slate-800 text-lg">Resumen de la Orden</h4>
                   <p className="text-sm font-bold text-brand-600 mt-1">{selectedProv?.nombre || selectedProv?.razon_social || 'Ningún proveedor seleccionado'}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                  {formData.detalles.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                      <ShoppingCart className="w-12 h-12 opacity-20" />
                      <p className="font-bold">El carrito está vacío</p>
                    </div>
                  ) : formData.detalles.map((d, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4 relative overflow-hidden group">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-500"></div>
                      <div className="flex-1">
                        <p className="font-black text-slate-800 line-clamp-1 text-sm">{d.nombre}</p>
                        <div className="flex gap-4 mt-2">
                           <div><span className="text-[10px] uppercase tracking-wider font-black text-slate-400 block mb-0.5">Cant Pedida</span><input type="number" min="1" value={d.cantidad_pedida} onChange={(e) => updateCartItem(idx, 'cantidad_pedida', e.target.value)} className="w-16 px-2 py-1 text-sm font-bold border-2 border-slate-100 rounded-lg text-center focus:border-brand-500 outline-none"/></div>
                           <div><span className="text-[10px] uppercase tracking-wider font-black text-slate-400 block mb-0.5">Costo Ud.</span><input type="number" min="0" value={d.costo_estimado} onChange={(e) => updateCartItem(idx, 'costo_estimado', e.target.value)} className="w-24 px-2 py-1 text-sm font-bold border-2 border-slate-100 rounded-lg focus:border-brand-500 outline-none"/></div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-brand-600 mb-2">{formatCOP(d.cantidad_pedida * d.costo_estimado)}</p>
                        <button onClick={() => removeFromCart(idx)} className="p-1.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-6 bg-white border-t border-slate-200 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)] z-10">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-sm font-black text-slate-500 uppercase tracking-widest">Estimado Total</span>
                    <span className="text-4xl font-black text-emerald-600 tracking-tight">{formatCOP(getTotal())}</span>
                  </div>
                  <button onClick={handleSubmitPedido} className="w-full btn-primary py-4 text-lg font-bold shadow-xl shadow-brand-500/30 flex items-center justify-center gap-2">
                    <CheckCircle className="w-6 h-6" /> Procesar Orden de Compra
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* CHECK-IN MODAL */}
      {checkInPedido && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fade-in p-4 print:hidden">
          <div className="bg-white rounded-[2rem] w-full max-w-4xl shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-6 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-emerald-800 flex items-center gap-2"><Download className="text-emerald-600" /> Recepción de Pedido</h3>
                <p className="text-xs font-bold text-emerald-600/70 uppercase tracking-widest mt-1">Ingreso a Bodega</p>
              </div>
              <button className="p-2 bg-white hover:bg-emerald-100 hover:text-emerald-800 rounded-full transition-colors text-emerald-600" onClick={() => setCheckInPedido(null)}><X className="w-5 h-5"/></button>
            </div>
            
            <div className="p-8">
               <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 flex justify-between">
                  <p className="font-bold text-slate-600">Confirma la cantidad recibida de cada ítem.</p>
                  <p className="text-sm text-slate-500 max-w-sm text-right">Si algo no llegó, pon 0. Modificar cantidades aquí las inyectará de forma certera al inventario y cerrará esta orden para siempre.</p>
               </div>
               
               <table className="w-full text-left mb-6">
                  <thead className="border-b-2 border-slate-200">
                      <tr>
                        <th className="py-3 text-sm text-slate-400 uppercase">Producto</th>
                        <th className="py-3 text-sm text-slate-400 uppercase text-center">Esperado</th>
                        <th className="py-3 text-sm text-brand-600 font-bold uppercase text-center w-40">Recibido Real</th>
                        <th className="py-3 text-sm text-slate-400 uppercase text-right w-32">Costo U.</th>
                      </tr>
                  </thead>
                  <tbody>
                      {checkInDetalles.map((d, idx) => (
                         <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            <td className="py-4 font-bold text-slate-800">{d.nombre}</td>
                            <td className="py-4 text-center font-bold text-slate-500">{d.cantidad_pedida}</td>
                            <td className="py-4 text-center">
                              <input type="number" min="0" value={d.cantidad_llegada} onChange={(e) => updateCheckInItem(idx, 'cantidad_llegada', e.target.value)} className="w-full max-w-[100px] text-center px-3 py-2 border-2 border-brand-200 focus:border-brand-500 rounded-xl font-black text-brand-700 bg-brand-50 outline-none transition-all"/>
                            </td>
                            <td className="py-4 text-right">
                              <input type="number" min="0" value={d.costo_estimado} onChange={(e) => updateCheckInItem(idx, 'costo_estimado', e.target.value)} className="w-full text-right px-2 py-1 border border-slate-200 rounded-lg text-sm font-bold text-slate-600"/>
                            </td>
                         </tr>
                      ))}
                  </tbody>
               </table>
               
               <div className="flex justify-end pt-4 border-t border-slate-200">
                  <button onClick={submitCheckIn} className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-[0_8px_20px_-8px_rgba(5,150,105,0.6)] flex items-center gap-2 transition-transform active:scale-95">
                    <CheckCircle className="w-5 h-5"/> Confirmar Check-in y Abonar Stock
                  </button>
               </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL PRINT PDF / VER DETALLE */}
      {viewDetalle && createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[10000] animate-fade-in p-8">
          <div className="bg-slate-100 w-full max-w-3xl max-h-full flex flex-col rounded-3xl overflow-hidden shadow-2xl print:bg-white print:m-0 print:p-0 print:rounded-none print:shadow-none print:w-full">
            <div className="p-4 bg-slate-800 text-slate-300 flex justify-between items-center print:hidden border-b border-slate-700">
               <span className="font-bold text-sm tracking-widest uppercase">Visualizador de Documento</span>
               <div className="flex gap-2">
                 <button onClick={() => window.print()} className="px-4 py-2 bg-brand-600 text-white rounded-lg font-bold hover:bg-brand-500 flex items-center gap-2 transition-colors"><Printer className="w-4 h-4"/> Imprimir PDF</button>
                 <button className="p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-400" onClick={() => setViewDetalle(null)}><X className="w-5 h-5"/></button>
               </div>
            </div>

            {/* PRINTABLE AREA */}
            <div className="flex-1 overflow-auto bg-slate-100 p-8 print:p-0 print:overflow-visible custom-scrollbar">
               <div className="bg-white rounded-none md:rounded-xl shadow-sm border border-slate-200 p-10 print:border-none print:shadow-none max-w-[800px] mx-auto min-h-[1056px] print:min-h-0 text-slate-800">
                  <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
                     <div>
                       <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-900">Orden de Compra</h1>
                       <p className="text-sm font-bold text-slate-500 mt-2">Documento NO Válido como Factura</p>
                     </div>
                     <div className="text-right">
                        <p className="font-mono text-xl font-bold text-brand-600">#ORD-{viewDetalle.id.toString().padStart(4, '0')}</p>
                        <p className="text-sm font-bold text-slate-600 mt-1">{new Date(viewDetalle.fecha_pedido).toLocaleDateString()}</p>
                     </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-8 mb-10">
                     <div>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Comprador (Nuestra Empresa)</p>
                        <p className="font-bold text-lg text-slate-800">AppInventario Corp.</p>
                        <p className="text-sm text-slate-600 mt-1">Generado vía Sistema Administrativo</p>
                     </div>
                     <div>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Proveedor / Vendedor</p>
                        <p className="font-bold text-lg text-slate-800">{viewDetalle.Proveedor?.nombre || viewDetalle.Proveedor?.razon_social}</p>
                        <p className="text-sm text-slate-600 mt-1 font-mono">NIT: {viewDetalle.Proveedor?.nit || 'N/A'}</p>
                        <p className="text-sm text-slate-600 mt-1">{viewDetalle.Proveedor?.contacto}</p>
                     </div>
                  </div>

                  <table className="w-full text-left border-collapse mb-10">
                     <thead>
                        <tr className="bg-slate-800 text-white">
                           <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider w-12 text-center">#</th>
                           <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider">Concepto</th>
                           <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-center w-24">Cant</th>
                           <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-right w-32">V. Unit</th>
                           <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-right w-32">V. Total</th>
                        </tr>
                     </thead>
                     <tbody>
                        {viewDetalle.PedidoDetalles?.map((d, index) => (
                           <tr key={index} className="border-b border-slate-200">
                             <td className="py-4 px-4 text-center font-mono text-sm text-slate-500">{index + 1}</td>
                             <td className="py-4 px-4 font-bold text-slate-700">{d.Producto?.nombre_producto || 'Producto Desconocido'}</td>
                             <td className="py-4 px-4 text-center font-bold text-slate-600">{d.cantidad_pedida}</td>
                             <td className="py-4 px-4 text-right font-mono text-sm text-slate-600">{formatCOP(d.costo_estimado)}</td>
                             <td className="py-4 px-4 text-right font-mono text-sm font-bold text-slate-800">{formatCOP(d.cantidad_pedida * d.costo_estimado)}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>

                  <div className="flex justify-end mt-8">
                     <div className="w-64 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Total Estimado</p>
                        <p className="text-3xl font-black text-brand-600 tracking-tight">{formatCOP(viewDetalle.total_estimado)}</p>
                     </div>
                  </div>

                  <div className="mt-24 border-t-2 border-slate-200 pt-8 text-center text-xs font-bold text-slate-400">
                     <p>Software AppInventario POS &copy; {new Date().getFullYear()}</p>
                     <p className="mt-1">Favor confirmar recibido de esta orden de compra adjuntando factura formal de venta.</p>
                  </div>
               </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default Pedidos;
