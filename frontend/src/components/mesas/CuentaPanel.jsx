import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ChefHat, Printer, Ban, ArrowRightLeft, Combine, Minus, Plus, Trash2, Users, Clock, Receipt, CheckCircle2, FileDown, MessageSquareText, Armchair, ShoppingBag,
} from 'lucide-react';
import api from '../../api/axios';
import { formatCOP, formatCantidad } from '../../utils/format';
import { apiError } from '../../utils/apiError';
import { generateInvoicePDF } from '../../utils/generateInvoicePDF';
import { imprimirComanda } from '../../utils/comandaTicket';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import { usePermisos } from '../../hooks/usePermisos';
import { useOpciones } from '../../hooks/useOpciones';
import { useAuthStore } from '../../store/authStore';
import { useAhora, hace } from '../../hooks/useAhora';
import FormError from '../FormError';
import Modal, { ModalActions } from '../ui/Modal';
import Field from '../ui/Field';
import ProductPicker from './ProductPicker';
import SelectorModificadores from '../SelectorModificadores';
import { faltaElegir, hayOferta } from '../../utils/grupos';
import { useMenu } from '../../hooks/useMenu';
import CobrarModal from './CobrarModal';

const ESTADO_COMANDA = {
  PENDIENTE: { texto: 'En preparación', tono: 'bg-sky-100 text-sky-800' },
  LISTA: { texto: 'Lista', tono: 'bg-emerald-100 text-emerald-800' },
  ENTREGADA: { texto: 'Entregada', tono: 'bg-slate-100 text-slate-600' },
};

// ¿Imprimir la comanda al enviarla? Por omisión sí cuando no hay pantalla de cocina. Se recuerda por navegador.
const CLAVE_IMPRIMIR = 'mesas-imprimir-comanda';
const leerImprimir = (porOmision) => {
  try {
    const v = localStorage.getItem(CLAVE_IMPRIMIR);
    return v === null ? porOmision : v === '1';
  } catch { return porOmision; }
};
const guardarImprimir = (v) => { try { localStorage.setItem(CLAVE_IMPRIMIR, v ? '1' : '0'); } catch { /* sin almacenamiento: se usa el valor por omisión */ } };

