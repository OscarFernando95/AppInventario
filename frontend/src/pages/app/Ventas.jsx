import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import JSZip from 'jszip';
import api from '../../api/axios';
import { Link } from 'react-router-dom';
import { Ban, Wallet, ShoppingCart, Trash2, Search, CheckCircle, Tag, Users, UserPlus, X, Percent, Eye, Receipt, Box, Briefcase, Minus, Plus, PackageOpen, FileDown, FileArchive } from 'lucide-react';
import { formatCOP, formatDocumento, formatCantidad, vencimientoEn } from '../../utils/format';
import { generateInvoicePDF } from '../../utils/generateInvoicePDF';
import { useAuthStore } from '../../store/authStore';
import { unidadCorta } from '../../utils/unidades';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
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
const MAX_LOTE = 100;
const FILTROS_VACIOS = { desde: '', hasta: '', clienteId: '', estado: '' };

/** Lo vendible de un producto: porciones para un plato; stock físico para el resto. */
const disponible = (p) => Number(p.tipo === 'RECETA' ? (p.porciones_disponibles ?? 0) : p.stock_actual);

const Ventas = () => {
  const { activeEmpresa, user } = useAuthStore();
  const esAdmin = user?.rol === 'FRONT_ADMIN';
  const queryClient = useQueryClient();
  const modulos = activeEmpresa?.modulos || [];

  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [offset, setOffset] = useState(0);
  const [seleccionadas, setSeleccionadas] = useState(() => new Set());
  const [descargaLote, setDescargaLote] = useState(null); // { hechas, total } | { error }

  const hayFiltros = Object.values(filtros).some(Boolean);

  const {
    data: ventasData, isLoading: cargandoVentas, isError: errorVentas,
    error: errVentas, refetch: recargarVentas,
  } = useEmpresaQuery(['ventas', filtros, offset], async () => {
    const params = { limit: LIMIT, offset };
    Object.entries(filtros).forEach(([k, v]) => { if (v) params[k] = v; });
    const res = await api.get('/ventas', { params });
    return { rows: res.data, total: Number(res.headers['x-total-count'] || 0) };
  });
  const ventas = ventasData?.rows || [];
  const totalVentas = ventasData?.total || 0;

  // Consulta aparte (no paginada) solo para ordenar los "Top Frecuentes" del POS.
  const { data: ventasRecientes = [] } = useEmpresaQuery(['ventas', 'recientes'], '/ventas');

  const { data: productos = [] } = useEmpresaQuery(['productos'], '/productos');
  const { data: clientes = [] } = useEmpresaQuery(['clientes'], '/clientes', { enabled: modulos.includes('Clientes') });
  const { data: servicios = [] } = useEmpresaQuery(['servicios'], '/servicios', { enabled: modulos.includes('Servicios') });
  const { data: modificadores = [] } = useEmpresaQuery(['modificadores'], '/modificadores', { enabled: modulos.includes('Recetas') });
  // Con el módulo Caja solo se vende con una caja abierta (el backend también lo exige).
  const conCaja = modulos.includes('Caja');
  const { data: cajaActual, isLoading: cargandoCaja } = useEmpresaQuery(['caja', 'actual'], '/caja/actual', { enabled: conCaja });
  const sinCaja = conCaja && !cargandoCaja && !cajaActual;
  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['empresa'] });

  // ── Anulación: el administrador anula en el acto; los demás envían una solicitud que él resuelve ──
  const { data: pendientes = [] } = useEmpresaQuery(['anulaciones', 'pendientes'], '/anulaciones');
  const [anulando, setAnulando] = useState(null); // venta que se va a anular / solicitar
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [rechazando, setRechazando] = useState(null); // solicitud que se va a rechazar
  const [comentarioRechazo, setComentarioRechazo] = useState('');
  const [avisoAnulacion, setAvisoAnulacion] = useState(null);
  const [errorAnulacion, setErrorAnulacion] = useState(null);

  const anularVenta = useMutation({
    mutationFn: ({ id, motivo }) => api.post(`/ventas/${id}/anular`, { motivo }),
    onSuccess: (res) => {
      invalidar();
      setAnulando(null);
      setMotivoAnulacion('');
      setErrorAnulacion(null);
      setAvisoAnulacion(res.data.resultado === 'ANULADA'
        ? 'Venta anulada: el inventario volvió a su lugar y dejó de contar en los totales.'
        : 'Solicitud enviada: el administrador debe aprobarla para que la venta se anule.');
    },
    onError: (err) => setErrorAnulacion(apiError(err, 'No se pudo anular la venta')),
  });

  const resolverSolicitud = useMutation({
    mutationFn: ({ id, accion, comentario }) => api.post(`/anulaciones/${id}/${accion}`, accion === 'rechazar' ? { comentario } : undefined),
    onSuccess: (_res, vars) => {
      invalidar();
      setRechazando(null);
      setComentarioRechazo('');
      setErrorAnulacion(null);
      setAvisoAnulacion(vars.accion === 'aprobar' ? 'Solicitud aprobada: la venta quedó anulada.' : 'Solicitud rechazada: la venta sigue activa.');
    },
    onError: (err) => setErrorAnulacion(apiError(err, 'No se pudo resolver la solicitud')),
  });

  const actualizarFiltro = (patch) => {
    setOffset(0);
    setFiltros((prev) => ({ ...prev, ...patch }));
  };

  const toggleSeleccion = (id) => {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSeleccionarPagina = () => {
    setSeleccionadas((prev) => {
      const idsPagina = ventas.map((v) => v.id);
      const todas = idsPagina.every((id) => prev.has(id));
      const next = new Set(prev);
      idsPagina.forEach((id) => { if (todas) next.delete(id); else next.add(id); });
      return next;
    });
  };

  const descargarLote = async () => {
    const ids = [...seleccionadas];
    if (ids.length === 0) return;
    if (ids.length > MAX_LOTE) {
      setDescargaLote({ error: `Máximo ${MAX_LOTE} facturas por lote. Tienes ${ids.length} seleccionadas.` });
      return;
    }
    const zip = new JSZip();
    try {
      for (let i = 0; i < ids.length; i++) {
        setDescargaLote({ hechas: i, total: ids.length });
        const { data } = await api.get(`/ventas/${ids[i]}`);
        const { fileName, blob } = generateInvoicePDF(data, data.Empresa || activeEmpresa, { returnBlob: true });
        zip.file(fileName, blob);
      }
      setDescargaLote({ hechas: ids.length, total: ids.length });
      const contenido = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(contenido);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Facturas_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setDescargaLote(null);
      setSeleccionadas(new Set());
    } catch (err) {
      setDescargaLote({ error: apiError(err, 'No se pudo generar el ZIP') });
    }
  };

  const [showModal, setShowModal] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [activeTab, setActiveTab] = useState('P'); // 'P' or 'S'
  const [viewDetalle, setViewDetalle] = useState(null);
  const [formError, setFormError] = useState(null);
  // Venta recién emitida: se muestra un modal de éxito con la opción de
  // descargar la factura BAJO DEMANDA (antes se descargaba sola al emitir).
  const [ventaEmitida, setVentaEmitida] = useState(null);

  const [formData, setFormData] = useState({ clienteId: '', detalles: [], forma_pago: '1', medio_pago: '10', dias_credito: '30' });
  const [activeDiscountIdx, setActiveDiscountIdx] = useState(null);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [newClientData, setNewClientData] = useState({ nombre: '', documento: '', telefono: '', email: '', direccion: '' });
  const [showNewClient, setShowNewClient] = useState(false);

  // Compute Frequencies to sort components (sobre las ventas recientes, no la
  // página filtrada del listado).
  const freq = useMemo(() => {
    const cFreq = {}; const pFreq = {}; const sFreq = {};
    ventasRecientes.forEach(v => {
      if (v.clienteId) cFreq[v.clienteId] = (cFreq[v.clienteId] || 0) + 1;
      v.VentaDetalles?.forEach(det => {
        if (det.productoId) pFreq[det.productoId] = (pFreq[det.productoId] || 0) + det.cantidad;
        if (det.servicioId) sFreq[det.servicioId] = (sFreq[det.servicioId] || 0) + det.cantidad;
      });
    });
    return { cFreq, pFreq, sFreq };
  }, [ventasRecientes]);

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
      let filtered = productos.filter(p => !['INSUMO', 'PREPARACION'].includes(p.tipo) && disponible(p) > 0 && ((p.nombre_producto || '').toLowerCase().includes(lower) || (p.codigo || '').toLowerCase().includes(lower)));
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

  // Un plato con modificadores disponibles abre primero el selector; el resto
  // (productos, servicios, platos sin modificadores) entra directo al carrito.
  const [personalizar, setPersonalizar] = useState(null); // plato que se está personalizando
  const [modsSel, setModsSel] = useState([]); // ids de modificadores marcados

  const seleccionarItem = (item, type) => {
    if (type === 'P' && item.tipo === 'RECETA' && modificadores.length > 0) {
      setModsSel([]);
      setPersonalizar(item);
      return;
    }
    addItemToCart(item, type);
  };

  const confirmarPersonalizado = () => {
    addItemToCart(personalizar, 'P', modificadores.filter((m) => modsSel.includes(m.id)));
    setPersonalizar(null);
  };

  // `mods`: modificadores elegidos (solo platos). Cada combinación distinta es una línea aparte.
  const addItemToCart = (item, type, mods = []) => {
    const isP = type === 'P';
    const modKey = mods.map((m) => m.id).sort((a, b) => a - b).join(',');
    const extras = mods.reduce((acc, m) => acc + Number(m.precio_extra || 0), 0);

    // Check if already in cart
    const existingIdx = formData.detalles.findIndex(d => (isP ? d.productoId === item.id : d.servicioId === item.id) && (d.modKey || '') === modKey);

    const stock = isP ? disponible(item) : 0;
    const precio = Number(isP ? item.precio_unitario : item.precio) + extras;
    if (existingIdx >= 0) {
      if (isP && formData.detalles[existingIdx].cantidad + 1 > stock) {
        return setFormError(`Stock insuficiente de ${item.nombre_producto}. Solo quedan ${formatCantidad(stock)} ${item.tipo === 'RECETA' ? 'porciones' : 'ud'}.`);
      }
      const newDet = [...formData.detalles];
      newDet[existingIdx].cantidad += 1;
      setFormData(prev => ({ ...prev, detalles: newDet }));
    } else {
      const sufijo = mods.length ? ` (${mods.map((m) => m.nombre).join(', ')})` : '';
      setFormData(prev => ({
        ...prev,
        detalles: [...prev.detalles, {
          productoId: isP ? item.id : null,
          servicioId: !isP ? item.id : null,
          nombre: isP ? `${item.nombre_producto}${sufijo}` : `(Serv.) ${item.nombre}`,
          cantidad: 1,
          precio_base: precio, // precio de lista (+ extras)
          precio_unitario: precio,
          tipo: type,
          maxStock: isP ? stock : null,
          modificadores: mods.map((m) => m.id),
          modKey,
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
    onSuccess: (res) => {
      invalidar();
      setShowModal(false);
      setFormData({ clienteId: '', detalles: [], forma_pago: '1', medio_pago: '10', dias_credito: '30' });
      setClientSearch('');
      setItemSearch('');
      setGlobalDiscount(0);
      setActiveDiscountIdx(null);
      setFormError(null);
      setShowNewClient(false);
      setVentaEmitida(res.data); // el usuario decide si descarga la factura
    },
    onError: (err) => setFormError(apiError(err, 'No se pudo facturar la venta')),
  });

  const iniciarNuevaVenta = () => {
    setVentaEmitida(null);
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.clienteId) return setFormError('Debes seleccionar un cliente para registrar la venta.');
    if (formData.detalles.length === 0) return setFormError('El carrito está vacío.');
    emitirVenta.mutate({
      clienteId: parseInt(formData.clienteId),
      descuento_global: globalDiscount || 0,
      forma_pago: formData.forma_pago,
      // A crédito: plazo en días (el servidor calcula el vencimiento y deja el total por cobrar).
      dias_credito: formData.forma_pago === '2' ? (Number(formData.dias_credito) || 0) : undefined,
      medio_pago: formData.medio_pago,
      detalles: formData.detalles.map(d => ({
        productoId: d.productoId,
        servicioId: d.servicioId,
        modificadores: d.modificadores?.length ? d.modificadores : undefined,
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
          <div className="flex flex-wrap gap-2">
            {seleccionadas.size > 0 && (
              <button className="btn-secondary gap-2" onClick={descargarLote} disabled={!!descargaLote?.total}>
                <FileArchive className="w-5 h-5" aria-hidden="true" />
                {descargaLote?.total
                  ? `Generando ${descargaLote.hechas}/${descargaLote.total}…`
                  : `Descargar ${seleccionadas.size} factura(s)`}
              </button>
            )}
            <button className="btn-primary gap-2" disabled={sinCaja} title={sinCaja ? 'Abre caja para poder vender' : undefined} onClick={() => { setFormData({ clienteId: '', detalles: [], forma_pago: '1', medio_pago: '10', dias_credito: '30' }); setGlobalDiscount(0); setShowNewClient(false); setClientSearch(''); setItemSearch(''); setFormError(null); setShowModal(true); }}>
              <Tag className="w-5 h-5" aria-hidden="true" /> Iniciar POS (Caja)
            </button>
          </div>
        }
      />

      {sinCaja && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Wallet className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-48">No tienes una caja abierta. Abre caja para empezar a vender.</span>
          <Link to="/app/caja" className="btn-primary px-4 py-2 text-sm">Ir a Caja</Link>
        </div>
      )}

      {descargaLote?.error && (
        <FormError message={descargaLote.error} onDismiss={() => setDescargaLote(null)} />
      )}

      <FilterBar hayFiltros={hayFiltros} onLimpiar={() => actualizarFiltro(FILTROS_VACIOS)}>
        <Field label="Desde" className="w-full sm:w-44">
          <input type="date" className="input-field" value={filtros.desde} onChange={(e) => actualizarFiltro({ desde: e.target.value })} />
        </Field>
        <Field label="Hasta" className="w-full sm:w-44">
          <input type="date" className="input-field" value={filtros.hasta} onChange={(e) => actualizarFiltro({ hasta: e.target.value })} />
        </Field>
        <Field label="Estado" className="w-full sm:w-40">
          <select className="input-field" value={filtros.estado} onChange={(e) => actualizarFiltro({ estado: e.target.value })}>
            <option value="">Todas</option>
            <option value="ACTIVA">Activas</option>
            <option value="ANULADA">Anuladas</option>
          </select>
        </Field>
        {modulos.includes('Clientes') && (
          <Field label="Cliente" className="w-full sm:w-56">
            <select className="input-field" value={filtros.clienteId} onChange={(e) => actualizarFiltro({ clienteId: e.target.value })}>
              <option value="">Todos</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Field>
        )}
      </FilterBar>

      {avisoAnulacion && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span>{avisoAnulacion}</span>
          <button type="button" className="btn-icon" aria-label="Cerrar aviso" onClick={() => setAvisoAnulacion(null)}><X className="w-4 h-4" /></button>
        </div>
      )}
      {errorAnulacion && !anulando && !rechazando && <FormError message={errorAnulacion} onDismiss={() => setErrorAnulacion(null)} />}

      {pendientes.length > 0 && (
        <section aria-label="Solicitudes de anulación" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <Ban className="w-4 h-4" aria-hidden="true" />
            {esAdmin ? `${pendientes.length} solicitud(es) de anulación por resolver` : `Tienes ${pendientes.length} solicitud(es) de anulación esperando al administrador`}
          </h3>
          <ul className="divide-y divide-amber-100 text-sm">
            {pendientes.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="text-slate-700 min-w-0">
                  <strong>#FACT-{String(s.ventaId).padStart(4, '0')}</strong> · {formatCOP(s.venta?.total)}
                  {s.venta?.Cliente?.nombre ? ` · ${s.venta.Cliente.nombre}` : ''}
                  <span className="block text-xs text-slate-500">Pide: {s.solicitante?.nombre} — «{s.motivo}»</span>
                </span>
                {esAdmin && (
                  <span className="flex gap-2">
                    <button type="button" className="btn-secondary text-xs" onClick={() => { setErrorAnulacion(null); setRechazando(s); }}>Rechazar</button>
                    <button
                      type="button" className="btn-primary text-xs" disabled={resolverSolicitud.isPending}
                      aria-label={`Aprobar anulación de la factura ${s.ventaId}`}
                      onClick={() => resolverSolicitud.mutate({ id: s.id, accion: 'aprobar' })}
                    >
                      Aprobar y anular
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <TableCard>
        <THead>
          <Th align="center" className="w-10">
            <input
              type="checkbox"
              aria-label="Seleccionar todas las de esta página"
              className="w-4 h-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
              checked={ventas.length > 0 && ventas.every((v) => seleccionadas.has(v.id))}
              onChange={toggleSeleccionarPagina}
            />
          </Th>
          <Th>Ref Caja</Th>
          <Th>Identificación Cliente</Th>
          <Th align="center">Items (Qty)</Th>
          <Th>Fecha Emisión</Th>
          <Th align="right">Monto Facturado</Th>
          <Th align="center">Estado</Th>
          <Th align="center">Acción</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={8}
            isLoading={cargandoVentas}
            isError={errorVentas}
            error={errVentas}
            onRetry={recargarVentas}
            isEmpty={ventas.length === 0}
            emptyIcon={Receipt}
            emptyTitle={hayFiltros ? 'Sin facturas para estos filtros' : 'Sin transacciones en caja'}
            emptyHint={hayFiltros ? 'Ajusta el rango de fechas o el cliente.' : 'Abre la caja con «Iniciar POS».'}
          />
          {ventas.map(v => {
            const anulada = v.estado === 'ANULADA';
            const conSolicitud = !anulada && v.anulaciones?.length > 0;
            return (
            <Tr key={v.id} className={anulada ? 'opacity-60' : ''}>
              <Td align="center">
                <input
                  type="checkbox"
                  aria-label={`Seleccionar factura ${v.id}`}
                  className="w-4 h-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
                  checked={seleccionadas.has(v.id)}
                  onChange={() => toggleSeleccion(v.id)}
                />
              </Td>
              <Td className="font-mono text-xs text-slate-600 whitespace-nowrap">#FACT-{v.id.toString().padStart(4, '0')}</Td>
              <Td className="font-medium text-slate-800">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true"/>
                  {v.Cliente ? `${v.Cliente.nombre} — ${formatDocumento(v.Cliente.documento)}` : 'Cliente Casual (Sin Identidad)'}
                </div>
              </Td>
              <Td align="center" className="text-slate-600">{v.VentaDetalles?.length || 0}</Td>
              <Td className="text-slate-500 whitespace-nowrap">{new Date(v.fecha).toLocaleString('es-CO')}</Td>
              <Td align="right" className={`font-semibold text-slate-800 whitespace-nowrap ${anulada ? 'line-through' : ''}`}>{formatCOP(v.total)}</Td>
              <Td align="center">
                {anulada ? (
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800" title={v.motivo_anulacion || undefined}>ANULADA</span>
                ) : conSolicitud ? (
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 whitespace-nowrap">Anulación pedida</span>
                ) : (
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">ACTIVA</span>
                )}
              </Td>
              <Td align="center">
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => setViewDetalle(v)} className="btn-icon" aria-label={`Ver detalle de la factura ${v.id}`}>
                    <Eye className="w-5 h-5"/>
                  </button>
                  {!anulada && !conSolicitud && (
                    <button
                      onClick={() => { setErrorAnulacion(null); setMotivoAnulacion(''); setAnulando(v); }}
                      className="btn-icon text-red-700"
                      aria-label={esAdmin ? `Anular la factura ${v.id}` : `Solicitar anulación de la factura ${v.id}`}
                      title={esAdmin ? 'Anular venta' : 'Solicitar anulación'}
                    >
                      <Ban className="w-5 h-5"/>
                    </button>
                  )}
                </div>
              </Td>
            </Tr>
            );
          })}
        </tbody>
      </TableCard>

      <TablePagination total={totalVentas} offset={offset} limit={LIMIT} onChange={setOffset} />

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
                     <div key={item.id} onClick={() => seleccionarItem(item, activeTab)} className="bg-white border border-slate-200 rounded-xl p-3 cursor-pointer hover:border-brand-400 hover:shadow-md transition-all active:scale-95 group flex flex-col justify-between">
                       <div>
                         <div className="text-xs font-semibold text-slate-500 mb-1">{activeTab==='P'?item.codigo:'SVC'}</div>
                         <div className="font-bold text-slate-800 text-sm leading-tight mb-2 group-hover:text-brand-700">{activeTab==='P'?item.nombre_producto:item.nombre}</div>
                       </div>
                       <div>
                         <div className="font-semibold text-brand-700">{formatCOP(activeTab==='P'?item.precio_unitario:item.precio)}</div>
                         {activeTab === 'P' && <div className="text-[10px] font-bold text-slate-500 mt-1">Disp: {item.tipo === 'RECETA' ? `${formatCantidad(disponible(item))} porciones` : `${formatCantidad(item.stock_actual)} ${unidadCorta(item.unidad_medida)}`}</div>}
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
                           {modulos.includes('Cuentas por cobrar') && <option value="2">A crédito</option>}
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
                     {formData.forma_pago === '2' && (
                       <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
                         <label htmlFor="pos-dias-credito" className="block text-[10px] font-bold text-amber-900 uppercase tracking-wider">Plazo (días)</label>
                         <input
                           id="pos-dias-credito" type="number" min="0" max="365" className="input-field text-xs font-bold bg-white"
                           value={formData.dias_credito} onChange={(e) => setFormData({ ...formData, dias_credito: e.target.value })}
                         />
                         <p className="text-[11px] text-amber-900">
                           Queda por cobrar {formatCOP(getTotal())} y vence el {vencimientoEn(formData.dias_credito)}.
                           El cliente abona después en Cuentas por cobrar.
                         </p>
                       </div>
                     )}
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
              {viewDetalle.estado === 'ANULADA' && (
                <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                  <strong>Venta anulada</strong>
                  {viewDetalle.anuladaPor?.nombre ? ` por ${viewDetalle.anuladaPor.nombre}` : ''}
                  {viewDetalle.anulada_en ? ` · ${new Date(viewDetalle.anulada_en).toLocaleString('es-CO')}` : ''}
                  {viewDetalle.motivo_anulacion && <span className="block">Motivo: {viewDetalle.motivo_anulacion}</span>}
                </div>
              )}
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

      {ventaEmitida && (
        <Modal open onClose={() => setVentaEmitida(null)} title="Factura emitida" size="md">
          <div className="space-y-4">
            <FormError message={formError} onDismiss={() => setFormError(null)} />
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <CheckCircle className="w-8 h-8 text-emerald-700 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold text-emerald-800">
                  Factura #FACT-{ventaEmitida.id.toString().padStart(4, '0')} registrada
                </p>
                <p className="text-sm text-emerald-700">Total {formatCOP(ventaEmitida.total)}</p>
              </div>
            </div>
            <p className="text-sm text-slate-500">
              La factura ya quedó guardada. Descárgala si la necesitas ahora, o hazlo después desde el detalle de la venta.
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
              <button type="button" className="btn-secondary" onClick={iniciarNuevaVenta}>
                Nueva venta
              </button>
              <button
                type="button"
                className="btn-primary gap-2"
                onClick={() => descargarPDF(ventaEmitida.id)}
              >
                <FileDown className="w-4 h-4" aria-hidden="true" /> Descargar factura PDF
              </button>
            </div>
          </div>
        </Modal>
      )}


      {/* ── Anular venta / solicitar anulación ── */}
      <Modal
        open={!!anulando}
        onClose={() => setAnulando(null)}
        title={esAdmin ? 'Anular venta' : 'Solicitar anulación'}
        description={anulando ? `Factura #FACT-${String(anulando.id).padStart(4, '0')} · ${formatCOP(anulando.total)}` : undefined}
        size="md"
      >
        {anulando && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (motivoAnulacion.trim().length < 3) return setErrorAnulacion('Indica el motivo de la anulación.');
              anularVenta.mutate({ id: anulando.id, motivo: motivoAnulacion.trim() });
            }}
          >
            <FormError message={errorAnulacion} onDismiss={() => setErrorAnulacion(null)} />
            <p className="text-sm text-slate-600">
              {esAdmin
                ? 'La venta queda en el historial como ANULADA, el inventario vuelve a su lugar y deja de contar en totales, informes y caja. Si se cobró en efectivo en una caja que ya cerró, la devolución sale de tu caja abierta.'
                : 'No se anula en el acto: el administrador revisa tu solicitud y la aprueba o la rechaza.'}
            </p>
            <Field label="Motivo" required>
              <input
                className="input-field" maxLength={500} autoFocus placeholder="Error al digitar, el cliente se arrepintió…"
                value={motivoAnulacion} onChange={(e) => setMotivoAnulacion(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setAnulando(null)}>Volver</button>
              <button type="submit" className="btn-primary px-6" disabled={anularVenta.isPending}>
                {anularVenta.isPending ? 'Enviando…' : esAdmin ? 'Anular venta' : 'Enviar solicitud'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!rechazando} onClose={() => setRechazando(null)} title="Rechazar solicitud" size="md">
        {rechazando && (
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); resolverSolicitud.mutate({ id: rechazando.id, accion: 'rechazar', comentario: comentarioRechazo.trim() || undefined }); }}
          >
            <FormError message={errorAnulacion} onDismiss={() => setErrorAnulacion(null)} />
            <p className="text-sm text-slate-600">La venta #FACT-{String(rechazando.ventaId).padStart(4, '0')} sigue activa. {rechazando.solicitante?.nombre} podrá volver a pedirla.</p>
            <Field label="Comentario (opcional)">
              <input className="input-field" maxLength={500} autoFocus placeholder="La venta es correcta" value={comentarioRechazo} onChange={(e) => setComentarioRechazo(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setRechazando(null)}>Volver</button>
              <button type="submit" className="btn-primary px-6" disabled={resolverSolicitud.isPending}>Rechazar solicitud</button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Personalizar un plato (modificadores) ── */}
      <Modal open={!!personalizar} onClose={() => setPersonalizar(null)} elevated title={personalizar ? `Personalizar ${personalizar.nombre_producto}` : ''} size="md">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Marca los extras o lo que se quita. Cada combinación queda como una línea aparte.</p>
          <ul className="space-y-2 max-h-72 overflow-y-auto">
            {modificadores.map((m) => {
              const marcado = modsSel.includes(m.id);
              return (
                <li key={m.id}>
                  <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-brand-600 ${marcado ? 'bg-brand-50 border-brand-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                    <input
                      type="checkbox" className="w-4 h-4 text-brand-700 rounded border-slate-300 focus:ring-brand-600"
                      checked={marcado}
                      onChange={() => setModsSel((prev) => (marcado ? prev.filter((id) => id !== m.id) : [...prev, m.id]))}
                    />
                    <span className="flex-1 text-sm font-medium text-slate-800">{m.nombre}</span>
                    <span className="text-xs font-semibold text-slate-600">{Number(m.precio_extra) > 0 ? `+${formatCOP(m.precio_extra)}` : 'Sin costo'}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setPersonalizar(null)}>Cancelar</button>
            <button type="button" className="btn-primary px-6" onClick={confirmarPersonalizado}>Agregar al carrito</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Ventas;
