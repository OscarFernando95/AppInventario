import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { ClipboardCheck, CheckCircle2, MinusCircle, ScanSearch, TriangleAlert, MessageCircle, Mail, Trophy } from 'lucide-react';
import { formatCOP, formatCantidad, fechaLocal } from '../../utils/format';
import { unidadCorta } from '../../utils/unidades';
import { enlaceWhatsApp, enlaceCorreo, mensajeAlertas } from '../../utils/avisos';
import { useAuthStore } from '../../store/authStore';
import { usePermisos } from '../../hooks/usePermisos';
import { useEmpresaQuery } from '../../hooks/useEmpresaQuery';
import FormError from '../../components/FormError';
import { apiError } from '../../utils/apiError';
import SearchableSelect from '../../components/SearchableSelect';
import SearchInput from '../../components/ui/SearchInput';
import PageHeader from '../../components/ui/PageHeader';
import Tabs from '../../components/ui/Tabs';
import Modal, { ModalActions } from '../../components/ui/Modal';
import Field from '../../components/ui/Field';
import FilterBar from '../../components/ui/FilterBar';
import TablePagination from '../../components/ui/TablePagination';
import { TableCard, THead, Th, Tr, Td } from '../../components/ui/Table';
import { TableState } from '../../components/ui/DataState';

const LIMIT = 20;
const TIPOS = {
  MERMA: 'Merma',
  VENCIDO: 'Vencido',
  CONSUMO_INTERNO: 'Consumo interno',
  CONTEO: 'Conteo físico',
};
const FILTROS_VACIOS = { tipo: '', desde: '', hasta: '' };

/** Platos y preparaciones no tienen stock propio (se descuenta de sus ingredientes), salvo las preparaciones por lotes. */
const conStockPropio = (p) => !['RECETA', 'PREPARACION'].includes(p.tipo) || !!p.por_lotes;

const fmtFecha = (v) => new Date(v).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Botones para avisar de una alerta por WhatsApp o correo (abren la aplicación con el mensaje listo). */
const AvisarAlertas = ({ alertas, contacto, umbral }) => {
  const empresa = useAuthStore((st) => st.activeEmpresa?.nombre) || 'la empresa';
  const texto = mensajeAlertas(alertas, empresa, umbral);
  const wa = enlaceWhatsApp(contacto?.whatsapp, texto);
  const correo = enlaceCorreo(contacto?.correo, `Alerta de inventario en ${empresa}`, texto);
  if (!wa && !correo) return <p className="text-xs">Para avisar con un clic, indica a quién en «Avisar a» (pestaña Desviaciones).</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs gap-1.5"><MessageCircle className="w-3.5 h-3.5" aria-hidden="true" /> Avisar por WhatsApp</a>}
      {correo && <a href={correo} className="btn-secondary text-xs gap-1.5"><Mail className="w-3.5 h-3.5" aria-hidden="true" /> Avisar por correo</a>}
    </div>
  );
};