const FilaItem = ({ item, comandaPorId, puedeAnular, acciones, bloqueado, comensales, onReasignar }) => {
  const cobrado = !!item.ventaId;
  const anulado = item.estado === 'ANULADO';
  const comanda = item.comandaId ? comandaPorId.get(item.comandaId) : null;
  return (
    <li className={`flex gap-3 py-3 ${anulado ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-slate-800 ${anulado ? 'line-through' : ''}`}>
          {formatCantidad(item.cantidad)} × {item.nombre}
        </p>
        {item.modificadores.length > 0 && <p className="text-xs text-slate-500">+ {item.modificadores.map((m) => m.nombre).join(', ')}</p>}
        {comensales > 0 && !cobrado && !anulado && !bloqueado ? (
          <select
            aria-label={`Persona de ${item.nombre}`} className="mt-1 rounded-lg border border-slate-200 bg-white text-xs py-0.5 px-1.5 text-slate-700"
            value={item.comensal ?? ''} onChange={(e) => onReasignar(item, e.target.value)}
          >
            <option value="">Para todos</option>
            {Array.from({ length: comensales }, (_, k) => k + 1).map((n) => <option key={n} value={n}>Persona {n}</option>)}
          </select>
        ) : (item.comensal ? <span className="mt-1 inline-block text-[11px] font-semibold bg-slate-100 text-slate-700 rounded px-1.5 py-0.5">Persona {item.comensal}</span> : null)}
        {item.componentes?.length > 0 && <p className="text-xs text-slate-500">Incluye: {item.componentes.map((c) => `${c.cantidad > 1 ? `${c.cantidad} × ` : ''}${c.nombre}`).join(', ')}</p>}
        {item.nota && <p className="text-xs font-medium text-amber-800 flex items-center gap-1"><MessageSquareText className="w-3 h-3" aria-hidden="true" /> {item.nota}</p>}
        <p className="mt-0.5 text-[11px] text-slate-500 flex flex-wrap gap-x-2 items-center">
          <span>{formatCOP(item.precio_unitario)} c/u</span>
          {cobrado && <span className="font-semibold text-emerald-700">Cobrado · venta #{item.ventaId}</span>}
          {anulado && <span className="font-semibold text-red-700">Anulado{item.motivo_anulacion ? `: ${item.motivo_anulacion}` : ''}</span>}
          {comanda && !cobrado && !anulado && <span className={`rounded px-1.5 py-0.5 font-semibold ${ESTADO_COMANDA[comanda.estado].tono}`}>{ESTADO_COMANDA[comanda.estado].texto}</span>}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="font-semibold text-slate-800">{formatCOP(item.subtotal)}</span>
        {!cobrado && !anulado && !bloqueado && (
          item.enviado ? (
            puedeAnular && <button type="button" className="text-xs font-semibold text-red-700 hover:underline" onClick={() => acciones.anular(item)}>Anular</button>
          ) : (
            <span className="flex items-center gap-0.5">
              <button type="button" className="btn-icon" aria-label={`Menos ${item.nombre}`} onClick={() => (item.cantidad > 1 ? acciones.cantidad(item, item.cantidad - 1) : acciones.quitar(item))}><Minus className="w-4 h-4" /></button>
              <button type="button" className="btn-icon" aria-label={`Más ${item.nombre}`} onClick={() => acciones.cantidad(item, item.cantidad + 1)}><Plus className="w-4 h-4" /></button>
              <button type="button" className="btn-icon" aria-label={`Quitar ${item.nombre}`} onClick={() => acciones.quitar(item)}><Trash2 className="w-4 h-4" /></button>
              <button type="button" className="btn-icon" aria-label={`Nota para ${item.nombre}`} onClick={() => acciones.nota(item)}><MessageSquareText className="w-4 h-4" /></button>
            </span>
          )
        )}
      </div>
    </li>
  );
};

/** Una cuenta abierta: se piden platos, se envían a cocina y se cobra (todo o por partes). */
const CuentaPanel = ({ cuentaId, onVolver, tablero }) => {
  const qc = useQueryClient();
  const { can } = usePermisos();
  const activeEmpresa = useAuthStore((s) => s.activeEmpresa);
  const empresaId = activeEmpresa?.id;
  const modulos = activeEmpresa?.modulos || [];
  const ahora = useAhora();
  const puedeAnular = can('mesas.anular_items');
  const { opcion } = useOpciones();
  const menuOpc = useMenu();
  const conUnir = opcion('unir_cuentas', true);
  const porPersona = opcion('cuenta_por_persona', true);
  const conCocina = modulos.includes('Cocina');

  const claveCuenta = ['empresa', empresaId ?? null, 'cuentas', cuentaId];
  const { data: cuenta, isLoading, isError, error } = useEmpresaQuery(['cuentas', cuentaId], `/cuentas/${cuentaId}`, { refetchInterval: 10_000 });
  const { data: productos = [] } = useEmpresaQuery(['productos'], '/productos');
  const { data: servicios = [] } = useEmpresaQuery(['servicios'], '/servicios', { enabled: modulos.includes('Servicios') });
  const { data: modificadores = [] } = useEmpresaQuery(['modificadores'], '/modificadores', { enabled: modulos.includes('Recetas') });

  const [imprimir, setImprimir] = useState(() => leerImprimir(!conCocina));
  const [pidiendo, setPidiendo] = useState(null); // plato con extras que se está pidiendo { opcion, mods, nota, cantidad }
  const [dialogo, setDialogo] = useState(null); // { tipo: 'anular'|'nota'|'cancelar'|'mover', item? }
  const [texto, setTexto] = useState('');
  const [mesaDestino, setMesaDestino] = useState('');
  const [cobrando, setCobrando] = useState(false);
  const [comensalActivo, setComensalActivo] = useState(null); // para quién se pide ahora (null = para todos)
  const [cobrarA, setCobrarA] = useState(null); // persona a la que se le cobra lo suyo al abrir el cobro
  const [resultado, setResultado] = useState(null); // respuesta del cobro
  const [aviso, setAviso] = useState(null);
  const [error_, setError] = useState(null);

  const refrescarTablero = () => qc.invalidateQueries({ queryKey: ['empresa', empresaId ?? null, 'mesas'] });
  const aplicar = (res) => { qc.setQueryData(claveCuenta, res.data); refrescarTablero(); setError(null); };
  const fallar = (err) => { setError(apiError(err, 'No se pudo completar la acción')); qc.invalidateQueries({ queryKey: claveCuenta }); };

  const agregar = useMutation({ mutationFn: (b) => api.post(`/cuentas/${cuentaId}/items`, b), onSuccess: aplicar, onError: fallar });
  const editar = useMutation({ mutationFn: ({ id, ...b }) => api.patch(`/cuentas/${cuentaId}/items/${id}`, b), onSuccess: (r) => { aplicar(r); setDialogo(null); }, onError: fallar });
  const reasignar = (item, valor) => editar.mutate({ id: item.id, comensal: valor === '' ? null : Number(valor) });
  const quitar = useMutation({ mutationFn: (id) => api.delete(`/cuentas/${cuentaId}/items/${id}`), onSuccess: aplicar, onError: fallar });
  const anularItem = useMutation({ mutationFn: ({ id, motivo }) => api.post(`/cuentas/${cuentaId}/items/${id}/anular`, { motivo }), onSuccess: (r) => { aplicar(r); setDialogo(null); }, onError: (e) => { setDialogo(null); fallar(e); } });
  const mover = useMutation({ mutationFn: (mesaId) => api.post(`/cuentas/${cuentaId}/mover`, { mesaId }), onSuccess: (r) => { aplicar(r); setDialogo(null); }, onError: (e) => { setDialogo(null); fallar(e); } });
  const unir = useMutation({
    mutationFn: (otraId) => api.post(`/cuentas/${cuentaId}/unir`, { cuentaId: otraId }),
    onSuccess: (r) => { aplicar(r); qc.invalidateQueries({ queryKey: ['empresa'] }); setDialogo(null); setAviso('Cuentas unidas: todo quedó en esta cuenta.'); },
    onError: (e) => { setDialogo(null); fallar(e); },
  });
  const cancelar = useMutation({
    mutationFn: (motivo) => api.post(`/cuentas/${cuentaId}/cancelar`, { motivo }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['empresa'] }); onVolver(); },
    onError: (e) => { setDialogo(null); fallar(e); },
  });
  const enviar = useMutation({
    mutationFn: () => api.post(`/cuentas/${cuentaId}/enviar`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['empresa'] });
      setError(null);
      const comandas = res.data.comandas;
      const destino = comandas.length > 1
        ? comandas.map((c) => `#${c.id} (${c.estacion})`).join(' y ')
        : `#${comandas[0].id}${comandas[0].estacion && comandas[0].estacion !== 'Cocina' ? ` (${comandas[0].estacion})` : ''}`;
      setAviso(`${comandas.length > 1 ? 'Comandas' : 'Comanda'} ${destino} enviada${comandas.length > 1 ? 's' : ''} a ${conCocina ? 'cocina' : 'preparación'}.`);
      // Un ticket por estación: cada una imprime el suyo.
      if (imprimir) comandas.forEach((c, i) => setTimeout(() => imprimirComanda(c, { empresa: activeEmpresa?.nombre }), i * 800));
    },
    onError: fallar,
  });

  const modsDe = (o) => (o.tipo === 'RECETA' && hayOferta(o.producto, modificadores, menuOpc.grupos) ? modificadores : []);
  const elegir = (o) => {
    setError(null);
    setAviso(null);
    if (modsDe(o).length > 0) return setPidiendo({ opcion: o, mods: [], nota: '', cantidad: 1 });
    agregar.mutate({ ...(o.producto ? { productoId: o.producto.id } : { servicioId: o.servicio.id }), ...(comensalActivo ? { comensal: comensalActivo } : {}) });
  };
  const confirmarPedido = (e) => {
    e.preventDefault();
    agregar.mutate({ productoId: pidiendo.opcion.producto.id, cantidad: pidiendo.cantidad, modificadores: pidiendo.mods, nota: pidiendo.nota.trim() || undefined, ...(comensalActivo ? { comensal: comensalActivo } : {}) });
    setPidiendo(null);
  };

  const descargarFactura = async (ventaId) => {
    try {
      const { data } = await api.get(`/ventas/${ventaId}`);
      generateInvoicePDF(data, data.Empresa || activeEmpresa);
    } catch (err) {
      setError(apiError(err, 'No se pudo generar la factura'));
    }
  };

  const reimprimir = async (comandaId) => {
    try {
      const { data } = await api.get(`/comandas/${comandaId}`);
      imprimirComanda(data, { empresa: activeEmpresa?.nombre, reimpresion: true });
    } catch (err) {
      setError(apiError(err, 'No se pudo cargar la comanda'));
    }
  };

  if (isLoading) return <p className="py-12 text-center text-slate-500" role="status">Cargando cuenta…</p>;
  if (isError || !cuenta) {
    return (
      <div className="space-y-4">
        <button type="button" className="btn-secondary gap-2" onClick={onVolver}><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Volver al tablero</button>
        <FormError message={apiError(error, 'No se encontró la cuenta.')} />
      </div>
    );
  }

  const abierta = cuenta.estado === 'ABIERTA';
  const comandaPorId = new Map(cuenta.comandas.map((c) => [c.id, c]));
  const porEnviar = cuenta.items.filter((i) => i.estado === 'ACTIVO' && !i.enviado && !i.ventaId);
  const pendientesCobro = cuenta.items.filter((i) => i.estado === 'ACTIVO' && !i.ventaId);
  const acciones = {
    cantidad: (item, cantidad) => editar.mutate({ id: item.id, cantidad }),
    quitar: (item) => quitar.mutate(item.id),
    anular: (item) => { setTexto(''); setDialogo({ tipo: 'anular', item }); },
    nota: (item) => { setTexto(item.nota || ''); setDialogo({ tipo: 'nota', item }); },
  };
  const ocupada = (m) => m.cuenta && m.cuenta.id !== cuenta.id;
  const mesasLibres = (tablero?.mesas || []).filter((m) => !ocupada(m) && m.id !== cuenta.mesa?.id);
  const Icono = cuenta.mesa ? Armchair : ShoppingBag;
  const otrasCuentas = [...(tablero?.mesas || []).map((m) => m.cuenta).filter(Boolean), ...(tablero?.sin_mesa || [])].filter((c) => c.id !== cuenta.id);
  const propinaPct = tablero?.config?.propina_sugerida_pct ?? 10;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary gap-2" onClick={onVolver}><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Mesas</button>
        <div className="min-w-0">
          <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Icono className="w-6 h-6 text-brand-700" aria-hidden="true" /> {cuenta.nombre}
            <span className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${abierta ? 'bg-brand-700 text-white' : cuenta.estado === 'COBRADA' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{cuenta.estado}</span>
          </h3>
          <p className="text-sm text-slate-500 flex flex-wrap gap-x-3">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" aria-hidden="true" /> abierta hace {hace(cuenta.abierta_en, ahora)}</span>
            <span>Atiende: {cuenta.mesero?.nombre}</span>
            {cuenta.comensales ? <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden="true" /> {cuenta.comensales}</span> : null}
          </p>
        </div>
        {abierta && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className="btn-secondary gap-2" onClick={() => { setMesaDestino(''); setDialogo({ tipo: 'mover' }); }}><ArrowRightLeft className="w-4 h-4" aria-hidden="true" /> Cambiar mesa</button>
            {conUnir && <button type="button" className="btn-secondary gap-2" disabled={otrasCuentas.length === 0} title={otrasCuentas.length === 0 ? 'No hay otra cuenta abierta' : undefined} onClick={() => { setMesaDestino(''); setDialogo({ tipo: 'unir' }); }}><Combine className="w-4 h-4" aria-hidden="true" /> Unir con otra cuenta</button>}
            <button type="button" className="btn-secondary gap-2 hover:bg-red-50 hover:text-red-700" onClick={() => { setTexto(''); setDialogo({ tipo: 'cancelar' }); }}><Ban className="w-4 h-4" aria-hidden="true" /> Cancelar cuenta</button>
          </div>
        )}
      </div>

      <FormError message={error_} onDismiss={() => setError(null)} />
      {aviso && <p role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3">{aviso}</p>}
      {!abierta && (
        <p role="status" className="rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-sm px-4 py-3">
          {cuenta.estado === 'COBRADA' ? 'Esta cuenta ya se cobró por completo.' : `Esta cuenta se canceló${cuenta.motivo_cancelacion ? `: ${cuenta.motivo_cancelacion}` : '.'}`}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 items-start">
        {abierta ? (
          <section aria-label="Catálogo" className="card-container p-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Agregar a la cuenta</h4>
            {porPersona && cuenta.comensales > 1 && (
              <div role="radiogroup" aria-label="Pedir para" className="flex flex-wrap items-center gap-1.5 mb-3 text-xs">
                <span className="text-slate-500 mr-1">Pedir para:</span>
                {[null, ...Array.from({ length: cuenta.comensales }, (_, k) => k + 1)].map((n) => (
                  <label key={n ?? 'todos'} className={`rounded-lg border px-2.5 py-1 cursor-pointer focus-within:ring-2 focus-within:ring-brand-600 ${comensalActivo === n ? 'bg-brand-700 text-white border-brand-700 font-semibold' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                    <input type="radio" className="sr-only" name="pedir-para" checked={comensalActivo === n} onChange={() => setComensalActivo(n)} />
                    {n == null ? 'Todos' : `Persona ${n}`}
                  </label>
                ))}
              </div>
            )}
            <ProductPicker productos={productos} servicios={servicios} onElegir={elegir} deshabilitado={agregar.isPending} />
          </section>
        ) : <span />}

        <section aria-label="Cuenta" className="card-container p-4 lg:sticky lg:top-24">
          <h4 className="text-sm font-semibold text-slate-700 mb-1">Pedido</h4>
          {cuenta.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Aún no hay nada pedido.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {cuenta.items.map((i) => <FilaItem key={i.id} item={i} comandaPorId={comandaPorId} puedeAnular={puedeAnular} acciones={acciones} bloqueado={!abierta} comensales={porPersona ? (cuenta.comensales || 0) : 0} onReasignar={reasignar} />)}
            </ul>
          )}

          <dl className="mt-3 pt-3 border-t border-slate-200 text-sm space-y-1">
            {cuenta.totales.cobrado > 0 && <div className="flex justify-between"><dt className="text-slate-500">Ya cobrado</dt><dd className="font-semibold text-emerald-700">{formatCOP(cuenta.totales.cobrado)}</dd></div>}
            <div className="flex justify-between text-lg"><dt className="font-semibold text-slate-800">{cuenta.totales.cobrado > 0 ? 'Falta por cobrar' : 'Total'}</dt><dd className="font-bold text-slate-900">{formatCOP(cuenta.totales.pendiente)}</dd></div>
          </dl>

          {porPersona && cuenta.por_comensal.some((g) => g.comensal != null) && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Por persona</h5>
              <ul className="space-y-1 text-sm">
                {cuenta.por_comensal.map((g) => (
                  <li key={g.comensal ?? 'todos'} className="flex items-center justify-between gap-2">
                    <span>{g.comensal == null ? 'Para todos' : `Persona ${g.comensal}`} <span className="text-slate-500">· {formatCOP(g.total)}{g.pendiente !== g.total ? ` (faltan ${formatCOP(g.pendiente)})` : ''}</span></span>
                    {abierta && g.comensal != null && g.pendiente > 0 && (
                      <button type="button" className="btn-secondary text-xs" onClick={() => { setError(null); setCobrarA(g.comensal); setCobrando(true); }} aria-label={`Cobrar lo de la persona ${g.comensal}`}>Cobrar P{g.comensal}</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {abierta && (
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" className="w-4 h-4 text-brand-700 rounded border-slate-300 focus:ring-brand-600" checked={imprimir} onChange={(e) => { setImprimir(e.target.checked); guardarImprimir(e.target.checked); }} />
                Imprimir la comanda al enviar
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-secondary gap-2" disabled={porEnviar.length === 0 || enviar.isPending} onClick={() => { setAviso(null); enviar.mutate(); }}>
                  <ChefHat className="w-4 h-4" aria-hidden="true" /> {enviar.isPending ? 'Enviando…' : `Enviar (${porEnviar.length})`}
                </button>
                <button type="button" className="btn-primary gap-2" disabled={pendientesCobro.length === 0} onClick={() => { setError(null); setCobrarA(null); setCobrando(true); }}>
                  <Receipt className="w-4 h-4" aria-hidden="true" /> Cobrar
                </button>
              </div>
            </div>
          )}

          {cuenta.comandas.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-200">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Comandas</h5>
              <ul className="space-y-1 text-sm">
                {cuenta.comandas.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span>#{c.id} <span className={`ml-1 text-[11px] rounded px-1.5 py-0.5 font-semibold ${ESTADO_COMANDA[c.estado].tono}`}>{ESTADO_COMANDA[c.estado].texto}</span></span>
                    <button type="button" className="btn-icon" aria-label={`Reimprimir la comanda ${c.id}`} onClick={() => reimprimir(c.id)}><Printer className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {cuenta.ventas.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-200">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Cobros</h5>
              <ul className="space-y-1 text-sm">
                {cuenta.ventas.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <span>Venta #{v.id} · {formatCOP(v.total)}{v.propina > 0 ? ` + ${formatCOP(v.propina)} propina` : ''}{v.estado === 'ANULADA' ? ' (anulada)' : ''}</span>
                    <button type="button" className="btn-icon" aria-label={`Descargar la factura de la venta ${v.id}`} onClick={() => descargarFactura(v.id)}><FileDown className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* Plato con extras */}
      <Modal open={!!pidiendo} onClose={() => setPidiendo(null)} title={pidiendo ? pidiendo.opcion.nombre : ''} size="md">
        {pidiendo && (
          <form onSubmit={confirmarPedido} className="space-y-4">
            <SelectorModificadores
              plato={pidiendo.opcion.producto} modificadores={modificadores} grupos={menuOpc.grupos}
              valor={pidiendo.mods} onChange={(mods) => setPidiendo({ ...pidiendo, mods })}
            />
            {faltaElegir(pidiendo.opcion.producto, modificadores, menuOpc.grupos, pidiendo.mods) && (
              <p role="status" className="text-sm font-medium text-amber-800">{faltaElegir(pidiendo.opcion.producto, modificadores, menuOpc.grupos, pidiendo.mods)}</p>
            )}
            <div className="grid grid-cols-[6rem_1fr] gap-3">
              <Field label="Cantidad">
                <input type="number" min="1" className="input-field" value={pidiendo.cantidad} onChange={(e) => setPidiendo({ ...pidiendo, cantidad: Math.max(1, Number(e.target.value) || 1) })} />
              </Field>
              <Field label="Nota para cocina (opcional)">
                <input className="input-field" maxLength={200} placeholder="Sin cebolla, bien cocido…" value={pidiendo.nota} onChange={(e) => setPidiendo({ ...pidiendo, nota: e.target.value })} />
              </Field>
            </div>
            <ModalActions>
              <button type="button" className="btn-secondary" onClick={() => setPidiendo(null)}>Cancelar</button>
              <button type="submit" className="btn-primary px-6" disabled={!!faltaElegir(pidiendo.opcion.producto, modificadores, menuOpc.grupos, pidiendo.mods)}>Agregar</button>
            </ModalActions>
          </form>
        )}
      </Modal>

      {/* Anular ítem enviado / nota / cancelar cuenta / cambiar mesa */}
      <Modal
        open={!!dialogo} onClose={() => setDialogo(null)} size="md"
        title={{ anular: 'Anular pedido ya enviado', nota: 'Nota para cocina', cancelar: 'Cancelar la cuenta', mover: 'Cambiar de mesa', unir: 'Unir con otra cuenta' }[dialogo?.tipo] || ''}
      >
        {dialogo?.tipo === 'mover' && (
          <form onSubmit={(e) => { e.preventDefault(); if (mesaDestino) mover.mutate(Number(mesaDestino)); }} className="space-y-4">
            <Field label="Mesa libre" required>
              <select className="input-field" value={mesaDestino} onChange={(e) => setMesaDestino(e.target.value)} autoFocus>
                <option value="">Elige una mesa…</option>
                {mesasLibres.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </Field>
            <ModalActions>
              <button type="button" className="btn-secondary" onClick={() => setDialogo(null)}>Volver</button>
              <button type="submit" className="btn-primary px-6" disabled={!mesaDestino || mover.isPending}>Pasar la cuenta</button>
            </ModalActions>
          </form>
        )}
        {dialogo?.tipo === 'unir' && (
          <form onSubmit={(e) => { e.preventDefault(); if (mesaDestino) unir.mutate(Number(mesaDestino)); }} className="space-y-4">
            <p className="text-sm text-slate-600">Todo lo pedido en la otra cuenta pasa a <strong>{cuenta.nombre}</strong> y esa mesa queda libre. Solo se puede si de la otra aún no se cobró nada.</p>
            <Field label="Cuenta que se une a esta" required>
              <select className="input-field" value={mesaDestino} onChange={(e) => setMesaDestino(e.target.value)} autoFocus>
                <option value="">Elige una cuenta…</option>
                {otrasCuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {formatCOP(c.total)}</option>)}
              </select>
            </Field>
            <ModalActions>
              <button type="button" className="btn-secondary" onClick={() => setDialogo(null)}>Volver</button>
              <button type="submit" className="btn-primary px-6" disabled={!mesaDestino || unir.isPending}>Unir cuentas</button>
            </ModalActions>
          </form>
        )}
        {dialogo?.tipo === 'nota' && (
          <form onSubmit={(e) => { e.preventDefault(); editar.mutate({ id: dialogo.item.id, nota: texto.trim() || null }); }} className="space-y-4">
            <Field label={dialogo.item.nombre}>
              <input className="input-field" autoFocus maxLength={200} placeholder="Sin cebolla, para llevar…" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </Field>
            <ModalActions>
              <button type="button" className="btn-secondary" onClick={() => setDialogo(null)}>Cancelar</button>
              <button type="submit" className="btn-primary px-6" disabled={editar.isPending}>Guardar nota</button>
            </ModalActions>
          </form>
        )}
        {(dialogo?.tipo === 'anular' || dialogo?.tipo === 'cancelar') && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (texto.trim().length < 3) return; if (dialogo.tipo === 'anular') anularItem.mutate({ id: dialogo.item.id, motivo: texto.trim() }); else cancelar.mutate(texto.trim()); }}
            className="space-y-4"
          >
            <p className="text-sm text-slate-600">
              {dialogo.tipo === 'anular'
                ? `«${dialogo.item.nombre}» ya salió a cocina. Queda registrado quién lo anula y por qué, y la comanda lo muestra tachado.`
                : 'Se anulan todos los pedidos de la cuenta y la mesa queda libre. Queda registrado.'}
            </p>
            <Field label="Motivo" required>
              <input className="input-field" autoFocus maxLength={300} placeholder="El cliente se arrepintió, error al digitar…" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </Field>
            <ModalActions>
              <button type="button" className="btn-secondary" onClick={() => setDialogo(null)}>Volver</button>
              <button type="submit" className="btn-danger px-6" disabled={texto.trim().length < 3 || anularItem.isPending || cancelar.isPending}>
                {dialogo.tipo === 'anular' ? 'Anular pedido' : 'Cancelar cuenta'}
              </button>
            </ModalActions>
          </form>
        )}
      </Modal>

      {cobrando && <CobrarModal cuenta={cuenta} propinaPct={propinaPct} persona={cobrarA} onClose={() => setCobrando(false)} onCobrado={(res) => { setCobrando(false); qc.setQueryData(claveCuenta, res.cuenta); setResultado(res); }} />}

      <Modal open={!!resultado} onClose={() => setResultado(null)} title="Cobro registrado" size="md">
        {resultado && (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-emerald-700 font-semibold"><CheckCircle2 className="w-5 h-5" aria-hidden="true" /> Venta #{resultado.venta.id} por {formatCOP(resultado.venta.total)}{Number(resultado.venta.propina) > 0 ? ` + ${formatCOP(resultado.venta.propina)} de propina` : ''}.</p>
            <p className="text-sm text-slate-600">{resultado.cuenta_cerrada ? 'La cuenta quedó cobrada y la mesa libre.' : `Falta por cobrar ${formatCOP(resultado.cuenta.totales.pendiente)} de esta cuenta.`}</p>
            <ModalActions>
              <button type="button" className="btn-secondary gap-2" onClick={() => descargarFactura(resultado.venta.id)}><FileDown className="w-4 h-4" aria-hidden="true" /> Factura (PDF)</button>
              {resultado.cuenta_cerrada
                ? <button type="button" className="btn-primary px-6" onClick={() => { setResultado(null); onVolver(); }}>Volver a las mesas</button>
                : <button type="button" className="btn-primary px-6" onClick={() => setResultado(null)}>Seguir con la cuenta</button>}
            </ModalActions>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CuentaPanel;
