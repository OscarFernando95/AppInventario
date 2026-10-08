import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { PackageOpen, Users, Plus, ShoppingCart, Trash2, Search, CheckCircle, Truck, UserPlus, X, Box, Printer, FileText, Download } from 'lucide-react';
import { formatCOP, formatCantidad } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import { unidadCorta, etiquetaPresentacion, presentacionDe, aPresentacion, aUnidadBase, lineaVista } from '../../utils/unidades';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import FilterBar from '../../components/ui/FilterBar';
import TablePagination from '../../components/ui/TablePagination';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

const LIMIT = 20;
const FILTROS_VACIOS = { desde: '', hasta: '', proveedorId: '', estado: '' };

const ESTADO_TONE = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  PARCIAL: 'bg-sky-100 text-sky-800',
  COMPLETADO: 'bg-emerald-100 text-emerald-800',
  CANCELADO: 'bg-red-100 text-red-800',
};

const Pedidos = () => {
  const queryClient = useQueryClient();
  const modulos = useAuthStore((s) => s.activeEmpresa?.modulos) || [];

  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [offset, setOffset] = useState(0);
  const hayFiltros = Object.values(filtros).some(Boolean);

  const {
    data: pedidosData, isLoading: cargandoPedidos, isError: errorPedidos,
    error: errPedidos, refetch: recargarPedidos,
  } = useEmpresaQuery(['pedidos', filtros, offset], async () => {
    const params = { limit: LIMIT, offset };
    Object.entries(filtros).forEach(([k, v]) => { if (v) params[k] = v; });
    const res = await api.get('/pedidos', { params });
    return { rows: res.data, total: Number(res.headers['x-total-count'] || 0) };
  });
  const pedidos = pedidosData?.rows || [];
  const totalPedidos = pedidosData?.total || 0;

  const { data: pedidosRecientes = [] } = useEmpresaQuery(['pedidos', 'recientes'], '/pedidos');
  const { data: productos = [] } = useEmpresaQuery(['productos'], '/productos');
  const { data: proveedores = [] } = useEmpresaQuery(['proveedores'], '/proveedores', { enabled: modulos.includes('Proveedores') });
  // Pago en efectivo desde la caja del usuario al recibir mercancía (módulo Caja + caja abierta).
  const conCaja = modulos.includes('Caja');
  const { data: cajaActual } = useEmpresaQuery(['caja', 'actual'], '/caja/actual', { enabled: conCaja });
  const [pagarDeCaja, setPagarDeCaja] = useState(false);
  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['empresa'] });

  const actualizarFiltro = (patch) => {
    setOffset(0);
    setFiltros((prev) => ({ ...prev, ...patch }));
  };

  const [showModal, setShowModal] = useState(false); // Modal para Crear Pedido
  const [viewDetalle, setViewDetalle] = useState(null); // Modal Ver PDF / Completado
  const [checkInPedido, setCheckInPedido] = useState(null); // Modal para Recibir (Check-in)
  const [formError, setFormError] = useState(null);

  const [provSearch, setProvSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [showNewProv, setShowNewProv] = useState(false);
  const [showNewProd, setShowNewProd] = useState(false);

  const [formData, setFormData] = useState({ proveedorId: '', detalles: [] });
  const [newProvData, setNewProvData] = useState({ nombre: '', nit: '', contacto: '', telefono: '', email: '', direccion: '' });
  const [newProdData, setNewProdData] = useState({ codigo: '', nombre_producto: '', precio_unitario: '' });

  const [checkInDetalles, setCheckInDetalles] = useState([]);

  // Compute Frequencies (sobre pedidos recientes, no la página filtrada).
  const freq = useMemo(() => {
    const provFreq = {}; const prodFreq = {};
    pedidosRecientes.forEach(p => {
      if (p.proveedorId) provFreq[p.proveedorId] = (provFreq[p.proveedorId] || 0) + 1;
      p.PedidoDetalles?.forEach(det => {
        if (det.productoId) prodFreq[det.productoId] = (prodFreq[det.productoId] || 0) + det.cantidad_pedida;
      });
    });
    return { provFreq, prodFreq };
  }, [pedidosRecientes]);

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
    let filtered = productos.filter(p => !['RECETA', 'PREPARACION'].includes(p.tipo) && ((p.nombre_producto || '').toLowerCase().includes(lower) || (p.codigo || '').toLowerCase().includes(lower)));
    return filtered.sort((a,b) => (freq.prodFreq[b.id] || 0) - (freq.prodFreq[a.id] || 0));
  }, [itemSearch, productos, freq]);

  const crearProveedor = useMutation({
    mutationFn: (data) => api.post('/proveedores', data),
    onSuccess: (res) => {
      invalidar();
      setFormData(prev => ({ ...prev, proveedorId: res.data.id }));
      setShowNewProv(false);
      setProvSearch('');
      setNewProvData({ nombre: '', nit: '', contacto: '', telefono: '', email: '', direccion: '' });
      setFormError(null);
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo crear el proveedor')),
  });
  const handleCreateProv = (e) => { e.preventDefault(); crearProveedor.mutate(newProvData); };

  const crearProducto = useMutation({
    mutationFn: (data) => api.post('/productos', data),
    onSuccess: (res) => {
      invalidar();
      addItemToCart(res.data);
      setShowNewProd(false);
      setItemSearch('');
      setNewProdData({ codigo: '', nombre_producto: '', precio_unitario: '' });
      setFormError(null);
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo crear el producto')),
  });
  const handleCreateProd = (e) => { e.preventDefault(); crearProducto.mutate(newProdData); };

  const addItemToCart = (item) => {
    const existingIdx = formData.detalles.findIndex(d => d.productoId === item.id);
    if (existingIdx >= 0) {
      const newDet = [...formData.detalles];
      newDet[existingIdx].cantidad_pedida += 1;
      setFormData(prev => ({ ...prev, detalles: newDet }));
    } else {
      // Con presentación de compra (kg, caja…) la línea nace en ella; el costo sugerido
      // es el costo promedio llevado a esa presentación.
      const pres = presentacionDe(item);
      const costoBase = Number(item.costo_promedio) || 0;
      setFormData(prev => ({
        ...prev, detalles: [...prev.detalles, {
          productoId: item.id,
          nombre: item.nombre_producto,
          cantidad_pedida: 1,
          costo_estimado: costoBase > 0
            ? (pres ? aPresentacion(1, costoBase, pres.factor).costo : costoBase)
            : (item.precio_unitario || 0),
          factor: pres?.factor || null,
          etiquetaPres: pres ? etiquetaPresentacion(pres.unidad) : null,
          etiquetaBase: unidadCorta(item.unidad_medida),
          enPresentacion: !!pres,
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

  // Cambia la unidad en que se captura una línea (presentación ↔ base) sin cambiar su total.
  const cambiarUnidad = (idx, enPresentacion) => {
    const newDet = [...formData.detalles];
    const d = newDet[idx];
    if (d.enPresentacion === enPresentacion) return;
    const conv = enPresentacion
      ? aPresentacion(d.cantidad_pedida, d.costo_estimado, d.factor)
      : aUnidadBase(d.cantidad_pedida, d.costo_estimado, d.factor);
    newDet[idx] = { ...d, enPresentacion, cantidad_pedida: conv.cantidad, costo_estimado: conv.costo };
    setFormData(prev => ({ ...prev, detalles: newDet }));
  };

  const getTotal = () => formData.detalles.reduce((acc, curr) => acc + (curr.cantidad_pedida * curr.costo_estimado), 0);

  const crearPedido = useMutation({
    mutationFn: (payload) => api.post('/pedidos', payload),
    onSuccess: () => {
      invalidar();
      setShowModal(false);
      setFormData({ proveedorId: '', detalles: [] });
      setProvSearch('');
      setItemSearch('');
      setFormError(null);
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo generar el pedido')),
  });

  const handleSubmitPedido = (e) => {
    e.preventDefault();
    if (!formData.proveedorId) return setFormError('Debes seleccionar un proveedor.');
    if (formData.detalles.length === 0) return setFormError('El pedido está vacío.');
    crearPedido.mutate({
      proveedorId: parseInt(formData.proveedorId),
      detalles: formData.detalles.map(d => ({
        productoId: d.productoId,
        cantidad_pedida: d.cantidad_pedida,
        costo_estimado: d.costo_estimado,
        en_presentacion: d.factor ? d.enPresentacion : undefined,
      })),
    });
  };

  // CHECK IN LOGIC
  const openCheckIn = (pedido) => {
    setFormError(null);
    setCheckInDetalles(pedido.PedidoDetalles.map(d => {
      const pedida = Number(d.cantidad_pedida);
      const recibida = Number(d.cantidad_recibida || 0);
      const pendiente = Math.max(0, pedida - recibida);
      // La recepción usa la presentación en que se pidió (foto de la línea) o, si se
      // pidió en unidad base, la del producto. Cantidades guardadas siempre en base.
      const pres = d.unidad_presentacion
        ? { unidad: d.unidad_presentacion, factor: Number(d.factor_presentacion) }
        : presentacionDe(d.Producto);
      const enPresentacion = !!d.unidad_presentacion;
      const llegadaBase = pendiente;
      const conv = enPresentacion ? aPresentacion(llegadaBase, d.costo_estimado, pres.factor) : { cantidad: llegadaBase, costo: Number(d.costo_estimado) };
      return {
        id: d.id,
        productoId: d.productoId,
        nombre: d.Producto?.nombre_producto,
        // Valores base (no cambian al alternar la unidad de captura):
        pedida_base: pedida,
        ya_recibida_base: recibida,
        pendiente_base: pendiente,
        factor: pres?.factor || null,
        etiquetaPres: pres ? etiquetaPresentacion(pres.unidad) : null,
        etiquetaBase: unidadCorta(d.Producto?.unidad_medida),
        enPresentacion,
        // Lo que se captura, en la unidad elegida:
        cantidad_llegada: conv.cantidad, // por defecto, recibir lo que falta
        costo_estimado: conv.costo,
      };
    }));
    setCheckInPedido(pedido);
  };

  const updateCheckInItem = (idx, field, value) => {
    const newDet = [...checkInDetalles];
    newDet[idx] = { ...newDet[idx], [field]: Number(value) };
    setCheckInDetalles(newDet);
  };

  // Cambia la unidad de captura de una línea de recepción sin cambiar su total.
  const cambiarUnidadCheckIn = (idx, enPresentacion) => {
    const newDet = [...checkInDetalles];
    const d = newDet[idx];
    if (d.enPresentacion === enPresentacion) return;
    const conv = enPresentacion
      ? aPresentacion(d.cantidad_llegada, d.costo_estimado, d.factor)
      : aUnidadBase(d.cantidad_llegada, d.costo_estimado, d.factor);
    newDet[idx] = { ...d, enPresentacion, cantidad_llegada: conv.cantidad, costo_estimado: conv.costo };
    setCheckInDetalles(newDet);
  };

  // Cantidad base -> como se muestra en la unidad de captura de la línea.
  const verCant = (d, base) => (d.enPresentacion ? aPresentacion(base, 0, d.factor).cantidad : base);

  const recepcionar = useMutation({
    mutationFn: (payload) => api.post(`/pedidos/${checkInPedido.id}/checkin`, payload),
    onSuccess: () => {
      invalidar();
      setCheckInPedido(null);
      setFormError(null);
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo procesar la recepción del pedido')),
  });

  const submitCheckIn = () => {
    recepcionar.mutate({
      pago_desde_caja: conCaja && cajaActual && pagarDeCaja ? true : undefined,
      detalles_recibidos: checkInDetalles.map(d => ({
        productoId: d.productoId,
        cantidad: d.cantidad_llegada,
        costo_unitario: d.costo_estimado,
        en_presentacion: d.factor ? d.enPresentacion : undefined,
      })),
    });
  };

  const selectedProv = proveedores.find(p => p.id === parseInt(formData.proveedorId));

  return (
    <div className="space-y-6 animate-fade-in print:hidden">
      <PageHeader
        title="Registro de Órdenes de Pedido"
        description="Genera PDFs, solicita productos a proveedores y valídalos al recibirlos."
        action={
          <button className="btn-primary gap-2" onClick={() => { setFormData({ proveedorId: '', detalles: [] }); setShowNewProv(false); setProvSearch(''); setItemSearch(''); setFormError(null); setShowModal(true); }}>
            <FileText className="w-5 h-5" aria-hidden="true" /> Nueva Orden
          </button>
        }
      />

      <FilterBar hayFiltros={hayFiltros} onLimpiar={() => actualizarFiltro(FILTROS_VACIOS)}>
        <Field label="Estado" className="w-full sm:w-44">
          <select className="input-field" value={filtros.estado} onChange={(e) => actualizarFiltro({ estado: e.target.value })}>
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="PARCIAL">Parcial</option>
            <option value="COMPLETADO">Completado</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </Field>
        <Field label="Desde" className="w-full sm:w-44">
          <input type="date" className="input-field" value={filtros.desde} onChange={(e) => actualizarFiltro({ desde: e.target.value })} />
        </Field>
        <Field label="Hasta" className="w-full sm:w-44">
          <input type="date" className="input-field" value={filtros.hasta} onChange={(e) => actualizarFiltro({ hasta: e.target.value })} />
        </Field>
        {modulos.includes('Proveedores') && (
          <Field label="Proveedor" className="w-full sm:w-56">
            <select className="input-field" value={filtros.proveedorId} onChange={(e) => actualizarFiltro({ proveedorId: e.target.value })}>
              <option value="">Todos</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Field>
        )}
      </FilterBar>

      <TableCard>
        <THead>
          <Th>Orden #</Th>
          <Th>Proveedor</Th>
          <Th>Fecha y Estado</Th>
          <Th align="right">Monto Estimado</Th>
          <Th align="center">Acciones</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={5}
            isLoading={cargandoPedidos}
            isError={errorPedidos}
            error={errPedidos}
            onRetry={recargarPedidos}
            isEmpty={pedidos.length === 0}
            emptyIcon={FileText}
            emptyTitle={hayFiltros ? 'Sin órdenes para estos filtros' : 'Sin órdenes registradas'}
            emptyHint={hayFiltros ? 'Ajusta los filtros.' : 'Crea la primera con «Nueva Orden».'}
          />
          {pedidos.map(p => (
            <Tr key={p.id}>
              <Td className="font-mono text-xs text-slate-600 whitespace-nowrap">#ORD-{p.id.toString().padStart(4, '0')}</Td>
              <Td className="font-medium text-slate-800">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true"/>
                  {p.Proveedor?.nombre || p.Proveedor?.razon_social || 'Proveedor Desconocido'}
                </div>
              </Td>
              <Td>
                <div className="text-slate-500 mb-1 whitespace-nowrap">{new Date(p.fecha_pedido).toLocaleDateString()}</div>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold tracking-wide uppercase ${ESTADO_TONE[p.estado] || 'bg-slate-100 text-slate-700'}`}>
                  {p.estado}
                </span>
              </Td>
              <Td align="right" className="font-semibold text-slate-800 whitespace-nowrap">{formatCOP(p.total_estimado)}</Td>
              <Td align="center">
                <div className="flex items-center justify-center gap-2">
                  <button onClick={() => setViewDetalle(p)} className="btn-icon" aria-label={`Ver e imprimir la orden ${p.id}`}>
                    <Printer className="w-5 h-5"/>
                  </button>
                  {(p.estado === 'PENDIENTE' || p.estado === 'PARCIAL') && (
                    <button
                      onClick={() => openCheckIn(p)}
                      className="btn-secondary gap-1.5 text-sm py-1.5 px-3 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200"
                    >
                      <Download className="w-4 h-4" aria-hidden="true" />
                      {p.estado === 'PARCIAL' ? 'Recibir resto' : 'Recibir'}
                    </button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableCard>

      <TablePagination total={totalPedidos} offset={offset} limit={LIMIT} onChange={setOffset} />

      {/* Modal CREAR PEDIDO */}
      <Modal open={showModal} onClose={() => setShowModal(false)} variant="bare" title="Nueva orden de compra">
        <div className="fixed inset-0 flex justify-end pointer-events-none">
          <div className="bg-slate-50 w-full max-w-5xl h-full shadow-2xl flex flex-col animate-slide-in-right overflow-hidden pointer-events-auto">
            <div className="px-8 py-6 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
              <h3 className="text-2xl font-semibold text-slate-800 flex items-center gap-3">
                <FileText className="text-brand-700 w-7 h-7" /> Nueva Orden de Compra
              </h3>
              <button onClick={() => setShowModal(false)} aria-label="Cerrar nueva orden de compra" className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 p-2 rounded-full transition-colors"><X className="w-6 h-6"/></button>
            </div>
            <div className="px-8 pt-4"><FormError message={formError} onDismiss={() => setFormError(null)} /></div>

            <div className="flex-1 flex overflow-hidden">
              <div className="w-1/2 p-6 overflow-y-auto custom-scrollbar border-r border-slate-200">
                <div className="mb-6">
                  <h4 className="font-bold text-sm text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><Truck className="w-4 h-4"/> 1. Selección de Proveedor</h4>
                  {!showNewProv ? (
                    <div className="space-y-4">
                      {topProveedores.length > 0 && <div className="flex flex-wrap gap-2 mb-2"><span className="text-xs font-bold text-slate-500 py-1">Frecuentes:</span>{topProveedores.map(p => (<button key={p.id} onClick={() => setFormData({ ...formData, proveedorId: p.id })} className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${formData.proveedorId === p.id ? 'bg-brand-600 text-white shadow-md' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>{p.nombre || p.razon_social}</button>))}</div>}
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                        <input type="text" placeholder="Buscar proveedor (Mínimo 3 letras)..." value={provSearch} onChange={(e) => setProvSearch(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-200 rounded-2xl focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 font-medium text-slate-700 transition-all outline-none placeholder:text-slate-500" />
                      </div>
                      {matchedProveedores.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
                          {matchedProveedores.map(p => (
                            <button key={p.id} onClick={() => { setFormData(prev => ({ ...prev, proveedorId: p.id })); setProvSearch(''); }} className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 font-bold text-slate-700 flex flex-col gap-1 transition-colors">
                              <span>{p.nombre || p.razon_social}</span><span className="text-xs text-slate-500 font-mono">NIT: {p.nit || 'N/A'}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-start">
                        <button onClick={() => setShowNewProv(true)} className="text-sm font-bold text-brand-700 hover:text-brand-700 flex items-center gap-1.5 bg-brand-50 px-3 py-1.5 rounded-lg"><UserPlus className="w-4 h-4"/> Nuevo Proveedor</button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleCreateProv} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                         <Field label="Nombre Comercial/Razón Social" required className="col-span-2">
                           <input type="text" value={newProvData.nombre} onChange={e => setNewProvData({...newProvData, nombre: e.target.value})} className="input-field font-medium" />
                         </Field>
                         <Field label="NIT/Documento" required className="col-span-2">
                           <input type="text" value={newProvData.nit} onChange={e => setNewProvData({...newProvData, nit: e.target.value})} className="input-field font-medium" />
                         </Field>
                      </div>
                      <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                        <button type="button" onClick={() => setShowNewProv(false)} className="btn-secondary text-sm">Cancelar</button>
                        <button type="submit" disabled={crearProveedor.isPending} className="btn-primary text-sm">
                          {crearProveedor.isPending ? 'Creando…' : 'Crear y Seleccionar'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                <div>
                  <h4 className="font-bold text-sm text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><Box className="w-4 h-4"/> 2. Catálogo de Artículos</h4>
                  <div className="relative mb-4">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                    <input type="text" placeholder="Buscar producto a pedir..." value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-200 rounded-2xl focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 font-medium text-slate-700 transition-all outline-none placeholder:text-slate-500" />
                  </div>
                  
                  {!showNewProd ? (
                    <>
                      <div className="flex justify-end mb-4">
                        <button onClick={() => setShowNewProd(true)} className="text-sm font-bold text-brand-700 hover:text-brand-700 flex items-center gap-1.5 bg-brand-50 px-3 py-1.5 rounded-lg"><Plus className="w-4 h-4"/> Nuevo Artículo</button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {displayList.map(p => (
                          <button key={p.id} onClick={() => addItemToCart(p)} className="text-left bg-white p-4 rounded-2xl border-2 border-slate-100 hover:border-brand-300 hover:shadow-md transition-all group flex flex-col justify-between h-28">
                            <div>
                              <p className="font-semibold text-slate-800 text-sm leading-tight group-hover:text-brand-700 transition-colors line-clamp-2">{p.nombre_producto}</p>
                              <p className="text-xs font-mono text-slate-500 mt-1">{p.codigo}</p>
                            </div>
                            <div className="font-semibold text-brand-700 text-sm self-end">{formatCOP(p.precio_unitario)}</div>
                          </button>
                        ))}
                        {displayList.length === 0 && <div className="col-span-2 py-8 text-center text-slate-500 font-bold bg-white rounded-2xl border-2 border-dashed border-slate-200">No hay productos locales.</div>}
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
                   <h4 className="font-semibold text-slate-800 text-lg">Resumen de la Orden</h4>
                   <p className="text-sm font-bold text-brand-700 mt-1">{selectedProv?.nombre || selectedProv?.razon_social || 'Ningún proveedor seleccionado'}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                  {formData.detalles.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
                      <ShoppingCart className="w-12 h-12 opacity-20" />
                      <p className="font-bold">El carrito está vacío</p>
                    </div>
                  ) : formData.detalles.map((d, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4 relative overflow-hidden group">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-500"></div>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800 line-clamp-1 text-sm">{d.nombre}</p>
                        {d.factor && (
                          <label className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                            Pedir en
                            <select
                              aria-label={`Unidad del pedido de ${d.nombre}`}
                              className="rounded-md border border-slate-200 bg-white py-0.5 pl-2 pr-6 text-[11px] font-bold text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                              value={d.enPresentacion ? 'pres' : 'base'}
                              onChange={(e) => cambiarUnidad(idx, e.target.value === 'pres')}
                            >
                              <option value="pres">{d.etiquetaPres}</option>
                              <option value="base">{d.etiquetaBase}</option>
                            </select>
                            <span className="font-normal text-slate-500">(1 {d.etiquetaPres} = {d.factor} {d.etiquetaBase})</span>
                          </label>
                        )}
                        <div className="flex gap-4 mt-2">
                           <div><span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 block mb-0.5">Cant Pedida</span><input type="number" min="0.001" step="any" value={d.cantidad_pedida} onChange={(e) => updateCartItem(idx, 'cantidad_pedida', e.target.value)} className="w-20 px-2 py-1 text-sm font-bold border-2 border-slate-100 rounded-lg text-center focus:border-brand-500 outline-none"/></div>
                           <div><span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 block mb-0.5">Costo {d.factor ? (d.enPresentacion ? d.etiquetaPres : d.etiquetaBase) : 'Ud.'}</span><input type="number" min="0" step="any" value={d.costo_estimado} onChange={(e) => updateCartItem(idx, 'costo_estimado', e.target.value)} className="w-24 px-2 py-1 text-sm font-bold border-2 border-slate-100 rounded-lg focus:border-brand-500 outline-none"/></div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-brand-700 mb-2">{formatCOP(Number(d.cantidad_pedida) * Number(d.costo_estimado))}</p>
                        <button onClick={() => removeFromCart(idx)} aria-label={`Quitar ${d.nombre} del pedido`} className="p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-6 bg-white border-t border-slate-200 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)] z-10">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Estimado Total</span>
                    <span className="text-4xl font-semibold text-emerald-700 tracking-tight">{formatCOP(getTotal())}</span>
                  </div>
                  <button onClick={handleSubmitPedido} disabled={crearPedido.isPending} className="w-full btn-primary py-4 text-lg font-bold shadow-xl shadow-brand-500/30 flex items-center justify-center gap-2 disabled:opacity-50">
                    <CheckCircle className="w-6 h-6" /> {crearPedido.isPending ? 'Procesando…' : 'Procesar Orden de Compra'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* CHECK-IN MODAL */}
      <Modal open={!!checkInPedido} onClose={() => setCheckInPedido(null)} variant="bare" elevated title="Recepción de mercancía">
        <div className="p-4 flex items-center justify-center">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-6 bg-emerald-50 border-b border-emerald-100 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-semibold text-emerald-800 flex items-center gap-2"><Download className="text-emerald-700" /> Recepción de Pedido</h3>
                <p className="text-xs font-bold text-emerald-700/70 uppercase tracking-widest mt-1">Ingreso a Bodega</p>
                <div className="mt-3"><FormError message={formError} onDismiss={() => setFormError(null)} /></div>
              </div>
              <button className="p-2 bg-white hover:bg-emerald-100 hover:text-emerald-800 rounded-full transition-colors text-emerald-700" onClick={() => setCheckInPedido(null)}><X className="w-5 h-5"/></button>
            </div>
            
            <div className="p-8">
               <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
                  <p className="font-bold text-slate-600">Confirma cuánto llegó de cada ítem en esta entrega.</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Lo recibido se suma al inventario. Si no llega todo, el pedido queda <strong>PARCIAL</strong> y puedes completarlo en otra entrega.
                  </p>
               </div>

               <div className="overflow-x-auto">
                 <table className="w-full text-left mb-6 min-w-[560px]">
                    <thead className="border-b-2 border-slate-200">
                        <tr>
                          <th className="py-3 text-sm text-slate-500 uppercase">Producto</th>
                          <th className="py-3 text-sm text-slate-500 uppercase text-center">Pedido</th>
                          <th className="py-3 text-sm text-slate-500 uppercase text-center">Ya recibido</th>
                          <th className="py-3 text-sm text-brand-700 font-bold uppercase text-center w-40">Recibo ahora</th>
                          <th className="py-3 text-sm text-slate-500 uppercase text-right w-32">Costo U.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {checkInDetalles.map((d, idx) => (
                           <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                              <td className="py-4 font-bold text-slate-800">
                                {d.nombre}
                                {d.factor && (
                                  <select
                                    aria-label={`Unidad de recepción de ${d.nombre}`}
                                    className="mt-1 block rounded-md border border-slate-200 bg-white py-0.5 pl-2 pr-6 text-[11px] font-bold text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                                    value={d.enPresentacion ? 'pres' : 'base'}
                                    onChange={(e) => cambiarUnidadCheckIn(idx, e.target.value === 'pres')}
                                  >
                                    <option value="pres">en {d.etiquetaPres}</option>
                                    <option value="base">en {d.etiquetaBase}</option>
                                  </select>
                                )}
                              </td>
                              <td className="py-4 text-center font-bold text-slate-500">{formatCantidad(verCant(d, d.pedida_base))} {d.enPresentacion ? d.etiquetaPres : d.etiquetaBase}</td>
                              <td className="py-4 text-center font-medium text-slate-500">
                                {formatCantidad(verCant(d, d.ya_recibida_base))}
                                {d.pendiente_base > 0 && (
                                  <span className="block text-xs text-amber-700">faltan {formatCantidad(verCant(d, d.pendiente_base))}</span>
                                )}
                              </td>
                              <td className="py-4 text-center">
                                <input type="number" min="0" step="any" value={d.cantidad_llegada} onChange={(e) => updateCheckInItem(idx, 'cantidad_llegada', e.target.value)} className="w-full max-w-[100px] text-center px-3 py-2 border-2 border-brand-200 focus:border-brand-500 rounded-xl font-semibold text-brand-700 bg-brand-50 outline-none transition-all"/>
                              </td>
                              <td className="py-4 text-right">
                                <input type="number" min="0" step="any" value={d.costo_estimado} onChange={(e) => updateCheckInItem(idx, 'costo_estimado', e.target.value)} className="w-full text-right px-2 py-1 border border-slate-200 rounded-lg text-sm font-bold text-slate-600"/>
                              </td>
                           </tr>
                        ))}
                    </tbody>
                 </table>
               </div>

               {conCaja && (
                 <label className={`flex items-start gap-2 mb-4 rounded-xl border p-3 text-sm ${cajaActual ? 'border-slate-200 bg-slate-50 cursor-pointer' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                   <input
                     type="checkbox" className="mt-0.5 w-4 h-4 text-brand-700 rounded border-slate-300 focus:ring-brand-600"
                     checked={!!cajaActual && pagarDeCaja} disabled={!cajaActual}
                     onChange={(e) => setPagarDeCaja(e.target.checked)}
                   />
                   <span>
                     <span className="font-semibold">Pagar esta recepción en efectivo de la caja</span>
                     <span className="block text-xs text-slate-500">
                       {cajaActual
                         ? `Restará del efectivo de tu caja (hay ${formatCOP(cajaActual.resumen.efectivo_esperado)}). Si se paga luego o por banco, déjalo sin marcar.`
                         : 'No tienes caja abierta: la recepción se registra pagada por otro medio.'}
                     </span>
                   </span>
                 </label>
               )}

               <div className="flex justify-end pt-4 border-t border-slate-200">
                  <button onClick={submitCheckIn} disabled={recepcionar.isPending} className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-[0_8px_20px_-8px_rgba(5,150,105,0.6)] flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50">
                    <CheckCircle className="w-5 h-5"/> {recepcionar.isPending ? 'Procesando…' : 'Confirmar recepción y sumar al stock'}
                  </button>
               </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* MODAL PRINT PDF / VER DETALLE.
          Los hijos de <Modal> se evalúan siempre, aunque Modal decida no
          renderizarlos: con open={!!viewDetalle} pero `viewDetalle.id` leído
          sin más ahí dentro, el primer render (viewDetalle === null) reventaba
          con un TypeError antes de que Modal llegara a su `if (!open)`, y la
          página quedaba en blanco. Este `{viewDetalle && (...)}` reproduce el
          corto-circuito que tenía el `createPortal` original. */}
      {viewDetalle && (
      <Modal open onClose={() => setViewDetalle(null)} variant="bare" elevated printable title="Visualizador de documento">
        <div className="p-4 sm:p-8 flex items-center justify-center">
          <div className="bg-slate-100 w-full max-w-3xl max-h-full flex flex-col rounded-3xl overflow-hidden shadow-2xl print:bg-white print:m-0 print:p-0 print:rounded-none print:shadow-none print:w-full">
            <div className="p-4 bg-slate-800 text-slate-300 flex justify-between items-center print:hidden border-b border-slate-700">
               <span className="font-bold text-sm tracking-widest uppercase">Visualizador de Documento</span>
               <div className="flex gap-2">
                 <button onClick={() => window.print()} className="px-4 py-2 bg-brand-700 hover:bg-brand-600 text-white rounded-lg font-bold hover:bg-brand-500 flex items-center gap-2 transition-colors"><Printer className="w-4 h-4"/> Imprimir PDF</button>
                 <button aria-label="Cerrar visualizador" className="p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400" onClick={() => setViewDetalle(null)}><X className="w-5 h-5"/></button>
               </div>
            </div>

            {/* PRINTABLE AREA */}
            <div className="flex-1 overflow-auto bg-slate-100 p-8 print:p-0 print:overflow-visible custom-scrollbar">
               <div className="bg-white rounded-none md:rounded-xl shadow-sm border border-slate-200 p-10 print:border-none print:shadow-none max-w-[800px] mx-auto min-h-[1056px] print:min-h-0 text-slate-800">
                  <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
                     <div>
                       <h1 className="text-4xl font-semibold uppercase tracking-tighter text-slate-900">Orden de Compra</h1>
                       <p className="text-sm font-bold text-slate-500 mt-2">Documento NO Válido como Factura</p>
                     </div>
                     <div className="text-right">
                        <p className="font-mono text-xl font-bold text-brand-700">#ORD-{viewDetalle.id.toString().padStart(4, '0')}</p>
                        <p className="text-sm font-bold text-slate-600 mt-1">{new Date(viewDetalle.fecha_pedido).toLocaleDateString()}</p>
                     </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-8 mb-10">
                     <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Comprador (Nuestra Empresa)</p>
                        <p className="font-bold text-lg text-slate-800">AppInventario Corp.</p>
                        <p className="text-sm text-slate-600 mt-1">Generado vía Sistema Administrativo</p>
                     </div>
                     <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Proveedor / Vendedor</p>
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
                        {viewDetalle.PedidoDetalles?.map((d, index) => {
                           // El proveedor lee la orden en la presentación en que se pidió (3 kg, no 3.000 g).
                           const v = lineaVista({ cantidadBase: d.cantidad_pedida, costoBase: d.costo_estimado, unidad_presentacion: d.unidad_presentacion, factor_presentacion: d.factor_presentacion }, d.Producto?.unidad_medida);
                           return (
                           <tr key={index} className="border-b border-slate-200">
                             <td className="py-4 px-4 text-center font-mono text-sm text-slate-500">{index + 1}</td>
                             <td className="py-4 px-4 font-bold text-slate-700">{d.Producto?.nombre_producto || 'Producto Desconocido'}</td>
                             <td className="py-4 px-4 text-center font-bold text-slate-600 whitespace-nowrap">{formatCantidad(v.cantidad)} {v.etiqueta}</td>
                             <td className="py-4 px-4 text-right font-mono text-sm text-slate-600">{formatCOP(v.costo)}</td>
                             <td className="py-4 px-4 text-right font-mono text-sm font-bold text-slate-800">{formatCOP(Number(d.cantidad_pedida) * Number(d.costo_estimado))}</td>
                           </tr>
                           );
                        })}
                     </tbody>
                  </table>

                  <div className="flex justify-end mt-8">
                     <div className="w-64 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Total Estimado</p>
                        <p className="text-3xl font-semibold text-brand-700 tracking-tight">{formatCOP(viewDetalle.total_estimado)}</p>
                     </div>
                  </div>

                  <div className="mt-24 border-t-2 border-slate-200 pt-8 text-center text-xs font-bold text-slate-500">
                     <p>Software AppInventario POS &copy; {new Date().getFullYear()}</p>
                     <p className="mt-1">Favor confirmar recibido de esta orden de compra adjuntando factura formal de venta.</p>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </Modal>
      )}

    </div>
  );
};

export default Pedidos;