/* ───────────────────────── Mermas y ajustes ───────────────────────── */
const Mermas = () => {
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [offset, setOffset] = useState(0);
  const [form, setForm] = useState({ productoId: '', tipo: 'MERMA', cantidad: '', motivo: '' });
  const [formError, setFormError] = useState(null);
  const [okMsg, setOkMsg] = useState(null);
  const hayFiltros = Object.values(filtros).some(Boolean);

  const { data: productos = [] } = useEmpresaQuery(['productos'], '/productos');
  const conStock = useMemo(() => productos.filter(conStockPropio), [productos]);
  const opciones = useMemo(
    () => conStock.map((p) => ({ value: String(p.id), label: `${p.nombre_producto} · ${formatCantidad(p.stock_actual)} ${unidadCorta(p.unidad_medida)}`, keywords: p.codigo })),
    [conStock]
  );
  const seleccionado = conStock.find((p) => String(p.id) === form.productoId);

  const params = () => {
    const p = {};
    Object.entries(filtros).forEach(([k, v]) => { if (v) p[k] = v; });
    return p;
  };
  const { data: historial, isLoading, isError, error, refetch } = useEmpresaQuery(['ajustes', filtros, offset], async () => {
    const res = await api.get('/ajustes', { params: { ...params(), limit: LIMIT, offset } });
    return { rows: res.data, total: Number(res.headers['x-total-count'] || 0) };
  });
  const { data: resumen } = useEmpresaQuery(['ajustes', 'resumen', filtros.desde, filtros.hasta], async () => {
    const p = {};
    if (filtros.desde) p.desde = filtros.desde;
    if (filtros.hasta) p.hasta = filtros.hasta;
    return (await api.get('/ajustes/resumen', { params: p })).data;
  });

  const registrar = useMutation({
    mutationFn: (payload) => api.post('/ajustes', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['empresa'] });
      setForm({ productoId: '', tipo: form.tipo, cantidad: '', motivo: '' });
      setFormError(null);
      setOkMsg(`Registrado: ${formatCOP(Math.abs(res.data.valor))} de pérdida.`);
    },
    onError: (err) => { setOkMsg(null); setFormError(apiError(err, 'No se pudo registrar el ajuste')); },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError(null);
    setOkMsg(null);
    if (!form.productoId) return setFormError('Elige el producto.');
    if (!(Number(form.cantidad) > 0)) return setFormError('La cantidad debe ser mayor a 0.');
    registrar.mutate({
      productoId: Number(form.productoId), tipo: form.tipo, cantidad: Number(form.cantidad), motivo: form.motivo || undefined,
    });
  };

  const actualizarFiltro = (patch) => { setOffset(0); setFiltros((prev) => ({ ...prev, ...patch })); };
  const perdidas = (resumen?.por_tipo || []).filter((r) => r.valor !== 0);

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="card-container p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Registrar una salida de inventario</h3>
        <FormError message={formError} onDismiss={() => setFormError(null)} />
        {okMsg && (
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {okMsg}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <Field label="Producto" required className="md:col-span-5">
            <SearchableSelect options={opciones} value={form.productoId} onChange={(v) => setForm({ ...form, productoId: v })} placeholder="Buscar producto o insumo…" />
          </Field>
          <Field label="Motivo del ajuste" required className="md:col-span-3">
            <select className="input-field" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="MERMA">Merma (se dañó / se cayó)</option>
              <option value="VENCIDO">Vencido</option>
              <option value="CONSUMO_INTERNO">Consumo interno</option>
            </select>
          </Field>
          <Field label={`Cantidad${seleccionado ? ` (${unidadCorta(seleccionado.unidad_medida)})` : ''}`} required className="md:col-span-2">
            <input type="number" min="0" step="any" className="input-field" placeholder="0" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
          </Field>
          <button type="submit" disabled={registrar.isPending} className="btn-primary md:col-span-2 h-[42px]">
            {registrar.isPending ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
        <Field label="Detalle (opcional)">
          <input className="input-field" maxLength={500} placeholder="Se humedeció el empaque, cumpleaños del personal…" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
        </Field>
      </form>

      <FilterBar hayFiltros={hayFiltros} onLimpiar={() => actualizarFiltro(FILTROS_VACIOS)}>
        <Field label="Tipo" className="w-full sm:w-48">
          <select className="input-field" value={filtros.tipo} onChange={(e) => actualizarFiltro({ tipo: e.target.value })}>
            <option value="">Todos</option>
            {Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Desde" className="w-full sm:w-44">
          <input type="date" className="input-field" value={filtros.desde} onChange={(e) => actualizarFiltro({ desde: e.target.value })} />
        </Field>
        <Field label="Hasta" className="w-full sm:w-44">
          <input type="date" className="input-field" value={filtros.hasta} onChange={(e) => actualizarFiltro({ hasta: e.target.value })} />
        </Field>
      </FilterBar>

      {perdidas.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {perdidas.map((r) => (
            <div key={r.tipo} className="card-container px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{TIPOS[r.tipo] || r.tipo} · {r.num}</p>
              <p className={`text-lg font-bold ${r.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatCOP(r.valor)}</p>
            </div>
          ))}
          <div className="card-container px-4 py-3 bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total valorizado</p>
            <p className={`text-lg font-bold ${resumen.valor_total < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatCOP(resumen.valor_total)}</p>
          </div>
        </div>
      )}

      <TableCard>
        <THead>
          <Th>Fecha</Th>
          <Th>Producto</Th>
          <Th>Tipo</Th>
          <Th align="right">Antes → Después</Th>
          <Th align="right">Diferencia</Th>
          <Th align="right">Valor</Th>
          <Th>Registró</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={7} isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
            isEmpty={(historial?.rows || []).length === 0} emptyIcon={ClipboardCheck}
            emptyTitle={hayFiltros ? 'Sin ajustes para este filtro' : 'Aún no hay ajustes'} emptyHint="Aquí queda el historial de mermas, vencidos y conteos."
          />
          {(historial?.rows || []).map((a) => {
            const u = unidadCorta(a.Producto?.unidad_medida);
            return (
              <Tr key={a.id}>
                <Td className="text-sm text-slate-600 whitespace-nowrap">{fmtFecha(a.fecha)}</Td>
                <Td className="font-medium text-slate-800">
                  {a.Producto?.nombre_producto}
                  {a.motivo && <span className="block text-xs font-normal text-slate-500">{a.motivo}</span>}
                </Td>
                <Td><span className="text-xs font-semibold px-2 py-1 rounded-md bg-slate-100 text-slate-700 whitespace-nowrap">{TIPOS[a.tipo] || a.tipo}</span></Td>
                <Td align="right" className="text-sm whitespace-nowrap">{formatCantidad(a.cantidad_anterior)} → {formatCantidad(a.cantidad_nueva)} {u}</Td>
                <Td align="right" className={`font-semibold whitespace-nowrap ${Number(a.diferencia) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {Number(a.diferencia) > 0 ? '+' : ''}{formatCantidad(a.diferencia)} {u}
                </Td>
                <Td align="right" className="font-semibold whitespace-nowrap">{formatCOP(a.valor)}</Td>
                <Td className="text-sm text-slate-600">{a.Usuario?.nombre}</Td>
              </Tr>
            );
          })}
        </tbody>
      </TableCard>
      <TablePagination total={historial?.total || 0} offset={offset} limit={LIMIT} onChange={setOffset} />
    </div>
  );
};

/* ───────────────────────── Conteo físico ───────────────────────── */
const Conteo = () => {
  const queryClient = useQueryClient();
  const { data: productos = [], isLoading, isError, error, refetch } = useEmpresaQuery(['productos'], '/productos');
  const [busqueda, setBusqueda] = useState('');
  const [contado, setContado] = useState({}); // productoId -> texto del input
  const [motivo, setMotivo] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [formError, setFormError] = useState(null);
  const [resultado, setResultado] = useState(null);

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos
      .filter(conStockPropio)
      .filter((p) => !q || `${p.codigo} ${p.nombre_producto}`.toLowerCase().includes(q));
  }, [productos, busqueda]);

  // Solo se cuentan las filas que el usuario llenó; el resto no se toca.
  const filas = useMemo(() => productos
    .filter((p) => contado[p.id] !== undefined && contado[p.id] !== '')
    .map((p) => {
      const real = Number(contado[p.id]);
      const dif = Math.round((real - Number(p.stock_actual)) * 1000) / 1000;
      return { p, real, dif, valor: dif * Number(p.costo_promedio || 0) };
    }), [productos, contado]);
  const conDiferencia = filas.filter((f) => Math.abs(f.dif) >= 0.0005);
  const valorTotal = conDiferencia.reduce((a, f) => a + f.valor, 0);

  const enviar = useMutation({
    mutationFn: (payload) => api.post('/ajustes/conteo', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['empresa'] });
      setConfirmar(false);
      setContado({});
      setMotivo('');
      setFormError(null);
      setResultado(res.data);
    },
    onError: (err) => { setConfirmar(false); setFormError(apiError(err, 'No se pudo registrar el conteo')); },
  });

  const handleEnviar = () => {
    enviar.mutate({
      motivo: motivo || undefined,
      items: filas.map((f) => ({ productoId: f.p.id, cantidad_contada: f.real })),
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 max-w-3xl">
        Cuenta lo que hay en bodega y escríbelo en «Contado». Compara con lo que dice el sistema (stock teórico) y, al confirmar, el stock se corrige y la diferencia queda valorizada.
        Solo se ajustan las filas que llenes.
      </p>

      <FormError message={formError} onDismiss={() => setFormError(null)} />

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput placeholder="Código o nombre…" value={busqueda} onChange={setBusqueda} className="w-full sm:w-72" />
        <div className="flex-1" />
        <p className="text-sm text-slate-600">
          {filas.length} contado(s) · {conDiferencia.length} con diferencia ·{' '}
          <strong className={valorTotal < 0 ? 'text-red-700' : 'text-emerald-700'}>{formatCOP(valorTotal)}</strong>
        </p>
        <button className="btn-primary" disabled={filas.length === 0} onClick={() => { setFormError(null); setConfirmar(true); }}>
          Revisar y confirmar
        </button>
      </div>

      <TableCard>
        <THead>
          <Th>Producto</Th>
          <Th align="right">En sistema</Th>
          <Th align="center" className="w-40">Contado</Th>
          <Th align="right">Diferencia</Th>
          <Th align="right">Valor</Th>
        </THead>
        <tbody>
          <TableState
            colSpan={5} isLoading={isLoading} isError={isError} error={error} onRetry={refetch}
            isEmpty={lista.length === 0} emptyIcon={ClipboardCheck}
            emptyTitle={busqueda ? 'Sin productos para esta búsqueda' : 'No hay productos para contar'} emptyHint="Aquí aparecen los productos e insumos con stock propio."
          />
          {lista.map((p) => {
            const fila = filas.find((f) => f.p.id === p.id);
            const u = unidadCorta(p.unidad_medida);
            return (
              <Tr key={p.id}>
                <Td className="font-medium text-slate-800">
                  {p.nombre_producto}
                  <span className="block text-xs font-mono font-normal text-slate-500">{p.codigo}</span>
                </Td>
                <Td align="right" className="whitespace-nowrap">{formatCantidad(p.stock_actual)} {u}</Td>
                <Td align="center">
                  <input
                    type="number" min="0" step="any" className="input-field text-right" aria-label={`Contado de ${p.nombre_producto}`}
                    value={contado[p.id] ?? ''} onChange={(e) => setContado((c) => ({ ...c, [p.id]: e.target.value }))}
                  />
                </Td>
                <Td align="right" className={`font-semibold whitespace-nowrap ${!fila ? 'text-slate-300' : Math.abs(fila.dif) < 0.0005 ? 'text-emerald-700' : fila.dif < 0 ? 'text-red-700' : 'text-amber-700'}`}>
                  {!fila ? '—' : Math.abs(fila.dif) < 0.0005 ? 'Cuadra' : `${fila.dif > 0 ? '+' : ''}${formatCantidad(fila.dif)} ${u}`}
                </Td>
                <Td align="right" className="whitespace-nowrap">{fila && Math.abs(fila.dif) >= 0.0005 ? formatCOP(fila.valor) : '—'}</Td>
              </Tr>
            );
          })}
        </tbody>
      </TableCard>

      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="Confirmar conteo físico" description="El stock del sistema se reemplaza por lo contado en las filas con diferencia." size="lg">
        <div className="space-y-4">
          {conDiferencia.length === 0 ? (
            <p className="text-sm text-emerald-700 font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Todo lo contado cuadra con el sistema. No hay nada que ajustar.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <tbody>
                  {conDiferencia.map((f) => (
                    <tr key={f.p.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 text-slate-800">{f.p.nombre_producto}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-slate-600">{formatCantidad(f.p.stock_actual)} → {formatCantidad(f.real)}</td>
                      <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${f.dif < 0 ? 'text-red-700' : 'text-amber-700'}`}>{formatCOP(f.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm text-slate-700">Total valorizado: <strong className={valorTotal < 0 ? 'text-red-700' : 'text-emerald-700'}>{formatCOP(valorTotal)}</strong></p>
          <Field label="Motivo / referencia (opcional)">
            <input className="input-field" maxLength={500} placeholder="Inventario de cierre de mes" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Field>
          <ModalActions>
            <button type="button" className="btn-secondary" onClick={() => setConfirmar(false)}>Volver</button>
            <button type="button" className="btn-primary px-6" disabled={enviar.isPending} onClick={handleEnviar}>
              {enviar.isPending ? 'Aplicando…' : 'Aplicar conteo'}
            </button>
          </ModalActions>
        </div>
      </Modal>

      <Modal open={!!resultado} onClose={() => setResultado(null)} title="Conteo registrado" size="md">
        {resultado && (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-emerald-700 font-semibold"><CheckCircle2 className="w-5 h-5" aria-hidden="true" /> Stock corregido.</p>
            <ul className="text-sm text-slate-700 space-y-1">
              <li>{resultado.ajustados} producto(s) ajustado(s)</li>
              <li className="flex items-center gap-1.5"><MinusCircle className="w-4 h-4 text-slate-400" aria-hidden="true" /> {resultado.sin_cambio} sin diferencia</li>
              <li>Valor de la diferencia: <strong className={resultado.valor_total < 0 ? 'text-red-700' : 'text-emerald-700'}>{formatCOP(resultado.valor_total)}</strong></li>
            </ul>
            {resultado.alertas?.length > 0 && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 space-y-2">
                <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="w-4 h-4" aria-hidden="true" /> Faltantes sobre el límite de {formatCantidad(resultado.umbral_pct)} %</p>
                <ul className="space-y-1">
                  {resultado.alertas.map((a) => (
                    <li key={a.productoId}>
                      <strong>{a.nombre_producto}</strong>: faltaron {formatCantidad(a.faltante)} {unidadCorta(a.unidad_medida)} de {formatCantidad(a.consumo_teorico)} que debían gastarse desde el conteo anterior ({formatCantidad(a.desviacion_pct)} %)
                    </li>
                  ))}
                </ul>
                <AvisarAlertas alertas={resultado.alertas} contacto={resultado.contacto} umbral={resultado.umbral_pct} />
              </div>
            )}
            <ModalActions>
              <button type="button" className="btn-primary px-6" onClick={() => setResultado(null)}>Cerrar</button>
            </ModalActions>
          </div>
        )}
      </Modal>
    </div>
  );
};

/* ───────────────────────── Desviaciones ───────────────────────── */
const ESTADOS_DESVIACION = {
  FALTANTE: { label: 'Faltante', tone: 'bg-red-100 text-red-800' },
  SOBRANTE: { label: 'Sobrante', tone: 'bg-sky-100 text-sky-800' },
  OK: { label: 'Cuadra', tone: 'bg-emerald-100 text-emerald-800' },
  SIN_CONTEO: { label: 'Sin diferencias', tone: 'bg-slate-100 text-slate-600' },
};

const Stat = ({ label, value, tone = 'text-slate-800' }) => (
  <div className="card-container p-5">
    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
  </div>
);

const Desviaciones = () => {
  const queryClient = useQueryClient();
  const [modo, setModo] = useState('rango'); // 'rango' (consumo del rango vs conteos del rango) | 'conteos' (cada conteo vs el anterior) | 'ranking' (pérdidas del mes)
  const [mes, setMes] = useState(() => fechaLocal().slice(0, 7));
  const [contactoEdit, setContactoEdit] = useState({ whatsapp: null, correo: null }); // null = sin tocar
  const [rango, setRango] = useState(() => {
    const hoy = fechaLocal();
    return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy }; // desde el 1 del mes
  });
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [umbralEdit, setUmbralEdit] = useState('');
  const [error, setError] = useState(null);
  const hayFiltros = !!rango.desde || !!rango.hasta;

  const { data, isLoading, isError, error: errCarga, refetch } = useEmpresaQuery(['ajustes', 'desviaciones', modo, rango], async () => {
    const params = { modo };
    Object.entries(rango).forEach(([k, v]) => { if (v) params[k] = v; });
    return (await api.get('/ajustes/desviaciones', { params })).data;
  }, { enabled: modo !== 'ranking' });
  const { data: ranking, isLoading: cargandoRanking, isError: errorRanking, error: errRanking, refetch: recargarRanking } = useEmpresaQuery(
    ['ajustes', 'ranking', mes], async () => (await api.get('/ajustes/desviaciones/ranking', { params: { mes } })).data, { enabled: modo === 'ranking', retry: false }
  );
  const guardarUmbral = useMutation({
    mutationFn: (payload) => api.put('/ajustes/desviaciones/umbral', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['empresa'] }); setUmbralEdit(''); setContactoEdit({ whatsapp: null, correo: null }); setError(null); },
    onError: (err) => setError(apiError(err, 'No se pudo guardar el límite')),
  });
  const umbral = data?.umbral_pct;
  const contacto = data?.contacto;
  const filas = useMemo(() => {
    const todas = modo === 'conteos' ? (data?.eventos || []) : (data?.filas || []);
    return todas.filter((f) => !soloProblemas || f.estado === 'FALTANTE' || f.faltante > 0);
  }, [data, modo, soloProblemas]);
  const t = data?.totales;
  const conValores = modo === 'conteos' ? (data?.eventos || []).some((e) => e.valor_conteo !== undefined) : t?.valor_faltante !== undefined;

  const celdaPct = (f) => (
    <Td align="right" className={`font-semibold ${f.alerta ? 'text-red-700' : f.desviacion_pct >= 3 ? 'text-amber-700' : 'text-slate-700'}`}>
      {f.desviacion_pct == null ? <span className="text-slate-400 font-normal">—</span> : `${f.desviacion_pct.toLocaleString('es-CO', { maximumFractionDigits: 1 })}%`}
      {f.alerta && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold uppercase bg-red-600 text-white rounded px-1 py-0.5"><TriangleAlert className="w-3 h-3" aria-hidden="true" />Alerta</span>}
    </Td>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 max-w-3xl">
        Compara lo que <strong>debió gastarse</strong> según las recetas y las producciones con lo que <strong>faltó o sobró al contar</strong>.
        Un faltante grande frente al consumo teórico sugiere desperdicio, porciones mal servidas, robo o una receta mal medida.
      </p>

      <FormError message={error} onDismiss={() => setError(null)} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div role="radiogroup" aria-label="Cómo comparar" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-sm">
          {[['rango', 'Por fechas'], ['conteos', 'Entre conteos'], ['ranking', 'Ranking del mes']].map(([v, etiqueta]) => (
            <label key={v} className={`px-3 py-1.5 rounded-lg cursor-pointer focus-within:ring-2 focus-within:ring-brand-600 ${modo === v ? 'bg-brand-700 text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
              <input type="radio" className="sr-only" name="modo-desviacion" checked={modo === v} onChange={() => setModo(v)} />
              {etiqueta}
            </label>
          ))}
        </div>
        {modo !== 'ranking' && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const payload = {};
              if (umbralEdit !== '') payload.desviacion_alerta_pct = Number(umbralEdit);
              if (contactoEdit.whatsapp !== null) payload.alerta_whatsapp = contactoEdit.whatsapp;
              if (contactoEdit.correo !== null) payload.alerta_correo = contactoEdit.correo;
              if (Object.keys(payload).length > 0) guardarUmbral.mutate(payload);
            }}
          >
            <Field label="Alertar si falta más de (%)" className="w-44">
              <input type="number" min="0" max="100" step="any" className="input-field" placeholder={umbral != null ? String(umbral) : '5'} value={umbralEdit} onChange={(e) => setUmbralEdit(e.target.value)} />
            </Field>
            <Field label="Avisar a (WhatsApp)" className="w-44">
              <input className="input-field" inputMode="tel" placeholder="300 111 2233" value={contactoEdit.whatsapp ?? contacto?.whatsapp ?? ''} onChange={(e) => setContactoEdit({ ...contactoEdit, whatsapp: e.target.value })} />
            </Field>
            <Field label="Avisar a (correo)" className="w-52">
              <input type="email" className="input-field" placeholder="dueno@mi-negocio.co" value={contactoEdit.correo ?? contacto?.correo ?? ''} onChange={(e) => setContactoEdit({ ...contactoEdit, correo: e.target.value })} />
            </Field>
            <button type="submit" className="btn-secondary mb-0.5" disabled={(umbralEdit === '' && contactoEdit.whatsapp === null && contactoEdit.correo === null) || guardarUmbral.isPending}>Guardar</button>
          </form>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {modo === 'ranking' ? 'Lo que más dinero perdió el negocio en el mes: faltantes al contar más mermas registradas (merma, vencido y consumo interno).' : modo === 'conteos'
          ? 'Cada conteo se compara con el anterior del mismo producto: lo que se gastó entre uno y otro. El primer conteo de un producto no tiene con qué compararse.'
          : 'Solo aparece diferencia donde hiciste un conteo físico en el rango.'}
        {modo !== 'ranking' && umbral != null && ` Límite de alerta actual: ${umbral.toLocaleString('es-CO')} % del consumo.`}
      </p>

      {modo === 'ranking' ? (
        <Field label="Mes" className="w-44">
          <input type="month" className="input-field" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </Field>
      ) : (
        <FilterBar hayFiltros={hayFiltros} onLimpiar={() => setRango({ desde: '', hasta: '' })}>
          <Field label="Desde" className="w-full sm:w-44">
            <input type="date" className="input-field" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
          </Field>
          <Field label="Hasta" className="w-full sm:w-44">
            <input type="date" className="input-field" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700 pb-2.5">
            <input type="checkbox" className="w-4 h-4 text-brand-700 rounded border-slate-300 focus:ring-brand-600" checked={soloProblemas} onChange={(e) => setSoloProblemas(e.target.checked)} />
            Solo faltantes
          </label>
        </FilterBar>
      )}

      {modo === 'rango' && conValores && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <Stat label="Faltante al contar" value={formatCOP(t.valor_faltante)} tone={t.valor_faltante > 0 ? 'text-red-700' : 'text-slate-800'} />
          <Stat label="Sobrante al contar" value={formatCOP(t.valor_sobrante)} tone="text-sky-700" />
          <Stat label="Mermas registradas" value={formatCOP(t.valor_mermas)} tone="text-amber-700" />
          <Stat label="Productos con faltante" value={t.con_faltante} />
        </div>
      )}
      {modo === 'conteos' && data?.alertas > 0 && (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          <TriangleAlert className="w-4 h-4" aria-hidden="true" /> {data.alertas} conteo(s) con faltante sobre el límite en este rango.
        </p>
      )}
      {modo === 'conteos' && data?.alertas > 0 && (
        <AvisarAlertas alertas={(data.eventos || []).filter((e) => e.alerta)} contacto={contacto} umbral={umbral} />
      )}

      {modo === 'ranking' ? (
        <>
          {ranking?.totales && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Stat label="Perdido en el mes" value={formatCOP(ranking.totales.perdida)} tone="text-red-700" />
              <Stat label="Faltantes al contar" value={formatCOP(ranking.totales.faltantes)} tone="text-red-700" />
              <Stat label="Mermas registradas" value={formatCOP(ranking.totales.mermas)} tone="text-amber-700" />
            </div>
          )}
          <TableCard>
            <THead>
              <Th className="w-12">#</Th>
              <Th>Producto</Th>
              <Th align="right">Faltante al contar</Th>
              <Th align="right">Mermas</Th>
              <Th align="right">Pérdida total</Th>
            </THead>
            <tbody>
              <TableState
                colSpan={5} isLoading={cargandoRanking} isError={errorRanking} error={errRanking} onRetry={recargarRanking}
                isEmpty={(ranking?.filas || []).length === 0} emptyIcon={Trophy}
                emptyTitle="Sin pérdidas este mes" emptyHint="Aparecen los productos con faltantes al contar o mermas registradas en el mes."
              />
              {(ranking?.filas || []).map((f, i) => (
                <Tr key={f.productoId}>
                  <Td className="font-bold text-slate-500">{i + 1}</Td>
                  <Td className="font-medium text-slate-800">{f.nombre_producto}<span className="block text-xs font-normal text-slate-500">{f.codigo}</span></Td>
                  <Td align="right" className="whitespace-nowrap">{f.faltante_valor > 0 ? <>{formatCOP(f.faltante_valor)}<span className="block text-[11px] text-slate-500">{formatCantidad(f.faltante_cantidad)} {unidadCorta(f.unidad_medida)}</span></> : <span className="text-slate-400">—</span>}</Td>
                  <Td align="right" className="whitespace-nowrap">{f.mermas_valor > 0 ? <>{formatCOP(f.mermas_valor)}<span className="block text-[11px] text-slate-500">{formatCantidad(f.mermas_cantidad)} {unidadCorta(f.unidad_medida)}</span></> : <span className="text-slate-400">—</span>}</Td>
                  <Td align="right" className="font-bold text-red-700 whitespace-nowrap">{formatCOP(f.perdida_total)}</Td>
                </Tr>
              ))}
            </tbody>
          </TableCard>
        </>
      ) : modo === 'rango' ? (
        <TableCard>
          <THead>
            <Th>Producto</Th>
            <Th align="right">Debió gastarse</Th>
            <Th align="right">Mermas</Th>
            <Th align="right">Al contar</Th>
            {conValores && <Th align="right">Valor</Th>}
            <Th align="right">% del consumo</Th>
            <Th align="center">Estado</Th>
          </THead>
          <tbody>
            <TableState
              colSpan={conValores ? 7 : 6} isLoading={isLoading} isError={isError} error={errCarga} onRetry={refetch}
              isEmpty={filas.length === 0} emptyIcon={ScanSearch}
              emptyTitle="Sin datos para este rango"
              emptyHint="Aparecen los productos que se gastaron en ventas o producciones, o que tuvieron conteo o mermas."
            />
            {filas.map((f) => (
              <Tr key={f.productoId}>
                <Td className="font-medium text-slate-800">
                  {f.nombre_producto}
                  <span className="block text-xs font-normal text-slate-500">{f.codigo}</span>
                </Td>
                <Td align="right" className="whitespace-nowrap">
                  {formatCantidad(f.consumo_teorico)} {unidadCorta(f.unidad_medida)}
                  {f.consumo_produccion > 0 && (
                    <span className="block text-[11px] text-slate-500">{formatCantidad(f.consumo_ventas)} ventas · {formatCantidad(f.consumo_produccion)} producción</span>
                  )}
                </Td>
                <Td align="right" className="whitespace-nowrap">{f.mermas > 0 ? `${formatCantidad(f.mermas)} ${unidadCorta(f.unidad_medida)}` : <span className="text-slate-400">—</span>}</Td>
                <Td align="right" className={`whitespace-nowrap font-semibold ${f.conteo < 0 ? 'text-red-700' : f.conteo > 0 ? 'text-sky-700' : 'text-slate-400'}`}>
                  {f.conteo === 0 ? '—' : `${f.conteo > 0 ? '+' : ''}${formatCantidad(f.conteo)} ${unidadCorta(f.unidad_medida)}`}
                </Td>
                {conValores && <Td align="right" className={`whitespace-nowrap ${f.valor_conteo < 0 ? 'text-red-700' : ''}`}>{f.contado && f.valor_conteo !== 0 ? formatCOP(f.valor_conteo) : <span className="text-slate-400">—</span>}</Td>}
                {celdaPct(f)}
                <Td align="center">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${ESTADOS_DESVIACION[f.estado].tone}`}>{ESTADOS_DESVIACION[f.estado].label}</span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableCard>
      ) : (
        <TableCard>
          <THead>
            <Th>Producto</Th>
            <Th>Conteo</Th>
            <Th align="right">Se gastó desde el anterior</Th>
            <Th align="right">Mermas</Th>
            <Th align="right">Al contar</Th>
            {conValores && <Th align="right">Valor</Th>}
            <Th align="right">% del consumo</Th>
          </THead>
          <tbody>
            <TableState
              colSpan={conValores ? 7 : 6} isLoading={isLoading} isError={isError} error={errCarga} onRetry={refetch}
              isEmpty={filas.length === 0} emptyIcon={ScanSearch}
              emptyTitle="Sin conteos en este rango" emptyHint="Haz un conteo físico en la pestaña «Conteo físico»."
            />
            {filas.map((e) => (
              <Tr key={e.ajusteId} className={e.alerta ? 'bg-red-50/50' : ''}>
                <Td className="font-medium text-slate-800">
                  {e.nombre_producto}
                  <span className="block text-xs font-normal text-slate-500">{e.codigo}</span>
                </Td>
                <Td className="text-sm whitespace-nowrap">
                  {fmtFecha(e.fecha)}
                  <span className="block text-[11px] text-slate-500">{e.sin_base ? 'Primer conteo: sin con qué comparar' : `contra el del ${fmtFecha(e.previo)}`}</span>
                </Td>
                <Td align="right" className="whitespace-nowrap">{e.sin_base ? <span className="text-slate-400">—</span> : `${formatCantidad(e.consumo_teorico)} ${unidadCorta(e.unidad_medida)}`}</Td>
                <Td align="right" className="whitespace-nowrap">{e.mermas > 0 ? `${formatCantidad(e.mermas)} ${unidadCorta(e.unidad_medida)}` : <span className="text-slate-400">—</span>}</Td>
                <Td align="right" className={`whitespace-nowrap font-semibold ${e.conteo < 0 ? 'text-red-700' : 'text-sky-700'}`}>{`${e.conteo > 0 ? '+' : ''}${formatCantidad(e.conteo)} ${unidadCorta(e.unidad_medida)}`}</Td>
                {conValores && <Td align="right" className={`whitespace-nowrap ${e.valor_conteo < 0 ? 'text-red-700' : ''}`}>{formatCOP(e.valor_conteo)}</Td>}
                {celdaPct(e)}
              </Tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </div>
  );
};

/* ───────────────────────── Página ───────────────────────── */
const Ajustes = () => {
  const esAdmin = usePermisos().can('inventario.conteo');
  const [tab, setTab] = useState('mermas');
  const tabs = [{ id: 'mermas', label: 'Mermas y ajustes' }, ...(esAdmin ? [{ id: 'conteo', label: 'Conteo físico' }, { id: 'desviaciones', label: 'Desviaciones' }] : [])];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Ajustes de inventario"
        description="Registra mermas y vencidos, y cuadra el stock del sistema con lo que realmente hay."
      />
      <Tabs tabs={tabs} value={esAdmin ? tab : 'mermas'} onChange={setTab} />
      {tab === 'conteo' && esAdmin ? <Conteo /> : tab === 'desviaciones' && esAdmin ? <Desviaciones /> : <Mermas />}
    </div>
  );
};

export default Ajustes;
